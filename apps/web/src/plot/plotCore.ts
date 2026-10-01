export interface PlotTheme {
  bg: string;
  grid: string;
  text: string;
  muted: string;
  left: string;
  right: string;
  sum: string;
  bw: string;
  accent: string;
  phases: Record<'unweighting' | 'braking' | 'concentric' | 'flight' | 'landing' | 'contact', string>;
}

/** Farben der Phasenflächen (halbtransparent, in hellem und dunklem Thema lesbar). */
export const PHASE_COLORS: PlotTheme['phases'] = {
  unweighting: 'rgba(111,162,154,0.30)',
  braking: 'rgba(181,139,91,0.32)',
  concentric: 'rgba(76,183,130,0.28)',
  flight: 'rgba(138,143,152,0.18)',
  landing: 'rgba(154,94,78,0.30)',
  contact: 'rgba(76,183,130,0.22)',
};

export function readTheme(el: Element): PlotTheme {
  const cs = getComputedStyle(el);
  const v = (name: string, fallback: string): string => cs.getPropertyValue(name).trim() || fallback;
  return {
    bg: v('--plot-bg', '#0a1f1d'),
    grid: v('--border', '#2c5d58'),
    text: v('--text', '#eef5f3'),
    muted: v('--muted', '#9cbbb5'),
    left: v('--left', '#58a6ff'),
    right: v('--right', '#f0a04b'),
    sum: v('--sum', '#eef5f3'),
    bw: v('--accent', '#d9aa76'),
    accent: v('--primary', '#5fc4b8'),
    phases: {
      unweighting: 'rgba(111,162,154,0.28)',
      braking: 'rgba(181,139,91,0.30)',
      concentric: 'rgba(76,183,130,0.28)',
      flight: 'rgba(138,143,152,0.18)',
      landing: 'rgba(154,94,78,0.30)',
      contact: 'rgba(76,183,130,0.22)',
    },
  };
}

/** Löst `var(--name)` zu einer echten Farbe auf (Canvas versteht keine CSS-Variablen). */
export function resolveColor(el: Element, color: string): string {
  const m = /^var\((--[\w-]+)\)$/.exec(color.trim());
  if (!m) return color;
  return getComputedStyle(el).getPropertyValue(m[1]!).trim() || '#888';
}

/** „Schöne“ Achsenteilung (1/2/5·10ⁿ). */
export function niceStep(range: number, targetTicks: number): number {
  if (!(range > 0)) return 1;
  const raw = range / Math.max(1, targetTicks);
  const pow = Math.pow(10, Math.floor(Math.log10(raw)));
  const f = raw / pow;
  const m = f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10;
  return m * pow;
}

export function niceTicks(min: number, max: number, target = 5): number[] {
  const step = niceStep(max - min, target);
  const out: number[] = [];
  for (let v = Math.ceil(min / step) * step; v <= max + step * 1e-9; v += step)
    out.push(Math.abs(v) < step * 1e-9 ? 0 : v);
  return out;
}

export interface CanvasSurface {
  ctx: CanvasRenderingContext2D;
  w: number;
  h: number;
  dpr: number;
}

/** Skaliert die Canvas-Auflösung auf CSS-Größe × Gerätepixelverhältnis. Gibt null zurück, wenn kein 2D-Kontext verfügbar ist. */
export function prepareCanvas(canvas: HTMLCanvasElement, cssW: number, cssH: number): CanvasSurface | null {
  const dpr = Math.min(3, window.devicePixelRatio || 1);
  const pw = Math.max(1, Math.round(cssW * dpr));
  const ph = Math.max(1, Math.round(cssH * dpr));
  if (canvas.width !== pw || canvas.height !== ph) {
    canvas.width = pw;
    canvas.height = ph;
  }
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx, w: cssW, h: cssH, dpr };
}

export const PLOT_MARGINS = { left: 58, right: 14, top: 10, bottom: 26 };
