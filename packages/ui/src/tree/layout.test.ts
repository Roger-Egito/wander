import { expect, test } from 'vitest';
import { emptyTables, type Row } from '@wander/content';
import { loadContent } from '@wander/rules';
import { COLUMN_WIDTH, layoutTree, ROW_HEIGHT } from './layout.ts';

function skills(rows: Row[], requirements: Row[]) {
  const t = emptyTables();
  t.Skills.push(...rows.map((r) => ({ discipline_id: 'FOG', status: 'playtest', ...r })));
  t.SkillRequirements.push(...requirements);
  return loadContent(t).skill;
}

const at = (layout: ReturnType<typeof layoutTree>, id: string) => {
  const node = layout.nodes.find((n) => n.id === id)!;
  return [node.x / COLUMN_WIDTH, node.y / ROW_HEIGHT];
};

test('column is the level, and a skill sits beside what it requires', () => {
  const layout = layoutTree(skills(
    [{ id: 'FOG-01', level: 1 }, { id: 'FOG-02', level: 1 }, { id: 'FOG-03', level: 2 }, { id: 'FOG-04', level: 2 }],
    [{ skill_id: 'FOG-03', group: 1, required_skill_id: 'FOG-02' }, { skill_id: 'FOG-04', group: 1, required_skill_id: 'FOG-01' }],
  ));
  expect(at(layout, 'FOG-01')).toEqual([0, 0]);
  expect(at(layout, 'FOG-02')).toEqual([0, 1]);
  // FOG-04 needs FOG-01 (row 0), so it goes above FOG-03, which needs FOG-02 (row 1).
  expect(at(layout, 'FOG-04')).toEqual([1, 0]);
  expect(at(layout, 'FOG-03')).toEqual([1, 1]);
  expect(layout.edges).toEqual([
    { from: 'FOG-02', to: 'FOG-03', alternative: false },
    { from: 'FOG-01', to: 'FOG-04', alternative: false },
  ]);
});

test('alternatives are marked, and requirements an arrow cannot show are kept', () => {
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
  expect(at(layout, 'FOG-05')).toEqual([2, 0]);
});

test('a skill moved by hand stays where it was put', () => {
  const layout = layoutTree(skills([{ id: 'FOG-01', level: 1, pos_x: 40, pos_y: 500 }], []));
  expect(layout.nodes[0]).toEqual({ id: 'FOG-01', x: 40, y: 500 });
});
