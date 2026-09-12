/**
 * How a score is rendered, in one place.
 *
 * Every number here used to be computed in the components. `Math.round(200 +
 * (score / total) * 600)` appeared ten times across three pages, and three
 * different functions decided what colour a score was — two using absolute
 * thresholds, one using percentages — so the same score could be green on one
 * page and amber on the next.
 *
 * The scaling itself is gone from the browser entirely: the server writes
 * `scaled_score` on an exam and `total_score` on a mock, because a linear
 * stretch of raw percentage cannot know which adaptive Module 2 the student was
 * routed to, and a number nobody stores cannot be trended or averaged.
 *
 * What is left here is presentation, and one rule: **never invent a score.**
 * A section too short to scale, or an exam graded before scoring existed, has no
 * scaled score, and these helpers render that absence rather than papering over
 * it. The dashboard used to add `?? 600` per section, which told a student with
 * no completed exams that they had scored 1200.
 */

/** SAT section scores run 200-800; totals run 400-1600. */
export const SECTION_MIN = 200;
export const SECTION_MAX = 800;
export const TOTAL_MIN = 400;
export const TOTAL_MAX = 1600;

/** Shown wherever a score does not exist. */
export const NO_SCORE = '—';

/**
 * Every score this platform reports is an estimate, never an official College
 * Board result. Use this to label them.
 */
export const ESTIMATED_LABEL = 'Estimated';

/** A score, or `—` when there isn't one. */
export function formatScore(score: number | null | undefined): string {
  return score === null || score === undefined ? NO_SCORE : String(score);
}

/**
 * Raw correct-out-of-total, for exams too short to carry a scaled score.
 *
 * This is the honest fallback: a 5-question set gets `4 / 5 · 80%`, not a
 * 200-800 number that looks like an SAT result.
 */
export function formatRaw(score: number | null | undefined, total: number): string {
  if (score === null || score === undefined || total <= 0) return NO_SCORE;
  return `${score} / ${total} · ${Math.round((score / total) * 100)}%`;
}

/**
 * The scaled score if there is one, otherwise the raw tally.
 *
 * Callers that need to know which they got should check `scaledScore` directly;
 * this is for the common case of "show me something true about this exam".
 */
export function formatExamScore(
  scaledScore: number | null | undefined,
  score: number | null | undefined,
  total: number,
): string {
  return scaledScore === null || scaledScore === undefined
    ? formatRaw(score, total)
    : String(scaledScore);
}

/**
 * Colour for a score, as a share of the scale it sits on.
 *
 * One function for section and total scores alike — pass `TOTAL_MAX` for a
 * 400-1600 number and `SECTION_MAX` for a 200-800 one. The thresholds are on the
 * fraction of the maximum, so the three previous variants collapse into this
 * without any of them changing meaning.
 */
export function scoreColor(score: number | null | undefined, max: number = SECTION_MAX): string {
  if (score === null || score === undefined) return 'rgba(11,11,14,0.4)';
  const fraction = score / max;
  if (fraction >= 0.85) return '#1A6B3C';
  if (fraction >= 0.775) return '#2E7D5A';
  if (fraction >= 0.7) return '#B8893E';
  return '#C47A1B';
}

/** Colour for a plain 0-100 accuracy percentage. */
export function accuracyColor(percentage: number): string {
  return scoreColor(percentage, 100);
}

/**
 * Whole days from today until `date`, or null if there is no date.
 *
 * Negative once the date has passed, which the caller should render as "test
 * has passed" rather than a negative countdown.
 */
export function daysUntil(date: string | null | undefined): number | null {
  if (!date) return null;
  const target = new Date(`${date}T00:00:00`);
  if (Number.isNaN(target.getTime())) return null;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / 86_400_000);
}
