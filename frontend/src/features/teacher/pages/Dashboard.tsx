import { useQuery } from '@tanstack/react-query';
import { Users, MessageSquare, BookOpen } from 'lucide-react';
import { getStudents, getSentFeedback, getQuestionSets } from '@/features/teacher/api/teacher.api';
import { useAuthStore } from '@/shared/store/auth';
import { Spinner } from '@/shared/ui/Spinner';
import { useNavigate } from 'react-router-dom';

export default function TeacherDashboard() {
  const { user } = useAuthStore();
  const navigate = useNavigate();

  const { data: students = [], isLoading } = useQuery({ queryKey: ['teacher', 'students'], queryFn: getStudents });
  const { data: sentFeedback = [] } = useQuery({ queryKey: ['teacher', 'feedback'], queryFn: getSentFeedback });
  const { data: sets = [] } = useQuery({ queryKey: ['teacher', 'question-sets'], queryFn: getQuestionSets });

  if (isLoading) {
    return <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 64 }}><Spinner className="w-8 h-8 text-[#E2562B]" /></div>;
  }

  const statCards = [
    { label: 'Assigned Students', value: students.length, icon: Users, bg: 'rgba(46,125,90,0.08)', color: '#2E7D5A' },
    { label: 'Feedback Sent', value: sentFeedback.length, icon: MessageSquare, bg: 'rgba(226,86,43,0.08)', color: '#E2562B' },
    { label: 'Question Sets', value: sets.length, icon: BookOpen, bg: 'rgba(37,99,168,0.08)', color: '#2563A8' },
  ];

  return (
    <div className="screen-fade" style={{ padding: '36px 48px 64px' }}>
      <div style={{ marginBottom: 28 }}>
        <div style={{ fontSize: 13, color: 'rgba(11,11,14,0.45)', marginBottom: 4 }}>Teacher Portal</div>
        <h1 style={{ fontFamily: "'Instrument Serif', serif", fontSize: 44, margin: 0, letterSpacing: '-0.02em', color: '#0B0B0E' }}>Welcome, {user?.name}</h1>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 28 }}>
        {statCards.map(({ label, value, icon: Icon, bg, color }) => (
          <div key={label} style={{ background: '#fff', border: '1px solid #E7E4DE', borderRadius: 16, boxShadow: '0 1px 3px rgba(11,11,14,0.05)', padding: '20px 22px', display: 'flex', alignItems: 'center', gap: 16 }}>
            <div style={{ width: 42, height: 42, borderRadius: 12, background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Icon size={20} color={color} />
            </div>
            <div>
              <div style={{ fontFamily: "'Instrument Serif', serif", fontSize: 38, lineHeight: 1, color: '#0B0B0E' }}>{value}</div>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'rgba(11,11,14,0.45)', marginTop: 4 }}>{label}</div>
            </div>
          </div>
        ))}
      </div>

      <div style={{ background: '#fff', border: '1px solid #E7E4DE', borderRadius: 16, boxShadow: '0 1px 3px rgba(11,11,14,0.05)', overflow: 'hidden' }}>
        <div style={{ padding: '16px 22px', borderBottom: '1px solid #EEEBE5', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h2 style={{ fontSize: 16, fontWeight: 600, color: '#0B0B0E', margin: 0 }}>My Students</h2>
          {students.length > 0 && (
            <button onClick={() => navigate('/teacher/students')} style={{ fontSize: 13, fontWeight: 600, color: '#E2562B', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>View all →</button>
          )}
        </div>
        {students.length === 0 ? (
          <div style={{ padding: '48px 22px', textAlign: 'center', color: 'rgba(11,11,14,0.4)', fontSize: 14 }}>No students assigned yet.</div>
        ) : (
          <div>
            {students.slice(0, 5).map((s) => (
              <div key={s.id} onClick={() => navigate(`/teacher/students/${s.id}`)} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 22px', borderBottom: '1px solid #F2F0EC', cursor: 'pointer' }}
                onMouseEnter={(el) => (el.currentTarget.style.background = '#FBFAF8')}
                onMouseLeave={(el) => (el.currentTarget.style.background = 'transparent')}
              >
                <div style={{ width: 34, height: 34, borderRadius: 9999, background: '#F2F0EC', color: '#0B0B0E', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 700, flexShrink: 0 }}>{s.name.charAt(0).toUpperCase()}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14.5, fontWeight: 600, color: '#0B0B0E' }}>{s.name}</div>
                  <div style={{ fontSize: 12, color: 'rgba(11,11,14,0.45)' }}>{s.email}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
