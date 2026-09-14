import { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import { getAnalytics, getQuestionSets, startExam, startTopicExam } from '@/api/student';
import { getApiError } from '@/api/http';
import { getAllExamProgress, clearExamProgress } from '@/lib/offline';
import { surfaceClass, cardClass, pageClass } from '@/components/common';
import { ExamBlurb, ExamKicker, ExamTitle, MetaStats, RulesCard } from '@/components/student/ExamIntro';
import { cn } from '@/lib/utils';
import { getSkills, skillsQueryKey } from '@/api/skills';

/** Cycled across the domains of a subject, so the cards stay visually distinct. */
const DOMAIN_DOTS = ['bg-green-sat', 'bg-blue-sat', 'bg-gold', 'bg-ember'];

export default function ExamCatalogue() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const subject = (searchParams.get('subject') as 'math' | 'english') ?? 'math';

  const [timerEnabled, setTimerEnabled] = useState(() => localStorage.getItem('sat-timer-pref') === 'true');
  const [resumeItems, setResumeItems] = useState<Array<{ examId: string; examTitle?: string; lastSaved: string }>>([]);
  const pendingSetTitleRef = useRef('');

  useEffect(() => {
    getAllExamProgress().then((all) => {
      if (all.length === 0) return;
      const sorted = [...all].sort((a, b) => new Date(b.lastSaved).getTime() - new Date(a.lastSaved).getTime());
      const [latest, ...stale] = sorted;
      stale.forEach((s) => clearExamProgress(s.examId));
      setResumeItems([latest]);
    });
  }, []);

  const switchSubject = (s: 'math' | 'english') => navigate(`/student/exams?subject=${s}`, { replace: true });

  const { data: sets = [], isLoading } = useQuery({ queryKey: ['student', 'question-sets'], queryFn: getQuestionSets });
  // The student's own accuracy per domain, so the topic list doubles as a map of
  // where points are going. Same query key as the Dashboard and Progress.
  const { data: analytics } = useQuery({ queryKey: ['student', 'analytics'], queryFn: getAnalytics });
  const { data: skillTree = [] } = useQuery({
    queryKey: skillsQueryKey(true),
    queryFn: () => getSkills(true),
    staleTime: 5 * 60 * 1000,
  });

  const [topicDifficulty, setTopicDifficulty] = useState<'any' | 'easy' | 'medium' | 'hard'>('any');
  const [topicCount, setTopicCount] = useState(10);
  const [topicError, setTopicError] = useState('');
  const pendingTopicRef = useRef<string | null>(null);

  const topicMutation = useMutation({
    mutationFn: startTopicExam,
    onSuccess: (data) =>
      navigate(`/student/exams/${data.exam.id}`, {
        state: { timerEnabled, examTitle: `Topic: ${data.skill.label}` },
      }),
    onError: (err) => setTopicError(getApiError(err)),
  });

  const startMutation = useMutation({
    mutationFn: startExam,
    onError: () => {}, // shown inline on the page, not as a toast
    onSuccess: (data) => navigate(`/student/exams/${data.exam.id}`, { state: { timerEnabled, examTitle: pendingSetTitleRef.current } }),
  });

  const toggleTimer = () => {
    const next = !timerEnabled;
    setTimerEnabled(next);
    localStorage.setItem('sat-timer-pref', String(next));
  };

  const dismissResume = async (examId: string) => {
    await clearExamProgress(examId);
    setResumeItems((r) => r.filter((x) => x.examId !== examId));
  };

  const filtered = sets.filter((s) => s.subject === subject);

  const isMath = subject === 'math';
  const accentBg = isMath ? 'bg-blue-sat' : 'bg-green-sat';
  const kicker = 'Section practice · scored out of 800';
  const title = isMath ? 'Math' : 'Reading & Writing';
  const blurb = isMath
    ? 'Focused Math practice spanning the Digital SAT domains. An on-screen calculator is available for every question, exactly like the real exam.'
    : 'Reading & Writing practice that mirrors the Digital SAT: short passages each followed by a single question testing craft, structure, and the conventions of English.';

  // The four official domains for this subject, from the server's taxonomy.
  // This was two hardcoded pairs per subject that merged real domains into
  // invented groupings ("Problem Solving & Geometry"), and had to be edited in
  // step with a second copy in MockTest.
  const domains = skillTree.filter((d) => d.subject === subject);
  const mods = domains.map((domain, i) => ({
    code: domain.code,
    dot: DOMAIN_DOTS[i % DOMAIN_DOTS.length],
    name: domain.label,
    /** Published questions on this domain or any skill beneath it. */
    available: domain.totalQuestionCount,
    detail: domain.skills.map((skill) => skill.label).join(' · '),
  }));

  const rules = [
    timerEnabled
      ? 'A 20-minute countdown runs — the test auto-submits when time runs out.'
      : 'No timer — take as much time as you need on each question.',
    'Flag any question and return to it from the navigator.',
    'Cross out answer choices you\'ve ruled out.',
    isMath ? 'An on-screen calculator is available throughout.' : 'Each question stands alone — answer in any order.',
    'AI guidance is available on the results page after you submit.',
  ];

  return (
    <div className={cn(pageClass, 'sm:pt-10')}>
      {/* Resume banner */}
      {resumeItems.length > 0 && (
        <div className="bg-[#FFFBF0] border border-gold/[.35] rounded-[14px] px-4 py-3.5 mb-5">
          <div className="text-[11px] font-bold tracking-[0.08em] uppercase text-gold mb-2.5">
            Unfinished test
          </div>
          <div className="flex flex-col gap-2">
            {resumeItems.map((item) => (
              <div key={item.examId} className="flex items-center gap-2.5 flex-wrap">
                <span className="flex-1 text-sm font-semibold text-ink min-w-[120px]">
                  {item.examTitle ?? 'Practice test'}
                  <span className="font-normal text-xs text-muted ml-2">
                    saved {new Date(item.lastSaved).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </span>
                </span>
                <div className="flex gap-2">
                  <button
                    onClick={() => navigate(`/student/exams/${item.examId}`)}
                    className="h-[34px] px-4 bg-ink text-white rounded-full text-[13px] font-semibold cursor-pointer"
                  >Continue →</button>
                  <button
                    onClick={() => dismissResume(item.examId)}
                    className="h-[34px] px-3.5 bg-transparent text-muted border border-border-strong rounded-full text-[13px] font-medium cursor-pointer"
                  >Dismiss</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Subject switcher */}
      <div className="grid grid-cols-2 sm:inline-flex gap-1 bg-sunken-2 rounded-xl p-1 mb-[22px]">
        {([['math', 'Math', 'Math'], ['english', 'R & W', 'Reading & Writing']] as const).map(([s, short, long]) => (
          <button
            key={s}
            onClick={() => switchSubject(s)}
            className={cn(
              'px-3 py-[9px] sm:px-[18px] sm:py-2 rounded-[9px] text-[13px] sm:text-[13.5px] font-semibold cursor-pointer text-center transition-[background-color,color] duration-150',
              subject === s ? 'bg-white text-ink shadow-[0_1px_4px_rgba(11,11,14,0.1)]' : 'bg-transparent text-muted',
            )}
          >
            <span className="sm:hidden">{short}</span>
            <span className="hidden sm:inline">{long}</span>
          </button>
        ))}
      </div>

      <ExamKicker>{kicker}</ExamKicker>
      <ExamTitle className="mt-1.5">{title}</ExamTitle>
      <ExamBlurb className="mt-2.5 mb-[22px]">{blurb}</ExamBlurb>

      <MetaStats stats={[['—', 'Questions per set'], [timerEnabled ? '20m' : '∞', 'Time limit'], ['800', 'Score scale']]} />

      <div className="grid grid-cols-1 sm:grid-cols-[1.5fr_1fr] gap-3.5 sm:gap-5 mb-5 sm:mb-7">
        <div>
          {/* Practise by topic. The counts come from the same endpoint, so a
              domain nobody has authored questions for is disabled rather than
              offered and then failing at assembly. */}
          <div className="flex items-baseline justify-between gap-2.5 flex-wrap mb-3">
            <h3 className="text-[15px] m-0">Practise by topic</h3>
            <div className="flex gap-1.5 items-center">
              {(['any', 'easy', 'medium', 'hard'] as const).map((level) => (
                <button
                  key={level}
                  onClick={() => setTopicDifficulty(level)}
                  className={cn(
                    'px-2.5 py-[3px] text-[11.5px] font-semibold rounded-full cursor-pointer capitalize',
                    topicDifficulty === level ? 'bg-ink text-white' : 'border border-border bg-sunken text-stone',
                  )}
                >{level}</button>
              ))}
              <select
                value={topicCount}
                onChange={(e) => setTopicCount(Number(e.target.value))}
                className="h-[26px] px-1.5 border border-border rounded-lg bg-white text-[11.5px] cursor-pointer"
              >
                {[5, 10, 15, 20].map((n) => <option key={n} value={n}>{n} Qs</option>)}
              </select>
            </div>
          </div>

          {topicError && (
            <div className="bg-danger/[.06] border border-danger/20 rounded-[10px] px-3.5 py-[9px] mb-2.5 text-[13px] text-danger">
              {topicError}
            </div>
          )}

          <div className="flex flex-col gap-2.5">
            {mods.map((m) => {
              const enough = (m.available ?? 0) >= 5;
              const starting = topicMutation.isPending && pendingTopicRef.current === m.code;
              const mine = analytics?.domains.find((d) => d.domainCode === m.code);
              const minAttempts = analytics?.minAttempts ?? 5;
              return (
                <div key={m.code} className={cn(surfaceClass, 'px-4 py-3.5 sm:px-5 sm:py-[18px]', !enough && 'opacity-60')}>
                  <div className="flex items-center gap-2.5 mb-1.5 flex-wrap">
                    <span className={cn('w-2.5 h-2.5 rounded-full shrink-0', m.dot)} />
                    <span className="text-sm sm:text-[15.5px] font-semibold">{m.name}</span>
                    <span className="ml-auto text-[12.5px] text-muted font-mono">
                      {m.available ?? 0} Qs
                    </span>
                    <button
                      onClick={() => { setTopicError(''); pendingTopicRef.current = m.code; topicMutation.mutate({ subject, skillCode: m.code, difficulty: topicDifficulty === 'any' ? undefined : topicDifficulty, count: topicCount }); }}
                      disabled={!enough || topicMutation.isPending}
                      title={enough ? undefined : 'Not enough questions in this topic yet'}
                      className={cn(
                        'h-[30px] px-3.5 rounded-full text-[12.5px] font-semibold shrink-0',
                        enough ? 'bg-accent-text text-white' : 'bg-border text-muted',
                        enough && !topicMutation.isPending ? 'cursor-pointer' : 'cursor-default',
                      )}
                    >{starting ? 'Building…' : 'Practise'}</button>
                  </div>
                  {mine && mine.attempted > 0 && (
                    <div className={cn('text-[12.5px] text-subtle', m.detail && 'sm:mb-1')}>
                      {mine.attempted >= minAttempts
                        ? <>You get <strong className="text-ink">{mine.accuracy}%</strong> right · {mine.attempted} answered</>
                        : <>{mine.attempted} answered · not enough yet for a percentage</>}
                    </div>
                  )}
                  {m.detail && (
                    <div className="hidden sm:block text-[12.5px] text-muted font-mono">{m.detail}</div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <RulesCard rules={rules} />
      </div>

      {/* Available sets + timer toggle */}
      <div className="flex justify-between items-center mb-3 flex-wrap gap-2.5">
        <h3 className="text-[15px] m-0">Available question sets</h3>
        <button
          onClick={toggleTimer}
          className={cn(
            'flex items-center gap-2 px-3.5 py-2 rounded-[10px] cursor-pointer border',
            timerEnabled ? 'border-ember bg-ember/[.06] text-accent-text' : 'border-field bg-white text-stone',
          )}
        >
          <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
          </svg>
          <span className="text-[13px] font-semibold">Timer: {timerEnabled ? 'On' : 'Off'}</span>
          <div className={cn('w-[34px] h-[18px] rounded-full relative shrink-0 transition-colors duration-200', timerEnabled ? 'bg-ember' : 'bg-[#D0CCC6]')}>
            <div className={cn('absolute top-0.5 w-3.5 h-3.5 rounded-full bg-white shadow-[0_1px_3px_rgba(0,0,0,0.2)] transition-[left] duration-200', timerEnabled ? 'left-[18px]' : 'left-0.5')} />
          </div>
        </button>
      </div>

      {isLoading ? (
        <div className="text-muted text-sm">Loading…</div>
      ) : filtered.length === 0 ? (
        <div className={cn(surfaceClass, 'px-6 py-8 text-center text-muted text-sm')}>
          No {title} question sets available yet. Ask your teacher to add some.
        </div>
      ) : (
        <div className="flex flex-col gap-2.5">
          {filtered.map((set) => (
            <div
              key={set.id}
              className={cn(cardClass, 'rounded-2xl shadow-stat cursor-default px-4 py-3.5 sm:px-[22px] sm:py-[18px] flex items-center gap-3.5')}
            >
              <div className="flex-1 min-w-0">
                <div className="text-sm sm:text-[15px] font-semibold">{set.title}</div>
                {set.description && <div className="text-[13px] text-subtle mt-0.5">{set.description}</div>}
                <div className="text-xs font-mono text-muted mt-[3px]">{set.questionCount} questions</div>
              </div>
              <button
                onClick={() => { pendingSetTitleRef.current = set.title; startMutation.mutate(set.id); }}
                disabled={startMutation.isPending}
                className={cn('h-9 sm:h-10 px-[18px] text-white rounded-full text-[13px] font-semibold cursor-pointer shrink-0', accentBg)}
              >
                {startMutation.isPending ? 'Starting…' : 'Begin →'}
              </button>
            </div>
          ))}
        </div>
      )}

      {startMutation.isError && (
        <p className="text-danger text-[13px] mt-3">{getApiError(startMutation.error)}</p>
      )}
    </div>
  );
}
