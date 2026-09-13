import { useState } from 'react';

/**
 * Symbol palette for authoring math questions.
 *
 * Question text is plain Unicode rather than LaTeX, so the characters a teacher
 * cannot easily type are offered here instead. Grouped because one flat list of
 * ~70 symbols is slower to scan than a labelled menu.
 */

const SYMBOL_GROUPS = [
  { label: 'Sup', tip: 'Superscripts', symbols: ['²', '³', '¹', '⁰', '⁴', '⁵', '⁶', '⁷', '⁸', '⁹', '⁻', '⁺', 'ⁿ'] },
  { label: 'Sub', tip: 'Subscripts', symbols: ['₀', '₁', '₂', '₃', '₄', '₅', '₆', '₇', '₈', '₉'] },
  { label: 'Ops', tip: 'Operations', symbols: ['×', '÷', '±', '√', '∛', '∜', '∞', '·'] },
  { label: 'Frac', tip: 'Fractions — ⁄ is the fraction slash for arbitrary fractions (e.g. 22⁄7). For mixed fractions, type the whole number first then pick a fraction character (e.g. 3½)', symbols: ['⁄', '½', '⅓', '⅔', '¼', '¾', '⅕', '⅖', '⅗', '⅘', '⅙', '⅚', '⅛', '⅜', '⅝', '⅞'] },
  { label: 'Rel', tip: 'Relations', symbols: ['≤', '≥', '≠', '≈', '≡', '∝'] },
  { label: 'Grk', tip: 'Greek letters', symbols: ['π', 'θ', 'α', 'β', 'γ', 'δ', 'λ', 'μ', 'σ', 'φ', 'ω'] },
  { label: '…', tip: 'Other symbols', symbols: ['°', '∠', '△', '∑', '∫'] },
];

export function MathToolbar({ onInsert }: { onInsert: (s: string) => void }) {
  const [open, setOpen] = useState<string | null>(null);
  return (
    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 6 }}>
      <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'rgba(11,11,14,0.58)', alignSelf: 'center', marginRight: 4 }}>Math</span>
      {SYMBOL_GROUPS.map((g) => (
        <div key={g.label} style={{ position: 'relative' }}>
          <button
            type="button"
            title={g.tip}
            onClick={() => setOpen(open === g.label ? null : g.label)}
            style={{ padding: '3px 8px', fontSize: 11, fontWeight: 600, border: '1px solid #E7E4DE', borderRadius: 6, background: open === g.label ? '#0B0B0E' : '#F2F0EC', color: open === g.label ? '#fff' : '#0B0B0E', cursor: 'pointer', fontFamily: 'inherit' }}
          >{g.label} ▾</button>
          {open === g.label && (
            <div style={{ position: 'absolute', top: '100%', left: 0, marginTop: 4, background: '#fff', border: '1px solid #E7E4DE', borderRadius: 10, padding: 8, zIndex: 50, display: 'flex', flexWrap: 'wrap', gap: 4, width: 200, boxShadow: '0 8px 24px rgba(11,11,14,0.12)' }}>
              {g.symbols.map((sym) => (
                <button
                  key={sym}
                  type="button"
                  onClick={() => { onInsert(sym); setOpen(null); }}
                  style={{ minWidth: 30, height: 30, padding: '0 6px', border: '1px solid #E7E4DE', borderRadius: 7, background: '#F8F7F4', color: '#0B0B0E', cursor: 'pointer', fontSize: 14, fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                >{sym}</button>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

