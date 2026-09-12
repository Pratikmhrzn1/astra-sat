import React from 'react';

/**
 * Accuracy per domain, weakest first.
 *
 * Horizontal because the labels are things like "Problem-Solving and Data
 * Analysis" — vertical bars would either truncate them or turn them sideways.
 * Ranked because the question this answers is "what should I work on", and the
 * answer is the top row.
 *
 * All bars in a group share one colour. They measure one thing, so colour has no
 * work to do here: length is the encoding, and colouring by value would paint
 * rank, which makes the weakest bar look like a different kind of thing rather
 * than a smaller amount of the same thing. Subject identity comes from the group
 * heading, never from the fill.
 */

export interface AccuracyRow {
  code: string;
  label: string;
  attempted: number;
  correct: number;
  accuracy: number;
}

export function AccuracyBars({
  rows, color, minAttempts, onPractise,
}: {
  rows: AccuracyRow[];
  color: string;
  /** Below this, a percentage swings too far on one question to be worth showing. */
  minAttempts: number;
  onPractise?: (code: string) => void;
}) {
  if (rows.length === 0) {
    return (
      <p style={{ fontSize: 13.5, color: 'rgba(11,11,14,0.4)', margin: '8px 0 0', lineHeight: 1.6 }}>
        Nothing tagged here yet. Domains appear once you've answered questions in them.
      </p>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {rows.map((row) => {
        const thin = row.attempted < minAttempts;

        return (
          <div key={row.code}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 5 }}>
              <span style={{ fontSize: 13.5, fontWeight: 600, color: '#0B0B0E', flex: 1, minWidth: 0 }}>
                {row.label}
              </span>
              {thin ? (
                <span style={{ fontSize: 12, color: 'rgba(11,11,14,0.4)' }}>
                  {row.attempted} {row.attempted === 1 ? 'question' : 'questions'} — not enough yet
                </span>
              ) : (
                <span style={{ fontSize: 12.5, color: 'rgba(11,11,14,0.5)', fontFamily: "'JetBrains Mono', monospace" }}>
                  {row.correct}/{row.attempted}
                  <strong style={{ color: '#0B0B0E', marginLeft: 8 }}>{row.accuracy}%</strong>
                </span>
              )}
              {onPractise && (
                <button
                  onClick={() => onPractise(row.code)}
                  style={{ border: 'none', background: 'none', padding: 0, font: 'inherit', fontSize: 12.5, fontWeight: 600, color: '#E2562B', cursor: 'pointer' }}
                >Practise</button>
              )}
            </div>

            {/* A thin domain shows its track and no fill: the shape says "no
                reading yet" without a number that would look like one. */}
            <div style={{ height: 8, borderRadius: 9999, background: '#F2F0EC', overflow: 'hidden' }}>
              {!thin && (
                <div
                  style={{
                    height: 8, width: `${Math.max(row.accuracy, 1.5)}%`,
                    background: color, borderRadius: 9999,
                  }}
                  role="img"
                  aria-label={`${row.label}: ${row.accuracy} percent, ${row.correct} of ${row.attempted} correct`}
                />
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
