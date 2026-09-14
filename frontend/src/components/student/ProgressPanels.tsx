import {
  AccuracyBars, TrendChart, TREND_COLORS, surfaceClass, type TrendSeries,
} from '@/components/common';
import { cn } from '@/lib/utils';
import { formatScore, TOTAL_MAX, scoreColor } from '@/lib/score';
import type { AnalyticsOverview } from '@/api/student';

/**
 * The progress panels, shared between the student's own view and the teacher's
 * view of that student.
 *
 * Shared deliberately: the two read the same endpoint through the same service
 * functions and render through the same components, so a teacher and a student
 * cannot end up quoting different percentages at each other.
 */

const panelTitle = 'text-[15px] font-semibold mt-0 mb-0.5';
const panelNote = 'text-[12.5px] text-muted mt-0';

/** Latest score against the student's own target. Arithmetic, not a prediction. */
export function ReadinessCard({ readiness }: { readiness: AnalyticsOverview['readiness']; isMobile?: boolean }) {
  const { rollingAverage, mocksTaken, targetScore, gap, daysToTest, confidence, estimate } = readiness;
  // Same estimate as the Dashboard hero, with its source named.
  const estimateLabel = estimate.source === 'practice' ? 'Estimated, from practice tests' : 'Latest mock';

  return (
    <div className={cn(surfaceClass, 'px-[18px] py-5 sm:px-[26px] sm:py-6')}>
      <div className="flex items-end gap-7 flex-wrap">
        <div>
          <div className="text-[12.5px] text-subtle mb-1">{estimateLabel}</div>
          <div className="font-display font-semibold text-[46px] leading-none" style={{ color: scoreColor(estimate.total, TOTAL_MAX) }}>
            {formatScore(estimate.total)}
          </div>
          {estimate.total === null && (estimate.rw !== null || estimate.math !== null) && (
            <div className="text-[12.5px] text-subtle mt-1.5">
              {estimate.rw !== null ? `R&W ${estimate.rw} · score a Math test to complete it` : `Math ${estimate.math} · score an R&W test to complete it`}
            </div>
          )}
        </div>

        {mocksTaken > 1 && (
          <div>
            <div className="text-[12.5px] text-subtle mb-1">
              Average of last {Math.min(mocksTaken, 3)}
            </div>
            <div className="font-display font-semibold text-[28px] leading-[1.4] text-ink">
              {formatScore(rollingAverage)}
            </div>
          </div>
        )}

        <div className="flex-1 min-w-[180px]">
          {targetScore === null ? (
            <p className="text-[13.5px] text-subtle m-0 leading-[1.6]">
              No target set. Add one in Settings and this shows the gap.
            </p>
          ) : (
            <p className="text-[13.5px] text-ink/60 m-0 leading-[1.7]">
              Target <strong className="text-ink">{targetScore}</strong>
              {gap !== null && (gap > 0
                ? <> · <strong className="text-gold">{gap}</strong> to go</>
                : <> · <strong className="text-green-dark">reached</strong></>)}
              {daysToTest !== null && (daysToTest >= 0
                ? <> · {daysToTest} {daysToTest === 1 ? 'day' : 'days'} to test day</>
                : <> · test date has passed</>)}
            </p>
          )}
        </div>
      </div>

      {/* Says how much to trust the number above, rather than implying certainty. */}
      {confidence !== 'fair' && (
        <p className="text-[12.5px] text-muted mt-3.5 mb-0 leading-[1.6]">
          {confidence === 'none'
            ? estimate.source === 'practice'
              ? 'No full mock yet — practice sections give a rough estimate; a mock gives a test-day one.'
              : 'Finish a full mock to see where you stand.'
            : 'Based on one mock — sit another before reading much into it.'}
        </p>
      )}
    </div>
  );
}

export function TrendPanel({ trend, isMobile }: { trend: AnalyticsOverview['trend']; isMobile?: boolean }) {
  // Both sections on one chart: same 200-800 scale, so one axis is honest.
  // Total is deliberately not plotted alongside them — it runs 400-1600 and
  // sharing an axis with the sections would need a second scale.
  const series: TrendSeries[] = [
    { label: 'Reading & Writing', color: TREND_COLORS.english, points: trend.map((p) => ({ at: p.at, value: p.rw })) },
    { label: 'Math', color: TREND_COLORS.math, points: trend.map((p) => ({ at: p.at, value: p.math })) },
  ];

  return (
    <div className={cn(surfaceClass, 'px-3.5 py-[18px] sm:px-6 sm:py-[22px]')}>
      <h2 className={panelTitle}>Section scores over time</h2>
      <p className={cn(panelNote, 'mb-3.5')}>
        Estimated, on the 200–800 scale. Mocks and single sections both count.
      </p>
      <TrendChart series={series} min={200} max={800} height={isMobile ? 170 : 200} />
    </div>
  );
}

export function DomainPanel({
  overview, onPractise,
}: {
  overview: AnalyticsOverview;
  onPractise?: (domainCode: string, subject: 'english' | 'math') => void;
  isMobile?: boolean;
}) {
  const groups = [
    { subject: 'english' as const, label: 'Reading & Writing', color: TREND_COLORS.english },
    { subject: 'math' as const, label: 'Math', color: TREND_COLORS.math },
  ];

  return (
    <div className={cn(surfaceClass, 'px-4 py-[18px] sm:px-6 sm:py-[22px]')}>
      <h2 className={panelTitle}>Accuracy by topic</h2>
      <p className={cn(panelNote, 'mb-[18px]')}>
        Weakest first. A topic needs {overview.minAttempts} answered questions before it shows a percentage.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-[22px] sm:gap-[30px]">
        {groups.map((group) => (
          <div key={group.subject}>
            <div className="flex items-center gap-2 mb-3.5">
              <span className="w-[9px] h-[9px] rounded-full" style={{ background: group.color }} />
              <span className="text-[13.5px] font-semibold">{group.label}</span>
            </div>
            <AccuracyBars
              rows={overview.domains
                .filter((d) => d.subject === group.subject)
                .map((d) => ({ code: d.domainCode, label: d.domainLabel, attempted: d.attempted, correct: d.correct, accuracy: d.accuracy }))}
              color={group.color}
              minAttempts={overview.minAttempts}
              onPractise={onPractise ? (code) => onPractise(code, group.subject) : undefined}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * The weakest domain with enough data behind it — the one thing worth doing next.
 *
 * Returns null rather than guessing when nothing qualifies, so the dashboard can
 * leave the slot out entirely instead of showing a card that says "unknown".
 */
export function weakestDomain(overview: AnalyticsOverview | undefined) {
  if (!overview) return null;
  return overview.domains.find((d) => d.attempted >= overview.minAttempts) ?? null;
}
