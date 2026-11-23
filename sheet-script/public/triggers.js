// Apps Script finds entry points by name among top-level functions, so each one is
// declared here and calls into the bundle (wander.js, which defines the global Wander).
function onOpen(e) { Wander.onOpen(e); }
function onEdit(e) { Wander.onEdit(e); }
function openEditor() { Wander.openEditor(); }
function generateMissingIds() { Wander.generateMissingIds(); }
function backupNow() { Wander.backupNow(); }
function weeklyBackup() { Wander.weeklyBackup(); }
function installWeeklyBackup() { Wander.installWeeklyBackup(); }
