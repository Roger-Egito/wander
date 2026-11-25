/**
 * The Cards view: every row of the current type as its real card, so what a skill does
 * is visible without opening it. The grid fits as many columns as the screen allows,
 * down to one full-width column on a phone.
 *
 * Each card has a checkbox for the bulk actions and an "Editar" button that opens it in
 * the editing screen. The card itself doesn't react to taps, so reading, scrolling and
 * opening a keyword's popover never open the form or change the selection by accident.
 */
import { useMemo } from 'react';
import type { ContentType, Problem, Tables } from '@wander/content';
import { loadContent } from '@wander/rules';
import { ContentProvider, useLanguage } from '@wander/ui';
import { SelectAll, SelectedActions } from './bulk.tsx';
import { CardFrame, hasNotes, toggled, type useOpenNotes } from './CardFrame.tsx';
import { filterRows, type Filters } from './filters.ts';
import { ListTools } from './ListTools.tsx';
import styles from './editor.module.css';

const text = (value: unknown) => (value === null || value === undefined ? '' : String(value).trim());

export interface CardViewProps {
  type: ContentType;
  tables: Tables;
  problems: Problem[];
  filters: Filters;
  onFilters: (filters: Filters) => void;
  checked: Set<string>;
  onChecked: (checked: Set<string>) => void;
  notes: ReturnType<typeof useOpenNotes>;
  onOpen: (id: string) => void;
  onCreate: () => void;
  onBulkDone: (ids: string[], fresh: Tables | null, removed: boolean) => void;
}

/** The designer notes toggle: opens or closes the notes of every card shown. */
export function AllNotesToggle({ type, notes, rowIds }: Pick<CardViewProps, 'type' | 'notes'> & { rowIds: string[] }) {
  const { t } = useLanguage();
  if (!hasNotes(type)) return null;
  const allOpen = rowIds.length > 0 && rowIds.every((id) => notes.open.has(id));
  return (
    <label className={styles.inline}>
      <input type="checkbox" checked={allOpen} onChange={() => notes.toggleAll(rowIds)} /> {t('editor.allNotes')}
    </label>
  );
}

/**
 * What the Cards view and the graph share above their cards: filters, "select all" and
 * the notes toggle on the left, and the bulk actions, once something is checked, to
 * their right on a wide screen (under them on a narrow one), so selecting never pushes
 * the cards down on a PC.
 */
export function CardTools({ type, tables, filters, onFilters, checked, onChecked, notes, onCreate, onBulkDone, rowIds }: CardViewProps & { rowIds: string[] }) {
  return (
    <div className={styles.cardTools}>
      <div className={styles.cardToolsMain}>
        <ListTools type={type} tables={tables} filters={filters} onFilters={onFilters} count={rowIds.length} onCreate={onCreate} />
        <div className={styles.cardToolsRow}>
          <SelectAll rowIds={rowIds} onChecked={onChecked} />
          <AllNotesToggle type={type} notes={notes} rowIds={rowIds} />
        </div>
      </div>
      <SelectedActions type={type} tables={tables} checked={checked} onChecked={onChecked} trash={filters.trash} onBulkDone={onBulkDone} />
    </div>
  );
}

/** Problem counts by row ID. */
export function useProblemCounts(problems: Problem[]) {
  return useMemo(() => {
    const byId = new Map<string, number>();
    for (const p of problems) byId.set(p.id, (byId.get(p.id) ?? 0) + 1);
    return byId;
  }, [problems]);
}

export function CardsView(props: CardViewProps) {
  const { type, tables, problems, filters, checked, onChecked, notes, onOpen } = props;
  // Deleted rows load too, so the Trash shows as cards like everything else.
  const content = useMemo(() => loadContent(tables, { includeDeleted: true }), [tables]);
  const rows = filterRows(type, tables, filters);
  const rowIds = rows.map((r) => text(r.id));
  const counts = useProblemCounts(problems);

  return (
    <section className={styles.cardsView}>
      <CardTools {...props} rowIds={rowIds} />
      <ContentProvider content={content}>
        <ul className={styles.cardGrid}>
          {rows.map((row) => {
            const id = text(row.id);
            return (
              <li key={id} className={styles.cardCell}>
                <CardFrame
                  type={type}
                  content={content}
                  id={id}
                  name={text(row[type.nameKey])}
                  problems={counts.get(id) ?? 0}
                  checked={checked.has(id)}
                  onCheck={(x) => onChecked(toggled(checked, x))}
                  notesOpen={notes.open.has(id)}
                  onToggleNotes={notes.toggle}
                  onOpen={onOpen}
                />
              </li>
            );
          })}
        </ul>
      </ContentProvider>
    </section>
  );
}
