/**
 * The Editor's connection to Wander Data: the adapter and the last read of every tab.
 * The first connect has to come from a click (Google's popup). After that, every save
 * reads the sheet again, so the Editor always shows what the sheet has, and coming back
 * to the Editor while the token is still valid reconnects without asking.
 */
import { useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Tables } from '@wander/content';
import { sheetsAdapter, sheetsToken } from '../adapters/sheets/session.ts';
import { EditorDataContext } from '../contexts.ts';

export function EditorDataProvider({ children }: { children: ReactNode }) {
  const adapter = sheetsAdapter;
  const [tables, setTables] = useState<Tables | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
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

  const connect = useCallback(async () => {
    try {
      await sheetsToken.get();
      await reload();
    } catch (e) {
      setError((e as Error).message);
    }
  }, [reload]);

  // Back on the Editor with a token that's still valid: read the sheet straight away.
  useEffect(() => {
    if (sheetsToken.connected()) void reload();
  }, [reload]);

  const value = useMemo(() => ({ adapter, tables, loading, error, connect, reload }), [adapter, tables, loading, error, connect, reload]);
  return <EditorDataContext.Provider value={value}>{children}</EditorDataContext.Provider>;
}

export function useEditorData() {
  const state = useContext(EditorDataContext);
  if (!state) throw new Error('useEditorData needs an <EditorDataProvider> above it');
  return state;
}
