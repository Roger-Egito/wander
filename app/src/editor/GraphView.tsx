/**
 * The graph view (skills only): every skill the filters show, as its card, with arrows
 * from each required skill to the skill that needs it. Each card has the same checkbox
 * and "Editar" button as in the Cards view, and the same filters and bulk actions sit
 * above it.
 */
import { useCallback, useMemo } from 'react';
import { loadContent, type Skill } from '@wander/rules';
import { ContentProvider, SkillGraph } from '@wander/ui';
import { CardFrame, toggled } from './CardFrame.tsx';
import { CardTools, useProblemCounts, type CardViewProps } from './CardsView.tsx';
import { filterRows } from './filters.ts';
import styles from './editor.module.css';

const text = (value: unknown) => (value === null || value === undefined ? '' : String(value).trim());

export function GraphView(props: CardViewProps) {
  const { type, tables, problems, filters, checked, onChecked, notes, onOpen } = props;
  const content = useMemo(() => loadContent(tables, { includeDeleted: true }), [tables]);
  const rowIds = filterRows(type, tables, filters).map((r) => text(r.id));
  const key = rowIds.join(',');
  // The same array while the filters show the same rows, so the graph keeps its layout.
  const skills = useMemo(() => key.split(',').map((id) => content.skillsById.get(id)).filter((s): s is Skill => !!s), [key, content]);
  const counts = useProblemCounts(problems);

  const renderCard = useCallback((skill: Skill) => (
    <CardFrame
      type={type}
      content={content}
      id={skill.id}
      name={skill.name}
      problems={counts.get(skill.id) ?? 0}
      checked={checked.has(skill.id)}
      onCheck={(x) => onChecked(toggled(checked, x))}
      notesOpen={notes.open.has(skill.id)}
      onToggleNotes={notes.toggle}
      onOpen={onOpen}
    />
  ), [type, content, counts, checked, onChecked, notes, onOpen]);

  return (
    <section className={styles.cardsView}>
      <CardTools {...props} rowIds={rowIds} />
      <ContentProvider content={content}>
        <SkillGraph skills={skills} renderCard={renderCard} />
      </ContentProvider>
    </section>
  );
}
