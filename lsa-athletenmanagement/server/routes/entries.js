// Akteneinträge: Notizen und Dokumente (Dateien) je Kategorie. Zugriff folgt dem Reiter der Kategorie.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { badRequest, forbidden, notFound, rawResponse, HttpError } from '../http.js';
import { audit } from '../auth.js';
import { accessFor, catAccess } from '../access.js';
import { ALLOWED_UPLOADS, DOC_AREA, DOC_CATEGORIES, INLINE_IMAGES, SIGNATURES } from '../catalog.js';
import { str, bool, nowIso } from '../util.js';

const SENSITIVE = new Set(['medizin', 'psychologie', 'schule']);

export function register(app) {
  const { router, db, config } = app;

  const dto = (e, acc) => ({
    id: e.id, athleteId: e.athlete_id, category: e.category, title: e.title, text: e.text,
    file: e.stored_name ? { name: e.file_name, size: e.size, mime: e.mime, image: INLINE_IMAGES.has(extOf(e.file_name)) } : null,
    visibleToAthlete: !!e.visible_to_athlete, createdBy: e.created_by, createdAt: e.created_at, updatedAt: e.updated_at,
    canEdit: catAccess(acc, e.category).write,
  });
  const extOf = (name) => String(name || '').split('.').pop().toLowerCase();

  function loadEntry(ctx, id) {
    const e = db.get('SELECT * FROM entries WHERE id = ?', Number(id));
    if (!e) throw notFound('Eintrag nicht gefunden.');
    const acc = accessFor(db, ctx, e.athlete_id);
    const ca = catAccess(acc, e.category);
    if (!ca.read || (ca.own && !e.visible_to_athlete)) {
      audit(db, ctx, { athleteId: e.athlete_id, area: DOC_AREA[e.category], action: 'Akteneintrag angefragt (kein Zugriff)', result: 'verweigert', dedupe: true });
      throw notFound('Eintrag nicht gefunden.');
    }
    return { e, acc, ca };
  }

  // Liste der Einträge, die die Person sehen darf
  router.get('/api/athletes/:id/entries', (ctx) => {
    const acc = accessFor(db, ctx, ctx.params.id);
    const cats = Object.keys(DOC_CATEGORIES);
    const readable = cats.filter((c) => catAccess(acc, c).read);
    const writable = cats.filter((c) => catAccess(acc, c).write);
    let rows = [];
    if (readable.length) {
      const want = ctx.query.category ? [ctx.query.category].filter((c) => readable.includes(c)) : readable;
      if (want.length) {
        rows = db.all(`SELECT * FROM entries WHERE athlete_id = ? AND category IN (${want.map(() => '?').join(',')}) ORDER BY created_at DESC, id DESC`, acc.athlete.id, ...want)
          .filter((e) => !catAccess(acc, e.category).own || e.visible_to_athlete);
      }
    }
    const sens = [...new Set(rows.filter((e) => SENSITIVE.has(e.category)).map((e) => e.category))];
    for (const c of sens) audit(db, ctx, { athleteId: acc.athlete.id, area: DOC_AREA[c], action: `Akteneinträge (${DOC_CATEGORIES[c].label}) angesehen`, dedupe: true });
    return { entries: rows.map((e) => dto(e, acc)), readable, writable, maxUploadMb: config.maxUploadMb };
  });

  function readMeta(b, cat) {
    const title = str(b.title, 200), text = str(b.text, 10000);
    if (!title) throw badRequest('Bitte einen Titel angeben.');
    return { title, text, visible: bool(b.visibleToAthlete) ? 1 : 0 };
  }

  router.post('/api/athletes/:id/entries', async (ctx) => {
    const acc = accessFor(db, ctx, ctx.params.id);
    const b = await ctx.json();
    const category = str(b.category, 20);
    if (!DOC_CATEGORIES[category]) throw badRequest('Unbekannte Kategorie.');
    if (!catAccess(acc, category).write) {
      audit(db, ctx, { athleteId: acc.athlete.id, area: DOC_AREA[category], action: `Akteneintrag anlegen verweigert (${DOC_CATEGORIES[category].label})`, result: 'verweigert', dedupe: true });
      throw forbidden('Für diese Kategorie fehlt die Berechtigung zum Anlegen.');
    }
    const m = readMeta(b);
    if (!m.text) throw badRequest('Bitte einen Text eingeben (oder eine Datei hochladen).');
    const now = nowIso();
    const id = db.run(`INSERT INTO entries(athlete_id, category, title, text, visible_to_athlete, created_by_id, created_by, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?)`,
      acc.athlete.id, category, m.title, m.text, m.visible, ctx.user.id, ctx.user.display_name, now, now).lastInsertRowid;
    audit(db, ctx, { athleteId: acc.athlete.id, area: DOC_AREA[category], action: `Notiz angelegt (${DOC_CATEGORIES[category].label})`, detail: m.title });
    return { id };
  });

  // Datei-Upload: Rohdaten im Body, Metadaten in der Adresse
  router.post('/api/athletes/:id/entries/file', async (ctx) => {
    const acc = accessFor(db, ctx, ctx.params.id);
    const q = ctx.query;
    const category = str(q.category, 20);
    if (!DOC_CATEGORIES[category]) throw badRequest('Unbekannte Kategorie.');
    if (!catAccess(acc, category).write) {
      audit(db, ctx, { athleteId: acc.athlete.id, area: DOC_AREA[category], action: `Datei-Upload verweigert (${DOC_CATEGORIES[category].label})`, result: 'verweigert', dedupe: true });
      throw forbidden('Für diese Kategorie fehlt die Berechtigung zum Hochladen.');
    }
    const fileName = path.basename(str(q.filename, 200)).replace(/[\u0000-\u001f<>:"/\\|?*]/g, '_');
    const ext = extOf(fileName);
    if (!fileName || !ALLOWED_UPLOADS[ext]) throw badRequest(`Dateityp nicht erlaubt. Erlaubt: ${Object.keys(ALLOWED_UPLOADS).join(', ')}`);
    const limit = config.maxUploadMb * 1024 * 1024;
    const declared = Number(ctx.req.headers['content-length'] || 0);
    if (declared > limit) throw new HttpError(413, `Datei zu groß (Limit ${config.maxUploadMb} MB).`);
    const buf = await ctx.raw(limit);
    if (!buf.length) throw badRequest('Die Datei ist leer.');
    const sigs = SIGNATURES[ext];
    if (sigs && !sigs.some((s) => buf.subarray(0, s.length).equals(s))) throw badRequest(`Der Inhalt passt nicht zum Dateityp .${ext}.`);
    const m = readMeta({ title: q.title || fileName, text: q.text, visibleToAthlete: q.visible });
    const dir = path.join(config.docsDir, acc.athlete.id);
    fs.mkdirSync(dir, { recursive: true });
    const stored = crypto.randomUUID() + '.bin';
    fs.writeFileSync(path.join(dir, stored), buf, { flag: 'wx' });
    const sha = crypto.createHash('sha256').update(buf).digest('hex');
    const now = nowIso();
    let id;
    try {
      id = db.run(`INSERT INTO entries(athlete_id, category, title, text, file_name, stored_name, mime, size, sha256, visible_to_athlete, created_by_id, created_by, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        acc.athlete.id, category, m.title, m.text, fileName, stored, ALLOWED_UPLOADS[ext], buf.length, sha, m.visible, ctx.user.id, ctx.user.display_name, now, now).lastInsertRowid;
    } catch (e) { fs.rmSync(path.join(dir, stored), { force: true }); throw e; }
    audit(db, ctx, { athleteId: acc.athlete.id, area: DOC_AREA[category], action: `Datei hochgeladen (${DOC_CATEGORIES[category].label})`, detail: `${m.title} · ${fileName} · ${buf.length} Bytes` });
    return { id };
  });

  router.put('/api/entries/:id', async (ctx) => {
    const { e, acc, ca } = loadEntry(ctx, ctx.params.id);
    if (!ca.write) {
      audit(db, ctx, { athleteId: e.athlete_id, area: DOC_AREA[e.category], action: 'Akteneintrag ändern verweigert', result: 'verweigert', dedupe: true });
      throw forbidden();
    }
    const b = await ctx.json();
    const m = readMeta({ title: b.title ?? e.title, text: b.text ?? e.text, visibleToAthlete: b.visibleToAthlete ?? e.visible_to_athlete });
    if (!e.stored_name && !m.text) throw badRequest('Eine Notiz braucht einen Text.');
    let category = e.category;
    if (b.category && b.category !== e.category) {
      if (!DOC_CATEGORIES[b.category] || !catAccess(acc, b.category).write) throw forbidden('Für die Ziel-Kategorie fehlt die Berechtigung.');
      category = b.category;
    }
    db.run('UPDATE entries SET title = ?, text = ?, category = ?, visible_to_athlete = ?, updated_at = ? WHERE id = ?', m.title, m.text, category, m.visible, nowIso(), e.id);
    audit(db, ctx, { athleteId: e.athlete_id, area: DOC_AREA[category], action: `Akteneintrag geändert (${DOC_CATEGORIES[category].label})`, detail: m.title });
    return { ok: true };
  });

  router.delete('/api/entries/:id', async (ctx) => {
    const { e, ca } = loadEntry(ctx, ctx.params.id);
    if (!ca.write) {
      audit(db, ctx, { athleteId: e.athlete_id, area: DOC_AREA[e.category], action: 'Akteneintrag löschen verweigert', result: 'verweigert', dedupe: true });
      throw forbidden();
    }
    db.run('DELETE FROM entries WHERE id = ?', e.id);
    if (e.stored_name) fs.rmSync(path.join(config.docsDir, e.athlete_id, e.stored_name), { force: true });
    audit(db, ctx, { athleteId: e.athlete_id, area: DOC_AREA[e.category], action: `Akteneintrag gelöscht (${DOC_CATEGORIES[e.category].label})`, detail: `${e.title}${e.file_name ? ' · ' + e.file_name : ''}` });
    return { ok: true };
  });

  router.get('/api/entries/:id/file', (ctx) => {
    const { e } = loadEntry(ctx, ctx.params.id);
    if (!e.stored_name) throw notFound('Zu diesem Eintrag gibt es keine Datei.');
    const file = path.join(config.docsDir, e.athlete_id, e.stored_name);
    let buf;
    try { buf = fs.readFileSync(file); } catch { throw notFound('Die Datei fehlt im Datenordner.'); }
    audit(db, ctx, { athleteId: e.athlete_id, area: DOC_AREA[e.category], action: `Datei geöffnet (${DOC_CATEGORIES[e.category].label})`, detail: e.title, dedupe: true });
    const inline = ctx.query.inline === '1' && INLINE_IMAGES.has(extOf(e.file_name));
    const ascii = e.file_name.replace(/[^\x20-\x7e]/g, '_').replace(/"/g, '');
    return rawResponse(buf, {
      'Content-Type': e.mime || 'application/octet-stream',
      'Content-Length': buf.length,
      'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(e.file_name)}`,
      'Cache-Control': 'private, no-store',
    });
  });
}
