/**
 * Where each skill sits in a discipline's tree. Column = level, so every level-2 skill
 * lines up under "2" in any discipline. Within a column, skills sit near the skills
 * they require (the average row of their prerequisites), which keeps arrows short and
 * mostly uncrossed. A skill someone dragged by hand (pos_x/pos_y in the sheet) stays
 * where they put it.
 *
 * An arrow goes from a prerequisite to the skill that needs it, when both are in this
 * discipline. Arrows of a group of alternatives ("A ou B") are marked, so the tree can
 * draw them dashed. Requirements an arrow can't show (a skill of another discipline,
 * "Qualquer (Magia, Trevas)") are returned per skill, for the node to say in words.
 */
import { positionOf, skillGroups, type Skill, type SkillRequirementOption } from '@wander/rules';

export const COLUMN_WIDTH = 280;
export const ROW_HEIGHT = 130;

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

export function layoutTree(skills: Skill[]): TreeLayout {
  const here = new Set(skills.map((s) => s.id));
  const edges: TreeEdge[] = [];
  const unshown = new Map<string, SkillRequirementOption[][]>();
  const parents = new Map<string, string[]>();

  for (const skill of skills) {
    for (const group of skillGroups(skill)) {
      const local = group.filter((o): o is { kind: 'skill'; skill_id: string } => o.kind === 'skill' && here.has(o.skill_id) && o.skill_id !== skill.id);
      for (const o of local) {
        edges.push({ from: o.skill_id, to: skill.id, alternative: group.length > 1 });
        parents.set(skill.id, [...(parents.get(skill.id) ?? []), o.skill_id]);
      }
      if (local.length < group.length) unshown.set(skill.id, [...(unshown.get(skill.id) ?? []), group]);
    }
  }

  const columns = new Map<number, Skill[]>();
  for (const skill of skills) {
    const column = Math.max(0, (skill.level ?? 1) - 1);
    columns.set(column, [...(columns.get(column) ?? []), skill]);
  }

  const row = new Map<string, number>();
  for (const column of [...columns.keys()].sort((a, b) => a - b)) {
    const average = (skill: Skill) => {
      const placed = (parents.get(skill.id) ?? []).map((p) => row.get(p)).filter((r): r is number => r !== undefined);
      return placed.length ? placed.reduce((a, b) => a + b, 0) / placed.length : Infinity;
    };
    const ordered = [...columns.get(column)!].sort((a, b) => {
      const [ra, rb] = [average(a), average(b)];
      if (ra !== rb) return ra === Infinity ? 1 : rb === Infinity ? -1 : ra - rb;
      return a.id.localeCompare(b.id, 'pt', { numeric: true });
    });
    ordered.forEach((skill, i) => row.set(skill.id, i));
  }

  const nodes = skills.map((skill): TreeNode => {
    const moved = positionOf(skill);
    if (moved) return { id: skill.id, ...moved };
    return { id: skill.id, x: Math.max(0, (skill.level ?? 1) - 1) * COLUMN_WIDTH, y: row.get(skill.id)! * ROW_HEIGHT };
  });
  return { nodes, edges, unshown };
}
