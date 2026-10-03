import { eq } from 'drizzle-orm';
import { database } from '../../core/db';
import { platformSettingsTable, type PlatformSettingsRow } from '../../core/db/schema';
import { settings } from '../../core/config/env';
import type { UpdatePlatformSettingsPayload } from './users.schemas';

/**
 * The account defaults an admin can change at runtime: how long trial and
 * student accounts last, and the trial's daily test limit.
 *
 * The single row is created from the env defaults on first read, so nothing
 * breaks before an admin has ever opened the settings page. The insert is
 * race-safe: the unique `singleton` column makes a second concurrent insert a
 * no-op, and the row is then re-read.
 */

export type PlatformSettings = Pick<
  PlatformSettingsRow,
  'trialDurationDays' | 'trialDailyTestLimit' | 'studentDurationDays' | 'updatedAt'
>;

function present(row: PlatformSettingsRow): PlatformSettings {
  const { trialDurationDays, trialDailyTestLimit, studentDurationDays, updatedAt } = row;
  return { trialDurationDays, trialDailyTestLimit, studentDurationDays, updatedAt };
}

async function loadRow(): Promise<PlatformSettingsRow> {
  const [existing] = await database.select().from(platformSettingsTable).limit(1);
  if (existing) return existing;

  await database
    .insert(platformSettingsTable)
    .values({ ...settings.accountDefaults })
    .onConflictDoNothing({ target: platformSettingsTable.singleton });

  const [created] = await database.select().from(platformSettingsTable).limit(1);
  return created;
}

export async function loadPlatformSettings(): Promise<PlatformSettings> {
  return present(await loadRow());
}

export async function editPlatformSettings(patch: UpdatePlatformSettingsPayload): Promise<PlatformSettings> {
  const current = await loadRow();
  const [updated] = await database
    .update(platformSettingsTable)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(platformSettingsTable.id, current.id))
    .returning();
  return present(updated);
}
