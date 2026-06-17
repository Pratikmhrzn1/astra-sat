import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { startMockTest } from '../../api/student';
import { getApiError } from '../../api/client';

const CARD: React.CSSProperties = { background: '#fff', border: '1px solid #E7E4DE', borderRadius: 16, boxShadow: '0 1px 3px rgba(11,11,14,0.05)' };

const MODS = [
  { color: '#2E7D5A', name: 'Reading & Writing', detail: 'Grammar · vocab · comprehension', desc: 'Craft, structure, and the conventions of standard English.' },
  { color: '#2563A8', name: 'Math', detail: 'Algebra · geometry · data', desc: 'Equations, functions, problem-solving, and real-world math.' },
];

const RULES = [
  'A countdown timer runs for the entire test.',
  'Reading & Writing comes first, then a short break, then Math.',
  'Flag any question and return to it from the navigator.',
  'Cross out answer choices you\'ve ruled out.',
  'An on-screen calculator is available for the Math section.',
  'You\'ll get a full scored report the moment you submit.',
];

export default function MockTest() {
  const navigate = useNavigate();

  const startMutation = useMutation({
    mutationFn: startMockTest,
    onSuccess: (data) => navigate(`/student/exams/${data.englishExam.id}`),
  });

  return (
    <div className="screen-fade" style={{ padding: '40px 48px 64px' }}>
      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#E2562B' }}>Full length · scored out of 1600</div>
      <h1 style={{ fontFamily: "'Instrument Serif', serif", fontSize: 56, margin: '8px 0 0', letterSpacing: '-0.02em' }}>Mock SAT</h1>
      <p style={{ maxWidth: 640, fontSize: 16, lineHeight: 1.65, color: 'rgba(11,11,14,0.6)', margin: '14px 0 28px' }}>
        A complete, timed simulation of the Digital SAT. Reading & Writing comes first, then a short break, then Math. Your scaled section scores combine into a total out of 1600.
      </p>

      {/* Meta */}
      <div style={{ display: 'flex', gap: 14, marginBottom: 28 }}>
        {[['2', 'Sections'], ['45m', 'Total time'], ['1600', 'Score scale']].map(([v, l], i) => (
          <div key={i} style={{ ...CARD, padding: '18px 26px', minWidth: 130, borderRadius: 14 }}>
            <div style={{ fontFamily: "'Instrument Serif', serif", fontSize: 38, lineHeight: 1, color: '#0B0B0E' }}>{v}</div>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(11,11,14,0.4)', marginTop: 6 }}>{l}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: 20, marginBottom: 28 }}>
        <div>
          <h3 style={{ fontSize: 16, margin: '0 0 14px' }}>What's inside</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {MODS.map((m, i) => (
              <div key={i} style={{ ...CARD, padding: '18px 20px' }}>
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

        <div style={{ ...CARD, padding: '22px 24px', alignSelf: 'start' }}>
          <h3 style={{ fontSize: 16, margin: '0 0 14px' }}>Before you begin</h3>
          {RULES.map((r, i) => (
            <div key={i} style={{ display: 'flex', gap: 11, alignItems: 'flex-start', padding: '9px 0', borderBottom: i < RULES.length - 1 ? '1px solid #F0EDE7' : 'none' }}>
              <span style={{ color: '#E2562B', fontSize: 14, lineHeight: '20px', flexShrink: 0 }}>✓</span>
              <span style={{ fontSize: 13.5, color: 'rgba(11,11,14,0.7)', lineHeight: 1.5 }}>{r}</span>
            </div>
          ))}
        </div>
      </div>

      {startMutation.isError && (
        <p style={{ color: '#C0392B', fontSize: 13, marginBottom: 16 }}>{getApiError(startMutation.error)}</p>
      )}

      <button
        onClick={() => startMutation.mutate()}
        disabled={startMutation.isPending}
        style={{ height: 52, padding: '0 32px', background: startMutation.isPending ? '#e89070' : '#E2562B', color: '#fff', border: 'none', borderRadius: 9999, fontSize: 15.5, fontWeight: 600, cursor: startMutation.isPending ? 'default' : 'pointer', boxShadow: '0 4px 14px rgba(226,86,43,0.3)', fontFamily: 'inherit', transition: 'background 0.15s, transform 0.15s' }}
        onMouseEnter={(e) => { if (!startMutation.isPending) { e.currentTarget.style.background = '#C94A22'; e.currentTarget.style.transform = 'translateY(-1px)'; } }}
        onMouseLeave={(e) => { e.currentTarget.style.background = startMutation.isPending ? '#e89070' : '#E2562B'; e.currentTarget.style.transform = 'none'; }}
      >
        {startMutation.isPending ? 'Starting…' : 'Begin Mock SAT →'}
      </button>
    </div>
  );
}
