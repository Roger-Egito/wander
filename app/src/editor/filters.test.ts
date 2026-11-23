import { expect, test } from 'vitest';
import { emptyTables } from '@wander/content';
import { typeById } from './draft.ts';
import { activeFilters, filterRows, NO_FILTERS } from './filters.ts';

function tables() {
  const t = emptyTables();
  t.Skills.push(
    { id: 'ARC-01', name: 'Disparo Arcano', discipline_id: 'ARC', source: 'Wander', status: 'playtest' },
    { id: 'FOG-01', name: 'Bola de Fogo', discipline_id: 'FOG', source: 'Wander', status: 'final' },
    { id: 'OUT-01', name: 'Explosão', discipline_id: 'OUT', source: 'Outward', status: 'draft' },
    { id: 'RAS-01', name: 'Apagada', discipline_id: 'RAS', source: 'Wander', status: 'deleted' },
  );
  return t;
}
const ids = (f = {}) => filterRows(typeById('skill'), tables(), { ...NO_FILTERS, ...f }).map((r) => r.id);

test('live rows by default, the Trash on its own', () => {
  expect(ids()).toEqual(['ARC-01', 'FOG-01', 'OUT-01']);
  expect(ids({ trash: true })).toEqual(['RAS-01']);
});

test('search matches the name or ID, ignoring case and accents', () => {
  expect(ids({ search: 'explosao' })).toEqual(['OUT-01']);
  expect(ids({ search: 'fog-' })).toEqual(['FOG-01']);
});

test('dropdown filters combine', () => {
  expect(ids({ source: 'Wander', status: 'final' })).toEqual(['FOG-01']);
  expect(ids({ discipline: 'ARC' })).toEqual(['ARC-01']);
  expect(activeFilters({ ...NO_FILTERS, source: 'Wander', status: 'final', search: 'x' })).toBe(2);
});
