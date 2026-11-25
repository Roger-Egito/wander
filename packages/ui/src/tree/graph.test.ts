import { expect, test } from 'vitest';
import { emptyTables, type Row } from '@wander/content';
import { loadContent } from '@wander/rules';
import { GRAPH_GAP, layoutGraph, MAX_PER_ROW } from './graph.ts';

function skills(rows: Row[], requirements: Row[] = []) {
  const t = emptyTables();
  t.Skills.push(...rows.map((r) => ({ status: 'playtest', ...r })));
  t.SkillRequirements.push(...requirements);
  return loadContent(t).skill;
}

const WIDTH = 300;
const heights: Record<string, number> = { 'FOG-01': 200, 'FOG-02': 350, 'FOG-03': 250, 'ARC-01': 180, 'ARC-02': 400 };
const size = (id: string) => ({ width: WIDTH, height: heights[id] ?? 100 });
/** From one card to the next in a row. */
const SLOT = WIDTH + GRAPH_GAP.card;

const data = () => skills(
  [
    { id: 'FOG-01', discipline_id: 'FOG', level: 1 },
    { id: 'FOG-02', discipline_id: 'FOG', level: 1 },
    { id: 'FOG-03', discipline_id: 'FOG', level: 2 },
    { id: 'ARC-01', discipline_id: 'ARC', level: 1 },
    { id: 'ARC-02', discipline_id: 'ARC', level: 3 },
  ],
  [
    { skill_id: 'FOG-03', group: 1, required_skill_id: 'FOG-02' },
    { skill_id: 'ARC-02', group: 1, required_skill_id: 'FOG-03' },
    { skill_id: 'ARC-02', group: 1, required_skill_id: 'ARC-01' },
  ],
);

const position = (layout: ReturnType<typeof layoutGraph>, id: string) => {
  const { x, y } = layout.nodes.find((n) => n.id === id)!;
  return { x, y };
};

test('a level is a row of cards side by side, under the discipline name', () => {
  const layout = layoutGraph(data(), size);
  expect(layout.bands[0]).toEqual({ discipline: 'FOG', x: 0, y: 0 });
  expect(position(layout, 'FOG-01')).toEqual({ x: 0, y: GRAPH_GAP.label });
  expect(position(layout, 'FOG-02')).toEqual({ x: SLOT, y: GRAPH_GAP.label });
});

test('the next level starts under the tallest card, right below what it requires', () => {
  const layout = layoutGraph(data(), size);
  expect(position(layout, 'FOG-03')).toEqual({ x: SLOT, y: GRAPH_GAP.label + 350 + GRAPH_GAP.level });
});

test('a level with no skills leaves no empty row', () => {
  const layout = layoutGraph(data(), size);
  const arc = layout.bands.find((b) => b.discipline === 'ARC')!;
  expect(position(layout, 'ARC-02')).toEqual({ x: position(layout, 'ARC-01').x, y: arc.y + GRAPH_GAP.label + 180 + GRAPH_GAP.level });
});

test('a long level continues in a second row, closer than the next level', () => {
  const many = skills([
    ...Array.from({ length: MAX_PER_ROW + 2 }, (_, i) => ({ id: `OUP-${String(i + 1).padStart(2, '0')}`, discipline_id: 'OUP', level: 1 })),
    { id: 'OUP-99', discipline_id: 'OUP', level: 2 },
  ]);
  const layout = layoutGraph(many, size);
  const first = GRAPH_GAP.label;
  const second = first + 100 + GRAPH_GAP.row;
  expect(layout.nodes.filter((n) => n.y === first)).toHaveLength(MAX_PER_ROW);
  expect(layout.nodes.filter((n) => n.y === second)).toHaveLength(2);
  expect(position(layout, 'OUP-99').y).toBe(second + 100 + GRAPH_GAP.level);
});

test('disciplines wrap into rows, keeping the canvas about as wide as a screen', () => {
  const blocks = skills(Array.from({ length: 12 }, (_, i) => ({ id: `D${i}-01`, discipline_id: `D${i}`, level: 1 })));
  const layout = layoutGraph(blocks, size);
  expect(new Set(layout.bands.map((b) => b.y)).size).toBeGreaterThan(1);
  expect(layout.bands.filter((b) => b.y === 0).length).toBeGreaterThan(1);
  const right = Math.max(...layout.nodes.map((n) => n.x)) + WIDTH;
  const bottom = Math.max(...layout.nodes.map((n) => n.y)) + 100;
  expect(right / bottom).toBeGreaterThan(1);
  expect(right / bottom).toBeLessThan(3);
});

test('a card that grows pushes the next row of disciplines down', () => {
  const blocks = skills(Array.from({ length: 12 }, (_, i) => ({ id: `D${i}-01`, discipline_id: `D${i}`, level: 1 })));
  const before = layoutGraph(blocks, size);
  const after = layoutGraph(blocks, (id) => (id === 'D0-01' ? { width: WIDTH, height: 600 } : size(id)));
  const secondRow = (l: ReturnType<typeof layoutGraph>) => Math.min(...l.bands.filter((b) => b.y > 0).map((b) => b.y));
  expect(secondRow(after) - secondRow(before)).toBe(500);
});

test('arrows cross disciplines, and alternatives are marked', () => {
  expect(layoutGraph(data(), size).edges).toEqual([
    { from: 'FOG-02', to: 'FOG-03', alternative: false },
    { from: 'FOG-03', to: 'ARC-02', alternative: true },
    { from: 'ARC-01', to: 'ARC-02', alternative: true },
  ]);
});

test('requirements on skills that are filtered out draw no arrow', () => {
  const layout = layoutGraph(data().filter((s) => s.id !== 'FOG-03'), size);
  expect(layout.edges).toEqual([{ from: 'ARC-01', to: 'ARC-02', alternative: true }]);
});
