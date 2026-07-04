import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '../../store/auth';
import { getExams, getMockTests, getFeedback, getAvailableSkillPassages, startExam } from '../../api/student';

function scoreColorTotal(v: number) {
  return v >= 1360 ? '#1A6B3C' : v >= 1240 ? '#2E7D5A' : v >= 1120 ? '#B8893E' : '#C47A1B';
}
function scoreColorSection(v: number) {
  return v >= 680 ? '#1A6B3C' : v >= 620 ? '#2E7D5A' : v >= 560 ? '#B8893E' : '#C47A1B';
}

export default function Dashboard() {
  const { user } = useAuthStore();
  const navigate = useNavigate();

  const { data: exams = [] } = useQuery({ queryKey: ['student', 'exams'], queryFn: getExams });
  const { data: mockTests = [] } = useQuery({ queryKey: ['student', 'mock-tests'], queryFn: getMockTests });
  const { data: feedback = [] } = useQuery({ queryKey: ['student', 'feedback'], queryFn: getFeedback });
  const { data: weakAreaPassages = [] } = useQuery({ queryKey: ['student', 'skill-passages'], queryFn: getAvailableSkillPassages });
  const [weakAreaError, setWeakAreaError] = React.useState<string | null>(null);

  const completedExams = exams.filter((e) => e.status === 'completed');
  const unreadFeedback = feedback.filter((f) => !f.isRead).length;

  const rwExams = completedExams.filter((e) => e.subject === 'english' && e.score !== null);
  const mathExams = completedExams.filter((e) => e.subject === 'math' && e.score !== null);
  const latestRW = rwExams[0];
  const latestMath = mathExams[0];

  const estRW = latestRW ? Math.round(200 + (latestRW.score! / latestRW.totalQuestions) * 600) : null;
  const estMath = latestMath ? Math.round(200 + (latestMath.score! / latestMath.totalQuestions) * 600) : null;
  const estTotal = (estRW ?? 600) + (estMath ?? 600);

  const firstName = user?.name.split(' ')[0] ?? 'there';
  const todayStr = new Date().toLocaleDateString('en-US', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const target = 1500;
  const targetGap = Math.max(0, target - estTotal);

  const recentTests = completedExams.slice(0, 4).map((e) => {
    const isMock = e.type !== 'individual';
    const isMath = e.subject === 'math';
    const pct = e.score !== null ? e.score / e.totalQuestions : 0;
    const score = Math.round(200 + pct * 600);
    const color = isMath ? scoreColorSection(score) : scoreColorSection(score);
    const iconBg = isMock ? 'rgba(226,86,43,0.10)' : isMath ? 'rgba(37,99,168,0.10)' : 'rgba(46,125,90,0.10)';
    const iconColor = isMock ? '#E2562B' : isMath ? '#2563A8' : '#2E7D5A';
    const iconChar = isMock ? 'M' : isMath ? '∑' : 'A';
    return { e, score, color, iconBg, iconColor, iconChar };
  });

  const accuracy = completedExams.length > 0
    ? Math.round(completedExams.reduce((s, e) => s + (e.score ?? 0) / e.totalQuestions, 0) / completedExams.length * 100)
    : 0;

  const btn = (label: string, style: React.CSSProperties, onClick: () => void) => (
    <button
      onClick={onClick}
      style={{ height: 40, padding: '0 18px', borderRadius: 9999, fontSize: 13.5, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: 'inherit', ...style }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.opacity = '0.85'; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.opacity = '1'; }}
    >
      {label}
    </button>
  );

  return (
    <div className="screen-fade" style={{ padding: '36px 48px 64px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 28 }}>
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(11,11,14,0.4)' }}>{todayStr}</div>
          <h1 style={{ fontFamily: "'Instrument Serif', serif", fontSize: 44, margin: '6px 0 0', letterSpacing: '-0.02em', whiteSpace: 'nowrap' }}>
            Welcome back, {firstName}
          </h1>
        </div>
        <button
          onClick={() => navigate('/student/mock-test')}
          style={{ height: 46, padding: '0 22px', background: '#E2562B', color: '#fff', border: 'none', borderRadius: 9999, fontSize: 14.5, fontWeight: 600, cursor: 'pointer', boxShadow: '0 2px 10px rgba(226,86,43,0.26)', fontFamily: 'inherit', transition: 'background 0.15s, transform 0.15s' }}
          onMouseEnter={(e) => { e.currentTarget.style.background = '#C94A22'; e.currentTarget.style.transform = 'translateY(-1px)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = '#E2562B'; e.currentTarget.style.transform = 'none'; }}
        >
          Start full mock test
        </button>
      </div>

      {/* Hero — estimated score */}
      <div style={{ background: '#0B0B0E', borderRadius: 18, padding: '32px 36px', marginBottom: 20, display: 'grid', gridTemplateColumns: 'auto 1px 1fr auto', gap: 36, alignItems: 'center', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', right: -80, top: -80, width: 260, height: 260, borderRadius: 9999, background: 'radial-gradient(circle, rgba(226,86,43,0.16), transparent 70%)' }} />

        <div style={{ position: 'relative' }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.4)' }}>Estimated SAT score</div>
          <div style={{ fontFamily: "'Instrument Serif', serif", fontSize: 88, lineHeight: 1, letterSpacing: '-0.03em', color: '#fff', marginTop: 6 }}>{estTotal}</div>
          <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', marginTop: 8 }}>
            Target <span style={{ color: '#B8893E', fontWeight: 600 }}>{target}</span> · {targetGap > 0 ? `${targetGap} to go` : 'Goal reached! 🎉'}
          </div>
        </div>

        <div style={{ width: 1, height: 120, background: 'rgba(255,255,255,0.12)' }} />

        <div style={{ display: 'flex', flexDirection: 'column', gap: 18, position: 'relative' }}>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 7 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.7)' }}>Reading &amp; Writing</span>
              <span style={{ fontFamily: "'Instrument Serif', serif", fontSize: 24, color: '#fff' }}>{estRW ?? '—'}</span>
            </div>
            <div style={{ height: 5, background: 'rgba(255,255,255,0.1)', borderRadius: 9999 }}>
              <div style={{ height: 5, width: `${((estRW ?? 600) / 800) * 100}%`, background: '#E2562B', borderRadius: 9999 }} />
            </div>
          </div>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 7 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.7)' }}>Math</span>
              <span style={{ fontFamily: "'Instrument Serif', serif", fontSize: 24, color: '#fff' }}>{estMath ?? '—'}</span>
            </div>
            <div style={{ height: 5, background: 'rgba(255,255,255,0.1)', borderRadius: 9999 }}>
              <div style={{ height: 5, width: `${((estMath ?? 600) / 800) * 100}%`, background: '#3D8C60', borderRadius: 9999 }} />
            </div>
          </div>
        </div>

        <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {btn('Practice Math', { background: 'rgba(255,255,255,0.1)', color: '#fff', border: '1px solid rgba(255,255,255,0.16)' }, () => navigate('/student/exams'))}
          {btn('Practice R&W', { background: 'rgba(255,255,255,0.1)', color: '#fff', border: '1px solid rgba(255,255,255,0.16)' }, () => navigate('/student/exams'))}
        </div>
      </div>

      {/* Stats row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 28 }}>
        {[
          { value: completedExams.length || 0, suffix: '', label: 'Tests completed', color: '#E2562B' },
          { value: accuracy, suffix: '%', label: 'Average accuracy', color: '#2E7D5A' },
          { value: unreadFeedback, suffix: '', label: 'Unread feedback', color: '#B8893E' },
        ].map(({ value, suffix, label, color }) => (
          <div key={label} style={{ background: '#fff', border: '1px solid #E7E4DE', borderRadius: 14, padding: '22px 24px', boxShadow: '0 1px 3px rgba(11,11,14,0.05)' }}>
            <div style={{ fontFamily: "'Instrument Serif', serif", fontSize: 46, lineHeight: 1, color }}>{value}{suffix}</div>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(11,11,14,0.4)', marginTop: 8 }}>{label}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 24 }}>
        {/* Recent tests */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <h3 style={{ fontSize: 17, margin: 0, fontFamily: "'Satoshi', sans-serif" }}>Recent tests</h3>
            <span onClick={() => navigate('/student/results')} style={{ fontSize: 13, color: '#E2562B', fontWeight: 600, cursor: 'pointer' }}>View all →</span>
          </div>
          {recentTests.length === 0 ? (
            <div style={{ background: '#fff', border: '1px solid #E7E4DE', borderRadius: 14, padding: '32px 24px', textAlign: 'center', color: 'rgba(11,11,14,0.4)', fontSize: 14 }}>
              No completed tests yet. Start practicing!
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {recentTests.map(({ e, score, color, iconBg, iconColor, iconChar }) => (
                <div
                  key={e.id}
                  onClick={() => navigate(`/student/results/${e.id}`)}
                  className="lift"
                  style={{ background: '#fff', border: '1px solid #E7E4DE', borderRadius: 13, padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 18, cursor: 'pointer', boxShadow: '0 1px 3px rgba(11,11,14,0.04)' }}
                  onMouseEnter={(el) => { el.currentTarget.style.boxShadow = '0 6px 20px rgba(11,11,14,0.09)'; el.currentTarget.style.borderColor = '#D8D4CC'; }}
                  onMouseLeave={(el) => { el.currentTarget.style.boxShadow = '0 1px 3px rgba(11,11,14,0.04)'; el.currentTarget.style.borderColor = '#E7E4DE'; }}
                >
                  <div style={{ width: 42, height: 42, borderRadius: 11, background: iconBg, color: iconColor, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Instrument Serif', serif", fontSize: 22, flexShrink: 0 }}>
                    {iconChar}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14.5, fontWeight: 600 }}>{e.setTitle}</div>
                    <div style={{ fontSize: 12.5, color: 'rgba(11,11,14,0.45)' }}>{e.subject === 'math' ? 'Math' : 'R&W'}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontFamily: "'Instrument Serif', serif", fontSize: 28, lineHeight: 1, color }}>{score}</div>
                    <div style={{ fontSize: 11, color: 'rgba(11,11,14,0.4)' }}>/ 800</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Quick start */}
        <div>
          <h3 style={{ fontSize: 17, margin: '0 0 14px', fontFamily: "'Satoshi', sans-serif" }}>Jump back in</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {[
              { label: 'Full length', sub: 'R&W + Math · scored /1600', title: 'Take a mock SAT', color: '#E2562B', path: '/student/mock-test' },
              { label: 'Section', sub: 'Algebra, geometry & data', title: 'Math practice', color: '#2563A8', path: '/student/exams' },
              { label: 'Section', sub: 'Grammar, vocab & comprehension', title: 'Reading & Writing', color: '#2E7D5A', path: '/student/exams' },
              { label: 'Daily review', sub: 'Words due for spaced repetition', title: 'Vocab flashcards', color: '#0D7377', path: '/student/vocab-review' },
            ].map(({ label, sub, title, color, path }) => (
              <div
                key={title}
                onClick={() => navigate(path)}
                className="lift"
                style={{ background: '#fff', border: '1px solid #E7E4DE', borderRadius: 13, padding: '18px 20px', cursor: 'pointer', boxShadow: '0 1px 3px rgba(11,11,14,0.04)' }}
                onMouseEnter={(el) => { el.currentTarget.style.boxShadow = '0 6px 20px rgba(11,11,14,0.09)'; el.currentTarget.style.borderColor = '#D8D4CC'; }}
                onMouseLeave={(el) => { el.currentTarget.style.boxShadow = '0 1px 3px rgba(11,11,14,0.04)'; el.currentTarget.style.borderColor = '#E7E4DE'; }}
              >
                <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color, marginBottom: 6 }}>{label}</div>
                <div style={{ fontSize: 15, fontWeight: 600 }}>{title}</div>
                <div style={{ fontSize: 12.5, color: 'rgba(11,11,14,0.45)', marginTop: 3 }}>{sub}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Weak-area practice — only shown when approved passages exist for this student's gap subSkills */}
      {weakAreaPassages.length > 0 && (
        <div style={{ marginTop: 28 }}>
          <h3 style={{ fontSize: 17, margin: '0 0 14px', fontFamily: "'Satoshi', sans-serif" }}>Practice your weak areas</h3>
          {weakAreaError && (
            <div style={{ background: 'rgba(192,57,43,0.06)', border: '1px solid rgba(192,57,43,0.2)', borderRadius: 10, padding: '10px 16px', marginBottom: 12, fontSize: 13, color: '#C0392B' }}>
              {weakAreaError}
            </div>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 14 }}>
            {weakAreaPassages.map((p) => (
              <div
                key={p.subSkill}
                className="lift"
                onClick={async () => {
                  setWeakAreaError(null);
                  try {
                    const { exam } = await startExam(p.setId);
                    navigate(`/student/exam/${exam.id}`);
                  } catch {
                    setWeakAreaError('Could not start practice session. Please try again.');
                  }
                }}
                style={{ background: '#fff', border: '1px solid #E7E4DE', borderRadius: 13, padding: '20px 22px', cursor: 'pointer', boxShadow: '0 1px 3px rgba(11,11,14,0.04)' }}
                onMouseEnter={(el) => { el.currentTarget.style.boxShadow = '0 6px 20px rgba(11,11,14,0.09)'; el.currentTarget.style.borderColor = '#D8D4CC'; }}
                onMouseLeave={(el) => { el.currentTarget.style.boxShadow = '0 1px 3px rgba(11,11,14,0.04)'; el.currentTarget.style.borderColor = '#E7E4DE'; }}
              >
                <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#E2562B', marginBottom: 6 }}>Targeted practice</div>
                <div style={{ fontSize: 15, fontWeight: 600, textTransform: 'capitalize' }}>{p.subSkill.replace(/_/g, ' ')}</div>
                <div style={{ fontSize: 12.5, color: 'rgba(11,11,14,0.45)', marginTop: 3 }}>AI-generated · module 2 difficulty</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
