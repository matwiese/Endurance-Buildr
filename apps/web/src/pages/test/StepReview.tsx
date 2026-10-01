import { TEST_TYPES, TEST_TYPE_INFO, getMetric, type TestType } from '@buildr/core';
import { useMemo, useState } from 'react';
import { RepResults, typeLabel } from '../../components/RepResults.tsx';
import { Banner, Button, Card, Chip, Modal, Toggle } from '../../components/ui.tsx';
import { useMetricFormat, useT } from '../../i18n/hooks.ts';
import { analyzeViaEngine } from '../../lib/analyze.ts';
import { repAnnotations, repPhaseRegions, type AnnotKey } from '../../lib/repDetail.ts';
import { summarize } from '../../lib/summary.ts';
import { PHASE_COLORS } from '../../plot/plotCore.ts';
import { TracePlot, type Annot, type Curve, type Region } from '../../plot/TracePlot.tsx';
import { analysisConfigFrom, tilesFor, useSettings } from '../../state/settings.ts';
import { useWorkflow, type ReviewRep } from '../../state/workflow.ts';

const ANNOT_COLOR: Record<AnnotKey, string> = {
  onset: '#6fa29a',
  vMax: '#d9aa76',
  zeroVel: '#b58b5b',
  takeoff: '#4cb782',
  landing: '#e0735a',
  peak: '#d9aa76',
};

const OVERLAY_COLORS = [
  '#58a6ff',
  '#f0a04b',
  '#4cb782',
  '#e0735a',
  '#c58af9',
  '#f2d16b',
  '#6fd4d4',
  '#ff8fb0',
];

/** Anker (Sample) einer Rep für die zeitliche Ausrichtung: Onset bzw. Kontaktbeginn bzw. Fensteranfang. */
const alignOf = (r: ReviewRep): number => r.events['onset'] ?? r.events['contactStart'] ?? r.startIdx;

export function StepReview({ onNext, onAgain }: { onNext: () => void; onAgain: () => void }) {
  const { t, tw, lang } = useT();
  const wf = useWorkflow();
  const settings = useSettings();
  const { label, format } = useMetricFormat();
  const [split, setSplit] = useState(false);
  const [overlay, setOverlay] = useState(false);
  const [rangeMode, setRangeMode] = useState(false);
  const [range, setRange] = useState<{ a: number; b: number } | null>(null);
  const [rangeType, setRangeType] = useState<TestType>('cmj');
  const [confirmDiscard, setConfirmDiscard] = useState(false);

  const rec = wf.recording;
  const hz = rec?.trace.hz ?? 1000;
  const mass = wf.recording?.bodyMassKg ?? wf.analysis?.bodyMassKg ?? 0;
  const load = wf.analysis?.externalLoadKg ?? 0;
  const visible = wf.reps.filter((r) => !r.removed);
  const selected = visible.find((r) => r.key === wf.selectedKey) ?? visible[0] ?? null;
  const config = analysisConfigFrom(settings);

  const total = useMemo(() => {
    if (!rec) return null;
    const out = new Float32Array(rec.trace.left.length);
    for (let i = 0; i < out.length; i++) out[i] = rec.trace.left[i]! + rec.trace.right[i]!;
    return out;
  }, [rec]);

  const grouped = useMemo(() => {
    const m = new Map<string, ReviewRep[]>();
    for (const r of visible) {
      const k = r.type;
      m.set(k, [...(m.get(k) ?? []), r]);
    }
    return m;
  }, [visible]);

  // Darstellung: Zeitachse relativ zum Anker der gewählten Rep
  const plot = useMemo(() => {
    if (!rec || !total || !selected) return null;
    const curves: Curve[] = [];
    const regions: Region[] = [];
    const annots: Annot[] = [];
    let tMin = 0;
    let tMax = 1;
    const sliceCurve = (
      r: ReviewRep,
      id: string,
      data: ArrayLike<number>,
      color: string,
      width: number,
      alpha = 1,
    ): Curve => {
      const a = Math.max(0, r.startIdx);
      const b = Math.min(data.length, r.endIdx);
      const al = alignOf(r);
      const arr = Array.prototype.slice.call(data, a, b) as number[];
      return { id, data: Float32Array.from(arr), t0: (a - al) / hz, hz, color, width, alpha };
    };
    const reps = overlay
      ? visible.filter((r) => r.included && r.type !== 'unclear' && r.type === selected.type)
      : [selected];
    reps.forEach((r, i) => {
      const color = overlay ? OVERLAY_COLORS[i % OVERLAY_COLORS.length]! : 'var(--sum)';
      if (split && !overlay) {
        curves.push(sliceCurve(r, 'L', rec.trace.left, 'var(--left)', 1.6));
        curves.push(sliceCurve(r, 'R', rec.trace.right, 'var(--right)', 1.6));
      }
      curves.push(
        sliceCurve(
          r,
          overlay ? `#${r.index + 1}` : 'Σ',
          total,
          color,
          overlay ? 1.6 : 2.4,
          overlay ? 0.9 : 1,
        ),
      );
      const c = curves[curves.length - 1]!;
      tMin = Math.min(tMin, c.t0);
      tMax = Math.max(tMax, c.t0 + c.data.length / hz);
    });
    if (!overlay) {
      const al = alignOf(selected);
      for (const reg of repPhaseRegions(selected))
        regions.push({
          a: (reg.a - al) / hz,
          b: (reg.b - al) / hz,
          color: PHASE_COLORS[reg.key],
          label: reg.key,
        });
      for (const an of repAnnotations(selected, total, hz, mass, load))
        annots.push({
          t: (an.idx - al) / hz,
          label: t(`results.event.${an.key}` as 'results.event.onset'),
          color: ANNOT_COLOR[an.key],
        });
    }
    return { curves, regions, annots, tMin, tMax, align: alignOf(selected) };
  }, [rec, total, selected, overlay, split, visible, hz, mass, load, t]);

  if (!rec || !wf.analysis) return <Banner>{t('results.noReps')}</Banner>;

  const bwN = (mass + load) * 9.80665;
  const analyze = analyzeViaEngine;
  const typeOptions = TEST_TYPES;
  const hopBlocks = [
    ...new Set(
      visible
        .filter((r) => r.type !== 'unclear' && TEST_TYPE_INFO[r.type].family === 'hop')
        .map((r) => r.blockIndex),
    ),
  ];
  const selTiles = selected && selected.type !== 'unclear' ? tilesFor(settings, selected.type) : [];
  const sum =
    selected && selected.type !== 'unclear' ? summarize(grouped.get(selected.type) ?? [], selTiles) : [];
  const nIncluded = visible.filter((r) => r.included && !r.leadIn).length;

  return (
    <div className="grid gap-4">
      {visible.length === 0 && <Banner tone="warn">{t('results.noReps')}</Banner>}
      <div className="grid gap-4 xl:grid-cols-[320px_1fr]">
        <Card title={t('review.reps')} className="max-h-[70vh] overflow-y-auto">
          <p className="mb-2 text-xs text-muted">{t('review.testsFound', { n: grouped.size })}</p>
          <ul className="grid gap-2" data-testid="rep-list">
            {visible.map((r, i) => {
              const sel = selected?.key === r.key;
              return (
                <li key={r.key}>
                  <div
                    className={`rounded-xl border p-2 ${sel ? 'border-primary bg-surface2' : 'border-line'} ${r.included ? '' : 'opacity-60'}`}
                  >
                    <button
                      type="button"
                      className="w-full text-left"
                      onClick={() => wf.select(r.key)}
                      data-testid={`rep-${i}`}
                    >
                      <div className="font-semibold">
                        {t('results.rep', { n: r.hopIndex ?? i + 1 })} ·{' '}
                        {typeLabel(r.type, lang, t('record.unclear'))}
                      </div>
                      <div className="flex flex-wrap gap-1 pt-1">
                        {r.confidence !== null && (
                          <Chip tone={r.confidence > 0.75 ? 'ok' : 'warn'}>
                            {Math.round(r.confidence * 100)} %
                          </Chip>
                        )}
                        {r.leadIn && <Chip tone="warn">{t('review.leadIn')}</Chip>}
                        {r.warnings.some((w) => w.code === 'unstable_before_movement') && (
                          <Chip tone="warn">⚠ {t('review.unstable')}</Chip>
                        )}
                        {r.manual && <Chip>✎</Chip>}
                      </div>
                    </button>
                    <div className="mt-2 flex items-center justify-between">
                      <Toggle
                        label={t('review.include')}
                        checked={r.included}
                        onChange={() => wf.toggleInclude(r.key)}
                      />
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => wf.deleteRep(r.key)}
                        aria-label={t('review.delete')}
                        data-testid={`rep-delete-${i}`}
                      >
                        🗑
                      </Button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button size="sm" disabled={wf.undo.length === 0} onClick={() => wf.undoLast()}>
              ↶ {t('review.restore')}
            </Button>
            {hopBlocks.map((b) => (
              <Button key={b} size="sm" onClick={() => wf.selectBestN(b, settings.hopBestN || 5, 'rsi')}>
                {t('review.bestN', { n: settings.hopBestN || 5 })}
              </Button>
            ))}
          </div>
        </Card>

        <div className="grid gap-4">
          <Card
            title={t('results.curve')}
            actions={
              <div className="flex flex-wrap items-center gap-4 text-sm">
                <Toggle label={t('results.split')} checked={split} onChange={setSplit} disabled={overlay} />
                <Toggle label={t('results.overlay')} checked={overlay} onChange={setOverlay} />
                <Toggle
                  label={t('review.addTrial')}
                  checked={rangeMode}
                  onChange={(v) => {
                    setRangeMode(v);
                    if (!v) setRange(null);
                  }}
                />
              </div>
            }
          >
            <div className="h-[40vh] min-h-64">
              {plot && (
                <TracePlot
                  curves={plot.curves}
                  regions={plot.regions}
                  annots={plot.annots}
                  bwN={bwN}
                  tMin={plot.tMin}
                  tMax={plot.tMax}
                  selectable={rangeMode}
                  selection={range}
                  onSelect={(a, b) => setRange({ a, b })}
                  ariaLabel={t('results.curve')}
                  bwLabel="BW"
                />
              )}
            </div>
            <div className="mt-2 flex flex-wrap gap-3 text-xs text-muted">
              {(['unweighting', 'braking', 'concentric', 'flight', 'landing'] as const).map((k) => (
                <span key={k} className="inline-flex items-center gap-1">
                  <span className="inline-block h-3 w-3 rounded" style={{ background: PHASE_COLORS[k] }} />
                  {t(`results.phase.${k}` as 'results.phase.flight')}
                </span>
              ))}
            </div>
            {rangeMode && (
              <div
                className="mt-3 flex flex-wrap items-end gap-3 rounded-xl border border-line p-3"
                data-testid="range-panel"
              >
                <span className="text-sm text-muted">{t('review.addTrial.hint')}</span>
                <select
                  className="input w-80"
                  value={rangeType}
                  onChange={(e) => setRangeType(e.target.value as TestType)}
                >
                  {typeOptions.map((ty) => (
                    <option key={ty} value={ty}>
                      {TEST_TYPE_INFO[ty].label[lang]}
                    </option>
                  ))}
                </select>
                <Button
                  variant="primary"
                  disabled={!range || wf.busy}
                  onClick={async () => {
                    if (!range || !plot) return;
                    const a = plot.align + range.a * hz;
                    const b = plot.align + range.b * hz;
                    await wf.addRange(a, b, rangeType, analyze, config);
                    setRange(null);
                    setRangeMode(false);
                  }}
                  data-testid="range-analyze"
                >
                  {t('review.analyzeRange')}
                </Button>
              </div>
            )}
          </Card>

          {selected && (
            <Card
              title={selected.type === 'unclear' ? t('record.unclear') : t('results.metrics')}
              actions={
                <div className="flex items-center gap-2">
                  <label className="text-sm text-muted" htmlFor="relabel">
                    {t('review.relabel')}
                  </label>
                  <select
                    id="relabel"
                    data-testid="relabel"
                    className="input w-80"
                    value={selected.type === 'unclear' ? '' : selected.type}
                    disabled={wf.busy}
                    onChange={(e) =>
                      e.target.value &&
                      void wf.relabel(selected.key, e.target.value as TestType, analyze, config)
                    }
                  >
                    {selected.type === 'unclear' && <option value="">—</option>}
                    {typeOptions.map((ty) => (
                      <option key={ty} value={ty}>
                        {TEST_TYPE_INFO[ty].label[lang]}
                      </option>
                    ))}
                  </select>
                </div>
              }
            >
              {selected.type === 'unclear' && selected.candidates && (
                <p className="mb-2 text-sm text-muted">
                  {selected.candidates
                    .slice(0, 3)
                    .map((c) => `${TEST_TYPE_INFO[c.type].label[lang]} (${Math.round(c.score * 100)} %)`)
                    .join(' · ')}
                </p>
              )}
              <RepResults rep={selected} />
              <p className="mt-2 text-xs text-muted">{t('results.asymHelp')}</p>
            </Card>
          )}

          {selected &&
            selected.type !== 'unclear' &&
            sum.some((s) => s.n > 0) &&
            (grouped.get(selected.type)?.filter((r) => r.included && !r.leadIn).length ?? 0) > 1 && (
              <Card
                title={t('results.summary', {
                  n: grouped.get(selected.type)!.filter((r) => r.included && !r.leadIn).length,
                })}
              >
                <div className="overflow-x-auto">
                  <table className="table-base">
                    <thead>
                      <tr>
                        <th />
                        <th>{t('results.mean')}</th>
                        <th>{t('results.sd')}</th>
                        <th>{t('results.best')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sum.map((s) => (
                        <tr key={s.key}>
                          <td>{label(s.key)}</td>
                          <td className="tabular-nums">{format(s.key, s.mean)}</td>
                          <td className="tabular-nums">{s.sd === null ? '–' : format(s.key, s.sd, false)}</td>
                          <td className="tabular-nums">
                            {getMetric(s.key)?.kind === 'asymmetry' ? '–' : format(s.key, s.best)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            )}
          {selected && selected.warnings.length > 0 && (
            <Card title="⚠">
              <ul className="space-y-1 text-sm">
                {selected.warnings.map((w, i) => (
                  <li key={i}>{tw(w.code, w.params)}</li>
                ))}
              </ul>
            </Card>
          )}
          {wf.analysis.warnings.filter((w) =>
            ['failed_attempt', 'weight_estimated', 'no_weight', 'auto_detect_needs_weight'].includes(w.code),
          ).length > 0 && (
            <Card>
              <ul className="space-y-1 text-sm text-muted">
                {wf.analysis.warnings
                  .filter((w) =>
                    ['failed_attempt', 'weight_estimated', 'no_weight', 'auto_detect_needs_weight'].includes(
                      w.code,
                    ),
                  )
                  .map((w, i) => (
                    <li key={i}>{tw(w.code, w.params)}</li>
                  ))}
              </ul>
            </Card>
          )}
        </div>
      </div>

      <div className="sticky bottom-2 z-10 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-surface p-3 shadow-lg">
        <div className="flex gap-3">
          <Button onClick={onAgain}>⟲ {t('review.again')}</Button>
          <Button variant="ghost" onClick={() => setConfirmDiscard(true)}>
            {t('review.discard')}
          </Button>
        </div>
        <Button
          variant="primary"
          size="lg"
          disabled={nIncluded === 0 || visible.some((r) => r.included && r.type === 'unclear')}
          onClick={onNext}
          data-testid="next-button"
        >
          {t('common.next')} →
        </Button>
      </div>
      {confirmDiscard && (
        <Modal title={t('review.discard')} onClose={() => setConfirmDiscard(false)}>
          <p className="mb-4">{t('review.discard.confirm')}</p>
          <div className="flex justify-end gap-3">
            <Button onClick={() => setConfirmDiscard(false)}>{t('common.cancel')}</Button>
            <Button
              variant="danger"
              onClick={() => {
                setConfirmDiscard(false);
                onAgain();
              }}
            >
              {t('review.discard')}
            </Button>
          </div>
        </Modal>
      )}
    </div>
  );
}
