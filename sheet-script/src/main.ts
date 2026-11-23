/// <reference types="google-apps-script" />
/**
 * The Apps Script bound to Wander Data. Bundled by Vite into one file (dist/wander.js)
 * that defines a global `Wander`. Apps Script calls functions by name, so
 * public/triggers.js has a top-level function for each entry point that calls into it.
 *
 *   - onOpen: the Wander menu.
 *   - onEdit: a row typed by hand gets its ID from the Config counter, and an edited
 *     skill gets today's edited_at. Writes from the Editor don't fire onEdit (only
 *     edits made in the grid do), and the Editor sets both itself.
 *   - weeklyBackup: a copy of the sheet in "Wander Data · Backups", only when the sheet
 *     changed since the last one. "Ativar backup semanal" installs its trigger.
 */
import { BACKUP_FOLDER, backupName, backupsToTrash, keepCount, needsBackup } from './backup.ts';
import { ID_TABS, planIds, type Cell } from './ids.ts';

const EDITOR_URL = 'https://roger-egito.github.io/wander/editor';
const LAST_BACKUP = 'lastBackup';

type Spreadsheet = GoogleAppsScript.Spreadsheet.Spreadsheet;

const header = (values: Cell[][]) => (values[0] ?? []).map((h) => String(h ?? '').trim());

function config(ss: Spreadsheet) {
  const sheet = ss.getSheetByName('Config')!;
  const values = sheet.getDataRange().getValues() as Cell[][];
  const keyColumn = header(values).indexOf('key');
  const valueColumn = header(values).indexOf('value');
  const rowOf = (key: string) => values.findIndex((row, i) => i > 0 && String(row[keyColumn]).trim() === key);
  return {
    get: (key: string) => (rowOf(key) > 0 ? values[rowOf(key)][valueColumn] : ''),
    counters: Object.fromEntries(
      values.slice(1).filter((row) => String(row[keyColumn]).startsWith('next_id_')).map((row) => [String(row[keyColumn]).trim(), Number(row[valueColumn])]),
    ) as Record<string, number>,
    set(key: string, value: number) {
      const row = rowOf(key);
      if (row > 0) sheet.getRange(row + 1, valueColumn + 1).setValue(value);
      else sheet.appendRow(header(values).map((h) => (h === 'key' ? key : h === 'value' ? value : '')));
    },
  };
}

/** Fills missing IDs in one tab (only `rows`, data row indexes, when given). Returns how many. */
function fillIds(ss: Spreadsheet, tab: string, rows?: number[]) {
  const sheet = ss.getSheetByName(tab);
  if (!sheet) return 0;
  const values = sheet.getDataRange().getValues() as Cell[][];
  const cfg = config(ss);
  const plan = planIds(tab, header(values), values.slice(1), cfg.counters, rows);
  const idColumn = header(values).indexOf('id') + 1;
  for (const { row, id } of plan.ids) sheet.getRange(row + 2, idColumn).setValue(id);
  for (const [key, value] of Object.entries(plan.counters)) cfg.set(key, value);
  return plan.ids.length;
}

export function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Wander')
    .addItem('Abrir editor', 'openEditor')
    .addItem('Gerar IDs faltantes', 'generateMissingIds')
    .addItem('Fazer backup agora', 'backupNow')
    .addSeparator()
    .addItem('Ativar backup semanal', 'installWeeklyBackup')
    .addToUi();
}

export function onEdit(e: GoogleAppsScript.Events.SheetsOnEdit) {
  const sheet = e.range.getSheet();
  const tab = sheet.getName();
  const first = Math.max(2, e.range.getRow());
  const last = e.range.getLastRow();
  if (last < first) return;
  const lock = LockService.getDocumentLock();
  if (!lock.tryLock(10000)) return;
  try {
    const ss = e.source;
    const columns = header(sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues() as Cell[][]);
    const editedAt = columns.indexOf('edited_at');
    if (editedAt >= 0) {
      const today = Utilities.formatDate(new Date(), ss.getSpreadsheetTimeZone(), 'yyyy-MM-dd');
      const rows = sheet.getRange(first, 1, last - first + 1, columns.length).getValues() as Cell[][];
      rows.forEach((row, i) => {
        // A row cleared by the edit stays clear.
        if (row.some((cell, c) => c !== editedAt && cell !== '' && cell !== false)) sheet.getRange(first + i, editedAt + 1).setValue(today);
      });
    }
    if (ID_TABS.includes(tab)) fillIds(ss, tab, Array.from({ length: last - first + 1 }, (_, i) => first - 2 + i));
  } finally {
    lock.releaseLock();
  }
}

export function generateMissingIds() {
  const ss = SpreadsheetApp.getActive();
  const counts = ID_TABS.map((tab) => [tab, fillIds(ss, tab)] as const).filter(([, n]) => n > 0);
  SpreadsheetApp.getUi().alert(counts.length ? `IDs gerados: ${counts.map(([tab, n]) => `${tab} ${n}`).join(', ')}` : 'Nenhuma linha estava sem ID.');
}

function backup(force: boolean) {
  const ss = SpreadsheetApp.getActive();
  const file = DriveApp.getFileById(ss.getId());
  const props = PropertiesService.getScriptProperties();
  const last = Number(props.getProperty(LAST_BACKUP)) || null;
  if (!force && !needsBackup(file.getLastUpdated().getTime(), last)) return null;
  const folders = DriveApp.getFoldersByName(BACKUP_FOLDER);
  const folder = folders.hasNext() ? folders.next() : DriveApp.createFolder(BACKUP_FOLDER);
  const copy = file.makeCopy(backupName(Utilities.formatDate(new Date(), ss.getSpreadsheetTimeZone(), 'yyyy-MM-dd HH:mm')), folder);
  props.setProperty(LAST_BACKUP, String(Date.now()));
  const existing: { file: GoogleAppsScript.Drive.File; created: number }[] = [];
  // The Sheets MIME type spelled out: the type checker's DOM types also define a global
  // MimeType, which hides Apps Script's.
  const files = folder.getFilesByType('application/vnd.google-apps.spreadsheet');
  while (files.hasNext()) {
    const f = files.next();
    existing.push({ file: f, created: f.getDateCreated().getTime() });
  }
  for (const old of backupsToTrash(existing, keepCount(config(ss).get('backup_keep')))) old.file.setTrashed(true);
  return copy;
}

export function backupNow() {
  const copy = backup(true)!;
  SpreadsheetApp.getUi().alert(`Backup feito: "${copy.getName()}" em "${BACKUP_FOLDER}".`);
}

/** Run by the weekly trigger. */
export function weeklyBackup() {
  backup(false);
}

export function installWeeklyBackup() {
  for (const trigger of ScriptApp.getProjectTriggers()) if (trigger.getHandlerFunction() === 'weeklyBackup') ScriptApp.deleteTrigger(trigger);
  ScriptApp.newTrigger('weeklyBackup').timeBased().onWeekDay(ScriptApp.WeekDay.MONDAY).atHour(4).create();
  SpreadsheetApp.getUi().alert('Backup semanal ativado: toda segunda-feira, por volta das 4h, se a planilha mudou.');
}

export function openEditor() {
  const html = HtmlService.createHtmlOutput(`<p style="font-family: sans-serif"><a href="${EDITOR_URL}" target="_blank" rel="noreferrer">Abrir o Wander Editor</a></p>`)
    .setWidth(320)
    .setHeight(80);
  SpreadsheetApp.getUi().showModelessDialog(html, 'Wander');
}
