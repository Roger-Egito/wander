import { createClient } from '@supabase/supabase-js';
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from '../config.ts';

/**
 * The one Supabase client. PKCE: after Google, Supabase sends the browser back with a
 * one-time code that supabase-js exchanges for a session, so no token ever sits in the
 * address bar.
 */
export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: { flowType: 'pkce', detectSessionInUrl: true, persistSession: true },
});
