import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  getSessionDetail,
  startSession,
  releaseOne,
  releaseAll,
  type SessionDetail,
  type LiveExamParticipant,
} from '@/features/live-exam/api/live-exam.api';
import { getApiError } from '@/shared/api/client';

export default function LiveExamSession() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const [session, setSession] = useState<SessionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionError, setActionError] = useState('');
  const [starting, setStarting] = useState(false);
  const [releasing, setReleasing] = useState(false);

  const load = useCallback(async () => {
    if (!sessionId) return;
    try {
      const s = await getSessionDetail(sessionId);
      setSession(s);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  useEffect(() => {
    load();
    // Poll every 3s when waiting or active
    const iv = setInterval(load, 3000);
    return () => clearInterval(iv);
  }, [load]);

  async function handleStart() {
    if (!session) return;
    setStarting(true);
    setActionError('');
    try {
      await startSession(session.id);
      await load();
    } catch (err) {
      setActionError(getApiError(err));
    } finally {
      setStarting(false);
    }
  }

  async function handleReleaseOne(p: LiveExamParticipant) {
    if (!session) return;
    setActionError('');
    try {
      await releaseOne(session.id, p.id);
      await load();
    } catch (err) {
      setActionError(getApiError(err));
    }
  }

  async function handleReleaseAll() {
    if (!session) return;
    setReleasing(true);
    setActionError('');
    try {
      await releaseAll(session.id);
      await load();
    } catch (err) {
      setActionError(getApiError(err));
    } finally {
      setReleasing(false);
    }
  }

  function statusBadge(status: string) {
    const map: Record<string, string> = {
      waiting: 'bg-yellow-100 text-yellow-800',
      active: 'bg-green-100 text-green-800',
      completed: 'bg-gray-100 text-gray-700',
    };
    return (
      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${map[status] ?? 'bg-gray-100'}`}>
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </span>
    );
  }

  if (loading) {
    return <div className="flex items-center justify-center h-48 text-gray-400 text-sm">Loading…</div>;
  }

  if (!session) {
    return <div className="p-6 text-red-500">Session not found.</div>;
  }

  const unreleased = session.participants.filter((p) => !p.resultReleased);

  return (
    <div className="max-w-4xl mx-auto p-6">
      {/* Header */}
      <button
        onClick={() => navigate('/teacher/live-exams')}
        className="text-sm text-gray-500 hover:text-gray-800 mb-4 flex items-center gap-1"
      >
        ← Back to Live Exams
      </button>

      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{session.title}</h1>
          <p className="text-sm text-gray-500 mt-1">
            Join code:{' '}
            <span className="font-mono font-bold text-gray-800 text-base tracking-widest">
              {session.joinCode}
            </span>
          </p>
        </div>
        <div className="flex items-center gap-3">
          {statusBadge(session.status)}
          {session.status === 'waiting' && (
            <button
              onClick={handleStart}
              disabled={starting || session.participants.length === 0}
              className="bg-green-600 text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-green-700 disabled:opacity-50"
            >
              {starting ? 'Starting…' : 'Start Exam'}
            </button>
          )}
          {session.status !== 'waiting' && unreleased.length > 0 && (
            <button
              onClick={handleReleaseAll}
              disabled={releasing}
              className="bg-black text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-gray-800 disabled:opacity-50"
            >
              {releasing ? 'Sending…' : 'Send Results to All'}
            </button>
          )}
        </div>
      </div>

      {actionError && (
        <div className="mb-4 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-2">
          {actionError}
        </div>
      )}

      {/* Share link */}
      <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 mb-6">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Student Join Link</p>
        <p className="font-mono text-sm text-gray-800 break-all">
          {window.location.origin}/sat/live/{session.joinCode}
        </p>
      </div>

      {/* Participants */}
      <div>
        <h2 className="text-base font-semibold text-gray-800 mb-3">
          Participants ({session.participants.length})
        </h2>

        {session.participants.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-10">
            No students have joined yet. Share the join link above.
          </p>
        ) : (
          <div className="space-y-2">
            {session.participants.map((p) => (
              <div
                key={p.id}
                className="bg-white border border-gray-200 rounded-xl px-4 py-3 flex items-center justify-between"
              >
                <div>
                  <p className="font-medium text-gray-900">{p.name}</p>
                  <p className="text-xs text-gray-400">{p.email}</p>
                </div>
                <div className="flex items-center gap-3">
                  {p.resultReleased ? (
                    <span className="text-xs text-green-600 font-semibold">Results sent</span>
                  ) : (
                    session.status !== 'waiting' && (
                      <button
                        onClick={() => handleReleaseOne(p)}
                        className="text-xs font-semibold text-blue-600 hover:text-blue-800 border border-blue-200 px-3 py-1 rounded-full"
                      >
                        Send Results
                      </button>
                    )
                  )}
                  {session.status !== 'waiting' && (
                    <button
                      onClick={() => navigate(`/teacher/live-exams/${session.id}/participants/${p.id}`)}
                      className="text-xs text-gray-500 hover:text-gray-800 border border-gray-200 px-3 py-1 rounded-full"
                    >
                      View Result
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
