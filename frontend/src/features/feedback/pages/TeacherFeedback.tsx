import { useQuery } from '@tanstack/react-query';
import { MessageSquare } from 'lucide-react';
import { getSentFeedback } from '@/features/teacher/api/teacher.api';
import { Badge, Spinner } from '@/shared/ui';
import { formatDateTime } from '@/shared/lib/utils';

export default function TeacherFeedback() {
  const { data: feedbacks = [], isLoading } = useQuery({ queryKey: ['teacher', 'feedback'], queryFn: getSentFeedback });

  if (isLoading) {
    return <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 64 }}><Spinner className="w-8 h-8 text-[#C4471F]" /></div>;
  }

  return (
    <div className="screen-fade" style={{ padding: '36px 48px 64px', maxWidth: 820, margin: '0 auto' }}>
      <h1 style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 44, margin: '0 0 4px', letterSpacing: '-0.02em', color: '#0B0B0E' }}>Sent Feedback</h1>
      <p style={{ fontSize: 14, color: 'rgba(11,11,14,0.64)', margin: '0 0 24px' }}>Feedback you've sent to your students</p>

      {feedbacks.length === 0 ? (
        <div style={{ textAlign: 'center', paddingTop: 64 }}>
          <MessageSquare size={48} color="rgba(11,11,14,0.2)" style={{ margin: '0 auto 16px', display: 'block' }} />
          <p style={{ color: 'rgba(11,11,14,0.58)', fontSize: 14 }}>No feedback sent yet.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {feedbacks.map((fb) => (
            <div key={fb.id} style={{ background: '#fff', border: '1px solid #E7E4DE', borderRadius: 16, boxShadow: '0 1px 3px rgba(11,11,14,0.05)', padding: '18px 22px' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 12 }}>
                <div>
                  <div style={{ fontSize: 14.5, fontWeight: 600, color: '#0B0B0E' }}>{fb.studentName}</div>
                  <div style={{ fontSize: 12, color: 'rgba(11,11,14,0.58)' }}>{fb.studentEmail}</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                  <Badge variant={fb.isRead ? 'success' : 'neutral'}>{fb.isRead ? 'Read' : 'Unread'}</Badge>
                  <span style={{ fontSize: 12, color: 'rgba(11,11,14,0.58)' }}>{formatDateTime(fb.createdAt)}</span>
                </div>
              </div>
              <p style={{ fontSize: 14, color: 'rgba(11,11,14,0.7)', lineHeight: 1.6, margin: 0, whiteSpace: 'pre-wrap' }}>{fb.content}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
