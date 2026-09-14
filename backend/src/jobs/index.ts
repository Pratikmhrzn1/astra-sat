import { backfillScores } from '../modules/admin/scoring-backfill.service';

/**
 * Work that runs once on every boot, after the server is listening.
 *
 * Lives outside `core/` because each job belongs to a feature module, and core
 * must not import modules. Every job swallows its own failure: a repair task
 * must never take the app down.
 */
export async function runStartupJobs(): Promise<void> {
  // Exams and mocks finished before scaled scoring existed have no score, so the
  // dashboard estimate and the History trends stay blank for them. The backfill
  // only fills NULL scores and never overwrites, so it is safe on every boot.
  await backfillScores().catch((err) => console.error('[boot] Score backfill failed:', err));
}
