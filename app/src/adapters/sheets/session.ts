/**
 * The one Sheets connection for this page load: the Google token and the adapter that
 * uses it. Module level, so leaving the Editor and coming back doesn't throw away a
 * token that's still valid (it lives in memory only, about an hour). Kept out of the
 * provider file, which Vite re-runs on hot reloads.
 */
import { GOOGLE_CLIENT_ID, WANDER_DATA_ID } from '../../config.ts';
import { SheetsAdapter } from './adapter.ts';
import { googleSheetsToken } from './googleToken.ts';
import { googleSheetsTransport } from './transport.ts';

export const sheetsToken = googleSheetsToken(GOOGLE_CLIENT_ID);
export const sheetsTransport = googleSheetsTransport(WANDER_DATA_ID, sheetsToken.get);
export const sheetsAdapter = new SheetsAdapter(sheetsTransport);
