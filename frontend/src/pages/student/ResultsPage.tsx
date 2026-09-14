import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { getAnalytics, getExams } from '@/api/student';
import { TREND_COLORS } from '@/components/common';
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

  const CARD: React.CSSProperties = { background: '#fff', border: '1px solid #E7E4DE', borderRadius: 16, boxShadow: '0 1px 3px rgba(11,11,14,0.05)' };

  return (
    <div className="screen-fade" style={{ padding: isMobile ? '20px 16px 80px' : '36px 48px 64px' }}>
      <h1 style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: isMobile ? 32 : 44, margin: '0 0 6px', letterSpacing: '-0.02em' }}>History</h1>
      <p style={{ fontSize: isMobile ? 14 : 15, color: 'rgba(11,11,14,0.64)', margin: '0 0 16px' }}>Every test you've taken, scored and timestamped.</p>

      {/* Main tab switcher */}
      <div role="tablist" aria-label="History type" style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
        {(['practice', 'live'] as const).map((t) => (
          <button key={t} role="tab" aria-selected={mainTab === t} onClick={() => setMainTab(t)} style={{ padding: '8px 18px', borderRadius: 9999, fontSize: 13.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', border: mainTab === t ? '1px solid #0B0B0E' : '1px solid #C8C4BC', background: mainTab === t ? '#0B0B0E' : '#fff', color: mainTab === t ? '#fff' : '#0B0B0E' }}>
            {t === 'practice' ? 'Practice History' : 'Live Exams'}
          </button>
        ))}
      </div>

      {/* Live Exams tab */}
      {mainTab === 'live' && (
        <div>
          {liveLoading ? (
            <div role="status" aria-label="Loading" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {[0, 1].map((i) => <div key={i} style={{ height: 76, borderRadius: 16, background: '#F2F0EC' }} />)}
            </div>
          ) : liveError ? (
            <div role="alert" style={{ ...CARD, padding: '28px 24px', textAlign: 'center' }}>
              <p style={{ fontSize: 14, color: '#C0392B', margin: '0 0 14px' }}>Couldn't load your live exam results.</p>
              <button onClick={() => refetchLive()} style={{ height: 36, padding: '0 16px', borderRadius: 9999, border: '1px solid #D8D4CC', background: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>Try again</button>
            </div>
          ) : liveResults.length === 0 ? (
            <div style={{ ...CARD, padding: '44px 24px', textAlign: 'center' }}>
              <div style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 22, color: 'rgba(11,11,14,0.72)', marginBottom: 6 }}>No live exam results yet</div>
              <p style={{ fontSize: 14, color: 'rgba(11,11,14,0.64)', margin: '0 auto 16px', maxWidth: 380, lineHeight: 1.6 }}>
                Results appear here once your teacher releases them.
              </p>
              <button onClick={() => navigate('/student/live-exam')} style={{ height: 38, padding: '0 18px', borderRadius: 9999, border: 'none', background: '#C4471F', color: '#fff', fontSize: 13.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>Join a live exam</button>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {liveResults.map((r: LiveExamResult) => (
                <LiveResultCard key={r.participantId} result={r} isMobile={isMobile} onOpen={(examId) => navigate(`/student/results/${examId}`)} />
              ))}
            </div>
          )}
        </div>
      )}

      {mainTab !== 'practice' ? null : <>

      {/* Trend cards */}
      {isMobile ? (
        /* Mobile: best score full width, sparklines side-by-side below */
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
          <div style={{ ...CARD, padding: '16px 18px', display: 'flex', alignItems: 'center', gap: 16 }}>
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(11,11,14,0.58)', marginBottom: 2 }}>Best score</div>
              <div style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 38, lineHeight: 1, color: '#1A6B3C' }}>{bestScore ?? NO_SCORE}</div>
              <div style={{ fontSize: 11, color: 'rgba(11,11,14,0.58)', marginTop: 4 }}>out of 800</div>
            </div>
          </div>
          {/* Stacked, not side by side: a chart at half a phone's width shrinks its labels past legibility. */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 10 }}>
            <div style={{ ...CARD, padding: '14px 16px' }}>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'rgba(11,11,14,0.58)', marginBottom: 6 }}>R&W trend</div>
              <SectionTrend points={rwPoints} label="Reading & Writing" color={TREND_COLORS.english} isMobile={isMobile} />
            </div>
            <div style={{ ...CARD, padding: '14px 16px' }}>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'rgba(11,11,14,0.58)', marginBottom: 6 }}>Math trend</div>
              <SectionTrend points={mathPoints} label="Math" color={TREND_COLORS.math} isMobile={isMobile} />
            </div>
          </div>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, marginBottom: 28 }}>
          <div style={{ ...CARD, padding: '20px 22px' }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(11,11,14,0.58)', marginBottom: 4 }}>Best score</div>
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 46, lineHeight: 1, color: '#1A6B3C' }}>{bestScore ?? NO_SCORE}</div>
            <div style={{ fontSize: 12, color: 'rgba(11,11,14,0.58)', marginTop: 6 }}>out of 800</div>
          </div>
          <div style={{ ...CARD, padding: '20px 22px' }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(11,11,14,0.58)', marginBottom: 8 }}>Reading & Writing trend</div>
            <SectionTrend points={rwPoints} label="Reading & Writing" color={TREND_COLORS.english} isMobile={isMobile} />
          </div>
          <div style={{ ...CARD, padding: '20px 22px' }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(11,11,14,0.58)', marginBottom: 8 }}>Math trend</div>
            <SectionTrend points={mathPoints} label="Math" color={TREND_COLORS.math} isMobile={isMobile} />
          </div>
        </div>
      )}

      {/* Filter chips */}
      <div style={{ display: 'flex', gap: 9, marginBottom: 14 }}>
        {chips.map((c) => (
          <button key={c.value} onClick={() => setFilter(c.value)} style={{ padding: '7px 14px', borderRadius: 9999, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', border: filter === c.value ? '1px solid #0B0B0E' : '1px solid #C8C4BC', background: filter === c.value ? '#0B0B0E' : '#fff', color: filter === c.value ? '#fff' : '#0B0B0E' }}>
            {c.label}
          </button>
        ))}
      </div>

      {/* List */}
      {isLoading ? (
        <div style={{ color: 'rgba(11,11,14,0.58)', fontSize: 14 }}>Loading…</div>
      ) : shown.length === 0 ? (
        <div style={{ ...CARD, padding: '48px 24px', textAlign: 'center', color: 'rgba(11,11,14,0.58)', fontSize: 14 }}>No completed tests yet.</div>
      ) : isMobile ? (
        /* Mobile: card list */
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {shown.map((e) => {
            const score = formatExamScore(e.scaledScore, e.score, e.totalQuestions);
            const accuracy = e.score !== null ? Math.round((e.score / e.totalQuestions) * 100) : null;
            const isMath = e.subject === 'math';
            const dotColor = e.type === 'individual' ? (isMath ? '#2563A8' : '#2E7D5A') : '#E2562B';
            const kindLabel = e.type === 'individual' ? (isMath ? 'Math practice' : 'R&W practice') : (isMath ? 'Mock · Math' : 'Mock · R&W');
            return (
              <div
                key={e.id}
                onClick={() => navigate(`/student/results/${e.id}`)}
                style={{ ...CARD, padding: '14px 16px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12 }}
                onPointerEnter={(el) => { if (el.pointerType !== 'mouse') return; el.currentTarget.style.background = '#FBFAF8'; }}
                onPointerLeave={(el) => (el.currentTarget.style.background = '#fff')}
              >
                <span style={{ width: 8, height: 8, borderRadius: 9999, background: dotColor, flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.setTitle ?? e.label ?? 'Practice'}</div>
                  <div style={{ fontSize: 12, color: 'rgba(11,11,14,0.64)', marginTop: 2 }}>
                    {kindLabel} · {new Date(e.startedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </div>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 22, lineHeight: 1, color: scoreColor(e.scaledScore, SECTION_MAX) }}>{score}</div>
                  <div style={{ fontSize: 12, color: 'rgba(11,11,14,0.64)', marginTop: 2 }}>{accuracy !== null ? accuracy + '%' : '—'}</div>
                </div>
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'rgba(11,11,14,0.25)', flexShrink: 0 }}>
                  <polyline points="9 18 15 12 9 6"/>
                </svg>
              </div>
            );
          })}
        </div>
      ) : (
        /* Desktop: table */
        <div style={{ ...CARD, overflow: 'hidden' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr 1fr 1fr 1fr', gap: 12, padding: '14px 22px', borderBottom: '1px solid #EEEBE5' }}>
            {['Test', 'Date', 'Subject', 'Score', 'Accuracy'].map((c, i) => (
              <span key={i} style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'rgba(11,11,14,0.58)', textAlign: i >= 3 ? 'right' : 'left' }}>{c}</span>
            ))}
          </div>
          {shown.map((e, i) => {
            const score = formatExamScore(e.scaledScore, e.score, e.totalQuestions);
            const accuracy = e.score !== null ? Math.round((e.score / e.totalQuestions) * 100) : null;
            const isMath = e.subject === 'math';
            const dotColor = e.type === 'individual' ? (isMath ? '#2563A8' : '#2E7D5A') : '#E2562B';
            const kindLabel = e.type === 'individual' ? (isMath ? 'Math practice' : 'R&W practice') : (isMath ? 'Mock · Math' : 'Mock · R&W');
            return (
              <div
                key={e.id}
                onClick={() => navigate(`/student/results/${e.id}`)}
                style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr 1fr 1fr 1fr', gap: 12, padding: '16px 22px', borderBottom: i < shown.length - 1 ? '1px solid #F2F0EC' : 'none', alignItems: 'center', cursor: 'pointer' }}
                onPointerEnter={(el) => { if (el.pointerType !== 'mouse') return; el.currentTarget.style.background = '#FBFAF8'; }}
                onPointerLeave={(el) => (el.currentTarget.style.background = 'transparent')}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
                  <span style={{ width: 8, height: 8, borderRadius: 9999, background: dotColor, flexShrink: 0 }} />
                  <span style={{ fontSize: 14.5, fontWeight: 600 }}>{e.setTitle ?? e.label ?? 'Practice'}</span>
                </div>
                <span style={{ fontSize: 13.5, color: 'rgba(11,11,14,0.6)' }}>{new Date(e.startedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                <span style={{ fontSize: 13, color: 'rgba(11,11,14,0.6)' }}>{kindLabel}</span>
                <span style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 22, textAlign: 'right', color: scoreColor(e.scaledScore, SECTION_MAX) }}>{score}</span>
                <span style={{ fontSize: 14, fontWeight: 600, textAlign: 'right', color: 'rgba(11,11,14,0.7)' }}>{accuracy !== null ? accuracy + '%' : '—'}</span>
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
      <div style={{ height: isMobile ? 70 : 84, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 4 }}>
        {values.length === 1 && (
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: isMobile ? 24 : 30, lineHeight: 1, color }}>{latest}</div>
        )}
        <div style={{ fontSize: 12, color: 'rgba(11,11,14,0.58)', lineHeight: 1.35 }}>
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
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 6 }}>
        <span style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: isMobile ? 24 : 28, lineHeight: 1, color }}>{latest}</span>
        <span style={{ fontSize: 12, fontWeight: 600, color: change > 0 ? '#1A6B3C' : change < 0 ? '#C0392B' : 'rgba(11,11,14,0.58)' }}>
          {change > 0 ? `+${change}` : change < 0 ? `−${Math.abs(change)}` : '±0'}
        </span>
        <span style={{ fontSize: 12, color: 'rgba(11,11,14,0.58)' }}>over {values.length} tests</span>
      </div>
      <svg viewBox={`0 0 ${w} ${ht}`} preserveAspectRatio="none" style={{ width: '100%', height: ht, display: 'block' }} role="img"
        aria-label={`From ${values[0]} to ${latest} over ${values.length} tests`}>
        <path d={area} fill={color} opacity={0.08} />
        <path d={line} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      </svg>
    </div>
  );
}
