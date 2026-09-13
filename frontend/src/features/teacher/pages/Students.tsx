import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Users } from 'lucide-react';
import { getStudents } from '@/features/teacher/api/teacher.api';
import { Spinner } from '@/shared/ui';
import { formatDate } from '@/shared/lib/utils';

export default function Students() {
  const navigate = useNavigate();
  const { data: students = [], isLoading } = useQuery({ queryKey: ['teacher', 'students'], queryFn: getStudents });

  if (isLoading) {
    return <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 64 }}><Spinner className="w-8 h-8 text-[#C4471F]" /></div>;
  }

  return (
    <div className="screen-fade" style={{ padding: '36px 48px 64px' }}>
      <h1 style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 44, margin: '0 0 4px', letterSpacing: '-0.02em', color: '#0B0B0E' }}>My Students</h1>
      <p style={{ fontSize: 14, color: 'rgba(11,11,14,0.64)', margin: '0 0 24px' }}>{students.length} student{students.length !== 1 ? 's' : ''} assigned</p>

      {students.length === 0 ? (
        <div style={{ textAlign: 'center', paddingTop: 64 }}>
          <Users size={48} color="rgba(11,11,14,0.2)" style={{ margin: '0 auto 16px', display: 'block' }} />
          <p style={{ color: 'rgba(11,11,14,0.58)', fontSize: 14 }}>No students assigned to you yet.</p>
          <p style={{ color: 'rgba(11,11,14,0.58)', fontSize: 13 }}>Contact your admin to assign students to your account.</p>
        </div>
      ) : (
        <div style={{ background: '#fff', border: '1px solid #E7E4DE', borderRadius: 16, boxShadow: '0 1px 3px rgba(11,11,14,0.05)', overflow: 'hidden' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 60px', gap: 12, padding: '12px 22px', borderBottom: '1px solid #EEEBE5' }}>
            {['Student', 'Joined', ''].map((c, i) => (
              <span key={i} style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'rgba(11,11,14,0.58)' }}>{c}</span>
            ))}
          </div>
          {students.map((s, i) => (
            <div key={s.id} onClick={() => navigate(`/teacher/students/${s.id}`)}
              style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 60px', gap: 12, padding: '14px 22px', borderBottom: i < students.length - 1 ? '1px solid #F2F0EC' : 'none', alignItems: 'center', cursor: 'pointer' }}
              onPointerEnter={(el) => { if (el.pointerType !== 'mouse') return; el.currentTarget.style.background = '#FBFAF8'; }}
              onPointerLeave={(el) => (el.currentTarget.style.background = 'transparent')}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ width: 34, height: 34, borderRadius: 9999, background: 'rgba(46,125,90,0.1)', color: '#2E7D5A', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 700, flexShrink: 0 }}>{s.name.charAt(0).toUpperCase()}</div>
                <div>
                  <div style={{ fontSize: 14.5, fontWeight: 600, color: '#0B0B0E' }}>{s.name}</div>
                  <div style={{ fontSize: 12, color: 'rgba(11,11,14,0.58)' }}>{s.email}</div>
                </div>
              </div>
              <div style={{ fontSize: 13.5, color: 'rgba(11,11,14,0.64)' }}>{formatDate(s.createdAt)}</div>
              <div style={{ textAlign: 'right', color: 'rgba(11,11,14,0.58)', fontSize: 18 }}>›</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
