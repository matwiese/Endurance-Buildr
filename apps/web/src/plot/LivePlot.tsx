import { useEffect, useRef } from 'react';
import type { LiveEngine } from '../live/engine.ts';
import { decimateMinMax } from '../live/ringBuffer.ts';
import { PLOT_MARGINS, niceTicks, prepareCanvas, readTheme } from './plotCore.ts';

export interface LiveMarker {
  kind: 'takeoff' | 'landing' | 'impact';
  /** Ringpuffer-Index */
  ringIdx: number;
}

interface Props {
  engine: LiveEngine | null;
  /** sichtbares Zeitfenster (s) */
  windowS: number;
  /** Körpergewichtslinie (N), optional */
  bwN?: number | null;
  markers?: LiveMarker[];
  /** feste obere Achsengrenze (N), sonst automatisch */
  yMaxN?: number;
  className?: string;
  ariaLabel: string;
  /** Beschriftung der Kurven */
  labels: { left: string; right: string; total: string; bw: string };
}

const MARKER_COLOR: Record<LiveMarker['kind'], string> = {
  takeoff: '#4cb782',
  landing: '#e0735a',
  impact: '#e0735a',
};
const MARKER_LABEL: Record<LiveMarker['kind'], string> = { takeoff: 'T', landing: 'L', impact: 'I' };

/**
 * Live-Kraftkurve (Links, Rechts, Summe, Körpergewichtslinie) direkt aus dem Ringpuffer. Zeichnet per requestAnimationFrame mit
 * Min/Max-Dezimierung je Pixelspalte (60 fps bei 1000 Hz × 2 Kanäle) – nur während die Komponente sichtbar ist.
 */
export function LivePlot({ engine, windowS, bwN, markers, yMaxN, className, ariaLabel, labels }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const propsRef = useRef({ windowS, bwN, markers, yMaxN, labels });
  propsRef.current = { windowS, bwN, markers, yMaxN, labels };
  const yScale = useRef({ lo: -50, hi: 200 });

  useEffect(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas) return;
    let raf = 0;
    let alive = true;
    let theme = readTheme(wrap);
    let themeAt = 0;
    const colsL: { min: Float32Array; max: Float32Array } = {
      min: new Float32Array(0),
      max: new Float32Array(0),
    };
    void colsL;

    const frame = (now: number) => {
      if (!alive) return;
      raf = requestAnimationFrame(frame);
      const rect = wrap.getBoundingClientRect();
      if (rect.width < 10 || rect.height < 10) return;
      const surf = prepareCanvas(canvas, rect.width, rect.height);
      if (!surf) return;
      if (now - themeAt > 1000) {
        theme = readTheme(wrap);
        themeAt = now;
      }
      draw(surf.ctx, surf.w, surf.h, now);
    };

    const draw = (ctx: CanvasRenderingContext2D, W: number, H: number, now: number) => {
      const p = propsRef.current;
      const m = PLOT_MARGINS;
      const x0 = m.left;
      const x1 = W - m.right;
      const y0 = m.top;
      const y1 = H - m.bottom;
      ctx.fillStyle = theme.bg;
      ctx.fillRect(0, 0, W, H);
      const eng = engine;
      const ring = eng?.ring;
      const hz = eng?.hz ?? 1000;
      const nVis = Math.max(10, Math.round(p.windowS * hz));
      const count = ring?.count ?? 0;
      const to = count;
      const from = Math.max(ring ? ring.firstIdx : 0, to - nVis);
      const cols = Math.max(2, Math.floor(x1 - x0));

      // Datenbereich und Achsenskalierung
      let dMin = 0;
      let dMax = 0;
      let lo: { min: Float32Array; max: Float32Array } | null = null;
      let ro: { min: Float32Array; max: Float32Array } | null = null;
      let so: { min: Float32Array; max: Float32Array } | null = null;
      if (ring && to - from > 1) {
        lo = decimateMinMax((i) => ring.left[i % ring.capacity]!, from, to, cols);
        ro = decimateMinMax((i) => ring.right[i % ring.capacity]!, from, to, cols);
        so = decimateMinMax(
          (i) => ring.left[i % ring.capacity]! + ring.right[i % ring.capacity]!,
          from,
          to,
          cols,
        );
        for (let c = 0; c < cols; c++) {
          dMin = Math.min(dMin, lo.min[c]!, ro.min[c]!, so.min[c]!);
          dMax = Math.max(dMax, lo.max[c]!, ro.max[c]!, so.max[c]!);
        }
      }
      const ref = p.bwN ? p.bwN * 1.25 : 150;
      let targetHi = p.yMaxN ?? Math.max(dMax * 1.08, ref);
      let targetLo = Math.min(-10, dMin * 1.05 - 5);
      if (p.yMaxN) targetLo = Math.min(targetLo, -p.yMaxN * 0.02);
      const ys = yScale.current;
      // schnell wachsen, langsam schrumpfen: ruhige Achse ohne Zittern
      ys.hi = targetHi > ys.hi ? targetHi : ys.hi + (targetHi - ys.hi) * 0.03;
      ys.lo = targetLo < ys.lo ? targetLo : ys.lo + (targetLo - ys.lo) * 0.03;
      targetHi = ys.hi;
      targetLo = ys.lo;
      const yOf = (v: number): number => y1 - ((v - targetLo) / (targetHi - targetLo)) * (y1 - y0);

      // Raster und Achsen
      ctx.font = '12px ui-sans-serif, system-ui, sans-serif';
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'right';
      ctx.lineWidth = 1;
      for (const v of niceTicks(targetLo, targetHi, 6)) {
        const y = Math.round(yOf(v)) + 0.5;
        ctx.strokeStyle = theme.grid;
        ctx.globalAlpha = v === 0 ? 0.9 : 0.4;
        ctx.beginPath();
        ctx.moveTo(x0, y);
        ctx.lineTo(x1, y);
        ctx.stroke();
        ctx.globalAlpha = 1;
        ctx.fillStyle = theme.muted;
        ctx.fillText(`${v} N`, x0 - 6, y);
      }
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      const secTicks = niceTicks(-p.windowS, 0, 5);
      for (const s of secTicks) {
        const x = Math.round(x1 + (s / p.windowS) * (x1 - x0)) + 0.5;
        ctx.strokeStyle = theme.grid;
        ctx.globalAlpha = 0.3;
        ctx.beginPath();
        ctx.moveTo(x, y0);
        ctx.lineTo(x, y1);
        ctx.stroke();
        ctx.globalAlpha = 1;
        ctx.fillStyle = theme.muted;
        ctx.fillText(`${s} s`, x, y1 + 6);
      }

      // Körpergewichtslinie
      if (p.bwN) {
        const y = yOf(p.bwN);
        ctx.setLineDash([6, 5]);
        ctx.strokeStyle = theme.bw;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(x0, y);
        ctx.lineTo(x1, y);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = theme.bw;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'bottom';
        ctx.fillText(p.labels.bw, x0 + 6, y - 3);
      }

      // Kurven
      const series: Array<[typeof lo, string, number]> = [
        [lo, theme.left, 1.4],
        [ro, theme.right, 1.4],
        [so, theme.sum, 2.2],
      ];
      for (const [d, color, w] of series) {
        if (!d) continue;
        ctx.strokeStyle = color;
        ctx.lineWidth = w;
        ctx.lineJoin = 'round';
        ctx.beginPath();
        let prevMid = NaN;
        for (let c = 0; c < cols; c++) {
          const x = x0 + c + 0.5;
          const ymin = yOf(d.min[c]!);
          const ymax = yOf(d.max[c]!);
          // Spaltenhülle als Strich + Verbindung zur Vorspalte: lückenloser Linienzug
          if (c === 0 || Number.isNaN(prevMid)) ctx.moveTo(x, ymax);
          else ctx.lineTo(x, ymax);
          if (Math.abs(ymin - ymax) > 0.5) ctx.lineTo(x, ymin);
          prevMid = (ymin + ymax) / 2;
        }
        ctx.stroke();
      }

      // Marker (Takeoff/Landung) live in der Kurve
      for (const mk of p.markers ?? []) {
        if (mk.ringIdx < from || mk.ringIdx > to) continue;
        const x = x0 + ((mk.ringIdx - from) / (to - from)) * (x1 - x0);
        ctx.strokeStyle = MARKER_COLOR[mk.kind];
        ctx.lineWidth = 1.5;
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.moveTo(x, y0);
        ctx.lineTo(x, y1);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = MARKER_COLOR[mk.kind];
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.font = 'bold 12px ui-sans-serif, system-ui, sans-serif';
        ctx.fillText(MARKER_LABEL[mk.kind], x, y0 + 2);
        ctx.font = '12px ui-sans-serif, system-ui, sans-serif';
      }

      // Legende
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      let lx = x0 + 8;
      const ly = y0 + 12;
      for (const [txt, col] of [
        [p.labels.left, theme.left],
        [p.labels.right, theme.right],
        [p.labels.total, theme.sum],
      ] as const) {
        ctx.fillStyle = col;
        ctx.fillRect(lx, ly - 4, 14, 8);
        ctx.fillStyle = theme.text;
        ctx.fillText(txt, lx + 19, ly);
        lx += 28 + ctx.measureText(txt).width + 10;
      }
      eng?.noteFrame(now);
    };

    raf = requestAnimationFrame(frame);
    return () => {
      alive = false;
      cancelAnimationFrame(raf);
    };
  }, [engine]);

  return (
    <div ref={wrapRef} className={className ?? 'h-full w-full'}>
      <canvas
        ref={canvasRef}
        role="img"
        aria-label={ariaLabel}
        className="block h-full w-full rounded-xl"
        data-testid="live-plot"
      />
    </div>
  );
}
