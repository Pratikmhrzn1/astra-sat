import { useQuery } from '@tanstack/react-query';
import type { SessionAccount } from '@/features/auth';
import { fetchDailyUsage } from '@/features/practice';
import { classes, renderDate } from '@/shared/lib/utils';

const DAY_MS = 86_400_000;

/**
 * A learner's access window and today's remaining tests. Renders nothing for an
 * account with neither an expiry date nor a daily limit.
 */
export function AccessBanner({ user }: { user: SessionAccount }) {
  const limited = user.dailyTestLimit != null;
  const { data: usage } = useQuery({
    queryKey: ['student', 'daily-usage'],
    queryFn: fetchDailyUsage,
    enabled: limited,
    // Starting a test elsewhere changes this, so never serve it from cache.
    staleTime: 0,
  });

  if (!limited && !user.expiryDate) return null;

  const daysLeft = user.expiryDate ? Math.ceil((new Date(user.expiryDate).getTime() - Date.now()) / DAY_MS) : null;
  const endingSoon = daysLeft !== null && daysLeft <= 3;
  const outOfTests = usage?.remaining === 0;

  return (
    <div
      className={classes(
        'rounded-xl border px-[18px] py-3 mb-4 text-[13.5px] flex items-center gap-x-5 gap-y-1 flex-wrap',
        outOfTests || endingSoon ? 'bg-gold/[.08] border-gold/25 text-gold-dark' : 'bg-sunken border-border text-subtle',
      )}
    >
      {user.role === 'trial' && <span className="font-semibold text-ink">Free trial</span>}
      {usage && usage.limit !== null && (
        <span>
          {outOfTests
            ? `You've used all ${usage.limit} tests for today. More tomorrow.`
            : `${usage.remaining} of ${usage.limit} tests left today`}
        </span>
      )}
      {user.expiryDate && daysLeft !== null && (
        <span>
          Access until {renderDate(user.expiryDate)}
          {daysLeft >= 0 && ` (${daysLeft} day${daysLeft === 1 ? '' : 's'} left)`}
        </span>
      )}
    </div>
  );
}
