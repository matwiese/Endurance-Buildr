// Berechnungen auf dem gefilterten Schnappschuss (/api/core) – aus dem Prototyp übernommen
import { get } from './api.js';
import { addDays, dayDiff } from './util.js';

export const getCore = (athleteId) => get('/api/core' + (athleteId ? `?athlete=${encodeURIComponent(athleteId)}` : ''));

export const days14 = (core) => { const d = []; for (let i = -13; i <= 0; i++) d.push(addDays(i, core.today)); return d; };

// Anteil der Tage mit Tages-Check in den letzten 14 Tagen. Fehlende Tage bleiben Lücken.
export function completeness(core, aid) {
  const r = core.readiness[aid] || {};
  return days14(core).filter((d) => r[d]).length / 14;
}
// vollständig absolvierte / geplante Einheiten der letzten 13 Tage
export function availability(core, aid) {
  const past = core.sessions.filter((s) => s.aid === aid && dayDiff(s.date, core.today) < 0 && dayDiff(s.date, core.today) >= -13);
  return past.length ? past.filter((s) => s.status === 'vollständig').length / past.length : null;
}
// Belastung = Summe Dauer × Session-RPE; off=0 diese, off=1 Vorwoche
export function weekLoad(core, aid, off = 0) {
  const from = -6 - 7 * off, to = -7 * off;
  return core.sessions.filter((s) => s.aid === aid && s.rpe != null && s.duration != null && dayDiff(s.date, core.today) >= from && dayDiff(s.date, core.today) <= to)
    .reduce((t, s) => t + s.duration * s.rpe, 0);
}
export const loadChange = (core, aid) => { const w0 = weekLoad(core, aid, 0), w1 = weekLoad(core, aid, 1); return w1 ? (w0 - w1) / w1 : null; };
export const openMeasures = (core, aid) => (core.plans[aid]?.measures || []).filter((m) => m.status !== 'beendet');
export const planComplete = (plan) => !!(plan && plan.baseline && plan.longTerm && plan.goals.length && plan.measures.length && plan.measures.every((m) => m.resp && m.review && m.criterion));
export const readinessToday = (core, aid) => core.readiness[aid]?.[core.today] || null;
export const upcoming = (core, aid, n = 6) => core.sessions.filter((s) => s.aid === aid && dayDiff(s.date, core.today) >= 0 && dayDiff(s.date, core.today) <= n);
