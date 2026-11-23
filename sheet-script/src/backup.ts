/**
 * The backup rules, pure so they're tested without Drive.
 *   - A weekly backup only happens when the sheet changed since the last one.
 *   - Config backup_keep, when it holds a number, is how many backups to keep: older
 *     ones go to the Drive trash (not deleted, so a mistake can be undone for 30 days).
 *     Empty keeps them all.
 */
export const BACKUP_FOLDER = 'Wander Data · Backups';

export const backupName = (stamp: string) => `Wander Data · ${stamp}`;

export function needsBackup(lastUpdated: number, lastBackup: number | null) {
  return lastBackup === null || lastUpdated > lastBackup;
}

/** How many to keep, from Config backup_keep: a whole number of at least 1, or null for all. */
export function keepCount(value: unknown): number | null {
  const n = Number(String(value ?? '').trim());
  return String(value ?? '').trim() !== '' && Number.isInteger(n) && n >= 1 ? n : null;
}

/** The backups to trash: everything past the newest `keep`. */
export function backupsToTrash<B extends { created: number }>(backups: B[], keep: number | null): B[] {
  if (keep === null) return [];
  return [...backups].sort((a, b) => b.created - a.created).slice(keep);
}
