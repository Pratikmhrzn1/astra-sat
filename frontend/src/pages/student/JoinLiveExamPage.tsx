import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { checkSessionStatus } from '@/api/liveExam';
import { PillButton, liveCardClass, liveTitleClass } from '@/components/live-exam/ui';
import { cn } from '@/lib/utils';

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

  return (
    // Centred in the part of the screen the student can actually see: the shell's
    // scroll area, minus the tab bar on phones.
    <div className="screen-fade flex items-center justify-center min-h-[calc(100dvh-var(--tabbar-h)-var(--safe-bottom)-8px)] sm:min-h-[100dvh] px-4 pt-7 pb-8 sm:px-8 sm:py-12">
      <div className="w-full max-w-[468px]">
        <header className="text-center mb-[22px] sm:mb-7">
          <h1 className={cn(liveTitleClass, 'text-[30px] sm:text-[40px] leading-[1.1] mb-2.5 [text-wrap:balance]')}>
            Join your class's live exam
          </h1>
          <p className="text-[14.5px] sm:text-[15.5px] text-subtle mx-auto my-0 max-w-[440px] leading-[1.55] [text-wrap:balance]">
            Type the six-character code your teacher reads out. You'll wait in the lobby until the exam starts.
          </p>
        </header>

        {/* Notches are cut from the page colour, so the slip must not clip them. */}
        <form
          onSubmit={handleJoin}
          className={cn(liveCardClass, 'rounded-[22px] overflow-visible shadow-[0_1px_2px_rgba(11,11,14,0.04),0_12px_32px_rgba(11,11,14,0.06)]')}
          aria-describedby="join-steps"
        >
          <div className="px-[18px] pt-[22px] pb-5 sm:px-8 sm:pt-7 sm:pb-6">
            <label htmlFor="join-code" className="block text-sm font-semibold text-ink text-center mb-3.5">
              Join code
            </label>

            {/* Six evenly spaced cells, with the real input laid invisibly over
                them, so typing, pasting, autofill and the phone keyboard all
                behave natively. A grid keeps every gap identical and lets the
                cells shrink together on a narrow phone. */}
            <div
              key={shakeKey}
              className={cn('relative grid grid-cols-6 gap-2 sm:gap-2.5 w-full max-w-[384px] mx-auto', shakeKey && 'animate-join-shake motion-reduce:animate-none')}
            >
              {slots.map((char, i) => {
                const active = i === activeIndex;
                return (
                  <span
                    key={i}
                    aria-hidden
                    className={cn(
                      'relative w-full aspect-[5/6] flex items-center justify-center rounded-xl font-mono font-semibold text-[clamp(20px,6.5vw,30px)] leading-none text-ink',
                      'border-[1.5px] transition-[border-color,box-shadow,background-color] duration-150 ease-[cubic-bezier(0.2,0,0,1)]',
                      error ? 'border-danger/60' : ready ? 'border-green-dark' : active ? 'border-ember' : char ? 'border-[#BDB8AE]' : 'border-border',
                      error ? 'bg-danger/[.03]' : ready ? 'bg-green-dark/[.04]' : char ? 'bg-white' : 'bg-[#FBFAF8]',
                      active ? 'shadow-[0_0_0_4px_rgba(226,86,43,0.14)]' : char ? 'shadow-[0_1px_2px_rgba(11,11,14,0.05)]' : 'shadow-none',
                    )}
                  >
                    {char}
                    {active && <span className="absolute w-0.5 h-[44%] rounded-[1px] bg-ember animate-caret-blink motion-reduce:animate-none" />}
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
                className="absolute inset-0 w-full h-full opacity-0 p-0 m-0 text-base cursor-text [caret-color:transparent]"
              />
            </div>

            <p
              id="join-code-hint"
              role={error ? 'alert' : undefined}
              className={cn(
                'min-h-5 mx-auto mt-3 mb-[18px] max-w-[340px] text-center text-[13px] leading-normal tnum',
                error ? 'text-danger' : ready ? 'text-green-dark' : 'text-muted',
              )}
            >
              {error || (ready ? 'Code complete' : code.length === 0 ? 'Letters and numbers, no spaces needed' : `${code.length} of ${CODE_LENGTH} characters`)}
            </p>

            <PillButton
              type="submit"
              disabled={!ready || checking}
              className={cn(
                'w-full h-[50px] text-[15.5px]',
                // Until the code is complete the button is a quiet placeholder,
                // not a faded version of the action — it lights up when usable.
                !ready && 'bg-sunken text-ink/[.42] border-border opacity-100',
                checking && 'opacity-100',
              )}
            >
              {checking && (
                <span aria-hidden className="w-[15px] h-[15px] rounded-full border-2 border-white/40 border-t-white animate-spin-fast motion-reduce:animate-spin-slow" />
              )}
              {checking ? 'Checking the code' : 'Join exam'}
            </PillButton>
          </div>

          {/* Perforation: the slip tears into what you do now and what happens next. */}
          <div aria-hidden className="h-0 border-t-[1.5px] border-dashed border-[#DCD8D0]" />

          {/* Three columns at every width, each number centred over its label.
              The connector runs from one number to the next: it starts past this
              column's number (50% + half a dot + breathing room) and ends short of
              the next column's, which sits one column-width plus the gap away. */}
          <ol id="join-steps" className="list-none m-0 px-3 pt-4 pb-[18px] sm:px-6 sm:pt-[18px] sm:pb-[22px] grid grid-cols-3 gap-x-3 bg-[#FBFAF8] rounded-b-[21px]">
            {STEPS.map((step, i) => {
              const done = i === 0 && ready && !error;
              return (
                <li
                  key={step}
                  className={cn(
                    'relative flex flex-col items-center gap-[7px] text-center text-[12.5px] sm:text-[13px] leading-[1.35]',
                    i === 0 ? 'text-ink' : 'text-subtle',
                  )}
                >
                  {i < STEPS.length - 1 && (
                    // left: 50% + half the 22px dot + 8px; right: past the 12px gap, same inset.
                    <span aria-hidden className="absolute top-[11px] h-px bg-border left-[calc(50%+19px)] right-[calc(-50%-12px+19px)]" />
                  )}
                  <span
                    className={cn(
                      'relative w-[22px] h-[22px] rounded-full shrink-0 inline-flex items-center justify-center text-[11.5px] font-bold tnum',
                      done ? 'bg-green-dark' : i === 0 ? 'bg-ink' : 'bg-white',
                      i === 0 ? 'text-white' : 'text-subtle border border-border',
                    )}
                  >{done ? '✓' : i + 1}</span>
                  {step}
                </li>
              );
            })}
          </ol>
        </form>

        <p className="text-[13.5px] text-subtle mt-[18px] mb-0 leading-[1.6] text-center">
          Looking for a released result?{' '}
          <button
            type="button"
            onClick={() => navigate('/student/results?tab=live')}
            className="bg-transparent py-0.5 px-0 text-accent-text font-semibold cursor-pointer underline underline-offset-[3px]"
          >Open History</button>
        </p>
      </div>
    </div>
  );
}

const STEPS = ['Enter the code', 'Wait in the lobby', 'Your paper opens'];
