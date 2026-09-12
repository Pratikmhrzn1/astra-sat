import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { getExams, getMockTests } from '@/features/student/api/student.api';
import { getLiveExamResults, type LiveExamResult } from '@/features/live-exam/api/live-exam.api';
import { useMobile } from '@/shared/hooks/useMobile';
import { NO_SCORE, SECTION_MAX, formatExamScore, scoreColor } from '@/shared/lib/score';

type Filter = 'All' | 'individual' | 'mock_english' | 'mock_math';

export default function Results() {
  const navigate = useNavigate();
  const location = useLocation();
  const [filter, setFilter] = useState<Filter>('All');
  const isMobile = useMobile();

  const searchParams = new URLSearchParams(location.search);
  const defaultTab = searchParams.get('tab') === 'live' ? 'live' : 'practice';
  const [mainTab, setMainTab] = useState<'practice' | 'live'>(defaultTab);

  const [liveResults, setLiveResults] = useState<LiveExamResult[]>([]);
  const [liveLoading, setLiveLoading] = useState(false);
  useEffect(() => {
    if (mainTab === 'live') {
      setLiveLoading(true);
      getLiveExamResults()
        .then(setLiveResults)
        .finally(() => setLiveLoading(false));
    }
  }, [mainTab]);

  const { data: exams = [], isLoading } = useQuery({ queryKey: ['student', 'exams'], queryFn: getExams });
  useQuery({ queryKey: ['student', 'mock-tests'], queryFn: getMockTests });

  const completed = exams.filter((e) => e.status === 'completed');
  const shown = filter === 'All' ? completed : completed.filter((e) => e.type === filter);

  const chips: { label: string; value: Filter }[] = [
    { label: 'All', value: 'All' },
    { label: 'Full Mock', value: 'mock_english' },
    { label: 'Individual', value: 'individual' },
  ];

  // Trends read the persisted scaled score, so an exam too short to scale is
  // left out of the series rather than contributing a number invented here.
  const scaledOf = (subject: 'english' | 'math') =>
    completed
      .filter((e) => e.subject === subject && e.scaledScore !== null)
      .map((e) => e.scaledScore!)
      .reverse();

  const bestScore = completed.reduce<number | null>(
    (best, e) =>
      e.scaledScore !== null && (best === null || e.scaledScore > best) ? e.scaledScore : best,
    null,
  );

  const rwSeries = scaledOf('english');
  const mathSeries = scaledOf('math');

  const Spark = ({ series, color }: { series: number[]; color: string }) => {
    if (series.length < 2) return <div style={{ height: 60, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(11,11,14,0.3)', fontSize: 12 }}>Not enough data</div>;
    const w = 280, ht = isMobile ? 50 : 70, pad = 8;
    const min = Math.min(...series) - 15, max = Math.max(...series) + 15;
    const rng = Math.max(1, max - min);
    const step = (w - pad * 2) / (series.length - 1);
    const pts = series.map((v, i) => [pad + i * step, ht - pad - ((v - min) / rng) * (ht - pad * 2)] as [number, number]);
    const d = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
    const area = d + ' L ' + pts[pts.length - 1][0].toFixed(1) + ' ' + ht + ' L ' + pts[0][0].toFixed(1) + ' ' + ht + ' Z';
    return (
      <svg viewBox={`0 0 ${w} ${ht}`} preserveAspectRatio="none" style={{ width: '100%', height: ht, display: 'block' }}>
        <path d={area} fill={color} opacity={0.09} />
        <path d={d} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
        {pts.map((p, i) => <circle key={i} cx={p[0]} cy={p[1]} r={i === pts.length - 1 ? 4 : 2.6} fill={i === pts.length - 1 ? color : '#fff'} stroke={color} strokeWidth={1.6} />)}
      </svg>
    );
  };

  const CARD: React.CSSProperties = { background: '#fff', border: '1px solid #E7E4DE', borderRadius: 16, boxShadow: '0 1px 3px rgba(11,11,14,0.05)' };

  return (
    <div className="screen-fade" style={{ padding: isMobile ? '20px 16px 80px' : '36px 48px 64px' }}>
      <h1 style={{ fontFamily: "'Instrument Serif', serif", fontSize: isMobile ? 32 : 44, margin: '0 0 6px', letterSpacing: '-0.02em' }}>History</h1>
      <p style={{ fontSize: isMobile ? 14 : 15, color: 'rgba(11,11,14,0.55)', margin: '0 0 16px' }}>Every test you've taken, scored and timestamped.</p>

      {/* Main tab switcher */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        {(['practice', 'live'] as const).map((t) => (
          <button key={t} onClick={() => setMainTab(t)} style={{ padding: '8px 18px', borderRadius: 9999, fontSize: 13.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', border: mainTab === t ? '1px solid #0B0B0E' : '1px solid #C8C4BC', background: mainTab === t ? '#0B0B0E' : '#fff', color: mainTab === t ? '#fff' : '#0B0B0E' }}>
            {t === 'practice' ? 'Practice History' : 'Live Exams'}
          </button>
        ))}
      </div>

      {/* Live Exams tab */}
      {mainTab === 'live' && (
        <div>
          {liveLoading ? (
            <div style={{ color: 'rgba(11,11,14,0.4)', fontSize: 14 }}>Loading…</div>
          ) : liveResults.length === 0 ? (
            <div style={{ ...CARD, padding: '48px 24px', textAlign: 'center', color: 'rgba(11,11,14,0.4)', fontSize: 14 }}>
              No live exam results yet. Results appear here once your teacher releases them.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {liveResults.map((r) => (
                <div key={r.participantId} style={{ ...CARD, padding: '16px 20px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                    <div>
                      <p style={{ fontWeight: 700, fontSize: 15, margin: 0 }}>{r.sessionTitle}</p>
                      <p style={{ fontSize: 13, color: 'rgba(11,11,14,0.5)', margin: '2px 0 0' }}>
                        {r.startedAt ? new Date(r.startedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Date unknown'}
                      </p>
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      {r.englishExamId && (
                        <button onClick={() => navigate(`/student/results/${r.englishExamId}`)} style={{ fontSize: 13, fontWeight: 600, padding: '7px 14px', borderRadius: 9999, border: '1px solid #C8C4BC', background: '#fff', cursor: 'pointer', fontFamily: 'inherit' }}>
                          R&W Results
                        </button>
                      )}
                      {r.mathExamId && (
                        <button onClick={() => navigate(`/student/results/${r.mathExamId}`)} style={{ fontSize: 13, fontWeight: 600, padding: '7px 14px', borderRadius: 9999, border: '1px solid #C8C4BC', background: '#fff', cursor: 'pointer', fontFamily: 'inherit' }}>
                          Math Results
                        </button>
                      )}
                    </div>
                  </div>
                  {r.globalFeedback && (
                    <div style={{ marginTop: 12, borderTop: '1px solid #F0ECE4', paddingTop: 12 }}>
                      <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'rgba(11,11,14,0.4)', margin: '0 0 4px' }}>Teacher Feedback</p>
                      <p style={{ fontSize: 14, color: '#0B0B0E', margin: 0, whiteSpace: 'pre-line' }}>{r.globalFeedback}</p>
                    </div>
                  )}
                </div>
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
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(11,11,14,0.4)', marginBottom: 2 }}>Best score</div>
              <div style={{ fontFamily: "'Instrument Serif', serif", fontSize: 38, lineHeight: 1, color: '#1A6B3C' }}>{bestScore ?? NO_SCORE}</div>
              <div style={{ fontSize: 11, color: 'rgba(11,11,14,0.4)', marginTop: 4 }}>out of 800</div>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div style={{ ...CARD, padding: '14px 16px' }}>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'rgba(11,11,14,0.4)', marginBottom: 6 }}>R&W trend</div>
              <Spark series={rwSeries} color="#2E7D5A" />
            </div>
            <div style={{ ...CARD, padding: '14px 16px' }}>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'rgba(11,11,14,0.4)', marginBottom: 6 }}>Math trend</div>
              <Spark series={mathSeries} color="#2563A8" />
            </div>
          </div>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, marginBottom: 28 }}>
          <div style={{ ...CARD, padding: '20px 22px' }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(11,11,14,0.4)', marginBottom: 4 }}>Best score</div>
            <div style={{ fontFamily: "'Instrument Serif', serif", fontSize: 46, lineHeight: 1, color: '#1A6B3C' }}>{bestScore ?? NO_SCORE}</div>
            <div style={{ fontSize: 12, color: 'rgba(11,11,14,0.4)', marginTop: 6 }}>out of 800</div>
          </div>
          <div style={{ ...CARD, padding: '20px 22px' }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(11,11,14,0.4)', marginBottom: 8 }}>Reading & Writing trend</div>
            <Spark series={rwSeries} color="#2E7D5A" />
          </div>
          <div style={{ ...CARD, padding: '20px 22px' }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(11,11,14,0.4)', marginBottom: 8 }}>Math trend</div>
            <Spark series={mathSeries} color="#2563A8" />
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
        <div style={{ color: 'rgba(11,11,14,0.4)', fontSize: 14 }}>Loading…</div>
      ) : shown.length === 0 ? (
        <div style={{ ...CARD, padding: '48px 24px', textAlign: 'center', color: 'rgba(11,11,14,0.4)', fontSize: 14 }}>No completed tests yet.</div>
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
                onMouseEnter={(el) => (el.currentTarget.style.background = '#FBFAF8')}
                onMouseLeave={(el) => (el.currentTarget.style.background = '#fff')}
              >
                <span style={{ width: 8, height: 8, borderRadius: 9999, background: dotColor, flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.setTitle}</div>
                  <div style={{ fontSize: 12, color: 'rgba(11,11,14,0.5)', marginTop: 2 }}>
                    {kindLabel} · {new Date(e.startedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </div>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div style={{ fontFamily: "'Instrument Serif', serif", fontSize: 22, lineHeight: 1, color: scoreColor(e.scaledScore, SECTION_MAX) }}>{score}</div>
                  <div style={{ fontSize: 12, color: 'rgba(11,11,14,0.5)', marginTop: 2 }}>{accuracy !== null ? accuracy + '%' : '—'}</div>
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
              <span key={i} style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'rgba(11,11,14,0.4)', textAlign: i >= 3 ? 'right' : 'left' }}>{c}</span>
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
                onMouseEnter={(el) => (el.currentTarget.style.background = '#FBFAF8')}
                onMouseLeave={(el) => (el.currentTarget.style.background = 'transparent')}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
                  <span style={{ width: 8, height: 8, borderRadius: 9999, background: dotColor, flexShrink: 0 }} />
                  <span style={{ fontSize: 14.5, fontWeight: 600 }}>{e.setTitle}</span>
                </div>
                <span style={{ fontSize: 13.5, color: 'rgba(11,11,14,0.6)' }}>{new Date(e.startedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                <span style={{ fontSize: 13, color: 'rgba(11,11,14,0.6)' }}>{kindLabel}</span>
                <span style={{ fontFamily: "'Instrument Serif', serif", fontSize: 22, textAlign: 'right', color: scoreColor(e.scaledScore, SECTION_MAX) }}>{score}</span>
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
