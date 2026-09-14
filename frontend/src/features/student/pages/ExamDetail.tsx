
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQueries, useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useMobile } from '@/shared/hooks/useMobile';
import {
  getExamResults, getMockNarrative, retryNarrative,
  confirmAnswer, sendChatMessage, reviewVocab,
  type NarrativeContent, type ConfirmFeedbacks,
  type ReasoningClassification, type CommandOfEvidenceContent,
  type TransitionsCoachContent, type VocabDrillContent,
  type QuestionWithAnswer,
} from '@/features/student/api/student.api';
import { AiFeedbackPanel } from '@/features/student/components/AiFeedbackPanel';
import {
  ESTIMATED_LABEL, SECTION_MAX, TOTAL_MAX,
  formatExamScore, formatScore, scoreColor,
} from '@/shared/lib/score';


const CONFIDENCE_CHIPS: { value: 'sure' | 'eliminated' | 'guessed'; label: string }[] = [
  { value: 'sure',       label: 'I was sure' },
  { value: 'eliminated', label: 'Eliminated the wrong ones' },
  { value: 'guessed',    label: 'Guessed' },
];

// ── Helpers ──────────────────────────────────────────────────────────────────

const CARD: React.CSSProperties = { background: '#fff', border: '1px solid #E7E4DE', borderRadius: 16, boxShadow: '0 1px 3px rgba(11,11,14,0.05)' };


// ── Main component ────────────────────────────────────────────────────────────

export default function ExamDetail() {
  const { examId } = useParams<{ examId: string }>();
  const navigate = useNavigate();
  const isMobile = useMobile();
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
  /** questionId -> the exam it belongs to; spans every module of a combined mock. */
  const examIdByQuestionIdRef = useRef(new Map<string, string>());

  const { data, isLoading, error } = useQuery({
    queryKey: ['student', 'exam-results', examId],
    queryFn: () => getExamResults(examId!),
    enabled: !!examId,
  });

  // A mock is reported as a whole, so the other modules are fetched alongside
  // this one. Which modules exist comes from the server rather than from a query
  // parameter the player had to carry across the section transition — that is
  // what used to go missing and leave a four-module mock showing a /800 report.
  const mock = data?.mock ?? null;

  // Completed modules only. The results endpoint rejects an exam that is still
  // in progress, so asking for every module meant a student reviewing one
  // finished section of a mock they were still sitting fired 400s for the
  // sections they had not reached yet.
  const siblingIds = (mock?.modules ?? [])
    .filter((module) => module.status === 'completed' && module.examId !== examId)
    .map((module) => module.examId);

  const siblingQueries = useQueries({
    queries: siblingIds.map((id) => ({
      queryKey: ['student', 'exam-results', id],
      queryFn: () => getExamResults(id),
    })),
  });

  // Combine only when the whole mock is finished and every one of its modules
  // has arrived — a half-loaded mock would otherwise report a total built from
  // some of its sections.
  const siblingResults = siblingQueries.map((query) => query.data);
  const everyModuleFinished = !!mock && mock.modules.every((m) => m.status === 'completed');
  const isMockCombined =
    !!mock &&
    mock.status === 'completed' &&
    everyModuleFinished &&
    siblingResults.every((result) => !!result);
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
    meta: { handlesError: true },
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

  // Route AI calls to the exam the question actually belongs to: in a combined
  // mock report the list spans up to four of them.
  const getExamIdForQuestion = (questionId: string): string =>
    examIdByQuestionIdRef.current.get(questionId) ?? examId!;

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
  }, [chatInput, chatLoading, chatSessionId, examId, chatQuestionId]);

  if (isLoading) {
    return <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 64 }}><div style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 24, color: 'rgba(11,11,14,0.58)' }}>Loading…</div></div>;
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

  // Every module's questions, in sitting order, keyed by the exam they came from
  // so AI guidance can still be routed to the right one.
  const resultsByExamId = new Map(
    [data, ...siblingResults].flatMap((entry) => (entry ? [[entry.exam.id, entry.results] as const] : [])),
  );
  const modulesOf = (subject: 'english' | 'math') =>
    (mock?.modules ?? [])
      .filter((module) => module.subject === subject)
      .flatMap((module) => resultsByExamId.get(module.examId) ?? []);

  // In the combined view each block shows a whole section — both its modules.
  // Outside it there is one exam, and it belongs in the second block.
  const englishReview = isMockCombined ? modulesOf('english') : [];
  const mathReview = isMockCombined ? modulesOf('math') : results;

  examIdByQuestionIdRef.current = new Map(
    [...resultsByExamId].flatMap(([id, rows]) => rows.map((row) => [row.id, id] as const)),
  );

  // Scores come from the server. A mock's sections are scaled against the
  // adaptive path the student earned, which the browser cannot know, and a
  // single exam carries its own scaled score or none at all.
  const rwScore = mock?.rwScore ?? null;
  const mathSectionScore = mock?.mathScore ?? null;
  const totalScore1600 = mock?.totalScore ?? null;

  const accuracy = exam.score !== null ? Math.round((exam.score / exam.totalQuestions) * 100) : 0;
  const correct = mathReview.filter((r) => r.isCorrect).length;
  const wrong = mathReview.filter((r) => r.isCorrect === false).length;
  const skipped = mathReview.filter((r) => r.isCorrect === null).length;
  const headlineColor = scoreColor(exam.scaledScore, SECTION_MAX);

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
      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#C4471F', marginBottom: 6 }}>
        {isMockCombined ? 'Full mock SAT · score report' : `Score report · ${set?.subject === 'math' ? 'Math' : 'Reading & Writing'}`}
        {isPractice && <span style={{ marginLeft: 10, color: '#2563A8' }}>· Practice</span>}
      </div>
      <h1 style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: isMobile ? 28 : 40, margin: '0 0 20px', letterSpacing: '-0.02em' }}>Performance Report</h1>

      {/* Hero */}
      <div className="pop" style={{ background: '#0B0B0E', borderRadius: 18, padding: isMobile ? '22px 20px' : '32px 36px', display: 'flex', alignItems: isMobile ? 'flex-start' : 'center', flexDirection: isMobile ? 'column' : 'row', justifyContent: 'space-between', gap: isMobile ? 20 : 36, marginBottom: 20, position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', left: -60, bottom: -80, width: 240, height: 240, borderRadius: 9999, background: 'radial-gradient(circle, rgba(226,86,43,0.16), transparent 70%)' }} />
        <div style={{ position: 'relative' }}>
          {isMockCombined ? (
            <>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.5)' }}>{ESTIMATED_LABEL} total score</div>
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 14, marginTop: 4, whiteSpace: 'nowrap' }}>
                <div style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: isMobile ? 60 : 88, lineHeight: 0.95, letterSpacing: '-0.03em', color: scoreColor(totalScore1600, TOTAL_MAX) }}>{formatScore(totalScore1600)}</div>
                <div style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: isMobile ? 22 : 30, color: 'rgba(255,255,255,0.5)', marginBottom: isMobile ? 6 : 10 }}>/ 1600</div>
              </div>
              <div style={{ display: 'flex', gap: 12, marginTop: 8, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)' }}>R&W: <strong style={{ color: '#fff' }}>{formatScore(rwScore)}</strong></span>
                <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)' }}>·</span>
                <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)' }}>Math: <strong style={{ color: '#fff' }}>{formatScore(mathSectionScore)}</strong></span>
              </div>
            </>
          ) : (
            <>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.5)' }}>{ESTIMATED_LABEL} section score</div>
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 14, marginTop: 4, whiteSpace: 'nowrap' }}>
                <div style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: isMobile ? 60 : 88, lineHeight: 0.95, letterSpacing: '-0.03em', color: headlineColor }}>{formatExamScore(exam.scaledScore, exam.score, exam.totalQuestions)}</div>
                <div style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: isMobile ? 22 : 30, color: 'rgba(255,255,255,0.5)', marginBottom: isMobile ? 6 : 10 }}>{exam.scaledScore === null ? '' : '/ 800'}</div>
              </div>
              <div style={{ fontSize: 13, marginTop: 8, color: 'rgba(255,255,255,0.5)' }}>{correct} of {results.length} correct</div>
            </>
          )}
        </div>
        <div style={{ position: 'relative', display: 'flex', gap: isMobile ? 20 : 40, flexWrap: 'wrap' }}>
          {isMockCombined ? (
            [
              { label: 'Total Qs', value: String(mathReview.length + englishReview.length) },
              { label: 'Correct', value: String(correct + englishReview.filter((r) => r.isCorrect).length) },
              { label: 'Wrong', value: String(wrong + englishReview.filter((r) => r.isCorrect === false).length) },
              { label: 'Skipped', value: String(skipped + englishReview.filter((r) => r.isCorrect === null).length) },
            ].map(({ label, value }) => (
              <div key={label}>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.6)', marginBottom: 4 }}>{label}</div>
                <div style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: isMobile ? 30 : 44, lineHeight: 1, color: '#fff' }}>{value}</div>
              </div>
            ))
          ) : (
            [{ label: 'Accuracy', value: accuracy + '%' }, { label: 'Correct', value: String(correct) }, { label: 'Wrong', value: String(wrong) }, { label: 'Skipped', value: String(skipped) }].map(({ label, value }) => (
              <div key={label}>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.6)', marginBottom: 4 }}>{label}</div>
                <div style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: isMobile ? 30 : 44, lineHeight: 1, color: '#fff' }}>{value}</div>
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
                <div style={{ fontSize: 12.5, color: 'rgba(11,11,14,0.58)' }}>This usually takes under 15 seconds.</div>
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
                <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#C4471F', marginBottom: 6 }}>Pattern diagnosis</div>
                <p style={{ fontSize: isMobile ? 14 : 15.5, lineHeight: 1.65, color: '#0B0B0E', margin: 0 }}>{nc.narrative}</p>
              </div>
              {nc.scoreRange && (
                <div style={{ flexShrink: 0, textAlign: 'center', background: '#0B0B0E', borderRadius: 14, padding: isMobile ? '10px 16px' : '14px 22px', alignSelf: isMobile ? 'flex-start' : 'flex-start' }}>
                  <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.45)', marginBottom: 4 }}>Est. range</div>
                  <div style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 24, color: '#fff', lineHeight: 1 }}>{nc.scoreRange}</div>
                </div>
              )}
            </div>
            {nc.subSkillBreakdown && nc.subSkillBreakdown.length > 0 && (
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(11,11,14,0.58)', marginBottom: 10 }}>SubSkill breakdown</div>
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
                        <span style={{ fontSize: 12, color: 'rgba(11,11,14,0.64)', fontFamily: 'var(--font-mono)', width: 56, textAlign: 'right' }}>{s.wrong}/{s.total}</span>
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
                <span style={{ fontSize: 12.5, color: 'rgba(11,11,14,0.64)', fontFamily: 'var(--font-mono)' }}>{v.ok}/{v.n}</span>
              </div>
              <div style={{ height: 6, background: '#F0EDE7', borderRadius: 9999, overflow: 'hidden' }}>
                <div style={{ height: 6, width: pct + '%', background: pct >= 67 ? '#2E7D5A' : pct >= 34 ? '#B8893E' : '#C0392B', borderRadius: 9999 }} />
              </div>
            </div>
          );
        })}
      </div>

      {/* Question review */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '6px 0 14px', flexWrap: 'wrap', gap: 8 }}>
        <h3 style={{ fontSize: 16, margin: 0 }}>Question review</h3>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5, fontWeight: 700, color: '#B8893E', background: 'rgba(184,137,62,0.1)', border: '1px solid rgba(184,137,62,0.3)', borderRadius: 9999, padding: '5px 12px' }}>
          <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="9 18 15 12 9 6"/>
          </svg>
          {isPractice
            ? (isMobile ? 'Tap to expand · AI inside' : 'Click a question to expand & get AI guidance')
            : (isMobile ? 'Tap to expand' : 'Click a question to see the explanation')}
        </span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {/* English section header (combined mock view) */}
        {isMockCombined && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0 4px' }}>
            <span style={{ width: 10, height: 10, borderRadius: 9999, background: '#2E7D5A', flexShrink: 0 }} />
            <span style={{ fontSize: 13, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'rgba(11,11,14,0.64)' }}>Section 1 · Reading & Writing</span>
            <span style={{ fontSize: 12, color: 'rgba(11,11,14,0.58)', fontFamily: 'var(--font-mono)' }}>({englishReview.filter((r) => r.isCorrect).length}/{englishReview.length} correct · {formatScore(rwScore)}/800)</span>
          </div>
        )}
        {isMockCombined && englishReview.map((r, i) => {
          const open = reviewOpen[i];
          const ok = r.isCorrect === true;
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
                <span style={{ width: 26, height: 26, borderRadius: 9999, flexShrink: 0, background: ok ? 'rgba(46,125,90,0.12)' : r.isCorrect === false ? 'rgba(192,57,43,0.1)' : 'rgba(11,11,14,0.06)', color: ok ? '#2E7D5A' : r.isCorrect === false ? '#C0392B' : '#6F6B64', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 700 }}>
                  {ok ? '✓' : r.isCorrect === false ? '✕' : '–'}
                </span>
                <span style={{ fontSize: 13, fontWeight: 700, color: 'rgba(11,11,14,0.58)', width: 26 }}>{String(i + 1).padStart(2, '0')}</span>
                <span style={{ fontSize: 14.5, fontWeight: 600, flex: 1 }}>Question {i + 1}</span>
                <span style={{ color: open ? '#C4471F' : 'rgba(184,137,62,0.75)', fontSize: 16, transform: open ? 'rotate(90deg)' : 'none', transition: 'transform 0.2s, color 0.2s', display: 'inline-block', flexShrink: 0 }}>▸</span>
              </button>

              {open && (
                <div style={{ padding: isMobile ? '0 14px 18px 14px' : '0 18px 20px 64px' }}>
                  <p style={{ fontSize: 14.5, fontWeight: 500, lineHeight: 1.5, margin: '0 0 14px' }} dangerouslySetInnerHTML={{ __html: r.questionText }} />
                  <AnswerReview r={r} />
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
                        style={{ display: 'flex', alignItems: 'center', gap: 6, height: 36, padding: '0 14px', border: aiOpen ? '1px solid #E2562B' : '1px solid #C8C4BC', background: aiOpen ? 'rgba(226,86,43,0.06)' : '#fff', color: aiOpen ? '#C4471F' : '#0B0B0E', borderRadius: 9999, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}
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
                          <p style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(11,11,14,0.58)', margin: '0 0 12px' }}>
                            How did you approach this?
                          </p>
                          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
                            {CONFIDENCE_CHIPS.map((chip) => {
                              const active = aiPendingQ.confidence === chip.value;
                              return (
                                <button
                                  key={chip.value}
                                  onClick={() => setAiPending((p) => ({ ...p, [qId]: { ...aiPendingQ, confidence: chip.value } }))}
                                  style={{ padding: '8px 16px', borderRadius: 9999, fontSize: 13, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer', border: active ? '1.5px solid #0B0B0E' : '1px solid #C8C4BC', background: active ? '#0B0B0E' : '#fff', color: active ? '#fff' : '#6F6B64', transition: 'all 0.15s' }}
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
                            style={{ height: 38, padding: '0 20px', borderRadius: 9999, border: 'none', background: aiPendingQ.confidence && !isAiLoading ? '#C4471F' : '#C8C4BC', color: '#fff', fontSize: 13, fontWeight: 600, cursor: aiPendingQ.confidence && !isAiLoading ? 'pointer' : 'default', fontFamily: 'inherit' }}
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
            <span style={{ fontSize: 13, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'rgba(11,11,14,0.64)' }}>Section 2 · Math</span>
            <span style={{ fontSize: 12, color: 'rgba(11,11,14,0.58)', fontFamily: 'var(--font-mono)' }}>({correct}/{mathReview.length} correct · {formatScore(mathSectionScore)}/800)</span>
          </div>
        )}

        {mathReview.map((r, i) => {
          const listIdx = isMockCombined ? englishReview.length + i : i;
          const open = reviewOpen[listIdx];
          const ok = r.isCorrect === true;
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
                <span style={{ width: 26, height: 26, borderRadius: 9999, flexShrink: 0, background: ok ? 'rgba(46,125,90,0.12)' : r.isCorrect === false ? 'rgba(192,57,43,0.1)' : 'rgba(11,11,14,0.06)', color: ok ? '#2E7D5A' : r.isCorrect === false ? '#C0392B' : '#6F6B64', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 700 }}>
                  {ok ? '✓' : r.isCorrect === false ? '✕' : '–'}
                </span>
                <span style={{ fontSize: 13, fontWeight: 700, color: 'rgba(11,11,14,0.58)', width: 26 }}>{String(i + 1).padStart(2, '0')}</span>
                <span style={{ fontSize: 14.5, fontWeight: 600, flex: 1 }}>Question {i + 1}</span>
                <span style={{ color: open ? '#C4471F' : 'rgba(184,137,62,0.75)', fontSize: 16, transform: open ? 'rotate(90deg)' : 'none', transition: 'transform 0.2s, color 0.2s', display: 'inline-block', flexShrink: 0 }}>▸</span>
              </button>

              {open && (
                <div style={{ padding: isMobile ? '0 14px 18px 14px' : '0 18px 20px 64px' }}>
                  <p style={{ fontSize: 14.5, fontWeight: 500, lineHeight: 1.5, margin: '0 0 14px' }} dangerouslySetInnerHTML={{ __html: r.questionText }} />
                  <AnswerReview r={r} />
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
                        style={{ display: 'flex', alignItems: 'center', gap: 6, height: 36, padding: '0 14px', border: aiOpen ? '1px solid #E2562B' : '1px solid #C8C4BC', background: aiOpen ? 'rgba(226,86,43,0.06)' : '#fff', color: aiOpen ? '#C4471F' : '#0B0B0E', borderRadius: 9999, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}
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
                          <p style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(11,11,14,0.58)', margin: '0 0 12px' }}>
                            How did you approach this?
                          </p>
                          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
                            {CONFIDENCE_CHIPS.map((chip) => {
                              const active = aiPendingQ.confidence === chip.value;
                              return (
                                <button
                                  key={chip.value}
                                  onClick={() => setAiPending((p) => ({ ...p, [qId]: { ...aiPendingQ, confidence: chip.value } }))}
                                  style={{ padding: '8px 16px', borderRadius: 9999, fontSize: 13, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer', border: active ? '1.5px solid #0B0B0E' : '1px solid #C8C4BC', background: active ? '#0B0B0E' : '#fff', color: active ? '#fff' : '#6F6B64', transition: 'all 0.15s' }}
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
                            style={{ height: 38, padding: '0 20px', borderRadius: 9999, border: 'none', background: aiPendingQ.confidence && !isAiLoading ? '#C4471F' : '#C8C4BC', color: '#fff', fontSize: 13, fontWeight: 600, cursor: aiPendingQ.confidence && !isAiLoading ? 'pointer' : 'default', fontFamily: 'inherit' }}
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
        <button onClick={() => navigate('/student/dashboard')} style={{ height: 48, padding: '0 26px', background: '#C4471F', color: '#fff', border: 'none', borderRadius: 9999, fontSize: 15, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', boxShadow: '0 2px 10px rgba(226,86,43,0.26)', width: isMobile ? '100%' : undefined }}>Back to dashboard</button>
      </div>

      {/* Chat panel — fixed bottom, practice and mock exams */}
      {(isPractice || isMockExam) && chatQuestionId && (
        <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, height: isMobile ? '52vh' : 380, background: '#fff', borderTop: '1px solid #E7E4DE', boxShadow: '0 -8px 32px rgba(11,11,14,0.12)', display: 'flex', flexDirection: 'column', zIndex: 44, animation: 'chatSlideUp 0.2s ease-out' }}>
          <div style={{ height: 48, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 20px', borderBottom: '1px solid #F0ECE4' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#0D7377', flexShrink: 0 }} />
              <span style={{ fontSize: 13.5, fontWeight: 700 }}>SAT Tutor</span>
              <span style={{ fontSize: 11, color: 'rgba(11,11,14,0.58)', fontWeight: 500 }}>
                · Q{(results.findIndex((r) => r.id === chatQuestionId) + 1) || ''}
              </span>
            </div>
            <button onClick={() => setChatQuestionId(null)} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#6F6B64', fontSize: 22, lineHeight: 1, padding: 0, fontFamily: 'inherit' }}>×</button>
          </div>

          <div ref={chatMessagesRef} className="scrollarea" style={{ flex: 1, overflowY: 'auto', padding: '14px 20px', display: 'flex', flexDirection: 'column', gap: 10 }}>
            {chatMessages.length === 0 && (
              <p style={{ color: 'rgba(11,11,14,0.58)', fontSize: 13.5, textAlign: 'center', margin: '20px 0 0' }}>
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

/**
 * What the student picked against what was right, for one reviewed question.
 *
 * The summary line always states both, because a colour on one row is easy to
 * miss and says nothing on its own when the pick was correct or when nothing was
 * answered. The options below repeat it in place: the correct row in green, a
 * wrong pick in red, and the student's own choice labelled either way.
 */
function AnswerReview({ r }: { r: QuestionWithAnswer }) {
  const isSPR = r.questionType === 'student_produced_response';
  const picked = isSPR ? (r.selectedAnswerText?.trim() || null) : r.selectedAnswer;
  const correct = isSPR ? r.correctAnswerText : r.correctAnswer;
  const show = (v: string | null) => (v === null ? '—' : isSPR ? v : v.toUpperCase());
  const outcome = picked === null ? 'skipped' : r.isCorrect ? 'right' : 'wrong';
  const tone = { right: '#1A6B3C', wrong: '#C0392B', skipped: 'rgba(11,11,14,0.64)' }[outcome];

  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', gap: '4px 14px', padding: '10px 14px', borderRadius: 10, background: outcome === 'right' ? 'rgba(46,125,90,0.07)' : outcome === 'wrong' ? 'rgba(192,57,43,0.06)' : '#F2F0EC', marginBottom: isSPR ? 0 : 8, fontSize: 14 }}>
        <span>
          <span style={{ color: 'rgba(11,11,14,0.64)' }}>Your answer </span>
          <strong style={{ color: tone }}>{picked === null ? 'Not answered' : show(picked)}</strong>
        </span>
        {outcome !== 'right' && (
          <span>
            <span style={{ color: 'rgba(11,11,14,0.64)' }}>Correct answer </span>
            <strong style={{ color: '#1A6B3C' }}>{show(correct)}</strong>
          </span>
        )}
        {outcome === 'right' && <strong style={{ color: tone }}>Correct</strong>}
      </div>

      {!isSPR && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
          {(['a', 'b', 'c', 'd'] as const).map((key) => {
            const text = r[`option${key.toUpperCase()}` as 'optionA' | 'optionB' | 'optionC' | 'optionD'];
            if (!text) return null;
            const isCorrect = r.correctAnswer === key;
            const isYour = r.selectedAnswer === key;
            const bg = isCorrect ? 'rgba(46,125,90,0.08)' : isYour ? 'rgba(192,57,43,0.06)' : '#FAF9F6';
            const bd = isCorrect ? '1px solid rgba(46,125,90,0.4)' : isYour ? '1.5px solid rgba(192,57,43,0.45)' : '1px solid #EAE7E1';
            return (
              <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: 10, background: bg, border: bd }}>
                <span style={{
                  width: 22, height: 22, flexShrink: 0, borderRadius: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700,
                  // The student's own pick gets a filled letter, whichever way it went.
                  background: isYour ? (isCorrect ? '#1A6B3C' : '#C0392B') : 'transparent',
                  color: isYour ? '#fff' : '#6F6B64',
                  border: isYour ? 'none' : '1px solid #D8D4CC',
                }}>{key.toUpperCase()}</span>
                <span style={{ fontSize: 14, flex: 1 }}>{text}</span>
                <span style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                  {isYour && <span style={{ fontSize: 11.5, fontWeight: 700, color: isCorrect ? '#1A6B3C' : '#C0392B' }}>Your answer</span>}
                  {isCorrect && <span style={{ fontSize: 11.5, fontWeight: 700, color: '#1A6B3C' }}>Correct</span>}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
