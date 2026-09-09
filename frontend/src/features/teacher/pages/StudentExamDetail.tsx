import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, CheckCircle2, XCircle, MinusCircle, MessageSquare } from 'lucide-react';
import { getStudentExamResults, sendFeedback } from '@/features/teacher/api/teacher.api';
import { Button, Modal, Textarea, SubjectBadge, Spinner } from '@/shared/ui';
import { getApiError } from '@/shared/api/client';

function scoreColor(pct: number) {
  return pct >= 80 ? '#1A6B3C' : pct >= 65 ? '#2E7D5A' : pct >= 50 ? '#B8893E' : '#C47A1B';
}

const CARD: React.CSSProperties = { background: '#fff', border: '1px solid #E7E4DE', borderRadius: 16, boxShadow: '0 1px 3px rgba(11,11,14,0.05)' };

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

  if (isLoading) {
    return <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 64 }}><Spinner className="w-8 h-8 text-[#E2562B]" /></div>;
  }

  if (error || !data) {
    return (
      <div style={{ textAlign: 'center', paddingTop: 64 }}>
        <p style={{ color: '#C0392B', marginBottom: 16 }}>Failed to load exam results.</p>
        <button onClick={() => navigate(-1)} style={{ height: 40, padding: '0 20px', border: '1px solid #E7E4DE', borderRadius: 9999, background: '#fff', cursor: 'pointer', fontFamily: 'inherit' }}>Go back</button>
      </div>
    );
  }

  const { exam, set, student, results } = data;
  const pct = exam.score !== null ? Math.round((exam.score / exam.totalQuestions) * 100) : 0;
  const correct = results.filter((r) => r.isCorrect).length;
  const wrong = results.filter((r) => r.isCorrect === false).length;
  const skipped = results.filter((r) => r.isCorrect === null).length;

  return (
    <div className="screen-fade" style={{ padding: '36px 48px 64px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 28 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <button onClick={() => navigate(-1)} style={{ display: 'flex', alignItems: 'center', gap: 6, height: 36, padding: '0 14px', border: '1px solid #E7E4DE', borderRadius: 9999, background: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', color: '#0B0B0E', fontFamily: 'inherit' }}>
            <ArrowLeft size={14} /> Back
          </button>
          <div>
            <h1 style={{ fontFamily: "'Instrument Serif', serif", fontSize: 32, margin: 0, letterSpacing: '-0.02em', color: '#0B0B0E' }}>{set?.title ?? 'Exam Results'}</h1>
            <p style={{ fontSize: 13, color: 'rgba(11,11,14,0.45)', margin: 0 }}>{student.name}</p>
          </div>
          {set && <SubjectBadge subject={set.subject as 'english' | 'math'} />}
        </div>
        <button onClick={() => { setShowFeedback(true); setFeedbackError(''); }}
          style={{ display: 'flex', alignItems: 'center', gap: 8, height: 40, padding: '0 18px', background: '#E2562B', color: '#fff', border: 'none', borderRadius: 9999, fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0 }}
        ><MessageSquare size={15} /> Send Feedback</button>
      </div>

      {/* Score hero */}
      <div style={{ background: '#0B0B0E', borderRadius: 18, padding: '28px 32px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 24, marginBottom: 20 }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.4)', marginBottom: 4 }}>Score</div>
          <div style={{ fontFamily: "'Instrument Serif', serif", fontSize: 72, lineHeight: 0.9, color: scoreColor(pct) }}>{pct}%</div>
          <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', marginTop: 8 }}>{exam.score} / {exam.totalQuestions} correct</div>
        </div>
        <div style={{ display: 'flex', gap: 36 }}>
          {[{ label: 'Correct', value: correct, color: '#2E7D5A' }, { label: 'Wrong', value: wrong, color: '#C0392B' }, { label: 'Skipped', value: skipped, color: 'rgba(255,255,255,0.35)' }].map(({ label, value, color }) => (
            <div key={label} style={{ textAlign: 'center' }}>
              <div style={{ fontFamily: "'Instrument Serif', serif", fontSize: 44, lineHeight: 1, color }}>{value}</div>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.45)', marginTop: 4 }}>{label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Question results */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {results.map((r, i) => {
          const opts = [{ key: 'a', text: r.optionA }, { key: 'b', text: r.optionB }, { key: 'c', text: r.optionC }, { key: 'd', text: r.optionD }];
          return (
            <div key={r.id} style={{ ...CARD, padding: '18px 22px' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 14 }}>
                {r.isCorrect === true ? <CheckCircle2 size={20} color="#2E7D5A" style={{ flexShrink: 0, marginTop: 2 }} /> : r.isCorrect === false ? <XCircle size={20} color="#C0392B" style={{ flexShrink: 0, marginTop: 2 }} /> : <MinusCircle size={20} color="rgba(11,11,14,0.3)" style={{ flexShrink: 0, marginTop: 2 }} />}
                <div style={{ flex: 1 }}>
                  <p style={{ fontSize: 12, fontWeight: 600, color: 'rgba(11,11,14,0.4)', marginBottom: 4 }}>Question {i + 1}</p>
                  <p style={{ fontSize: 14.5, color: '#0B0B0E', margin: 0, lineHeight: 1.5 }} dangerouslySetInnerHTML={{ __html: r.questionText }} />
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, paddingLeft: 32 }}>
                {opts.map(({ key, text }) => {
                  const isSelected = r.selectedAnswer === key;
                  const isCorrect = r.correctAnswer === key;
                  const bg = isCorrect ? 'rgba(46,125,90,0.08)' : isSelected ? 'rgba(192,57,43,0.07)' : 'transparent';
                  const bd = isCorrect ? '1px solid rgba(46,125,90,0.3)' : isSelected ? '1px solid rgba(192,57,43,0.25)' : '1px solid #EEEBE5';
                  return (
                    <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 14px', borderRadius: 9, background: bg, border: bd }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: '#8C8880', width: 16 }}>{key.toUpperCase()}.</span>
                      <span style={{ fontSize: 13.5, flex: 1, color: '#0B0B0E' }}>{text}</span>
                      {isCorrect && <span style={{ fontSize: 11, fontWeight: 700, color: '#2E7D5A' }}>CORRECT</span>}
                      {isSelected && !isCorrect && <span style={{ fontSize: 11, fontWeight: 700, color: '#C0392B' }}>STUDENT</span>}
                    </div>
                  );
                })}
              </div>
              {r.explanation && (
                <div style={{ marginTop: 12, paddingLeft: 32, background: 'rgba(37,99,168,0.05)', border: '1px solid rgba(37,99,168,0.15)', borderRadius: 9, padding: '10px 14px' }}>
                  <p style={{ fontSize: 11, fontWeight: 700, color: '#2563A8', marginBottom: 4 }}>EXPLANATION</p>
                  <p style={{ fontSize: 13.5, color: 'rgba(11,11,14,0.7)', margin: 0, lineHeight: 1.55 }}>{r.explanation}</p>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <Modal isOpen={showFeedback} onClose={() => setShowFeedback(false)} title={`Send Feedback to ${student.name}`}
        footer={<><Button variant="secondary" onClick={() => setShowFeedback(false)}>Cancel</Button><Button onClick={() => feedbackMutation.mutate()} loading={feedbackMutation.isPending} disabled={!feedbackContent.trim()}>Send Feedback</Button></>}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <p style={{ fontSize: 13, color: 'rgba(11,11,14,0.55)', margin: 0 }}>This feedback will be linked to <strong style={{ color: '#0B0B0E' }}>{set?.title}</strong> and visible to the student.</p>
          <Textarea label="Feedback" rows={5} value={feedbackContent} onChange={(e) => setFeedbackContent(e.target.value)} placeholder="Write your feedback here…" />
          {feedbackError && <p style={{ color: '#C0392B', fontSize: 13 }}>{feedbackError}</p>}
        </div>
      </Modal>
    </div>
  );
}
