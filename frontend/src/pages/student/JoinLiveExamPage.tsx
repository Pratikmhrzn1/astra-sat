import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { checkSessionStatus } from '@/api/liveExam';
import { useMobile } from '@/hooks/useMobile';
import { CARD, H1, PillButton, T } from '@/components/live-exam/ui';

/**
 * Where a student enters the code their teacher reads out.
 *
 * The lobby at `/live/:joinCode` has always handled joining, polling and
 * launching — but nothing in the app led to it, so a student could only get
 * there if the teacher sent them a full URL. A code announced in class had
 * nowhere to be typed.
 *
 * The code is checked here before navigating, so a mistyped one says so on this
 * page rather than dropping the student into a lobby that immediately errors —
 * which matters when a class is waiting and the exam is about to start.
 */

/**
 * The alphabet the server generates from. It deliberately omits I, O, 0 and 1,
 * so a code read aloud cannot be ambiguous; anything outside it is a typo, and
 * saying so beats a lookup that returns nothing.
 */
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 6;

/** Uppercases and drops spaces and dashes, so "sqls 69" and "SQLS-69" both work. */
function normalise(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, CODE_LENGTH);
}

export default function JoinLiveExam() {
  const navigate = useNavigate();
  const isMobile = useMobile();
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [checking, setChecking] = useState(false);
  const [focused, setFocused] = useState(false);
  // Bumped on every rejected code; re-keys the cells so the shake replays.
  const [shakeKey, setShakeKey] = useState(0);

  const ready = code.length === CODE_LENGTH;

  async function handleJoin(e: React.FormEvent) {
    e.preventDefault();
    if (!ready || checking) return;

    const bad = [...code].find((char) => !CODE_ALPHABET.includes(char));
    if (bad) {
      setError(`"${bad}" isn't used in join codes. Codes never contain I, O, 0 or 1.`);
      setShakeKey((k) => k + 1);
      return;
    }

    setChecking(true);
    setError('');
    try {
      const session = await checkSessionStatus(code);
      if (session.status === 'completed') {
        setError(`"${session.title}" has already finished. Your result appears in History once your teacher releases it.`);
        setShakeKey((k) => k + 1);
        return;
      }
      navigate(`/live/${code}`);
    } catch {
      setError('No exam uses that code. Check each character with your teacher.');
      setShakeKey((k) => k + 1);
    } finally {
      setChecking(false);
    }
  }

  const slots = Array.from({ length: CODE_LENGTH }, (_, i) => code[i] ?? '');
  const activeIndex = focused && !checking && !ready ? code.length : -1;

  // Centred in the part of the screen the student can actually see: the shell's
  // scroll area, minus the tab bar on phones.
  const stageMinHeight = isMobile
    ? 'calc(100dvh - var(--tabbar-h) - var(--safe-bottom) - 8px)'
    : '100dvh';

  return (
    <div className="screen-fade" style={{ ...STAGE, minHeight: stageMinHeight, padding: isMobile ? '28px 16px 32px' : '48px 32px' }}>
      <div style={{ width: '100%', maxWidth: 468 }}>
        <header style={{ textAlign: 'center', marginBottom: isMobile ? 22 : 28 }}>
          <h1 style={{ ...H1, fontSize: isMobile ? 30 : 40, lineHeight: 1.1, marginBottom: 10, textWrap: 'balance' }}>
            Join your class's live exam
          </h1>
          <p style={{ fontSize: isMobile ? 14.5 : 15.5, color: T.muted, margin: '0 auto', maxWidth: 440, lineHeight: 1.55, textWrap: 'balance' }}>
            Type the six-character code your teacher reads out. You'll wait in the lobby until the exam starts.
          </p>
        </header>

        <form onSubmit={handleJoin} style={SLIP} aria-describedby="join-steps">
          <div style={{ padding: isMobile ? '22px 18px 20px' : '28px 32px 24px' }}>
            <label htmlFor="join-code" style={{ display: 'block', fontSize: 14, fontWeight: 600, color: T.ink, textAlign: 'center', marginBottom: 14 }}>
              Join code
            </label>

            {/* Six evenly spaced cells, with the real input laid invisibly over
                them, so typing, pasting, autofill and the phone keyboard all
                behave natively. A grid keeps every gap identical and lets the
                cells shrink together on a narrow phone. */}
            <div
              key={shakeKey}
              className={shakeKey ? 'join-shake' : undefined}
              style={{
                position: 'relative', display: 'grid', gridTemplateColumns: `repeat(${CODE_LENGTH}, minmax(0, 1fr))`,
                gap: isMobile ? 8 : 10, width: '100%', maxWidth: 384, margin: '0 auto',
              }}
            >
              {slots.map((char, i) => {
                const active = i === activeIndex;
                const border = error ? 'rgba(192,57,43,0.6)' : ready ? T.green : active ? T.accent : char ? '#BDB8AE' : T.line;
                return (
                  <span
                    key={i}
                    aria-hidden
                    style={{
                      ...CELL,
                      background: error ? 'rgba(192,57,43,0.03)' : ready ? 'rgba(26,107,60,0.04)' : char ? '#fff' : T.wash,
                      border: `1.5px solid ${border}`,
                      boxShadow: active ? '0 0 0 4px rgba(226,86,43,0.14)' : char ? '0 1px 2px rgba(11,11,14,0.05)' : 'none',
                    }}
                  >
                    {char}
                    {active && <span className="join-caret" style={CARET} />}
                  </span>
                );
              })}
              <input
                id="join-code"
                value={code}
                onChange={(e) => { setCode(normalise(e.target.value)); setError(''); }}
                onFocus={() => setFocused(true)}
                onBlur={() => setFocused(false)}
                autoFocus
                autoComplete="one-time-code"
                autoCapitalize="characters"
                spellCheck={false}
                inputMode="text"
                maxLength={CODE_LENGTH + 4}
                aria-describedby="join-code-hint"
                aria-invalid={!!error}
                style={HIDDEN_INPUT}
              />
            </div>

            <p
              id="join-code-hint"
              role={error ? 'alert' : undefined}
              style={{
                minHeight: 20, margin: '12px auto 18px', maxWidth: 340, textAlign: 'center', fontSize: 13, lineHeight: 1.5,
                color: error ? T.danger : ready ? T.green : T.faint, fontVariantNumeric: 'tabular-nums',
              }}
            >
              {error || (ready ? 'Code complete' : code.length === 0 ? 'Letters and numbers, no spaces needed' : `${code.length} of ${CODE_LENGTH} characters`)}
            </p>

            <PillButton
              type="submit"
              disabled={!ready || checking}
              style={{
                width: '100%', height: 50, fontSize: 15.5,
                // Until the code is complete the button is a quiet placeholder,
                // not a faded version of the action — it lights up when usable.
                ...(!ready ? { background: T.lineSoft, color: 'rgba(11,11,14,0.42)', border: `1px solid ${T.line}`, opacity: 1 } : {}),
                ...(checking ? { opacity: 1 } : {}),
              }}
            >
              {checking && <span className="join-spinner" aria-hidden />}
              {checking ? 'Checking the code' : 'Join exam'}
            </PillButton>
          </div>

          {/* Perforation: the slip tears into what you do now and what happens next. */}
          <div aria-hidden style={{ height: 0, borderTop: `1.5px dashed #DCD8D0` }} />

          {/* Three columns at every width, each number centred over its label.
              The connector runs from one number to the next: it starts past this
              column's number (50% + half a dot + breathing room) and ends short of
              the next column's, which sits one column-width plus the gap away. */}
          <ol id="join-steps" style={{
            listStyle: 'none', margin: 0, padding: isMobile ? '16px 12px 18px' : '18px 24px 22px',
            display: 'grid', gridTemplateColumns: `repeat(${STEPS.length}, minmax(0, 1fr))`, columnGap: STEP_GAP,
            background: T.wash, borderRadius: '0 0 21px 21px',
          }}>
            {STEPS.map((step, i) => {
              const done = i === 0 && ready && !error;
              return (
                <li key={step} style={{
                  position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 7,
                  textAlign: 'center', fontSize: isMobile ? 12.5 : 13, lineHeight: 1.35, color: i === 0 ? T.ink : T.muted,
                }}>
                  {i < STEPS.length - 1 && (
                    <span aria-hidden style={{
                      position: 'absolute', top: 11, height: 1, background: T.line,
                      left: `calc(50% + ${DOT / 2 + 8}px)`,
                      right: `calc(-50% - ${STEP_GAP}px + ${DOT / 2 + 8}px)`,
                    }} />
                  )}
                  <span style={{
                    position: 'relative', width: DOT, height: DOT, borderRadius: 9999, flexShrink: 0,
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 11.5, fontWeight: 700, fontVariantNumeric: 'tabular-nums',
                    background: done ? T.green : i === 0 ? T.ink : '#fff',
                    color: i === 0 ? '#fff' : T.muted,
                    border: i === 0 ? 'none' : `1px solid ${T.line}`, boxSizing: 'border-box',
                  }}>{done ? '✓' : i + 1}</span>
                  {step}
                </li>
              );
            })}
          </ol>
        </form>

        <p style={{ fontSize: 13.5, color: T.muted, margin: '18px 0 0', lineHeight: 1.6, textAlign: 'center' }}>
          Looking for a released result?{' '}
          <button
            type="button"
            onClick={() => navigate('/student/results?tab=live')}
            style={{ background: 'none', border: 'none', padding: '2px 0', font: 'inherit', color: T.accentText, fontWeight: 600, cursor: 'pointer', textDecoration: 'underline', textUnderlineOffset: 3 }}
          >Open History</button>
        </p>
      </div>

      <style>{`
        .join-spinner {
          width: 15px; height: 15px; border-radius: 9999px; box-sizing: border-box;
          border: 2px solid rgba(255,255,255,0.4); border-top-color: #fff;
          animation: join-spin 0.8s linear infinite;
        }
        @keyframes join-spin { to { transform: rotate(360deg); } }
        .join-caret { animation: join-blink 1.1s steps(1) infinite; }
        @keyframes join-blink { 50% { opacity: 0; } }
        .join-shake { animation: join-shake 320ms cubic-bezier(0.36, 0.07, 0.19, 0.97); }
        @keyframes join-shake {
          20% { transform: translateX(-6px); } 40% { transform: translateX(5px); }
          60% { transform: translateX(-3px); } 80% { transform: translateX(2px); }
        }
        @media (prefers-reduced-motion: reduce) {
          .join-caret, .join-shake { animation: none; }
          .join-spinner { animation-duration: 2.4s; }
        }
      `}</style>
    </div>
  );
}

const STEPS = ['Enter the code', 'Wait in the lobby', 'Your paper opens'];
const DOT = 22;
const STEP_GAP = 12;

const STAGE: React.CSSProperties = {
  display: 'flex', alignItems: 'center', justifyContent: 'center', boxSizing: 'border-box',
};

const SLIP: React.CSSProperties = {
  ...CARD,
  borderRadius: 22,
  // Notches are cut from the page colour, so the slip must not clip them.
  overflow: 'visible',
  boxShadow: '0 1px 2px rgba(11,11,14,0.04), 0 12px 32px rgba(11,11,14,0.06)',
};

const CELL: React.CSSProperties = {
  position: 'relative', width: '100%', aspectRatio: '5 / 6', boxSizing: 'border-box',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  borderRadius: 12, fontFamily: 'var(--font-mono)', fontWeight: 600,
  fontSize: 'clamp(20px, 6.5vw, 30px)', lineHeight: 1, color: T.ink,
  transitionProperty: 'border-color, box-shadow, background-color',
  transitionDuration: '150ms', transitionTimingFunction: 'cubic-bezier(0.2, 0, 0, 1)',
};

const CARET: React.CSSProperties = {
  position: 'absolute', width: 2, height: '44%', borderRadius: 1, background: T.accent,
};

const HIDDEN_INPUT: React.CSSProperties = {
  position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0,
  border: 'none', padding: 0, margin: 0, fontSize: 16, cursor: 'text', caretColor: 'transparent',
};
