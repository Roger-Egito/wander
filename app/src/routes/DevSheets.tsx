/**
 * Development only (the route exists only under `npm run dev`): the M5 live check. One
 * test skill goes through every adapter operation on the real Wander Data, and each step
 * checks the sheet itself, not just that the call returned. The last step deletes the
 * skill, so the sheet ends as it started, except that the Rascunho ID counter moves up
 * by one.
 */
import { useState } from 'react';
import type { Tables } from '@wander/content';
import { sheetsAdapter, sheetsToken, sheetsTransport } from '../adapters/sheets/session.ts';

type Line = { ok: boolean; text: string };

export function DevSheets() {
  // The same connection as the Editor: connecting on either page connects both.
  const token = sheetsToken;
  const transport = sheetsTransport;
  const adapter = sheetsAdapter;
  const [lines, setLines] = useState<Line[]>([]);
  const [running, setRunning] = useState(false);
  const log = (ok: boolean, text: string) => setLines((all) => [...all, { ok, text }]);

  async function connect() {
    try {
      await token.get();
      log(true, 'Connected to Google Sheets');
    } catch (e) {
      log(false, `Connect failed: ${(e as Error).message}`);
    }
  }

  async function run() {
    setRunning(true);
    setLines([]);
    const check = (ok: boolean, text: string) => {
      log(ok, text);
      if (!ok) throw new Error(text);
    };
    const counts = (t: Tables) => Object.fromEntries(Object.entries(t).map(([tab, rows]) => [tab, rows.length]));
    /** Every row whose `column` holds `value` sits inside the tab's Table (and there is one). */
    const insideTable = async (tab: string, column: number, value: string) => {
      const [values, sheets] = await Promise.all([transport.getValues([tab]), transport.sheets()]);
      const rows = values[0].flatMap((r, i) => (r[column] === value ? [i] : []));
      const table = sheets.find((s) => s.title === tab)!.table!;
      return rows.length > 0 && rows.every((i) => i > 0 && i < table.range.endRowIndex);
    };
    try {
      const before = await adapter.readAll();
      log(true, `Read every tab: ${before.Skills.length} skills, Validation shows ${before.Validation.length} rows`);

      const id = await adapter.create(
        'skill',
        { name: 'Teste do adaptador', discipline_id: 'RAS', level: 1, status: 'draft', source: 'Wander', description: 'Linha de teste criada pelo adaptador do Editor.' },
        { stat_requirements: [{ group: 1, stat: 'ESP', value: 3 }] },
      );
      let now = await adapter.readAll();
      const created = now.Skills.find((s) => s.id === id);
      check(!!created && created.name === 'Teste do adaptador', `Created ${id}`);
      check(await insideTable('Skills', 0, id), `${id} is inside the Skills Table`);
      check(now.StatRequirements.some((r) => r.skill_id === id && r.stat === 'ESP' && r.value === 3), `${id} has its stat requirement`);
      const translations = now.Translations.filter((r) => r.id === id);
      check(translations.length === 2 && (await insideTable('Translations', 1, id)), `${id} has ${translations.length} Translations rows: ${translations.map((r) => `${r.field} → "${r.auto_en}"`).join(', ')}`);
      check(now.Validation.length === before.Validation.length, `Validation still shows ${now.Validation.length} rows`);

      await adapter.update('skill', id, { name: 'Teste do adaptador (editado)' }, { stat_requirements: [{ group: 1, stat: 'TEC', value: 4 }] });
      now = await adapter.readAll();
      check(now.Skills.find((s) => s.id === id)?.name === 'Teste do adaptador (editado)', 'Edited the name');
      check(now.StatRequirements.filter((r) => r.skill_id === id).map((r) => `${r.stat}${r.value}`).join() === 'TEC4', 'Replaced the stat requirement');

      await adapter.softDelete('skill', id);
      now = await adapter.readAll();
      check(now.Skills.find((s) => s.id === id)?.status === 'deleted', 'Soft deleted');
      await adapter.restore('skill', id, 'draft');
      now = await adapter.readAll();
      check(now.Skills.find((s) => s.id === id)?.status === 'draft', 'Restored as draft');

      await adapter.deletePermanently('skill', id);
      const after = await adapter.readAll();
      check(!after.Skills.some((s) => s.id === id), `Deleted ${id} permanently`);
      check(!after.StatRequirements.some((r) => r.skill_id === id) && !after.Translations.some((r) => r.id === id), 'Its stat requirements and Translations rows went with it');
      check(await adapter.releaseId('skill', id), `${id} went back to the counter, so the next Rascunho skill reuses it`);
      const changed = Object.entries(counts(after)).filter(([tab, n]) => n !== counts(before)[tab]);
      check(changed.length === 0, `Every tab has the rows it started with${changed.length ? `, except ${changed.map(([t]) => t).join(', ')}` : ''}`);
      check(after.Validation.length === before.Validation.length, `Validation shows ${after.Validation.length} rows, as before`);
      log(true, 'Live check passed');
    } catch (e) {
      log(false, `Stopped: ${(e as Error).message}`);
    } finally {
      setRunning(false);
    }
  }

  return (
    <main style={{ padding: 16, maxWidth: 900 }}>
      <h1>Sheets adapter: live check</h1>
      <p>Writes one test skill to the real Wander Data, checks each step in the sheet, then deletes it.</p>
      <p style={{ display: 'flex', gap: 8 }}>
        <button type="button" onClick={connect}>Connect Google Sheets</button>
        <button type="button" onClick={run} disabled={running}>Run live check</button>
      </p>
      <ol data-testid="log">
        {lines.map((line, i) => (
          <li key={i} style={{ color: line.ok ? 'var(--color-good)' : 'var(--color-bad)' }}>{line.text}</li>
        ))}
      </ol>
    </main>
  );
}
