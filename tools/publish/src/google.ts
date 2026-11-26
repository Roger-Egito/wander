/**
 * Reading Wander Data as the service account, in the workflow. The account has view-only
 * access to the sheet. There is no key: the workflow logs in without one through Workload
 * Identity Federation (google-github-actions/auth, which trusts only runs from this
 * repository) and passes the access token in GOOGLE_ACCESS_TOKEN. Google blocks
 * service account keys on this project's Cloud organization ("secure by default"), and a
 * key would be a long-lived secret anyway.
 */
import { rowsFromValues, TABS, type CellValue, type TabName, type Tables } from '@wander/content';

/** Every tab of Wander Data in one values.batchGet, rows keyed by header (rows.ts). */
export async function readTables(spreadsheetId: string, token: string, fetchImpl: typeof fetch = fetch): Promise<Tables> {
  const tabs = Object.keys(TABS) as TabName[];
  const ranges = tabs.map((tab) => `ranges=${encodeURIComponent(`'${tab}'`)}`).join('&');
  const response = await fetchImpl(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchGet?${ranges}&valueRenderOption=UNFORMATTED_VALUE`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const body = (await response.json().catch(() => ({}))) as { valueRanges?: { values?: CellValue[][] }[]; error?: { message?: string } };
  if (!response.ok || !body.valueRanges) throw new Error(`Sheets API ${response.status}: ${body.error?.message ?? 'no values'}`);
  return Object.fromEntries(tabs.map((tab, i) => [tab, rowsFromValues(body.valueRanges![i]?.values ?? [])])) as Tables;
}
