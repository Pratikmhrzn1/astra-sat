import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useAuthStore } from '@/features/auth';
import { getExams, startExam } from '@/entities/exam';
import { getFeedback } from '@/features/messages';
import { getAvailableSkillPassages, startTopicExam } from '@/features/practice';
import { getAnalytics, getProfile, weakestDomain } from '@/features/progress';
import { getMistakeSummary } from '@/features/mistakes';
import { cardClass, pageClass } from '@/shared/ui';
import { cn } from '@/shared/lib/utils';
import {
  NO_SCORE, SECTION_MAX,
  daysUntil, formatExamScore, formatScore, scoreColor,
} from '@/entities/score';

export default function Dashboard() {
  const { user } = useAuthStore();
  const navigate = useNavigate();

  const { data: exams = [] } = useQuery({ queryKey: ['student', 'exams'], queryFn: getExams });
  const { data: feedback = [] } = useQuery({ queryKey: ['student', 'feedback'], queryFn: getFeedback });
  const { data: weakAreaPassages = [] } = useQuery({ queryKey: ['student', 'skill-passages'], queryFn: getAvailableSkillPassages });
  const { data: profile } = useQuery({ queryKey: ['student', 'profile'], queryFn: getProfile });
  const { data: mistakeSummary = [] } = useQuery({ queryKey: ['student', 'mistakes', 'summary'], queryFn: getMistakeSummary });
  const { data: analytics } = useQuery({ queryKey: ['student', 'analytics'], queryFn: getAnalytics });

  // The diagnose-then-practise loop in one card: the weakest topic with enough
  // data behind it, and a button that builds an exam from exactly that topic.
  const weakest = weakestDomain(analytics);
  const topicMutation = useMutation({
    mutationFn: startTopicExam,
    onSuccess: (result) => navigate(`/student/exams/${result.exam.id}`, {
      state: { timerEnabled: false, examTitle: `Topic: ${result.skill.label}` },
    }),
  });
  const [weakAreaError, setWeakAreaError] = React.useState<string | null>(null);

  const openMistakes = mistakeSummary.reduce((sum, row) => sum + row.openCount, 0);

  const completedExams = exams.filter((e) => e.status === 'completed');
  const unreadFeedback = feedback.filter((f) => !f.isRead).length;

  // The estimate comes from the server's readiness(), the same number the
  // Progress page and the teacher's view show: the latest scored mock, or failing
  // that the latest scaled practice score per section (total only when both
  // exist). It used to be assembled here from `?? 600` placeholders, which told a
  // student with no completed exams at all that they had scored 1200.
  const estimate = analytics?.readiness.estimate;
  const estRW = estimate?.rw ?? null;
  const estMath = estimate?.math ?? null;
  const estTotal = estimate?.total ?? null;
  const estFromPractice = estimate?.source === 'practice';

  const firstName = user?.name.split(' ')[0] ?? 'there';
  const todayStr = new Date().toLocaleDateString('en-US', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  // No invented target: without a profile the hero prompts the student to set
  // one rather than measuring them against a number they never chose.
  const target = profile?.targetScore ?? null;
  const targetGap = target !== null && estTotal !== null ? Math.max(0, target - estTotal) : null;
  const daysToTest = daysUntil(profile?.testDate);

  const recentTests = completedExams.slice(0, 4).map((e) => {
    const isMock = e.type !== 'individual';
    const isMathExam = e.subject === 'math';
    const score = formatExamScore(e.scaledScore, e.score, e.totalQuestions);
    const color = scoreColor(e.scaledScore, SECTION_MAX);
    const iconBg = isMock ? 'rgba(226,86,43,0.10)' : isMathExam ? 'rgba(37,99,168,0.10)' : 'rgba(46,125,90,0.10)';
    const iconColor = isMock ? '#E2562B' : isMathExam ? '#2563A8' : '#2E7D5A';
    const iconChar = isMock ? 'M' : isMathExam ? '∑' : 'A';
    return { e, score, color, iconBg, iconColor, iconChar };
  });

  const accuracy = completedExams.length > 0
    ? Math.round(completedExams.reduce((s, e) => s + (e.score ?? 0) / e.totalQuestions, 0) / completedExams.length * 100)
    : 0;

  const btn = (label: string, className: string, onClick: () => void) => (
    <button
      onClick={onClick}
      className={cn('h-10 px-[18px] rounded-full text-[13.5px] font-semibold cursor-pointer whitespace-nowrap hover:opacity-[.85]', className)}
    >
      {label}
    </button>
  );

  const eyebrowClass = 'text-[10px] font-bold tracking-[0.1em] uppercase mb-1';
  const sectionTitleClass = 'text-[17px] m-0 font-sans';

  return (
    <div className={pageClass}>
      {/* Header */}
      <div className="mb-5 sm:mb-7">
        <div className="hidden sm:block text-xs font-bold tracking-[0.1em] uppercase text-muted mb-1">{todayStr}</div>
        <div className="flex items-start sm:items-end justify-between gap-3 flex-wrap sm:flex-nowrap">
          <h1 className="font-display font-semibold text-[32px] sm:text-[44px] m-0 tracking-[-0.02em] leading-[1.1]">
            Welcome back, {firstName}
          </h1>
          <button
            onClick={() => navigate('/student/mock-test')}
            className="h-10 sm:h-[46px] px-[18px] bg-accent-text text-white rounded-full text-[13.5px] sm:text-[14.5px] font-semibold cursor-pointer shadow-[0_2px_10px_rgba(226,86,43,0.26)] shrink-0"
          >
            <span className="sm:hidden">Full mock test</span>
            <span className="hidden sm:inline">Start full mock test</span>
          </button>
        </div>
      </div>

      {/* Hero — estimated score */}
      <div className="bg-ink rounded-3xl px-5 py-6 sm:px-9 sm:py-8 mb-4 relative overflow-hidden block sm:grid sm:grid-cols-[auto_1px_1fr_auto] gap-9 items-center">
        <div className="absolute -right-20 -top-20 w-[260px] h-[260px] rounded-full bg-[radial-gradient(circle,rgba(226,86,43,0.16),transparent_70%)]" />

        {/* Score */}
        <div className="relative mb-5 sm:mb-0">
          <div className="text-[11px] font-bold tracking-[0.12em] uppercase text-white/50">Estimated SAT score</div>
          <div className={cn(
            'font-display font-semibold text-[68px] sm:text-[88px] leading-none tracking-[-0.03em] mt-1',
            estTotal === null ? 'text-white/50' : 'text-white',
          )}>{formatScore(estTotal)}</div>
          <div className="text-[13px] text-white/50 mt-1.5">
            {estTotal === null ? (
              estRW !== null
                ? 'Score a Math practice test to complete your estimate'
                : estMath !== null
                  ? 'Score a Reading & Writing practice test to complete your estimate'
                  : 'Finish a practice test or full mock to see your estimated score'
            ) : target === null ? (
              <button
                onClick={() => navigate('/student/settings')}
                className="bg-transparent p-0 [font:inherit] text-gold font-semibold cursor-pointer underline"
              >
                Set your target score
              </button>
            ) : (
              <>
                Target <span className="text-gold font-semibold">{target}</span>
                {' · '}
                {targetGap && targetGap > 0 ? `${targetGap} to go` : 'Goal reached! 🎉'}
                {daysToTest !== null && (daysToTest >= 0
                  ? ` · ${daysToTest} ${daysToTest === 1 ? 'day' : 'days'} to test day`
                  : ' · test date has passed')}
              </>
            )}
          </div>
          {estFromPractice && (
            <div className="text-xs text-white/50 mt-1">
              From your latest practice tests · a full mock gives a test-day estimate
            </div>
          )}
        </div>

        {/* Divider — desktop only */}
        <div className="hidden sm:block w-px h-[120px] bg-white/[.12]" />

        {/* Section bars */}
        <div className="flex flex-col gap-4 relative mb-5 sm:mb-0">
          {[
            { label: 'Reading & Writing', value: estRW, bar: 'bg-ember' },
            { label: 'Math', value: estMath, bar: 'bg-[#3D8C60]' },
          ].map(({ label, value, bar }) => (
            <div key={label}>
              <div className="flex justify-between items-baseline mb-[7px]">
                <span className="text-[13px] font-semibold text-white/70">{label}</span>
                <span className="font-display font-semibold text-[22px] text-white">{value ?? NO_SCORE}</span>
              </div>
              <div className="h-[5px] bg-white/10 rounded-full">
                {/* width is data-driven, so it stays inline */}
                <div className={cn('h-[5px] rounded-full', bar)} style={{ width: `${((value ?? 0) / SECTION_MAX) * 100}%` }} />
              </div>
            </div>
          ))}
        </div>

        {/* Practice buttons */}
        <div className="relative flex flex-row sm:flex-col gap-2.5">
          {btn('Practice Math', 'bg-white/10 text-white border border-white/[.16]', () => navigate('/student/exams'))}
          {btn('Practice R&W', 'bg-white/10 text-white border border-white/[.16]', () => navigate('/student/exams'))}
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-2.5 sm:gap-4 mb-5 sm:mb-7">
        {[
          { value: completedExams.length || 0, suffix: '', label: 'Tests completed', color: 'text-accent-text' },
          { value: accuracy, suffix: '%', label: 'Avg accuracy', color: 'text-green-sat' },
          { value: unreadFeedback, suffix: '', label: 'Unread feedback', color: 'text-gold' },
        ].map(({ value, suffix, label, color }) => (
          <div key={label} className="bg-white border border-border rounded-[14px] px-3.5 py-4 sm:px-6 sm:py-[22px] shadow-stat">
            <div className={cn('font-display font-semibold text-[34px] sm:text-[46px] leading-none', color)}>{value}{suffix}</div>
            <div className="text-[10px] sm:text-[11px] font-bold tracking-[0.08em] uppercase text-muted mt-1.5">{label}</div>
          </div>
        ))}
      </div>

      {/* Recent tests + Jump back in */}
      <div className="grid grid-cols-1 sm:grid-cols-[1.4fr_1fr] gap-5 sm:gap-6">
        {/* Recent tests */}
        <div>
          <div className="flex justify-between items-center mb-3.5">
            <h3 className={sectionTitleClass}>Recent tests</h3>
            <span onClick={() => navigate('/student/results')} className="text-[13px] text-accent-text font-semibold cursor-pointer">View all →</span>
          </div>
          {recentTests.length === 0 ? (
            <div className="bg-white border border-border rounded-[14px] px-6 py-8 text-center text-muted text-sm">
              No completed tests yet. Start practicing!
            </div>
          ) : (
            <div className="flex flex-col gap-2.5">
              {recentTests.map(({ e, score, color, iconBg, iconColor, iconChar }) => (
                <div
                  key={e.id}
                  onClick={() => navigate(`/student/results/${e.id}`)}
                  className={cn(cardClass, 'px-4 py-3.5 flex items-center gap-3.5')}
                >
                  <div
                    className="w-10 h-10 rounded-[11px] flex items-center justify-center font-display font-semibold text-xl shrink-0"
                    style={{ background: iconBg, color: iconColor }}
                  >
                    {iconChar}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold truncate">{e.setTitle ?? e.label ?? 'Practice'}</div>
                    <div className="text-xs text-muted">{e.subject === 'math' ? 'Math' : 'R&W'}</div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="font-display font-semibold text-[26px] leading-none" style={{ color }}>{score}</div>
                    <div className="text-[11px] text-muted">/ 800</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Quick start */}
        <div>
          <h3 className={cn(sectionTitleClass, 'mb-3.5')}>Jump back in</h3>
          <div className="flex flex-col gap-2.5">
            {[
              { label: 'Full length', sub: 'R&W + Math · scored /1600', title: 'Take a mock SAT', color: 'text-accent-text', path: '/student/mock-test' },
              { label: 'Section', sub: 'Algebra, geometry & data', title: 'Math practice', color: 'text-blue-sat', path: '/student/exams' },
              { label: 'Section', sub: 'Grammar, vocab & comprehension', title: 'Reading & Writing', color: 'text-green-sat', path: '/student/exams' },
              { label: 'Daily review', sub: 'Words due for spaced repetition', title: 'Vocab flashcards', color: 'text-[#0D7377]', path: '/student/vocab-review' },
              // Always shown, unlike the conditional cards below it: a student
              // needs this the moment their teacher reads out a code, and has no
              // way to know in advance that they will.
              { label: 'In class', sub: 'Enter the code from your teacher', title: 'Join a live exam', color: 'text-[#8E44AD]', path: '/student/live-exam' },
              ...(weakest
                ? [{
                    label: 'Weakest topic',
                    sub: `${weakest.accuracy}% across ${weakest.attempted} questions`,
                    title: weakest.domainLabel,
                    color: 'text-gold',
                    path: '__topic__',
                  }]
                : []),
              // The diagnose-then-practise loop: the card only appears once
              // there is something in the bank, and says how much.
              ...(openMistakes > 0
                ? [{
                    label: 'Targeted',
                    sub: `${openMistakes} question${openMistakes === 1 ? '' : 's'} you've missed`,
                    title: 'Review your mistakes',
                    color: 'text-[#C47A1B]',
                    path: '/student/mistakes',
                  }]
                : []),
            ].map(({ label, sub, title, color, path }) => (
              <div
                key={title}
                onClick={() => {
                  if (path !== '__topic__') { navigate(path); return; }
                  if (weakest) topicMutation.mutate({ subject: weakest.subject, skillCode: weakest.domainCode, count: 10 });
                }}
                className={cn(cardClass, 'px-[18px] py-4')}
              >
                <div className={cn(eyebrowClass, color)}>{label}</div>
                <div className="text-[14.5px] font-semibold">{title}</div>
                <div className="text-xs text-muted mt-0.5">{sub}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Weak-area practice */}
      {weakAreaPassages.length > 0 && (
        <div className="mt-5 sm:mt-7">
          <h3 className={cn(sectionTitleClass, 'mb-3.5')}>Practice your weak areas</h3>
          {weakAreaError && (
            <div className="bg-danger/[.06] border border-danger/20 rounded-[10px] px-4 py-2.5 mb-3 text-[13px] text-danger">
              {weakAreaError}
            </div>
          )}
          <div className="grid grid-cols-2 sm:grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-3">
            {weakAreaPassages.map((p) => (
              <div
                key={p.subSkill}
                onClick={async () => {
                  setWeakAreaError(null);
                  try {
                    const { exam } = await startExam(p.setId);
                    navigate(`/student/exam/${exam.id}`);
                  } catch {
                    setWeakAreaError('Could not start practice session. Please try again.');
                  }
                }}
                className={cn(cardClass, 'px-4 py-[18px]')}
              >
                <div className={cn(eyebrowClass, 'text-accent-text')}>Targeted</div>
                <div className="text-sm font-semibold capitalize">{p.subSkill.replace(/_/g, ' ')}</div>
                <div className="text-[11.5px] text-muted mt-0.5">AI-generated · module 2</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
