import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useMobile } from '../../hooks/useMobile';
import {
  getExamResults, getMockNarrative, retryNarrative,
  confirmAnswer, sendChatMessage, reviewVocab,
  type NarrativeContent, type ConfirmFeedbacks,
  type ReasoningClassification, type CommandOfEvidenceContent,
  type TransitionsCoachContent, type VocabDrillContent,
} from '../../api/student';

// ── AI feedback metadata ─────────────────────────────────────────────────────

const CLASSIFICATION_META: Record<
  ReasoningClassification,
  { label: string; color: string; bg: string; border: string }
> = {
  correct_logic_correct_answer: { label: 'Strong reasoning',              color: '#1A6B3C', bg: 'rgba(46,125,90,0.07)',  border: 'rgba(46,125,90,0.25)' },
  correct_logic_wrong_answer:   { label: 'Sound logic — likely a misread', color: '#B8893E', bg: 'rgba(184,137,62,0.07)', border: 'rgba(184,137,62,0.3)' },
  wrong_logic_correct_answer:   { label: 'Right answer — review your reasoning', color: '#B8893E', bg: 'rgba(184,137,62,0.07)', border: 'rgba(184,137,62,0.3)' },
  wrong_logic_wrong_answer:     { label: 'Comprehension gap identified',   color: '#C0392B', bg: 'rgba(192,57,43,0.07)', border: 'rgba(192,57,43,0.2)' },
};

const CONFIDENCE_CHIPS: { value: 'sure' | 'eliminated' | 'guessed'; label: string }[] = [
  { value: 'sure',       label: 'I was sure' },
  { value: 'eliminated', label: 'Eliminated the wrong ones' },
  { value: 'guessed',    label: 'Guessed' },
];

// ── Helpers ──────────────────────────────────────────────────────────────────

function scoreColor(v: number) {
  return v >= 680 ? '#1A6B3C' : v >= 620 ? '#2E7D5A' : v >= 560 ? '#B8893E' : '#C47A1B';
}

const CARD: React.CSSProperties = { background: '#fff', border: '1px solid #E7E4DE', borderRadius: 16, boxShadow: '0 1px 3px rgba(11,11,14,0.05)' };

// ── AiFeedbackPanel — shared across questions ─────────────────────────────────

function AiFeedbackPanel({
  feedbacks,
  vocabTrackingId,
  questionId,
  vocabPick,
  vocabSubmitted,
  setVocabPick,
  setVocabSubmitted,
}: {
  feedbacks: ConfirmFeedbacks;
  vocabTrackingId: string | null;
  questionId: string;
  vocabPick: Record<string, string>;
  vocabSubmitted: Record<string, boolean>;
  setVocabPick: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  setVocabSubmitted: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 14 }}>
      {feedbacks.reasoning_checkpoint && (() => {
        const rc = feedbacks.reasoning_checkpoint!;
        const meta = CLASSIFICATION_META[rc.classification as ReasoningClassification] ?? CLASSIFICATION_META.correct_logic_correct_answer;
        return (
          <div style={{ padding: '16px 18px', borderRadius: 12, background: meta.bg, border: `1px solid ${meta.border}` }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: meta.color, marginBottom: 8 }}>{meta.label}</div>
            <p style={{ fontSize: 14, lineHeight: 1.6, color: '#0B0B0E', margin: 0 }}>{rc.explanation}</p>
          </div>
        );
      })()}

      {feedbacks.grammar_diagnosis && (
        <div style={{ padding: '12px 16px', borderRadius: 10, background: '#F0ECE4', border: '1px solid rgba(184,137,62,0.25)' }}>
          <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#8A6020', marginBottom: 5 }}>
            Grammar rule: {feedbacks.grammar_diagnosis.grammarRule}
          </div>
          <p style={{ fontSize: 13.5, lineHeight: 1.55, color: '#0B0B0E', margin: 0 }}>{feedbacks.grammar_diagnosis.grammarFix}</p>
        </div>
      )}

      {feedbacks.trap_explainer && (
        <div style={{ padding: '12px 16px', borderRadius: 10, background: 'rgba(11,11,14,0.03)', border: '1px solid #E7E4DE' }}>
          <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(11,11,14,0.45)', marginBottom: 5 }}>
            Trap: {feedbacks.trap_explainer.trap}
          </div>
          <p style={{ fontSize: 13.5, lineHeight: 1.55, color: '#0B0B0E', margin: 0 }}>{feedbacks.trap_explainer.explanation}</p>
        </div>
      )}

      {feedbacks.command_of_evidence && (() => {
        const coe = feedbacks.command_of_evidence as CommandOfEvidenceContent;
        return (
          <div style={{ padding: '12px 16px', borderRadius: 10, background: 'rgba(37,99,235,0.04)', border: '1px solid rgba(37,99,235,0.2)' }}>
            <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#1D4ED8', marginBottom: 8 }}>Supporting evidence</div>
            <blockquote style={{ fontFamily: "'Instrument Serif', serif", fontSize: 14.5, lineHeight: 1.6, color: '#0B0B0E', margin: '0 0 10px', paddingLeft: 12, borderLeft: '2px solid rgba(37,99,235,0.35)', fontStyle: 'italic' }}>
              "{coe.supportingLine}"
            </blockquote>
            <p style={{ fontSize: 13.5, lineHeight: 1.55, color: '#0B0B0E', margin: '0 0 4px' }}>{coe.whyCorrect}</p>
            <p style={{ fontSize: 13.5, lineHeight: 1.55, color: 'rgba(11,11,14,0.6)', margin: 0 }}>{coe.whyStudentWrong}</p>
          </div>
        );
      })()}

      {feedbacks.transitions_coach && (() => {
        const tc = feedbacks.transitions_coach as TransitionsCoachContent;
        return (
          <div style={{ padding: '12px 16px', borderRadius: 10, background: 'rgba(124,58,237,0.04)', border: '1px solid rgba(124,58,237,0.2)' }}>
            <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#6D28D9', marginBottom: 8 }}>Transition logic</div>
            <p style={{ fontSize: 13.5, lineHeight: 1.55, color: '#0B0B0E', margin: '0 0 6px' }}>{tc.logicalRelationship}</p>
            <p style={{ fontSize: 13.5, lineHeight: 1.55, color: '#0B0B0E', margin: '0 0 4px' }}>{tc.whyCorrect}</p>
            <p style={{ fontSize: 13.5, lineHeight: 1.55, color: 'rgba(11,11,14,0.6)', margin: 0 }}>{tc.whyStudentWrong}</p>
          </div>
        );
      })()}

      {feedbacks.vocab_drill && (() => {
        const vd = feedbacks.vocab_drill as VocabDrillContent;
        const optLetters = ['A', 'B', 'C', 'D'];
        const picked = vocabPick[questionId];
        const isSubmitted = !!vocabSubmitted[questionId];
        const isPickCorrect = picked === vd.correctOption;

        const handleVocabSubmit = () => {
          if (!picked || isSubmitted) return;
          setVocabSubmitted((s) => ({ ...s, [questionId]: true }));
          if (vocabTrackingId) reviewVocab(vocabTrackingId, picked === vd.correctOption).catch(console.error);
        };

        return (
          <div style={{ padding: '14px 16px', borderRadius: 12, background: 'rgba(0,128,128,0.04)', border: '2px solid rgba(0,128,128,0.18)' }}>
            <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#0D7377', marginBottom: 6 }}>
              Vocab drill — "{vd.word}"
            </div>
            <p style={{ fontSize: 13, lineHeight: 1.55, color: 'rgba(11,11,14,0.6)', margin: '0 0 10px', fontStyle: 'italic' }}>"{vd.sentenceContext}"</p>
            <p style={{ fontSize: 13.5, fontWeight: 600, color: '#0B0B0E', margin: '0 0 10px' }}>{vd.followUpQuestion}</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 10 }}>
              {vd.options.map((opt, oi) => {
                const letter = optLetters[oi];
                const isPicked = picked === letter;
                const isCorrectOpt = letter === vd.correctOption;
                let bg = '#fff', border = '1px solid #C8C4BC', color = '#0B0B0E';
                if (isSubmitted) {
                  if (isCorrectOpt) { bg = 'rgba(46,125,90,0.1)'; border = '1.5px solid #2E7D5A'; color = '#1A5C38'; }
                  else if (isPicked) { bg = 'rgba(192,57,43,0.08)'; border = '1.5px solid #C0392B'; color = '#8B1A10'; }
                } else if (isPicked) { bg = 'rgba(0,128,128,0.07)'; border = '1.5px solid #0D7377'; }
                return (
                  <button key={letter} onClick={() => { if (!isSubmitted) setVocabPick((p) => ({ ...p, [questionId]: letter })); }} disabled={isSubmitted}
                    style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 13px', borderRadius: 9, border, background: bg, color, fontSize: 13, textAlign: 'left', cursor: isSubmitted ? 'default' : 'pointer', fontFamily: 'inherit', transition: 'all 0.12s' }}>
                    <span style={{ width: 22, height: 22, borderRadius: 9999, border, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, flexShrink: 0 }}>{letter}</span>
                    {opt}
                  </button>
                );
              })}
            </div>
            {isSubmitted ? (
              <div style={{ padding: '10px 12px', borderRadius: 8, background: isPickCorrect ? 'rgba(46,125,90,0.08)' : 'rgba(192,57,43,0.07)', marginTop: 4 }}>
                <div style={{ fontSize: 11.5, fontWeight: 700, color: isPickCorrect ? '#1A5C38' : '#8B1A10', marginBottom: 4 }}>
                  {isPickCorrect ? '✓ Correct' : '✗ Incorrect — correct answer: ' + vd.correctOption}
                </div>
                <p style={{ fontSize: 13, lineHeight: 1.5, color: '#0B0B0E', margin: 0 }}>{vd.explanation}</p>
              </div>
            ) : (
              <button onClick={handleVocabSubmit} disabled={!picked}
                style={{ height: 36, padding: '0 18px', borderRadius: 9999, border: 'none', background: picked ? '#0D7377' : '#C8C4BC', color: '#fff', fontSize: 13, fontWeight: 700, cursor: picked ? 'pointer' : 'default', fontFamily: 'inherit' }}>
                Check answer
              </button>
            )}
          </div>
        );
      })()}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function ExamDetail() {
  const { examId } = useParams<{ examId: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const isMobile = useMobile();
  const englishExamId = searchParams.get('englishExamId') || null;
  const [reviewOpen, setReviewOpen] = useState<Record<number, boolean>>({});

  // AI guidance state (keyed by questionId)
  const [aiPanelOpen, setAiPanelOpen] = useState<Record<string, boolean>>({});
  const [aiPending, setAiPending] = useState<Record<string, { confidence: 'sure' | 'eliminated' | 'guessed' | null; reasoning: string }>>({});
  const [aiResults, setAiResults] = useState<Record<string, { isCorrect: boolean; feedbacks: ConfirmFeedbacks; vocabTrackingId: string | null }>>({});
  const [aiLoading, setAiLoading] = useState<Record<string, boolean>>({});
  const [vocabPick, setVocabPick] = useState<Record<string, string>>({});
  const [vocabSubmitted, setVocabSubmitted] = useState<Record<string, boolean>>({});

  // Chat state
  const [chatQuestionId, setChatQuestionId] = useState<string | null>(null);
  const [chatSessionId, setChatSessionId] = useState<string | null>(null);
  const [chatMessages, setChatMessages] = useState<{ role: 'user' | 'assistant'; content: string }[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const chatMessagesRef = useRef<HTMLDivElement>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ['student', 'exam-results', examId],
    queryFn: () => getExamResults(examId!),
    enabled: !!examId,
  });

  // For mock math results pages, also fetch the English section
  const { data: englishData } = useQuery({
    queryKey: ['student', 'exam-results', englishExamId],
    queryFn: () => getExamResults(englishExamId!),
    enabled: !!englishExamId,
  });

  const isMockCombined = !!englishExamId && !!englishData;
  const isPractice = data?.exam.type === 'individual';
  const isMockExam = data?.exam.type === 'mock_english' || data?.exam.type === 'mock_math';
  const pollCountRef = useRef(0);
  const queryClient = useQueryClient();

  const retryMutation = useMutation({
    mutationFn: () => retryNarrative(examId!),
    onSuccess: () => {
      pollCountRef.current = 0;
      queryClient.invalidateQueries({ queryKey: ['student', 'narrative', examId] });
    },
  });

  const { data: narrativeData, isError: narrativeError } = useQuery({
    queryKey: ['student', 'narrative', examId],
    queryFn: async () => { pollCountRef.current++; return getMockNarrative(examId!); },
    enabled: !!examId && (isMockExam || isPractice),
    refetchInterval: (query) => {
      if (query.state.data?.status !== 'pending') return false;
      if (pollCountRef.current >= 10) return false;
      return 3000;
    },
    retry: false,
  });

  // Reset chat when switching questions
  useEffect(() => {
    setChatMessages([]);
    setChatSessionId(null);
    setChatError(null);
    setChatInput('');
  }, [chatQuestionId]);

  // Auto-scroll chat
  useEffect(() => {
    if (chatMessagesRef.current) chatMessagesRef.current.scrollTop = chatMessagesRef.current.scrollHeight;
  }, [chatMessages, chatLoading]);

  // Route AI calls to the correct exam — English questions need englishExamId
  const getExamIdForQuestion = (questionId: string): string => {
    if (englishExamId && engResults.some((r) => r.id === questionId)) return englishExamId;
    return examId!;
  };

  const handleAiGuidance = async (questionId: string) => {
    const pending = aiPending[questionId];
    if (!pending?.confidence || aiLoading[questionId]) return;
    setAiLoading((l) => ({ ...l, [questionId]: true }));
    try {
      const result = await confirmAnswer(getExamIdForQuestion(questionId), questionId, {
        confidence: pending.confidence,
        reasoning: pending.reasoning || undefined,
      });
      setAiResults((r) => ({ ...r, [questionId]: result }));
    } catch {
      // silently fail
    } finally {
      setAiLoading((l) => ({ ...l, [questionId]: false }));
    }
  };

  const handleSendChat = useCallback(async () => {
    const msg = chatInput.trim();
    if (!msg || chatLoading || !examId || !chatQuestionId) return;
    const activeExamId = getExamIdForQuestion(chatQuestionId);
    setChatInput('');
    setChatError(null);
    setChatMessages((prev) => [...prev, { role: 'user', content: msg }]);
    setChatLoading(true);
    try {
      const result = await sendChatMessage({ sessionId: chatSessionId ?? undefined, userMessage: msg, examId: activeExamId, questionId: chatQuestionId });
      if (!chatSessionId) setChatSessionId(result.sessionId);
      setChatMessages((prev) => [...prev, { role: 'assistant', content: result.assistantMessage }]);
    } catch {
      setChatError("Couldn't reach the tutor right now — try again in a moment.");
      setChatMessages((prev) => prev.slice(0, -1));
    } finally {
      setChatLoading(false);
    }
  }, [chatInput, chatLoading, chatSessionId, examId, chatQuestionId, englishExamId, englishData]);

  if (isLoading) {
    return <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 64 }}><div style={{ fontFamily: "'Instrument Serif', serif", fontSize: 24, color: 'rgba(11,11,14,0.4)' }}>Loading…</div></div>;
  }

  if (error || !data) {
    return (
      <div style={{ textAlign: 'center', paddingTop: 64 }}>
        <p style={{ color: '#C0392B', marginBottom: 16 }}>Failed to load results.</p>
        <button onClick={() => navigate(-1)} style={{ height: 40, padding: '0 20px', border: '1px solid #C8C4BC', borderRadius: 9999, background: '#fff', cursor: 'pointer', fontFamily: 'inherit' }}>Go back</button>
      </div>
    );
  }

  const { exam, set, results } = data;

  // Combined mock test totals (Math + English sections)
  const engResults = englishData?.results ?? [];
  const mathScore800 = exam.score !== null ? Math.round(200 + (exam.score / exam.totalQuestions) * 600) : 0;
  const engScore800 = englishData?.exam.score !== null && englishData?.exam.score !== undefined
    ? Math.round(200 + (englishData.exam.score / englishData.exam.totalQuestions) * 600) : 0;
  const totalScore1600 = isMockCombined ? mathScore800 + engScore800 : null;

  const score800 = mathScore800;
  const accuracy = exam.score !== null ? Math.round((exam.score / exam.totalQuestions) * 100) : 0;
  const correct = results.filter((r) => r.isCorrect).length;
  const wrong = results.filter((r) => r.isCorrect === false).length;
  const skipped = results.filter((r) => r.isCorrect === null).length;
  const headlineColor = scoreColor(score800);

  const topics: Record<string, { ok: number; n: number }> = {};
  results.forEach((r) => {
    const t = 'Question';
    if (!topics[t]) topics[t] = { ok: 0, n: 0 };
    topics[t].n++;
    if (r.isCorrect) topics[t].ok++;
  });

  const toggleReview = (i: number) => setReviewOpen((p) => ({ ...p, [i]: !p[i] }));

  return (
    <div className="screen-fade" style={{ padding: isMobile ? '20px 16px 80px' : '36px 48px 64px' }}>
      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#E2562B', marginBottom: 6 }}>
        {isMockCombined ? 'Full mock SAT · score report' : `Score report · ${set?.subject === 'math' ? 'Math' : 'Reading & Writing'}`}
        {isPractice && <span style={{ marginLeft: 10, color: '#2563A8' }}>· Practice</span>}
      </div>
      <h1 style={{ fontFamily: "'Instrument Serif', serif", fontSize: isMobile ? 28 : 40, margin: '0 0 20px', letterSpacing: '-0.02em' }}>Performance Report</h1>

      {/* Hero */}
      <div className="pop" style={{ background: '#0B0B0E', borderRadius: 18, padding: isMobile ? '22px 20px' : '32px 36px', display: 'flex', alignItems: isMobile ? 'flex-start' : 'center', flexDirection: isMobile ? 'column' : 'row', justifyContent: 'space-between', gap: isMobile ? 20 : 36, marginBottom: 20, position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', left: -60, bottom: -80, width: 240, height: 240, borderRadius: 9999, background: 'radial-gradient(circle, rgba(226,86,43,0.16), transparent 70%)' }} />
        <div style={{ position: 'relative' }}>
          {isMockCombined ? (
            <>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.4)' }}>Total score</div>
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 14, marginTop: 4, whiteSpace: 'nowrap' }}>
                <div style={{ fontFamily: "'Instrument Serif', serif", fontSize: isMobile ? 60 : 88, lineHeight: 0.95, letterSpacing: '-0.03em', color: totalScore1600! >= 1200 ? '#2E7D5A' : totalScore1600! >= 1000 ? '#B8893E' : '#C0392B' }}>{totalScore1600}</div>
                <div style={{ fontFamily: "'Instrument Serif', serif", fontSize: isMobile ? 22 : 30, color: 'rgba(255,255,255,0.35)', marginBottom: isMobile ? 6 : 10 }}>/ 1600</div>
              </div>
              <div style={{ display: 'flex', gap: 12, marginTop: 8, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)' }}>R&W: <strong style={{ color: '#fff' }}>{engScore800}</strong></span>
                <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.35)' }}>·</span>
                <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)' }}>Math: <strong style={{ color: '#fff' }}>{mathScore800}</strong></span>
              </div>
            </>
          ) : (
            <>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.4)' }}>Section score</div>
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 14, marginTop: 4, whiteSpace: 'nowrap' }}>
                <div style={{ fontFamily: "'Instrument Serif', serif", fontSize: isMobile ? 60 : 88, lineHeight: 0.95, letterSpacing: '-0.03em', color: headlineColor }}>{score800}</div>
                <div style={{ fontFamily: "'Instrument Serif', serif", fontSize: isMobile ? 22 : 30, color: 'rgba(255,255,255,0.35)', marginBottom: isMobile ? 6 : 10 }}>/ 800</div>
              </div>
              <div style={{ fontSize: 13, marginTop: 8, color: 'rgba(255,255,255,0.5)' }}>{correct} of {results.length} correct</div>
            </>
          )}
        </div>
        <div style={{ position: 'relative', display: 'flex', gap: isMobile ? 20 : 40, flexWrap: 'wrap' }}>
          {isMockCombined ? (
            [
              { label: 'Total Qs', value: String(results.length + engResults.length) },
              { label: 'Correct', value: String(correct + engResults.filter(r => r.isCorrect).length) },
              { label: 'Wrong', value: String(wrong + engResults.filter(r => r.isCorrect === false).length) },
              { label: 'Skipped', value: String(skipped + engResults.filter(r => r.isCorrect === null).length) },
            ].map(({ label, value }) => (
              <div key={label}>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.6)', marginBottom: 4 }}>{label}</div>
                <div style={{ fontFamily: "'Instrument Serif', serif", fontSize: isMobile ? 30 : 44, lineHeight: 1, color: '#fff' }}>{value}</div>
              </div>
            ))
          ) : (
            [{ label: 'Accuracy', value: accuracy + '%' }, { label: 'Correct', value: String(correct) }, { label: 'Wrong', value: String(wrong) }, { label: 'Skipped', value: String(skipped) }].map(({ label, value }) => (
              <div key={label}>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.6)', marginBottom: 4 }}>{label}</div>
                <div style={{ fontFamily: "'Instrument Serif', serif", fontSize: isMobile ? 30 : 44, lineHeight: 1, color: '#fff' }}>{value}</div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Practice tip banner */}
      {isPractice && (
        <div style={{ background: 'rgba(37,99,168,0.06)', border: '1px solid rgba(37,99,168,0.2)', borderRadius: 12, padding: '12px 18px', marginBottom: 22, fontSize: 13.5, color: '#1D4ED8', lineHeight: 1.5 }}>
          <strong>AI Guidance available:</strong> Expand any question below and click <em>AI Guidance</em> to get a personalised review. You can also ask the tutor any question.
        </div>
      )}

      {/* Performance narrative */}
      {(isMockExam || isPractice) && (() => {
        if (narrativeError || (pollCountRef.current >= 10 && narrativeData?.status === 'pending')) {
          return (
            <div style={{ background: '#FDF2F0', border: '1px solid rgba(192,57,43,0.2)', borderRadius: 16, padding: '20px 26px', marginBottom: 24, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
              <span style={{ fontSize: 13.5, color: '#8B1A10' }}>Analysis unavailable for this attempt.</span>
              <button onClick={() => retryMutation.mutate()} disabled={retryMutation.isPending} style={{ padding: '7px 16px', borderRadius: 9999, fontSize: 13, fontWeight: 600, fontFamily: 'inherit', cursor: retryMutation.isPending ? 'default' : 'pointer', border: '1px solid rgba(192,57,43,0.4)', background: 'transparent', color: '#8B1A10', opacity: retryMutation.isPending ? 0.5 : 1 }}>
                {retryMutation.isPending ? 'Retrying…' : 'Retry Analysis'}
              </button>
            </div>
          );
        }
        if (!narrativeData || narrativeData.status === 'pending') {
          return (
            <div style={{ background: '#F5F3EF', border: '1px dashed #C8C4BC', borderRadius: 16, padding: '26px 30px', marginBottom: 24, display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{ width: 18, height: 18, borderRadius: 9999, border: '2px solid #E2562B', borderTopColor: 'transparent', animation: 'spin 0.9s linear infinite', flexShrink: 0 }} />
              <div>
                <div style={{ fontSize: 14, fontWeight: 600, color: '#0B0B0E', marginBottom: 3 }}>Generating your analysis…</div>
                <div style={{ fontSize: 12.5, color: 'rgba(11,11,14,0.45)' }}>This usually takes under 15 seconds.</div>
              </div>
            </div>
          );
        }
        if (narrativeData.status === 'failed') {
          return (
            <div style={{ background: '#FDF2F0', border: '1px solid rgba(192,57,43,0.2)', borderRadius: 16, padding: '20px 26px', marginBottom: 24, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
              <span style={{ fontSize: 13.5, color: '#8B1A10' }}>Analysis unavailable for this attempt.</span>
              <button onClick={() => retryMutation.mutate()} disabled={retryMutation.isPending} style={{ padding: '7px 16px', borderRadius: 9999, fontSize: 13, fontWeight: 600, fontFamily: 'inherit', cursor: retryMutation.isPending ? 'default' : 'pointer', border: '1px solid rgba(192,57,43,0.4)', background: 'transparent', color: '#8B1A10', opacity: retryMutation.isPending ? 0.5 : 1 }}>
                {retryMutation.isPending ? 'Retrying…' : 'Retry Analysis'}
              </button>
            </div>
          );
        }
        const nc = narrativeData.content as NarrativeContent;
        if (!nc) return null;
        return (
          <div style={{ background: '#fff', border: '1px solid #E7E4DE', borderRadius: 18, padding: '28px 32px', marginBottom: 24, boxShadow: '0 2px 12px rgba(11,11,14,0.06)' }}>
            <div style={{ display: 'flex', alignItems: isMobile ? 'flex-start' : 'flex-start', flexDirection: isMobile ? 'column' : 'row', justifyContent: 'space-between', gap: 16, marginBottom: 18 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#E2562B', marginBottom: 6 }}>Pattern diagnosis</div>
                <p style={{ fontSize: isMobile ? 14 : 15.5, lineHeight: 1.65, color: '#0B0B0E', margin: 0 }}>{nc.narrative}</p>
              </div>
              {nc.scoreRange && (
                <div style={{ flexShrink: 0, textAlign: 'center', background: '#0B0B0E', borderRadius: 14, padding: isMobile ? '10px 16px' : '14px 22px', alignSelf: isMobile ? 'flex-start' : 'flex-start' }}>
                  <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.45)', marginBottom: 4 }}>Est. range</div>
                  <div style={{ fontFamily: "'Instrument Serif', serif", fontSize: 24, color: '#fff', lineHeight: 1 }}>{nc.scoreRange}</div>
                </div>
              )}
            </div>
            {nc.subSkillBreakdown && nc.subSkillBreakdown.length > 0 && (
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(11,11,14,0.4)', marginBottom: 10 }}>SubSkill breakdown</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                  {nc.subSkillBreakdown.map((s) => {
                    const pct = s.total > 0 ? Math.round((s.wrong / s.total) * 100) : 0;
                    const barColor = s.flag ? '#C0392B' : pct > 40 ? '#B8893E' : '#2E7D5A';
                    return (
                      <div key={s.subSkill} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <div style={{ width: 8, height: 8, borderRadius: 9999, background: barColor, flexShrink: 0 }} />
                        <span style={{ fontSize: 13, fontWeight: s.flag ? 700 : 500, color: s.flag ? '#0B0B0E' : 'rgba(11,11,14,0.7)', minWidth: isMobile ? 110 : 170, flex: isMobile ? '0 0 auto' : undefined }}>
                          {s.subSkill.replace(/_/g, ' ')}
                          {s.flag && <span style={{ marginLeft: 6, fontSize: 10, fontWeight: 700, color: '#C0392B', letterSpacing: '0.06em', textTransform: 'uppercase' }}>pattern</span>}
                        </span>
                        <div style={{ flex: 1, height: 6, background: '#F0EDE7', borderRadius: 9999, overflow: 'hidden' }}>
                          <div style={{ height: 6, width: `${pct}%`, background: barColor, borderRadius: 9999 }} />
                        </div>
                        <span style={{ fontSize: 12, color: 'rgba(11,11,14,0.5)', fontFamily: "'JetBrains Mono', monospace", width: 56, textAlign: 'right' }}>{s.wrong}/{s.total}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        );
      })()}

      {/* Topic performance */}
      <h3 style={{ fontSize: 16, margin: '6px 0 14px' }}>Performance by topic</h3>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12, marginBottom: 30 }}>
        {Object.entries(topics).map(([t, v], i) => {
          const pct = Math.round((v.ok / v.n) * 100);
          return (
            <div key={i} style={{ ...CARD, padding: '16px 18px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 9 }}>
                <span style={{ fontSize: 14, fontWeight: 600 }}>{t}</span>
                <span style={{ fontSize: 12.5, color: 'rgba(11,11,14,0.5)', fontFamily: "'JetBrains Mono', monospace" }}>{v.ok}/{v.n}</span>
              </div>
              <div style={{ height: 6, background: '#F0EDE7', borderRadius: 9999, overflow: 'hidden' }}>
                <div style={{ height: 6, width: pct + '%', background: pct >= 67 ? '#2E7D5A' : pct >= 34 ? '#B8893E' : '#C0392B', borderRadius: 9999 }} />
              </div>
            </div>
          );
        })}
      </div>

      {/* Question review */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '6px 0 14px' }}>
        <h3 style={{ fontSize: 16, margin: 0 }}>Question review</h3>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5, fontWeight: 700, color: '#B8893E', background: 'rgba(184,137,62,0.1)', border: '1px solid rgba(184,137,62,0.3)', borderRadius: 9999, padding: '5px 12px' }}>
          <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="9 18 15 12 9 6"/>
          </svg>
          {isPractice ? 'Click a question to expand & get AI guidance' : 'Click a question to see the explanation'}
        </span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {/* English section header (combined mock view) */}
        {isMockCombined && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0 4px' }}>
            <span style={{ width: 10, height: 10, borderRadius: 9999, background: '#2E7D5A', flexShrink: 0 }} />
            <span style={{ fontSize: 13, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'rgba(11,11,14,0.5)' }}>Section 1 · Reading & Writing</span>
            <span style={{ fontSize: 12, color: 'rgba(11,11,14,0.35)', fontFamily: "'JetBrains Mono', monospace" }}>({engResults.filter(r => r.isCorrect).length}/{engResults.length} correct · {engScore800}/800)</span>
          </div>
        )}
        {isMockCombined && engResults.map((r, i) => {
          const open = reviewOpen[i];
          const ok = r.isCorrect === true;
          const opts = [
            { key: 'a', text: r.optionA },
            { key: 'b', text: r.optionB },
            { key: 'c', text: r.optionC },
            { key: 'd', text: r.optionD },
          ];
          const qId = r.id;
          const aiOpen = !!aiPanelOpen[qId];
          const aiResult = aiResults[qId];
          const aiPendingQ = aiPending[qId] ?? { confidence: null, reasoning: '' };
          const isAiLoading = !!aiLoading[qId];

          return (
            <div key={r.id} style={{ ...CARD, overflow: 'hidden' }}>
              <button
                onClick={() => toggleReview(i)}
                style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 14, padding: '14px 18px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit' }}
              >
                <span style={{ width: 26, height: 26, borderRadius: 9999, flexShrink: 0, background: ok ? 'rgba(46,125,90,0.12)' : r.isCorrect === false ? 'rgba(192,57,43,0.1)' : 'rgba(11,11,14,0.06)', color: ok ? '#2E7D5A' : r.isCorrect === false ? '#C0392B' : '#8C8880', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 700 }}>
                  {ok ? '✓' : r.isCorrect === false ? '✕' : '–'}
                </span>
                <span style={{ fontSize: 13, fontWeight: 700, color: 'rgba(11,11,14,0.4)', width: 26 }}>{String(i + 1).padStart(2, '0')}</span>
                <span style={{ fontSize: 14.5, fontWeight: 600, flex: 1 }}>Question {i + 1}</span>
                <span style={{ color: open ? '#E2562B' : 'rgba(184,137,62,0.75)', fontSize: 16, transform: open ? 'rotate(90deg)' : 'none', transition: 'transform 0.2s, color 0.2s', display: 'inline-block', flexShrink: 0 }}>▸</span>
              </button>

              {open && (
                <div style={{ padding: isMobile ? '0 14px 18px 14px' : '0 18px 20px 64px' }}>
                  <p style={{ fontSize: 14.5, fontWeight: 500, lineHeight: 1.5, margin: '0 0 14px' }}>{r.questionText}</p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 7, marginBottom: 14 }}>
                    {opts.map(({ key, text }) => {
                      const isCorrect = r.correctAnswer === key;
                      const isYour = r.selectedAnswer === key;
                      const bg = isCorrect ? 'rgba(46,125,90,0.08)' : isYour ? 'rgba(192,57,43,0.06)' : '#FAF9F6';
                      const bd = isCorrect ? '1px solid rgba(46,125,90,0.4)' : isYour ? '1px solid rgba(192,57,43,0.3)' : '1px solid #EAE7E1';
                      return (
                        <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: 10, background: bg, border: bd }}>
                          <span style={{ fontSize: 13, fontWeight: 700, color: '#8C8880', width: 16 }}>{key.toUpperCase()}</span>
                          <span style={{ fontSize: 14, flex: 1 }}>{text}</span>
                          {isCorrect && <span style={{ fontSize: 11, fontWeight: 700, color: '#2E7D5A' }}>CORRECT</span>}
                          {isYour && !isCorrect && <span style={{ fontSize: 11, fontWeight: 700, color: '#C0392B' }}>YOUR ANSWER</span>}
                        </div>
                      );
                    })}
                  </div>
                  {r.explanation && (
                    <div style={{ background: '#F2F0EC', borderRadius: 10, padding: '12px 14px', fontSize: 13.5, lineHeight: 1.55, color: 'rgba(11,11,14,0.7)', marginBottom: 14 }}>
                      <strong style={{ color: '#0B0B0E' }}>Why: </strong>{r.explanation}
                    </div>
                  )}

                  {/* AI Guidance + Ask a question buttons (practice and mock exams) */}
                  {(isPractice || isMockExam) && (
                    <div style={{ display: 'flex', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
                      <button
                        onClick={() => setAiPanelOpen((o) => ({ ...o, [qId]: !o[qId] }))}
                        style={{ display: 'flex', alignItems: 'center', gap: 6, height: 36, padding: '0 14px', border: aiOpen ? '1px solid #E2562B' : '1px solid #C8C4BC', background: aiOpen ? 'rgba(226,86,43,0.06)' : '#fff', color: aiOpen ? '#E2562B' : '#0B0B0E', borderRadius: 9999, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}
                      >
                        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                          <circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/>
                        </svg>
                        AI Guidance
                      </button>
                      <button
                        onClick={() => setChatQuestionId(chatQuestionId === qId ? null : qId)}
                        style={{ display: 'flex', alignItems: 'center', gap: 6, height: 36, padding: '0 14px', border: chatQuestionId === qId ? '1px solid #0D7377' : '1px solid #C8C4BC', background: chatQuestionId === qId ? 'rgba(13,115,119,0.07)' : '#fff', color: chatQuestionId === qId ? '#0D7377' : '#0B0B0E', borderRadius: 9999, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}
                      >
                        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                        </svg>
                        Ask a question
                      </button>
                    </div>
                  )}

                  {/* AI Guidance inline panel */}
                  {(isPractice || isMockExam) && aiOpen && (
                    <div style={{ marginTop: 14, padding: '18px 20px', borderRadius: 14, background: '#F8F6F2', border: '1px solid #E7E4DE' }}>
                      {aiResult ? (
                        <AiFeedbackPanel
                          feedbacks={aiResult.feedbacks}
                          vocabTrackingId={aiResult.vocabTrackingId}
                          questionId={qId}
                          vocabPick={vocabPick}
                          vocabSubmitted={vocabSubmitted}
                          setVocabPick={setVocabPick}
                          setVocabSubmitted={setVocabSubmitted}
                        />
                      ) : (
                        <>
                          <p style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(11,11,14,0.4)', margin: '0 0 12px' }}>
                            How did you approach this?
                          </p>
                          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
                            {CONFIDENCE_CHIPS.map((chip) => {
                              const active = aiPendingQ.confidence === chip.value;
                              return (
                                <button
                                  key={chip.value}
                                  onClick={() => setAiPending((p) => ({ ...p, [qId]: { ...aiPendingQ, confidence: chip.value } }))}
                                  style={{ padding: '8px 16px', borderRadius: 9999, fontSize: 13, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer', border: active ? '1.5px solid #0B0B0E' : '1px solid #C8C4BC', background: active ? '#0B0B0E' : '#fff', color: active ? '#fff' : '#8C8880', transition: 'all 0.15s' }}
                                >
                                  {chip.label}
                                </button>
                              );
                            })}
                          </div>
                          <input
                            type="text"
                            value={aiPendingQ.reasoning}
                            onChange={(e) => setAiPending((p) => ({ ...p, [qId]: { ...aiPendingQ, reasoning: e.target.value } }))}
                            placeholder="Anything else? (optional)"
                            style={{ width: '100%', height: 40, padding: '0 14px', border: '1px solid #E7E4DE', borderRadius: 10, fontSize: 13.5, fontFamily: 'inherit', background: '#fff', color: '#0B0B0E', outline: 'none', boxSizing: 'border-box', marginBottom: 12 }}
                          />
                          <button
                            onClick={() => handleAiGuidance(qId)}
                            disabled={!aiPendingQ.confidence || isAiLoading}
                            style={{ height: 38, padding: '0 20px', borderRadius: 9999, border: 'none', background: aiPendingQ.confidence && !isAiLoading ? '#E2562B' : '#C8C4BC', color: '#fff', fontSize: 13, fontWeight: 600, cursor: aiPendingQ.confidence && !isAiLoading ? 'pointer' : 'default', fontFamily: 'inherit' }}
                          >
                            {isAiLoading ? 'Analysing…' : 'Get AI Guidance →'}
                          </button>
                        </>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}

        {/* Math section header (combined mock view) */}
        {isMockCombined && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '18px 0 4px' }}>
            <span style={{ width: 10, height: 10, borderRadius: 9999, background: '#2563A8', flexShrink: 0 }} />
            <span style={{ fontSize: 13, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'rgba(11,11,14,0.5)' }}>Section 2 · Math</span>
            <span style={{ fontSize: 12, color: 'rgba(11,11,14,0.35)', fontFamily: "'JetBrains Mono', monospace" }}>({correct}/{results.length} correct · {mathScore800}/800)</span>
          </div>
        )}

        {results.map((r, i) => {
          const listIdx = isMockCombined ? engResults.length + i : i;
          const open = reviewOpen[listIdx];
          const ok = r.isCorrect === true;
          const opts = [
            { key: 'a', text: r.optionA },
            { key: 'b', text: r.optionB },
            { key: 'c', text: r.optionC },
            { key: 'd', text: r.optionD },
          ];
          const qId = r.id;
          const aiOpen = !!aiPanelOpen[qId];
          const aiResult = aiResults[qId];
          const aiPendingQ = aiPending[qId] ?? { confidence: null, reasoning: '' };
          const isAiLoading = !!aiLoading[qId];

          return (
            <div key={r.id} style={{ ...CARD, overflow: 'hidden' }}>
              <button
                onClick={() => toggleReview(listIdx)}
                style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 14, padding: '14px 18px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit' }}
              >
                <span style={{ width: 26, height: 26, borderRadius: 9999, flexShrink: 0, background: ok ? 'rgba(46,125,90,0.12)' : r.isCorrect === false ? 'rgba(192,57,43,0.1)' : 'rgba(11,11,14,0.06)', color: ok ? '#2E7D5A' : r.isCorrect === false ? '#C0392B' : '#8C8880', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 700 }}>
                  {ok ? '✓' : r.isCorrect === false ? '✕' : '–'}
                </span>
                <span style={{ fontSize: 13, fontWeight: 700, color: 'rgba(11,11,14,0.4)', width: 26 }}>{String(i + 1).padStart(2, '0')}</span>
                <span style={{ fontSize: 14.5, fontWeight: 600, flex: 1 }}>Question {i + 1}</span>
                <span style={{ color: open ? '#E2562B' : 'rgba(184,137,62,0.75)', fontSize: 16, transform: open ? 'rotate(90deg)' : 'none', transition: 'transform 0.2s, color 0.2s', display: 'inline-block', flexShrink: 0 }}>▸</span>
              </button>

              {open && (
                <div style={{ padding: isMobile ? '0 14px 18px 14px' : '0 18px 20px 64px' }}>
                  <p style={{ fontSize: 14.5, fontWeight: 500, lineHeight: 1.5, margin: '0 0 14px' }}>{r.questionText}</p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 7, marginBottom: 14 }}>
                    {opts.map(({ key, text }) => {
                      const isCorrect = r.correctAnswer === key;
                      const isYour = r.selectedAnswer === key;
                      const bg = isCorrect ? 'rgba(46,125,90,0.08)' : isYour ? 'rgba(192,57,43,0.06)' : '#FAF9F6';
                      const bd = isCorrect ? '1px solid rgba(46,125,90,0.4)' : isYour ? '1px solid rgba(192,57,43,0.3)' : '1px solid #EAE7E1';
                      return (
                        <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: 10, background: bg, border: bd }}>
                          <span style={{ fontSize: 13, fontWeight: 700, color: '#8C8880', width: 16 }}>{key.toUpperCase()}</span>
                          <span style={{ fontSize: 14, flex: 1 }}>{text}</span>
                          {isCorrect && <span style={{ fontSize: 11, fontWeight: 700, color: '#2E7D5A' }}>CORRECT</span>}
                          {isYour && !isCorrect && <span style={{ fontSize: 11, fontWeight: 700, color: '#C0392B' }}>YOUR ANSWER</span>}
                        </div>
                      );
                    })}
                  </div>
                  {r.explanation && (
                    <div style={{ background: '#F2F0EC', borderRadius: 10, padding: '12px 14px', fontSize: 13.5, lineHeight: 1.55, color: 'rgba(11,11,14,0.7)', marginBottom: 14 }}>
                      <strong style={{ color: '#0B0B0E' }}>Why: </strong>{r.explanation}
                    </div>
                  )}

                  {/* AI Guidance + Ask a question buttons (practice and mock exams) */}
                  {(isPractice || isMockExam) && (
                    <div style={{ display: 'flex', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
                      <button
                        onClick={() => setAiPanelOpen((o) => ({ ...o, [qId]: !o[qId] }))}
                        style={{ display: 'flex', alignItems: 'center', gap: 6, height: 36, padding: '0 14px', border: aiOpen ? '1px solid #E2562B' : '1px solid #C8C4BC', background: aiOpen ? 'rgba(226,86,43,0.06)' : '#fff', color: aiOpen ? '#E2562B' : '#0B0B0E', borderRadius: 9999, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}
                      >
                        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                          <circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/>
                        </svg>
                        AI Guidance
                      </button>
                      <button
                        onClick={() => setChatQuestionId(chatQuestionId === qId ? null : qId)}
                        style={{ display: 'flex', alignItems: 'center', gap: 6, height: 36, padding: '0 14px', border: chatQuestionId === qId ? '1px solid #0D7377' : '1px solid #C8C4BC', background: chatQuestionId === qId ? 'rgba(13,115,119,0.07)' : '#fff', color: chatQuestionId === qId ? '#0D7377' : '#0B0B0E', borderRadius: 9999, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}
                      >
                        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                        </svg>
                        Ask a question
                      </button>
                    </div>
                  )}

                  {/* AI Guidance inline panel */}
                  {(isPractice || isMockExam) && aiOpen && (
                    <div style={{ marginTop: 14, padding: '18px 20px', borderRadius: 14, background: '#F8F6F2', border: '1px solid #E7E4DE' }}>
                      {aiResult ? (
                        <AiFeedbackPanel
                          feedbacks={aiResult.feedbacks}
                          vocabTrackingId={aiResult.vocabTrackingId}
                          questionId={qId}
                          vocabPick={vocabPick}
                          vocabSubmitted={vocabSubmitted}
                          setVocabPick={setVocabPick}
                          setVocabSubmitted={setVocabSubmitted}
                        />
                      ) : (
                        <>
                          <p style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(11,11,14,0.4)', margin: '0 0 12px' }}>
                            How did you approach this?
                          </p>
                          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
                            {CONFIDENCE_CHIPS.map((chip) => {
                              const active = aiPendingQ.confidence === chip.value;
                              return (
                                <button
                                  key={chip.value}
                                  onClick={() => setAiPending((p) => ({ ...p, [qId]: { ...aiPendingQ, confidence: chip.value } }))}
                                  style={{ padding: '8px 16px', borderRadius: 9999, fontSize: 13, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer', border: active ? '1.5px solid #0B0B0E' : '1px solid #C8C4BC', background: active ? '#0B0B0E' : '#fff', color: active ? '#fff' : '#8C8880', transition: 'all 0.15s' }}
                                >
                                  {chip.label}
                                </button>
                              );
                            })}
                          </div>
                          <input
                            type="text"
                            value={aiPendingQ.reasoning}
                            onChange={(e) => setAiPending((p) => ({ ...p, [qId]: { ...aiPendingQ, reasoning: e.target.value } }))}
                            placeholder="Anything else? (optional)"
                            style={{ width: '100%', height: 40, padding: '0 14px', border: '1px solid #E7E4DE', borderRadius: 10, fontSize: 13.5, fontFamily: 'inherit', background: '#fff', color: '#0B0B0E', outline: 'none', boxSizing: 'border-box', marginBottom: 12 }}
                          />
                          <button
                            onClick={() => handleAiGuidance(qId)}
                            disabled={!aiPendingQ.confidence || isAiLoading}
                            style={{ height: 38, padding: '0 20px', borderRadius: 9999, border: 'none', background: aiPendingQ.confidence && !isAiLoading ? '#E2562B' : '#C8C4BC', color: '#fff', fontSize: 13, fontWeight: 600, cursor: aiPendingQ.confidence && !isAiLoading ? 'pointer' : 'default', fontFamily: 'inherit' }}
                          >
                            {isAiLoading ? 'Analysing…' : 'Get AI Guidance →'}
                          </button>
                        </>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: 12, marginTop: 30, flexDirection: isMobile ? 'column' : 'row' }}>
        <button onClick={() => navigate('/student/results')} style={{ height: 48, padding: '0 26px', background: '#fff', color: '#0B0B0E', border: '1px solid #C8C4BC', borderRadius: 9999, fontSize: 15, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', width: isMobile ? '100%' : undefined }}>View all results</button>
        <button onClick={() => navigate('/student/dashboard')} style={{ height: 48, padding: '0 26px', background: '#E2562B', color: '#fff', border: 'none', borderRadius: 9999, fontSize: 15, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', boxShadow: '0 2px 10px rgba(226,86,43,0.26)', width: isMobile ? '100%' : undefined }}>Back to dashboard</button>
      </div>

      {/* Chat panel — fixed bottom, practice and mock exams */}
      {(isPractice || isMockExam) && chatQuestionId && (
        <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, height: 380, background: '#fff', borderTop: '1px solid #E7E4DE', boxShadow: '0 -8px 32px rgba(11,11,14,0.12)', display: 'flex', flexDirection: 'column', zIndex: 44, animation: 'chatSlideUp 0.2s ease-out' }}>
          <div style={{ height: 48, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 20px', borderBottom: '1px solid #F0ECE4' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#0D7377', flexShrink: 0 }} />
              <span style={{ fontSize: 13.5, fontWeight: 700 }}>SAT Tutor</span>
              <span style={{ fontSize: 11, color: 'rgba(11,11,14,0.4)', fontWeight: 500 }}>
                · Q{(results.findIndex((r) => r.id === chatQuestionId) + 1) || ''}
              </span>
            </div>
            <button onClick={() => setChatQuestionId(null)} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#8C8880', fontSize: 22, lineHeight: 1, padding: 0, fontFamily: 'inherit' }}>×</button>
          </div>

          <div ref={chatMessagesRef} className="scrollarea" style={{ flex: 1, overflowY: 'auto', padding: '14px 20px', display: 'flex', flexDirection: 'column', gap: 10 }}>
            {chatMessages.length === 0 && (
              <p style={{ color: 'rgba(11,11,14,0.4)', fontSize: 13.5, textAlign: 'center', margin: '20px 0 0' }}>
                Ask anything about this question — grammar rules, what the passage means, strategy.
              </p>
            )}
            {chatMessages.map((msg, mi) => (
              <div key={mi} style={{ display: 'flex', justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start' }}>
                <div style={{ maxWidth: '82%', padding: '9px 14px', borderRadius: msg.role === 'user' ? '14px 14px 4px 14px' : '14px 14px 14px 4px', background: msg.role === 'user' ? '#0B0B0E' : '#F2F0EC', color: msg.role === 'user' ? '#fff' : '#0B0B0E', fontSize: 13.5, lineHeight: 1.55 }}>
                  {msg.content}
                </div>
              </div>
            ))}
            {chatLoading && (
              <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
                <div style={{ padding: '10px 16px', borderRadius: '14px 14px 14px 4px', background: '#F2F0EC', display: 'flex', gap: 5, alignItems: 'center' }}>
                  {[0, 1, 2].map((di) => (
                    <div key={di} style={{ width: 7, height: 7, borderRadius: '50%', background: 'rgba(11,11,14,0.45)', animation: `chatDotBounce 1.2s ease-in-out ${di * 0.2}s infinite` }} />
                  ))}
                </div>
              </div>
            )}
            {chatError && <p style={{ fontSize: 12.5, color: '#C0392B', textAlign: 'center', margin: 0 }}>{chatError}</p>}
          </div>

          <div style={{ height: 60, flexShrink: 0, borderTop: '1px solid #F0ECE4', display: 'flex', alignItems: 'center', gap: 10, padding: '0 16px' }}>
            <input
              type="text"
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendChat(); } }}
              placeholder="Ask about this question…"
              disabled={chatLoading}
              style={{ flex: 1, height: 38, padding: '0 14px', border: '1px solid #E7E4DE', borderRadius: 9999, fontSize: 13.5, fontFamily: 'inherit', background: '#FAF9F6', color: '#0B0B0E', outline: 'none' }}
            />
            <button
              onClick={handleSendChat}
              disabled={chatLoading || !chatInput.trim()}
              style={{ height: 38, padding: '0 18px', borderRadius: 9999, border: 'none', background: chatInput.trim() && !chatLoading ? '#0B0B0E' : '#C8C4BC', color: '#fff', fontSize: 13, fontWeight: 600, cursor: chatInput.trim() && !chatLoading ? 'pointer' : 'default', fontFamily: 'inherit', flexShrink: 0 }}
            >Send</button>
          </div>
        </div>
      )}
    </div>
  );
}
