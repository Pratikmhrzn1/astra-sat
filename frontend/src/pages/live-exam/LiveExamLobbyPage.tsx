import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/store/auth';
import { joinSession, pollSession, type JoinResponse } from '@/api/liveExam';
import { getApiError } from '@/api/http';
import { CARD, H1, JoinCodePlate, KICKER, PillButton, T } from '@/components/live-exam/ui';

/**
 * The waiting room a student sits in between entering the code and the teacher
 * starting the paper.
 *
 * Full-bleed rather than inside the student shell: once you are here you are
 * about to sit an exam, and there is nowhere else to go.
 */

const POLL_MS = 3000;

export default function LiveExamLobby() {
  const { joinCode } = useParams<{ joinCode: string }>();
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const [joined, setJoined] = useState<JoinResponse | null>(null);
  const [error, setError] = useState('');
  const [joining, setJoining] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const launchedRef = useRef(false);

  useEffect(() => {
    if (!user) navigate(`/login?next=/live/${joinCode}`, { replace: true });
  }, [user, joinCode, navigate]);

  useEffect(() => {
    if (!user || !joinCode) return;
    setJoining(true);
    joinSession(joinCode)
      .then((resp) => {
        setJoined(resp);
        launch(resp);
      })
      .catch((err) => setError(getApiError(err)))
      .finally(() => setJoining(false));
  }, [user, joinCode]); // eslint-disable-line react-hooks/exhaustive-deps

  /**
   * Keeps polling until this student actually has a paper in front of them.
   *
   * The condition used to be `status === 'waiting'`, which stranded anyone whose
   * session was already running when they arrived: their status was `active`, so
   * no polling started, and they had no exam id, so nothing launched. Waiting on
   * the exam id instead covers both — a student in the lobby before the start,
   * and one who walked in late.
   */
  useEffect(() => {
    if (!joined || !joinCode || joined.englishExamId) return;

    pollRef.current = setInterval(async () => {
      try {
        const poll = await pollSession(joinCode);
        if (poll.englishExamId) {
          if (pollRef.current) clearInterval(pollRef.current);
          launch({ ...joined, ...poll });
        }
      } catch {
        // A dropped poll is not worth showing mid-lesson; the next one retries.
      }
    }, POLL_MS);

    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [joined, joinCode]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Guarded: a poll landing while navigation is in flight must not fire twice. */
  function launch(data: JoinResponse) {
    if (!data.englishExamId || launchedRef.current) return;
    launchedRef.current = true;
    navigate(`/student/exams/${data.englishExamId}`, {
      state: {
        liveExam: true,
        liveJoinCode: joinCode,
        sectionStartedAt: data.startedAt,
        englishDurationSeconds: data.englishDurationSeconds,
        mathExamId: data.mathExamId,
        mathDurationSeconds: data.mathDurationSeconds,
      },
    });
  }

  if (!user) return null;

  return (
    <div style={{
      minHeight: '100dvh', background: T.paper, display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', padding: '24px 16px', boxSizing: 'border-box',
    }}>
      <div className="screen-fade" style={{ ...CARD, padding: 'clamp(28px, 6vw, 40px) clamp(20px, 5vw, 36px)', maxWidth: 440, width: '100%', boxSizing: 'border-box', textAlign: 'center' }}>
        {error ? (
          <>
            <StateIcon tone="danger">!</StateIcon>
            <h1 style={{ ...H1, fontSize: 28, marginBottom: 8 }}>Can't join</h1>
            <p style={{ fontSize: 14.5, color: T.muted, lineHeight: 1.6, margin: '0 0 24px' }}>{error}</p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
              <PillButton variant="secondary" onClick={() => navigate('/student/dashboard')}>Dashboard</PillButton>
              <PillButton onClick={() => navigate('/student/live-exam')}>Try another code</PillButton>
            </div>
          </>
        ) : joining || !joined ? (
          <div role="status" aria-live="polite" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, padding: '12px 0' }}>
            <span className="lobby-spinner" aria-hidden />
            <p style={{ fontSize: 15, color: T.muted, margin: 0 }}>Joining the exam…</p>
          </div>
        ) : (
          <>
            <StateIcon tone="success">✓</StateIcon>
            <h1 style={{ ...H1, fontSize: 30, marginBottom: 8 }}>You're in</h1>
            <p style={{ fontSize: 14.5, color: T.muted, lineHeight: 1.6, margin: '0 auto 24px', maxWidth: 320 }}>
              Keep this page open. Your paper opens by itself the moment your teacher starts.
            </p>

            <div style={{ background: T.wash, border: `1px solid ${T.lineSoft}`, borderRadius: 12, padding: '14px 12px', marginBottom: 22 }}>
              <div style={{ ...KICKER, marginBottom: 8 }}>Session code</div>
              <div style={{ display: 'flex', justifyContent: 'center' }}>
                <JoinCodePlate code={(joinCode ?? '').toUpperCase()} size="small" />
              </div>
            </div>

            {/* The one piece of motion in this feature: proof the page is still
                listening, on a screen where nothing else moves. */}
            <div
              style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 7 }}
              role="status"
              aria-live="polite"
            >
              {[0, 1, 2].map((i) => (
                <span
                  key={i}
                  aria-hidden
                  className="lobby-dot"
                  style={{ animationDelay: `${i * 0.22}s`, background: T.accent }}
                />
              ))}
              <span style={{ fontSize: 13, color: T.muted, marginLeft: 6 }}>Waiting for your teacher to start</span>
            </div>

            <div style={{ borderTop: `1px solid ${T.lineSoft}`, marginTop: 24, paddingTop: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 12.5, color: T.faint, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>Signed in as <strong style={{ color: T.muted, fontWeight: 600 }}>{user.name}</strong></span>
              <button
                onClick={() => navigate('/student/dashboard')}
                style={{ border: 'none', background: 'none', padding: '4px 0', fontSize: 12.5, fontWeight: 600, color: T.muted, cursor: 'pointer', fontFamily: 'inherit', textDecoration: 'underline', textUnderlineOffset: 2 }}
              >Leave lobby</button>
            </div>
          </>
        )}
      </div>

      <style>{`
        .lobby-dot {
          width: 7px; height: 7px; border-radius: 9999px; display: inline-block;
          animation: lobby-pulse 1.4s ease-in-out infinite;
        }
        @keyframes lobby-pulse {
          0%, 100% { opacity: 0.25; transform: scale(1); }
          50%      { opacity: 1;    transform: scale(1.3); }
        }
        .lobby-spinner {
          width: 26px; height: 26px; border-radius: 9999px; display: block;
          border: 3px solid ${T.lineSoft}; border-top-color: ${T.accent};
          animation: lobby-spin 0.8s linear infinite;
        }
        @keyframes lobby-spin { to { transform: rotate(360deg); } }
        @media (prefers-reduced-motion: reduce) {
          .lobby-dot { animation: none; opacity: 0.6; }
          .lobby-spinner { animation-duration: 2.4s; }
        }
      `}</style>
    </div>
  );
}

/** The round mark above the lobby heading: a tick once joined, "!" when joining failed. */
function StateIcon({ tone, children }: { tone: 'success' | 'danger'; children: React.ReactNode }) {
  const color = tone === 'success' ? T.green : T.danger;
  return (
    <div aria-hidden style={{
      width: 48, height: 48, borderRadius: 9999, margin: '0 auto 16px',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: tone === 'success' ? 'rgba(26,107,60,0.10)' : 'rgba(192,57,43,0.08)',
      color, fontSize: 22, fontWeight: 700, lineHeight: 1,
    }}>{children}</div>
  );
}
