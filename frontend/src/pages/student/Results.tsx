import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { getExams, getMockTests } from '../../api/student';

function scoreColor(v: number, max: number) {
  const pct = v / max;
  return pct >= 0.85 ? '#1A6B3C' : pct >= 0.775 ? '#2E7D5A' : pct >= 0.70 ? '#B8893E' : '#C47A1B';
}

type Filter = 'All' | 'individual' | 'mock_english' | 'mock_math';

export default function Results() {
  const navigate = useNavigate();
  const [filter, setFilter] = useState<Filter>('All');

  const { data: exams = [], isLoading } = useQuery({ queryKey: ['student', 'exams'], queryFn: getExams });
  const { data: mockTests = [] } = useQuery({ queryKey: ['student', 'mock-tests'], queryFn: getMockTests });

  const completed = exams.filter((e) => e.status === 'completed');
  const shown = filter === 'All' ? completed : completed.filter((e) => e.type === filter);

  const chips: { label: string; value: Filter }[] = [
    { label: 'All', value: 'All' },
    { label: 'Full Mock', value: 'mock_english' },
    { label: 'Individual', value: 'individual' },
  ];

  const bestMock = completed
    .filter((e) => e.type === 'mock_english' || e.type === 'mock_math')
    .reduce((best, e) => {
      const score = e.score ?? 0;
      return score > best ? score : best;
    }, 0);

  const rwSeries = completed.filter((e) => e.subject === 'english' && e.score !== null).map((e) => Math.round(200 + (e.score! / e.totalQuestions) * 600)).reverse();
  const mathSeries = completed.filter((e) => e.subject === 'math' && e.score !== null).map((e) => Math.round(200 + (e.score! / e.totalQuestions) * 600)).reverse();

  const Spark = ({ series, color }: { series: number[]; color: string }) => {
    if (series.length < 2) return <div style={{ height: 70, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(11,11,14,0.3)', fontSize: 13 }}>Not enough data</div>;
    const w = 280, ht = 70, pad = 8;
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
    <div className="screen-fade" style={{ padding: '36px 48px 64px' }}>
      <h1 style={{ fontFamily: "'Instrument Serif', serif", fontSize: 44, margin: '0 0 6px', letterSpacing: '-0.02em' }}>History</h1>
      <p style={{ fontSize: 15, color: 'rgba(11,11,14,0.55)', margin: '0 0 26px' }}>Every test you've taken, scored and timestamped.</p>

      {/* Trend cards */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, marginBottom: 28 }}>
        <div style={{ ...CARD, padding: '20px 22px' }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(11,11,14,0.4)', marginBottom: 4 }}>Best score</div>
          <div style={{ fontFamily: "'Instrument Serif', serif", fontSize: 46, lineHeight: 1, color: '#1A6B3C' }}>{bestMock || completed.length > 0 ? (completed[0]?.score !== null ? Math.round(200 + (completed[0]!.score! / completed[0]!.totalQuestions) * 600) : '—') : '—'}</div>
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

      {/* Filter chips */}
      <div style={{ display: 'flex', gap: 9, marginBottom: 16 }}>
        {chips.map((c) => (
          <button key={c.value} onClick={() => setFilter(c.value)} style={{ padding: '8px 16px', borderRadius: 9999, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', border: filter === c.value ? '1px solid #0B0B0E' : '1px solid #C8C4BC', background: filter === c.value ? '#0B0B0E' : '#fff', color: filter === c.value ? '#fff' : '#0B0B0E' }}>
            {c.label}
          </button>
        ))}
      </div>

      {/* Table */}
      {isLoading ? (
        <div style={{ color: 'rgba(11,11,14,0.4)', fontSize: 14 }}>Loading…</div>
      ) : shown.length === 0 ? (
        <div style={{ ...CARD, padding: '48px 24px', textAlign: 'center', color: 'rgba(11,11,14,0.4)', fontSize: 14 }}>No completed tests yet.</div>
      ) : (
        <div style={{ ...CARD, overflow: 'hidden' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr 1fr 1fr 1fr', gap: 12, padding: '14px 22px', borderBottom: '1px solid #EEEBE5' }}>
            {['Test', 'Date', 'Subject', 'Score', 'Accuracy'].map((c, i) => (
              <span key={i} style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'rgba(11,11,14,0.4)', textAlign: i >= 3 ? 'right' : 'left' }}>{c}</span>
            ))}
          </div>
          {shown.map((e, i) => {
            const score = e.score !== null ? Math.round(200 + (e.score / e.totalQuestions) * 600) : null;
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
                <span style={{ fontFamily: "'Instrument Serif', serif", fontSize: 22, textAlign: 'right', color: score !== null ? scoreColor(score, 800) : 'rgba(11,11,14,0.2)' }}>{score ?? '—'}</span>
                <span style={{ fontSize: 14, fontWeight: 600, textAlign: 'right', color: 'rgba(11,11,14,0.7)' }}>{accuracy !== null ? accuracy + '%' : '—'}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
