import { useQuery } from '@tanstack/react-query';
import { Users, BookOpen, BarChart2, GraduationCap, UserCog, HelpCircle } from 'lucide-react';
import { getAuditLog, getStats, type AuditEntry } from '@/features/admin/api/admin.api';
import { useMobile } from '@/shared/hooks/useMobile';
import { formatDateTime } from '@/shared/lib/utils';
import { Spinner } from '@/shared/ui';

export default function AdminDashboard() {
  const { data: stats, isLoading } = useQuery({
    queryKey: ['admin', 'stats'],
    queryFn: getStats,
  });
  const { data: audit = [] } = useQuery({ queryKey: ['admin', 'audit-log'], queryFn: () => getAuditLog(50) });
  const isMobile = useMobile();

  if (isLoading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 64 }}>
        <Spinner className="w-8 h-8 text-[#C4471F]" />
      </div>
    );
  }

  const statCards = [
    { label: 'Total Students', value: stats?.students ?? 0, icon: GraduationCap, bg: 'rgba(37,99,168,0.08)', color: '#2563A8' },
    { label: 'Total Teachers', value: stats?.teachers ?? 0, icon: UserCog, bg: 'rgba(46,125,90,0.08)', color: '#2E7D5A' },
    { label: 'Total Admins', value: stats?.admins ?? 0, icon: Users, bg: 'rgba(226,86,43,0.08)', color: '#C4471F' },
    { label: 'Total Exams Taken', value: stats?.exams ?? 0, icon: BarChart2, bg: 'rgba(184,137,62,0.1)', color: '#B8893E' },
    { label: 'Total Questions', value: stats?.questions ?? 0, icon: HelpCircle, bg: 'rgba(46,125,90,0.08)', color: '#2E7D5A' },
    { label: 'Question Sets', value: stats?.questionSets ?? 0, icon: BookOpen, bg: 'rgba(226,86,43,0.08)', color: '#C4471F' },
  ];

  return (
    <div className="screen-fade" style={{ padding: isMobile ? '20px 16px 32px' : '36px 48px 64px' }}>
      <div style={{ marginBottom: 28 }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#C4471F', marginBottom: 6 }}>System overview</div>
        <h1 style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: isMobile ? 32 : 44, margin: 0, letterSpacing: '-0.02em', color: '#0B0B0E' }}>Admin Dashboard</h1>
      </div>

      <div style={{ background: '#fff', border: '1px solid #E7E4DE', borderRadius: 16, boxShadow: '0 1px 3px rgba(11,11,14,0.05)', padding: '20px 22px', marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, marginBottom: 4 }}>
          <h2 style={{ fontSize: 14, fontWeight: 600, margin: 0, color: '#0B0B0E' }}>Question tagging coverage</h2>
          <span style={{ fontSize: 12, color: 'rgba(11,11,14,0.58)' }}>Published questions with a topic</span>
        </div>
        <p style={{ fontSize: 12.5, color: 'rgba(11,11,14,0.58)', margin: '0 0 14px', lineHeight: 1.5 }}>
          Per-skill analytics, topic practice and the mistake bank can only see tagged questions.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(2, 1fr)', gap: 18 }}>
          {(stats?.taggingCoverage ?? []).map(({ subject, tagged, total, percentage }) => {
            const color = percentage >= 80 ? '#2E7D5A' : percentage >= 40 ? '#B8893E' : '#C0392B';
            return (
              <div key={subject}>
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 6 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, textTransform: 'capitalize' }}>
                    {subject === 'english' ? 'Reading & Writing' : 'Math'}
                  </span>
                  <span style={{ fontSize: 12.5, color: 'rgba(11,11,14,0.64)', fontFamily: 'var(--font-mono)' }}>
                    {tagged} / {total} · {percentage}%
                  </span>
                </div>
                <div style={{ height: 6, background: '#F2F0EC', borderRadius: 9999, overflow: 'hidden' }}>
                  <div style={{ height: 6, width: `${percentage}%`, background: color, borderRadius: 9999 }} />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(3, 1fr)', gap: isMobile ? 10 : 16, marginBottom: 16 }}>
        {statCards.map(({ label, value, icon: Icon, bg, color }) => (
          <div key={label} style={{ background: '#fff', border: '1px solid #E7E4DE', borderRadius: 16, boxShadow: '0 1px 3px rgba(11,11,14,0.05)', padding: '20px 22px', display: 'flex', alignItems: 'center', gap: 16 }}>
            <div style={{ width: 42, height: 42, borderRadius: 12, background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Icon size={20} color={color} />
            </div>
            <div>
              <div style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 38, lineHeight: 1, color: '#0B0B0E' }}>{value.toLocaleString()}</div>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'rgba(11,11,14,0.58)', marginTop: 4 }}>{label}</div>
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
    <div style={{ background: '#fff', border: '1px solid #E7E4DE', borderRadius: 16, boxShadow: '0 1px 3px rgba(11,11,14,0.05)', padding: '20px 22px' }}>
      <h2 style={{ fontSize: 14, fontWeight: 600, margin: '0 0 2px', color: '#0B0B0E' }}>Recent admin actions</h2>
      <p style={{ fontSize: 12.5, color: 'rgba(11,11,14,0.58)', margin: '0 0 12px' }}>
        User and access-code changes, database operations, and archived or deleted question sets.
      </p>
      {entries.length === 0 ? (
        <p style={{ fontSize: 13, color: 'rgba(11,11,14,0.58)', margin: '8px 0 0' }}>Nothing recorded yet.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {entries.map((entry, i) => {
            const failed = entry.payload?.ok === false;
            const line = detail(entry);
            return (
              <div key={entry.id} style={{ display: 'flex', gap: 12, alignItems: 'baseline', flexWrap: 'wrap', padding: '10px 0', borderTop: i ? '1px solid #F2F0EC' : 'none' }}>
                <div style={{ flex: '1 1 260px', minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 600, color: '#0B0B0E' }}>
                    {ACTION_LABELS[entry.action] ?? entry.action}
                    {failed && <span style={{ marginLeft: 8, fontSize: 12, fontWeight: 600, color: '#C0392B' }}>failed</span>}
                  </div>
                  {line && (
                    <div style={{ fontSize: 12.5, color: 'rgba(11,11,14,0.64)', fontFamily: entry.action === 'db.sql_run' ? 'var(--font-mono)' : undefined, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{line}</div>
                  )}
                </div>
                <div style={{ fontSize: 12.5, color: 'rgba(11,11,14,0.64)', textAlign: 'right' }}>
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
