/**
 * How each Wander Data column is typed in Google Sheets: numbers, checkboxes and
 * dropdowns. Used to build the Sheets API requests that turn each tab into a Table.
 *
 * Table dropdowns only accept a fixed list. A dropdown that reads another tab
 * (discipline_id, stat, cast_time, cost_scale, a trait level's tier) is plain data validation on the
 * column instead, so it's returned separately as rangeRule.
 */
import { COST_UNITS, SOURCES, STATUS, type TabName } from './schema.ts';
import { STAT_TYPES } from './stats.ts';

const NUMBER = new Set(['level', 'cost_value', 'cost2_value', 'value', 'group', 'pd_cost', 'pos_x', 'pos_y']);

export type ColumnLayout =
  | { columnType: 'DOUBLE' | 'BOOLEAN' }
  | { columnType: 'DROPDOWN'; dataValidationRule: { condition: { type: 'ONE_OF_LIST'; values: { userEnteredValue: string }[] } } };

const list = (values: readonly string[]): ColumnLayout => ({
  columnType: 'DROPDOWN',
  dataValidationRule: { condition: { type: 'ONE_OF_LIST', values: values.map((v) => ({ userEnteredValue: v })) } },
});

/** The Table column type, or null for plain text. */
export function columnLayout(tab: TabName, column: string): ColumnLayout | null {
  if (tab === 'Config') return null; // value holds text or numbers
  if (NUMBER.has(column)) return { columnType: 'DOUBLE' };
  if (column === 'temporary') return { columnType: 'BOOLEAN' };
  if (column === 'status') return list(STATUS);
  if (column === 'source') return list(SOURCES);
  if (column === 'cost_unit' || column === 'cost2_unit') return list(COST_UNITS);
  if (tab === 'Stats' && column === 'type') return list(STAT_TYPES);
  return null;
}

/** The tab and column a dropdown reads its options from, for columns that have one. */
export function rangeRule(tab: TabName, column: string): string | null {
  if (column === 'discipline_id') return '=Disciplines!A2:A';
  if (column === 'stat') return '=Stats!A2:A';
  if (column === 'cast_time') return '=CastTimes!A2:A';
  if (column === 'cost_scale') return '=CostScales!A2:A';
  if (tab === 'TraitLevels' && column === 'tier') return '=TraitTiers!A2:A';
  return null;
}
