/**
 * Who is signed in, and their profile. Sign-in goes through Supabase Auth with Google.
 *
 * The profile's language and theme follow the person between devices: when they sign
 * in, a saved choice is applied, and changing a toggle while signed in saves it. The
 * profile row comes from the profiles table, which Row Level Security limits to the
 * person's own row (supabase/migrations).
 */
import type { Session } from '@supabase/supabase-js';
import { useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useLanguage, useTheme } from '@wander/ui';
import { AuthContext, type Profile } from '../contexts.ts';
import { supabase } from './supabase.ts';

export type { Profile };

export function AuthProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { language, setLanguage } = useLanguage();
  const { theme, setTheme } = useTheme();

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    const { data } = supabase.auth.onAuthStateChange((_, next) => setSession(next));
    return () => data.subscription.unsubscribe();
  }, []);

  const userId = session?.user.id;
  // Set once a profile's saved choices have been applied, so saving starts only after.
  const applied = useRef<string | null>(null);

  useEffect(() => {
    applied.current = null;
    if (!userId) {
      setProfile(null);
      return;
    }
    let cancelled = false;
    supabase
      .from('profiles')
      .select('display_name, is_admin, language, theme')
      .eq('id', userId)
      .single<Profile>()
      .then(({ data, error: failure }) => {
        if (cancelled) return;
        if (failure) return setError(failure.message);
        setProfile(data);
        if (data.language) setLanguage(data.language);
        if (data.theme) setTheme(data.theme);
        applied.current = userId;
      });
    return () => {
      cancelled = true;
    };
  }, [userId, setLanguage, setTheme]);

  // A toggle changed while signed in: save it to the profile.
  useEffect(() => {
    if (!userId || applied.current !== userId || !profile) return;
    if (profile.language === language && profile.theme === theme) return;
    setProfile({ ...profile, language, theme });
    supabase.from('profiles').update({ language, theme }).eq('id', userId).then(({ error: failure }) => failure && setError(failure.message));
  }, [userId, profile, language, theme]);

  const signIn = useCallback(async () => {
    const { error: failure } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}${import.meta.env.BASE_URL}` },
    });
    if (failure) setError(failure.message);
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
  }, []);

  const value = useMemo(() => ({ loading, session, profile, error, signIn, signOut }), [loading, session, profile, error, signIn, signOut]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const state = useContext(AuthContext);
  if (!state) throw new Error('useAuth needs an <AuthProvider> above it');
  return state;
}
