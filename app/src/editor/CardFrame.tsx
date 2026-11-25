/**
 * A row of the current type drawn as its card, with what the Editor adds around it: the
 * problem count, a checkbox for bulk actions and the "Editar" button. The Cards view and
 * the graph both draw rows this way, so a card works the same in either.
 *
 * Designer notes open per card, or all at once from the toggle above the cards. Which
 * ones are open is kept by the Workspace, so it survives switching between the two views.
 */
import { useCallback, useMemo, useState } from 'react';
import type { ContentType } from '@wander/content';
import type { Content } from '@wander/rules';
import { ConditionCard, DisciplineCard, KeywordCard, SkillCard, TraitCard, useLanguage, type NotesControl } from '@wander/ui';
import styles from './editor.module.css';

/** The card of one row, with designer notes for the types that have them. */
export function cardFor(type: ContentType, content: Content, id: string, notes?: NotesControl) {
  if (type.id === 'skill') {
    const skill = content.skillsById.get(id);
    return skill && <SkillCard skill={skill} notes={notes} />;
  }
  if (type.id === 'condition') {
    const c = content.condition.find((x) => x.id === id);
    return c && <ConditionCard condition={c} />;
  }
  if (type.id === 'trait') {
    const tr = content.trait.find((x) => x.id === id);
    return tr && <TraitCard trait={tr} notes={notes} />;
  }
  if (type.id === 'keyword') {
    const k = content.keyword.find((x) => x.id === id);
    return k && <KeywordCard keyword={k} />;
  }
  const d = content.discipline.find((x) => x.id === id);
  return d && <DisciplineCard discipline={d} />;
}

/** Types whose cards have designer notes. */
export const hasNotes = (type: ContentType) => type.fields.some((f) => f.key === 'notes');

export function CardFrame({ type, content, id, name, problems, checked, onCheck, notesOpen, onToggleNotes, onOpen }: {
  type: ContentType;
  content: Content;
  id: string;
  name: string;
  problems: number;
  checked: boolean;
  onCheck: (id: string) => void;
  notesOpen: boolean;
  onToggleNotes: (id: string) => void;
  onOpen: (id: string) => void;
}) {
  const { t } = useLanguage();
  return (
    <div className={styles.cardFrame} data-checked={checked}>
      <div className={styles.cardActions}>
        {problems > 0 && <span className={styles.problemBadge} title={t('editor.problemCount', { count: problems })}>{problems}</span>}
        <label className={styles.cardCheck}>
          <input type="checkbox" checked={checked} onChange={() => onCheck(id)} aria-label={t('editor.select', { name: name || id })} />
        </label>
        <button type="button" className={styles.secondary} onClick={() => onOpen(id)} aria-label={`${t('editor.edit')} ${name || id}`}>
          {t('editor.edit')}
        </button>
      </div>
      {cardFor(type, content, id, { open: notesOpen, onToggle: () => onToggleNotes(id) })}
    </div>
  );
}

/** Which cards have their designer notes open. */
export function useOpenNotes() {
  const [open, setOpen] = useState<Set<string>>(new Set());
  const toggle = useCallback((id: string) => setOpen((all) => toggled(all, id)), []);
  /** Opens every one of `ids`, or closes them all when they're all open already. */
  const toggleAll = useCallback((ids: string[]) => setOpen((all) => (ids.every((id) => all.has(id)) ? new Set() : new Set(ids))), []);
  // One identity while nothing changes, so the graph doesn't rebuild its cards for nothing.
  return useMemo(() => ({ open, toggle, toggleAll }), [open, toggle, toggleAll]);
}

/** A copy of `set` with `id` added, or removed if it was there. */
export function toggled(set: Set<string>, id: string) {
  const next = new Set(set);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
}
