import { useQuery } from '@tanstack/react-query';
import { Users, BookOpen, BarChart2, GraduationCap, UserCog, HelpCircle } from 'lucide-react';
import { getAuditLog, getStats, type AuditEntry } from '@/features/admin';
import { cn, formatDateTime } from '@/shared/lib/utils';
import { InlineLoader, pageClass, surfaceClass } from '@/shared/ui';

export default function AdminDashboard() {
  const { data: stats, isLoading } = useQuery({
    queryKey: ['admin', 'stats'],
    queryFn: getStats,
  });
  const { data: audit = [] } = useQuery({ queryKey: ['admin', 'audit-log'], queryFn: () => getAuditLog(50) });

  if (isLoading) return <InlineLoader />;

  const statCards = [
    { label: 'Total Students', value: stats?.students ?? 0, icon: GraduationCap, tile: 'bg-blue-sat/[.08] text-blue-sat' },
    { label: 'Total Teachers', value: stats?.teachers ?? 0, icon: UserCog, tile: 'bg-green-sat/[.08] text-green-sat' },
    { label: 'Total Admins', value: stats?.admins ?? 0, icon: Users, tile: 'bg-ember/[.08] text-accent-text' },
    { label: 'Total Exams Taken', value: stats?.exams ?? 0, icon: BarChart2, tile: 'bg-gold/10 text-gold' },
    { label: 'Total Questions', value: stats?.questions ?? 0, icon: HelpCircle, tile: 'bg-green-sat/[.08] text-green-sat' },
    { label: 'Question Sets', value: stats?.questionSets ?? 0, icon: BookOpen, tile: 'bg-ember/[.08] text-accent-text' },
  ];

  return (
    <div className={cn(pageClass, 'pb-8')}>
      <div className="mb-7">
        <div className="text-[11px] font-bold tracking-[0.12em] uppercase text-accent-text mb-1.5">System overview</div>
        <h1 className="font-display font-semibold text-[32px] sm:text-[44px] m-0 tracking-[-0.02em] text-ink">Admin Dashboard</h1>
      </div>

      <div className={cn(surfaceClass, 'px-[22px] py-5 mb-4')}>
        <div className="flex items-baseline justify-between gap-3 mb-1">
          <h2 className="text-sm font-semibold m-0 text-ink">Question tagging coverage</h2>
          <span className="text-xs text-muted">Published questions with a topic</span>
        </div>
        <p className="text-[12.5px] text-muted mt-0 mb-3.5 leading-normal">
          Per-skill analytics, topic practice and the mistake bank can only see tagged questions.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-[18px]">
          {(stats?.taggingCoverage ?? []).map(({ subject, tagged, total, percentage }) => {
            const bar = percentage >= 80 ? 'bg-green-sat' : percentage >= 40 ? 'bg-gold' : 'bg-danger';
            return (
              <div key={subject}>
                <div className="flex items-baseline justify-between mb-1.5">
                  <span className="text-[13px] font-semibold capitalize">
                    {subject === 'english' ? 'Reading & Writing' : 'Math'}
                  </span>
                  <span className="text-[12.5px] text-subtle font-mono">
                    {tagged} / {total} · {percentage}%
                  </span>
                </div>
                <div className="h-1.5 bg-sunken rounded-full overflow-hidden">
                  <div className={cn('h-1.5 rounded-full', bar)} style={{ width: `${percentage}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 sm:gap-4 mb-4">
        {statCards.map(({ label, value, icon: Icon, tile }) => (
          <div key={label} className={cn(surfaceClass, 'px-[22px] py-5 flex items-center gap-4')}>
            <div className={cn('w-[42px] h-[42px] rounded-xl flex items-center justify-center shrink-0', tile)}>
              <Icon size={20} />
            </div>
            <div>
              <div className="font-display font-semibold text-[38px] leading-none text-ink">{value.toLocaleString()}</div>
              <div className="text-xs font-semibold text-muted mt-1">{label}</div>
            </div>
          </div>
        ))}
      </div>

      <AuditPanel entries={audit} />
    </div>
  );
}

const ACTION_LABELS: Record<string, string> = {
  'user.updated': 'Edited a user',
  'user.deleted': 'Deleted a user',
  'users.assigned_teacher': 'Assigned students to a teacher',
  'access_code.created': 'Created an access code',
  'access_code.deleted': 'Deleted an access code',
  'db.backup_downloaded': 'Downloaded a database backup',
  'db.restored': 'Restored the database',
  'db.migrations_run': 'Ran migrations',
  'db.sql_run': 'Ran SQL',
  'scoring.backfill_run': 'Ran the score backfill',
  'question_set.archived': 'Archived a question set',
  'question_set.deleted': 'Deleted a question set',
};

/** The one line of detail worth showing for an action, if any. */
function detail(entry: AuditEntry): string | null {
  const p = entry.payload ?? {};
  if (entry.action === 'db.sql_run' && typeof p.sql === 'string') return p.sql;
  if (entry.action === 'users.assigned_teacher' && typeof p.assigned === 'number') return `${p.assigned} ${p.assigned === 1 ? 'student' : 'students'}`;
  if (entry.action === 'user.updated' && Array.isArray(p.fields)) return `Changed ${p.fields.join(', ') || 'nothing'}`;
  if (entry.action === 'access_code.created' && typeof p.role === 'string') return `Grants ${p.role}`;
  if (typeof p.title === 'string') return p.title;
  return null;
}

/**
 * Irreversible admin and content actions, newest first. Read-only on purpose:
 * an audit trail an admin could edit would not be one.
 */
function AuditPanel({ entries }: { entries: AuditEntry[] }) {
  return (
    <div className={cn(surfaceClass, 'px-[22px] py-5')}>
      <h2 className="text-sm font-semibold mt-0 mb-0.5 text-ink">Recent admin actions</h2>
      <p className="text-[12.5px] text-muted mt-0 mb-3">
        User and access-code changes, database operations, and archived or deleted question sets.
      </p>
      {entries.length === 0 ? (
        <p className="text-[13px] text-muted mt-2 mb-0">Nothing recorded yet.</p>
      ) : (
        <div className="flex flex-col">
          {entries.map((entry) => {
            const failed = entry.payload?.ok === false;
            const line = detail(entry);
            return (
              <div key={entry.id} className="flex gap-3 items-baseline flex-wrap py-2.5 border-t border-sunken first:border-t-0">
                <div className="flex-[1_1_260px] min-w-0">
                  <div className="text-[13.5px] font-semibold text-ink">
                    {ACTION_LABELS[entry.action] ?? entry.action}
                    {failed && <span className="ml-2 text-xs font-semibold text-danger">failed</span>}
                  </div>
                  {line && (
                    <div className={cn('text-[12.5px] text-subtle truncate', entry.action === 'db.sql_run' && 'font-mono')}>{line}</div>
                  )}
                </div>
                <div className="text-[12.5px] text-subtle text-right">
                  {entry.actorName ?? entry.actorEmail ?? 'Deleted user'} · {formatDateTime(entry.createdAt)}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
