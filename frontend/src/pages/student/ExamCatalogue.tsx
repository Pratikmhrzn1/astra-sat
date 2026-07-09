import React from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import { getQuestionSets, startExam } from '../../api/student';
import { getApiError } from '../../api/client';

const CARD_STYLE: React.CSSProperties = {
  background: '#fff', border: '1px solid #E7E4DE', borderRadius: 16, boxShadow: '0 1px 3px rgba(11,11,14,0.05)',
};

export default function ExamCatalogue() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const subject = (searchParams.get('subject') as 'math' | 'english') ?? 'math';

  const switchSubject = (s: 'math' | 'english') => navigate(`/student/exams?subject=${s}`, { replace: true });

  const { data: sets = [], isLoading } = useQuery({ queryKey: ['student', 'question-sets'], queryFn: getQuestionSets });

  const startMutation = useMutation({
    mutationFn: startExam,
    onSuccess: (data) => navigate(`/student/exams/${data.exam.id}`),
  });

  const filtered = sets.filter((s) => s.subject === subject);

  const isMath = subject === 'math';
  const accentColor = isMath ? '#2563A8' : '#2E7D5A';
  const kicker = isMath ? 'Section practice · scored out of 800' : 'Section practice · scored out of 800';
  const title = isMath ? 'Math' : 'Reading & Writing';
  const blurb = isMath
    ? 'Focused Math practice spanning the Digital SAT domains. An on-screen calculator is available for every question, exactly like the real exam.'
    : 'Reading & Writing practice that mirrors the Digital SAT: short passages each followed by a single question testing craft, structure, and the conventions of English.';

  const mods = isMath
    ? [
        { color: '#2563A8', name: 'Algebra & Advanced Math', detail: 'Linear · systems · factoring', desc: 'Build, solve, and interpret equations.' },
        { color: '#B8893E', name: 'Problem Solving & Geometry', detail: 'Percent · ratio · shapes', desc: 'Apply math to real-world and geometric problems.' },
      ]
    : [
        { color: '#2E7D5A', name: 'Craft & Structure', detail: 'Words in context · evidence', desc: 'Vocabulary, purpose, and connections across texts.' },
        { color: '#E2562B', name: 'Standard English', detail: 'Boundaries · form · transitions', desc: 'Punctuation, agreement and logical flow.' },
      ];

  const rules = [
    'A countdown timer runs for the whole section.',
    'Flag any question and return to it from the navigator.',
    'Cross out answer choices you\'ve ruled out.',
    isMath ? 'An on-screen calculator is available throughout.' : 'Each question stands alone — answer in any order.',
    'You\'ll get a full scored report the moment you submit.',
  ];

  return (
    <div className="screen-fade" style={{ padding: '40px 48px 64px' }}>
      {/* Subject switcher */}
      <div style={{ display: 'inline-flex', gap: 4, background: '#F0EDE7', borderRadius: 12, padding: 4, marginBottom: 28 }}>
        {([['math', 'Math'], ['english', 'Reading & Writing']] as const).map(([s, label]) => (
          <button
            key={s}
            onClick={() => switchSubject(s)}
            style={{
              padding: '8px 18px', borderRadius: 9, fontSize: 13.5, fontWeight: 600, cursor: 'pointer',
              border: 'none', fontFamily: 'inherit', transition: 'background 0.15s, color 0.15s',
              background: subject === s ? '#fff' : 'transparent',
              color: subject === s ? '#0B0B0E' : 'rgba(11,11,14,0.45)',
              boxShadow: subject === s ? '0 1px 4px rgba(11,11,14,0.1)' : 'none',
            }}
          >{label}</button>
        ))}
      </div>

      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#E2562B' }}>{kicker}</div>
      <h1 style={{ fontFamily: "'Instrument Serif', serif", fontSize: 56, margin: '8px 0 0', letterSpacing: '-0.02em' }}>{title}</h1>
      <p style={{ maxWidth: 640, fontSize: 16, lineHeight: 1.65, color: 'rgba(11,11,14,0.6)', margin: '14px 0 28px' }}>{blurb}</p>

      {/* Meta stats */}
      <div style={{ display: 'flex', gap: 14, marginBottom: 28 }}>
        {[['—', 'Questions per set'], ['20m', 'Per set time'], ['800', 'Score scale']].map(([v, l], i) => (
          <div key={i} style={{ ...CARD_STYLE, padding: '18px 26px', minWidth: 130, borderRadius: 14 }}>
            <div style={{ fontFamily: "'Instrument Serif', serif", fontSize: 38, lineHeight: 1, color: '#0B0B0E' }}>{v}</div>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(11,11,14,0.4)', marginTop: 6 }}>{l}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: 20, marginBottom: 28 }}>
        <div>
          <h3 style={{ fontSize: 16, margin: '0 0 14px' }}>What's inside</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {mods.map((m, i) => (
              <div key={i} style={{ ...CARD_STYLE, padding: '18px 20px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
                  <span style={{ width: 10, height: 10, borderRadius: 9999, background: m.color, flexShrink: 0 }} />
                  <span style={{ fontSize: 15.5, fontWeight: 600 }}>{m.name}</span>
                  <span style={{ marginLeft: 'auto', fontSize: 12.5, color: 'rgba(11,11,14,0.45)', fontFamily: "'JetBrains Mono', monospace" }}>{m.detail}</span>
                </div>
                <div style={{ fontSize: 13.5, color: 'rgba(11,11,14,0.55)', lineHeight: 1.55 }}>{m.desc}</div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ ...CARD_STYLE, padding: '22px 24px', alignSelf: 'start' }}>
          <h3 style={{ fontSize: 16, margin: '0 0 14px' }}>Before you begin</h3>
          {rules.map((r, i) => (
            <div key={i} style={{ display: 'flex', gap: 11, alignItems: 'flex-start', padding: '9px 0', borderBottom: i < rules.length - 1 ? '1px solid #F0EDE7' : 'none' }}>
              <span style={{ color: '#E2562B', fontSize: 14, lineHeight: '20px', flexShrink: 0 }}>✓</span>
              <span style={{ fontSize: 13.5, color: 'rgba(11,11,14,0.7)', lineHeight: 1.5 }}>{r}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Available sets */}
      <h3 style={{ fontSize: 16, margin: '0 0 14px' }}>Available question sets</h3>
      {isLoading ? (
        <div style={{ color: 'rgba(11,11,14,0.4)', fontSize: 14 }}>Loading…</div>
      ) : filtered.length === 0 ? (
        <div style={{ ...CARD_STYLE, padding: '32px 24px', textAlign: 'center', color: 'rgba(11,11,14,0.4)', fontSize: 14 }}>
          No {title} question sets available yet. Ask your teacher to add some.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {filtered.map((set) => (
            <div
              key={set.id}
              className="lift"
              style={{ ...CARD_STYLE, padding: '18px 22px', display: 'flex', alignItems: 'center', gap: 18 }}
              onMouseEnter={(e) => { e.currentTarget.style.boxShadow = '0 6px 20px rgba(11,11,14,0.09)'; e.currentTarget.style.borderColor = '#D8D4CC'; }}
              onMouseLeave={(e) => { e.currentTarget.style.boxShadow = '0 1px 3px rgba(11,11,14,0.05)'; e.currentTarget.style.borderColor = '#E7E4DE'; }}
            >
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 15, fontWeight: 600 }}>{set.title}</div>
                {set.description && <div style={{ fontSize: 13, color: 'rgba(11,11,14,0.5)', marginTop: 2 }}>{set.description}</div>}
                <div style={{ fontSize: 12, fontFamily: "'JetBrains Mono', monospace", color: 'rgba(11,11,14,0.4)', marginTop: 4 }}>{set.questionCount} questions</div>
              </div>
              <button
                onClick={() => startMutation.mutate(set.id)}
                disabled={startMutation.isPending}
                style={{ height: 40, padding: '0 22px', background: accentColor, color: '#fff', border: 'none', borderRadius: 9999, fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0 }}
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
