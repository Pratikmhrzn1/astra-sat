import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQueries, useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getExamResults, type QuestionWithAnswer } from '@/entities/exam';
import { getMockNarrative, retryNarrative, confirmAnswer, sendChatMessage } from '@/features/exam-review/api';
import { pageClass, surfaceClass } from '@/shared/ui';
import {
  ESTIMATED_LABEL, SECTION_MAX, TOTAL_MAX,
  formatExamScore, formatScore, scoreColor,
} from '@/entities/score';
import { cn } from '@/shared/lib/utils';
import { NarrativePanel } from '@/features/exam-review/components/NarrativePanel';
import { ReviewItem, type AiPending, type AiResult } from '@/features/exam-review/components/ReviewItem';
import { TutorChat, type ChatMessage } from '@/features/exam-review/components/TutorChat';

const heroLabel = 'text-[11px] font-bold tracking-[0.12em] uppercase text-white/50';
const heroScore = 'font-display font-semibold text-[60px] sm:text-[88px] leading-[0.95] tracking-[-0.03em]';
const heroOutOf = 'font-display font-semibold text-[22px] sm:text-[30px] text-white/50 mb-1.5 sm:mb-2.5';

function HeroStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs font-semibold text-white/60 mb-1">{label}</div>
      <div className="font-display font-semibold text-[30px] sm:text-[44px] leading-none text-white">{value}</div>
    </div>
  );
}

function SectionDivider({ dot, title, detail, className }: { dot: string; title: string; detail: string; className?: string }) {
  return (
    <div className={cn('flex items-center gap-3 pb-1', className)}>
      <span className={cn('w-2.5 h-2.5 rounded-full shrink-0', dot)} />
      <span className="text-[13px] font-bold tracking-[0.06em] uppercase text-subtle">{title}</span>
      <span className="text-xs text-muted font-mono">{detail}</span>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function ExamDetail() {
  const { examId } = useParams<{ examId: string }>();
  const navigate = useNavigate();
  const [reviewOpen, setReviewOpen] = useState<Record<number, boolean>>({});

  // AI guidance state (keyed by questionId)
  const [aiPanelOpen, setAiPanelOpen] = useState<Record<string, boolean>>({});
  const [aiPending, setAiPending] = useState<Record<string, AiPending>>({});
  const [aiResults, setAiResults] = useState<Record<string, AiResult>>({});
  const [aiLoading, setAiLoading] = useState<Record<string, boolean>>({});
  const [vocabPick, setVocabPick] = useState<Record<string, string>>({});
  const [vocabSubmitted, setVocabSubmitted] = useState<Record<string, boolean>>({});

  // Chat state
  const [chatQuestionId, setChatQuestionId] = useState<string | null>(null);
  const [chatSessionId, setChatSessionId] = useState<string | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
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
    return <div className="flex justify-center pt-16"><div className="font-display font-semibold text-2xl text-muted">Loading…</div></div>;
  }

  if (error || !data) {
    return (
      <div className="text-center pt-16">
        <p className="text-danger mb-4">Failed to load results.</p>
        <button onClick={() => navigate(-1)} className="h-10 px-5 border border-field rounded-full bg-white cursor-pointer">Go back</button>
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
  const aiEnabled = isPractice || isMockExam;

  /** One question row, with its AI and chat state pulled from the page. */
  const renderItem = (r: QuestionWithAnswer, number: number, listIdx: number) => {
    const qId = r.id;
    return (
      <ReviewItem
        key={qId}
        r={r}
        number={number}
        open={!!reviewOpen[listIdx]}
        onToggle={() => toggleReview(listIdx)}
        aiEnabled={aiEnabled}
        aiOpen={!!aiPanelOpen[qId]}
        onToggleAi={() => setAiPanelOpen((o) => ({ ...o, [qId]: !o[qId] }))}
        aiResult={aiResults[qId]}
        aiPending={aiPending[qId] ?? { confidence: null, reasoning: '' }}
        onPending={(next) => setAiPending((p) => ({ ...p, [qId]: next }))}
        aiLoading={!!aiLoading[qId]}
        onGetGuidance={() => handleAiGuidance(qId)}
        chatActive={chatQuestionId === qId}
        onToggleChat={() => setChatQuestionId(chatQuestionId === qId ? null : qId)}
        vocabPick={vocabPick}
        vocabSubmitted={vocabSubmitted}
        setVocabPick={setVocabPick}
        setVocabSubmitted={setVocabSubmitted}
      />
    );
  };

  return (
    <div className={pageClass}>
      <div className="text-[11px] font-bold tracking-[0.12em] uppercase text-accent-text mb-1.5">
        {isMockCombined ? 'Full mock SAT · score report' : `Score report · ${set?.subject === 'math' ? 'Math' : 'Reading & Writing'}`}
        {isPractice && <span className="ml-2.5 text-blue-sat">· Practice</span>}
      </div>
      <h1 className="font-display font-semibold text-[28px] sm:text-[40px] mt-0 mb-5 tracking-[-0.02em]">Performance Report</h1>

      {/* Hero */}
      <div className="pop bg-ink rounded-3xl px-5 py-[22px] sm:px-9 sm:py-8 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-5 sm:gap-9 mb-5 relative overflow-hidden">
        <div className="absolute -left-[60px] -bottom-20 w-60 h-60 rounded-full bg-[radial-gradient(circle,rgba(226,86,43,0.16),transparent_70%)]" />
        <div className="relative">
          {isMockCombined ? (
            <>
              <div className={heroLabel}>{ESTIMATED_LABEL} total score</div>
              <div className="flex items-end gap-3.5 mt-1 whitespace-nowrap">
                <div className={heroScore} style={{ color: scoreColor(totalScore1600, TOTAL_MAX) }}>{formatScore(totalScore1600)}</div>
                <div className={heroOutOf}>/ 1600</div>
              </div>
              <div className="flex gap-3 mt-2 flex-wrap text-[13px] text-white/50">
                <span>R&W: <strong className="text-white">{formatScore(rwScore)}</strong></span>
                <span>·</span>
                <span>Math: <strong className="text-white">{formatScore(mathSectionScore)}</strong></span>
              </div>
            </>
          ) : (
            <>
              <div className={heroLabel}>{ESTIMATED_LABEL} section score</div>
              <div className="flex items-end gap-3.5 mt-1 whitespace-nowrap">
                <div className={heroScore} style={{ color: headlineColor }}>{formatExamScore(exam.scaledScore, exam.score, exam.totalQuestions)}</div>
                <div className={heroOutOf}>{exam.scaledScore === null ? '' : '/ 800'}</div>
              </div>
              <div className="text-[13px] mt-2 text-white/50">{correct} of {results.length} correct</div>
            </>
          )}
        </div>
        <div className="relative flex gap-5 sm:gap-10 flex-wrap">
          {(isMockCombined
            ? [
                { label: 'Total Qs', value: String(mathReview.length + englishReview.length) },
                { label: 'Correct', value: String(correct + englishReview.filter((r) => r.isCorrect).length) },
                { label: 'Wrong', value: String(wrong + englishReview.filter((r) => r.isCorrect === false).length) },
                { label: 'Skipped', value: String(skipped + englishReview.filter((r) => r.isCorrect === null).length) },
              ]
            : [
                { label: 'Accuracy', value: accuracy + '%' },
                { label: 'Correct', value: String(correct) },
                { label: 'Wrong', value: String(wrong) },
                { label: 'Skipped', value: String(skipped) },
              ]
          ).map(({ label, value }) => <HeroStat key={label} label={label} value={value} />)}
        </div>
      </div>

      {/* Practice tip banner */}
      {isPractice && (
        <div className="bg-blue-sat/[.06] border border-blue-sat/20 rounded-xl px-[18px] py-3 mb-[22px] text-[13.5px] text-[#1D4ED8] leading-normal">
          <strong>AI Guidance available:</strong> Expand any question below and click <em>AI Guidance</em> to get a personalised review. You can also ask the tutor any question.
        </div>
      )}

      {/* Performance narrative */}
      {aiEnabled && (
        <NarrativePanel
          narrative={narrativeData}
          failed={narrativeError || (pollCountRef.current >= 10 && narrativeData?.status === 'pending')}
          onRetry={() => retryMutation.mutate()}
          retrying={retryMutation.isPending}
        />
      )}

      {/* Topic performance */}
      <h3 className="text-base mt-1.5 mb-3.5">Performance by topic</h3>
      <div className="grid grid-cols-2 gap-3 mb-[30px]">
        {Object.entries(topics).map(([t, v]) => {
          const pct = Math.round((v.ok / v.n) * 100);
          return (
            <div key={t} className={cn(surfaceClass, 'px-[18px] py-4')}>
              <div className="flex justify-between items-baseline mb-[9px]">
                <span className="text-sm font-semibold">{t}</span>
                <span className="text-[12.5px] text-subtle font-mono">{v.ok}/{v.n}</span>
              </div>
              <div className="h-1.5 bg-sunken-2 rounded-full overflow-hidden">
                <div
                  className={cn('h-1.5 rounded-full', pct >= 67 ? 'bg-green-sat' : pct >= 34 ? 'bg-gold' : 'bg-danger')}
                  style={{ width: pct + '%' }}
                />
              </div>
            </div>
          );
        })}
      </div>

      {/* Question review */}
      <div className="flex justify-between items-center mt-1.5 mb-3.5 flex-wrap gap-2">
        <h3 className="text-base m-0">Question review</h3>
        <span className="inline-flex items-center gap-1.5 text-[12.5px] font-bold text-gold bg-gold/10 border border-gold/30 rounded-full px-3 py-[5px]">
          <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="9 18 15 12 9 6"/>
          </svg>
          <span className="sm:hidden">{isPractice ? 'Tap to expand · AI inside' : 'Tap to expand'}</span>
          <span className="hidden sm:inline">{isPractice ? 'Click a question to expand & get AI guidance' : 'Click a question to see the explanation'}</span>
        </span>
      </div>

      <div className="flex flex-col gap-2.5">
        {isMockCombined && (
          <SectionDivider
            dot="bg-green-sat"
            title="Section 1 · Reading & Writing"
            detail={`(${englishReview.filter((r) => r.isCorrect).length}/${englishReview.length} correct · ${formatScore(rwScore)}/800)`}
            className="pt-2.5"
          />
        )}
        {isMockCombined && englishReview.map((r, i) => renderItem(r, i + 1, i))}

        {isMockCombined && (
          <SectionDivider
            dot="bg-blue-sat"
            title="Section 2 · Math"
            detail={`(${correct}/${mathReview.length} correct · ${formatScore(mathSectionScore)}/800)`}
            className="pt-[18px]"
          />
        )}
        {mathReview.map((r, i) => renderItem(r, i + 1, isMockCombined ? englishReview.length + i : i))}
      </div>

      {/* Actions */}
      <div className="flex flex-col sm:flex-row gap-3 mt-[30px]">
        <button onClick={() => navigate('/student/results')} className="h-12 px-[26px] bg-white text-ink border border-field rounded-full text-[15px] font-semibold cursor-pointer w-full sm:w-auto">View all results</button>
        <button onClick={() => navigate('/student/dashboard')} className="h-12 px-[26px] bg-accent-text text-white rounded-full text-[15px] font-semibold cursor-pointer shadow-[0_2px_10px_rgba(226,86,43,0.26)] w-full sm:w-auto">Back to dashboard</button>
      </div>

      {/* Chat panel — fixed bottom, practice and mock exams */}
      {aiEnabled && chatQuestionId && (
        <TutorChat
          questionNumber={(results.findIndex((r) => r.id === chatQuestionId) + 1) || ''}
          messages={chatMessages}
          loading={chatLoading}
          error={chatError}
          input={chatInput}
          onInput={setChatInput}
          onSend={handleSendChat}
          onClose={() => setChatQuestionId(null)}
          messagesRef={chatMessagesRef}
        />
      )}
    </div>
  );
}
