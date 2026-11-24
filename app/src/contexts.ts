/**
 * The app's React contexts, each created once, in a file that imports no data. Vite's
 * React plugin re-runs a whole file that exports a hook (useAuth, useEditorData) when
 * it or anything it imports changes, and a context created in such a file would be
 * created again, leaving components holding the old one without a provider.
 */
import type { Session } from '@supabase/supabase-js';
import { createContext } from 'react';
import type { Tables } from '@wander/content';
import type { SheetsAdapter } from './adapters/sheets/adapter.ts';

export interface Profile {
  display_name: string;
  is_admin: boolean;
  language: 'pt' | 'en' | null;
  theme: 'dark' | 'light' | null;
}

export interface AuthState {
  /** Still finding out whether someone is signed in. */
  loading: boolean;
  session: Session | null;
  profile: Profile | null;
  error: string | null;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
}

export interface EditorDataState {
  adapter: SheetsAdapter;
  tables: Tables | null;
  loading: boolean;
  error: string | null;
  connect: () => Promise<void>;
  reload: () => Promise<Tables | null>;
  /** Re-reads the sheet without a loading state (after a save). */
  refresh: () => Promise<void>;
  /** Shows these tables right away (the result of a save, before the re-read). */
  apply: (tables: Tables) => void;
}

export const AuthContext = createContext<AuthState | null>(null);
export const EditorDataContext = createContext<EditorDataState | null>(null);
