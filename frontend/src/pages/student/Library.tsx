import React, { useState } from 'react';

const ITEMS = [
  { cat: 'Study guides', color: '#E2562B', title: 'The Digital SAT, end to end', meta: '14 min read', sub: 'Format, timing, and what each section actually tests.' },
  { cat: 'Study guides', color: '#E2562B', title: 'How section-adaptive scoring works', meta: '9 min read', sub: 'Why module two changes — and how raw scores become scaled scores.' },
  { cat: 'Video lessons', color: '#2563A8', title: 'Linear equations in 8 minutes', meta: '8:24 · video', sub: 'Solve, rearrange, and interpret single-variable equations fast.' },
  { cat: 'Video lessons', color: '#2563A8', title: 'Punctuation rules that actually show up', meta: '11:05 · video', sub: 'Commas, dashes, colons and semicolons — only what the SAT tests.' },
  { cat: 'Video lessons', color: '#2563A8', title: 'Reading: command of evidence', meta: '9:40 · video', sub: 'Match claims to the data and quotations that support them.' },
  { cat: 'Question banks', color: '#2E7D5A', title: 'Heart of Algebra — 60 questions', meta: '60 questions', sub: 'Drill linear equations, inequalities and systems by difficulty.' },
  { cat: 'Question banks', color: '#2E7D5A', title: 'Words in context — 40 questions', meta: '40 questions', sub: 'Precise vocabulary practice with full explanations.' },
  { cat: 'Formula & vocab', color: '#B8893E', title: 'Math formula reference sheet', meta: 'PDF · 2 pages', sub: 'Every geometry and algebra formula you\'re expected to know.' },
  { cat: 'Formula & vocab', color: '#B8893E', title: 'High-frequency SAT vocabulary', meta: 'PDF · 120 words', sub: 'The words that recur most often, with example sentences.' },
];

const TABS = ['All', 'Study guides', 'Video lessons', 'Question banks', 'Formula & vocab'];

export default function Library() {
  const [filter, setFilter] = useState('All');
  const shown = ITEMS.filter((it) => filter === 'All' || it.cat === filter);

  return (
    <div className="screen-fade" style={{ padding: '36px 48px 64px' }}>
      <h1 style={{ fontFamily: "'Instrument Serif', serif", fontSize: 44, margin: '0 0 6px', letterSpacing: '-0.02em' }}>Library</h1>
      <p style={{ fontSize: 15, color: 'rgba(11,11,14,0.55)', margin: '0 0 24px' }}>
        Guides, lessons and practice material to close the gaps your reports reveal.
      </p>

      <div style={{ display: 'flex', gap: 9, marginBottom: 22, flexWrap: 'wrap' }}>
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setFilter(t)}
            style={{
              padding: '8px 16px', borderRadius: 9999, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
              border: filter === t ? '1px solid #0B0B0E' : '1px solid #C8C4BC',
              background: filter === t ? '#0B0B0E' : '#fff',
              color: filter === t ? '#fff' : '#0B0B0E',
            }}
          >{t}</button>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
        {shown.map((it, i) => (
          <div
            key={i}
            className="lift"
            style={{ background: '#fff', border: '1px solid #E7E4DE', borderRadius: 16, padding: '22px 22px 20px', boxShadow: '0 1px 3px rgba(11,11,14,0.04)', cursor: 'pointer', display: 'flex', flexDirection: 'column' }}
            onMouseEnter={(e) => { e.currentTarget.style.boxShadow = '0 8px 24px rgba(11,11,14,0.09)'; e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.borderColor = '#D8D4CC'; }}
            onMouseLeave={(e) => { e.currentTarget.style.boxShadow = '0 1px 3px rgba(11,11,14,0.04)'; e.currentTarget.style.transform = 'none'; e.currentTarget.style.borderColor = '#E7E4DE'; }}
          >
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 7, alignSelf: 'flex-start', fontSize: 10.5, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: it.color, marginBottom: 14 }}>
              <span style={{ width: 7, height: 7, borderRadius: 9999, background: it.color }} />
              {it.cat}
            </div>
            <div style={{ fontSize: 17, fontWeight: 600, lineHeight: 1.3, marginBottom: 8 }}>{it.title}</div>
            <div style={{ fontSize: 13.5, color: 'rgba(11,11,14,0.55)', lineHeight: 1.55, flex: 1, marginBottom: 18 }}>{it.sub}</div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 12, color: 'rgba(11,11,14,0.45)', fontFamily: "'JetBrains Mono', monospace" }}>{it.meta}</span>
              <span style={{ fontSize: 13, fontWeight: 600, color: '#E2562B' }}>Open →</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
