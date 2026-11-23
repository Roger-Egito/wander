/**
 * A discipline's skills as a tree (React Flow): one column per level, arrows from each
 * prerequisite to the skill that needs it, dashed when it's one of several alternatives.
 * Each node shows the name, cost and stat requirement. Selecting a node tells the
 * parent, which shows that skill's card.
 */
import { Background, Controls, Handle, MarkerType, Position, ReactFlow, type Edge, type Node, type NodeProps } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useMemo } from 'react';
import { costsOf, formatCost, formatSkillRequirements, formatStatRequirements, inLanguage, statGroups, type Skill } from '@wander/rules';
import { useContent } from '../ContentProvider.tsx';
import { useLanguage } from '../i18n/LanguageProvider.tsx';
import { layoutTree } from './layout.ts';
import styles from './SkillTree.module.css';

type SkillNodeData = { name: string; cost: string; stats: string; note: string; taken: boolean; selected: boolean };
type SkillNode = Node<SkillNodeData, 'skill'>;

function SkillNodeView({ data }: NodeProps<SkillNode>) {
  return (
    <div className={styles.node} data-taken={data.taken} data-selected={data.selected}>
      <Handle type="target" position={Position.Left} className={styles.handle} />
      <strong className={styles.name}>{data.name}</strong>
      {(data.cost || data.stats) && <span className={styles.meta}>{[data.stats, data.cost].filter(Boolean).join(' · ')}</span>}
      {data.note && <span className={styles.note}>{data.note}</span>}
      <Handle type="source" position={Position.Right} className={styles.handle} />
    </div>
  );
}

const nodeTypes = { skill: SkillNodeView };

export interface SkillTreeProps {
  disciplineId: string;
  /** Skills the character has, drawn highlighted. */
  taken?: string[];
  selected?: string;
  onSelect?: (skillId: string) => void;
}

export function SkillTree({ disciplineId, taken = [], selected, onSelect }: SkillTreeProps) {
  const content = useContent();
  const { language, t } = useLanguage();
  const skills = useMemo(() => content.skill.filter((s: Skill) => s.discipline_id === disciplineId), [content, disciplineId]);

  const { nodes, edges } = useMemo(() => {
    const layout = layoutTree(skills);
    const byId = new Map(skills.map((s) => [s.id, s]));
    const nodes: SkillNode[] = layout.nodes.map((n) => {
      const skill = byId.get(n.id)!;
      const unshown = layout.unshown.get(n.id);
      return {
        id: n.id,
        type: 'skill',
        position: { x: n.x, y: n.y },
        data: {
          name: inLanguage(content, language, { tab: 'Skills', id: skill.id, field: 'name' }, skill.name, skill.name_en),
          cost: formatCost(costsOf(skill), content, language),
          stats: formatStatRequirements(statGroups(skill), content, { language }),
          note: unshown ? t('tree.otherDiscipline', { skills: formatSkillRequirements(unshown, content, language) }) : '',
          taken: taken.includes(n.id),
          selected: n.id === selected,
        },
      };
    });
    const edges: Edge[] = layout.edges.map((e) => ({
      id: `${e.from}->${e.to}`,
      source: e.from,
      target: e.to,
      type: 'smoothstep',
      className: e.alternative ? styles.alternative : styles.edge,
      markerEnd: { type: MarkerType.ArrowClosed },
    }));
    return { nodes, edges };
  }, [skills, content, language, t, taken, selected]);

  if (!skills.length) return <p className={styles.empty}>{t('tree.empty')}</p>;

  return (
    <div className={styles.tree}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodeClick={(_, node) => onSelect?.(node.id)}
        nodesDraggable={false}
        nodesConnectable={false}
        fitView
        fitViewOptions={{ padding: 0.15 }}
        minZoom={0.2}
        proOptions={{ hideAttribution: false }}
      >
        <Background gap={24} />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  );
}
