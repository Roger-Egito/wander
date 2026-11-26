/**
 * The snapshot workflow's step (.github/workflows/publish.yml): publish the newest
 * release in Wander Data when it's higher than the one on the site.
 *
 *   node tools/publish/src/main.ts            the workflow: reads the sheet, writes the
 *                                             public snapshot, uploads the alpha one
 *   node tools/publish/src/main.ts --local    reads app/dev-data and writes to a scratch
 *                                             folder, with no upload: for trying it out
 *     --release 0.1.0-beta                    (local only) as if Releases had this row
 *
 * Writes app/public/data/rules-<version>.json (every version is kept, so a character
 * can be updated from the version it was built on) and app/public/data/version.json.
 * Exits with an error, writing nothing, when the release has errors (release.ts).
 * Tells the workflow what happened through GITHUB_OUTPUT (published, version).
 *
 * Environment (the workflow sets these): WANDER_DATA_ID, GOOGLE_ACCESS_TOKEN (from the
 * keyless login step), SUPABASE_URL, SUPABASE_SECRET_KEY (a secret).
 */
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { emptyTables, TABS, type TabName, type Tables } from '@wander/content';
import { readTables } from './google.ts';
import { buildRelease, pendingRelease, snapshotFile, type PublishedVersion } from './release.ts';
import { uploadAlpha } from './storage.ts';

const local = process.argv.includes('--local');
const asRelease = local ? process.argv[process.argv.indexOf('--release') + 1] : undefined;
const root = new URL('../../../', import.meta.url);
const out = local ? mkdtempSync(join(tmpdir(), 'wander-publish-')) : new URL('app/public/data/', root).pathname.replace(/^\/([A-Za-z]:)/, '$1');

function env(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set`);
  return value;
}

function output(values: Record<string, string>) {
  const file = process.env.GITHUB_OUTPUT;
  if (file) appendFileSync(file, Object.entries(values).map(([k, v]) => `${k}=${v}\n`).join(''));
}

async function read(): Promise<Tables> {
  if (local) {
    const tables = emptyTables();
    for (const tab of Object.keys(TABS) as TabName[]) {
      const file = new URL(`app/dev-data/${tab}.json`, root);
      if (existsSync(file)) tables[tab] = JSON.parse(readFileSync(file, 'utf8'));
    }
    if (process.argv.includes('--release') && asRelease) tables.Releases.push({ version: asRelease, notes: 'Local trial', requested_at: '' });
    return tables;
  }
  return readTables(env('WANDER_DATA_ID'), env('GOOGLE_ACCESS_TOKEN'));
}

const tables = await read();
const versionFile = join(out, 'version.json');
const published = existsSync(versionFile) ? (JSON.parse(readFileSync(versionFile, 'utf8')) as PublishedVersion) : null;
const release = pendingRelease(tables, published?.version ?? null);
if (!release) {
  console.log(published ? `Nothing to publish: ${published.version} is already on the site, and Releases has nothing newer.` : 'Nothing to publish: Releases has no version yet.');
  output({ published: 'false' });
  process.exit(0);
}

const publishedAt = new Date().toISOString();
const { snapshots, errors, warnings } = buildRelease(tables, release, publishedAt);
console.log(`Release ${release.version}: ${snapshots.public.tables.Skills.length} public skills, ${snapshots.alpha.tables.Skills.length} for the Alpha group.`);
if (warnings.length) console.log(`\n${warnings.length} warnings (not blocking):\n${warnings.map((w) => `  ${w}`).join('\n')}`);
if (errors.length) {
  console.error(`\n${errors.length} errors, nothing published. Fix them in Wander Data and publish again:\n${errors.map((e) => `  ${e}`).join('\n')}`);
  output({ published: 'false' });
  process.exit(1);
}

const file = snapshotFile(release.version);
const publicJson = JSON.stringify(snapshots.public);
const alphaJson = JSON.stringify(snapshots.alpha);
mkdirSync(out, { recursive: true });
writeFileSync(join(out, file), publicJson);
writeFileSync(versionFile, `${JSON.stringify({ version: release.version, publishedAt, file } satisfies PublishedVersion, null, 2)}\n`);
console.log(`\nWrote ${join(out, file)} (${Math.round(publicJson.length / 1024)} KB) and version.json.`);

if (local) {
  console.log(`Local run: the alpha snapshot (${Math.round(alphaJson.length / 1024)} KB) wasn't uploaded.`);
} else {
  await uploadAlpha(env('SUPABASE_URL'), env('SUPABASE_SECRET_KEY'), file, alphaJson);
  console.log(`Uploaded the alpha snapshot to the alpha bucket as ${file} (${Math.round(alphaJson.length / 1024)} KB).`);
}
output({ published: 'true', version: release.version });
