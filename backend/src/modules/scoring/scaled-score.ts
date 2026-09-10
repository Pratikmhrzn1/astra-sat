/**
 * Raw score → scaled SAT score.
 *
 * Not to be confused with `modules/student/scoring.ts`, which grades a single
 * answer (is this response correct?) and produces the raw count. This module
 * takes that raw count and turns it into the 200-800 section score and the
 * 400-1600 total that students, teachers and every analytic surface report.
 *
 * ── Why this exists ──────────────────────────────────────────────────────────
 * Until now no scaled score was stored anywhere. The number on screen was
 * computed in the browser as `Math.round(200 + (score / total) * 600)`,
 * duplicated ten times across three pages. That had three problems, and this
 * module fixes the first two; the third is fixed by deleting those copies.
 *
 *   1. It contradicted the adaptive test design. A linear stretch of raw
 *      percentage ignores which Module 2 the student was routed to, so a
 *      student who earned the *hard* module and one who got the *easy* module
 *      scored identically on the same raw percentage — even though the whole
 *      point of the adaptive step is that those performances differ.
 *   2. Nothing was persisted, so no aggregate was computable: no target gap,
 *      no trend, no batch average, no at-risk detection.
 *   3. Scoring logic lived in React components.
 *
 * ── What this is, honestly ───────────────────────────────────────────────────
 * The real SAT equates each form against calibrated item statistics we do not
 * have. This is a deliberate approximation with the properties that actually
 * matter: it is server-side, persisted, in one place, tunable, and it respects
 * the adaptive path. Every constant below is a calibration input — expect to
 * revise them once there is real score data to compare against.
 *
 * Never present the output as an official College Board score. It is an
 * *estimated* score.
 */

/** Which Module 2 the student earned, which gates the attainable band. */
export type AdaptivePath =
  /** Routed to the harder Module 2 — the full range is reachable. */
  | 'hard'
  /** Routed to the easier Module 2 — the attainable score is capped. */
  | 'low'
  /** No adaptive step ran (single-module practice). Scored on the full band. */
  | 'none';

/** SAT section scores run 200-800; totals run 400-1600. */
export const SECTION_MIN = 200;
export const SECTION_MAX = 800;

/**
 * The ceiling for a student routed to the easier Module 2.
 *
 * On the digital SAT the lower-difficulty second module puts the top of the
 * scale out of reach — you cannot earn a top section score on it however many
 * questions you answer correctly. 650 is our working figure; it is the single
 * most important number to recalibrate against real results.
 */
export const LOW_PATH_CEILING = 650;

/**
 * Below this many questions a section score is more noise than signal, so we
 * decline to produce one rather than publish a number that looks authoritative.
 * Short practice sets get a raw score and an accuracy percentage instead.
 */
export const MIN_QUESTIONS_TO_SCALE = 10;

/** The attainable [floor, ceiling] band for a given adaptive path. */
function bandFor(path: AdaptivePath): readonly [number, number] {
  return path === 'low' ? [SECTION_MIN, LOW_PATH_CEILING] : [SECTION_MIN, SECTION_MAX];
}

/** SAT scores are reported in multiples of 10. */
function roundToTen(value: number): number {
  return Math.round(value / 10) * 10;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Scales one section.
 *
 * Returns `null` when the section is too short to scale meaningfully — callers
 * should fall back to reporting raw correct/total rather than inventing a score.
 */
export function toSectionScore(
  rawCorrect: number,
  totalQuestions: number,
  path: AdaptivePath = 'none',
): number | null {
  if (totalQuestions < MIN_QUESTIONS_TO_SCALE) return null;

  const accuracy = clamp(rawCorrect / totalQuestions, 0, 1);
  const [floor, ceiling] = bandFor(path);

  return clamp(roundToTen(floor + accuracy * (ceiling - floor)), floor, ceiling);
}

/**
 * Combines two section scores into the 400-1600 total.
 *
 * Returns `null` unless both sections scored — a total built from one section
 * plus a guess is worse than no total at all.
 */
export function toTotalScore(
  rwScore: number | null,
  mathScore: number | null,
): number | null {
  if (rwScore === null || mathScore === null) return null;
  return rwScore + mathScore;
}

/**
 * Maps a question set's difficulty tier to the adaptive path it represents.
 *
 * `question_sets.difficulty` is free text and predates this module, so anything
 * unrecognised is treated as a non-adaptive section rather than assumed.
 */
export function pathFromModuleDifficulty(difficulty: string | null | undefined): AdaptivePath {
  if (difficulty === 'hard') return 'hard';
  if (difficulty === 'low') return 'low';
  return 'none';
}
