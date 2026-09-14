import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, XCircle, MinusCircle } from 'lucide-react';
import { getStudentExamResults, sendFeedback } from '@/api/teacher';
import { Button, Modal, Textarea, SubjectBadge, InlineLoader, pageClass, surfaceClass } from '@/components/common';
import { BackPill, SendFeedbackPill } from '@/components/teacher/DetailHeader';
import { cn } from '@/lib/utils';
import { getApiError } from '@/api/http';

function scoreTone(pct: number) {
  return pct >= 80 ? 'text-green-dark' : pct >= 65 ? 'text-green-sat' : pct >= 50 ? 'text-gold' : 'text-amber-sat';
}

export default function StudentExamDetail() {
  const { studentId, examId } = useParams<{ studentId: string; examId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [showFeedback, setShowFeedback] = useState(false);
  const [feedbackContent, setFeedbackContent] = useState('');
  const [feedbackError, setFeedbackError] = useState('');

  const { data, isLoading, error } = useQuery({ queryKey: ['teacher', 'student-exam-results', studentId, examId], queryFn: () => getStudentExamResults(studentId!, examId!), enabled: !!studentId && !!examId });

  const feedbackMutation = useMutation({
    mutationFn: () => sendFeedback(studentId!, feedbackContent, examId),
    onSuccess: () => { setShowFeedback(false); setFeedbackContent(''); queryClient.invalidateQueries({ queryKey: ['teacher', 'feedback'] }); },
    onError: (err) => setFeedbackError(getApiError(err)),
  });

  if (isLoading) return <InlineLoader />;

  if (error || !data) {
    return (
      <div className="text-center pt-16">
        <p className="text-danger mb-4">Failed to load exam results.</p>
        <button onClick={() => navigate(-1)} className="h-10 px-5 border border-border rounded-full bg-white cursor-pointer">Go back</button>
      </div>
    );
  }

  const { exam, set, student, results } = data;
  const pct = exam.score !== null ? Math.round((exam.score / exam.totalQuestions) * 100) : 0;
  const correct = results.filter((r) => r.isCorrect).length;
  const wrong = results.filter((r) => r.isCorrect === false).length;
  const skipped = results.filter((r) => r.isCorrect === null).length;

  return (
    <div className={pageClass}>
      <div className="flex items-start justify-between gap-3 flex-wrap mb-7">
        <div className="flex items-center gap-3.5 flex-wrap min-w-0">
          <BackPill onClick={() => navigate(-1)} />
          <div className="min-w-0">
            <h1 className="font-display font-semibold text-[26px] sm:text-[32px] m-0 tracking-[-0.02em] text-ink">{set?.title ?? 'Exam Results'}</h1>
            <p className="text-[13px] text-muted m-0">{student.name}</p>
          </div>
          {set && <SubjectBadge subject={set.subject as 'english' | 'math'} />}
        </div>
        <SendFeedbackPill onClick={() => { setShowFeedback(true); setFeedbackError(''); }} />
      </div>

      {/* Score hero */}
      <div className="bg-ink rounded-3xl px-6 py-6 sm:px-8 sm:py-7 flex items-center justify-between gap-6 flex-wrap mb-5">
        <div>
          <div className="text-[11px] font-bold tracking-[0.1em] uppercase text-white/50 mb-1">Score</div>
          <div className={cn('font-display font-semibold text-[56px] sm:text-[72px] leading-[0.9]', scoreTone(pct))}>{pct}%</div>
          <div className="text-[13px] text-white/50 mt-2">{exam.score} / {exam.totalQuestions} correct</div>
        </div>
        <div className="flex gap-6 sm:gap-9">
          {[
            { label: 'Correct', value: correct, tone: 'text-green-sat' },
            { label: 'Wrong', value: wrong, tone: 'text-danger' },
            { label: 'Skipped', value: skipped, tone: 'text-white/50' },
          ].map(({ label, value, tone }) => (
            <div key={label} className="text-center">
              <div className={cn('font-display font-semibold text-[36px] sm:text-[44px] leading-none', tone)}>{value}</div>
              <div className="text-xs font-semibold text-white/45 mt-1">{label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Question results */}
      <div className="flex flex-col gap-2.5">
        {results.map((r, i) => {
          const opts = [{ key: 'a', text: r.optionA }, { key: 'b', text: r.optionB }, { key: 'c', text: r.optionC }, { key: 'd', text: r.optionD }];
          return (
            <div key={r.questionId} className={cn(surfaceClass, 'px-[22px] py-[18px]')}>
              <div className="flex items-start gap-3 mb-3.5">
                {r.isCorrect === true
                  ? <CheckCircle2 size={20} className="text-green-sat shrink-0 mt-0.5" />
                  : r.isCorrect === false
                    ? <XCircle size={20} className="text-danger shrink-0 mt-0.5" />
                    : <MinusCircle size={20} className="text-ink/30 shrink-0 mt-0.5" />}
                <div className="flex-1">
                  <p className="text-xs font-semibold text-muted mb-1">Question {i + 1}</p>
                  <p className="text-[14.5px] text-ink m-0 leading-normal" dangerouslySetInnerHTML={{ __html: r.questionText }} />
                </div>
              </div>
              <div className="flex flex-col gap-1.5 pl-8">
                {opts.map(({ key, text }) => {
                  const isSelected = r.selectedAnswer === key;
                  const isCorrect = r.correctAnswer === key;
                  return (
                    <div
                      key={key}
                      className={cn(
                        'flex items-center gap-2.5 px-3.5 py-[9px] rounded-[9px] border',
                        isCorrect ? 'bg-green-sat/[.08] border-green-sat/30' : isSelected ? 'bg-danger/[.07] border-danger/25' : 'bg-transparent border-border-soft',
                      )}
                    >
                      <span className="text-xs font-bold text-stone w-4">{key.toUpperCase()}.</span>
                      <span className="text-[13.5px] flex-1 text-ink">{text}</span>
                      {isCorrect && <span className="text-[11px] font-bold text-green-sat">CORRECT</span>}
                      {isSelected && !isCorrect && <span className="text-[11px] font-bold text-danger">STUDENT</span>}
                    </div>
                  );
                })}
              </div>
              {r.explanation && (
                <div className="mt-3 bg-blue-sat/5 border border-blue-sat/15 rounded-[9px] px-3.5 py-2.5">
                  <p className="text-[11px] font-bold text-blue-sat mb-1">EXPLANATION</p>
                  <p className="text-[13.5px] text-body m-0 leading-[1.55]">{r.explanation}</p>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <Modal isOpen={showFeedback} onClose={() => setShowFeedback(false)} title={`Send Feedback to ${student.name}`}
        footer={<><Button variant="secondary" onClick={() => setShowFeedback(false)}>Cancel</Button><Button onClick={() => feedbackMutation.mutate()} loading={feedbackMutation.isPending} disabled={!feedbackContent.trim()}>Send Feedback</Button></>}
      >
        <div className="flex flex-col gap-3">
          <p className="text-[13px] text-subtle m-0">This feedback will be linked to <strong className="text-ink">{set?.title}</strong> and visible to the student.</p>
          <Textarea label="Feedback" rows={5} value={feedbackContent} onChange={(e) => setFeedbackContent(e.target.value)} placeholder="Write your feedback here…" />
          {feedbackError && <p className="text-danger text-[13px]">{feedbackError}</p>}
        </div>
      </Modal>
    </div>
  );
}
