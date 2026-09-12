import React from 'react';
import {
  AccuracyBars, TrendChart, TREND_COLORS, type TrendSeries,
} from '@/shared/ui';
import { formatScore, TOTAL_MAX, scoreColor } from '@/shared/lib/score';
import type { AnalyticsOverview } from '@/features/student/api/student.api';

/**
 * The progress panels, shared between the student's own view and the teacher's
 * view of that student.
 *
 * Shared deliberately: the two read the same endpoint through the same service
 * functions and render through the same components, so a teacher and a student
 * cannot end up quoting different percentages at each other.
 */

const CARD: React.CSSProperties = {
  background: '#fff', border: '1px solid #E7E4DE', borderRadius: 16,
  boxShadow: '0 1px 3px rgba(11,11,14,0.05)',
};

/** Latest score against the student's own target. Arithmetic, not a prediction. */
export function ReadinessCard({ readiness, isMobile }: { readiness: AnalyticsOverview['readiness']; isMobile?: boolean }) {
  const { latestTotal, rollingAverage, mocksTaken, targetScore, gap, daysToTest, confidence } = readiness;

  return (
    <div style={{ ...CARD, padding: isMobile ? '20px 18px' : '24px 26px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 28, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 12.5, color: 'rgba(11,11,14,0.5)', marginBottom: 4 }}>Latest mock</div>
          <div style={{ fontFamily: "'Instrument Serif', serif", fontSize: 46, lineHeight: 1, color: scoreColor(latestTotal, TOTAL_MAX) }}>
            {formatScore(latestTotal)}
          </div>
        </div>

        {mocksTaken > 1 && (
          <div>
            <div style={{ fontSize: 12.5, color: 'rgba(11,11,14,0.5)', marginBottom: 4 }}>
              Average of last {Math.min(mocksTaken, 3)}
            </div>
            <div style={{ fontFamily: "'Instrument Serif', serif", fontSize: 28, lineHeight: 1.4, color: '#0B0B0E' }}>
              {formatScore(rollingAverage)}
            </div>
          </div>
        )}

        <div style={{ flex: 1, minWidth: 180 }}>
          {targetScore === null ? (
            <p style={{ fontSize: 13.5, color: 'rgba(11,11,14,0.5)', margin: 0, lineHeight: 1.6 }}>
              No target set. Add one in Settings and this shows the gap.
            </p>
          ) : (
            <p style={{ fontSize: 13.5, color: 'rgba(11,11,14,0.6)', margin: 0, lineHeight: 1.7 }}>
              Target <strong style={{ color: '#0B0B0E' }}>{targetScore}</strong>
              {gap !== null && (gap > 0
                ? <> · <strong style={{ color: '#B8893E' }}>{gap}</strong> to go</>
                : <> · <strong style={{ color: '#1A6B3C' }}>reached</strong></>)}
              {daysToTest !== null && (daysToTest >= 0
                ? <> · {daysToTest} {daysToTest === 1 ? 'day' : 'days'} to test day</>
                : <> · test date has passed</>)}
            </p>
          )}
        </div>
      </div>

      {/* Says how much to trust the number above, rather than implying certainty. */}
      {confidence !== 'fair' && (
        <p style={{ fontSize: 12.5, color: 'rgba(11,11,14,0.45)', margin: '14px 0 0', lineHeight: 1.6 }}>
          {confidence === 'none'
            ? 'Finish a full mock to see where you stand.'
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
    <div style={{ ...CARD, padding: isMobile ? '18px 14px' : '22px 24px' }}>
      <h2 style={{ fontSize: 15, fontWeight: 600, margin: '0 0 2px' }}>Section scores over time</h2>
      <p style={{ fontSize: 12.5, color: 'rgba(11,11,14,0.45)', margin: '0 0 14px' }}>
        Estimated, on the 200–800 scale. Mocks and single sections both count.
      </p>
      <TrendChart series={series} min={200} max={800} height={isMobile ? 170 : 200} />
    </div>
  );
}

export function DomainPanel({
  overview, onPractise, isMobile,
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
    <div style={{ ...CARD, padding: isMobile ? '18px 16px' : '22px 24px' }}>
      <h2 style={{ fontSize: 15, fontWeight: 600, margin: '0 0 2px' }}>Accuracy by topic</h2>
      <p style={{ fontSize: 12.5, color: 'rgba(11,11,14,0.45)', margin: '0 0 18px' }}>
        Weakest first. A topic needs {overview.minAttempts} answered questions before it shows a percentage.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: isMobile ? 22 : 30 }}>
        {groups.map((group) => (
          <div key={group.subject}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
              <span style={{ width: 9, height: 9, borderRadius: 9999, background: group.color }} />
              <span style={{ fontSize: 13.5, fontWeight: 600 }}>{group.label}</span>
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
