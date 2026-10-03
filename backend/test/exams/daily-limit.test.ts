import { beforeEach, describe, expect, it } from 'vitest';
import { pgPool } from '../../src/core/db';
import { nextNepalMidnight } from '../../src/modules/exams';
import { api, asUser, createActiveUser, createQuestionSet, login, type Session } from '../helpers';

let englishSetId: string;

beforeEach(async () => {
  englishSetId = (await createQuestionSet('english')).id;
  await createQuestionSet('math');
});

async function learner(dailyTestLimit: number | null): Promise<Session> {
  await createActiveUser({ email: 'learner@example.test', role: dailyTestLimit ? 'trial' : 'student', dailyTestLimit });
  return login('learner@example.test');
}

const startPractice = (s: Session) => api().post('/api/student/exams').set(asUser(s)).send({ setId: englishSetId });
const startMock = (s: Session) => api().post('/api/student/mock-tests').set(asUser(s));
const usage = async (s: Session) => (await api().get('/api/student/daily-usage').set(asUser(s))).body;

describe('daily test limit', () => {
  it('allows starts up to the limit, then refuses with DAILY_LIMIT_REACHED', async () => {
    const s = await learner(2);
    expect((await startPractice(s)).status).toBe(201);
    expect((await startPractice(s)).status).toBe(201);

    const refused = await startPractice(s);
    expect(refused.status).toBe(429);
    expect(refused.body).toMatchObject({ code: 'DAILY_LIMIT_REACHED', limit: 2, used: 2 });
    expect(new Date(refused.body.resetsAt).getTime()).toBeGreaterThan(Date.now());

    expect(await usage(s)).toMatchObject({ limit: 2, used: 2, remaining: 0 });
  });

  it('counts a whole mock once, even though it creates several exams', async () => {
    const s = await learner(2);
    expect((await startMock(s)).status).toBeLessThan(300);
    expect(await usage(s)).toMatchObject({ used: 1, remaining: 1 });

    expect((await startPractice(s)).status).toBe(201);
    const refused = await startMock(s);
    expect(refused.status).toBe(429);
    expect(refused.body.code).toBe('DAILY_LIMIT_REACHED');
  });

  it('never limits an account without a limit', async () => {
    const s = await learner(null);
    for (let i = 0; i < 4; i++) expect((await startPractice(s)).status).toBe(201);
    expect(await usage(s)).toMatchObject({ limit: null, used: 4, remaining: null });
  });

  it('counts only today in Nepal time, and ignores live-exam sittings', async () => {
    const s = await learner(5);
    await startPractice(s);
    await startPractice(s);
    await startPractice(s);
    // Same local-time convention the columns are written with (DB NOW(), zone-less).
    const nepalDayStart = `(date_trunc('day', now() AT TIME ZONE 'Asia/Kathmandu') AT TIME ZONE 'Asia/Kathmandu')::timestamp`;
    const ids = (await pgPool.query<{ id: string }>('SELECT id FROM exams ORDER BY created_at')).rows.map((r) => r.id);
    // One started a minute before today's Nepal midnight: yesterday, so it doesn't count.
    await pgPool.query(`UPDATE exams SET created_at = ${nepalDayStart} - interval '1 minute' WHERE id = $1`, [ids[0]]);
    // One looks like a live-exam sitting (section exam with no mock row): exempt.
    await pgPool.query(`UPDATE exams SET type = 'mock_english' WHERE id = $1`, [ids[1]]);

    expect(await usage(s)).toMatchObject({ used: 1, remaining: 4 });
  });
});

describe('nextNepalMidnight', () => {
  it('rolls over at 18:15 UTC (00:00 in Nepal)', () => {
    const justBefore = Date.parse('2026-10-03T18:14:59Z'); // 23:59:59 Nepal, Oct 3
    const atMidnight = Date.parse('2026-10-03T18:15:00Z'); // 00:00 Nepal, Oct 4
    expect(nextNepalMidnight(justBefore).toISOString()).toBe('2026-10-03T18:15:00.000Z');
    expect(nextNepalMidnight(atMidnight).toISOString()).toBe('2026-10-04T18:15:00.000Z');
  });
});
