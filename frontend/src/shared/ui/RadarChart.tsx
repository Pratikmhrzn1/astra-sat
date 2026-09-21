import { useEffect, useState } from 'react';
import { cn } from '@/shared/lib/utils';

/**
 * A value per category, as a closed polygon on N spokes.
 *
 * Built the way `TrendChart` is — a fixed viewBox and hand arithmetic — rather
 * than by pulling in a charting library for one shape.
 *
 * Two decisions worth keeping:
 *
 * A missing value is not zero. Plotting it at the centre draws a dent that
 * reads as "you are bad at this" when it means "we have not asked you enough
 * yet", so a `null` is left out of the polygon and marked with a hollow dot on
 * its spoke instead.
 *
 * The labels are HTML positioned over the chart, not SVG `<text>`. Text inside
 * a viewBox scales with it: at 11px in a 460-wide box, these labels render
 * around 8px in a half-width card and smaller still on a phone. As HTML they
 * keep the size they are set at, and — the part SVG cannot do at all — a long
 * one wraps instead of running off the side.
 */

export interface RadarAxis {
  code: string;
  label: string;
  /** 0..max, or null when there is not enough data to report. */
  value: number | null;
  /** Small line under the label — the sample size, or why the value is missing. */
  caption?: string;
}

/**
 * Room outside the outermost ring for the labels, deliberately not square: a
 * label on a horizontal spoke grows sideways, while the top and bottom ones are
 * centred and have the whole width. Equal padding would either crowd the sides
 * or waste half the height.
 */
const PAD_X = 104;
const PAD_Y = 38;
/** Four rings: enough to read a level off, not a dartboard. */
const RINGS = [0.25, 0.5, 0.75, 1];

export function RadarChart({
  axes,
  color,
  max = 100,
  size = 240,
  valueSuffix = '%',
}: {
  axes: RadarAxis[];
  color: string;
  max?: number;
  size?: number;
  valueSuffix?: string;
}) {
  // The polygon grows out of the centre on the first frame after mount. One
  // flag for the whole chart, so it reads as the shape arriving rather than as
  // something that was already on screen.
  const [grown, setGrown] = useState(false);
  useEffect(() => {
    const frame = requestAnimationFrame(() => setGrown(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  if (axes.length < 3) return null;

  const W = size + PAD_X * 2;
  const H = size + PAD_Y * 2;
  const cx = W / 2;
  const cy = H / 2;
  const radius = size / 2;

  // Straight up for the first axis, then clockwise. -90° because SVG's zero
  // angle points right.
  const angleAt = (i: number) => (-90 + (i * 360) / axes.length) * (Math.PI / 180);
  const pointAt = (i: number, fraction: number) => {
    const angle = angleAt(i);
    return [cx + Math.cos(angle) * radius * fraction, cy + Math.sin(angle) * radius * fraction] as const;
  };
  const fractionOf = (value: number) => Math.min(1, Math.max(0, value / max));

  const ring = (fraction: number) => axes.map((_, i) => pointAt(i, fraction).join(',')).join(' ');

  // A polygon needs three corners. With fewer reportable values the shape would
  // collapse to a line or a dot, so only the markers are drawn.
  const reportable = axes.filter((a) => a.value !== null);
  const shape =
    reportable.length >= 3
      ? axes
          .map((axis, i) => (axis.value === null ? null : pointAt(i, fractionOf(axis.value)).join(',')))
          .filter(Boolean)
          .join(' ')
      : null;

  const described = axes
    .map((a) => `${a.label}: ${a.value === null ? 'not enough data' : `${a.value}${valueSuffix}`}`)
    .join('. ');

  return (
    <div className="relative w-full">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full block" role="img" aria-label={described}>
        {RINGS.map((fraction) => (
          <polygon key={fraction} points={ring(fraction)} fill="none" stroke="#EEEBE5" strokeWidth={1} />
        ))}

        {axes.map((axis, i) => {
          const [x, y] = pointAt(i, 1);
          return <line key={axis.code} x1={cx} y1={cy} x2={x} y2={y} stroke="#EEEBE5" strokeWidth={1} />;
        })}

        {shape && (
          <polygon
            points={shape}
            fill={color}
            fillOpacity={0.16}
            stroke={color}
            strokeWidth={2}
            strokeLinejoin="round"
            // Scaled about the centre, so the shape unfolds rather than slides.
            className="motion-reduce:transition-none"
            style={{
              transform: grown ? 'scale(1)' : 'scale(0.2)',
              transformOrigin: `${cx}px ${cy}px`,
              opacity: grown ? 1 : 0,
              transition: 'transform 380ms cubic-bezier(0.32, 0.72, 0, 1), opacity 180ms ease-out',
            }}
          />
        )}

        {axes.map((axis, i) => {
          const reported = axis.value !== null;
          const [x, y] = pointAt(i, reported ? fractionOf(axis.value as number) : 1);
          return (
            <circle
              key={axis.code}
              cx={x}
              cy={y}
              r={reported ? 4 : 3.5}
              fill={reported ? color : '#FFFFFF'}
              stroke={reported ? '#FFFFFF' : '#C8C4BC'}
              strokeWidth={reported ? 2 : 1.5}
              className="motion-reduce:transition-none"
              style={{
                opacity: grown ? 1 : 0,
                transition: 'opacity 180ms ease-out',
                transitionDelay: `${80 + i * 40}ms`,
              }}
            />
          );
        })}
      </svg>

      {/*
        Positioned as a percentage of the same box the SVG draws in, so the
        labels track the spokes at every width without being scaled by the
        viewBox. `aria-hidden` because the SVG's own aria-label already narrates
        every axis and its value — announcing both would read the chart twice.
      */}
      {axes.map((axis, i) => {
        const [x, y] = pointAt(i, 1);
        const dx = x - cx;
        const dy = y - cy;
        const sideways = Math.abs(dx) > 1;
        const transform = sideways
          ? dx > 0
            ? 'translate(7px, -50%)'
            : 'translate(calc(-100% - 7px), -50%)'
          : dy > 0
            ? 'translate(-50%, 8px)'
            : 'translate(-50%, calc(-100% - 8px))';
        return (
          <div
            key={axis.code}
            aria-hidden
            className={cn(
              'absolute leading-tight',
              // Capped so a long name wraps into the padding instead of running
              // out of the card.
              sideways ? 'max-w-[22%]' : 'max-w-[46%]',
              sideways ? (dx > 0 ? 'text-left' : 'text-right') : 'text-center',
            )}
            style={{ left: `${(x / W) * 100}%`, top: `${(y / H) * 100}%`, transform }}
          >
            <div className="text-[11.5px] font-semibold text-ink">{axis.label}</div>
            {axis.caption && <div className="text-[10.5px] text-muted mt-px">{axis.caption}</div>}
          </div>
        );
      })}
    </div>
  );
}
