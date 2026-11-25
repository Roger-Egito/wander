/**
 * Where each skill's card sits in the graph of every skill.
 *
 * Each discipline is a block with its name above it, laid out like a discipline's tree
 * (layout.ts): levels are rows from the top, the skills of a level side by side, each
 * under the skills it requires when there's room, so arrows run down and seldom cross.
 * A level's row with more than MAX_PER_ROW skills continues in another row, closer than
 * the gap to the next level, so a long level doesn't stretch its block across the screen.
 * Each row is as tall as its tallest card, so the graph measures the cards first and
 * lays them out again whenever one changes size (a card's notes opening).
 *
 * Blocks then wrap into rows, like words in a paragraph, aiming at a canvas about as
 * wide as a screen is (16:9).
 *
 * Arrows go from a required skill to the skill that needs it, across disciplines too,
 * dashed when the requirement is one of several alternatives. The tree's hand-placed
 * positions (pos_x/pos_y) are for one discipline's tree, so the graph ignores them.
 */
import { skillGroups, type Skill } from '@wander/rules';
import { placeRows, rowTops, treeStructure, type TreeEdge } from './layout.ts';

export interface Size {
  width: number;
  height: number;
}

export const GRAPH_GAP = { card: 32, row: 32, level: 96, block: 160, label: 56 };
export const MAX_PER_ROW = 8;
const ASPECT = 16 / 9;

export interface GraphLayout {
  nodes: { id: string; x: number; y: number }[];
  /** One per discipline: where its name goes, above its block. */
  bands: { discipline: string; x: number; y: number }[];
  edges: TreeEdge[];
}

interface Block {
  discipline: string;
  width: number;
  height: number;
  /** Positions inside the block, from its top-left corner. */
  nodes: { id: string; x: number; y: number }[];
}

const chunks = (ids: string[]) => Array.from({ length: Math.ceil(ids.length / MAX_PER_ROW) }, (_, i) => ids.slice(i * MAX_PER_ROW, (i + 1) * MAX_PER_ROW));

function layoutBlock(discipline: string, skills: Skill[], size: (id: string) => Size, cardWidth: number): Block {
  const where = placeRows(treeStructure(skills), cardWidth + GRAPH_GAP.card, chunks);
  // Each row as tall as its tallest card.
  const heights = new Map<number, number>();
  for (const [id, w] of where) heights.set(w.row, Math.max(heights.get(w.row) ?? 0, size(id).height));
  const { tops, bottom } = rowTops(where, (row) => heights.get(row)!, GRAPH_GAP.row, GRAPH_GAP.level, GRAPH_GAP.label);
  const nodes = [...where].map(([id, w]) => ({ id, x: w.x, y: tops.get(w.row)! }));
  return { discipline, width: Math.max(...nodes.map((n) => n.x)) + cardWidth, height: bottom, nodes };
}

export function layoutGraph(skills: Skill[], size: (id: string) => Size): GraphLayout {
  const order: string[] = [];
  const byDiscipline = new Map<string, Skill[]>();
  for (const skill of skills) {
    const d = skill.discipline_id;
    if (!byDiscipline.has(d)) order.push(d);
    byDiscipline.set(d, [...(byDiscipline.get(d) ?? []), skill]);
  }
  const cardWidth = Math.max(0, ...skills.map((s) => size(s.id).width));
  const blocks = order.map((d) => layoutBlock(d, byDiscipline.get(d)!, size, cardWidth));

  // The row width that makes the whole canvas about 16:9, never narrower than the widest block.
  const area = blocks.reduce((sum, b) => sum + (b.width + GRAPH_GAP.block) * (b.height + GRAPH_GAP.block), 0);
  const rowWidth = Math.max(Math.sqrt(area * ASPECT), ...blocks.map((b) => b.width));

  const nodes: GraphLayout['nodes'] = [];
  const bands: GraphLayout['bands'] = [];
  let [x, y, rowHeight] = [0, 0, 0];
  for (const block of blocks) {
    if (x > 0 && x + block.width > rowWidth) {
      [x, y, rowHeight] = [0, y + rowHeight + GRAPH_GAP.block, 0];
    }
    bands.push({ discipline: block.discipline, x, y });
    for (const n of block.nodes) nodes.push({ id: n.id, x: x + n.x, y: y + n.y });
    x += block.width + GRAPH_GAP.block;
    rowHeight = Math.max(rowHeight, block.height);
  }

  const here = new Set(skills.map((s) => s.id));
  const edges: TreeEdge[] = [];
  for (const skill of skills) {
    for (const group of skillGroups(skill)) {
      for (const o of group) {
        if (o.kind === 'skill' && here.has(o.skill_id) && o.skill_id !== skill.id) edges.push({ from: o.skill_id, to: skill.id, alternative: group.length > 1 });
      }
    }
  }
  return { nodes, bands, edges };
}
