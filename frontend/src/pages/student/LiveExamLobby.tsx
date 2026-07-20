import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../store/auth';
import { joinSession, pollSession, type JoinResponse } from '../../api/liveExam';
import { getApiError } from '../../api/client';

export default function LiveExamLobby() {
  const { joinCode } = useParams<{ joinCode: string }>();
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const [joined, setJoined] = useState<JoinResponse | null>(null);
  const [error, setError] = useState('');
  const [joining, setJoining] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // If not logged in, redirect to login with return path
  useEffect(() => {
    if (!user) {
      navigate(`/login?next=/live/${joinCode}`, { replace: true });
    }
  }, [user, joinCode, navigate]);

  // Attempt to join on mount
  useEffect(() => {
    if (!user || !joinCode) return;
    setJoining(true);
    joinSession(joinCode)
      .then((resp) => {
        setJoined(resp);
        if (resp.status === 'active' && resp.englishExamId) {
          launchExam(resp);
        }
      })
      .catch((err) => setError(getApiError(err)))
      .finally(() => setJoining(false));
  }, [user, joinCode]); // eslint-disable-line react-hooks/exhaustive-deps

  // Poll while waiting
  useEffect(() => {
    if (!joined || joined.status !== 'waiting' || !joinCode) return;
    pollRef.current = setInterval(async () => {
      try {
        const poll = await pollSession(joinCode);
        if (poll.status === 'active' && poll.englishExamId) {
          clearInterval(pollRef.current!);
          launchExam({
            ...joined,
            status: poll.status,
            startedAt: poll.startedAt,
            englishExamId: poll.englishExamId,
            mathExamId: poll.mathExamId,
            englishDurationSeconds: poll.englishDurationSeconds,
            mathDurationSeconds: poll.mathDurationSeconds,
          });
        }
      } catch {
        // ignore polling errors
      }
    }, 3000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [joined, joinCode]); // eslint-disable-line react-hooks/exhaustive-deps

  function launchExam(data: JoinResponse) {
    if (!data.englishExamId) return;
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
    <div
      style={{
        minHeight: '100dvh',
        background: '#FAFAF7',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
      }}
    >
      <div
        style={{
          background: '#fff',
          borderRadius: 20,
          border: '1px solid #E7E4DE',
          padding: '40px 32px',
          maxWidth: 420,
          width: '100%',
          textAlign: 'center',
        }}
      >
        <div
          style={{
            fontSize: 48,
            marginBottom: 16,
          }}
        >
          {error ? '⚠️' : joining ? '⏳' : joined?.status === 'waiting' ? '🕐' : '🚀'}
        </div>

        {error ? (
          <>
            <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 8 }}>Can't join session</h1>
            <p style={{ color: '#666', fontSize: 15 }}>{error}</p>
            <button
              onClick={() => navigate('/student/dashboard')}
              style={{
                marginTop: 24,
                padding: '12px 28px',
                background: '#0B0B0E',
                color: '#fff',
                border: 'none',
                borderRadius: 9999,
                fontFamily: 'inherit',
                fontSize: 14,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Go to Dashboard
            </button>
          </>
        ) : joining ? (
          <>
            <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 8 }}>Joining…</h1>
            <p style={{ color: '#666', fontSize: 15 }}>Connecting to the session.</p>
          </>
        ) : (
          <>
            <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 8 }}>Waiting Room</h1>
            <p style={{ color: '#666', fontSize: 15, marginBottom: 20 }}>
              You're in. The exam will start as soon as your teacher hits "Start Exam".
            </p>
            <div
              style={{
                background: '#F5F3EF',
                borderRadius: 12,
                padding: '12px 20px',
                display: 'inline-block',
                marginBottom: 8,
              }}
            >
              <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.1em', color: '#888', textTransform: 'uppercase' }}>
                Join Code
              </span>
              <p style={{ fontFamily: 'monospace', fontSize: 26, fontWeight: 800, letterSpacing: '0.15em', color: '#0B0B0E', margin: 0 }}>
                {joinCode?.toUpperCase()}
              </p>
            </div>
            <p style={{ fontSize: 13, color: '#aaa', marginTop: 16 }}>
              Logged in as {user.name}
            </p>
            <div style={{ display: 'flex', justifyContent: 'center', gap: 6, marginTop: 20 }}>
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    background: '#0B0B0E',
                    animation: `pulse 1.2s ease-in-out ${i * 0.2}s infinite`,
                    opacity: 0.6,
                  }}
                />
              ))}
            </div>
            <style>{`
              @keyframes pulse {
                0%, 100% { transform: scale(1); opacity: 0.4; }
                50% { transform: scale(1.4); opacity: 1; }
              }
            `}</style>
          </>
        )}
      </div>
    </div>
  );
}
