import { describe, expect, test } from 'vitest';
import { emptyTables, type Tables } from '@wander/content';
import { buildRelease, pendingRelease } from './release.ts';

function data(): Tables {
  const t = emptyTables();
  t.Disciplines.push(
    { id: 'ARC', name: 'Arcanismo', source: 'Wander', status: 'playtest' },
    { id: 'OUT', name: 'Outward', source: 'Outward', status: 'alpha' },
  );
  const skill = (id: string, discipline: string, status: string) => ({
    id, name: `Habilidade ${id}`, discipline_id: discipline, level: 1, description: 'Uma descrição longa o bastante.', source: 'Wander', status,
  });
  t.Skills.push(skill('ARC-01', 'ARC', 'playtest'), skill('ARC-02', 'ARC', 'draft'), skill('OUT-01', 'OUT', 'alpha'));
  t.Releases.push({ version: '0.1.0-beta', notes: 'Primeira' }, { version: '0.1.1-beta', notes: 'Segunda' });
  return t;
}

describe('pendingRelease', () => {
  test('the newest release is pending when nothing is published yet', () => {
    expect(pendingRelease(data(), null)).toEqual({ version: '0.1.1-beta', notes: 'Segunda' });
  });

  test('a release is pending only when it is higher than the published one', () => {
    expect(pendingRelease(data(), '0.1.0-beta')?.version).toBe('0.1.1-beta');
    expect(pendingRelease(data(), '0.1.1-beta')).toBeNull();
    expect(pendingRelease(data(), '0.2.0-beta')).toBeNull();
  });

  test('no valid version in Releases means nothing to publish', () => {
    const t = data();
    t.Releases = [{ version: 'rascunho', notes: '' }];
    expect(pendingRelease(t, null)).toBeNull();
  });
});

describe('buildRelease', () => {
  const release = { version: '0.1.1-beta', notes: 'Segunda' };

  test('each audience gets its own snapshot, and drafts reach neither', () => {
    const { snapshots, errors } = buildRelease(data(), release, '2026-11-26T12:00:00Z');
    expect(errors).toEqual([]);
    expect(snapshots.public.tables.Skills.map((s) => s.id)).toEqual(['ARC-01']);
    expect(snapshots.alpha.tables.Skills.map((s) => s.id)).toEqual(['ARC-01', 'OUT-01']);
    expect(snapshots.public).toMatchObject({ version: '0.1.1-beta', notes: 'Segunda', publishedAt: '2026-11-26T12:00:00Z', audience: 'public' });
  });

  test('a public skill requiring an alpha skill blocks the publish as a broken link', () => {
    const t = data();
    t.SkillRequirements.push({ skill_id: 'ARC-01', group: 1, required_skill_id: 'OUT-01' });
    const { errors } = buildRelease(t, release, '2026-11-26T12:00:00Z');
    expect(errors).toEqual(['[public] broken link | Skills ARC-01 | SkillRequirements.required_skill_id points at OUT-01, which this audience can\'t see']);
  });

  test('validation errors in a snapshot block it, warnings only get listed', () => {
    const t = data();
    t.Skills[0].level = 0;
    t.Skills[0].description = '';
    const { errors, warnings } = buildRelease(t, release, '2026-11-26T12:00:00Z');
    expect(errors.some((e) => e.startsWith('[public] invalid number | Skills ARC-01'))).toBe(true);
    expect(warnings.some((w) => w.startsWith('[public] missing description | Skills ARC-01'))).toBe(true);
  });

  test('a draft never shows up, not even in a problem', () => {
    const t = data();
    t.Skills[1].level = 0;
    const { errors, warnings } = buildRelease(t, release, '2026-11-26T12:00:00Z');
    expect([...errors, ...warnings].some((line) => line.includes('ARC-02'))).toBe(false);
  });
});
