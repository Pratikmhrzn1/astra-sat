import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  getParticipantDetail,
  saveFeedback,
  releaseOne,
  type ParticipantDetail,
} from '@/features/live-exam/api/live-exam.api';
import { getApiError } from '@/shared/api/client';
import { apiClient } from '@/shared/api/client';

interface ExamResults {
  score: number | null;
  totalQuestions: number;
  answers: {
    id: string;
    questionId: string;
    questionText: string;
    selectedAnswer: string | null;
    correctAnswer: string | null;
    isCorrect: boolean;
  }[];
  narrative: string | null;
}

export default function LiveExamStudentResult() {
  const { sessionId, participantId } = useParams<{ sessionId: string; participantId: string }>();
  const navigate = useNavigate();
  const [participant, setParticipant] = useState<ParticipantDetail | null>(null);
  const [englishResults, setEnglishResults] = useState<ExamResults | null>(null);
  const [mathResults, setMathResults] = useState<ExamResults | null>(null);
  const [loading, setLoading] = useState(true);
  const [globalFeedback, setGlobalFeedback] = useState('');
  const [saving, setSaving] = useState(false);
  const [releasing, setReleasing] = useState(false);
  const [saveMsg, setSaveMsg] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!sessionId || !participantId) return;
    async function load() {
      try {
        const p = await getParticipantDetail(sessionId!, participantId!);
        setParticipant(p);
        setGlobalFeedback(p.globalFeedback ?? '');

        const fetches = [];
        if (p.englishExamId) {
          fetches.push(
            apiClient.get(`/api/teacher/students/${p.studentId}/exams/${p.englishExamId}/results`)
              .then((r) => setEnglishResults(r.data as ExamResults))
              .catch(() => null)
          );
        }
        if (p.mathExamId) {
          fetches.push(
            apiClient.get(`/api/teacher/students/${p.studentId}/exams/${p.mathExamId}/results`)
              .then((r) => setMathResults(r.data as ExamResults))
              .catch(() => null)
          );
        }
        await Promise.all(fetches);
      } catch {
        setError('Failed to load results');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [sessionId, participantId]);

  async function handleSave() {
    if (!sessionId || !participantId) return;
    setSaving(true);
    setSaveMsg('');
    try {
      await saveFeedback(sessionId, participantId, { globalFeedback });
      setSaveMsg('Feedback saved.');
    } catch (err) {
      setError(getApiError(err));
    } finally {
      setSaving(false);
    }
  }

  async function handleRelease() {
    if (!sessionId || !participantId || !participant) return;
    setReleasing(true);
    try {
      await saveFeedback(sessionId, participantId, { globalFeedback });
      await releaseOne(sessionId, participantId);
      navigate(`/teacher/live-exams/${sessionId}`);
    } catch (err) {
      setError(getApiError(err));
    } finally {
      setReleasing(false);
    }
  }

  function scorePercent(results: ExamResults | null) {
    if (!results || !results.score) return null;
    return Math.round((results.score / results.totalQuestions) * 100);
  }

  if (loading) {
    return <div className="flex items-center justify-center h-48 text-gray-400 text-sm">Loading…</div>;
  }

  if (error && !participant) {
    return <div className="p-6 text-red-500">{error}</div>;
  }

  if (!participant) return null;

  const engPct = scorePercent(englishResults);
  const mathPct = scorePercent(mathResults);

  return (
    <div className="max-w-3xl mx-auto p-6">
      <button
        onClick={() => navigate(`/teacher/live-exams/${sessionId}`)}
        className="text-sm text-gray-500 hover:text-gray-800 mb-4 flex items-center gap-1"
      >
        ← Back to Session
      </button>

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{participant.name}</h1>
          <p className="text-sm text-gray-500">{participant.email}</p>
        </div>
        {participant.resultReleased && (
          <span className="text-xs font-semibold text-green-700 bg-green-100 px-3 py-1 rounded-full">
            Results already sent
          </span>
        )}
      </div>

      {/* Score summary */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        <div className="bg-white border border-gray-200 rounded-xl p-4 text-center">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Reading & Writing</p>
          {englishResults ? (
            <p className="text-3xl font-bold text-gray-900">
              {englishResults.score ?? 0}/{englishResults.totalQuestions}
              <span className="text-base text-gray-400 ml-2">({engPct}%)</span>
            </p>
          ) : (
            <p className="text-gray-400 text-sm">Not submitted</p>
          )}
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4 text-center">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Math</p>
          {mathResults ? (
            <p className="text-3xl font-bold text-gray-900">
              {mathResults.score ?? 0}/{mathResults.totalQuestions}
              <span className="text-base text-gray-400 ml-2">({mathPct}%)</span>
            </p>
          ) : (
            <p className="text-gray-400 text-sm">Not submitted</p>
          )}
        </div>
      </div>

      {/* AI narrative */}
      {(englishResults?.narrative || mathResults?.narrative) && (
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 mb-6">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">AI Summary</p>
          {englishResults?.narrative && (
            <div className="mb-3">
              <p className="text-xs text-gray-500 font-medium mb-1">Reading & Writing</p>
              <p className="text-sm text-gray-700 whitespace-pre-line">{englishResults.narrative}</p>
            </div>
          )}
          {mathResults?.narrative && (
            <div>
              <p className="text-xs text-gray-500 font-medium mb-1">Math</p>
              <p className="text-sm text-gray-700 whitespace-pre-line">{mathResults.narrative}</p>
            </div>
          )}
        </div>
      )}

      {/* Question list (collapsed view) */}
      {[
        { label: 'Reading & Writing', results: englishResults },
        { label: 'Math', results: mathResults },
      ].map(({ label, results }) =>
        results ? (
          <div key={label} className="mb-6">
            <p className="text-sm font-semibold text-gray-700 mb-2">{label} — Questions</p>
            <div className="space-y-2">
              {results.answers.map((a, i) => (
                <div
                  key={a.id}
                  className={`rounded-xl border px-4 py-3 text-sm ${
                    a.isCorrect
                      ? 'bg-green-50 border-green-200'
                      : 'bg-red-50 border-red-200'
                  }`}
                >
                  <p className="font-medium text-gray-800 mb-0.5">Q{i + 1}. {a.questionText.slice(0, 120)}{a.questionText.length > 120 ? '…' : ''}</p>
                  <p className="text-xs text-gray-500">
                    Student: <span className={a.isCorrect ? 'text-green-700 font-semibold' : 'text-red-700 font-semibold'}>
                      {a.selectedAnswer ?? 'No answer'}
                    </span>
                    {!a.isCorrect && a.correctAnswer && (
                      <span className="ml-3 text-gray-500">Correct: <span className="font-semibold text-gray-700">{a.correctAnswer}</span></span>
                    )}
                  </p>
                </div>
              ))}
            </div>
          </div>
        ) : null
      )}

      {/* Feedback */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 mb-6">
        <label className="block text-sm font-semibold text-gray-700 mb-2">
          Feedback to Student <span className="text-gray-400 font-normal">(optional)</span>
        </label>
        <textarea
          value={globalFeedback}
          onChange={(e) => setGlobalFeedback(e.target.value)}
          rows={5}
          placeholder="Write overall feedback for this student's performance…"
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-black"
        />
        {saveMsg && <p className="text-xs text-green-600 mt-1">{saveMsg}</p>}
        {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
      </div>

      <div className="flex gap-3">
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex-1 border border-gray-300 text-gray-700 text-sm font-semibold py-2.5 rounded-xl hover:bg-gray-50 disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save Feedback'}
        </button>
        {!participant.resultReleased && (
          <button
            onClick={handleRelease}
            disabled={releasing}
            className="flex-1 bg-black text-white text-sm font-semibold py-2.5 rounded-xl hover:bg-gray-800 disabled:opacity-50"
          >
            {releasing ? 'Sending…' : 'Save & Send Results'}
          </button>
        )}
      </div>
    </div>
  );
}
