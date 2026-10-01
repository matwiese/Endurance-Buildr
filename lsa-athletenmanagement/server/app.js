import fs from 'node:fs';
import path from 'node:path';
import { ROOT, prepareDataDir } from './config.js';
import { Db } from './db.js';
import { Router, createHttpServer } from './http.js';
import { createAuth } from './auth.js';
import { defaultSettings, register as registerSystem } from './routes/system.js';
import { register as registerAuth } from './routes/auth.js';
import { register as registerUsers } from './routes/users.js';
import { autoBackup } from './backup.js';

function makeLogger(config) {
  const file = path.join(config.logDir, 'server.log');
  const write = (level, msg, err) => {
    const line = `${new Date().toISOString()} ${level} ${msg}${err ? ' ' + (err.stack || err) : ''}\n`;
    try { fs.appendFileSync(file, line); } catch { /* Log nicht kritisch */ }
    if (level === 'ERROR') console.error(line.trim());
  };
  return { info: (m) => write('INFO', m), error: (m, e) => write('ERROR', m, e) };
}

export async function createApp(config) {
  prepareDataDir(config);
  const log = makeLogger(config);
  const db = new Db(config.dbFile);
  const before = db.version;
  db.migrate();
  defaultSettings(db);
  if (before !== db.version) log.info(`Datenbank-Schema von Version ${before} auf ${db.version} aktualisiert`);

  const router = new Router();
  const app = { config, db, router, log, port: config.port };
  app.auth = createAuth({ db, config });
  registerAuth(app);
  registerUsers(app);
  registerSystem(app);

  const server = createHttpServer({
    router, publicDir: path.join(ROOT, 'public'), config, onRequestAuth: app.auth.onRequestAuth, log,
  });

  if (config.autoBackup) { try { autoBackup(db, config); } catch (e) { log.error('Auto-Backup fehlgeschlagen', e); } }

  // Abgelaufene Sitzungen regelmäßig entfernen
  const sweep = setInterval(() => { try { db.run('DELETE FROM sessions WHERE expires_at < ?', new Date().toISOString()); } catch { /* ignorieren */ } }, 600000);
  sweep.unref();

  return {
    app, server, db, log,
    listen(port = config.port, host = config.bind) {
      return new Promise((resolve, reject) => {
        const onError = (e) => reject(e);
        server.once('error', onError);
        server.listen(port, host, () => { server.off('error', onError); app.port = server.address().port; resolve(app.port); });
      });
    },
    close() {
      return new Promise((resolve) => {
        clearInterval(sweep);
        server.close(() => { try { db.close(); } catch { /* bereits zu */ } resolve(); });
        server.closeAllConnections?.();
      });
    },
  };
}
