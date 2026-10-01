// Medizinische Akte: Belastungsstatus (Ampel), Verletzungs-/Erkrankungsregister mit Return-to-Performance, Athletinnengesundheit
import { badRequest, forbidden, notFound } from '../http.js';
import { audit } from '../auth.js';
import { accessFor, need, visibleWithLevels } from '../access.js';
import { INJURY_OPTIONS, STATUS, STATUS_MEAN } from '../catalog.js';
import { dayDiff, isDate, nowIso, str, todayStr } from '../util.js';

export const emptyStatus = { color: 'gruen', allowed: '', restricted: '', next: '', by: '', updated: '' };
export const statusDto = (s) => (s ? { color: s.color, allowed: s.allowed, restricted: s.restricted, next: s.next_check, by: s.set_by, updated: s.updated } : { ...emptyStatus });

export function setStatus(db, athleteId, { color, allowed = '', restricted = '', next = '', by }) {
  if (!STATUS[color]) throw badRequest('Unbekannter Belastungsstatus.');
  allowed = str(allowed, 300); restricted = str(restricted, 300); next = str(next, 10);
  if (color !== 'gruen') {
    if (!restricted) throw badRequest(`Bei ${STATUS[color]} ist die Angabe „Nicht erlaubt“ Pflicht.`);
    if (!isDate(next)) throw badRequest(`Bei ${STATUS[color]} ist ein Kontrolltermin Pflicht.`);
  } else { restricted = ''; if (next && !isDate(next)) throw badRequest('Ungültiger Kontrolltermin.'); }
  const now = nowIso(), day = todayStr();
  db.run(`INSERT INTO load_status(athlete_id, color, allowed, restricted, next_check, set_by, updated, updated_at) VALUES (?,?,?,?,?,?,?,?)
    ON CONFLICT(athlete_id) DO UPDATE SET color=excluded.color, allowed=excluded.allowed, restricted=excluded.restricted, next_check=excluded.next_check, set_by=excluded.set_by, updated=excluded.updated, updated_at=excluded.updated_at`,
  athleteId, color, allowed, restricted, next, by, day, now);
  db.run('INSERT INTO status_history(athlete_id, color, allowed, restricted, next_check, set_by, ts) VALUES (?,?,?,?,?,?,?)', athleteId, color, allowed, restricted, next, by, now);
}

export function injuryDto(i, level) {
  const full = level === 'full';
  const end = i.full_date || i.return_date || todayStr();
  return {
    id: i.id, aid: i.athlete_id, date: i.date, activity: i.activity, setting: i.setting, region: i.region, kind: i.kind, type: i.type, first: i.first, onset: i.onset,
    mechanism: i.mechanism, diagnosis: i.diagnosis, resp: i.resp, treat: i.treat, rtp: i.rtp, returnDate: i.return_date, fullDate: i.full_date, closed: !!i.closed,
    meds: full ? i.meds : undefined, labs: full ? i.labs : undefined, daysLost: Math.max(0, dayDiff(end) - dayDiff(i.date)),
  };
}

export function register(app) {
  const { router, db } = app;

  // Gesundheits-Reiter einer Akte – Inhalt hängt von der Stufe ab (status | physio | full | own)
  router.get('/api/athletes/:id/health', (ctx) => {
    const acc = accessFor(db, ctx, ctx.params.id);
    const lvl = need(db, ctx, acc, 'health', ['status', 'physio', 'full', 'own'], 'Gesundheitsreiter öffnen');
    const a = acc.athlete;
    const out = { level: lvl, status: statusDto(db.get('SELECT * FROM load_status WHERE athlete_id = ?', a.id)), canSetStatus: lvl === 'full', canRtp: lvl === 'full' || lvl === 'physio', canWriteInjury: lvl === 'full' };
    if (lvl === 'full') out.history = db.all('SELECT color, allowed, restricted, next_check, set_by, ts FROM status_history WHERE athlete_id = ? ORDER BY id DESC LIMIT 10', a.id).map((h) => ({ color: h.color, allowed: h.allowed, restricted: h.restricted, next: h.next_check, by: h.set_by, ts: h.ts }));
    if (lvl !== 'status') {
      out.injuries = db.all('SELECT * FROM injuries WHERE athlete_id = ? ORDER BY date DESC, id DESC', a.id).map((i) => injuryDto(i, lvl));
    }
    if (a.sex === 'w' && (lvl === 'full' || lvl === 'own')) {
      const consent = db.get("SELECT status FROM consents WHERE athlete_id = ? AND purpose_key = 'cycle'", a.id)?.status === 'erteilt';
      out.cycle = { consent, note: consent ? db.get('SELECT note FROM cycle_notes WHERE athlete_id = ?', a.id)?.note || '' : '' };
    }
    audit(db, ctx, { athleteId: a.id, area: 'Medizin', action: 'Gesundheitsreiter geöffnet', result: { status: 'nur Status', physio: 'fachlich erforderlich', full: 'vollständig', own: 'eigene Daten' }[lvl], dedupe: true });
    return out;
  });

  router.post('/api/athletes/:id/status', async (ctx) => {
    const acc = accessFor(db, ctx, ctx.params.id);
    need(db, ctx, acc, 'health', ['full'], 'Belastungsstatus setzen');
    const b = await ctx.json();
    setStatus(db, acc.athlete.id, { color: str(b.color, 10), allowed: b.allowed, restricted: b.restricted, next: b.next, by: ctx.user.display_name });
    audit(db, ctx, { athleteId: acc.athlete.id, area: 'Medizin', action: `Belastungsstatus geändert: ${STATUS[b.color]}` });
    return { ok: true };
  });

  function readInjury(b, cur) {
    const o = INJURY_OPTIONS, g = (k, d = '') => (b[k] !== undefined ? b[k] : cur?.[k] ?? d);
    const i = {
      date: str(g('date', todayStr()), 10), activity: str(g('activity'), 200), setting: str(g('setting', 'Training'), 20), region: str(g('region'), 100), kind: str(g('kind', 'Verletzung'), 20),
      type: str(g('type'), 100), first: str(g('first', 'Erstauftreten'), 20), onset: str(g('onset', 'akut'), 20), mechanism: str(g('mechanism'), 200), diagnosis: str(g('diagnosis'), 300),
      treat: str(g('treat'), 500), meds: str(g('meds'), 300), labs: str(g('labs'), 300),
    };
    if (!isDate(i.date)) throw badRequest('Bitte ein gültiges Datum des Auftretens angeben.');
    if (i.date > todayStr()) throw badRequest('Das Datum liegt in der Zukunft.');
    if (!i.region) throw badRequest('Bitte die Körperregion angeben.');
    if (!i.type) throw badRequest('Bitte die Art der Beschwerden angeben.');
    if (!i.diagnosis) throw badRequest('Bitte die medizinische Diagnose angeben.');
    if (!o.kind.includes(i.kind) || !o.setting.includes(i.setting) || !o.first.includes(i.first) || !o.onset.includes(i.onset)) throw badRequest('Ungültige Auswahl bei Art, Umfeld, Verlauf oder Beginn.');
    return i;
  }

  // Neue Verletzung/Erkrankung (IOC-Mindestdatensatz) und – optional – gleich den Belastungsstatus setzen
  router.post('/api/athletes/:id/injuries', async (ctx) => {
    const acc = accessFor(db, ctx, ctx.params.id);
    need(db, ctx, acc, 'health', ['full'], 'Verletzung erfassen');
    const b = await ctx.json();
    const i = readInjury(b, null);
    const now = nowIso();
    const id = db.tx(() => {
      const id = db.run(`INSERT INTO injuries(athlete_id, date, activity, setting, region, kind, type, first, onset, mechanism, diagnosis, resp, treat, rtp, meds, labs, created_by, created_at, updated_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      acc.athlete.id, i.date, i.activity, i.setting, i.region, i.kind, i.type, i.first, i.onset, i.mechanism, i.diagnosis, ctx.user.display_name, i.treat, 1, i.meds, i.labs, ctx.user.display_name, now, now).lastInsertRowid;
      if (b.color && b.color !== 'keep') setStatus(db, acc.athlete.id, { color: b.color, allowed: b.allowed, restricted: b.restricted, next: b.next, by: ctx.user.display_name });
      return id;
    });
    audit(db, ctx, { athleteId: acc.athlete.id, area: 'Medizin', action: `${i.kind} erfasst${b.color && b.color !== 'keep' ? ', Belastungsstatus gesetzt' : ''}`, detail: i.region });
    return { id };
  });

  const loadInjury = (ctx, id, tab = ['full']) => {
    const i = db.get('SELECT * FROM injuries WHERE id = ?', Number(id));
    if (!i) throw notFound('Eintrag nicht gefunden.');
    const acc = accessFor(db, ctx, i.athlete_id);
    const lvl = need(db, ctx, acc, 'health', tab, 'Verletzung bearbeiten');
    return { i, acc, lvl };
  };
  router.put('/api/injuries/:id', async (ctx) => {
    const { i: cur } = loadInjury(ctx, ctx.params.id);
    const i = readInjury(await ctx.json(), cur);
    db.run(`UPDATE injuries SET date=?, activity=?, setting=?, region=?, kind=?, type=?, first=?, onset=?, mechanism=?, diagnosis=?, treat=?, meds=?, labs=?, updated_at=? WHERE id=?`,
      i.date, i.activity, i.setting, i.region, i.kind, i.type, i.first, i.onset, i.mechanism, i.diagnosis, i.treat, i.meds, i.labs, nowIso(), cur.id);
    audit(db, ctx, { athleteId: cur.athlete_id, area: 'Medizin', action: 'Verletzungseintrag geändert', detail: i.region });
    return { ok: true };
  });
  router.delete('/api/injuries/:id', (ctx) => {
    const { i } = loadInjury(ctx, ctx.params.id);
    db.run('DELETE FROM injuries WHERE id = ?', i.id);
    audit(db, ctx, { athleteId: i.athlete_id, area: 'Medizin', action: 'Verletzungseintrag gelöscht', detail: i.region });
    return { ok: true };
  });
  // Reha-Stufe fortschreiben (Medizin und Physiotherapie)
  router.put('/api/injuries/:id/rtp', async (ctx) => {
    const { i } = loadInjury(ctx, ctx.params.id, ['full', 'physio']);
    if (i.closed) throw badRequest('Der Fall ist abgeschlossen.');
    const b = await ctx.json();
    const rtp = Math.min(6, Math.max(1, b.rtp != null ? Number(b.rtp) : i.rtp + Number(b.delta || 0)));
    if (!Number.isInteger(rtp)) throw badRequest('Ungültige Stufe.');
    db.run('UPDATE injuries SET rtp = ?, return_date = ?, updated_at = ? WHERE id = ?', rtp, rtp >= 4 && !i.return_date ? todayStr() : i.return_date, nowIso(), i.id);
    audit(db, ctx, { athleteId: i.athlete_id, area: 'Medizin', action: `Reha-Stufe ${rtp}`, detail: i.region });
    return { ok: true, rtp };
  });
  router.post('/api/injuries/:id/close', (ctx) => {
    const { i } = loadInjury(ctx, ctx.params.id);
    const d = todayStr();
    db.run('UPDATE injuries SET rtp = 6, closed = 1, full_date = ?, return_date = ?, updated_at = ? WHERE id = ?', d, i.return_date || d, nowIso(), i.id);
    audit(db, ctx, { athleteId: i.athlete_id, area: 'Medizin', action: 'Fall abgeschlossen (frühere Leistung erreicht)', detail: i.region });
    return { ok: true };
  });

  router.put('/api/athletes/:id/cycle', async (ctx) => {
    const acc = accessFor(db, ctx, ctx.params.id);
    need(db, ctx, acc, 'health', ['full'], 'Athletinnengesundheit');
    if (acc.athlete.sex !== 'w') throw badRequest('Dieser Bereich ist nur für Athletinnen vorgesehen.');
    if (db.get("SELECT status FROM consents WHERE athlete_id = ? AND purpose_key = 'cycle'", acc.athlete.id)?.status !== 'erteilt') throw badRequest('Ohne Einwilligung werden keine Zyklusdaten erfasst.');
    const b = await ctx.json();
    db.run('INSERT INTO cycle_notes(athlete_id, note, updated_at, updated_by) VALUES (?,?,?,?) ON CONFLICT(athlete_id) DO UPDATE SET note=excluded.note, updated_at=excluded.updated_at, updated_by=excluded.updated_by', acc.athlete.id, str(b.note, 1000), nowIso(), ctx.user.display_name);
    audit(db, ctx, { athleteId: acc.athlete.id, area: 'Medizin', action: 'Athletinnengesundheit aktualisiert' });
    return { ok: true };
  });

  // Verletzungsregister über alle Akten im Bereich (Medizin und Physiotherapie)
  router.get('/api/injuries', { feature: 'injuries.view' }, (ctx) => {
    const vis = visibleWithLevels(db, ctx.user).filter((v) => ['full', 'physio'].includes(v.levels.health));
    const names = new Map(vis.map((v) => [v.athlete.id, v.athlete.name]));
    const lv = new Map(vis.map((v) => [v.athlete.id, v.levels.health]));
    const ids = [...names.keys()];
    const rows = ids.length ? db.all(`SELECT * FROM injuries WHERE athlete_id IN (${ids.map(() => '?').join(',')}) ORDER BY date DESC, id DESC`, ...ids) : [];
    audit(db, ctx, { area: 'Medizin', action: 'Verletzungsregister geöffnet', result: ctx.perms.tabs.health === 'full' ? 'vollständig' : 'fachlich erforderlich', dedupe: true });
    return {
      injuries: rows.map((i) => ({ ...injuryDto(i, lv.get(i.athlete_id)), athleteName: names.get(i.athlete_id) })),
      athletes: vis.map((v) => ({ id: v.athlete.id, name: v.athlete.name })), canWrite: vis.some((v) => v.levels.health === 'full'), options: INJURY_OPTIONS,
    };
  });
}
