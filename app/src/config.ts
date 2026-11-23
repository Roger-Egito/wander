/**
 * Public settings. None of these are secrets: the Supabase publishable key only does
 * what Row Level Security allows, and a Google OAuth client ID is meant to be seen by the
 * browser. Secrets (the database password, the service key, the Supabase sign-in
 * client's secret) never come near this repo.
 */
export const SUPABASE_URL = 'https://afoxmfmhwgrfhogeyvbh.supabase.co';
export const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_yc_P_DGrjXtPmz3pmp1-fQ_2n6e9stN';

/** The Editor's own Google client, for Sheets access (M5). */
export const GOOGLE_CLIENT_ID = '668394338828-rb8t3rhctgm48m63ns8g5i5i63b8u03v.apps.googleusercontent.com';

/**
 * The Wander Data spreadsheet. Its ID alone opens nothing: the sheet is shared with
 * my account only, so the Sheets API refuses anyone else's token.
 */
export const WANDER_DATA_ID = '11udxO7nqDL_G4JkQbxD33g8QMR9KgMxPk_6XaCGBqvM';
