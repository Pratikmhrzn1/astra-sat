import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { getAnalytics, getExams } from '@/api/student';
import {
  TREND_COLORS, PageHeader, NoteCard, EmptyState, pillClass, surfaceClass, kickerClass, pageClass,
} from '@/components/common';
import { cn } from '@/lib/utils';
import { getLiveExamResults, type LiveExamResult } from '@/api/liveExam';
import { LiveResultCard } from '@/components/live-exam/LiveResultCard';
import { useMobile } from '@/hooks/useMobile';
import { NO_SCORE, SECTION_MAX, formatExamScore, scoreColor } from '@/lib/score';

type Filter = 'All' | 'individual' | 'mock_english' | 'mock_math';

export default function Results() {
  const navigate = useNavigate();
  const location = useLocation();
  const [filter, setFilter] = useState<Filter>('All');
  const isMobile = useMobile();

  const searchParams = new URLSearchParams(location.search);
  const defaultTab = searchParams.get('tab') === 'live' ? 'live' : 'practice';
  const [mainTab, setMainTab] = useState<'practice' | 'live'>(defaultTab);

  // Through React Query like the rest of the page: a failed load used to leave
  // the tab reading "No live exam results yet".
  const { data: liveResults = [], isLoading: liveLoading, isError: liveError, refetch: refetchLive } = useQuery({
    queryKey: ['student', 'live-exam-results'],
    queryFn: getLiveExamResults,
    enabled: mainTab === 'live',
    meta: { handlesError: true },
  });

  const { data: exams = [], isLoading } = useQuery({ queryKey: ['student', 'exams'], queryFn: getExams });

  const completed = exams.filter((e) => e.status === 'completed');
  const shown = filter === 'All' ? completed : completed.filter((e) => e.type === filter);

  const chips: { label: string; value: Filter }[] = [
    { label: 'All', value: 'All' },
    { label: 'Full Mock', value: 'mock_english' },
    { label: 'Individual', value: 'individual' },
  ];

  // Both trend lines and the best score read the server's scoreTrend — the same
  // series the Progress page and the teacher see — rather than re-deriving it
  // here from the exam and mock lists. The client copy had already drifted:
  // topic-practice exams carry no set, so it could not tell their subject.
  const { data: analytics } = useQuery({ queryKey: ['student', 'analytics'], queryFn: getAnalytics });
  const trend = analytics?.trend ?? [];
  const rwPoints = trend.filter((p) => p.rw !== null).map((p) => ({ at: p.at, value: p.rw }));
  const mathPoints = trend.filter((p) => p.math !== null).map((p) => ({ at: p.at, value: p.math }));

  const bestScore = [...rwPoints, ...mathPoints].reduce<number | null>(
    (best, p) => (p.value !== null && (best === null || p.value > best) ? p.value : best),
    null,
  );

  const kindOf = (e: (typeof shown)[number]) => {
    const isMath = e.subject === 'math';
    return {
      dot: e.type === 'individual' ? (isMath ? 'bg-blue-sat' : 'bg-green-sat') : 'bg-ember',
      label: e.type === 'individual' ? (isMath ? 'Math practice' : 'R&W practice') : (isMath ? 'Mock · Math' : 'Mock · R&W'),
    };
  };
  const dateOf = (iso: string) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  return (
    <div className={pageClass}>
      <PageHeader title="History" subtitle="Every test you've taken, scored and timestamped." />

      {/* Main tab switcher */}
      <div role="tablist" aria-label="History type" className="flex gap-2 mb-5 flex-wrap">
        {(['practice', 'live'] as const).map((t) => (
          <button key={t} role="tab" aria-selected={mainTab === t} onClick={() => setMainTab(t)} className={pillClass(mainTab === t)}>
            {t === 'practice' ? 'Practice History' : 'Live Exams'}
          </button>
        ))}
      </div>

      {/* Live Exams tab */}
      {mainTab === 'live' && (
        <div>
          {liveLoading ? (
            <div role="status" aria-label="Loading" className="flex flex-col gap-2.5">
              {[0, 1].map((i) => <div key={i} className="h-[76px] rounded-2xl bg-sunken" />)}
            </div>
          ) : liveError ? (
            <div role="alert" className={cn(surfaceClass, 'px-6 py-7 text-center')}>
              <p className="text-sm text-danger mt-0 mb-3.5">Couldn't load your live exam results.</p>
              <button onClick={() => refetchLive()} className="h-9 px-4 rounded-full border border-border-strong bg-white text-[13px] font-semibold cursor-pointer">Try again</button>
            </div>
          ) : liveResults.length === 0 ? (
            <EmptyState
              title="No live exam results yet"
              className="py-11"
              titleClassName="text-[22px] text-ink/[.72]"
              action={<button onClick={() => navigate('/student/live-exam')} className="h-[38px] px-[18px] rounded-full bg-accent-text text-white text-[13.5px] font-semibold cursor-pointer">Join a live exam</button>}
            >
              Results appear here once your teacher releases them.
            </EmptyState>
          ) : (
            <div className="flex flex-col gap-2.5">
              {liveResults.map((r: LiveExamResult) => (
                <LiveResultCard key={r.participantId} result={r} onOpen={(examId) => navigate(`/student/results/${examId}`)} />
              ))}
            </div>
          )}
        </div>
      )}

      {mainTab !== 'practice' ? null : <>

      {/* Trend cards: best score full width on phones, then the two trends
          stacked — a chart at half a phone's width shrinks its labels past legibility. */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 sm:gap-4 mb-5 sm:mb-7">
        <div className={cn(surfaceClass, 'px-[18px] py-4 sm:px-[22px] sm:py-5')}>
          <div className={cn(kickerClass, 'text-[10px] sm:text-[11px] mb-0.5 sm:mb-1')}>Best score</div>
          <div className="font-display font-semibold text-[38px] sm:text-[46px] leading-none text-green-dark">{bestScore ?? NO_SCORE}</div>
          <div className="text-[11px] sm:text-xs text-muted mt-1 sm:mt-1.5">out of 800</div>
        </div>
        <div className={cn(surfaceClass, 'px-4 py-3.5 sm:px-[22px] sm:py-5')}>
          <div className={cn(kickerClass, 'text-[10px] sm:text-[11px] mb-1.5 sm:mb-2')}>
            <span className="sm:hidden">R&W trend</span><span className="hidden sm:inline">Reading & Writing trend</span>
          </div>
          <SectionTrend points={rwPoints} label="Reading & Writing" color={TREND_COLORS.english} isMobile={isMobile} />
        </div>
        <div className={cn(surfaceClass, 'px-4 py-3.5 sm:px-[22px] sm:py-5')}>
          <div className={cn(kickerClass, 'text-[10px] sm:text-[11px] mb-1.5 sm:mb-2')}>Math trend</div>
          <SectionTrend points={mathPoints} label="Math" color={TREND_COLORS.math} isMobile={isMobile} />
        </div>
      </div>

      {/* Filter chips */}
      <div className="flex gap-[9px] mb-3.5">
        {chips.map((c) => (
          <button key={c.value} onClick={() => setFilter(c.value)} className={pillClass(filter === c.value, 'px-3.5 py-[7px] text-[13px]')}>
            {c.label}
          </button>
        ))}
      </div>

      {/* List */}
      {isLoading ? (
        <div className="text-muted text-sm">Loading…</div>
      ) : shown.length === 0 ? (
        <NoteCard className="py-12">No completed tests yet.</NoteCard>
      ) : isMobile ? (
        /* Mobile: card list */
        <div className="flex flex-col gap-2.5">
          {shown.map((e) => {
            const score = formatExamScore(e.scaledScore, e.score, e.totalQuestions);
            const accuracy = e.score !== null ? Math.round((e.score / e.totalQuestions) * 100) : null;
            const kind = kindOf(e);
            return (
              <div
                key={e.id}
                onClick={() => navigate(`/student/results/${e.id}`)}
                className={cn(surfaceClass, 'px-4 py-3.5 cursor-pointer flex items-center gap-3 hover:bg-[#FBFAF8]')}
              >
                <span className={cn('w-2 h-2 rounded-full shrink-0', kind.dot)} />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold truncate">{e.setTitle ?? e.label ?? 'Practice'}</div>
                  <div className="text-xs text-subtle mt-0.5">{kind.label} · {dateOf(e.startedAt)}</div>
                </div>
                <div className="text-right shrink-0">
                  <div className="font-display font-semibold text-[22px] leading-none" style={{ color: scoreColor(e.scaledScore, SECTION_MAX) }}>{score}</div>
                  <div className="text-xs text-subtle mt-0.5">{accuracy !== null ? accuracy + '%' : '—'}</div>
                </div>
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-ink/25 shrink-0">
                  <polyline points="9 18 15 12 9 6"/>
                </svg>
              </div>
            );
          })}
        </div>
      ) : (
        /* Desktop: table */
        <div className={cn(surfaceClass, 'overflow-hidden')}>
          <div className="grid grid-cols-[1.4fr_1fr_1fr_1fr_1fr] gap-3 px-[22px] py-3.5 border-b border-border-soft">
            {['Test', 'Date', 'Subject', 'Score', 'Accuracy'].map((c, i) => (
              <span key={c} className={cn('text-[11px] font-bold tracking-[0.07em] uppercase text-muted', i >= 3 ? 'text-right' : 'text-left')}>{c}</span>
            ))}
          </div>
          {shown.map((e) => {
            const score = formatExamScore(e.scaledScore, e.score, e.totalQuestions);
            const accuracy = e.score !== null ? Math.round((e.score / e.totalQuestions) * 100) : null;
            const kind = kindOf(e);
            return (
              <div
                key={e.id}
                onClick={() => navigate(`/student/results/${e.id}`)}
                className="grid grid-cols-[1.4fr_1fr_1fr_1fr_1fr] gap-3 px-[22px] py-4 border-b border-sunken last:border-b-0 items-center cursor-pointer hover:bg-[#FBFAF8]"
              >
                <div className="flex items-center gap-[11px]">
                  <span className={cn('w-2 h-2 rounded-full shrink-0', kind.dot)} />
                  <span className="text-[14.5px] font-semibold">{e.setTitle ?? e.label ?? 'Practice'}</span>
                </div>
                <span className="text-[13.5px] text-ink/60">{dateOf(e.startedAt)}</span>
                <span className="text-[13px] text-ink/60">{kind.label}</span>
                <span className="font-display font-semibold text-[22px] text-right" style={{ color: scoreColor(e.scaledScore, SECTION_MAX) }}>{score}</span>
                <span className="text-sm font-semibold text-right text-body">{accuracy !== null ? accuracy + '%' : '—'}</span>
              </div>
            );
          })}
        </div>
      )}
      </>}
    </div>
  );
}

/**
 * One section's score history in a compact trend card: the latest score, the
 * change since the first, and a sparkline.
 *
 * Not `TrendChart`: that draws on a fixed 640-unit canvas for full-width panels
 * (Progress), and at a third of the page its axis labels shrink past legibility.
 * Declared at module scope — the sparkline this replaces lived inside `Results`,
 * so it was a new component type every render and remounted each time.
 */
function SectionTrend({
  points, color, isMobile,
}: {
  points: { at: string; value: number | null }[];
  label: string;
  color: string;
  isMobile: boolean;
}) {
  const values = points.map((p) => p.value).filter((v): v is number => v !== null);
  const latest = values[values.length - 1];

  // One score is still worth showing: a blank card read as "nothing recorded"
  // when the student had in fact been scored once.
  if (values.length < 2) {
    return (
      <div className="h-[70px] sm:h-[84px] flex flex-col justify-center gap-1">
        {values.length === 1 && (
          <div className="font-display font-semibold text-2xl sm:text-[30px] leading-none" style={{ color }}>{latest}</div>
        )}
        <div className="text-xs text-muted leading-[1.35]">
          {values.length === 1 ? 'One scored test · take another to see a trend' : 'No scored tests yet'}
        </div>
      </div>
    );
  }

  const change = latest - values[0];
  const w = 280, ht = isMobile ? 44 : 52, pad = 5;
  const lo = Math.min(...values) - 15, hi = Math.max(...values) + 15;
  const span = Math.max(1, hi - lo);
  const step = (w - pad * 2) / (values.length - 1);
  const pts = values.map((v, i) => [pad + i * step, ht - pad - ((v - lo) / span) * (ht - pad * 2)] as const);
  const line = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');
  const area = `${line} L${pts[pts.length - 1][0].toFixed(1)} ${ht} L${pts[0][0].toFixed(1)} ${ht} Z`;

  return (
    <div>
      <div className="flex items-baseline gap-2 mb-1.5">
        <span className="font-display font-semibold text-2xl sm:text-[28px] leading-none" style={{ color }}>{latest}</span>
        <span className={cn('text-xs font-semibold', change > 0 ? 'text-green-dark' : change < 0 ? 'text-danger' : 'text-muted')}>
          {change > 0 ? `+${change}` : change < 0 ? `−${Math.abs(change)}` : '±0'}
        </span>
        <span className="text-xs text-muted">over {values.length} tests</span>
      </div>
      <svg viewBox={`0 0 ${w} ${ht}`} preserveAspectRatio="none" className="w-full block" style={{ height: ht }} role="img"
        aria-label={`From ${values[0]} to ${latest} over ${values.length} tests`}>
        <path d={area} fill={color} opacity={0.08} />
        <path d={line} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      </svg>
    </div>
  );
}
