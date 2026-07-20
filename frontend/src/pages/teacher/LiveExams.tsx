import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getLiveSessions, createSession, getLiveExamSets, type LiveExamSession, type LiveExamSet } from '../../api/liveExam';
import { getApiError } from '../../api/client';

export default function LiveExams() {
  const navigate = useNavigate();
  const [sessions, setSessions] = useState<LiveExamSession[]>([]);
  const [sets, setSets] = useState<LiveExamSet[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({ title: '', englishSetId: '', mathSetId: '' });

  useEffect(() => {
    Promise.all([getLiveSessions(), getLiveExamSets()])
      .then(([s, sets]) => {
        setSessions(s);
        setSets(sets);
      })
      .finally(() => setLoading(false));
  }, []);

  const englishSets = sets.filter((s) => s.subject === 'english');
  const mathSets = sets.filter((s) => s.subject === 'math');

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title || !form.englishSetId || !form.mathSetId) {
      setError('All fields are required');
      return;
    }
    setCreating(true);
    setError('');
    try {
      const session = await createSession(form);
      setSessions((prev) => [session, ...prev]);
      setShowCreate(false);
      setForm({ title: '', englishSetId: '', mathSetId: '' });
    } catch (err) {
      setError(getApiError(err));
    } finally {
      setCreating(false);
    }
  }

  function statusBadge(status: string) {
    const colors: Record<string, string> = {
      waiting: 'bg-yellow-100 text-yellow-800',
      active: 'bg-green-100 text-green-800',
      completed: 'bg-gray-100 text-gray-700',
    };
    return (
      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${colors[status] ?? 'bg-gray-100 text-gray-700'}`}>
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </span>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48 text-gray-400 text-sm">Loading…</div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Live Exams</h1>
        <button
          onClick={() => setShowCreate(true)}
          className="bg-black text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-gray-800"
        >
          + New Session
        </button>
      </div>

      {showCreate && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
            <h2 className="text-lg font-bold mb-4">Create Live Exam Session</h2>
            {error && <p className="text-red-500 text-sm mb-3">{error}</p>}
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Session Title</label>
                <input
                  type="text"
                  value={form.title}
                  onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                  placeholder="e.g. Sunday Mock — July 20"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Reading & Writing Set</label>
                {englishSets.length === 0 ? (
                  <p className="text-xs text-gray-400">No live-exam English sets found. Create one in Content Manager.</p>
                ) : (
                  <select
                    value={form.englishSetId}
                    onChange={(e) => setForm((f) => ({ ...f, englishSetId: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black"
                  >
                    <option value="">Select a set…</option>
                    {englishSets.map((s) => (
                      <option key={s.id} value={s.id}>{s.title}</option>
                    ))}
                  </select>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Math Set</label>
                {mathSets.length === 0 ? (
                  <p className="text-xs text-gray-400">No live-exam Math sets found. Create one in Content Manager.</p>
                ) : (
                  <select
                    value={form.mathSetId}
                    onChange={(e) => setForm((f) => ({ ...f, mathSetId: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black"
                  >
                    <option value="">Select a set…</option>
                    {mathSets.map((s) => (
                      <option key={s.id} value={s.id}>{s.title}</option>
                    ))}
                  </select>
                )}
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => { setShowCreate(false); setError(''); }}
                  className="flex-1 border border-gray-300 text-gray-700 text-sm font-medium py-2 rounded-lg hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="flex-1 bg-black text-white text-sm font-semibold py-2 rounded-lg hover:bg-gray-800 disabled:opacity-50"
                >
                  {creating ? 'Creating…' : 'Create Session'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {sessions.length === 0 ? (
        <div className="text-center text-gray-400 py-20 text-sm">
          No live exam sessions yet. Create one to get started.
        </div>
      ) : (
        <div className="space-y-3">
          {sessions.map((s) => (
            <div
              key={s.id}
              onClick={() => navigate(`/teacher/live-exams/${s.id}`)}
              className="bg-white border border-gray-200 rounded-xl p-4 flex items-center justify-between cursor-pointer hover:shadow-sm transition-shadow"
            >
              <div>
                <p className="font-semibold text-gray-900">{s.title}</p>
                <p className="text-xs text-gray-400 mt-0.5">
                  Join code: <span className="font-mono font-bold text-gray-700">{s.joinCode}</span>
                  {s.startedAt && (
                    <span className="ml-3">
                      Started {new Date(s.startedAt).toLocaleDateString()}
                    </span>
                  )}
                </p>
              </div>
              <div className="flex items-center gap-3">
                {statusBadge(s.status)}
                <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
