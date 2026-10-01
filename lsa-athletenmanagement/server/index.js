// Einstiegspunkt: node server/index.js [--open]
let sqliteOk = true;
try { await import('node:sqlite'); } catch { sqliteOk = false; }
if (!sqliteOk) {
  console.error('\nFEHLER: Diese Node.js-Version (' + process.versions.node + ') hat keine eingebaute SQLite-Datenbank.');
  console.error('Benötigt wird Node.js 22.13 oder neuer (https://nodejs.org). START.bat lädt bei Bedarf automatisch eine portable Version.\n');
  process.exit(3);
}

const { loadConfig, VERSION } = await import('./config.js');
const { createApp } = await import('./app.js');
const { exec } = await import('node:child_process');

const config = loadConfig();
const instance = await createApp(config);

let port = null;
for (let p = config.port; p < config.port + 10; p++) {
  try { port = await instance.listen(p); break; } catch (e) { if (e.code !== 'EADDRINUSE') throw e; }
}
if (port == null) {
  console.error(`FEHLER: Die Ports ${config.port}–${config.port + 9} sind belegt. Ist das Programm schon gestartet?`);
  process.exit(2);
}

const url = `http://localhost:${port}`;
console.log('');
console.log('  LSA Athletenmanagement – Prototyp  v' + VERSION);
console.log('  ------------------------------------------------');
console.log('  Adresse:      ' + url);
console.log('  Datenordner:  ' + config.dataDir + (config.dataDirFallback ? '   (Ausweichordner!)' : ''));
console.log('  Datenbank:    ' + config.dbFile);
console.log('');
console.log('  Dieses Fenster offen lassen, solange gearbeitet wird.');
console.log('  Beenden: Strg+C oder Fenster schließen.');
console.log('');
instance.log.info(`Server gestartet auf ${url}, Daten in ${config.dataDir}`);

if (process.argv.includes('--open')) {
  const cmd = process.platform === 'win32' ? `start "" "${url}"` : process.platform === 'darwin' ? `open "${url}"` : `xdg-open "${url}"`;
  exec(cmd, () => { /* Browser-Start ist optional */ });
}

let closing = false;
async function shutdown(sig) {
  if (closing) return;
  closing = true;
  console.log(`\n  ${sig}: Server wird beendet …`);
  await instance.close();
  instance.log.info('Server beendet');
  process.exit(0);
}
process.on('SIGINT', () => shutdown('Strg+C'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
