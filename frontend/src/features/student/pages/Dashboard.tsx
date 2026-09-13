import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useAuthStore } from '@/shared/store/auth';
import { getExams, getFeedback, getAvailableSkillPassages, getAnalytics, getMistakeSummary, getProfile, startExam, startTopicExam } from '@/features/student/api/student.api';
import { weakestDomain } from '@/features/student/components/ProgressPanels';
import { useMobile } from '@/shared/hooks/useMobile';
import {
  NO_SCORE, SECTION_MAX,
  daysUntil, formatExamScore, formatScore, scoreColor,
} from '@/shared/lib/score';

export default function Dashboard() {
  const { user } = useAuthStore();
  const navigate = useNavigate();
  const isMobile = useMobile();

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

  const btn = (label: string, style: React.CSSProperties, onClick: () => void) => (
    <button
      onClick={onClick}
      style={{ height: 40, padding: '0 18px', borderRadius: 9999, fontSize: 13.5, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: 'inherit', ...style }}
      onPointerEnter={(e) => { if (e.pointerType !== 'mouse') return; (e.currentTarget as HTMLElement).style.opacity = '0.85'; }}
      onPointerLeave={(e) => { (e.currentTarget as HTMLElement).style.opacity = '1'; }}
    >
      {label}
    </button>
  );

  const pad = isMobile ? '20px 16px 80px' : '36px 48px 64px';

  return (
    <div className="screen-fade" style={{ padding: pad }}>
      {/* Header */}
      <div style={{ marginBottom: isMobile ? 20 : 28 }}>
        {!isMobile && (
          <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(11,11,14,0.58)', marginBottom: 4 }}>{todayStr}</div>
        )}
        <div style={{ display: 'flex', alignItems: isMobile ? 'flex-start' : 'flex-end', justifyContent: 'space-between', gap: 12, flexWrap: isMobile ? 'wrap' : 'nowrap' }}>
          <h1 style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: isMobile ? 32 : 44, margin: 0, letterSpacing: '-0.02em', lineHeight: 1.1 }}>
            Welcome back, {firstName}
          </h1>
          <button
            onClick={() => navigate('/student/mock-test')}
            style={{ height: isMobile ? 40 : 46, padding: '0 18px', background: '#C4471F', color: '#fff', border: 'none', borderRadius: 9999, fontSize: isMobile ? 13.5 : 14.5, fontWeight: 600, cursor: 'pointer', boxShadow: '0 2px 10px rgba(226,86,43,0.26)', fontFamily: 'inherit', flexShrink: 0 }}
          >
            {isMobile ? 'Full mock test' : 'Start full mock test'}
          </button>
        </div>
      </div>

      {/* Hero — estimated score */}
      <div style={{
        background: '#0B0B0E', borderRadius: 18, padding: isMobile ? '24px 20px' : '32px 36px', marginBottom: 16,
        position: 'relative', overflow: 'hidden',
        display: isMobile ? 'block' : 'grid',
        gridTemplateColumns: 'auto 1px 1fr auto',
        gap: 36, alignItems: 'center',
      }}>
        <div style={{ position: 'absolute', right: -80, top: -80, width: 260, height: 260, borderRadius: 9999, background: 'radial-gradient(circle, rgba(226,86,43,0.16), transparent 70%)' }} />

        {/* Score */}
        <div style={{ position: 'relative', marginBottom: isMobile ? 20 : 0 }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.5)' }}>Estimated SAT score</div>
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: isMobile ? 68 : 88, lineHeight: 1, letterSpacing: '-0.03em', color: estTotal === null ? 'rgba(255,255,255,0.5)' : '#fff', marginTop: 4 }}>{formatScore(estTotal)}</div>
          <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', marginTop: 6 }}>
            {estTotal === null ? (
              estRW !== null
                ? 'Score a Math practice test to complete your estimate'
                : estMath !== null
                  ? 'Score a Reading & Writing practice test to complete your estimate'
                  : 'Finish a practice test or full mock to see your estimated score'
            ) : target === null ? (
              <button
                onClick={() => navigate('/student/settings')}
                style={{ background: 'none', border: 'none', padding: 0, font: 'inherit', color: '#B8893E', fontWeight: 600, cursor: 'pointer', textDecoration: 'underline' }}
              >
                Set your target score
              </button>
            ) : (
              <>
                Target <span style={{ color: '#B8893E', fontWeight: 600 }}>{target}</span>
                {' · '}
                {targetGap && targetGap > 0 ? `${targetGap} to go` : 'Goal reached! 🎉'}
                {daysToTest !== null && (daysToTest >= 0
                  ? ` · ${daysToTest} ${daysToTest === 1 ? 'day' : 'days'} to test day`
                  : ' · test date has passed')}
              </>
            )}
          </div>
          {estFromPractice && (
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', marginTop: 4 }}>
              From your latest practice tests · a full mock gives a test-day estimate
            </div>
          )}
        </div>

        {/* Divider — desktop only */}
        {!isMobile && <div style={{ width: 1, height: 120, background: 'rgba(255,255,255,0.12)' }} />}

        {/* Section bars */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, position: 'relative', marginBottom: isMobile ? 20 : 0 }}>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 7 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.7)' }}>Reading &amp; Writing</span>
              <span style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 22, color: '#fff' }}>{estRW ?? NO_SCORE}</span>
            </div>
            <div style={{ height: 5, background: 'rgba(255,255,255,0.1)', borderRadius: 9999 }}>
              <div style={{ height: 5, width: `${((estRW ?? 0) / SECTION_MAX) * 100}%`, background: '#E2562B', borderRadius: 9999 }} />
            </div>
          </div>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 7 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.7)' }}>Math</span>
              <span style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 22, color: '#fff' }}>{estMath ?? NO_SCORE}</span>
            </div>
            <div style={{ height: 5, background: 'rgba(255,255,255,0.1)', borderRadius: 9999 }}>
              <div style={{ height: 5, width: `${((estMath ?? 0) / SECTION_MAX) * 100}%`, background: '#3D8C60', borderRadius: 9999 }} />
            </div>
          </div>
        </div>

        {/* Practice buttons */}
        <div style={{ position: 'relative', display: 'flex', flexDirection: isMobile ? 'row' : 'column', gap: 10 }}>
          {btn('Practice Math', { background: 'rgba(255,255,255,0.1)', color: '#fff', border: '1px solid rgba(255,255,255,0.16)' }, () => navigate('/student/exams'))}
          {btn('Practice R&W', { background: 'rgba(255,255,255,0.1)', color: '#fff', border: '1px solid rgba(255,255,255,0.16)' }, () => navigate('/student/exams'))}
        </div>
      </div>

      {/* Stats row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: isMobile ? 10 : 16, marginBottom: isMobile ? 20 : 28 }}>
        {[
          { value: completedExams.length || 0, suffix: '', label: 'Tests completed', color: '#C4471F' },
          { value: accuracy, suffix: '%', label: 'Avg accuracy', color: '#2E7D5A' },
          { value: unreadFeedback, suffix: '', label: 'Unread feedback', color: '#B8893E' },
        ].map(({ value, suffix, label, color }) => (
          <div key={label} style={{ background: '#fff', border: '1px solid #E7E4DE', borderRadius: 14, padding: isMobile ? '16px 14px' : '22px 24px', boxShadow: '0 1px 3px rgba(11,11,14,0.05)' }}>
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: isMobile ? 34 : 46, lineHeight: 1, color }}>{value}{suffix}</div>
            <div style={{ fontSize: isMobile ? 10 : 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(11,11,14,0.58)', marginTop: 6 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* Recent tests + Jump back in */}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1.4fr 1fr', gap: isMobile ? 20 : 24 }}>
        {/* Recent tests */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <h3 style={{ fontSize: 17, margin: 0, fontFamily: 'var(--font-sans)' }}>Recent tests</h3>
            <span onClick={() => navigate('/student/results')} style={{ fontSize: 13, color: '#C4471F', fontWeight: 600, cursor: 'pointer' }}>View all →</span>
          </div>
          {recentTests.length === 0 ? (
            <div style={{ background: '#fff', border: '1px solid #E7E4DE', borderRadius: 14, padding: '32px 24px', textAlign: 'center', color: 'rgba(11,11,14,0.58)', fontSize: 14 }}>
              No completed tests yet. Start practicing!
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {recentTests.map(({ e, score, color, iconBg, iconColor, iconChar }) => (
                <div
                  key={e.id}
                  onClick={() => navigate(`/student/results/${e.id}`)}
                  className="lift"
                  style={{ background: '#fff', border: '1px solid #E7E4DE', borderRadius: 13, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 14, cursor: 'pointer', boxShadow: '0 1px 3px rgba(11,11,14,0.04)' }}
                  onPointerEnter={(el) => { if (el.pointerType !== 'mouse') return; el.currentTarget.style.boxShadow = '0 6px 20px rgba(11,11,14,0.09)'; el.currentTarget.style.borderColor = '#D8D4CC'; }}
                  onPointerLeave={(el) => { el.currentTarget.style.boxShadow = '0 1px 3px rgba(11,11,14,0.04)'; el.currentTarget.style.borderColor = '#E7E4DE'; }}
                >
                  <div style={{ width: 40, height: 40, borderRadius: 11, background: iconBg, color: iconColor, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 20, flexShrink: 0 }}>
                    {iconChar}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.setTitle ?? e.label ?? 'Practice'}</div>
                    <div style={{ fontSize: 12, color: 'rgba(11,11,14,0.58)' }}>{e.subject === 'math' ? 'Math' : 'R&W'}</div>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 26, lineHeight: 1, color }}>{score}</div>
                    <div style={{ fontSize: 11, color: 'rgba(11,11,14,0.58)' }}>/ 800</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Quick start */}
        <div>
          <h3 style={{ fontSize: 17, margin: '0 0 14px', fontFamily: 'var(--font-sans)' }}>Jump back in</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {[
              { label: 'Full length', sub: 'R&W + Math · scored /1600', title: 'Take a mock SAT', color: '#C4471F', path: '/student/mock-test' },
              { label: 'Section', sub: 'Algebra, geometry & data', title: 'Math practice', color: '#2563A8', path: '/student/exams' },
              { label: 'Section', sub: 'Grammar, vocab & comprehension', title: 'Reading & Writing', color: '#2E7D5A', path: '/student/exams' },
              { label: 'Daily review', sub: 'Words due for spaced repetition', title: 'Vocab flashcards', color: '#0D7377', path: '/student/vocab-review' },
              // Always shown, unlike the conditional cards below it: a student
              // needs this the moment their teacher reads out a code, and has no
              // way to know in advance that they will.
              { label: 'In class', sub: 'Enter the code from your teacher', title: 'Join a live exam', color: '#8E44AD', path: '/student/live-exam' },
              ...(weakest
                ? [{
                    label: 'Weakest topic',
                    sub: `${weakest.accuracy}% across ${weakest.attempted} questions`,
                    title: weakest.domainLabel,
                    color: '#B8893E',
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
                    color: '#C47A1B',
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
                className="lift"
                style={{ background: '#fff', border: '1px solid #E7E4DE', borderRadius: 13, padding: '16px 18px', cursor: 'pointer', boxShadow: '0 1px 3px rgba(11,11,14,0.04)' }}
                onPointerEnter={(el) => { if (el.pointerType !== 'mouse') return; el.currentTarget.style.boxShadow = '0 6px 20px rgba(11,11,14,0.09)'; el.currentTarget.style.borderColor = '#D8D4CC'; }}
                onPointerLeave={(el) => { el.currentTarget.style.boxShadow = '0 1px 3px rgba(11,11,14,0.04)'; el.currentTarget.style.borderColor = '#E7E4DE'; }}
              >
                <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color, marginBottom: 4 }}>{label}</div>
                <div style={{ fontSize: 14.5, fontWeight: 600 }}>{title}</div>
                <div style={{ fontSize: 12, color: 'rgba(11,11,14,0.58)', marginTop: 2 }}>{sub}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Weak-area practice */}
      {weakAreaPassages.length > 0 && (
        <div style={{ marginTop: isMobile ? 20 : 28 }}>
          <h3 style={{ fontSize: 17, margin: '0 0 14px', fontFamily: 'var(--font-sans)' }}>Practice your weak areas</h3>
          {weakAreaError && (
            <div style={{ background: 'rgba(192,57,43,0.06)', border: '1px solid rgba(192,57,43,0.2)', borderRadius: 10, padding: '10px 16px', marginBottom: 12, fontSize: 13, color: '#C0392B' }}>
              {weakAreaError}
            </div>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(auto-fill, minmax(260px, 1fr))', gap: 12 }}>
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
                style={{ background: '#fff', border: '1px solid #E7E4DE', borderRadius: 13, padding: '18px 16px', cursor: 'pointer', boxShadow: '0 1px 3px rgba(11,11,14,0.04)' }}
                onPointerEnter={(el) => { if (el.pointerType !== 'mouse') return; el.currentTarget.style.boxShadow = '0 6px 20px rgba(11,11,14,0.09)'; el.currentTarget.style.borderColor = '#D8D4CC'; }}
                onPointerLeave={(el) => { el.currentTarget.style.boxShadow = '0 1px 3px rgba(11,11,14,0.04)'; el.currentTarget.style.borderColor = '#E7E4DE'; }}
              >
                <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#C4471F', marginBottom: 4 }}>Targeted</div>
                <div style={{ fontSize: 14, fontWeight: 600, textTransform: 'capitalize' }}>{p.subSkill.replace(/_/g, ' ')}</div>
                <div style={{ fontSize: 11.5, color: 'rgba(11,11,14,0.58)', marginTop: 2 }}>AI-generated · module 2</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
