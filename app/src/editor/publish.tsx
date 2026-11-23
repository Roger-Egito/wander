/**
 * "Publicar versão": a row in Releases with the version and its notes. The version is
 * pre-filled with a patch bump of the last one (content releases are patches), keeping
 * the -beta label while Wander is in playtest.
 */
import { useEffect, useRef, useState } from 'react';
import type { Tables } from '@wander/content';
import { useLanguage } from '@wander/ui';
import { useEditorData } from './EditorData.tsx';
import { nextVersion } from './keywordCandidates.ts';
import styles from './editor.module.css';

export function PublishButton({ tables }: { tables: Tables }) {
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  return (
    <>
      <button type="button" className={styles.secondary} onClick={() => setOpen(true)}>{t('editor.publish')}</button>
      {done && <span className={styles.status} role="status">{t('editor.published', { version: done })}</span>}
      {open && <PublishDialog tables={tables} onClose={(version) => { setOpen(false); if (version) setDone(version); }} />}
    </>
  );
}

function PublishDialog({ tables, onClose }: { tables: Tables; onClose: (published: string | null) => void }) {
  const { t } = useLanguage();
  const { adapter, reload } = useEditorData();
  const dialog = useRef<HTMLDialogElement>(null);
  const [version, setVersion] = useState(() => nextVersion(tables.Releases.map((r) => String(r.version ?? ''))));
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    dialog.current?.showModal();
  }, []);

  async function publish() {
    setBusy(true);
    setError(null);
    try {
      await adapter.publishRelease(version.trim(), notes.trim());
      await reload();
      onClose(version.trim());
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <dialog ref={dialog} className={styles.dialog} onCancel={(e) => { e.preventDefault(); if (!busy) onClose(null); }}>
      <p className={styles.dialogMessage}>{t('editor.publish')}</p>
      <div className={styles.field}>
        <label className={styles.label} htmlFor="release-version">{t('editor.version')}</label>
        <input id="release-version" className={styles.input} value={version} onChange={(e) => setVersion(e.target.value)} />
        <p className={styles.muted}>{t('editor.betaHint')}</p>
      </div>
      <div className={styles.field}>
        <label className={styles.label} htmlFor="release-notes">{t('editor.notes')}</label>
        <textarea id="release-notes" className={styles.textarea} rows={4} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>
      <p className={styles.muted}>{t('editor.publishHint')}</p>
      {error && <p className={styles.problem}>{t('editor.error', { message: error })}</p>}
      <div className={styles.dialogActions}>
        <button type="button" className={styles.secondary} onClick={() => onClose(null)} disabled={busy}>{t('editor.cancel')}</button>
        <button type="button" className={styles.primary} onClick={publish} disabled={busy || !version.trim()}>{busy ? t('editor.saving') : t('editor.publish')}</button>
      </div>
    </dialog>
  );
}
