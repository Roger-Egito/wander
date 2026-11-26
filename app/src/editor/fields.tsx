/**
 * One control per field type, so the form is generated from the content types:
 * text and links are inputs, rich text a textarea, numbers number inputs, enums and
 * references dropdowns (with type-ahead when there are many options), tags chips,
 * subtables a list of child rows, modifiers a list of stat changes.
 */
import { memo, useId } from 'react';
import { englishKey, type Field, type Tables } from '@wander/content';
import { useLanguage } from '@wander/ui';
import type { ChildRow, Children } from '../adapters/sheets/adapter.ts';
import type { CellValue } from '../adapters/sheets/transport.ts';
import { columnsOf, nextChildId } from './draft.ts';
import { groupRuns, optionsFor, type Option } from './options.ts';
import styles from './editor.module.css';

const text = (value: unknown) => (value === null || value === undefined ? '' : String(value));

/**
 * A long list of choices for type-ahead. Its options come from the cache, so it re-renders
 * only after a new read of the sheet. A datalist can't show group headings, so each
 * option starts with its group ("Nível 2 · ARC-05 · ...").
 */
const OptionList = memo(function OptionList({ id, options }: { id: string; options: Option[] }) {
  const { language } = useLanguage();
  return <datalist id={id}>{options.map((o) => <option key={o.value} value={o.value}>{o.group ? `${o.group[language]} · ${o.label}` : o.label}</option>)}</datalist>;
});

/** The <option>s of a dropdown, under a heading per group when the options have groups. */
export function Options({ options }: { options: Option[] }) {
  const { language } = useLanguage();
  return (
    <>
      {groupRuns(options).map((run, i) => {
        const items = run.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>);
        return run.group ? <optgroup key={i} label={run.group[language]}>{items}</optgroup> : items;
      })}
    </>
  );
}

/** A number input's value: a number when it reads as one, else the text (so validation can say why). */
const toNumber = (raw: string): CellValue => (raw.trim() === '' ? '' : Number.isNaN(Number(raw.replace(',', '.'))) ? raw : Number(raw.replace(',', '.')));

interface FieldProps {
  field: Field;
  value: CellValue;
  onChange: (value: CellValue) => void;
  tables: Tables;
  problems?: string[];
  compact?: boolean;
}

export function FieldInput({ field, value, onChange, tables, problems = [], compact }: FieldProps) {
  const { language, t } = useLanguage();
  const id = useId();
  const label = field.label[language];
  const options = optionsFor(field, tables);
  let control;

  if (field.type === 'richtext') {
    control = <textarea id={id} className={styles.textarea} value={text(value)} onChange={(e) => onChange(e.target.value)} rows={compact ? 2 : 5} />;
  } else if (field.type === 'number') {
    control = <input id={id} className={styles.input} inputMode="decimal" value={text(value)} onChange={(e) => onChange(toNumber(e.target.value))} />;
  } else if (field.type === 'boolean') {
    control = <input id={id} type="checkbox" className={styles.checkbox} checked={value === true} onChange={(e) => onChange(e.target.checked)} />;
  } else if (field.type === 'tags') {
    control = <TagsInput id={id} value={text(value)} options={options} onChange={onChange} />;
  } else if (options && options.length > 30) {
    // Many choices (skills, levels): type to filter.
    const list = `${id}-list`;
    control = (
      <>
        <input id={id} className={styles.input} list={list} value={text(value)} onChange={(e) => onChange(e.target.value.split(' · ')[0])} placeholder={t('editor.choose')} />
        <OptionList id={list} options={options} />
        {/* The field holds only the ID, so say which row it is. */}
        {options.find((o) => o.value === text(value)) && <span className={styles.hint}>{options.find((o) => o.value === text(value))!.label}</span>}
      </>
    );
  } else if (options) {
    control = (
      <select id={id} className={styles.input} value={text(value)} onChange={(e) => onChange(e.target.value)}>
        <option value="">{field.required ? t('editor.choose') : '—'}</option>
        <Options options={options} />
        {text(value) && !options.some((o) => o.value === text(value)) && <option value={text(value)}>{text(value)} (?)</option>}
      </select>
    );
  } else {
    control = <input id={id} className={styles.input} type={field.type === 'url' ? 'url' : 'text'} value={text(value)} onChange={(e) => onChange(e.target.value)} />;
  }

  return (
    <div className={compact ? styles.fieldCompact : styles.field} data-invalid={problems.length > 0 || undefined}>
      <label htmlFor={id} className={styles.label}>
        {label}
        {field.required && <span className={styles.required} aria-hidden> *</span>}
      </label>
      {control}
      {problems.map((p) => <p key={p} className={styles.problem}>{p}</p>)}
    </div>
  );
}

/** The English column of a translatable field, with the automatic translation as its placeholder. */
export function EnglishInput({ field, value, auto, onChange }: { field: Field; value: CellValue; auto: string; onChange: (value: CellValue) => void }) {
  const { language, t } = useLanguage();
  const id = useId();
  const long = field.type === 'richtext';
  const props = { id, className: long ? styles.textarea : styles.input, value: text(value), placeholder: auto ? t('editor.autoHint', { text: auto }) : '', onChange: (e: { target: { value: string } }) => onChange(e.target.value) };
  return (
    <div className={styles.english}>
      <label htmlFor={id} className={styles.label}>{field.label[language]} · {t('editor.english')}</label>
      {long ? <textarea {...props} rows={3} /> : <input {...props} />}
    </div>
  );
}

function TagsInput({ id, value, options, onChange }: { id: string; value: string; options: Option[] | null; onChange: (value: CellValue) => void }) {
  const { t } = useLanguage();
  const tags = value.split(',').map((s) => s.trim()).filter(Boolean);
  const set = (next: string[]) => onChange(next.join(', '));
  return (
    <div className={styles.tags}>
      {tags.map((tag) => (
        <span key={tag} className={styles.tag}>
          {tag}
          <button type="button" aria-label={`${t('editor.removeRow')} ${tag}`} onClick={() => set(tags.filter((x) => x !== tag))}>×</button>
        </span>
      ))}
      {options ? (
        <select id={id} className={styles.tagAdd} value="" onChange={(e) => e.target.value && set([...tags, e.target.value])}>
          <option value="">+ {t('editor.addRow')}</option>
          <Options options={options.filter((o) => !tags.includes(o.value))} />
        </select>
      ) : (
        <input
          id={id}
          className={styles.tagAdd}
          placeholder={`+ ${t('editor.addRow')}`}
          onKeyDown={(e) => {
            const input = e.currentTarget;
            if ((e.key === 'Enter' || e.key === ',') && input.value.trim()) {
              e.preventDefault();
              set([...tags, input.value.trim()]);
              input.value = '';
            }
          }}
        />
      )}
    </div>
  );
}

/* --- child rows ------------------------------------------------------------------ */

/** A new child row: a level gets its next ID, a requirement starts in group 1. */
function newChild(field: Extract<Field, { type: 'subtable' }>, parentId: string, siblings: ChildRow[]): ChildRow {
  const row: ChildRow = Object.fromEntries(columnsOf(field.fields).map((c) => [c, '']));
  if ('group' in row) row.group = 1;
  if (field.childIds) {
    row.id = nextChildId(parentId, siblings);
    const nested: Children = {};
    for (const f of field.fields) {
      if (f.type === 'subtable') nested[f.key] = [];
      if (f.type === 'modifiers') nested.modifiers = [];
    }
    row.children = nested;
  }
  return row;
}

export function ChildrenEditor({ fields, parentId, children, onChange, tables, problems }: {
  fields: readonly Field[];
  parentId: string;
  children: Children;
  onChange: (children: Children) => void;
  tables: Tables;
  problems?: string[];
}) {
  const { language, t } = useLanguage();
  return (
    <>
      {fields.map((field) => {
        if (field.type === 'modifiers') {
          return <ModifiersEditor key="modifiers" rows={children.modifiers ?? []} tables={tables} onChange={(rows) => onChange({ ...children, modifiers: rows })} />;
        }
        if (field.type !== 'subtable') return null;
        const rows = children[field.key] ?? [];
        const set = (next: ChildRow[]) => onChange({ ...children, [field.key]: next });
        const update = (i: number, row: ChildRow) => set(rows.map((r, j) => (j === i ? row : r)));
        return (
          <fieldset key={field.key} className={styles.subtable}>
            <legend className={styles.legend}>{field.label[language]}</legend>
            {rows.map((row, i) => (
              <div key={String(row.id ?? i)} className={styles.childRow}>
                {row.id && <span className={styles.childId}>{String(row.id)}</span>}
                <div className={styles.childFields}>
                  {field.fields.filter((f) => f.type !== 'subtable' && f.type !== 'modifiers').map((f) => (
                    <div key={f.key} className={f.type === 'richtext' ? styles.childWide : undefined}>
                      <FieldInput compact field={f} value={(row[f.key] as CellValue) ?? ''} tables={tables} onChange={(v) => update(i, { ...row, [f.key]: v })} />
                      {f.translatable && (
                        <EnglishInput field={f} value={(row[englishKey(f)] as CellValue) ?? ''} auto="" onChange={(v) => update(i, { ...row, [englishKey(f)]: v })} />
                      )}
                    </div>
                  ))}
                </div>
                {field.childIds && row.children && (
                  <div className={styles.nested}>
                    <ChildrenEditor fields={field.fields} parentId={String(row.id)} children={row.children} tables={tables} onChange={(nested) => update(i, { ...row, children: nested })} />
                  </div>
                )}
                <button type="button" className={styles.remove} onClick={() => set(rows.filter((_, j) => j !== i))}>{t('editor.removeRow')}</button>
              </div>
            ))}
            <button type="button" className={styles.add} onClick={() => set([...rows, newChild(field, parentId, rows)])}>+ {t('editor.addRow')}</button>
            {problems?.filter((p) => field.fields.some((f) => p.startsWith(f.key))).map((p) => <p key={p} className={styles.problem}>{p}</p>)}
          </fieldset>
        );
      })}
    </>
  );
}

function ModifiersEditor({ rows, onChange, tables }: { rows: ChildRow[]; onChange: (rows: ChildRow[]) => void; tables: Tables }) {
  const { t } = useLanguage();
  const stats = tables.Stats.map((s) => text(s.code)).filter(Boolean).sort((a, b) => a.localeCompare(b, 'pt'));
  const update = (i: number, row: ChildRow) => onChange(rows.map((r, j) => (j === i ? row : r)));
  return (
    <fieldset className={styles.subtable}>
      <legend className={styles.legend}>{t('card.modifiers')}</legend>
      {rows.map((row, i) => (
        <div key={i} className={styles.modifier}>
          <select className={styles.input} aria-label="stat" value={text(row.stat)} onChange={(e) => update(i, { ...row, stat: e.target.value })}>
            <option value="">{t('editor.choose')}</option>
            {stats.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <input className={styles.input} aria-label="value" inputMode="decimal" value={text(row.value)} onChange={(e) => update(i, { ...row, value: toNumber(e.target.value) })} />
          <label className={styles.inline}>
            <input type="checkbox" checked={row.temporary === true} onChange={(e) => update(i, { ...row, temporary: e.target.checked })} /> {t('card.temporary')}
          </label>
          <button type="button" className={styles.remove} onClick={() => onChange(rows.filter((_, j) => j !== i))}>{t('editor.removeRow')}</button>
        </div>
      ))}
      <button type="button" className={styles.add} onClick={() => onChange([...rows, { stat: '', value: '', temporary: false }])}>+ {t('editor.addRow')}</button>
    </fieldset>
  );
}
