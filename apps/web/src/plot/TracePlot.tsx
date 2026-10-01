import { useCallback, useEffect, useRef } from 'react';
import { decimateMinMax } from '../live/ringBuffer.ts';
import {
  PLOT_MARGINS,
  niceTicks,
  prepareCanvas,
  readTheme,
  resolveColor,
  type PlotTheme,
} from './plotCore.ts';

export interface Curve {
  id: string;
  data: ArrayLike<number>;
  /** Zeit (s) des ersten Samples relativ zur Ausrichtung (z. B. Onset = 0) */
  t0: number;
  hz: number;
  color: string;
  width?: number;
  alpha?: number;
  dash?: number[];
}
export interface Region {
  a: number;
  b: number;
  color: string;
  label?: string;
}
export interface Annot {
  t: number;
  label: string;
  color?: string;
}

interface Props {
  curves: Curve[];
  regions?: Region[];
  annots?: Annot[];
  bwN?: number | null;
  tMin: number;
  tMax: number;
  yMax?: number;
  selectable?: boolean;
  selection?: { a: number; b: number } | null;
  /** Auswahl in Sekunden (relativ zur Ausrichtung) */
  onSelect?: (a: number, b: number) => void;
  ariaLabel: string;
  className?: string;
  bwLabel?: string;
}

/** Statischer Kraft-Zeit-Plot mit Phasenflächen, Annotationen, Überlagerung, Fadenkreuz und Bereichsauswahl. */
export function TracePlot(props: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const propsRef = useRef(props);
  propsRef.current = props;
  const hover = useRef<{ x: number; y: number } | null>(null);
  const drag = useRef<{ a: number; b: number } | null>(null);
  const raf = useRef(0);
  const geom = useRef({ x0: 0, x1: 1, tMin: 0, tMax: 1 });

  const draw = useCallback(() => {
    raf.current = 0;
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas) return;
    const rect = wrap.getBoundingClientRect();
    if (rect.width < 10 || rect.height < 10) return;
    const surf = prepareCanvas(canvas, rect.width, rect.height);
    if (!surf) return;
    const { ctx, w: W, h: H } = surf;
    const p = propsRef.current;
    const theme: PlotTheme = readTheme(wrap);
    const m = PLOT_MARGINS;
    const x0 = m.left;
    const x1 = W - m.right;
    const y0 = m.top;
    const y1 = H - m.bottom;
    const span = p.tMax - p.tMin || 1;
    geom.current = { x0, x1, tMin: p.tMin, tMax: p.tMax };
    const xOf = (t: number): number => x0 + ((t - p.tMin) / span) * (x1 - x0);

    ctx.fillStyle = theme.bg;
    ctx.fillRect(0, 0, W, H);

    // Wertebereich aus den sichtbaren Daten
    let dMax = p.bwN ? p.bwN * 1.2 : 100;
    let dMin = 0;
    const cols = Math.max(2, Math.floor(x1 - x0));
    const decimated: Array<{ c: Curve; min: Float32Array; max: Float32Array }> = [];
    for (const c of p.curves) {
      const i0 = Math.max(0, Math.floor((p.tMin - c.t0) * c.hz));
      const i1 = Math.min(c.data.length, Math.ceil((p.tMax - c.t0) * c.hz));
      if (i1 - i0 < 2) continue;
      // Spalten auf den sichtbaren Anteil begrenzen
      const tA = c.t0 + i0 / c.hz;
      const tB = c.t0 + i1 / c.hz;
      const ca = Math.max(0, Math.floor(((tA - p.tMin) / span) * cols));
      const cb = Math.min(cols, Math.ceil(((tB - p.tMin) / span) * cols));
      const n = Math.max(2, cb - ca);
      const d = decimateMinMax((i) => c.data[i]!, i0, i1, n);
      const fullMin = new Float32Array(cols).fill(NaN);
      const fullMax = new Float32Array(cols).fill(NaN);
      for (let k = 0; k < n; k++) {
        fullMin[ca + k] = d.min[k]!;
        fullMax[ca + k] = d.max[k]!;
        dMax = Math.max(dMax, d.max[k]!);
        dMin = Math.min(dMin, d.min[k]!);
      }
      decimated.push({ c, min: fullMin, max: fullMax });
    }
    const hi = p.yMax ?? dMax * 1.06;
    const lo = Math.min(0, dMin * 1.05);
    const yOf = (v: number): number => y1 - ((v - lo) / (hi - lo)) * (y1 - y0);

    // Phasenflächen
    for (const r of p.regions ?? []) {
      const a = Math.max(x0, xOf(r.a));
      const b = Math.min(x1, xOf(r.b));
      if (b <= a) continue;
      ctx.fillStyle = r.color;
      ctx.fillRect(a, y0, b - a, y1 - y0);
    }

    // Raster
    ctx.font = '12px ui-sans-serif, system-ui, sans-serif';
    ctx.lineWidth = 1;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    for (const v of niceTicks(lo, hi, 6)) {
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
    for (const t of niceTicks(p.tMin, p.tMax, 7)) {
      const x = Math.round(xOf(t)) + 0.5;
      ctx.strokeStyle = theme.grid;
      ctx.globalAlpha = t === 0 ? 0.8 : 0.3;
      ctx.beginPath();
      ctx.moveTo(x, y0);
      ctx.lineTo(x, y1);
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.fillStyle = theme.muted;
      ctx.fillText(`${Number(t.toFixed(2))} s`, x, y1 + 6);
    }

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
      ctx.fillText(p.bwLabel ?? 'BW', x0 + 6, y - 3);
    }

    // Kurven
    for (const d of decimated) {
      ctx.strokeStyle = resolveColor(wrap, d.c.color);
      ctx.lineWidth = d.c.width ?? 1.8;
      ctx.globalAlpha = d.c.alpha ?? 1;
      ctx.setLineDash(d.c.dash ?? []);
      ctx.lineJoin = 'round';
      ctx.beginPath();
      let started = false;
      for (let c = 0; c < cols; c++) {
        const mx = d.max[c]!;
        if (Number.isNaN(mx)) {
          started = false;
          continue;
        }
        const x = x0 + c + 0.5;
        if (!started) {
          ctx.moveTo(x, yOf(mx));
          started = true;
        } else ctx.lineTo(x, yOf(mx));
        if (Math.abs(d.max[c]! - d.min[c]!) * ((y1 - y0) / (hi - lo)) > 0.5) ctx.lineTo(x, yOf(d.min[c]!));
      }
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
    }

    // Annotationen
    ctx.textBaseline = 'top';
    let row = 0;
    for (const a of [...(p.annots ?? [])].sort((u, v) => u.t - v.t)) {
      if (a.t < p.tMin || a.t > p.tMax) continue;
      const x = xOf(a.t);
      ctx.strokeStyle = a.color ?? theme.accent;
      ctx.fillStyle = a.color ?? theme.accent;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 3]);
      ctx.beginPath();
      ctx.moveTo(x, y0);
      ctx.lineTo(x, y1);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.textAlign = x > x1 - 80 ? 'right' : 'left';
      ctx.font = 'bold 12px ui-sans-serif, system-ui, sans-serif';
      ctx.fillText(a.label, x + (ctx.textAlign === 'left' ? 4 : -4), y0 + 3 + (row++ % 3) * 14);
      ctx.font = '12px ui-sans-serif, system-ui, sans-serif';
    }

    // Auswahl
    const sel = drag.current ?? p.selection;
    if (sel) {
      const a = xOf(Math.min(sel.a, sel.b));
      const b = xOf(Math.max(sel.a, sel.b));
      ctx.fillStyle = 'rgba(95,196,184,0.22)';
      ctx.fillRect(a, y0, b - a, y1 - y0);
      ctx.strokeStyle = theme.accent;
      ctx.lineWidth = 1.5;
      ctx.strokeRect(a + 0.5, y0 + 0.5, b - a, y1 - y0 - 1);
    }

    // Fadenkreuz + Werte
    const hv = hover.current;
    if (hv && hv.x >= x0 && hv.x <= x1) {
      const t = p.tMin + ((hv.x - x0) / (x1 - x0)) * span;
      ctx.strokeStyle = theme.muted;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(hv.x + 0.5, y0);
      ctx.lineTo(hv.x + 0.5, y1);
      ctx.stroke();
      const lines = [`${t.toFixed(3)} s`];
      for (const c of p.curves.slice(0, 3)) {
        const idx = Math.round((t - c.t0) * c.hz);
        if (idx >= 0 && idx < c.data.length) lines.push(`${c.id}: ${c.data[idx]!.toFixed(0)} N`);
      }
      const bw = Math.max(...lines.map((l) => ctx.measureText(l).width)) + 12;
      const bx = hv.x + 10 + bw > x1 ? hv.x - 10 - bw : hv.x + 10;
      ctx.fillStyle = 'rgba(0,0,0,0.65)';
      ctx.fillRect(bx, y0 + 6, bw, lines.length * 16 + 6);
      ctx.fillStyle = '#fff';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      lines.forEach((l, i) => ctx.fillText(l, bx + 6, y0 + 9 + i * 16));
    }
  }, []);

  const schedule = useCallback(() => {
    if (!raf.current) raf.current = requestAnimationFrame(draw);
  }, [draw]);

  useEffect(() => {
    schedule();
  });

  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const ro = new ResizeObserver(schedule);
    ro.observe(wrap);
    const mq = window.matchMedia?.('(prefers-color-scheme: dark)');
    mq?.addEventListener?.('change', schedule);
    return () => {
      ro.disconnect();
      mq?.removeEventListener?.('change', schedule);
      if (raf.current) cancelAnimationFrame(raf.current);
      raf.current = 0; // StrictMode führt Cleanup + Setup erneut aus: eine abgebrochene Frame-ID darf nicht als „geplant“ gelten
    };
  }, [schedule]);

  const toTime = (clientX: number): number | null => {
    const c = canvasRef.current;
    if (!c) return null;
    const r = c.getBoundingClientRect();
    const g = geom.current;
    const x = clientX - r.left;
    return g.tMin + ((x - g.x0) / (g.x1 - g.x0)) * (g.tMax - g.tMin);
  };

  return (
    <div ref={wrapRef} className={props.className ?? 'h-full w-full'}>
      <canvas
        ref={canvasRef}
        role="img"
        aria-label={props.ariaLabel}
        className="block h-full w-full touch-none rounded-xl"
        style={{ cursor: props.selectable ? 'crosshair' : 'default' }}
        data-testid="trace-plot"
        onPointerMove={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          hover.current = { x: e.clientX - r.left, y: e.clientY - r.top };
          if (drag.current) {
            const t = toTime(e.clientX);
            if (t !== null) drag.current = { ...drag.current, b: t };
          }
          schedule();
        }}
        onPointerLeave={() => {
          hover.current = null;
          schedule();
        }}
        onPointerDown={(e) => {
          if (!props.selectable) return;
          const t = toTime(e.clientX);
          if (t === null) return;
          e.currentTarget.setPointerCapture(e.pointerId);
          drag.current = { a: t, b: t };
          schedule();
        }}
        onPointerUp={() => {
          const d = drag.current;
          drag.current = null;
          if (d && Math.abs(d.b - d.a) > 0.02) props.onSelect?.(Math.min(d.a, d.b), Math.max(d.a, d.b));
          schedule();
        }}
      />
    </div>
  );
}
