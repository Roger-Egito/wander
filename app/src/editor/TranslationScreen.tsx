/**
 * The Translation screen: every text a player reads, with its English. Filter by type
 * and state (manual, outdated, automatic, not translated), start from the automatic
 * translation, and save. Saving writes the row's English column and remembers the
 * Portuguese it was written for, so a later change to the Portuguese marks it outdated.
 */
import { useMemo, useState } from 'react';
import { CONTENT_TYPES, type ContentType, type Tables } from '@wander/content';
import { useLanguage } from '@wander/ui';
import { useEditorData } from './EditorData.tsx';
import { translationEntries, type TranslationEntry, type TranslationState } from './translations.ts';
import styles from './editor.module.css';

const STATES: TranslationState[] = ['outdated', 'missing', 'auto', 'manual'];
const PAGE = 40;
const fold = (value: string) => value.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();

export function TranslationScreen({ tables }: { tables: Tables }) {
  const { language, t } = useLanguage();
  const entries = useMemo(() => translationEntries(tables), [tables]);
  const [type, setType] = useState('');
  const [state, setState] = useState<string>('');
  const [search, setSearch] = useState('');
  const [shown, setShown] = useState(PAGE);
  const q = fold(search);
  const filtered = entries.filter(
    (e) => (!type || e.type === type) && (!state || e.state === state) && (!q || fold(e.pt).includes(q) || fold(e.en).includes(q) || fold(e.context).includes(q) || fold(e.id).includes(q)),
  );

  return (
    <section className={styles.translations}>
      <div className={styles.listTools}>
        <input className={styles.input} type="search" placeholder={t('editor.search')} value={search} onChange={(e) => { setSearch(e.target.value); setShown(PAGE); }} />
        <div className={styles.filters}>
          <select className={styles.input} value={type} onChange={(e) => { setType(e.target.value); setShown(PAGE); }} aria-label={t('tr.allTypes')}>
            <option value="">{t('tr.allTypes')}</option>
            {(CONTENT_TYPES as readonly ContentType[]).map((tp) => <option key={tp.id} value={tp.id}>{tp.label.plural[language]}</option>)}
            <option value="lookup">{t('tr.lookup')}</option>
          </select>
          <select className={styles.input} value={state} onChange={(e) => { setState(e.target.value); setShown(PAGE); }} aria-label={t('tr.allStates')}>
            <option value="">{t('tr.allStates')}</option>
            {STATES.map((s) => <option key={s} value={s}>{t(`tr.state.${s}`)} ({entries.filter((e) => e.state === s).length})</option>)}
          </select>
        </div>
        <span className={styles.muted}>{t('tr.count', { count: filtered.length })}</span>
      </div>
      <ul className={styles.translationList}>
        {filtered.slice(0, shown).map((e) => <EntryRow key={`${e.table}|${e.id}|${e.field}`} entry={e} />)}
      </ul>
      {filtered.length > shown && (
        <button type="button" className={styles.add} onClick={() => setShown((n) => n + PAGE)}>{t('tr.more', { count: filtered.length - shown })}</button>
      )}
    </section>
  );
}

function EntryRow({ entry }: { entry: TranslationEntry }) {
  const { language, t } = useLanguage();
  const { adapter, reload } = useEditorData();
  const [en, setEn] = useState(entry.en);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const long = entry.pt.length > 80;

  async function save() {
    setBusy(true);
    setError(null);
    try {
      await adapter.saveTranslation({ table: entry.table, id: entry.id, field: entry.field, enColumn: entry.enColumn, en: en.trim(), pt: entry.pt, keyColumn: entry.keyColumn });
      await reload();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className={styles.translation} data-state={entry.state}>
      <div className={styles.translationHead}>
        <strong>{entry.context}</strong>
        <span className={styles.muted}> · {entry.label[language]} · {entry.id}</span>
        <span className={styles.stateBadge} data-state={entry.state}>{t(`tr.state.${entry.state}`)}</span>
      </div>
      <p className={styles.translationText}><span className={styles.label}>{t('tr.portuguese')}</span>{entry.pt}</p>
      {entry.auto && <p className={styles.translationText}><span className={styles.label}>{t('tr.automatic')}</span>{entry.auto}</p>}
      {entry.state === 'outdated' && <p className={styles.problem}>{t('tr.wasFor', { text: entry.manualFrom })}</p>}
      <label className={styles.label} htmlFor={`en-${entry.table}-${entry.id}-${entry.field}`}>{t('tr.english')}</label>
      {long ? (
        <textarea id={`en-${entry.table}-${entry.id}-${entry.field}`} className={styles.textarea} rows={3} value={en} onChange={(e) => setEn(e.target.value)} />
      ) : (
        <input id={`en-${entry.table}-${entry.id}-${entry.field}`} className={styles.input} value={en} onChange={(e) => setEn(e.target.value)} />
      )}
      <div className={styles.bulkRow}>
        {entry.auto && <button type="button" className={styles.secondary} onClick={() => setEn(entry.auto)}>{t('tr.useAuto')}</button>}
        <button type="button" className={styles.primary} onClick={save} disabled={busy || (en.trim() === entry.en && entry.state !== 'outdated')}>
          {busy ? t('editor.saving') : t('tr.save')}
        </button>
      </div>
      {error && <p className={styles.problem}>{t('editor.error', { message: error })}</p>}
    </li>
  );
}
