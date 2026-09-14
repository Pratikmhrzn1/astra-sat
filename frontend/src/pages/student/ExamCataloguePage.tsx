import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import { getAnalytics, getQuestionSets, startExam, startTopicExam } from '@/api/student';
import { getApiError } from '@/api/http';
import { getAllExamProgress, clearExamProgress } from '@/lib/offline';
import { useMobile } from '@/hooks/useMobile';
import { getSkills, skillsQueryKey } from '@/api/skills';

/** Cycled across the domains of a subject, so the cards stay visually distinct. */
const DOMAIN_COLORS = ['#2E7D5A', '#2563A8', '#B8893E', '#E2562B'];

const CARD_STYLE: React.CSSProperties = {
  background: '#fff', border: '1px solid #E7E4DE', borderRadius: 16, boxShadow: '0 1px 3px rgba(11,11,14,0.05)',
};

export default function ExamCatalogue() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const subject = (searchParams.get('subject') as 'math' | 'english') ?? 'math';
  const isMobile = useMobile();

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
  const accentColor = isMath ? '#2563A8' : '#2E7D5A';
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
    color: DOMAIN_COLORS[i % DOMAIN_COLORS.length],
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
    <div className="screen-fade" style={{ padding: isMobile ? '20px 16px 80px' : '40px 48px 64px' }}>
      {/* Resume banner */}
      {resumeItems.length > 0 && (
        <div style={{ background: '#FFFBF0', border: '1px solid rgba(184,137,62,0.35)', borderRadius: 14, padding: '14px 16px', marginBottom: 20 }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#B8893E', marginBottom: 10 }}>
            Unfinished test
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {resumeItems.map((item) => (
              <div key={item.examId} style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <span style={{ flex: 1, fontSize: 14, fontWeight: 600, color: '#0B0B0E', minWidth: 120 }}>
                  {item.examTitle ?? 'Practice test'}
                  <span style={{ fontWeight: 400, fontSize: 12, color: 'rgba(11,11,14,0.58)', marginLeft: 8 }}>
                    saved {new Date(item.lastSaved).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </span>
                </span>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    onClick={() => navigate(`/student/exams/${item.examId}`)}
                    style={{ height: 34, padding: '0 16px', background: '#0B0B0E', color: '#fff', border: 'none', borderRadius: 9999, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}
                  >Continue →</button>
                  <button
                    onClick={() => dismissResume(item.examId)}
                    style={{ height: 34, padding: '0 14px', background: 'transparent', color: 'rgba(11,11,14,0.58)', border: '1px solid #D8D4CC', borderRadius: 9999, fontSize: 13, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit' }}
                  >Dismiss</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Subject switcher */}
      <div style={{ display: isMobile ? 'grid' : 'inline-flex', gridTemplateColumns: isMobile ? '1fr 1fr' : undefined, gap: 4, background: '#F0EDE7', borderRadius: 12, padding: 4, marginBottom: 22 }}>
        {([['math', 'Math'], ['english', isMobile ? 'R & W' : 'Reading & Writing']] as const).map(([s, label]) => (
          <button
            key={s}
            onClick={() => switchSubject(s)}
            style={{
              padding: isMobile ? '9px 12px' : '8px 18px', borderRadius: 9, fontSize: isMobile ? 13 : 13.5, fontWeight: 600, cursor: 'pointer',
              border: 'none', fontFamily: 'inherit', transition: 'background 0.15s, color 0.15s', textAlign: 'center',
              background: subject === s ? '#fff' : 'transparent',
              color: subject === s ? '#0B0B0E' : 'rgba(11,11,14,0.58)',
              boxShadow: subject === s ? '0 1px 4px rgba(11,11,14,0.1)' : 'none',
            }}
          >{label}</button>
        ))}
      </div>

      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#C4471F' }}>{kicker}</div>
      <h1 style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: isMobile ? 36 : 56, margin: '6px 0 0', letterSpacing: '-0.02em' }}>{title}</h1>
      <p style={{ maxWidth: 640, fontSize: isMobile ? 14 : 16, lineHeight: 1.65, color: 'rgba(11,11,14,0.6)', margin: '10px 0 22px' }}>{blurb}</p>

      {/* Meta stats */}
      <div style={{ display: 'flex', gap: isMobile ? 10 : 14, marginBottom: isMobile ? 20 : 28, flexWrap: 'wrap' }}>
        {[['—', 'Questions per set'], [timerEnabled ? '20m' : '∞', 'Time limit'], ['800', 'Score scale']].map(([v, l], i) => (
          <div key={i} style={{ ...CARD_STYLE, padding: isMobile ? '14px 16px' : '18px 26px', minWidth: isMobile ? 88 : 130, flex: isMobile ? '1' : undefined, borderRadius: 14 }}>
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: isMobile ? 28 : 38, lineHeight: 1, color: '#0B0B0E' }}>{v}</div>
            <div style={{ fontSize: isMobile ? 9.5 : 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(11,11,14,0.58)', marginTop: 5 }}>{l}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1.5fr 1fr', gap: isMobile ? 14 : 20, marginBottom: isMobile ? 20 : 28 }}>
        <div>
          {/* Practise by topic. The counts come from the same endpoint, so a
              domain nobody has authored questions for is disabled rather than
              offered and then failing at assembly. */}
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
            <h3 style={{ fontSize: 15, margin: 0 }}>Practise by topic</h3>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              {(['any', 'easy', 'medium', 'hard'] as const).map((level) => (
                <button
                  key={level}
                  onClick={() => setTopicDifficulty(level)}
                  style={{ padding: '3px 10px', fontSize: 11.5, fontWeight: 600, borderRadius: 9999, border: topicDifficulty === level ? 'none' : '1px solid #E7E4DE', background: topicDifficulty === level ? '#0B0B0E' : '#F2F0EC', color: topicDifficulty === level ? '#fff' : '#6F6B64', cursor: 'pointer', fontFamily: 'inherit', textTransform: 'capitalize' }}
                >{level}</button>
              ))}
              <select
                value={topicCount}
                onChange={(e) => setTopicCount(Number(e.target.value))}
                style={{ height: 26, padding: '0 6px', border: '1px solid #E7E4DE', borderRadius: 8, background: '#fff', fontSize: 11.5, fontFamily: 'inherit', cursor: 'pointer' }}
              >
                {[5, 10, 15, 20].map((n) => <option key={n} value={n}>{n} Qs</option>)}
              </select>
            </div>
          </div>

          {topicError && (
            <div style={{ background: 'rgba(192,57,43,0.06)', border: '1px solid rgba(192,57,43,0.2)', borderRadius: 10, padding: '9px 14px', marginBottom: 10, fontSize: 13, color: '#C0392B' }}>
              {topicError}
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {mods.map((m, i) => {
              const enough = (m.available ?? 0) >= 5;
              const starting = topicMutation.isPending && pendingTopicRef.current === m.code;
              const mine = analytics?.domains.find((d) => d.domainCode === m.code);
              const minAttempts = analytics?.minAttempts ?? 5;
              return (
                <div key={i} style={{ ...CARD_STYLE, padding: isMobile ? '14px 16px' : '18px 20px', opacity: enough ? 1 : 0.6 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6, flexWrap: 'wrap' }}>
                    <span style={{ width: 10, height: 10, borderRadius: 9999, background: m.color, flexShrink: 0 }} />
                    <span style={{ fontSize: isMobile ? 14 : 15.5, fontWeight: 600 }}>{m.name}</span>
                    <span style={{ marginLeft: 'auto', fontSize: 12.5, color: 'rgba(11,11,14,0.58)', fontFamily: 'var(--font-mono)' }}>
                      {m.available ?? 0} Qs
                    </span>
                    <button
                      onClick={() => { setTopicError(''); pendingTopicRef.current = m.code; topicMutation.mutate({ subject, skillCode: m.code, difficulty: topicDifficulty === 'any' ? undefined : topicDifficulty, count: topicCount }); }}
                      disabled={!enough || topicMutation.isPending}
                      title={enough ? undefined : 'Not enough questions in this topic yet'}
                      style={{ height: 30, padding: '0 14px', borderRadius: 9999, border: 'none', background: enough ? '#C4471F' : '#E7E4DE', color: enough ? '#fff' : 'rgba(11,11,14,0.58)', fontSize: 12.5, fontWeight: 600, cursor: enough && !topicMutation.isPending ? 'pointer' : 'default', fontFamily: 'inherit', flexShrink: 0 }}
                    >{starting ? 'Building…' : 'Practise'}</button>
                  </div>
                  {mine && mine.attempted > 0 && (
                    <div style={{ fontSize: 12.5, color: 'rgba(11,11,14,0.64)', marginBottom: m.detail && !isMobile ? 4 : 0 }}>
                      {mine.attempted >= minAttempts
                        ? <>You get <strong style={{ color: '#0B0B0E' }}>{mine.accuracy}%</strong> right · {mine.attempted} answered</>
                        : <>{mine.attempted} answered · not enough yet for a percentage</>}
                    </div>
                  )}
                  {!isMobile && m.detail && (
                    <div style={{ fontSize: 12.5, color: 'rgba(11,11,14,0.58)', fontFamily: 'var(--font-mono)' }}>{m.detail}</div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <div style={{ ...CARD_STYLE, padding: isMobile ? '16px 18px' : '22px 24px', alignSelf: 'start' }}>
          <h3 style={{ fontSize: 15, margin: '0 0 12px' }}>Before you begin</h3>
          {rules.map((r, i) => (
            <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '8px 0', borderBottom: i < rules.length - 1 ? '1px solid #F0EDE7' : 'none' }}>
              <span style={{ color: '#C4471F', fontSize: 14, lineHeight: '20px', flexShrink: 0 }}>✓</span>
              <span style={{ fontSize: 13, color: 'rgba(11,11,14,0.7)', lineHeight: 1.5 }}>{r}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Available sets + timer toggle */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 10 }}>
        <h3 style={{ fontSize: 15, margin: 0 }}>Available question sets</h3>
        <button
          onClick={toggleTimer}
          style={{
            display: 'flex', alignItems: 'center', gap: 8, padding: '8px 14px', borderRadius: 10, cursor: 'pointer', fontFamily: 'inherit',
            border: timerEnabled ? '1px solid #E2562B' : '1px solid #C8C4BC',
            background: timerEnabled ? 'rgba(226,86,43,0.06)' : '#fff',
            color: timerEnabled ? '#C4471F' : '#6F6B64',
          }}
        >
          <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
          </svg>
          <span style={{ fontSize: 13, fontWeight: 600 }}>Timer: {timerEnabled ? 'On' : 'Off'}</span>
          <div style={{ width: 34, height: 18, borderRadius: 9999, background: timerEnabled ? '#E2562B' : '#D0CCC6', position: 'relative', flexShrink: 0, transition: 'background 0.2s' }}>
            <div style={{ position: 'absolute', top: 2, left: timerEnabled ? 18 : 2, width: 14, height: 14, borderRadius: 9999, background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,0.2)', transition: 'left 0.2s' }} />
          </div>
        </button>
      </div>

      {isLoading ? (
        <div style={{ color: 'rgba(11,11,14,0.58)', fontSize: 14 }}>Loading…</div>
      ) : filtered.length === 0 ? (
        <div style={{ ...CARD_STYLE, padding: '32px 24px', textAlign: 'center', color: 'rgba(11,11,14,0.58)', fontSize: 14 }}>
          No {title} question sets available yet. Ask your teacher to add some.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {filtered.map((set) => (
            <div
              key={set.id}
              className="lift"
              style={{ ...CARD_STYLE, padding: isMobile ? '14px 16px' : '18px 22px', display: 'flex', alignItems: 'center', gap: 14 }}
              onPointerEnter={(e) => { if (e.pointerType !== 'mouse') return; e.currentTarget.style.boxShadow = '0 6px 20px rgba(11,11,14,0.09)'; e.currentTarget.style.borderColor = '#D8D4CC'; }}
              onPointerLeave={(e) => { e.currentTarget.style.boxShadow = '0 1px 3px rgba(11,11,14,0.05)'; e.currentTarget.style.borderColor = '#E7E4DE'; }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: isMobile ? 14 : 15, fontWeight: 600 }}>{set.title}</div>
                {set.description && <div style={{ fontSize: 13, color: 'rgba(11,11,14,0.64)', marginTop: 2 }}>{set.description}</div>}
                <div style={{ fontSize: 12, fontFamily: 'var(--font-mono)', color: 'rgba(11,11,14,0.58)', marginTop: 3 }}>{set.questionCount} questions</div>
              </div>
              <button
                onClick={() => { pendingSetTitleRef.current = set.title; startMutation.mutate(set.id); }}
                disabled={startMutation.isPending}
                style={{ height: isMobile ? 36 : 40, padding: '0 18px', background: accentColor, color: '#fff', border: 'none', borderRadius: 9999, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0 }}
              >
                {startMutation.isPending ? 'Starting…' : 'Begin →'}
              </button>
            </div>
          ))}
        </div>
      )}

      {startMutation.isError && (
        <p style={{ color: '#C0392B', fontSize: 13, marginTop: 12 }}>{getApiError(startMutation.error)}</p>
      )}
    </div>
  );
}
