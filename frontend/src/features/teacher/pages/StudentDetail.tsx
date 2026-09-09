import { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, MessageSquare } from 'lucide-react';
import { getStudents, getStudentExams, sendFeedback, getSentFeedback } from '@/features/teacher/api/teacher.api';
import { Button } from '@/shared/ui/Button';
import { Modal } from '@/shared/ui/Modal';
import { Textarea } from '@/shared/ui/Input';
import { SubjectBadge, Badge } from '@/shared/ui/Badge';
import { Spinner } from '@/shared/ui/Spinner';
import { formatDate } from '@/shared/lib/utils';
import { getApiError } from '@/shared/api/client';

function scoreColor(pct: number) {
  return pct >= 80 ? '#1A6B3C' : pct >= 65 ? '#2E7D5A' : pct >= 50 ? '#B8893E' : '#C47A1B';
}

const CARD: React.CSSProperties = { background: '#fff', border: '1px solid #E7E4DE', borderRadius: 16, boxShadow: '0 1px 3px rgba(11,11,14,0.05)', overflow: 'hidden' };

export default function StudentDetail() {
  const { studentId } = useParams<{ studentId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [showFeedback, setShowFeedback] = useState(false);
  const [feedbackContent, setFeedbackContent] = useState('');
  const [feedbackError, setFeedbackError] = useState('');

  const { data: students = [] } = useQuery({ queryKey: ['teacher', 'students'], queryFn: getStudents });
  const student = students.find((s) => s.id === studentId);

  const { data: exams = [], isLoading } = useQuery({ queryKey: ['teacher', 'student-exams', studentId], queryFn: () => getStudentExams(studentId!), enabled: !!studentId });
  const { data: myFeedback = [] } = useQuery({ queryKey: ['teacher', 'feedback'], queryFn: getSentFeedback });

  const studentFeedback = myFeedback.filter((f) => f.studentEmail === student?.email || f.studentName === student?.name);

  const feedbackMutation = useMutation({
    mutationFn: () => sendFeedback(studentId!, feedbackContent),
    onSuccess: () => { setShowFeedback(false); setFeedbackContent(''); queryClient.invalidateQueries({ queryKey: ['teacher', 'feedback'] }); },
    onError: (err) => setFeedbackError(getApiError(err)),
  });

  if (isLoading) {
    return <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 64 }}><Spinner className="w-8 h-8 text-[#E2562B]" /></div>;
  }

  const completedExams = exams.filter((e) => e.status === 'completed');

  return (
    <div className="screen-fade" style={{ padding: '36px 48px 64px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 28 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <button onClick={() => navigate(-1)} style={{ display: 'flex', alignItems: 'center', gap: 6, height: 36, padding: '0 14px', border: '1px solid #E7E4DE', borderRadius: 9999, background: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', color: '#0B0B0E', fontFamily: 'inherit' }}>
            <ArrowLeft size={14} /> Back
          </button>
          {student && (
            <div>
              <h1 style={{ fontFamily: "'Instrument Serif', serif", fontSize: 36, margin: 0, letterSpacing: '-0.02em', color: '#0B0B0E' }}>{student.name}</h1>
              <p style={{ fontSize: 13, color: 'rgba(11,11,14,0.45)', margin: 0 }}>{student.email}</p>
            </div>
          )}
        </div>
        <button onClick={() => { setShowFeedback(true); setFeedbackError(''); }}
          style={{ display: 'flex', alignItems: 'center', gap: 8, height: 40, padding: '0 18px', background: '#E2562B', color: '#fff', border: 'none', borderRadius: 9999, fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0 }}
        ><MessageSquare size={15} /> Send Feedback</button>
      </div>

      <div style={{ ...CARD, marginBottom: 20 }}>
        <div style={{ padding: '16px 22px', borderBottom: '1px solid #EEEBE5' }}>
          <h2 style={{ fontSize: 16, fontWeight: 600, color: '#0B0B0E', margin: 0 }}>Exam History ({completedExams.length})</h2>
        </div>
        {completedExams.length === 0 ? (
          <div style={{ padding: '40px 22px', textAlign: 'center', color: 'rgba(11,11,14,0.4)', fontSize: 14 }}>No completed exams yet.</div>
        ) : (
          completedExams.map((exam, i) => {
            const pct = exam.score !== null ? Math.round((exam.score / exam.totalQuestions) * 100) : null;
            return (
              <div key={exam.id} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 22px', borderBottom: i < completedExams.length - 1 ? '1px solid #F2F0EC' : 'none' }}>
                <SubjectBadge subject={exam.subject as 'english' | 'math'} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14.5, fontWeight: 600, color: '#0B0B0E' }}>{exam.setTitle}</div>
                  <div style={{ fontSize: 12, color: 'rgba(11,11,14,0.45)' }}>{formatDate(exam.startedAt)}</div>
                </div>
                {pct !== null && (
                  <span style={{ fontSize: 14, fontWeight: 700, color: scoreColor(pct), fontFamily: "'Instrument Serif', serif" }}>{exam.score}/{exam.totalQuestions} ({pct}%)</span>
                )}
                <Link to={`/teacher/students/${studentId}/exams/${exam.id}`} style={{ textDecoration: 'none' }}>
                  <button style={{ height: 34, padding: '0 14px', border: '1px solid #E7E4DE', borderRadius: 9999, background: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', color: '#0B0B0E', fontFamily: 'inherit' }}>View Results</button>
                </Link>
              </div>
            );
          })
        )}
      </div>

      {studentFeedback.length > 0 && (
        <div style={CARD}>
          <div style={{ padding: '16px 22px', borderBottom: '1px solid #EEEBE5' }}>
            <h2 style={{ fontSize: 16, fontWeight: 600, color: '#0B0B0E', margin: 0 }}>Feedback Sent</h2>
          </div>
          {studentFeedback.map((fb, i) => (
            <div key={fb.id} style={{ padding: '16px 22px', borderBottom: i < studentFeedback.length - 1 ? '1px solid #F2F0EC' : 'none' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={{ fontSize: 12, color: 'rgba(11,11,14,0.45)' }}>{formatDate(fb.createdAt)}</span>
                <Badge variant={fb.isRead ? 'success' : 'neutral'}>{fb.isRead ? 'Read' : 'Unread'}</Badge>
              </div>
              <p style={{ fontSize: 14, color: 'rgba(11,11,14,0.7)', margin: 0, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{fb.content}</p>
            </div>
          ))}
        </div>
      )}

      <Modal isOpen={showFeedback} onClose={() => setShowFeedback(false)} title={`Send Feedback to ${student?.name ?? 'Student'}`}
        footer={<><Button variant="secondary" onClick={() => setShowFeedback(false)}>Cancel</Button><Button onClick={() => feedbackMutation.mutate()} loading={feedbackMutation.isPending} disabled={!feedbackContent.trim()}>Send Feedback</Button></>}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Textarea label="Feedback message" value={feedbackContent} onChange={(e) => setFeedbackContent(e.target.value)} placeholder="Write your feedback here…" rows={5} />
          {feedbackError && <p style={{ color: '#C0392B', fontSize: 13 }}>{feedbackError}</p>}
        </div>
      </Modal>
    </div>
  );
}
