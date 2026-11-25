/**
 * Bulk actions on the rows selected in any Editor view (list, cards or graph): move to
 * the Trash, change status, set one field, and in the Trash restore or delete
 * permanently. Every action asks first,
 * listing the rows, what points at them, and (for a permanent delete) what goes with
 * them. Each action is one write to the sheet.
 */
import { useEffect, useRef, useState } from 'react';
import { LIVE_STATUSES, type ContentType, type Field, type Tables } from '@wander/content';
import { useLanguage } from '@wander/ui';
import type { CellValue } from '../adapters/sheets/transport.ts';
import { dependentsOf, goesWith } from './dependents.ts';
import { useEditorData } from './EditorData.tsx';
import { FieldInput } from './fields.tsx';
import styles from './editor.module.css';

type Action =
  | { kind: 'delete' }
  | { kind: 'status'; value: string }
  | { kind: 'field'; field: Field; value: CellValue }
  | { kind: 'restore'; value: string }
  | { kind: 'forever' };

const text = (value: unknown) => (value === null || value === undefined ? '' : String(value).trim());

/** Fields a bulk edit can set: plain values, not names (they must stay unique), texts or child rows. */
const editable = (type: ContentType) =>
  type.fields.filter((f) => !f.system && f.key !== type.nameKey && f.key !== 'status' && f.type !== 'subtable' && f.type !== 'modifiers' && f.type !== 'richtext');

interface SelectionProps {
  type: ContentType;
  tables: Tables;
  /** The rows the filters show, which "select all" selects. */
  rowIds: string[];
  checked: Set<string>;
  onChecked: (checked: Set<string>) => void;
  trash: boolean;
  onBulkDone: (ids: string[], fresh: Tables | null, removed: boolean) => void;
}

/** "Selecionar todos (n)": every row the filters show. */
export function SelectAll({ rowIds, onChecked }: Pick<SelectionProps, 'rowIds' | 'onChecked'>) {
  const { t } = useLanguage();
  if (!rowIds.length) return null;
  return (
    <button type="button" className={styles.linkButton} onClick={() => onChecked(new Set(rowIds))}>
      {t('editor.selectAll', { count: rowIds.length })}
    </button>
  );
}

/** The bulk actions, once something is checked. */
export function SelectedActions({ type, tables, checked, onChecked, trash, onBulkDone }: Omit<SelectionProps, 'rowIds'>) {
  if (!checked.size) return null;
  return (
    <BulkBar
      type={type}
      tables={tables}
      ids={[...checked]}
      trash={trash}
      onClear={() => onChecked(new Set())}
      onDone={(ids, fresh, removed) => { onChecked(new Set()); onBulkDone(ids, fresh, removed); }}
    />
  );
}

/**
 * "Selecionar todos" and, once something is checked, the bulk actions, one under the
 * other. The selection itself belongs to the Workspace, so it's the same in every view.
 */
export function SelectionTools(props: SelectionProps) {
  return (
    <>
      <SelectAll rowIds={props.rowIds} onChecked={props.onChecked} />
      <SelectedActions {...props} />
    </>
  );
}

export function BulkBar({ type, tables, ids, trash, onClear, onDone }: {
  type: ContentType;
  tables: Tables;
  ids: string[];
  trash: boolean;
  onClear: () => void;
  onDone: (ids: string[], fresh: Tables | null, removed: boolean) => void;
}) {
  const { language, t } = useLanguage();
  const { adapter, reload } = useEditorData();
  const [pending, setPending] = useState<Action | null>(null);
  const [status, setStatus] = useState(trash ? 'draft' : 'playtest');
  const fields = editable(type);
  const [fieldKey, setFieldKey] = useState(fields[0]?.key ?? '');
  const [fieldValue, setFieldValue] = useState<CellValue>('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const has = (key: string) => type.fields.some((f) => f.key === key);
  const field = fields.find((f) => f.key === fieldKey);

  async function run(action: Action) {
    setBusy(true);
    setError(null);
    try {
      if (action.kind === 'delete') await adapter.updateMany(type.id, ids, { status: 'deleted' });
      if (action.kind === 'status' || action.kind === 'restore') await adapter.updateMany(type.id, ids, { status: action.value });
      if (action.kind === 'field') await adapter.updateMany(type.id, ids, { [action.field.key]: action.value });
      if (action.kind === 'forever') {
        await adapter.deletePermanently(type.id, ids);
        // Newest first, so a run of the latest IDs all go back to their counter.
        for (const id of [...ids].sort((a, b) => b.localeCompare(a, 'pt', { numeric: true }))) await adapter.releaseId(type.id, id);
      }
      const fresh = await reload();
      setPending(null);
      onDone(ids, fresh, action.kind === 'forever');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const statusSelect = (value: string, set: (v: string) => void, label: string) => (
    <select className={styles.input} aria-label={label} value={value} onChange={(e) => set(e.target.value)}>
      {LIVE_STATUSES.map((s) => <option key={s} value={s}>{t(`status.${s}` as 'status.draft')}</option>)}
    </select>
  );

  return (
    <div className={styles.bulk} role="region" aria-label={t('editor.selected', { count: ids.length })}>
      <div className={styles.bulkHead}>
        <strong>{t('editor.selected', { count: ids.length })}</strong>
        <button type="button" className={styles.linkButton} onClick={onClear}>{t('editor.clearSelection')}</button>
      </div>
      {trash ? (
        <div className={styles.bulkRow}>
          {statusSelect(status, setStatus, t('editor.restoreAs'))}
          <button type="button" className={styles.secondary} onClick={() => setPending({ kind: 'restore', value: status })}>{t('editor.restore')}</button>
          <button type="button" className={styles.danger} onClick={() => setPending({ kind: 'forever' })}>{t('editor.deleteForever')}</button>
        </div>
      ) : (
        <>
          {has('status') && (
            <div className={styles.bulkRow}>
              {statusSelect(status, setStatus, t('editor.bulkStatus'))}
              <button type="button" className={styles.secondary} onClick={() => setPending({ kind: 'status', value: status })}>{t('editor.bulkStatus')}</button>
            </div>
          )}
          {fields.length > 0 && (
            <div className={styles.bulkField}>
              <select className={styles.input} aria-label={t('editor.field')} value={fieldKey} onChange={(e) => { setFieldKey(e.target.value); setFieldValue(''); }}>
                {fields.map((f) => <option key={f.key} value={f.key}>{f.label[language]}</option>)}
              </select>
              {field && <FieldInput compact field={{ ...field, required: false }} value={fieldValue} tables={tables} onChange={setFieldValue} />}
              <button type="button" className={styles.secondary} onClick={() => field && setPending({ kind: 'field', field, value: fieldValue })}>{t('editor.bulkField')}</button>
            </div>
          )}
          {has('status') && <button type="button" className={styles.danger} onClick={() => setPending({ kind: 'delete' })}>{t('editor.bulkDelete')}</button>}
        </>
      )}
      {pending && (
        <Confirm type={type} tables={tables} ids={ids} action={pending} busy={busy} error={error} onCancel={() => { setPending(null); setError(null); }} onConfirm={() => run(pending)} />
      )}
    </div>
  );
}

function Confirm({ type, tables, ids, action, busy, error, onCancel, onConfirm }: {
  type: ContentType;
  tables: Tables;
  ids: string[];
  action: Action;
  busy: boolean;
  error: string | null;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const { language, t } = useLanguage();
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    dialog.current?.showModal();
  }, []);

  const count = ids.length;
  const statusName = (v: string) => t(`status.${v}` as 'status.draft');
  const message =
    action.kind === 'delete' ? t('editor.confirmDelete', { count })
    : action.kind === 'forever' ? t('editor.confirmForever', { count })
    : action.kind === 'status' ? t('editor.confirmStatus', { count, value: statusName(action.value) })
    : action.kind === 'restore' ? t('editor.confirmRestore', { count, value: statusName(action.value) })
    : t('editor.confirmField', { count, field: action.field.label[language], value: text(action.value) || '—' });
  const removes = action.kind === 'delete' || action.kind === 'forever';
  const dependents = removes ? dependentsOf(tables, type, ids) : [];
  const going = action.kind === 'forever' ? Object.entries(goesWith(tables, type, ids)) : [];
  const name = (id: string) => text(tables[type.tab].find((r) => text(r.id) === id)?.[type.nameKey]);

  return (
    <dialog ref={dialog} className={styles.dialog} onCancel={(e) => { e.preventDefault(); if (!busy) onCancel(); }}>
      <p className={styles.dialogMessage}>{message}</p>
      <ul className={styles.dialogList}>
        {ids.map((id) => <li key={id}>{id} · {name(id)}</li>)}
      </ul>
      {removes && (dependents.length ? (
        <>
          <p className={styles.problem}>{t('editor.dependents')}</p>
          <ul className={styles.dialogList}>
            {dependents.map((d, i) => <li key={i}>{d.id} · {d.name} → {d.target} ({d.via[language]})</li>)}
          </ul>
        </>
      ) : <p className={styles.muted}>{t('editor.noDependents')}</p>)}
      {going.length > 0 && (
        <p className={styles.muted}>{t('editor.goesWith')} {going.map(([tab, n]) => `${tab} ${n}`).join(', ')}</p>
      )}
      {error && <p className={styles.problem}>{t('editor.error', { message: error })}</p>}
      <div className={styles.dialogActions}>
        <button type="button" className={styles.secondary} onClick={onCancel} disabled={busy}>{t('editor.cancel')}</button>
        <button type="button" className={removes ? styles.danger : styles.primary} onClick={onConfirm} disabled={busy}>
          {busy ? t('editor.saving') : t('editor.confirm')}
        </button>
      </div>
    </dialog>
  );
}
