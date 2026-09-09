import { useQuery } from '@tanstack/react-query';
import { Users, BookOpen, BarChart2, GraduationCap, UserCog, HelpCircle } from 'lucide-react';
import { getStats } from '@/features/admin/api/admin.api';
import { Spinner } from '@/shared/ui/Spinner';

export default function AdminDashboard() {
  const { data: stats, isLoading } = useQuery({
    queryKey: ['admin', 'stats'],
    queryFn: getStats,
  });

  if (isLoading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 64 }}>
        <Spinner className="w-8 h-8 text-[#E2562B]" />
      </div>
    );
  }

  const statCards = [
    { label: 'Total Students', value: stats?.students ?? 0, icon: GraduationCap, bg: 'rgba(37,99,168,0.08)', color: '#2563A8' },
    { label: 'Total Teachers', value: stats?.teachers ?? 0, icon: UserCog, bg: 'rgba(46,125,90,0.08)', color: '#2E7D5A' },
    { label: 'Total Admins', value: stats?.admins ?? 0, icon: Users, bg: 'rgba(226,86,43,0.08)', color: '#E2562B' },
    { label: 'Total Exams Taken', value: stats?.exams ?? 0, icon: BarChart2, bg: 'rgba(184,137,62,0.1)', color: '#B8893E' },
    { label: 'Total Questions', value: stats?.questions ?? 0, icon: HelpCircle, bg: 'rgba(46,125,90,0.08)', color: '#2E7D5A' },
    { label: 'Question Sets', value: stats?.questionSets ?? 0, icon: BookOpen, bg: 'rgba(226,86,43,0.08)', color: '#E2562B' },
  ];

  return (
    <div className="screen-fade" style={{ padding: '36px 48px 64px' }}>
      <div style={{ marginBottom: 28 }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#E2562B', marginBottom: 6 }}>System overview</div>
        <h1 style={{ fontFamily: "'Instrument Serif', serif", fontSize: 44, margin: 0, letterSpacing: '-0.02em', color: '#0B0B0E' }}>Admin Dashboard</h1>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
        {statCards.map(({ label, value, icon: Icon, bg, color }) => (
          <div key={label} style={{ background: '#fff', border: '1px solid #E7E4DE', borderRadius: 16, boxShadow: '0 1px 3px rgba(11,11,14,0.05)', padding: '20px 22px', display: 'flex', alignItems: 'center', gap: 16 }}>
            <div style={{ width: 42, height: 42, borderRadius: 12, background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Icon size={20} color={color} />
            </div>
            <div>
              <div style={{ fontFamily: "'Instrument Serif', serif", fontSize: 38, lineHeight: 1, color: '#0B0B0E' }}>{value.toLocaleString()}</div>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'rgba(11,11,14,0.45)', marginTop: 4 }}>{label}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
