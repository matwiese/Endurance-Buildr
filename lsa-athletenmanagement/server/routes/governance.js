// Governance: Datenqualität, Kennzahlen (aggregiert), Datenschutz-Verwaltung, Safeguarding, Auskunfts-Export
import { badRequest, forbidden, notFound, rawResponse } from '../http.js';
import { audit } from '../auth.js';
import { accessFor, need, visibleAthletes } from '../access.js';
import { effectivePerms, ROLE_KEYS, ROLES } from '../permissions.js';
import { VARIABLES } from '../catalog.js';
import { buildExport } from '../export.js';
import { planComplete } from '../domain.js';
import { addDays, dayDiff, nowIso, str, todayStr, isDate } from '../util.js';
import { injuryDto } from './medical.js';

const DPIA_ITEMS = [
  ['Verarbeitungsverzeichnis angelegt', 1], ['Rechtsgrundlage je Zweck (Art. 6 + Art. 9) geprüft', 0], ['Datenschutz-Folgenabschätzung nach Art. 35 geprüft', 0],
  ['Auftragsverarbeitungsverträge abgeschlossen', 0], ['Löschkonzept mit Fristen je Kategorie', 0], ['Rollen- und Berechtigungskonzept freigegeben', 1],
];
const RETENTION = ['Stammdaten', 'Trainingsdaten', 'Sportwissenschaftliche Testergebnisse', 'Medizinische Dokumentation', 'Psychologische Dokumentation', 'Schul- und Dual-Career-Daten', 'Einwilligungen', 'Zugriffsprotokolle', 'Forschungsdaten', 'Safeguarding-Fälle'];

export function ensureGovernanceDefaults(db) {
  const now = nowIso();
  for (const [item, done] of DPIA_ITEMS) db.run('INSERT OR IGNORE INTO dpia(item, done, updated_at) VALUES (?,?,?)', item, done, now);
  for (const cat of RETENTION) db.run("INSERT OR IGNORE INTO retention(cat, period, owner, status) VALUES (?,?,?,?)", cat, '', 'DSB mit Medizin, Rechtsberatung, Träger', 'festzulegen');
  for (const role of ROLE_KEYS) db.run('INSERT OR IGNORE INTO rights_review(role, last, next) VALUES (?,?,?)', role, '', addDays(todayStr(), 365));
}

const K_MIN = 5; // Gruppen unter fünf Personen werden unterdrückt

export function register(app) {
  const { router, db, config } = app;

  // Athlet:innen, über die diese Person Qualitätsaussagen sehen darf (Rollen ohne Aktenzugriff, z. B. Performance Data: alle)
  function qualityIds(ctx) {
    const hasPerAthlete = ctx.perms.tabs.overview !== 'none';
    const rows = hasPerAthlete ? visibleAthletes(db, ctx.user) : db.all('SELECT * FROM athletes');
    return rows.filter((a) => a.status !== 'ausgetreten').map((a) => a.id);
  }
  const ph = (n) => (n ? Array(n).fill('?').join(',') : "''");

  // ------------------------------------------------------------------ Datenqualität
  router.get('/api/quality', { feature: 'quality.view' }, (ctx) => {
    const ids = qualityIds(ctx), T = todayStr();
    const idList = ph(ids.length);
    const complete = ids.length ? db.get(`SELECT COUNT(*) AS n FROM readiness WHERE athlete_id IN (${idList}) AND date BETWEEN ? AND ?`, ...ids, addDays(T, -13), T).n / (14 * ids.length) : null;
    const missRpe = db.get(`SELECT COUNT(*) AS n FROM training WHERE athlete_id IN (${idList}) AND date < ? AND status IN ('vollständig','angepasst','abgebrochen') AND rpe IS NULL`, ...ids, T).n;
    const noReason = db.get(`SELECT COUNT(*) AS n FROM training WHERE athlete_id IN (${idList}) AND date < ? AND status NOT IN ('vollständig','geplant') AND reason = ''`, ...ids, T).n;
    const flags = db.all(`SELECT * FROM quality_flags WHERE (athlete_id IN (${idList}) OR athlete_id IS NULL) ORDER BY (status = 'markiert') DESC, id DESC LIMIT 300`, ...ids);
    const perAthlete = ids.map((id) => ({ id, completeness: db.get('SELECT COUNT(*) AS n FROM readiness WHERE athlete_id = ? AND date BETWEEN ? AND ?', id, addDays(T, -13), T).n / 14 }));
    audit(db, ctx, { area: 'Datenqualität', action: 'Datenqualität geöffnet', result: 'Metadaten', dedupe: true });
    return {
      kpi: { completeness: complete, missingRpe: missRpe, deviationsNoReason: noReason, openFlags: flags.filter((f) => f.status === 'markiert').length, total: ids.length },
      flags: flags.map((f) => ({ id: f.id, aid: f.athlete_id, variable: f.variable, value: f.value, rule: f.rule, source: f.source, ts: f.ts, status: f.status, note: f.note, resolvedBy: f.resolved_by, refType: f.ref_type })),
      perAthlete, dictionary: [
        ...VARIABLES.map((v) => ({ variable: v.key, def: v.def || '–', unit: v.unit, source: v.source, freq: 'nach Fachkonzept', allowed: `${v.min}–${v.max}` })),
        { variable: 'Trainingsdauer', def: 'tatsächlich absolvierte Belastungszeit', unit: 'Minuten', source: 'Trainer', freq: 'je Einheit', allowed: '0–300' },
        { variable: 'Session-RPE', def: 'subjektive Gesamtbelastung der Einheit', unit: '0–10', source: 'Athlet:in', freq: 'nach Einheit', allowed: '0–10' },
        { variable: 'Trainingsverfügbarkeit', def: 'vollständig absolvierte / geplante Einheiten', unit: 'Prozent', source: 'System', freq: 'wöchentlich', allowed: '0–100' },
        { variable: 'Ausfalltag', def: 'Tag ohne geplantes Training wegen Gesundheit', unit: 'Tage', source: 'Medizin', freq: 'laufend', allowed: '≥ 0' },
        { variable: 'Readiness-Item', def: 'Selbsteinschätzung, 5 = bestmöglich', unit: '1–5', source: 'Athlet:in', freq: 'täglich', allowed: '1–5' },
      ],
      owners: [['Training', 'verantwortlicher Trainer'], ['Sportwissenschaftliche Tests', 'Leitung Sportwissenschaft'], ['Verletzungen und Erkrankungen', 'Medizinische Leitung'], ['Rehabilitation', 'Physiotherapie und Medizin'], ['Schulstatus', 'Dual-Career-Leitung'], ['Psychologische Daten', 'Leitung Sportpsychologie'], ['Stammdaten', 'Administration'], ['Zugriffsrechte', 'Systemadministration und Datenschutz']],
      canResolve: ctx.hasFeature('quality.resolve'),
    };
  });

  router.post('/api/quality/flags/:id', { feature: 'quality.resolve' }, async (ctx) => {
    const f = db.get('SELECT * FROM quality_flags WHERE id = ?', Number(ctx.params.id));
    if (!f) throw notFound('Markierung nicht gefunden.');
    const b = await ctx.json();
    const status = str(b.status, 20), note = str(b.note, 300);
    if (!['bestätigt', 'korrigiert'].includes(status)) throw badRequest('Bitte „bestätigen“ oder „korrigieren“ wählen.');
    db.tx(() => {
      if (status === 'korrigiert') {
        const v = Number(String(b.value).replace(',', '.'));
        if (!Number.isFinite(v)) throw badRequest('Bitte den korrigierten Zahlenwert angeben.');
        if (f.ref_type === 'measurement') db.run("UPDATE measurements SET value = ?, status = 'korrigiert' WHERE id = ?", v, f.ref_id);
        db.run("UPDATE quality_flags SET status = ?, value = value || ' → ' || ?, note = ?, resolved_by = ?, resolved_at = ? WHERE id = ?", status, String(v), note, ctx.user.display_name, nowIso(), f.id);
      } else {
        if (f.ref_type === 'measurement') db.run("UPDATE measurements SET status = 'bestätigt' WHERE id = ?", f.ref_id);
        db.run('UPDATE quality_flags SET status = ?, note = ?, resolved_by = ?, resolved_at = ? WHERE id = ?', status, note, ctx.user.display_name, nowIso(), f.id);
      }
      // Sobald alle Markierungen eines Messwerts geklärt sind, gilt er wieder als regulär
      if (f.ref_type === 'measurement' && !db.get("SELECT 1 AS x FROM quality_flags WHERE ref_type = 'measurement' AND ref_id = ? AND status = 'markiert'", f.ref_id)) {
        db.run("UPDATE measurements SET status = CASE WHEN status = 'markiert' THEN 'bestätigt' ELSE status END WHERE id = ?", f.ref_id);
      }
    });
    audit(db, ctx, { athleteId: f.athlete_id, area: 'Datenqualität', action: `Wert ${status}: ${f.variable}`, detail: f.rule });
    return { ok: true };
  });

  // ------------------------------------------------------------------ Kennzahlen (aggregiert)
  router.get('/api/kpi', { feature: 'kpi.view' }, (ctx) => {
    const T = todayStr();
    const ath = db.all("SELECT * FROM athletes WHERE status != 'ausgetreten'");
    const mk = (list) => {
      const ids = list.map((a) => a.id);
      const idList = ph(ids.length);
      const past = ids.length ? db.get(`SELECT COUNT(*) AS n, SUM(CASE WHEN status = 'vollständig' THEN 1 ELSE 0 END) AS ok FROM training WHERE athlete_id IN (${idList}) AND date BETWEEN ? AND ?`, ...ids, addDays(T, -13), addDays(T, -1)) : { n: 0, ok: 0 };
      const chk = ids.length ? db.get(`SELECT COUNT(*) AS n FROM readiness WHERE athlete_id IN (${idList}) AND date BETWEEN ? AND ?`, ...ids, addDays(T, -13), T).n : 0;
      const open = ids.length ? db.all(`SELECT * FROM injuries WHERE athlete_id IN (${idList}) AND closed = 0`, ...ids) : [];
      return { n: ids.length, availability: past.n ? past.ok / past.n : null, openInjuries: open.length, lostDays: open.reduce((t, i) => t + injuryDto(i, 'physio').daysLost, 0), completeness: ids.length ? chk / (14 * ids.length) : null, planComplete: ids.length ? ids.filter((id) => planComplete(db, id)).length / ids.length : null };
    };
    const total = mk(ath);
    const dueMeasures = db.all('SELECT result FROM measures WHERE review_date != ? AND review_date < ?', '', T);
    const sports = [...new Set(ath.map((a) => a.sport))].sort();
    const bySport = sports.map((sp) => {
      const g = ath.filter((a) => a.sport === sp);
      if (g.length < K_MIN) return { sport: sp, n: g.length, suppressed: true };
      const m = mk(g);
      return { sport: sp, ...m, openInjuries: m.openInjuries > 0 && m.openInjuries < K_MIN ? '< 5' : m.openInjuries, suppressed: false };
    });
    audit(db, ctx, { area: 'Kennzahlen', action: 'Kennzahlen geöffnet', result: 'aggregiert', dedupe: true });
    return {
      athletes: total.n, availability: total.availability, lostDays: total.lostDays, completeness: total.completeness, planComplete: total.planComplete,
      measureControl: dueMeasures.length ? dueMeasures.filter((m) => m.result).length / dueMeasures.length : 1,
      openFlags: db.get("SELECT COUNT(*) AS n FROM quality_flags WHERE status = 'markiert'").n,
      deniedAccess: db.get("SELECT COUNT(*) AS n FROM audit WHERE result = 'verweigert'").n,
      bySport, kMin: K_MIN,
    };
  });

  // ------------------------------------------------------------------ Datenschutz-Verwaltung
  const canPrivacy = (ctx) => ctx.hasFeature('privacy.manage') || ctx.hasFeature('audit.view');
  router.get('/api/privacy/overview', (ctx) => {
    if (!canPrivacy(ctx)) { ctx.deny?.('privacy.overview'); throw forbidden(); }
    const roles = ROLE_KEYS.map((r) => {
      const users = db.all('SELECT overrides, active FROM users WHERE role = ?', r);
      const rv = db.get('SELECT * FROM rights_review WHERE role = ?', r) || {};
      return { role: r, label: ROLES[r].label, activeUsers: users.filter((u) => u.active).length, last: rv.last || '', next: rv.next || '', by: rv.by || '' };
    });
    const withOverrides = db.all("SELECT * FROM users WHERE active = 1 AND role != 'athlet'").map((u) => ({ id: u.id, name: u.display_name, roleLabel: ROLES[u.role]?.label, n: effectivePerms(u).overrideCount })).filter((u) => u.n > 0);
    return {
      dpia: db.all('SELECT id, item, done FROM dpia ORDER BY id').map((d) => ({ id: d.id, item: d.item, done: !!d.done })),
      rights: roles, withOverrides,
      retention: db.all('SELECT cat, period, owner, status FROM retention ORDER BY rowid'),
      requests: db.all('SELECT r.*, a.name FROM data_requests r JOIN athletes a ON a.id = r.athlete_id ORDER BY r.status = \'offen\' DESC, r.id DESC LIMIT 100').map((r) => ({ id: r.id, aid: r.athlete_id, name: r.name, type: r.type, text: r.text, status: r.status, createdAt: r.created_at, handledBy: r.handled_by })),
      canManage: ctx.hasFeature('privacy.manage'),
    };
  });
  router.put('/api/privacy/dpia/:id', { feature: 'privacy.manage' }, async (ctx) => {
    const d = db.get('SELECT * FROM dpia WHERE id = ?', Number(ctx.params.id));
    if (!d) throw notFound('Punkt nicht gefunden.');
    const done = (await ctx.json()).done === true;
    db.run('UPDATE dpia SET done = ?, updated_at = ?, updated_by = ? WHERE id = ?', done ? 1 : 0, nowIso(), ctx.user.display_name, d.id);
    audit(db, ctx, { area: 'Datenschutz', action: `Umsetzungsstand: „${d.item}“ ${done ? 'erledigt' : 'wieder offen'}` });
    return { ok: true };
  });
  router.post('/api/privacy/rights-review/:role', { feature: 'privacy.manage' }, (ctx) => {
    if (!ROLE_KEYS.includes(ctx.params.role)) throw notFound('Rolle unbekannt.');
    db.run('INSERT INTO rights_review(role, last, next, by) VALUES (?,?,?,?) ON CONFLICT(role) DO UPDATE SET last = excluded.last, next = excluded.next, by = excluded.by', ctx.params.role, todayStr(), addDays(todayStr(), 365), ctx.user.display_name);
    audit(db, ctx, { area: 'Zugriffsrechte', action: `Rechteprüfung ${ROLES[ctx.params.role].label}`, result: 'erledigt' });
    return { ok: true };
  });
  router.put('/api/privacy/retention', { feature: 'privacy.manage' }, async (ctx) => {
    const b = await ctx.json();
    if (!b.periods || typeof b.periods !== 'object') throw badRequest('Ungültige Angaben.');
    for (const [cat, period] of Object.entries(b.periods)) {
      const p = str(period, 100);
      db.run("UPDATE retention SET period = ?, status = ? WHERE cat = ?", p, p ? 'festgelegt' : 'festzulegen', cat);
    }
    audit(db, ctx, { area: 'Datenschutz', action: 'Aufbewahrungsfristen gespeichert' });
    return { ok: true };
  });

  // Anfragen der Athlet:innen (Auskunft, Berichtigung, Datenschutzproblem)
  router.post('/api/athletes/:id/data-request', async (ctx) => {
    const acc = accessFor(db, ctx, ctx.params.id);
    need(db, ctx, acc, 'privacy', ['own'], 'Datenschutzanfrage');
    const b = await ctx.json();
    const type = str(b.type, 30);
    if (!['Auskunft', 'Berichtigung', 'Datenschutzproblem'].includes(type)) throw badRequest('Unbekannte Art der Anfrage.');
    db.run('INSERT INTO data_requests(athlete_id, type, text, created_at) VALUES (?,?,?,?)', acc.athlete.id, type, str(b.text, 1000), nowIso());
    audit(db, ctx, { athleteId: acc.athlete.id, area: 'Datenschutz', action: `Betroffenenrecht: ${type}`, result: 'eingegangen' });
    return { ok: true };
  });
  router.put('/api/privacy/requests/:id', { feature: 'privacy.manage' }, (ctx) => {
    const r = db.get('SELECT * FROM data_requests WHERE id = ?', Number(ctx.params.id));
    if (!r) throw notFound('Anfrage nicht gefunden.');
    db.run("UPDATE data_requests SET status = 'erledigt', handled_by = ?, handled_at = ? WHERE id = ?", ctx.user.display_name, nowIso(), r.id);
    audit(db, ctx, { athleteId: r.athlete_id, area: 'Datenschutz', action: `Anfrage „${r.type}“ erledigt` });
    return { ok: true };
  });

  // ------------------------------------------------------------------ Auskunft / Export
  router.get('/api/athletes/:id/export', (ctx) => {
    if (!ctx.hasFeature('export.athlete')) { ctx.deny?.('export.athlete'); throw forbidden(); }
    const acc = accessFor(db, ctx, ctx.params.id);
    if (acc.levels.overview === 'none') throw forbidden();
    const data = buildExport(db, ctx.user, acc);
    audit(db, ctx, { athleteId: acc.athlete.id, area: 'Datenschutz', action: 'Akte exportiert', result: ctx.user.role === 'athlet' ? 'eigene Daten' : 'nach eigenen Rechten' });
    const body = Buffer.from(JSON.stringify(data, null, 2), 'utf8');
    return rawResponse(body, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Disposition': `attachment; filename="${acc.athlete.id}-export-${todayStr()}.json"`, 'Cache-Control': 'no-store' });
  });

  // ------------------------------------------------------------------ Safeguarding
  const nextCaseId = () => `SG-${String((db.get("SELECT COUNT(*) AS n FROM safe_cases").n + 1)).padStart(2, '0')}`;
  const caseDto = (c) => ({ id: c.id, date: c.date, text: c.text, anon: !!c.anon, status: c.status, steps: c.steps, from: c.from_athlete });

  router.post('/api/safeguarding/report', { feature: 'safeguarding.report' }, async (ctx) => {
    const b = await ctx.json();
    const text = str(b.text, 5000);
    if (!text) throw badRequest('Bitte schildern, was du melden möchtest.');
    const anon = b.anon !== false;
    let id = nextCaseId();
    while (db.get('SELECT 1 AS x FROM safe_cases WHERE id = ?', id)) id = `SG-${String(Number(id.slice(3)) + 1).padStart(2, '0')}`;
    const now = nowIso();
    db.run('INSERT INTO safe_cases(id, date, text, anon, from_athlete, status, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?)', id, todayStr(), text, anon ? 1 : 0, anon ? null : ctx.user.athlete_id, 'neu', now, now);
    // Das Protokoll hält nur fest, DASS gemeldet wurde – nicht von wem, wenn anonym.
    audit(db, anon ? { ...ctx, user: null, realUser: null } : ctx, { area: 'Safeguarding', action: 'Vertrauliche Meldung eingegangen', userName: anon ? 'anonym' : undefined });
    return { ok: true };
  });
  router.get('/api/safeguarding/cases', { feature: 'safeguarding.cases' }, (ctx) => {
    audit(db, ctx, { area: 'Safeguarding', action: 'Fälle geöffnet', result: 'eigener Fallbereich', dedupe: true });
    return { cases: db.all('SELECT * FROM safe_cases ORDER BY id DESC').map(caseDto), athletes: db.all("SELECT id, name FROM athletes ORDER BY name COLLATE NOCASE").map((a) => ({ id: a.id, name: a.name })) };
  });
  router.put('/api/safeguarding/cases/:id', { feature: 'safeguarding.cases' }, async (ctx) => {
    const c = db.get('SELECT * FROM safe_cases WHERE id = ?', ctx.params.id);
    if (!c) throw notFound('Fall nicht gefunden.');
    const b = await ctx.json();
    const status = str(b.status, 40);
    if (!['neu', 'in Bearbeitung', 'Schutzmaßnahme aktiv', 'an externe Stelle übergeben', 'abgeschlossen'].includes(status)) throw badRequest('Ungültiger Status.');
    db.run('UPDATE safe_cases SET status = ?, steps = ?, updated_at = ?, updated_by = ? WHERE id = ?', status, str(b.steps, 2000), nowIso(), ctx.user.display_name, c.id);
    audit(db, ctx, { area: 'Safeguarding', action: `Fall ${c.id} aktualisiert`, detail: status });
    return { ok: true };
  });
  // Zugriff auf Akteninfos nur im Schutzfall: mit Begründung, minimal, protokolliert
  router.post('/api/safeguarding/access', { feature: 'safeguarding.cases' }, async (ctx) => {
    const b = await ctx.json();
    const why = str(b.why, 300);
    if (why.length < 10) throw badRequest('Bitte den Schutzfall und die Begründung benennen (mindestens 10 Zeichen).');
    const a = db.get('SELECT * FROM athletes WHERE id = ?', str(b.athleteId, 30));
    if (!a) throw notFound('Akte nicht gefunden.');
    audit(db, ctx, { athleteId: a.id, area: 'Safeguarding', action: `Schutzfall-Zugriff: ${why}`, result: 'erlaubt (Schutzfall)' });
    const team = db.all('SELECT s.function, u.display_name AS name FROM athlete_staff s JOIN users u ON u.id = s.user_id WHERE s.athlete_id = ?', a.id);
    const st = db.get('SELECT color FROM load_status WHERE athlete_id = ?', a.id);
    return { athlete: { id: a.id, name: a.name, group: a.group_name, sport: a.sport, boarding: !!a.boarding, guardian: a.guardian, emergency: a.emergency, status: a.status, loadStatus: st?.color || 'gruen', team } };
  });
}
