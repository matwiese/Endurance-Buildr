import { useMemo } from 'react';
import { niceTicks } from '../plot/plotCore.ts';

const M = { l: 56, r: 16, t: 12, b: 34 };

export interface LinePoint {
  /** Zeitpunkt (ms seit Epoche) */
  x: number;
  y: number;
  id?: string;
  title?: string;
}

interface LineProps {
  points: LinePoint[];
  /** waagerechte Baseline */
  baseline?: number | null;
  /** Norm: Mittel ± 1 SD (kräftig) und ± 2 SD (hell) */
  band?: { mean: number; sd: number } | null;
  format: (v: number) => string;
  formatX: (ms: number) => string;
  ariaLabel: string;
  onPointClick?: (id: string) => void;
  height?: number;
  labels?: { baseline: string; norm: string };
}

/** Verlaufsdiagramm (SVG): Linie + Punkte, Baseline, Norm-Band. Tastatur-/Screenreader-tauglich über `role="img"` + Tabelle der Seite. */
export function LineChart({
  points,
  baseline,
  band,
  format,
  formatX,
  ariaLabel,
  onPointClick,
  height = 300,
  labels,
}: LineProps) {
  const W = 760;
  const H = height;
  const geo = useMemo(() => {
    const ys = points.map((p) => p.y);
    if (baseline != null) ys.push(baseline);
    if (band) ys.push(band.mean - 2 * band.sd, band.mean + 2 * band.sd);
    const lo = ys.length ? Math.min(...ys) : 0;
    const hi = ys.length ? Math.max(...ys) : 1;
    const pad = (hi - lo || Math.abs(hi) || 1) * 0.08;
    const y0 = lo - pad;
    const y1 = hi + pad;
    const xs = points.map((p) => p.x);
    const x0 = xs.length ? Math.min(...xs) : 0;
    let x1 = xs.length ? Math.max(...xs) : 1;
    if (x1 === x0) x1 = x0 + 86_400_000;
    const sx = (x: number) => M.l + ((x - x0) / (x1 - x0)) * (W - M.l - M.r);
    const sy = (y: number) => H - M.b - ((y - y0) / (y1 - y0)) * (H - M.t - M.b);
    return { y0, y1, x0, x1, sx, sy, yt: niceTicks(y0, y1, 5), xt: niceTicks(x0, x1, 5) };
  }, [points, baseline, band, H]);
  const { sx, sy } = geo;
  const path = points.map((p, i) => `${i ? 'L' : 'M'}${sx(p.x).toFixed(1)},${sy(p.y).toFixed(1)}`).join(' ');

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label={ariaLabel}
      className="w-full"
      data-testid="line-chart"
    >
      <rect x={M.l} y={M.t} width={W - M.l - M.r} height={H - M.t - M.b} fill="var(--plot-bg)" rx="6" />
      {band && (
        <g data-testid="norm-band">
          <rect
            x={M.l}
            width={W - M.l - M.r}
            y={sy(band.mean + 2 * band.sd)}
            height={Math.max(0, sy(band.mean - 2 * band.sd) - sy(band.mean + 2 * band.sd))}
            fill="var(--primary)"
            opacity="0.10"
          />
          <rect
            x={M.l}
            width={W - M.l - M.r}
            y={sy(band.mean + band.sd)}
            height={Math.max(0, sy(band.mean - band.sd) - sy(band.mean + band.sd))}
            fill="var(--primary)"
            opacity="0.20"
          />
          <line
            x1={M.l}
            x2={W - M.r}
            y1={sy(band.mean)}
            y2={sy(band.mean)}
            stroke="var(--primary)"
            strokeWidth="1.5"
          />
          {labels && (
            <text x={W - M.r - 4} y={sy(band.mean) - 4} textAnchor="end" fontSize="11" fill="var(--primary)">
              {labels.norm}
            </text>
          )}
        </g>
      )}
      {geo.yt.map((v) => (
        <g key={v}>
          <line
            x1={M.l}
            x2={W - M.r}
            y1={sy(v)}
            y2={sy(v)}
            stroke="var(--border)"
            strokeWidth="1"
            opacity="0.5"
          />
          <text
            x={M.l - 6}
            y={sy(v)}
            textAnchor="end"
            dominantBaseline="middle"
            fontSize="11"
            fill="var(--muted)"
          >
            {format(v)}
          </text>
        </g>
      ))}
      {geo.xt.map((v) => (
        <text key={v} x={sx(v)} y={H - M.b + 18} textAnchor="middle" fontSize="11" fill="var(--muted)">
          {formatX(v)}
        </text>
      ))}
      {baseline != null && (
        <g data-testid="baseline-line">
          <line
            x1={M.l}
            x2={W - M.r}
            y1={sy(baseline)}
            y2={sy(baseline)}
            stroke="var(--accent)"
            strokeDasharray="6 5"
            strokeWidth="1.5"
          />
          {labels && (
            <text x={M.l + 6} y={sy(baseline) - 4} fontSize="11" fill="var(--accent)">
              {labels.baseline}
            </text>
          )}
        </g>
      )}
      {points.length > 1 && <path d={path} fill="none" stroke="var(--sum)" strokeWidth="2" />}
      {points.map((p, i) => (
        <g key={p.id ?? i}>
          <circle
            cx={sx(p.x)}
            cy={sy(p.y)}
            r="5.5"
            fill="var(--primary)"
            stroke="var(--bg)"
            strokeWidth="2"
            tabIndex={onPointClick ? 0 : undefined}
            role={onPointClick ? 'button' : undefined}
            aria-label={p.title ?? `${formatX(p.x)}: ${format(p.y)}`}
            style={{ cursor: onPointClick ? 'pointer' : 'default' }}
            data-testid="chart-point"
            onClick={() => p.id && onPointClick?.(p.id)}
            onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && p.id && onPointClick?.(p.id)}
          >
            <title>{p.title ?? `${formatX(p.x)}: ${format(p.y)}`}</title>
          </circle>
        </g>
      ))}
    </svg>
  );
}

export interface BarItem {
  id: string;
  label: string;
  value: number | null;
  /** zusätzliche Beschriftung rechts (z. B. Einordnung) */
  note?: string;
}

interface BarProps {
  items: BarItem[];
  format: (v: number) => string;
  mean?: number | null;
  meanLabel?: string;
  ariaLabel: string;
}

/** Horizontales Balkendiagramm (SVG) mit optionaler Mittelwertlinie; negative Werte (z-Scores, % Änderung) wachsen nach links. */
export function BarChart({ items, format, mean, meanLabel, ariaLabel }: BarProps) {
  const rowH = 30;
  const W = 760;
  const L = 170;
  const R = 90;
  const H = Math.max(60, items.length * rowH + 28);
  const vals = items.flatMap((i) => (i.value === null ? [] : [i.value]));
  if (mean != null) vals.push(mean);
  const lo = Math.min(0, ...vals);
  const hi = Math.max(0, ...vals, 1e-9);
  const sx = (v: number) => L + ((v - lo) / (hi - lo || 1)) * (W - L - R);
  const zero = sx(0);
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label={ariaLabel}
      className="w-full"
      data-testid="bar-chart"
    >
      {items.map((it, i) => {
        const y = 8 + i * rowH;
        const v = it.value;
        return (
          <g key={it.id} data-testid={`bar-${it.label}`}>
            <text
              x={L - 8}
              y={y + rowH / 2 - 4}
              textAnchor="end"
              dominantBaseline="middle"
              fontSize="12"
              fill="var(--text)"
            >
              {it.label.length > 22 ? `${it.label.slice(0, 21)}…` : it.label}
            </text>
            {v !== null && (
              <rect
                x={Math.min(zero, sx(v))}
                y={y + 3}
                width={Math.max(1, Math.abs(sx(v) - zero))}
                height={rowH - 12}
                rx="3"
                fill={v < 0 ? 'var(--accent)' : 'var(--primary)'}
              />
            )}
            <text
              x={W - R + 6}
              y={y + rowH / 2 - 4}
              dominantBaseline="middle"
              fontSize="12"
              fill="var(--muted)"
            >
              {v === null ? '–' : format(v)}
              {it.note ? ` · ${it.note}` : ''}
            </text>
          </g>
        );
      })}
      <line x1={zero} x2={zero} y1={4} y2={H - 20} stroke="var(--border)" />
      {mean != null && (
        <g data-testid="bar-mean">
          <line
            x1={sx(mean)}
            x2={sx(mean)}
            y1={4}
            y2={H - 20}
            stroke="var(--accent)"
            strokeDasharray="5 4"
            strokeWidth="1.5"
          />
          <text x={sx(mean)} y={H - 6} textAnchor="middle" fontSize="11" fill="var(--accent)">
            {meanLabel ?? ''} {format(mean)}
          </text>
        </g>
      )}
    </svg>
  );
}
