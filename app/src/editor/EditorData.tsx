/**
 * The Editor's connection to Wander Data: the adapter and the last read of every tab.
 * The first connect has to come from a click (Google's popup). Coming back to the
 * Editor while the token is still valid reconnects without asking.
 *
 * After a save the Editor shows the result straight away (apply), from what it just
 * wrote, and reads the sheet again in the background (refresh) to pick up anything the
 * sheet computes itself, like the automatic translations.
 *
 * On the dev server, /editor?offline runs the Editor against an in-memory copy of the
 * local snapshot: nothing is read from or written to the real sheet. Used to test and
 * measure the Editor without signing in. It never reaches the deployed build.
 */
import { useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Tables } from '@wander/content';
import type { SheetsAdapter } from '../adapters/sheets/adapter.ts';
import { sheetsAdapter, sheetsToken } from '../adapters/sheets/session.ts';
import { EditorDataContext } from '../contexts.ts';
import { offline } from './offline.ts';


async function offlineAdapter(): Promise<SheetsAdapter> {
  const [{ SheetsAdapter }, { FakeSheets }, { devTables }] = await Promise.all([
    import('../adapters/sheets/adapter.ts'),
    import('../adapters/sheets/fake.ts'),
    import('../dev/devContent.ts'),
  ]);
  if (!devTables) throw new Error('no local snapshot: run npm run snapshot first');
  return new SheetsAdapter(new FakeSheets(devTables));
}

export function EditorDataProvider({ children }: { children: ReactNode }) {
  const [adapter, setAdapter] = useState<SheetsAdapter | null>(offline ? null : sheetsAdapter);
  const [tables, setTables] = useState<Tables | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!adapter) return null;
    setLoading(true);
    setError(null);
    try {
      const next = await adapter.readAll();
      setTables(next);
      return next;
    } catch (e) {
      setError((e as Error).message);
      return null;
    } finally {
      setLoading(false);
    }
  }, [adapter]);

  // Counts saves shown with apply. A re-read that started before the latest save is
  // older than what's on screen (two quick saves), so its result is dropped.
  const applied = useRef(0);
  const apply = useCallback((next: Tables) => {
    applied.current++;
    setTables(next);
  }, []);

  /** A quiet re-read: no loading state, and a failure leaves what's on screen. */
  const refresh = useCallback(async () => {
    if (!adapter) return;
    const startedAfter = applied.current;
    try {
      const next = await adapter.readAll();
      if (applied.current === startedAfter) setTables(next);
    } catch {
      // The next save or reload tries again.
    }
  }, [adapter]);

  const connect = useCallback(async () => {
    try {
      await sheetsToken.get();
      await reload();
    } catch (e) {
      setError((e as Error).message);
    }
  }, [reload]);

  useEffect(() => {
    if (offline) {
      if (!adapter) offlineAdapter().then(setAdapter, (e: Error) => setError(e.message));
      else void reload();
      return;
    }
    // Back on the Editor with a token that's still valid: read the sheet straight away.
    if (sheetsToken.connected()) void reload();
  }, [adapter, reload]);

  const value = useMemo(
    () => (adapter ? { adapter, tables, loading, error, connect, reload, refresh, apply } : null),
    [adapter, tables, loading, error, connect, reload, refresh, apply],
  );
  if (!value) return error ? <p role="alert">{error}</p> : null;
  return <EditorDataContext.Provider value={value}>{children}</EditorDataContext.Provider>;
}

export function useEditorData() {
  const state = useContext(EditorDataContext);
  if (!state) throw new Error('useEditorData needs an <EditorDataProvider> above it');
  return state;
}
