import React, { useId, useState } from 'react';

/**
 * Score over time, for one or two series.
 *
 * Lifted out of `Results` where it was declared *inside* the component body, so
 * it was a new component type on every render and React remounted the whole
 * chart each time.
 *
 * The two series colours are the platform's green and blue, checked against the
 * colourblind-separation and chroma thresholds rather than picked by eye. Their
 * tritan separation is narrow, so identity never rests on colour: both series
 * carry a legend swatch *and* a labelled end point.
 */

export interface TrendSeries {
  label: string;
  color: string;
  /** Oldest first. Gaps are allowed — a null is simply not plotted. */
  points: { at: string; value: number | null }[];
}

/** Validated against the light chart surface; see the palette check in dataviz. */
export const TREND_COLORS = { english: '#1A6B3C', math: '#2563A8' } as const;

const PAD = { top: 14, right: 16, bottom: 22, left: 34 };

export function TrendChart({
  series, height = 190, min, max, valueSuffix = '',
}: {
  series: TrendSeries[];
  height?: number;
  min?: number;
  max?: number;
  valueSuffix?: string;
}) {
  const clipId = useId();
  const [hover, setHover] = useState<{ index: number; x: number } | null>(null);

  const plotted = series.filter((s) => s.points.some((p) => p.value !== null));
  const length = Math.max(...plotted.map((s) => s.points.length), 0);

  if (plotted.length === 0 || length < 2) {
    return (
      <div style={{ height, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(11,11,14,0.58)', fontSize: 13 }}>
        {length === 1 ? 'One result so far — a trend needs two.' : 'No scored results yet.'}
      </div>
    );
  }

  const values = plotted.flatMap((s) => s.points.map((p) => p.value).filter((v): v is number => v !== null));
  const lo = min ?? Math.floor((Math.min(...values) - 40) / 50) * 50;
  const hi = max ?? Math.ceil((Math.max(...values) + 40) / 50) * 50;
  const span = Math.max(1, hi - lo);

  const W = 640;
  const innerW = W - PAD.left - PAD.right;
  const innerH = height - PAD.top - PAD.bottom;
  const xAt = (i: number) => PAD.left + (length === 1 ? innerW / 2 : (i / (length - 1)) * innerW);
  const yAt = (v: number) => PAD.top + innerH - ((v - lo) / span) * innerH;

  // Three recessive gridlines: enough to read a level, not a ruled page.
  const ticks = [lo, Math.round((lo + hi) / 2), hi];
  const dates = plotted[0].points.map((p) => p.at);

  return (
    <div style={{ position: 'relative' }}>
      <svg
        viewBox={`0 0 ${W} ${height}`}
        style={{ width: '100%', height, display: 'block', overflow: 'visible' }}
        role="img"
        aria-label={`Score trend: ${plotted.map((s) => `${s.label} from ${s.points.find((p) => p.value !== null)?.value} to ${[...s.points].reverse().find((p) => p.value !== null)?.value}`).join('; ')}`}
        onMouseLeave={() => setHover(null)}
      >
        <defs>
          <clipPath id={clipId}>
            <rect x={PAD.left} y={0} width={innerW} height={height} />
          </clipPath>
        </defs>

        {ticks.map((t) => (
          <g key={t}>
            <line x1={PAD.left} x2={W - PAD.right} y1={yAt(t)} y2={yAt(t)} stroke="#EEEBE5" strokeWidth={1} />
            <text x={PAD.left - 8} y={yAt(t) + 4} textAnchor="end" fontSize={10.5} fill="rgba(11,11,14,0.35)" fontFamily="ui-monospace, 'SF Mono', SFMono-Regular, Menlo, Consolas, monospace">{t}</text>
          </g>
        ))}

        {hover && (
          <line x1={hover.x} x2={hover.x} y1={PAD.top} y2={PAD.top + innerH} stroke="rgba(11,11,14,0.18)" strokeWidth={1} />
        )}

        {plotted.map((s) => {
          const pts = s.points
            .map((p, i) => (p.value === null ? null : { x: xAt(i), y: yAt(p.value), value: p.value, i }))
            .filter((p): p is { x: number; y: number; value: number; i: number } => p !== null);
          if (pts.length === 0) return null;
          const d = pts.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
          const last = pts[pts.length - 1];

          return (
            <g key={s.label} clipPath={`url(#${clipId})`}>
              <path d={d} fill="none" stroke={s.color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
              {pts.map((p) => (
                <circle
                  key={p.i}
                  cx={p.x} cy={p.y}
                  r={hover?.index === p.i ? 5.5 : 4}
                  fill="#fff" stroke={s.color} strokeWidth={2}
                />
              ))}
              {/* Only the latest point is labelled — a number on every point is noise. */}
              <text
                x={last.x + 8} y={last.y + 4}
                fontSize={11.5} fontWeight={600} fill={s.color}
                fontFamily="ui-monospace, 'SF Mono', SFMono-Regular, Menlo, Consolas, monospace"
              >{last.value}{valueSuffix}</text>
            </g>
          );
        })}

        {/* Hit targets wider than the marks. */}
        {dates.map((_, i) => (
          <rect
            key={i}
            x={xAt(i) - innerW / (2 * Math.max(1, length - 1))}
            y={0}
            width={innerW / Math.max(1, length - 1)}
            height={height}
            fill="transparent"
            onMouseEnter={() => setHover({ index: i, x: xAt(i) })}
          />
        ))}
      </svg>

      {hover && (
        <div style={{
          position: 'absolute', top: 0,
          left: `${(hover.x / W) * 100}%`, transform: 'translateX(-50%)',
          background: '#0B0B0E', color: '#fff', borderRadius: 8, padding: '7px 10px',
          fontSize: 11.5, lineHeight: 1.5, pointerEvents: 'none', whiteSpace: 'nowrap', zIndex: 2,
        }}>
          <div style={{ opacity: 0.6, marginBottom: 2 }}>
            {new Date(dates[hover.index]).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}
          </div>
          {plotted.map((s) => {
            const v = s.points[hover.index]?.value;
            if (v === null || v === undefined) return null;
            return (
              <div key={s.label} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 7, height: 7, borderRadius: 9999, background: s.color }} />
                {s.label} <strong>{v}{valueSuffix}</strong>
              </div>
            );
          })}
        </div>
      )}

      {plotted.length > 1 && (
        <div style={{ display: 'flex', gap: 16, justifyContent: 'center', marginTop: 6 }}>
          {plotted.map((s) => (
            <span key={s.label} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'rgba(11,11,14,0.64)' }}>
              <span style={{ width: 9, height: 9, borderRadius: 9999, background: s.color }} />
              {s.label}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
