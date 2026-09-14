import { useState } from 'react';
import { cn } from '@/lib/utils';

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
    <div className="flex gap-1 flex-wrap mb-1.5">
      <span className="text-[10.5px] font-bold tracking-[0.07em] uppercase text-muted self-center mr-1">Math</span>
      {SYMBOL_GROUPS.map((g) => (
        <div key={g.label} className="relative">
          <button
            type="button"
            title={g.tip}
            onClick={() => setOpen(open === g.label ? null : g.label)}
            className={cn('px-2 py-[3px] text-[11px] font-semibold border border-border rounded-md cursor-pointer', open === g.label ? 'bg-ink text-white' : 'bg-sunken text-ink')}
          >{g.label} ▾</button>
          {open === g.label && (
            <div className="absolute top-full left-0 mt-1 bg-white border border-border rounded-[10px] p-2 z-50 flex flex-wrap gap-1 w-[200px] shadow-[0_8px_24px_rgba(11,11,14,0.12)]">
              {g.symbols.map((sym) => (
                <button
                  key={sym}
                  type="button"
                  onClick={() => { onInsert(sym); setOpen(null); }}
                  className="min-w-[30px] h-[30px] px-1.5 border border-border rounded-[7px] bg-[#F8F7F4] text-ink cursor-pointer text-sm flex items-center justify-center"
                >{sym}</button>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

