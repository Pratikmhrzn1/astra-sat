import { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getStudents, getStudentExams, getStudentDetail, getStudentAnalytics } from '@/features/roster/api';
import { sendFeedback, getSentFeedback } from '@/features/messages';
import { DomainPanel, ReadinessCard, TrendPanel } from '@/features/progress';
import { Button, Modal, Textarea, SubjectBadge, Badge, InlineLoader, pageClass, surfaceClass } from '@/shared/ui';
import { BackPill, SendFeedbackPill } from '@/features/roster/components/DetailHeader';
import { cn, formatDate } from '@/shared/lib/utils';
import { getApiError } from '@/shared/api/http';
import { accuracyColor as scoreColor, daysUntil } from '@/entities/score';

const panel = cn(surfaceClass, 'overflow-hidden');
const panelHead = 'px-[22px] py-4 border-b border-border-soft';
const panelTitle = 'text-base font-semibold text-ink m-0';

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

  if (isLoading) return <InlineLoader />;

  const completedExams = exams.filter((e) => e.status === 'completed');

  return (
    <div className={pageClass}>
      <div className="flex items-start justify-between gap-3 flex-wrap mb-7">
        <div className="flex items-center gap-3.5 min-w-0">
          <BackPill onClick={() => navigate(-1)} />
          {student && (
            <div className="min-w-0">
              <h1 className="font-display font-semibold text-[28px] sm:text-4xl m-0 tracking-[-0.02em] text-ink">{student.name}</h1>
              <p className="text-[13px] text-muted m-0">{student.email}</p>
            </div>
          )}
        </div>
        <SendFeedbackPill onClick={() => { setShowFeedback(true); setFeedbackError(''); }} />
      </div>

      <div className={cn(panel, 'mb-5 px-[22px] py-4')}>
        <h2 className={cn(panelTitle, 'mb-2.5')}>Goal</h2>
        {detail?.profile?.targetScore || detail?.profile?.testDate ? (
          <div className="flex gap-7 flex-wrap">
            <div>
              <div className="text-xs text-muted">Target score</div>
              <div className="text-[15px] font-semibold">{detail.profile.targetScore ?? '—'}</div>
            </div>
            <div>
              <div className="text-xs text-muted">Test date</div>
              <div className="text-[15px] font-semibold">
                {detail.profile.testDate ? formatDate(detail.profile.testDate) : '—'}
                {(() => {
                  const days = daysUntil(detail.profile.testDate);
                  if (days === null) return null;
                  return (
                    <span className="text-[13px] font-normal text-muted ml-2">
                      {days >= 0 ? `${days} ${days === 1 ? 'day' : 'days'} away` : 'passed'}
                    </span>
                  );
                })()}
              </div>
            </div>
          </div>
        ) : (
          <div className="text-sm text-muted">This student hasn't set a target score yet.</div>
        )}
      </div>

      {analytics && (analytics.trend.length > 0 || analytics.domains.length > 0) && (
        <div className="flex flex-col gap-4 mb-5">
          <ReadinessCard readiness={analytics.readiness} />
          <TrendPanel trend={analytics.trend} />
          {/* No practise button: a teacher assigning work to a student is an
              assignment, which is Phase 3, not a click that starts an exam
              under someone else's name. */}
          <DomainPanel overview={analytics} />
        </div>
      )}

      <div className={cn(panel, 'mb-5')}>
        <div className={panelHead}>
          <h2 className={panelTitle}>Exam History ({completedExams.length})</h2>
        </div>
        {completedExams.length === 0 ? (
          <div className="px-[22px] py-10 text-center text-muted text-sm">No completed exams yet.</div>
        ) : (
          completedExams.map((exam) => {
            const pct = exam.score !== null ? Math.round((exam.score / exam.totalQuestions) * 100) : null;
            return (
              <div key={exam.id} className="flex items-center gap-3.5 flex-wrap px-[22px] py-3.5 border-b border-sunken last:border-b-0">
                {exam.subject && <SubjectBadge subject={exam.subject as 'english' | 'math'} />}
                <div className="flex-1 min-w-0">
                  <div className="text-[14.5px] font-semibold text-ink">{exam.setTitle ?? exam.label ?? 'Practice'}</div>
                  <div className="text-xs text-muted">{formatDate(exam.startedAt)}</div>
                </div>
                {pct !== null && (
                  <span className="text-sm font-bold font-display" style={{ color: scoreColor(pct) }}>{exam.score}/{exam.totalQuestions} ({pct}%)</span>
                )}
                <Link
                  to={`/teacher/students/${studentId}/exams/${exam.id}`}
                  className="inline-flex items-center h-[34px] px-3.5 border border-border rounded-full bg-white text-[13px] font-semibold text-ink no-underline"
                >View Results</Link>
              </div>
            );
          })
        )}
      </div>

      {studentFeedback.length > 0 && (
        <div className={panel}>
          <div className={panelHead}>
            <h2 className={panelTitle}>Feedback Sent</h2>
          </div>
          {studentFeedback.map((fb) => (
            <div key={fb.id} className="px-[22px] py-4 border-b border-sunken last:border-b-0">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-muted">{formatDate(fb.createdAt)}</span>
                <Badge variant={fb.isRead ? 'success' : 'neutral'}>{fb.isRead ? 'Read' : 'Unread'}</Badge>
              </div>
              <p className="text-sm text-body m-0 leading-[1.6] whitespace-pre-wrap">{fb.content}</p>
            </div>
          ))}
        </div>
      )}

      <Modal isOpen={showFeedback} onClose={() => setShowFeedback(false)} title={`Send Feedback to ${student?.name ?? 'Student'}`}
        footer={<><Button variant="secondary" onClick={() => setShowFeedback(false)}>Cancel</Button><Button onClick={() => feedbackMutation.mutate()} loading={feedbackMutation.isPending} disabled={!feedbackContent.trim()}>Send Feedback</Button></>}
      >
        <div className="flex flex-col gap-3">
          <Textarea label="Feedback message" value={feedbackContent} onChange={(e) => setFeedbackContent(e.target.value)} placeholder="Write your feedback here…" rows={5} />
          {feedbackError && <p className="text-danger text-[13px]">{feedbackError}</p>}
        </div>
      </Modal>
    </div>
  );
}
