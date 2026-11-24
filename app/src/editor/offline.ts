/**
 * Offline mode: /editor?offline runs the Editor against an in-memory copy of the local
 * snapshot, without signing in, reading or writing the real sheet. Allowed on the dev
 * server, and in a local production build made with VITE_OFFLINE_BUILD=true (to measure
 * the real build). The deploy workflow never sets that, so the published site can't use it.
 */
const allowed = import.meta.env.DEV || import.meta.env.VITE_OFFLINE_BUILD === 'true';

export const offline = allowed && typeof location !== 'undefined' && new URLSearchParams(location.search).has('offline');
