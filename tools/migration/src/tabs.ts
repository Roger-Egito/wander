/**
 * Reads the two kinds of hand-formatted tab into plain records, still as text:
 *
 *   - A discipline tab: "DISCIPLINA DE X" in A1, then a block per "NÍVEL n", where
 *     column A names the field (Nome, Req. de Atr., Desc., ...) and every column after
 *     it is one skill.
 *   - The Facilidades e Complicações tab: a block per item, its name in capitals, then
 *     rows of levels. Each level spans several merged columns, which the export repeats,
 *     so runs of identical columns are one level.
 *
 * Splitting the text into raw values is fields.ts's job, and IDs are migrate.ts's.
 */
import type { Grid } from './workbook.ts';

/** Where a value came from, for the report: tab, row and column as the sheet shows them. */
export interface Origin {
  tab: string;
  cell: string;
}

const columnLetter = (index: number) => {
  let n = index + 1;
  let letters = '';
  while (n > 0) {
    letters = String.fromCharCode(65 + ((n - 1) % 26)) + letters;
    n = Math.floor((n - 1) / 26);
  }
  return letters;
};

export const cellName = (row: number, column: number) => `${columnLetter(column)}${row + 1}`;

const cell = (grid: Grid, row: number, column: number) => (grid[row]?.[column] ?? '').trim();

/* --- discipline tabs ------------------------------------------------------------- */

export interface RawSkill {
  origin: Origin;
  level: number;
  name: string;
  categories: string;
  skillRequirement: string;
  statRequirement: string;
  castTime: string;
  cost: string;
  /** "Custo de Fadiga" in a few tabs: a bare number there means Fatigue. */
  costLabel: string;
  description: string;
  notes: string;
  inspiredBy: string;
  stolenFrom: string;
}

export interface RawDiscipline {
  tab: string;
  /** The header, without "DISCIPLINA DE": "ARCANISMO", "[Outward] PASSIVAS". */
  header: string;
  /** B1, where a few tabs keep a note about their source. */
  note: string;
  skills: RawSkill[];
}

const FIELD_ROWS: Record<string, keyof RawSkill> = {
  'Nome': 'name',
  'Categorias': 'categories',
  'Req. de Hab.': 'skillRequirement',
  'Req. de Atr.': 'statRequirement',
  'Temp de Conj.': 'castTime',
  'Custo': 'cost',
  'Custo de Fadiga': 'cost',
  'Desc.': 'description',
  'Notas': 'notes',
  'Inspirado em:': 'inspiredBy',
  'Roubado de:': 'stolenFrom',
};

/** A discipline tab is any tab whose A1 starts "DISCIPLINA DE", whatever the tab is called. */
export const isDisciplineTab = (grid: Grid) => /^DISCIPLINA DE\b/i.test(cell(grid, 0, 0));

export function readDisciplineTab(tab: string, grid: Grid): { discipline: RawDiscipline; unknownLabels: Origin[] } {
  const discipline: RawDiscipline = {
    tab,
    header: cell(grid, 0, 0).replace(/^DISCIPLINA DE\s*/i, ''),
    note: cell(grid, 0, 1),
    skills: [],
  };
  const unknownLabels: Origin[] = [];
  let level = 0;
  let rows: Partial<Record<keyof RawSkill, number>> = {};
  let labels: Partial<Record<keyof RawSkill, string>> = {};

  const flush = () => {
    if (!level || rows.name === undefined) return;
    const width = Math.max(...Object.values(rows).map((r) => grid[r!]?.length ?? 0));
    for (let column = 1; column < width; column++) {
      const value = (field: keyof RawSkill) => (rows[field] === undefined ? '' : cell(grid, rows[field]!, column));
      const fields = ['name', 'categories', 'skillRequirement', 'statRequirement', 'castTime', 'cost', 'description', 'notes'] as const;
      // A column with no name and nothing but dashes is template filler, not a skill. A
      // name of "-" or "..." is kept: it's a placeholder the report has to list.
      if (value('name') === '' && fields.every((f) => /^[-–\s]*$/.test(value(f)))) continue;
      discipline.skills.push({
        origin: { tab, cell: cellName(rows.name!, column) },
        level,
        name: value('name'),
        categories: value('categories'),
        skillRequirement: value('skillRequirement'),
        statRequirement: value('statRequirement'),
        castTime: value('castTime'),
        cost: value('cost'),
        costLabel: labels.cost ?? 'Custo',
        description: value('description'),
        notes: value('notes'),
        inspiredBy: value('inspiredBy'),
        stolenFrom: value('stolenFrom'),
      });
    }
  };

  for (let row = 1; row < grid.length; row++) {
    const label = cell(grid, row, 0);
    const levelMatch = /^N[ÍI]VEL\s+(\d+)/i.exec(label);
    if (levelMatch) {
      flush();
      level = Number(levelMatch[1]);
      rows = {};
      labels = {};
      continue;
    }
    if (!label) continue;
    const field = FIELD_ROWS[label];
    if (field) {
      rows[field] = row;
      labels[field] = label;
    } else if (level) unknownLabels.push({ tab, cell: cellName(row, 0) });
  }
  flush();
  return { discipline, unknownLabels };
}

/* --- Facilidades e Complicações -------------------------------------------------- */

export interface RawTraitLevel {
  origin: Origin;
  /** The tier's name as the sheet writes it: "Bom", "Péssimo". */
  tier: string;
  cost: string;
  description: string;
}

export interface RawTrait {
  origin: Origin;
  /** As the sheet writes it, in capitals: "SENSO DE DIREÇÃO". */
  name: string;
  levels: RawTraitLevel[];
  /** Every distinct value each of these rows holds across the item's columns. */
  notes: string[];
  inspiredBy: string[];
  stolenFrom: string[];
}

const TRAIT_ROWS = new Set(['Nível', 'Custo PD', 'Desc.', 'Notas', 'Inspirado em:', 'Roubado de:']);

export function readTraitsTab(tab: string, grid: Grid): { traits: RawTrait[]; looseText: Origin[] } {
  const traits: RawTrait[] = [];
  const looseText: Origin[] = [];
  for (let row = 0; row < grid.length; row++) {
    const label = cell(grid, row, 0);
    if (!label || TRAIT_ROWS.has(label)) continue;
    // An item starts where the next row is its levels.
    if (cell(grid, row + 1, 0) !== 'Nível') {
      looseText.push({ tab, cell: cellName(row, 0) });
      continue;
    }
    const rowOf: Record<string, number> = {};
    for (let r = row + 1; r < grid.length && TRAIT_ROWS.has(cell(grid, r, 0)); r++) rowOf[cell(grid, r, 0)] = r;
    const width = Math.max(...Object.values(rowOf).map((r) => grid[r]?.length ?? 0));
    const at = (name: string, column: number) => (rowOf[name] === undefined ? '' : cell(grid, rowOf[name], column));
    const distinct = (name: string) => [...new Set(Array.from({ length: width }, (_, c) => (c === 0 ? '' : at(name, c))).filter((v) => v && v !== '-'))];

    const levels: RawTraitLevel[] = [];
    for (let column = 1; column < width; column++) {
      const level = { tier: at('Nível', column), cost: at('Custo PD', column), description: at('Desc.', column) };
      if (!level.tier && !level.cost && !level.description) continue;
      const previous = levels.at(-1);
      // The merged columns of one level repeat the same three values.
      if (previous && previous.tier === level.tier && previous.cost === level.cost && previous.description === level.description) continue;
      levels.push({ origin: { tab, cell: cellName(rowOf['Nível'], column) }, ...level });
    }
    traits.push({ origin: { tab, cell: cellName(row, 0) }, name: label, levels, notes: distinct('Notas'), inspiredBy: distinct('Inspirado em:'), stolenFrom: distinct('Roubado de:') });
    row = Math.max(...Object.values(rowOf));
  }
  return { traits, looseText };
}
