import { useState, useEffect, useCallback } from 'react';
import React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, CheckCircle2, WifiOff, BookOpen } from 'lucide-react';
import {
  getQuestionSets,
  createQuestionSet,
  getSetQuestions,
  addQuestion,
  deleteQuestion,
  deleteQuestionSet,
} from '../../api/teacher';
import { saveTeacherDraft, loadTeacherDraft, clearTeacherDraft } from '../../lib/offline';
import { Button } from '../../components/ui/Button';
import { Input, Textarea } from '../../components/ui/Input';
import { SubjectBadge } from '../../components/ui/Badge';
import { ConfirmModal } from '../../components/ui/Modal';
import { Spinner } from '../../components/ui/Spinner';
import { getApiError } from '../../api/client';

type Tab = 'create' | 'manage';
type Subject = 'english' | 'math';
type AnswerKey = 'a' | 'b' | 'c' | 'd';

interface QuestionForm {
  questionText: string;
  optionA: string;
  optionB: string;
  optionC: string;
  optionD: string;
  correctAnswer: AnswerKey;
  explanation: string;
}

const emptyForm: QuestionForm = { questionText: '', optionA: '', optionB: '', optionC: '', optionD: '', correctAnswer: 'a', explanation: '' };

function useOnlineStatus() {
  const [online, setOnline] = React.useState(navigator.onLine);
  React.useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);
  return online;
}

const CARD: React.CSSProperties = { background: '#fff', border: '1px solid #E7E4DE', borderRadius: 16, boxShadow: '0 1px 3px rgba(11,11,14,0.05)' };

export default function AddContent() {
  const queryClient = useQueryClient();
  const online = useOnlineStatus();
  const [tab, setTab] = useState<Tab>('create');
  const [setTitle, setSetTitle] = useState('');
  const [setSubject, setSetSubject] = useState<Subject>('english');
  const [setDescription, setSetDescription] = useState('');
  const [activeSetId, setActiveSetId] = useState<string | null>(null);
  const [qForm, setQForm] = useState<QuestionForm>({ ...emptyForm });
  const [qErrors, setQErrors] = useState<Partial<QuestionForm>>({});
  const [createError, setCreateError] = useState('');
  const [draftSaved, setDraftSaved] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<{ type: 'set' | 'question'; id: string } | null>(null);

  const { data: sets = [], isLoading: setsLoading } = useQuery({ queryKey: ['teacher', 'question-sets'], queryFn: getQuestionSets });
  const { data: questions = [] } = useQuery({ queryKey: ['teacher', 'questions', activeSetId], queryFn: () => getSetQuestions(activeSetId!), enabled: !!activeSetId });

  useEffect(() => {
    if (!activeSetId) return;
    loadTeacherDraft(`q-draft-${activeSetId}`).then((saved) => { if (saved?.questionForm) setQForm(saved.questionForm as unknown as QuestionForm); });
  }, [activeSetId]);

  const saveDraft = useCallback(async () => {
    if (!activeSetId) return;
    await saveTeacherDraft(`q-draft-${activeSetId}`, activeSetId, qForm as unknown as Record<string, unknown>);
    setDraftSaved(true);
    setTimeout(() => setDraftSaved(false), 1500);
  }, [activeSetId, qForm]);

  useEffect(() => { const t = setTimeout(saveDraft, 800); return () => clearTimeout(t); }, [qForm, saveDraft]);

  const createSetMutation = useMutation({
    mutationFn: () => createQuestionSet({ title: setTitle.trim(), subject: setSubject, description: setDescription.trim() }),
    onSuccess: (set) => { queryClient.invalidateQueries({ queryKey: ['teacher', 'question-sets'] }); setActiveSetId(set.id); setSetTitle(''); setSetDescription(''); },
    onError: (err) => setCreateError(getApiError(err)),
  });

  const addQuestionMutation = useMutation({
    mutationFn: () => addQuestion(activeSetId!, { questionText: qForm.questionText, optionA: qForm.optionA, optionB: qForm.optionB, optionC: qForm.optionC, optionD: qForm.optionD, correctAnswer: qForm.correctAnswer, explanation: qForm.explanation || undefined, orderIndex: questions.length }),
    onSuccess: async () => { queryClient.invalidateQueries({ queryKey: ['teacher', 'questions', activeSetId] }); await clearTeacherDraft(`q-draft-${activeSetId}`); setQForm({ ...emptyForm }); },
    onError: (err) => setCreateError(getApiError(err)),
  });

  const deleteQMutation = useMutation({
    mutationFn: (qId: string) => deleteQuestion(qId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['teacher', 'questions', activeSetId] }),
  });

  const deleteSetMutation = useMutation({
    mutationFn: (setId: string) => deleteQuestionSet(setId),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['teacher', 'question-sets'] }); if (activeSetId === deleteConfirm?.id) setActiveSetId(null); setDeleteConfirm(null); },
    onError: (err) => setCreateError(getApiError(err)),
  });

  const validateAndAdd = () => {
    const errors: Partial<QuestionForm> = {};
    if (!qForm.questionText.trim()) errors.questionText = 'Required';
    if (!qForm.optionA.trim()) errors.optionA = 'Required';
    if (!qForm.optionB.trim()) errors.optionB = 'Required';
    if (!qForm.optionC.trim()) errors.optionC = 'Required';
    if (!qForm.optionD.trim()) errors.optionD = 'Required';
    setQErrors(errors);
    if (Object.keys(errors).length === 0) addQuestionMutation.mutate();
  };

  const updateQForm = (field: keyof QuestionForm, value: string) => { setQForm((p) => ({ ...p, [field]: value })); setQErrors((p) => ({ ...p, [field]: undefined })); };

  return (
    <div className="screen-fade" style={{ padding: '36px 48px 64px', maxWidth: 900, margin: '0 auto' }}>
      <h1 style={{ fontFamily: "'Instrument Serif', serif", fontSize: 44, margin: '0 0 4px', letterSpacing: '-0.02em', color: '#0B0B0E' }}>Add Content</h1>
      <p style={{ fontSize: 14, color: 'rgba(11,11,14,0.55)', margin: '0 0 24px' }}>Create question sets and add questions</p>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid #E7E4DE', marginBottom: 24 }}>
        {(['create', 'manage'] as Tab[]).map((t) => (
          <button key={t} onClick={() => setTab(t)}
            style={{ padding: '10px 20px', fontSize: 14, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer', border: 'none', background: 'none', borderBottom: tab === t ? '2px solid #E2562B' : '2px solid transparent', color: tab === t ? '#E2562B' : 'rgba(11,11,14,0.5)', transition: 'color 0.15s', marginBottom: -1 }}
          >
            {t === 'create' ? 'Create Question Set' : 'Manage Sets'}
          </button>
        ))}
      </div>

      {tab === 'create' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {!activeSetId ? (
            <div style={{ ...CARD, overflow: 'hidden' }}>
              <div style={{ padding: '18px 24px', borderBottom: '1px solid #EEEBE5' }}>
                <h3 style={{ fontSize: 16, fontWeight: 600, color: '#0B0B0E', margin: 0 }}>New Question Set</h3>
              </div>
              <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
                <Input label="Title" value={setTitle} onChange={(e) => setSetTitle(e.target.value)} placeholder="e.g. SAT English Practice Set 1" />
                <div>
                  <p style={{ fontSize: 13, fontWeight: 600, color: 'rgba(11,11,14,0.65)', marginBottom: 8 }}>Subject</p>
                  <div style={{ display: 'flex', gap: 10 }}>
                    {(['english', 'math'] as Subject[]).map((s) => (
                      <button key={s} onClick={() => setSetSubject(s)}
                        style={{ padding: '9px 22px', borderRadius: 9999, fontSize: 14, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer', border: setSubject === s ? 'none' : '1px solid #E7E4DE', background: setSubject === s ? (s === 'english' ? '#2563A8' : '#B8893E') : '#F2F0EC', color: setSubject === s ? '#fff' : '#8C8880' }}
                      >{s === 'english' ? 'English' : 'Math'}</button>
                    ))}
                  </div>
                </div>
                <Textarea label="Description (optional)" value={setDescription} onChange={(e) => setSetDescription(e.target.value)} placeholder="Brief description of this question set…" />
                {createError && <p style={{ color: '#C0392B', fontSize: 13 }}>{createError}</p>}
                <Button onClick={() => { setCreateError(''); createSetMutation.mutate(); }} loading={createSetMutation.isPending} disabled={!setTitle.trim()} style={{ alignSelf: 'flex-start' }}>
                  Create Set & Add Questions
                </Button>
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <SubjectBadge subject={sets.find((s) => s.id === activeSetId)?.subject ?? 'english'} />
                  <span style={{ fontSize: 15, fontWeight: 600, color: '#0B0B0E' }}>{sets.find((s) => s.id === activeSetId)?.title}</span>
                  <span style={{ fontSize: 12, color: 'rgba(11,11,14,0.45)' }}>{questions.length} question{questions.length !== 1 ? 's' : ''}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  {!online && <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: '#C0392B' }}><WifiOff size={13} />Offline</span>}
                  {draftSaved && <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: '#2E7D5A' }}><CheckCircle2 size={13} />Draft saved</span>}
                  <Button variant="secondary" size="sm" onClick={() => setActiveSetId(null)}>Done</Button>
                </div>
              </div>

              <div style={{ ...CARD, overflow: 'hidden' }}>
                <div style={{ padding: '18px 24px', borderBottom: '1px solid #EEEBE5' }}>
                  <h3 style={{ fontSize: 16, fontWeight: 600, color: '#0B0B0E', margin: 0 }}>Add Question</h3>
                </div>
                <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <Textarea label="Question text" value={qForm.questionText} onChange={(e) => updateQForm('questionText', e.target.value)} error={qErrors.questionText} placeholder="Enter the question…" rows={3} />
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    {(['A', 'B', 'C', 'D'] as const).map((letter) => {
                      const key = `option${letter}` as keyof QuestionForm;
                      return <Input key={letter} label={`Option ${letter}`} value={qForm[key] as string} onChange={(e) => updateQForm(key, e.target.value)} error={qErrors[key]} placeholder={`Enter option ${letter}…`} />;
                    })}
                  </div>
                  <div>
                    <p style={{ fontSize: 13, fontWeight: 600, color: 'rgba(11,11,14,0.65)', marginBottom: 8 }}>Correct Answer</p>
                    <div style={{ display: 'flex', gap: 8 }}>
                      {(['a', 'b', 'c', 'd'] as AnswerKey[]).map((key) => (
                        <button key={key} onClick={() => updateQForm('correctAnswer', key)}
                          style={{ width: 42, height: 42, borderRadius: 10, fontWeight: 700, fontSize: 15, fontFamily: 'inherit', cursor: 'pointer', border: 'none', background: qForm.correctAnswer === key ? '#2E7D5A' : '#F2F0EC', color: qForm.correctAnswer === key ? '#fff' : '#8C8880', transition: 'all 0.15s' }}
                        >{key.toUpperCase()}</button>
                      ))}
                    </div>
                  </div>
                  <Textarea label="Explanation (optional)" value={qForm.explanation} onChange={(e) => updateQForm('explanation', e.target.value)} placeholder="Explain why the correct answer is right…" rows={2} />
                  {createError && <p style={{ color: '#C0392B', fontSize: 13 }}>{createError}</p>}
                  <Button onClick={validateAndAdd} loading={addQuestionMutation.isPending} style={{ alignSelf: 'flex-start' }}>
                    <Plus size={15} style={{ marginRight: 6 }} />Add Question
                  </Button>
                </div>
              </div>

              {questions.length > 0 && (
                <div style={{ ...CARD, overflow: 'hidden' }}>
                  <div style={{ padding: '14px 22px', borderBottom: '1px solid #EEEBE5' }}>
                    <h3 style={{ fontSize: 15, fontWeight: 600, color: '#0B0B0E', margin: 0 }}>Questions Added ({questions.length})</h3>
                  </div>
                  {questions.map((q, i) => (
                    <div key={q.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '13px 22px', borderBottom: i < questions.length - 1 ? '1px solid #F2F0EC' : 'none' }}>
                      <span style={{ width: 24, height: 24, borderRadius: 7, background: '#F2F0EC', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 600, color: 'rgba(11,11,14,0.5)', flexShrink: 0, marginTop: 2 }}>{i + 1}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontSize: 13.5, color: '#0B0B0E', margin: '0 0 3px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{q.questionText}</p>
                        <p style={{ fontSize: 12, color: '#2E7D5A', margin: 0, fontWeight: 600 }}>Correct: {q.correctAnswer.toUpperCase()}</p>
                      </div>
                      <button onClick={() => setDeleteConfirm({ type: 'question', id: q.id })}
                        style={{ padding: 6, borderRadius: 7, border: 'none', background: 'transparent', cursor: 'pointer', color: 'rgba(11,11,14,0.3)', flexShrink: 0 }}
                        onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(192,57,43,0.08)'; e.currentTarget.style.color = '#C0392B'; }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'rgba(11,11,14,0.3)'; }}
                      ><Trash2 size={14} /></button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {tab === 'manage' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {setsLoading ? (
            <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 64 }}><Spinner className="w-8 h-8 text-[#E2562B]" /></div>
          ) : sets.length === 0 ? (
            <div style={{ textAlign: 'center', paddingTop: 64 }}>
              <BookOpen size={48} color="rgba(11,11,14,0.2)" style={{ margin: '0 auto 16px', display: 'block' }} />
              <p style={{ color: 'rgba(11,11,14,0.4)', fontSize: 14 }}>No question sets yet.</p>
            </div>
          ) : (
            sets.map((set) => (
              <div key={set.id} style={{ ...CARD, padding: '18px 22px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
                  <SubjectBadge subject={set.subject} />
                  <div style={{ minWidth: 0 }}>
                    <p style={{ fontSize: 14.5, fontWeight: 600, color: '#0B0B0E', margin: '0 0 2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{set.title}</p>
                    {set.description && <p style={{ fontSize: 12, color: 'rgba(11,11,14,0.45)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{set.description}</p>}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                  <Button variant="secondary" size="sm" onClick={() => { setActiveSetId(set.id); setTab('create'); }}>Edit</Button>
                  <Button variant="danger" size="sm" onClick={() => setDeleteConfirm({ type: 'set', id: set.id })}><Trash2 size={14} /></Button>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      <ConfirmModal
        isOpen={!!deleteConfirm} onClose={() => setDeleteConfirm(null)}
        onConfirm={() => {
          if (!deleteConfirm) return;
          if (deleteConfirm.type === 'question') { deleteQMutation.mutate(deleteConfirm.id); setDeleteConfirm(null); }
          else deleteSetMutation.mutate(deleteConfirm.id);
        }}
        loading={deleteQMutation.isPending || deleteSetMutation.isPending}
        title={deleteConfirm?.type === 'question' ? 'Delete Question?' : 'Delete Question Set?'}
        message={deleteConfirm?.type === 'question' ? 'This question will be permanently deleted.' : 'This will delete the entire question set. This action cannot be undone.'}
        confirmLabel="Delete"
      />
    </div>
  );
}
