/**
 * Every skill given, as its full card, in one graph (React Flow): disciplines as blocks,
 * levels as rows, arrows down from each required skill to the skill that needs it (see
 * graph.ts for the layout).
 *
 * "Tela cheia" lays the graph over the whole window (Esc or the same button leaves).
 * It covers the page instead of using the browser's fullscreen, which shows only one
 * element and would hide the keyword popovers, since those open at the end of the page.
 * Whatever the page passes as `fullscreenTools` floats over the graph meanwhile (the
 * Editor puts its selection there).
 *
 * Cards have different heights, so the graph measures them before placing them. React
 * Flow takes a node's size from the node object it's given, so the measured sizes live
 * here, go back into each node, and every size change lays the graph out again.
 */
import {
  Background, Controls, Handle, MarkerType, MiniMap, Panel, Position, ReactFlow, ReactFlowProvider, useReactFlow,
  type Edge, type Node, type NodeChangeset, type NodeProps,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { inLanguage, type Skill } from '@wander/rules';
import { useContent } from '../ContentProvider.tsx';
import { useLanguage } from '../i18n/LanguageProvider.tsx';
import { SkillCard } from '../cards/cards.tsx';
import { GRAPH_GAP, layoutGraph, type Size } from './graph.ts';
import treeStyles from './SkillTree.module.css';
import styles from './SkillGraph.module.css';

/** Cards are this wide in the graph. Their height is measured. */
export const GRAPH_CARD_WIDTH = 340;
const UNMEASURED: Size = { width: GRAPH_CARD_WIDTH, height: 300 };
/** Space around the first discipline when the graph opens. */
const MARGIN = 24;

type CardNode = Node<{ card: ReactNode }, 'card'>;
type BandNode = Node<{ label: string }, 'band'>;

function CardNodeView({ data }: NodeProps<CardNode>) {
  return (
    <div className={styles.cardNode} style={{ width: GRAPH_CARD_WIDTH }}>
      <Handle type="target" position={Position.Top} className={treeStyles.handle} />
      {data.card}
      <Handle type="source" position={Position.Bottom} className={treeStyles.handle} />
    </div>
  );
}

function BandNodeView({ data }: NodeProps<BandNode>) {
  return <h3 className={styles.band}>{data.label}</h3>;
}

const nodeTypes = { card: CardNodeView, band: BandNodeView };

export interface SkillGraphProps {
  skills: Skill[];
  /** What each node shows. Defaults to the skill's card. */
  renderCard?: (skill: Skill) => ReactNode;
  /** Shown over the graph's top-left corner while it fills the window. */
  fullscreenTools?: ReactNode;
}

export function SkillGraph(props: SkillGraphProps) {
  return (
    <ReactFlowProvider>
      <Graph {...props} />
    </ReactFlowProvider>
  );
}

function Graph({ skills, renderCard = (skill) => <SkillCard skill={skill} />, fullscreenTools }: SkillGraphProps) {
  const content = useContent();
  const { language, t } = useLanguage();
  const { setViewport } = useReactFlow();
  const box = useRef<HTMLDivElement>(null);
  const [sizes, setSizes] = useState<Map<string, Size>>(new Map());
  const [fullscreen, setFullscreen] = useState(false);

  // While the graph fills the window, Esc leaves and the page behind it doesn't scroll.
  useEffect(() => {
    if (!fullscreen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !document.querySelector('dialog[open]')) setFullscreen(false);
    };
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = overflow;
      window.removeEventListener('keydown', onKey);
    };
  }, [fullscreen]);

  const layout = useMemo(() => layoutGraph(skills, (id) => sizes.get(id) ?? UNMEASURED), [skills, sizes]);
  const measured = skills.length > 0 && skills.every((s) => sizes.has(s.id));

  const nodes = useMemo(() => {
    const byId = new Map(skills.map((s) => [s.id, s]));
    const cards: CardNode[] = layout.nodes.map((n) => ({
      id: n.id,
      type: 'card',
      position: { x: n.x, y: n.y },
      measured: sizes.get(n.id),
      style: {
        // React Flow turns pointer events off on nodes that can't be selected or dragged
        // and have no click handler. These hold buttons (notes, and the Editor's own).
        pointerEvents: 'all',
        // Hidden until measured, so nobody sees the cards jump into place.
        visibility: measured ? undefined : 'hidden',
      },
      selectable: false,
      data: { card: renderCard(byId.get(n.id)!) },
    }));
    const bands: BandNode[] = layout.bands.map((b) => {
      const d = content.discipline.find((x) => x.id === b.discipline);
      const name = d ? inLanguage(content, language, { tab: 'Disciplines', id: d.id, field: 'name' }, d.name, d.name_en) : b.discipline;
      return { id: `band:${b.discipline}`, type: 'band', position: { x: b.x, y: b.y }, selectable: false, data: { label: `${b.discipline} · ${name}` } };
    });
    return [...bands, ...cards];
  }, [layout, sizes, measured, skills, renderCard, content, language]);

  const edges = useMemo<Edge[]>(() => layout.edges.map((e) => ({
    id: `${e.from}->${e.to}`,
    source: e.from,
    target: e.to,
    type: 'smoothstep',
    className: e.alternative ? treeStyles.alternative : treeStyles.edge,
    markerEnd: { type: MarkerType.ArrowClosed },
  })), [layout]);

  const onNodesChange = (changes: NodeChangeset<CardNode | BandNode>) => {
    const resized = changes.getByType('dimensions').filter((c) => c.dimensions && !c.id.startsWith('band:'));
    if (!resized.length) return;
    setSizes((before) => {
      let next: Map<string, Size> | null = null;
      for (const c of resized) {
        if (!c.dimensions) continue;
        const old = before.get(c.id);
        if (old && old.width === c.dimensions.width && old.height === c.dimensions.height) continue;
        next ??= new Map(before);
        next.set(c.id, c.dimensions);
      }
      return next ?? before;
    });
  };

  // Once every card is measured and placed, and again when the set of skills changes (a
  // filter) but not when one card grows: open on the first discipline at a size that
  // reads, about three cards across on a wide screen and one on a phone, never past 100%.
  // The whole graph zoomed out was unreadable and slow on a phone. Controls' fit button
  // still shows everything.
  const started = useRef('');
  const key = skills.map((s) => s.id).join(',');
  useEffect(() => {
    if (!measured || started.current === key || !layout.bands.length) return;
    started.current = key;
    const width = box.current?.clientWidth ?? 1000;
    const across = width < 700 ? 1 : 3;
    const zoom = Math.min(1, width / (across * (GRAPH_CARD_WIDTH + GRAPH_GAP.card) + 2 * MARGIN));
    const first = layout.bands[0];
    requestAnimationFrame(() => void setViewport({ x: MARGIN - first.x * zoom, y: MARGIN - first.y * zoom, zoom }));
  }, [measured, key, layout, setViewport]);

  if (!skills.length) return <p className={treeStyles.empty}>{t('graph.empty')}</p>;

  return (
    <div ref={box} className={`${treeStyles.tree} ${styles.graph}`} data-fullscreen={fullscreen}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        minZoom={0.02}
        maxZoom={1.5}
      >
        <Background gap={24} />
        <Controls showInteractive={false} />
        <MiniMap pannable zoomable className={styles.minimap} />
        <Panel position="top-right">
          <button type="button" className={styles.panelButton} aria-pressed={fullscreen} onClick={() => setFullscreen((on) => !on)}>
            {t(fullscreen ? 'graph.exitFullscreen' : 'graph.fullscreen')}
          </button>
        </Panel>
        {fullscreen && fullscreenTools && <Panel position="top-left" className={styles.toolsPanel}>{fullscreenTools}</Panel>}
      </ReactFlow>
    </div>
  );
}
