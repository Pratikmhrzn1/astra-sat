import { useEffect, useState } from 'react';
import { cn } from '@/shared/lib/utils';

/**
 * A share-of-total pie, with its key beside it.
 *
 * The labels are a legend rather than text on leader lines out of each slice.
 * Leader lines are what the reference design uses and they collide as soon as
 * two slices are thin — and a category here can be called "Problem-Solving and
 * Data Analysis", which no slice is wide enough to carry. The legend also
 * repeats each value as a number, so the chart is readable without colour.
 */

export interface PieSlice {
  code: string;
  label: string;
  value: number;
  color: string;
}

/** Describes one slice as an SVG arc from `start` to `end` degrees. */
function arcPath(cx: number, cy: number, r: number, start: number, end: number): string {
  // A full circle cannot be drawn as one arc — its start and end points are the
  // same, so the path collapses to nothing. Two half arcs instead.
  if (end - start >= 360) {
    return `M ${cx} ${cy - r} A ${r} ${r} 0 1 1 ${cx} ${cy + r} A ${r} ${r} 0 1 1 ${cx} ${cy - r} Z`;
  }
  const toXY = (deg: number) => {
    const rad = (deg - 90) * (Math.PI / 180);
    return [cx + r * Math.cos(rad), cy + r * Math.sin(rad)] as const;
  };
  const [x1, y1] = toXY(start);
  const [x2, y2] = toXY(end);
  const largeArc = end - start > 180 ? 1 : 0;
  return `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2} Z`;
}

export function PieChart({
  slices,
  size = 190,
  className,
}: {
  slices: PieSlice[];
  size?: number;
  className?: string;
}) {
  // Slices sweep in together on the first frame after mount, by rotating the
  // whole disc. One flag, one transform — cheaper and steadier than animating
  // every arc's path.
  const [grown, setGrown] = useState(false);
  useEffect(() => {
    const frame = requestAnimationFrame(() => setGrown(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  const total = slices.reduce((sum, slice) => sum + slice.value, 0);
  if (total === 0) return null;

  const c = size / 2;
  let cursor = 0;
  const drawn = slices.map((slice) => {
    const sweep = (slice.value / total) * 360;
    const path = arcPath(c, c, c, cursor, cursor + sweep);
    cursor += sweep;
    return { ...slice, path, percent: Math.round((slice.value / total) * 100) };
  });

  return (
    <div className={cn('flex flex-col sm:flex-row sm:items-center gap-5 sm:gap-7', className)}>
      <svg
        viewBox={`0 0 ${size} ${size}`}
        width={size}
        height={size}
        className="shrink-0 mx-auto sm:mx-0 motion-reduce:transition-none"
        role="img"
        aria-label={drawn.map((s) => `${s.label}: ${s.value}, ${s.percent} percent`).join('. ')}
        style={{
          transform: grown ? 'rotate(0deg) scale(1)' : 'rotate(-35deg) scale(0.85)',
          transformOrigin: 'center',
          opacity: grown ? 1 : 0,
          transition: 'transform 380ms cubic-bezier(0.32, 0.72, 0, 1), opacity 180ms ease-out',
        }}
      >
        {drawn.map((slice) => (
          <path key={slice.code} d={slice.path} fill={slice.color} stroke="#FFFFFF" strokeWidth={1.5} />
        ))}
      </svg>

      <ul className="flex-1 min-w-0 flex flex-col gap-2 m-0 p-0 list-none">
        {drawn.map((slice) => (
          <li key={slice.code} className="flex items-center gap-2.5 text-[13.5px]">
            <span
              aria-hidden
              className="w-2.5 h-2.5 rounded-[3px] shrink-0"
              style={{ background: slice.color }}
            />
            <span className="flex-1 min-w-0 truncate text-ink">{slice.label}</span>
            <span className="tnum text-muted shrink-0">
              {slice.value} · {slice.percent}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
