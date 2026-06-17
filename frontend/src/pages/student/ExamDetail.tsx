import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { getExamResults } from '../../api/student';

function scoreColor(v: number) {
  return v >= 680 ? '#1A6B3C' : v >= 620 ? '#2E7D5A' : v >= 560 ? '#B8893E' : '#C47A1B';
}

const CARD: React.CSSProperties = { background: '#fff', border: '1px solid #E7E4DE', borderRadius: 16, boxShadow: '0 1px 3px rgba(11,11,14,0.05)' };

export default function ExamDetail() {
  const { examId } = useParams<{ examId: string }>();
  const navigate = useNavigate();
  const [reviewOpen, setReviewOpen] = useState<Record<number, boolean>>({});

  const { data, isLoading, error } = useQuery({
    queryKey: ['student', 'exam-results', examId],
    queryFn: () => getExamResults(examId!),
    enabled: !!examId,
  });

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
  const score800 = exam.score !== null ? Math.round(200 + (exam.score / exam.totalQuestions) * 600) : 0;
  const accuracy = exam.score !== null ? Math.round((exam.score / exam.totalQuestions) * 100) : 0;
  const correct = results.filter((r) => r.isCorrect).length;
  const wrong = results.filter((r) => r.isCorrect === false).length;
  const skipped = results.filter((r) => r.isCorrect === null).length;
  const headlineColor = scoreColor(score800);

  // Topic breakdown
  const topics: Record<string, { ok: number; n: number }> = {};
  results.forEach((r) => {
    const t = 'Question';
    if (!topics[t]) topics[t] = { ok: 0, n: 0 };
    topics[t].n++;
    if (r.isCorrect) topics[t].ok++;
  });

  const toggleReview = (i: number) => setReviewOpen((p) => ({ ...p, [i]: !p[i] }));

  return (
    <div className="screen-fade" style={{ padding: '36px 48px 64px' }}>
      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#E2562B', marginBottom: 6 }}>
        Score report · {set?.subject === 'math' ? 'Math' : 'Reading & Writing'}
      </div>
      <h1 style={{ fontFamily: "'Instrument Serif', serif", fontSize: 40, margin: '0 0 24px', letterSpacing: '-0.02em' }}>Here's how you did</h1>

      {/* Hero */}
      <div className="pop" style={{ background: '#0B0B0E', borderRadius: 18, padding: '32px 36px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 36, marginBottom: 22, position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', left: -60, bottom: -80, width: 240, height: 240, borderRadius: 9999, background: 'radial-gradient(circle, rgba(226,86,43,0.16), transparent 70%)' }} />
        <div style={{ position: 'relative' }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.4)' }}>Section score</div>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 14, marginTop: 4, whiteSpace: 'nowrap' }}>
            <div style={{ fontFamily: "'Instrument Serif', serif", fontSize: 88, lineHeight: 0.95, letterSpacing: '-0.03em', color: headlineColor }}>{score800}</div>
            <div style={{ fontFamily: "'Instrument Serif', serif", fontSize: 30, color: 'rgba(255,255,255,0.35)', marginBottom: 10 }}>/ 800</div>
          </div>
          <div style={{ fontSize: 13, marginTop: 8, color: 'rgba(255,255,255,0.5)' }}>{correct} of {results.length} correct</div>
        </div>
        <div style={{ position: 'relative', display: 'flex', gap: 40 }}>
          {[{ label: 'Accuracy', value: accuracy + '%' }, { label: 'Correct', value: String(correct) }, { label: 'Wrong', value: String(wrong) }, { label: 'Skipped', value: String(skipped) }].map(({ label, value }) => (
            <div key={label}>
              <div style={{ fontSize: 12.5, fontWeight: 600, color: 'rgba(255,255,255,0.6)', marginBottom: 4 }}>{label}</div>
              <div style={{ fontFamily: "'Instrument Serif', serif", fontSize: 44, lineHeight: 1, color: '#fff' }}>{value}</div>
            </div>
          ))}
        </div>
      </div>

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
        <span style={{ fontSize: 12.5, color: 'rgba(11,11,14,0.45)' }}>Tap a question to see the explanation</span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {results.map((r, i) => {
          const open = reviewOpen[i];
          const ok = r.isCorrect === true;
          const opts = [
            { key: 'a', text: r.optionA },
            { key: 'b', text: r.optionB },
            { key: 'c', text: r.optionC },
            { key: 'd', text: r.optionD },
          ];
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
                <span style={{ color: 'rgba(11,11,14,0.3)', fontSize: 13, transform: open ? 'rotate(90deg)' : 'none', transition: 'transform 0.2s', display: 'inline-block' }}>▸</span>
              </button>
              {open && (
                <div style={{ padding: '0 18px 18px 64px' }}>
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
                    <div style={{ background: '#F2F0EC', borderRadius: 10, padding: '12px 14px', fontSize: 13.5, lineHeight: 1.55, color: 'rgba(11,11,14,0.7)' }}>
                      <strong style={{ color: '#0B0B0E' }}>Why: </strong>{r.explanation}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: 12, marginTop: 30 }}>
        <button onClick={() => navigate('/student/results')} style={{ height: 48, padding: '0 26px', background: '#fff', color: '#0B0B0E', border: '1px solid #C8C4BC', borderRadius: 9999, fontSize: 15, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>View all results</button>
        <button onClick={() => navigate('/student/dashboard')} style={{ height: 48, padding: '0 26px', background: '#E2562B', color: '#fff', border: 'none', borderRadius: 9999, fontSize: 15, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', boxShadow: '0 2px 10px rgba(226,86,43,0.26)' }}>Back to dashboard</button>
      </div>
    </div>
  );
}
