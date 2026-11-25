/**
 * The Editor: one screen for every content type, generated from the registry.
 * List (search, filters, trash) | form (fields, child rows, inline problems) | live
 * preview (the real card, and the skill tree for skills). On a phone the three become
 * tabs.
 *
 * Saving sends only what changed. The sheet is read again after each save, so what
 * the Editor shows is always what the sheet holds.
 */
import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { englishKey, validate, type ContentType, type Field, type Problem, type Tables } from '@wander/content';
import { loadContent } from '@wander/rules';
import { ConditionCard, ContentProvider, KeywordCard, SkillCard, SkillTree, TraitCard, useLanguage } from '@wander/ui';
import { CONTENT_TYPES } from '@wander/content';
import { useAuth } from '../auth/AuthProvider.tsx';
import { withId, type RowValues } from '../adapters/sheets/adapter.ts';
import type { CellValue } from '../adapters/sheets/transport.ts';
import { EditorDataProvider, useEditorData } from './EditorData.tsx';
import { offline } from './offline.ts';
import { changedValues, childrenChanged, draftFrom, emptyDraft, isDirty, mergeDraft, PENDING_ID, problemsFor, typeById, type Draft } from './draft.ts';
import { SelectionTools } from './bulk.tsx';
import { toggled, useOpenNotes } from './CardFrame.tsx';
import { CardsView } from './CardsView.tsx';
import { GraphView } from './GraphView.tsx';
import { useSettled, useStableCallback } from './hooks.ts';
import { filterRows, NO_FILTERS, type Filters } from './filters.ts';
import { ListTools } from './ListTools.tsx';
import { keywordCandidates } from './keywordCandidates.ts';
import { PublishButton } from './publish.tsx';
import { TranslationScreen } from './TranslationScreen.tsx';
import { ChildrenEditor, EnglishInput, FieldInput } from './fields.tsx';
import styles from './editor.module.css';

const TYPES = CONTENT_TYPES as readonly ContentType[];
const text = (value: unknown) => (value === null || value === undefined ? '' : String(value).trim());
type View = 'list' | 'cards' | 'graph';
const VIEWS: View[] = ['list', 'cards', 'graph'];

/** Two drafts are the same thing (not just two versions of it) when they're the same row of the same type. */
const sameDraft = (a: { type: ContentType; draft: Draft } | null, b: { type: ContentType; draft: Draft } | null) =>
  a?.type === b?.type && text(a?.draft.values.id) === text(b?.draft.values.id);
const VIEW_KEY = 'wander-editor-view';
/** The view picked last time in this browser, else the list. */
const savedView = (): View => {
  try {
    const saved = localStorage.getItem(VIEW_KEY);
    return VIEWS.find((v) => v === saved) ?? 'list';
  } catch {
    return 'list';
  }
};

/** Today in the browser's time zone, as Sheets dates are written (2026-11-22). */
const today = () => new Date().toLocaleDateString('sv-SE');

export function EditorPage() {
  const { t } = useLanguage();
  const { loading, session, profile } = useAuth();
  // Offline mode only touches an in-memory copy of the local snapshot, so it needs no account.
  if (offline) return <EditorDataProvider><Editor /></EditorDataProvider>;
  if (loading || (session && !profile)) return null;
  if (!session || !profile?.is_admin) {
    return <main className={styles.door}><p>{t(session ? 'editor.adminsOnly' : 'editor.signInFirst')}</p></main>;
  }
  return (
    <EditorDataProvider>
      <Editor />
    </EditorDataProvider>
  );
}

function Editor() {
  const { t } = useLanguage();
  const { tables, loading, error, connect } = useEditorData();
  if (tables) return <Workspace tables={tables} />;
  return (
    <main className={styles.door}>
      <p>{t('editor.connectHint')}</p>
      <button type="button" className={styles.primary} onClick={connect} disabled={loading}>{loading ? t('editor.loading') : t('editor.connect')}</button>
      {error && <p className={styles.problem}>{t('editor.error', { message: error })}</p>}
    </main>
  );
}

type Pane = 'list' | 'edit' | 'preview';
type SaveState = { kind: 'idle' | 'saving' | 'saved' } | { kind: 'error'; message: string };

function Workspace({ tables }: { tables: Tables }) {
  const { language, t } = useLanguage();
  const { adapter, refresh, apply } = useEditorData();
  const [typeId, setTypeId] = useState('skill');
  const [saved, setSaved] = useState<Draft | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saveState, setSaveState] = useState<SaveState>({ kind: 'idle' });
  const [pane, setPane] = useState<Pane>('list');
  const [screen, setScreen] = useState<'type' | 'translations'>('type');
  const [filters, setFilters] = useState<Filters>(NO_FILTERS);
  const [view, setView] = useState<View>(savedView);
  // The selection and the open designer notes are shared by every view, so switching
  // between the list, the cards and the graph keeps them.
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const notes = useOpenNotes();
  // A selection doesn't carry over between the live rows and the Trash.
  useEffect(() => setChecked(new Set()), [filters.trash]);
  const chooseView = (next: View) => {
    setView(next);
    try {
      localStorage.setItem(VIEW_KEY, next);
    } catch {
      // Not remembered, but the switch still happens.
    }
  };
  const type = typeById(typeId);
  // Only skills point at each other, so the graph is a skills view. Other types show
  // their cards instead, and come back to the graph when you return to skills.
  const shown: View = view === 'graph' && type.id !== 'skill' ? 'cards' : view;
  /** Edits that would be lost: what the leave warning asks about. */
  const changed = !!saved && !!draft && isDirty(saved, draft);
  // A new row can be saved even before anything is typed (a keyword made from a candidate arrives filled in).
  const dirty = changed || (!!saved && saved.values.id === PENDING_ID);

  const allProblems = useMemo(() => validate(tables), [tables]);
  // Checking the draft against every rule and rebuilding the preview are the heavy parts
  // (validating the whole sheet), so they run once typing pauses, not once per letter.
  // The draft travels with its type, so a result is never shown for the wrong row.
  const current = useMemo(() => (draft ? { type, draft } : null), [type, draft]);
  const deferred = useSettled(current, 400, sameDraft);
  const problems = useMemo(() => (deferred && deferred.type === type ? problemsFor(tables, deferred.type, deferred.draft) : []), [tables, type, deferred]);

  const leave = useCallback(() => !changed || window.confirm(t('editor.confirmLeave')), [changed, t]);

  const open = (next: Draft) => {
    setSaved(next);
    setDraft(structuredClone(next));
    setSaveState({ kind: 'idle' });
    setPane('edit');
  };
  const select = (id: string) => leave() && open(draftFrom(type, tables, id));
  /** From the Cards view: open the row in the editing layout. */
  const openFromCards = (id: string) => {
    if (!leave()) return;
    open(draftFrom(type, tables, id));
    setView('list');
  };
  /** From the Cards view: a new row, in the editing layout. */
  const createFromCards = () => {
    if (!leave()) return;
    open(emptyDraft(type));
    setView('list');
  };
  const create = (defaults = {}) => leave() && open(emptyDraft(type, defaults));
  const switchType = (id: string) => {
    if (!leave()) return;
    setScreen('type');
    setFilters(NO_FILTERS);
    setChecked(new Set());
    setTypeId(id);
    setSaved(null);
    setDraft(null);
    setPane('list');
  };

  // The list re-renders only when its own props change: these keep one identity, so
  // typing in the form leaves the 260-row list alone.
  const stableSelect = useStableCallback(select);
  const stableCreate = useStableCallback(create);
  const stableAfterBulk = useStableCallback((ids: string[], fresh: Tables | null, removed: boolean) => afterBulk(ids, fresh, removed));

  /** After a bulk action: the open row follows the sheet, or closes if it was deleted for good. */
  const afterBulk = (ids: string[], fresh: Tables | null, removed: boolean) => {
    const open = text(draft?.values.id);
    if (!ids.includes(open)) return;
    if (removed) {
      setSaved(null);
      setDraft(null);
    } else if (fresh && !dirty) {
      const next = draftFrom(type, fresh, open);
      setSaved(next);
      setDraft(structuredClone(next));
    }
  };

  const save = useCallback(async () => {
    if (!draft || !saved || saveState.kind === 'saving') return;
    setSaveState({ kind: 'saving' });
    try {
      const stamp: RowValues = type.fields.some((f) => f.key === 'edited_at') ? { edited_at: today() } : {};
      let id = text(draft.values.id);
      if (id === PENDING_ID || (type.ids.kind === 'manual' && saved.values.id === PENDING_ID)) {
        const { id: given, ...values } = draft.values;
        id = await adapter.create(type.id, { ...values, ...stamp, ...(type.ids.kind === 'manual' ? { id: given } : {}) }, draft.children);
      } else {
        await adapter.update(type.id, id, { ...changedValues(saved, draft), ...stamp }, childrenChanged(saved, draft) ? draft.children : undefined);
      }
      // Show the saved row right away, from what was just written. The sheet is read
      // again in the background for what it computes itself (automatic translations).
      const local = mergeDraft(tables, type, { values: { ...draft.values, ...stamp, id }, children: withId(draft.children, id) });
      apply(local);
      const next = draftFrom(type, local, id);
      setSaved(next);
      setDraft(structuredClone(next));
      setSaveState({ kind: 'saved' });
      void refresh();
    } catch (e) {
      setSaveState({ kind: 'error', message: (e as Error).message });
    }
  }, [adapter, apply, draft, refresh, saveState.kind, saved, tables, type]);

  // Ctrl+S (Cmd+S) saves, and leaving the page with unsaved changes asks first.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        void save();
      }
    };
    const onLeave = (e: BeforeUnloadEvent) => {
      if (changed) e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('beforeunload', onLeave);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('beforeunload', onLeave);
    };
  }, [save, changed]);

  const cardProps = { type, tables, problems: allProblems, filters, onFilters: setFilters, checked, onChecked: setChecked, notes, onOpen: openFromCards, onCreate: createFromCards, onBulkDone: stableAfterBulk };
  const status = saveState.kind === 'saving' ? t('editor.saving') : saveState.kind === 'error' ? t('editor.error', { message: saveState.message }) : dirty ? t('editor.unsaved') : saveState.kind === 'saved' ? t('editor.saved') : '';

  return (
    <main className={styles.workspace}>
      <div className={styles.toolbar}>
        <div className={styles.types} role="tablist">
          {TYPES.map((tp) => (
            <button key={tp.id} type="button" role="tab" aria-selected={screen === 'type' && tp.id === typeId} className={styles.typeTab} onClick={() => switchType(tp.id)}>
              {tp.label.plural[language]}
            </button>
          ))}
          <button type="button" role="tab" aria-selected={screen === 'translations'} className={styles.typeTab} onClick={() => leave() && setScreen('translations')}>
            {t('editor.translations')}
          </button>
        </div>
        {screen === 'type' && (
          <div className={styles.viewToggle} role="group" aria-label={t('editor.view')}>
            {VIEWS.filter((v) => v !== 'graph' || type.id === 'skill').map((v) => (
              <button key={v} type="button" aria-pressed={shown === v} onClick={() => chooseView(v)}>
                {t(v === 'list' ? 'editor.viewList' : v === 'cards' ? 'editor.viewCards' : 'editor.viewGraph')}
              </button>
            ))}
          </div>
        )}
        <PublishButton tables={tables} />
        {/* In the Cards and graph views, Save shows only when a draft is waiting to be saved. */}
        {screen === 'type' && (shown === 'list' || dirty) && <div className={styles.saveBar}>
          <span className={styles.status} data-kind={saveState.kind === 'error' ? 'error' : dirty ? 'dirty' : 'clean'} role="status">{status}</span>
          {dirty && <button type="button" className={styles.secondary} onClick={() => saved && setDraft(structuredClone(saved))}>{t('editor.discard')}</button>}
          <button type="button" className={styles.primary} onClick={save} disabled={!dirty || saveState.kind === 'saving'}>{t('editor.save')}</button>
        </div>}
      </div>

      {screen === 'translations' ? <TranslationScreen tables={tables} /> : shown === 'graph' ? <GraphView {...cardProps} /> : shown === 'cards' ? <CardsView {...cardProps} /> : <>

      <nav className={styles.paneTabs} aria-label="panes">
        {(['list', 'edit', 'preview'] as Pane[]).map((p) => (
          <button key={p} type="button" aria-pressed={pane === p} onClick={() => setPane(p)}>
            {t(p === 'list' ? 'editor.tabList' : p === 'edit' ? 'editor.tabEdit' : 'editor.tabPreview')}
          </button>
        ))}
      </nav>

      <div className={styles.panes} data-pane={pane}>
        <section className={styles.listPane} aria-label={t('editor.tabList')}>
          <List key={type.id} type={type} tables={tables} problems={allProblems} filters={filters} onFilters={setFilters} checked={checked} onChecked={setChecked} selected={text(draft?.values.id)} onSelect={stableSelect} onCreate={stableCreate} onBulkDone={stableAfterBulk} />
        </section>
        <section className={styles.formPane} aria-label={t('editor.tabEdit')}>
          {draft ? <Form type={type} tables={tables} draft={draft} problems={problems} onChange={setDraft} isNew={saved?.values.id === PENDING_ID} /> : <p className={styles.empty}>{t('editor.noSelection')}</p>}
        </section>
        <section className={styles.previewPane} aria-label={t('editor.tabPreview')}>
          {deferred && deferred.type === type && <Preview type={deferred.type} tables={tables} draft={deferred.draft} />}
        </section>
      </div>
      </>}
    </main>
  );
}

/* --- list ------------------------------------------------------------------------ */

const List = memo(function List({ type, tables, problems, filters, onFilters, checked, onChecked, selected, onSelect, onCreate, onBulkDone }: {
  type: ContentType;
  tables: Tables;
  problems: Problem[];
  filters: Filters;
  onFilters: (filters: Filters) => void;
  checked: Set<string>;
  onChecked: (checked: Set<string>) => void;
  selected: string;
  onSelect: (id: string) => void;
  onCreate: (defaults?: RowValues) => void;
  onBulkDone: (ids: string[], fresh: Tables | null, removed: boolean) => void;
}) {
  const { t } = useLanguage();
  const { trash } = filters;
  const has = (key: string) => type.fields.some((f) => f.key === key);
  const counts = useMemo(() => {
    const byId = new Map<string, number>();
    for (const p of problems) byId.set(p.id, (byId.get(p.id) ?? 0) + 1);
    return byId;
  }, [problems]);

  const rows = filterRows(type, tables, filters);

  return (
    <div className={styles.list}>
      <div className={styles.listTools}>
        <ListTools type={type} tables={tables} filters={filters} onFilters={onFilters} count={rows.length} onCreate={() => onCreate()} />
        {type.id === 'keyword' && !trash && <Candidates tables={tables} onCreate={(name, variants) => onCreate({ name_pt: name, variants_pt: variants.join(', ') })} />}
        <SelectionTools type={type} tables={tables} rowIds={rows.map((r) => text(r.id))} checked={checked} onChecked={onChecked} trash={trash} onBulkDone={onBulkDone} />
      </div>
      <ul className={styles.rows}>
        {rows.map((r) => {
          const id = text(r.id);
          const n = counts.get(id) ?? 0;
          return (
            <li key={id} className={styles.rowWrap}>
              <label className={styles.rowCheck}>
                <input type="checkbox" checked={checked.has(id)} onChange={() => onChecked(toggled(checked, id))} aria-label={t('editor.select', { name: text(r[type.nameKey]) || id })} />
              </label>
              <button type="button" className={styles.row} aria-current={id === selected || undefined} onClick={() => onSelect(id)}>
                <span className={styles.rowName}>{text(r[type.nameKey]) || '—'}</span>
                <span className={styles.rowMeta}>
                  {id}
                  {type.listColumns.filter((c) => c !== 'status').map((c) => ` · ${text(r[c])}`)}
                  {has('status') && r.status !== 'official' && <span className={styles.badge}> {t(`status.${text(r.status) || 'draft'}` as 'status.draft')}</span>}
                </span>
                {n > 0 && <span className={styles.problemBadge} title={t('editor.problemCount', { count: n })}>{n}</span>}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
});

/** Capitalized phrases in the descriptions that aren't keywords yet, each a click from being one. */
function Candidates({ tables, onCreate }: { tables: Tables; onCreate: (name: string, variants: string[]) => void }) {
  const { t } = useLanguage();
  const candidates = useMemo(() => keywordCandidates(loadContent(tables)), [tables]);
  if (!candidates.length) return null;
  return (
    <details className={styles.candidates}>
      <summary>{t('editor.candidates', { count: candidates.length })}</summary>
      <ul>
        {candidates.slice(0, 60).map((c) => (
          <li key={c.phrase}>
            <span>
              <strong>{c.phrase}</strong>{c.variants.length > 0 && <span className={styles.muted}> ({c.variants.join(', ')})</span>} <span className={styles.muted}>{t('editor.seenIn', { count: c.count, ids: c.examples.join(', ') })}</span>
            </span>
            <button type="button" className={styles.add} onClick={() => onCreate(c.phrase, c.variants)}>{t('editor.createKeyword')}</button>
          </li>
        ))}
      </ul>
    </details>
  );
}

/* --- form ------------------------------------------------------------------------ */

function Form({ type, tables, draft, problems, onChange, isNew }: {
  type: ContentType;
  tables: Tables;
  draft: Draft;
  problems: Problem[];
  onChange: (draft: Draft) => void;
  isNew: boolean;
}) {
  const { language, t } = useLanguage();
  const id = text(draft.values.id);
  const auto = (field: string) => text(tables.Translations.find((r) => text(r.table) === type.tab && text(r.id) === id && text(r.field) === field)?.auto_en);
  const set = (column: string, value: CellValue) => onChange({ ...draft, values: { ...draft.values, [column]: value } });
  // A problem's detail starts with its column ("level must be..."), which puts it under that field.
  // Child-row columns count too: their problems show under their subtable instead.
  const columns = new Set<string>();
  const collect = (fields: readonly Field[]) => fields.forEach((f) => (f.type === 'subtable' ? collect(f.fields) : columns.add(f.key)));
  collect(type.fields);
  const byColumn = (key: string) => problems.filter((p) => p.detail.split(' ')[0] === key).map((p) => p.detail);
  const general = problems.filter((p) => !columns.has(p.detail.split(' ')[0]));
  const scalar = type.fields.filter((f) => f.type !== 'subtable' && f.type !== 'modifiers' && !f.system);

  return (
    <form className={styles.form} onSubmit={(e) => e.preventDefault()}>
      <h2 className={styles.formTitle}>
        {isNew ? t('editor.newTitle', { type: type.label.singular[language] }) : text(draft.values[type.nameKey]) || id}
        <span className={styles.muted}> {isNew && type.ids.kind === 'counter' ? t('editor.idLater') : id}</span>
      </h2>
      {isNew && type.ids.kind === 'manual' && (
        <FieldInput field={{ key: 'id', type: 'text', required: true, label: { pt: 'ID', en: 'ID' } }} value={id === PENDING_ID ? '' : id} tables={tables} onChange={(v) => set('id', text(v).toUpperCase() || PENDING_ID)} />
      )}
      {general.length > 0 && (
        <ul className={styles.problems} aria-label={t('editor.problems')}>
          {general.map((p, i) => <li key={i}>{p.problem}: {p.detail}</li>)}
        </ul>
      )}
      <div className={styles.fields}>
        {scalar.map((field) => (
          <div key={field.key} className={field.type === 'richtext' ? styles.wide : undefined}>
            <FieldInput field={field} value={draft.values[field.key] ?? ''} tables={tables} problems={byColumn(field.key)} onChange={(v) => set(field.key, v)} />
            {field.translatable && <EnglishInput field={field} value={draft.values[englishKey(field)] ?? ''} auto={auto(field.key)} onChange={(v) => set(englishKey(field), v)} />}
          </div>
        ))}
      </div>
      <ChildrenEditor fields={type.fields} parentId={id} children={draft.children} tables={tables} problems={problems.map((p) => p.detail)} onChange={(children) => onChange({ ...draft, children })} />
    </form>
  );
}

/* --- preview --------------------------------------------------------------------- */

function Preview({ type, tables, draft }: { type: ContentType; tables: Tables; draft: Draft }) {
  const { t } = useLanguage();
  const content = useMemo(() => loadContent(mergeDraft(tables, type, draft), { includeDeleted: true }), [tables, type, draft]);
  const id = text(draft.values.id);
  let card = null;
  if (type.id === 'skill') {
    const skill = content.skillsById.get(id);
    card = skill && (
      <>
        <SkillCard skill={skill} />
        {skill.discipline_id && <div className={styles.miniTree}><SkillTree disciplineId={skill.discipline_id} selected={id} /></div>}
      </>
    );
  } else if (type.id === 'condition') {
    const c = content.condition.find((x) => x.id === id);
    card = c && <ConditionCard condition={c} />;
  } else if (type.id === 'trait') {
    const tr = content.trait.find((x) => x.id === id);
    card = tr && <TraitCard trait={tr} />;
  } else if (type.id === 'keyword') {
    const k = content.keyword.find((x) => x.id === id);
    card = k && <KeywordCard keyword={k} />;
  } else {
    card = <h3>{text(draft.values.name)}</h3>;
  }
  return <ContentProvider content={content}>{card ?? <p className={styles.empty}>{t('editor.saveFirst')}</p>}</ContentProvider>;
}
