/**
 * Where each skill sits in a discipline's tree, and the pieces the graph of every skill
 * reuses (graph.ts). Levels go from the top down, and the skills of a level sit side by
 * side. A skill sits right under the skills it requires when there's room, so arrows run
 * down and seldom cross. A skill someone dragged by hand (pos_x/pos_y in the sheet) stays
 * where they put it.
 *
 * A skill that requires another skill of its own level goes in a second row of that
 * level (closer than the next level), so its arrow still points down instead of running
 * sideways across the row.
 *
 * Two steps, as layered graph drawings usually go:
 *   1. Order: each row is sorted by where the skills it connects to sit (the average
 *      position of its requirements, then of the skills that need it), a few sweeps down
 *      and up, which untangles most crossings.
 *   2. Place (placeRow): a skill goes under the average of its requirements, siblings
 *      spread evenly under their parent, and cards are pushed right until none overlap.
 *
 * An arrow goes from a prerequisite to the skill that needs it, when both are in this
 * discipline. Arrows of a group of alternatives ("A ou B") are marked, so the tree can
 * draw them dashed. Requirements an arrow can't show (a skill of another discipline,
 * "Qualquer (Magia, Trevas)") are returned per skill, for the node to say in words.
 */
import { positionOf, skillGroups, type Skill, type SkillRequirementOption } from '@wander/rules';

/** A tree node's width plus the gap to the next one. */
export const SLOT_WIDTH = 280;
/** A tree node's height, and the gaps between rows (wider where a new level starts). */
export const TREE_ROW = { height: 80, gap: 30, levelGap: 50 };

export interface TreeNode {
  id: string;
  x: number;
  y: number;
}

export interface TreeEdge {
  from: string;
  to: string;
  /** Part of a group of alternatives: any one of its arrows is enough. */
  alternative: boolean;
}

export interface TreeLayout {
  nodes: TreeNode[];
  edges: TreeEdge[];
  /** Per skill, the requirement groups that aren't all arrows. */
  unshown: Map<string, SkillRequirementOption[][]>;
}

/** A tree without coordinates: its arrows, what arrows can't show, and its rows in order. */
export interface TreeStructure {
  edges: TreeEdge[];
  unshown: Map<string, SkillRequirementOption[][]>;
  /** From the top: each row's level (from 0) and its skills, left to right. */
  rows: { level: number; ids: string[] }[];
  /** Each skill's requirements within the tree. */
  parents: Map<string, string[]>;
}

export const levelOf = (skill: Skill) => Math.max(0, (skill.level ?? 1) - 1);

const SWEEPS = 4;
const average = (values: number[]) => values.reduce((a, b) => a + b, 0) / values.length;

export function treeStructure(skills: Skill[]): TreeStructure {
  const here = new Set(skills.map((s) => s.id));
  const edges: TreeEdge[] = [];
  const unshown = new Map<string, SkillRequirementOption[][]>();
  const parents = new Map<string, string[]>();
  const children = new Map<string, string[]>();

  for (const skill of skills) {
    for (const group of skillGroups(skill)) {
      const local = group.filter((o): o is { kind: 'skill'; skill_id: string } => o.kind === 'skill' && here.has(o.skill_id) && o.skill_id !== skill.id);
      for (const o of local) {
        edges.push({ from: o.skill_id, to: skill.id, alternative: group.length > 1 });
        parents.set(skill.id, [...(parents.get(skill.id) ?? []), o.skill_id]);
        children.set(o.skill_id, [...(children.get(o.skill_id) ?? []), skill.id]);
      }
      if (local.length < group.length) unshown.set(skill.id, [...(unshown.get(skill.id) ?? []), group]);
    }
  }

  // Which row of its level a skill goes in: one below the deepest same-level skill it
  // requires. A cycle (which validation reports) just stops the count.
  const level = new Map(skills.map((s) => [s.id, levelOf(s)]));
  const depth = new Map<string, number>();
  const depthOf = (id: string, seen: Set<string>): number => {
    if (depth.has(id)) return depth.get(id)!;
    if (seen.has(id)) return 0;
    seen.add(id);
    const same = (parents.get(id) ?? []).filter((p) => level.get(p) === level.get(id));
    const d = same.length ? 1 + Math.max(...same.map((p) => depthOf(p, seen))) : 0;
    depth.set(id, d);
    return d;
  };
  const byRow = new Map<string, { level: number; depth: number; ids: string[] }>();
  for (const skill of [...skills].sort((a, b) => a.id.localeCompare(b.id, 'pt', { numeric: true }))) {
    const key = { level: levelOf(skill), depth: depthOf(skill.id, new Set()) };
    const name = `${key.level}:${key.depth}`;
    if (!byRow.has(name)) byRow.set(name, { ...key, ids: [] });
    byRow.get(name)!.ids.push(skill.id);
  }
  const rows = [...byRow.values()].sort((a, b) => a.level - b.level || a.depth - b.depth);
  const rowOf = new Map(rows.flatMap((r, i) => r.ids.map((id) => [id, i] as const)));

  // Where a skill sits in its row, from 0 to 1, so rows of different lengths compare.
  const position = new Map<string, number>();
  const measure = (row: number) => rows[row].ids.forEach((id, i, all) => position.set(id, (i + 0.5) / all.length));
  rows.forEach((_, i) => measure(i));
  const sortRow = (row: number, neighbors: Map<string, string[]>) => {
    const score = new Map(rows[row].ids.map((id) => {
      const others = (neighbors.get(id) ?? []).filter((n) => rowOf.get(n) !== row).map((n) => position.get(n)!);
      return [id, others.length ? average(others) : position.get(id)!];
    }));
    rows[row].ids.sort((a, b) => score.get(a)! - score.get(b)! || position.get(a)! - position.get(b)!);
    measure(row);
  };
  const down = rows.map((_, i) => i);
  for (let sweep = 0; sweep < SWEEPS; sweep++) {
    down.forEach((row) => sortRow(row, parents));
    [...down].reverse().forEach((row) => sortRow(row, children));
  }
  down.forEach((row) => sortRow(row, parents));

  return { edges, unshown, rows: rows.map(({ level, ids }) => ({ level, ids })), parents };
}

/**
 * Left edges for one row of equally wide nodes. First the skills with requirements
 * already placed above (`placed`): each under the average of its requirements, siblings
 * spread evenly around that point, pushed right until none overlap. Then the others, each
 * in the free spot nearest the skill before it in the row's order, so they never push an
 * aligned skill away from what it requires.
 */
export function placeRow(ids: string[], parents: Map<string, string[]>, placed: Map<string, number>, slot: number): Map<string, number> {
  const wanted = new Map<string, number>();
  for (const id of ids) {
    const above = (parents.get(id) ?? []).filter((p) => placed.has(p)).map((p) => placed.get(p)!);
    if (above.length) wanted.set(id, average(above));
  }
  const anchored = ids.filter((id) => wanted.has(id)).sort((a, b) => wanted.get(a)! - wanted.get(b)!);
  // Siblings wanting the same spot spread around it instead of all sliding to its right.
  for (let i = 0; i < anchored.length; ) {
    let j = i;
    while (j < anchored.length && wanted.get(anchored[j]) === wanted.get(anchored[i])) j++;
    const center = wanted.get(anchored[i])!;
    for (let k = i; k < j; k++) wanted.set(anchored[k], center + (k - i - (j - i - 1) / 2) * slot);
    i = j;
  }
  const xs = new Map<string, number>();
  let next = -Infinity;
  for (const id of anchored) {
    const x = Math.max(wanted.get(id)!, next);
    xs.set(id, x);
    next = x + slot;
  }

  const free = (x: number) => [...xs.values()].every((other) => Math.abs(other - x) >= slot);
  ids.forEach((id, i) => {
    if (xs.has(id)) return;
    const before = ids.slice(0, i).reverse().find((b) => xs.has(b));
    const target = before === undefined ? (xs.size ? Math.min(...xs.values()) - slot : 0) : xs.get(before)! + slot;
    const candidates = [target, ...[...xs.values()].flatMap((x) => [x - slot, x + slot])].filter(free);
    xs.set(id, candidates.reduce((best, c) => (Math.abs(c - target) < Math.abs(best - target) ? c : best)));
  });
  return xs;
}

export interface Placed {
  x: number;
  /** Which row from the top. */
  row: number;
  level: number;
}

/**
 * Every row placed from the top, shifted so the leftmost node starts at 0. `split` can
 * break a long row into several.
 */
export function placeRows(structure: TreeStructure, slot: number, split: (ids: string[]) => string[][] = (ids) => [ids]): Map<string, Placed> {
  const placed = new Map<string, number>();
  const where = new Map<string, Placed>();
  let row = 0;
  for (const { level, ids } of structure.rows) {
    for (const part of split(ids)) {
      const xs = placeRow(part, structure.parents, placed, slot);
      for (const [id, x] of xs) where.set(id, { x, row, level });
      // A row placed after this one aims at these, so they count as placed only now.
      for (const [id, x] of xs) placed.set(id, x);
      row++;
    }
  }
  const left = Math.min(...[...where.values()].map((w) => w.x));
  for (const w of where.values()) w.x -= left;
  return where;
}

/**
 * The top of each row: rows stack by their height, with `levelGap` where a new level
 * starts and `gap` between two rows of the same level.
 */
export function rowTops(where: Map<string, Placed>, height: (row: number) => number, gap: number, levelGap: number, start = 0) {
  const levels = new Map([...where.values()].map((w) => [w.row, w.level]));
  const tops = new Map<number, number>();
  let y = start;
  let previous: number | null = null;
  for (const row of [...levels.keys()].sort((a, b) => a - b)) {
    if (previous !== null) y += levels.get(row) === previous ? gap : levelGap;
    tops.set(row, y);
    y += height(row);
    previous = levels.get(row)!;
  }
  return { tops, bottom: y };
}

export function layoutTree(skills: Skill[]): TreeLayout {
  const structure = treeStructure(skills);
  const where = placeRows(structure, SLOT_WIDTH);
  const { tops } = rowTops(where, () => TREE_ROW.height, TREE_ROW.gap, TREE_ROW.levelGap);
  const nodes = skills.map((skill): TreeNode => {
    const moved = positionOf(skill);
    if (moved) return { id: skill.id, ...moved };
    const w = where.get(skill.id)!;
    return { id: skill.id, x: w.x, y: tops.get(w.row)! };
  });
  return { nodes, edges: structure.edges, unshown: structure.unshown };
}
