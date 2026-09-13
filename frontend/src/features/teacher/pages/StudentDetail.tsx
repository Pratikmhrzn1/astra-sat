import { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, MessageSquare } from 'lucide-react';
import { getStudents, getStudentExams, getStudentDetail, getStudentAnalytics, sendFeedback, getSentFeedback } from '@/features/teacher/api/teacher.api';
import { DomainPanel, ReadinessCard, TrendPanel } from '@/features/student/components/ProgressPanels';
import { Button, Modal, Textarea, SubjectBadge, Badge, Spinner } from '@/shared/ui';
import { formatDate } from '@/shared/lib/utils';
import { getApiError } from '@/shared/api/client';
import { accuracyColor as scoreColor, daysUntil } from '@/shared/lib/score';

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
  const { data: detail } = useQuery({ queryKey: ['teacher', 'student', studentId], queryFn: () => getStudentDetail(studentId!), enabled: !!studentId });
  const { data: analytics } = useQuery({ queryKey: ['teacher', 'student-analytics', studentId], queryFn: () => getStudentAnalytics(studentId!), enabled: !!studentId });

  const studentFeedback = myFeedback.filter((f) => f.studentEmail === student?.email || f.studentName === student?.name);

  const feedbackMutation = useMutation({
    mutationFn: () => sendFeedback(studentId!, feedbackContent),
    onSuccess: () => { setShowFeedback(false); setFeedbackContent(''); queryClient.invalidateQueries({ queryKey: ['teacher', 'feedback'] }); },
    onError: (err) => setFeedbackError(getApiError(err)),
  });

  if (isLoading) {
    return <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 64 }}><Spinner className="w-8 h-8 text-[#C4471F]" /></div>;
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
              <h1 style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 36, margin: 0, letterSpacing: '-0.02em', color: '#0B0B0E' }}>{student.name}</h1>
              <p style={{ fontSize: 13, color: 'rgba(11,11,14,0.58)', margin: 0 }}>{student.email}</p>
            </div>
          )}
        </div>
        <button onClick={() => { setShowFeedback(true); setFeedbackError(''); }}
          style={{ display: 'flex', alignItems: 'center', gap: 8, height: 40, padding: '0 18px', background: '#C4471F', color: '#fff', border: 'none', borderRadius: 9999, fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0 }}
        ><MessageSquare size={15} /> Send Feedback</button>
      </div>

      <div style={{ ...CARD, marginBottom: 20, padding: '16px 22px' }}>
        <h2 style={{ fontSize: 16, fontWeight: 600, color: '#0B0B0E', margin: '0 0 10px' }}>Goal</h2>
        {detail?.profile?.targetScore || detail?.profile?.testDate ? (
          <div style={{ display: 'flex', gap: 28, flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontSize: 12, color: 'rgba(11,11,14,0.58)' }}>Target score</div>
              <div style={{ fontSize: 15, fontWeight: 600 }}>{detail.profile.targetScore ?? '—'}</div>
            </div>
            <div>
              <div style={{ fontSize: 12, color: 'rgba(11,11,14,0.58)' }}>Test date</div>
              <div style={{ fontSize: 15, fontWeight: 600 }}>
                {detail.profile.testDate ? formatDate(detail.profile.testDate) : '—'}
                {(() => {
                  const days = daysUntil(detail.profile.testDate);
                  if (days === null) return null;
                  return (
                    <span style={{ fontSize: 13, fontWeight: 400, color: 'rgba(11,11,14,0.58)', marginLeft: 8 }}>
                      {days >= 0 ? `${days} ${days === 1 ? 'day' : 'days'} away` : 'passed'}
                    </span>
                  );
                })()}
              </div>
            </div>
          </div>
        ) : (
          <div style={{ fontSize: 14, color: 'rgba(11,11,14,0.58)' }}>This student hasn't set a target score yet.</div>
        )}
      </div>

      {analytics && (analytics.trend.length > 0 || analytics.domains.length > 0) && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginBottom: 20 }}>
          <ReadinessCard readiness={analytics.readiness} />
          <TrendPanel trend={analytics.trend} />
          {/* No practise button: a teacher assigning work to a student is an
              assignment, which is Phase 3, not a click that starts an exam
              under someone else's name. */}
          <DomainPanel overview={analytics} />
        </div>
      )}

      <div style={{ ...CARD, marginBottom: 20 }}>
        <div style={{ padding: '16px 22px', borderBottom: '1px solid #EEEBE5' }}>
          <h2 style={{ fontSize: 16, fontWeight: 600, color: '#0B0B0E', margin: 0 }}>Exam History ({completedExams.length})</h2>
        </div>
        {completedExams.length === 0 ? (
          <div style={{ padding: '40px 22px', textAlign: 'center', color: 'rgba(11,11,14,0.58)', fontSize: 14 }}>No completed exams yet.</div>
        ) : (
          completedExams.map((exam, i) => {
            const pct = exam.score !== null ? Math.round((exam.score / exam.totalQuestions) * 100) : null;
            return (
              <div key={exam.id} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 22px', borderBottom: i < completedExams.length - 1 ? '1px solid #F2F0EC' : 'none' }}>
                {exam.subject && <SubjectBadge subject={exam.subject as 'english' | 'math'} />}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14.5, fontWeight: 600, color: '#0B0B0E' }}>{exam.setTitle ?? exam.label ?? 'Practice'}</div>
                  <div style={{ fontSize: 12, color: 'rgba(11,11,14,0.58)' }}>{formatDate(exam.startedAt)}</div>
                </div>
                {pct !== null && (
                  <span style={{ fontSize: 14, fontWeight: 700, color: scoreColor(pct), fontFamily: 'var(--font-display)' }}>{exam.score}/{exam.totalQuestions} ({pct}%)</span>
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
                <span style={{ fontSize: 12, color: 'rgba(11,11,14,0.58)' }}>{formatDate(fb.createdAt)}</span>
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
