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
      <p className="text-[13.5px] text-muted mt-2 mb-0 leading-[1.6]">
        Nothing tagged here yet. Domains appear once you've answered questions in them.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {rows.map((row) => {
        const thin = row.attempted < minAttempts;

        return (
          <div key={row.code}>
            <div className="flex items-baseline gap-2.5 mb-[5px]">
              <span className="text-[13.5px] font-semibold text-ink flex-1 min-w-0">
                {row.label}
              </span>
              {thin ? (
                <span className="text-xs text-muted">
                  {row.attempted} {row.attempted === 1 ? 'question' : 'questions'} — not enough yet
                </span>
              ) : (
                <span className="text-[12.5px] text-subtle font-mono">
                  {row.correct}/{row.attempted}
                  <strong className="text-ink ml-2">{row.accuracy}%</strong>
                </span>
              )}
              {onPractise && (
                <button
                  onClick={() => onPractise(row.code)}
                  className="bg-transparent p-0 text-[12.5px] font-semibold text-accent-text cursor-pointer"
                >Practise</button>
              )}
            </div>

            {/* A thin domain shows its track and no fill: the shape says "no
                reading yet" without a number that would look like one. */}
            <div className="h-2 rounded-full bg-sunken overflow-hidden">
              {!thin && (
                <div
                  className="h-2 rounded-full"
                  style={{ width: `${Math.max(row.accuracy, 1.5)}%`, background: color }}
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
