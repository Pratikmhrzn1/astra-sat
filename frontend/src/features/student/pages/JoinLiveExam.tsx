import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { checkSessionStatus } from '@/features/live-exam/api/live-exam.api';
import { useMobile } from '@/shared/hooks/useMobile';

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

  const ready = code.length === CODE_LENGTH;

  async function handleJoin(e: React.FormEvent) {
    e.preventDefault();
    if (!ready || checking) return;

    const bad = [...code].find((char) => !CODE_ALPHABET.includes(char));
    if (bad) {
      setError(`"${bad}" isn't part of a join code. Codes never contain I, O, 0 or 1.`);
      return;
    }

    setChecking(true);
    setError('');
    try {
      const session = await checkSessionStatus(code);
      if (session.status === 'completed') {
        setError(`"${session.title}" has already finished. Your results appear in History once your teacher releases them.`);
        return;
      }
      navigate(`/live/${code}`);
    } catch {
      setError('No exam found with that code. Check it with your teacher — it is six characters.');
    } finally {
      setChecking(false);
    }
  }

  return (
    <div className="screen-fade" style={{ padding: isMobile ? '20px 16px 80px' : '36px 48px 64px', maxWidth: 620 }}>
      <h1 style={{ fontFamily: "'Instrument Serif', serif", fontSize: isMobile ? 32 : 44, margin: '0 0 6px', letterSpacing: '-0.02em' }}>
        Join a Live Exam
      </h1>
      <p style={{ fontSize: isMobile ? 14 : 15, color: 'rgba(11,11,14,0.55)', margin: '0 0 24px', lineHeight: 1.6 }}>
        Your teacher will give you a six-character code when the class is ready to start.
        Enter it here and you'll wait in the lobby until they begin.
      </p>

      <form
        onSubmit={handleJoin}
        style={{ background: '#fff', border: '1px solid #E7E4DE', borderRadius: 16, boxShadow: '0 1px 3px rgba(11,11,14,0.05)', padding: isMobile ? '20px 18px' : '28px 26px' }}
      >
        <label
          htmlFor="join-code"
          style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'rgba(11,11,14,0.65)', marginBottom: 8 }}
        >
          Join code
        </label>
        <input
          id="join-code"
          value={code}
          onChange={(e) => { setCode(normalise(e.target.value)); setError(''); }}
          placeholder="ABC123"
          autoFocus
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          inputMode="text"
          style={{
            width: '100%', height: 62, padding: '0 18px', border: '1px solid #C8C4BC',
            borderRadius: 12, background: '#FBFAF8', color: '#0B0B0E',
            fontSize: isMobile ? 26 : 30, fontWeight: 600, letterSpacing: '0.35em',
            textAlign: 'center', fontFamily: "'JetBrains Mono', monospace", outline: 'none',
            textTransform: 'uppercase',
          }}
        />

        <div style={{ fontSize: 12, color: 'rgba(11,11,14,0.4)', margin: '8px 0 0', textAlign: 'center' }}>
          {code.length}/{CODE_LENGTH}
        </div>

        {error && (
          <div style={{ background: 'rgba(192,57,43,0.06)', border: '1px solid rgba(192,57,43,0.2)', borderRadius: 10, padding: '10px 14px', marginTop: 14, fontSize: 13.5, color: '#C0392B', lineHeight: 1.5 }}>
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={!ready || checking}
          style={{
            width: '100%', height: 46, marginTop: 16, border: 'none', borderRadius: 9999,
            background: ready && !checking ? '#E2562B' : '#E7E4DE',
            color: ready && !checking ? '#fff' : 'rgba(11,11,14,0.35)',
            fontSize: 15, fontWeight: 600, fontFamily: 'inherit',
            cursor: ready && !checking ? 'pointer' : 'default',
          }}
        >
          {checking ? 'Checking…' : 'Join exam'}
        </button>
      </form>

      <p style={{ fontSize: 13, color: 'rgba(11,11,14,0.45)', margin: '18px 0 0', lineHeight: 1.6 }}>
        Already sat one? Released results appear under{' '}
        <button
          onClick={() => navigate('/student/results?tab=live')}
          style={{ background: 'none', border: 'none', padding: 0, font: 'inherit', color: '#E2562B', fontWeight: 600, cursor: 'pointer', textDecoration: 'underline' }}
        >History → Live exams</button>.
      </p>
    </div>
  );
}
