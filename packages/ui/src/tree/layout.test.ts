import { expect, test } from 'vitest';
import { emptyTables, type Row } from '@wander/content';
import { loadContent } from '@wander/rules';
import { layoutTree, SLOT_WIDTH, TREE_ROW, type TreeLayout } from './layout.ts';

function skills(rows: Row[], requirements: Row[]) {
  const t = emptyTables();
  t.Skills.push(...rows.map((r) => ({ discipline_id: 'FOG', status: 'playtest', ...r })));
  t.SkillRequirements.push(...requirements);
  return loadContent(t).skill;
}

/** From one level's row to the next. */
const LEVEL = TREE_ROW.height + TREE_ROW.levelGap;

/** [slot, level row] of a node. */
const at = (layout: TreeLayout, id: string) => {
  const node = layout.nodes.find((n) => n.id === id)!;
  return [node.x / SLOT_WIDTH, node.y / LEVEL];
};

/** Pairs of arrows between the same two rows that cross each other. */
function crossings(layout: TreeLayout) {
  const pos = new Map(layout.nodes.map((n) => [n.id, n]));
  let count = 0;
  for (const [i, a] of layout.edges.entries()) {
    for (const b of layout.edges.slice(i + 1)) {
      const [a1, a2, b1, b2] = [pos.get(a.from)!, pos.get(a.to)!, pos.get(b.from)!, pos.get(b.to)!];
      if (a1.y !== b1.y || a2.y !== b2.y) continue;
      if ((a1.x - b1.x) * (a2.x - b2.x) < 0) count++;
    }
  }
  return count;
}

test('levels are rows, and a skill sits right under what it requires', () => {
  const layout = layoutTree(skills(
    [{ id: 'FOG-01', level: 1 }, { id: 'FOG-02', level: 1 }, { id: 'FOG-03', level: 2 }, { id: 'FOG-04', level: 2 }],
    [{ skill_id: 'FOG-03', group: 1, required_skill_id: 'FOG-02' }, { skill_id: 'FOG-04', group: 1, required_skill_id: 'FOG-01' }],
  ));
  expect(at(layout, 'FOG-01')).toEqual([0, 0]);
  expect(at(layout, 'FOG-02')).toEqual([1, 0]);
  // By ID FOG-03 would come first in its row and cross FOG-04's arrow. It goes under FOG-02 instead.
  expect(at(layout, 'FOG-04')).toEqual([0, 1]);
  expect(at(layout, 'FOG-03')).toEqual([1, 1]);
  expect(crossings(layout)).toBe(0);
});

test('siblings spread evenly under the skill they all require', () => {
  const layout = layoutTree(skills(
    [{ id: 'FOG-01', level: 1 }, { id: 'FOG-02', level: 2 }, { id: 'FOG-03', level: 2 }, { id: 'FOG-04', level: 2 }],
    ['FOG-02', 'FOG-03', 'FOG-04'].map((id) => ({ skill_id: id, group: 1, required_skill_id: 'FOG-01' })),
  ));
  expect(at(layout, 'FOG-01')).toEqual([1, 0]);
  expect(['FOG-02', 'FOG-03', 'FOG-04'].map((id) => at(layout, id))).toEqual([[0, 1], [1, 1], [2, 1]]);
});

test('interleaved IDs still come out with no crossing arrows', () => {
  const layout = layoutTree(skills(
    [1, 2, 3, 4, 5, 6].map((n) => ({ id: `FOG-0${n}`, level: n <= 2 ? 1 : 2 })),
    [
      { skill_id: 'FOG-03', group: 1, required_skill_id: 'FOG-02' },
      { skill_id: 'FOG-04', group: 1, required_skill_id: 'FOG-01' },
      { skill_id: 'FOG-05', group: 1, required_skill_id: 'FOG-02' },
      { skill_id: 'FOG-06', group: 1, required_skill_id: 'FOG-01' },
    ],
  ));
  expect(crossings(layout)).toBe(0);
});

test('a skill needing either of two sits between them, and what arrows cannot show is kept', () => {
  const layout = layoutTree(skills(
    [{ id: 'FOG-01', level: 1 }, { id: 'FOG-02', level: 1 }, { id: 'FOG-05', level: 3 }],
    [
      { skill_id: 'FOG-05', group: 1, required_skill_id: 'FOG-01' },
      { skill_id: 'FOG-05', group: 1, required_skill_id: 'FOG-02' },
      { skill_id: 'FOG-05', group: 2, required_skill_id: 'ARC-09' },
      { skill_id: 'FOG-05', group: 3, required_categories: 'Magia, Fogo' },
    ],
  ));
  expect(layout.edges.map((e) => e.alternative)).toEqual([true, true]);
  expect(layout.unshown.get('FOG-05')).toEqual([[{ kind: 'skill', skill_id: 'ARC-09' }], [{ kind: 'categories', categories: ['Magia', 'Fogo'] }]]);
  // Level 2 has no skills, so level 3 is the next row.
  expect(at(layout, 'FOG-05')).toEqual([0.5, 1]);
});

test('a skill requiring one of its own level goes in a second row of that level, under it', () => {
  const layout = layoutTree(skills(
    [{ id: 'FOG-01', level: 1 }, { id: 'FOG-02', level: 1 }, { id: 'FOG-03', level: 1 }, { id: 'FOG-04', level: 2 }],
    [{ skill_id: 'FOG-03', group: 1, required_skill_id: 'FOG-02' }, { skill_id: 'FOG-04', group: 1, required_skill_id: 'FOG-03' }],
  ));
  const node = (id: string) => layout.nodes.find((n) => n.id === id)!;
  expect(node('FOG-03').y).toBe(TREE_ROW.height + TREE_ROW.gap);
  expect(node('FOG-03').x).toBe(node('FOG-02').x);
  expect(node('FOG-04').y).toBe(2 * TREE_ROW.height + TREE_ROW.gap + TREE_ROW.levelGap);
  expect(crossings(layout)).toBe(0);
});

test('a skill moved by hand stays where it was put', () => {
  const layout = layoutTree(skills([{ id: 'FOG-01', level: 1, pos_x: 40, pos_y: 500 }], []));
  expect(layout.nodes[0]).toEqual({ id: 'FOG-01', x: 40, y: 500 });
});
