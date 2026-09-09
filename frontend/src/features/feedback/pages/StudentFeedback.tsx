import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { MessageSquare } from 'lucide-react';
import { getFeedback, markFeedbackRead } from '@/features/student/api/student.api';
import { Spinner } from '@/shared/ui/Spinner';
import { formatDateTime } from '@/shared/lib/utils';

export default function StudentFeedback() {
  const queryClient = useQueryClient();

  const { data: feedbacks = [], isLoading } = useQuery({
    queryKey: ['student', 'feedback'],
    queryFn: getFeedback,
  });

  const markRead = useMutation({
    mutationFn: markFeedbackRead,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['student', 'feedback'] }),
  });

  if (isLoading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 64 }}>
        <Spinner className="w-8 h-8 text-[#E2562B]" />
      </div>
    );
  }

  return (
    <div className="screen-fade" style={{ padding: '36px 48px 64px', maxWidth: 820, margin: '0 auto' }}>
      <h1 style={{ fontFamily: "'Instrument Serif', serif", fontSize: 44, margin: '0 0 4px', letterSpacing: '-0.02em', color: '#0B0B0E' }}>Feedback</h1>
      <p style={{ fontSize: 14, color: 'rgba(11,11,14,0.55)', margin: '0 0 24px' }}>Messages from your teacher</p>

      {feedbacks.length === 0 ? (
        <div style={{ textAlign: 'center', paddingTop: 64 }}>
          <MessageSquare size={48} color="rgba(11,11,14,0.2)" style={{ margin: '0 auto 16px', display: 'block' }} />
          <p style={{ color: 'rgba(11,11,14,0.4)', fontSize: 14 }}>No feedback yet.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {feedbacks.map((fb) => (
            <div
              key={fb.id}
              onClick={() => { if (!fb.isRead) markRead.mutate(fb.id); }}
              style={{
                position: 'relative', background: '#fff', border: fb.isRead ? '1px solid #E7E4DE' : '1px solid rgba(226,86,43,0.35)',
                borderRadius: 16, padding: '18px 22px', cursor: 'pointer',
                boxShadow: fb.isRead ? '0 1px 3px rgba(11,11,14,0.05)' : '0 2px 12px rgba(226,86,43,0.1)',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = '#FBFAF8')}
              onMouseLeave={(e) => (e.currentTarget.style.background = '#fff')}
            >
              {!fb.isRead && (
                <div style={{ position: 'absolute', left: 0, top: 14, bottom: 14, width: 3, background: '#E2562B', borderRadius: '0 4px 4px 0' }} />
              )}
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 10 }}>
                <div>
                  <div style={{ fontSize: 14.5, fontWeight: 600, color: '#0B0B0E' }}>{fb.teacherName}</div>
                  <div style={{ fontSize: 12, color: 'rgba(11,11,14,0.45)' }}>{fb.teacherEmail}</div>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div style={{ fontSize: 12, color: 'rgba(11,11,14,0.4)' }}>{formatDateTime(fb.createdAt)}</div>
                  {!fb.isRead && (
                    <span style={{ display: 'inline-block', marginTop: 4, padding: '2px 8px', background: 'rgba(226,86,43,0.1)', color: '#E2562B', fontSize: 11, fontWeight: 700, borderRadius: 9999, letterSpacing: '0.05em' }}>NEW</span>
                  )}
                </div>
              </div>
              <p style={{ fontSize: 14, color: 'rgba(11,11,14,0.7)', lineHeight: 1.6, margin: 0, whiteSpace: 'pre-wrap' }}>{fb.content}</p>
              {fb.examId && (
                <p style={{ fontSize: 12, color: 'rgba(11,11,14,0.35)', marginTop: 8, marginBottom: 0 }}>Related to an exam</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
