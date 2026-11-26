/**
 * What a publish produces, from a full read of Wander Data. Pure, so it's tested without
 * the network; main.ts does the reading, writing and uploading.
 *
 *   - A release is pending when the newest version in Releases is higher than the one
 *     already published (version.json in the repo). Nothing is written back to the sheet.
 *   - Each audience gets its own snapshot (visibleTables): the public one is committed to
 *     the site, the Alpha group's goes to the private Storage bucket.
 *   - The snapshot is the visible tables themselves, so the app turns it into game data
 *     with the same loadContent it uses everywhere. The English the Translations cache
 *     resolved is frozen in it, so a translation never changes on players between
 *     publishes.
 *   - Errors block the publish: validation errors in a snapshot, and links a visible row
 *     loses because it points at a hidden one. Warnings (a missing description, a row
 *     withheld because what it needs is hidden) are listed and don't block.
 */
import { latestVersion, parseVersion, compareVersions, validate, visibleTables, type Audience, type Tables } from '@wander/content';

export interface Snapshot {
  version: string;
  notes: string;
  publishedAt: string;
  audience: Audience;
  tables: Tables;
}

/** What the site's version.json says: the published version and its file. */
export interface PublishedVersion {
  version: string;
  publishedAt: string;
  file: string;
}

export interface Release {
  version: string;
  notes: string;
}

const text = (v: unknown) => (v === null || v === undefined ? '' : String(v).trim());

/** The newest release in the sheet when it's higher than the published one, else null. */
export function pendingRelease(tables: Tables, published: string | null): Release | null {
  const latest = latestVersion(tables.Releases.map((r) => text(r.version)));
  if (!latest) return null;
  const current = published ? parseVersion(published) : null;
  if (current && compareVersions(parseVersion(latest)!, current) <= 0) return null;
  const row = tables.Releases.find((r) => text(r.version) === latest)!;
  return { version: latest, notes: text(row.notes) };
}

export const snapshotFile = (version: string) => `rules-${version}.json`;

export interface Built {
  snapshots: Record<Audience, Snapshot>;
  errors: string[];
  warnings: string[];
}

export function buildRelease(tables: Tables, release: Release, publishedAt: string): Built {
  const errors: string[] = [];
  const warnings: string[] = [];
  const snapshots = {} as Record<Audience, Snapshot>;
  for (const audience of ['public', 'alpha'] as const) {
    const visible = visibleTables(tables, audience);
    const say = (list: string[], line: string) => list.push(`[${audience}] ${line}`);
    for (const p of validate(visible.tables)) say(p.level === 'error' ? errors : warnings, `${p.problem} | ${p.table} ${p.id} | ${p.detail}`);
    for (const l of visible.lostLinks) say(errors, `broken link | ${l.table} ${l.id} | ${l.via}.${l.field} points at ${l.target}, which this audience can't see`);
    for (const w of visible.withheld) say(warnings, `withheld | ${w.table} ${w.id} | needs ${w.because}, which this audience can't see`);
    snapshots[audience] = { version: release.version, notes: release.notes, publishedAt, audience, tables: visible.tables };
  }
  return { snapshots, errors, warnings };
}
