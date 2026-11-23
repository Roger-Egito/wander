/**
 * The Editor's connection to Wander Data: the Google token, the adapter, and the last
 * read of every tab. The first connect has to come from a click (Google's popup), after
 * that every save reads the sheet again, so the Editor always shows what the sheet has.
 */
import { useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { EditorDataContext } from '../contexts.ts';
import type { Tables } from '@wander/content';
import { SheetsAdapter } from '../adapters/sheets/adapter.ts';
import { googleSheetsToken } from '../adapters/sheets/googleToken.ts';
import { googleSheetsTransport } from '../adapters/sheets/transport.ts';
import { GOOGLE_CLIENT_ID, WANDER_DATA_ID } from '../config.ts';

export function EditorDataProvider({ children }: { children: ReactNode }) {
  const token = useMemo(() => googleSheetsToken(GOOGLE_CLIENT_ID), []);
  const adapter = useMemo(() => new SheetsAdapter(googleSheetsTransport(WANDER_DATA_ID, token.get)), [token]);
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
      await token.get();
      await reload();
    } catch (e) {
      setError((e as Error).message);
    }
  }, [token, reload]);

  const value = useMemo(() => ({ adapter, tables, loading, error, connect, reload }), [adapter, tables, loading, error, connect, reload]);
  return <EditorDataContext.Provider value={value}>{children}</EditorDataContext.Provider>;
}

export function useEditorData() {
  const state = useContext(EditorDataContext);
  if (!state) throw new Error('useEditorData needs an <EditorDataProvider> above it');
  return state;
}
