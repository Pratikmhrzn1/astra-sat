import { useState, useRef, useCallback, useEffect } from 'react';
import React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, BookOpen, ChevronLeft, WifiOff, CheckCircle2, FileText, Upload } from 'lucide-react';
import {
  getQuestionSets, createQuestionSet, deleteQuestionSet, publishQuestionSet,
  getSetPassages, createPassage, deletePassage,
  getSetQuestions, addQuestion, deleteQuestion, updateQuestionSubSkill,
  importQuestionSetFromJSON,
  getTeacherVocabWords, createTeacherVocabWord, deleteTeacherVocabWord,
} from '../../api/teacher';
import type { QuestionSet, Passage, Question, SubSkill, TeacherVocabWord } from '../../api/teacher';
import { saveTeacherDraft, loadTeacherDraft, clearTeacherDraft } from '../../lib/offline';
import { Button } from '../../components/ui/Button';
import { Input, Textarea } from '../../components/ui/Input';
import { SubjectBadge } from '../../components/ui/Badge';
import { ConfirmModal } from '../../components/ui/Modal';
import { Spinner } from '../../components/ui/Spinner';
import { getApiError } from '../../api/client';

type EditorTab = 'questions' | 'passages';
type QuestionType = 'multiple_choice' | 'student_produced_response';

const SUB_SKILL_OPTIONS: { value: SubSkill; label: string }[] = [
  { value: 'grammar', label: 'Grammar' },
  { value: 'inference', label: 'Inference / Main Idea' },
  { value: 'command_of_evidence', label: 'Command of Evidence' },
  { value: 'vocab_in_context', label: 'Vocabulary in Context' },
  { value: 'transitions', label: 'Transitions / Rhetoric' },
];

interface MCForm {
  questionType: 'multiple_choice';
  passageId: string;
  subSkill: SubSkill | '';
  questionText: string;
  optionA: string; optionB: string; optionC: string; optionD: string;
  correctAnswer: 'a' | 'b' | 'c' | 'd';
  explanation: string;
}

interface SPRForm {
  questionType: 'student_produced_response';
  passageId: string;
  subSkill: SubSkill | '';
  questionText: string;
  correctAnswerText: string;
  explanation: string;
}

type QuestionForm = MCForm | SPRForm;

const emptyMC: MCForm = { questionType: 'multiple_choice', passageId: '', subSkill: '', questionText: '', optionA: '', optionB: '', optionC: '', optionD: '', correctAnswer: 'a', explanation: '' };
const emptySPR: SPRForm = { questionType: 'student_produced_response', passageId: '', subSkill: '', questionText: '', correctAnswerText: '', explanation: '' };

// ── Math Symbol Toolbar ──────────────────────────────────────────────────────

const SYMBOL_GROUPS = [
  { label: 'Sup', tip: 'Superscripts', symbols: ['²', '³', '¹', '⁰', '⁴', '⁵', '⁶', '⁷', '⁸', '⁹', '⁻', '⁺', 'ⁿ'] },
  { label: 'Sub', tip: 'Subscripts', symbols: ['₀', '₁', '₂', '₃', '₄', '₅', '₆', '₇', '₈', '₉'] },
  { label: 'Ops', tip: 'Operations', symbols: ['×', '÷', '±', '√', '∛', '∜', '∞', '·'] },
  { label: 'Rel', tip: 'Relations', symbols: ['≤', '≥', '≠', '≈', '≡', '∝'] },
  { label: 'Grk', tip: 'Greek letters', symbols: ['π', 'θ', 'α', 'β', 'γ', 'δ', 'λ', 'μ', 'σ', 'φ', 'ω'] },
  { label: '…', tip: 'Other symbols', symbols: ['°', '∠', '△', '∑', '∫', '½', '⅓', '⅔', '¼', '¾'] },
];

function MathToolbar({ onInsert }: { onInsert: (s: string) => void }) {
  const [open, setOpen] = useState<string | null>(null);
  return (
    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 6 }}>
      <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'rgba(11,11,14,0.4)', alignSelf: 'center', marginRight: 4 }}>Math</span>
      {SYMBOL_GROUPS.map((g) => (
        <div key={g.label} style={{ position: 'relative' }}>
          <button
            type="button"
            title={g.tip}
            onClick={() => setOpen(open === g.label ? null : g.label)}
            style={{ padding: '3px 8px', fontSize: 11, fontWeight: 600, border: '1px solid #E7E4DE', borderRadius: 6, background: open === g.label ? '#0B0B0E' : '#F2F0EC', color: open === g.label ? '#fff' : '#0B0B0E', cursor: 'pointer', fontFamily: 'inherit' }}
          >{g.label} ▾</button>
          {open === g.label && (
            <div style={{ position: 'absolute', top: '100%', left: 0, marginTop: 4, background: '#fff', border: '1px solid #E7E4DE', borderRadius: 10, padding: 8, zIndex: 50, display: 'flex', flexWrap: 'wrap', gap: 4, width: 200, boxShadow: '0 8px 24px rgba(11,11,14,0.12)' }}>
              {g.symbols.map((sym) => (
                <button
                  key={sym}
                  type="button"
                  onClick={() => { onInsert(sym); setOpen(null); }}
                  style={{ minWidth: 30, height: 30, padding: '0 6px', border: '1px solid #E7E4DE', borderRadius: 7, background: '#F8F7F4', color: '#0B0B0E', cursor: 'pointer', fontSize: 14, fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                >{sym}</button>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function useOnlineStatus() {
  const [online, setOnline] = React.useState(navigator.onLine);
  React.useEffect(() => {
    const on = () => setOnline(true); const off = () => setOnline(false);
    window.addEventListener('online', on); window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);
  return online;
}

const CARD: React.CSSProperties = { background: '#fff', border: '1px solid #E7E4DE', borderRadius: 16, boxShadow: '0 1px 3px rgba(11,11,14,0.05)' };

// ── Main Component ───────────────────────────────────────────────────────────

export default function ContentManager() {
  const queryClient = useQueryClient();
  const online = useOnlineStatus();

  // View state
  const [activeSet, setActiveSet] = useState<QuestionSet | null>(null);
  const [editorTab, setEditorTab] = useState<EditorTab>('questions');

  // New set form
  const [newSetTitle, setNewSetTitle] = useState('');
  const [newSetSubject, setNewSetSubject] = useState<'english' | 'math'>('english');
  const [newSetDesc, setNewSetDesc] = useState('');
  const [newSetDifficulty, setNewSetDifficulty] = useState<'low' | 'medium' | 'hard' | ''>('');
  const [newSetIsLiveExam, setNewSetIsLiveExam] = useState(false);
  const [setError, setSetError] = useState('');
  const [showNewSet, setShowNewSet] = useState(false);

  // Passage form
  const [passageTitle, setPassageTitle] = useState('');
  const [passageText, setPassageText] = useState('');
  const [passageError, setPassageError] = useState('');

  // Question form
  const [qType, setQType] = useState<QuestionType>('multiple_choice');
  const [qForm, setQForm] = useState<QuestionForm>({ ...emptyMC });
  const [qErrors, setQErrors] = useState<Record<string, string>>({});
  const [qError, setQError] = useState('');
  const [draftSaved, setDraftSaved] = useState(false);
  const [doneSaving, setDoneSaving] = useState(false);

  // JSON import
  const [jsonImporting, setJsonImporting] = useState(false);
  const [jsonImportError, setJsonImportError] = useState('');
  const jsonFileRef = useRef<HTMLInputElement | null>(null);

  const handleJsonUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    setJsonImportError('');
    setJsonImporting(true);
    try {
      const text = await file.text();
      const payload = JSON.parse(text);
      if (!payload.title || !payload.subject || !Array.isArray(payload.questions)) {
        throw new Error('JSON must include "title", "subject", and "questions" array.');
      }
      const result = await importQuestionSetFromJSON(payload);
      queryClient.invalidateQueries({ queryKey: ['teacher', 'question-sets'] });
      setActiveSet(result.set);
      setEditorTab('questions');
      setQType('multiple_choice');
      setQForm({ ...emptyMC });
    } catch (err: unknown) {
      const msg = err instanceof SyntaxError ? 'Invalid JSON file.' : (err as Error).message ?? 'Import failed.';
      setJsonImportError(msg);
    } finally {
      setJsonImporting(false);
    }
  }, [queryClient]);

  // Delete confirm
  const [deleteTarget, setDeleteTarget] = useState<{ type: 'set' | 'question' | 'passage'; id: string } | null>(null);

  // Sets list subject filter
  const [subjectFilter, setSubjectFilter] = useState<'all' | 'english' | 'math'>('all');
  const [mainView, setMainView] = useState<'sets' | 'vocab'>('sets');

  // Vocab bank state
  const [vocabForm, setVocabForm] = useState({ word: '', definition: '', exampleSentence: '' });
  const [vocabFormError, setVocabFormError] = useState('');
  const { data: vocabWords = [], isLoading: vocabLoading } = useQuery({ queryKey: ['teacher', 'vocab-words'], queryFn: getTeacherVocabWords });
  const addVocabMutation = useMutation({
    mutationFn: createTeacherVocabWord,
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['teacher', 'vocab-words'] }); setVocabForm({ word: '', definition: '', exampleSentence: '' }); setVocabFormError(''); },
    onError: () => setVocabFormError('Failed to add word. Please try again.'),
  });
  const deleteVocabMutation = useMutation({
    mutationFn: deleteTeacherVocabWord,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['teacher', 'vocab-words'] }),
  });

  // Question list filter
  type QFilter = 'all' | 'ai_suggested' | 'untagged';
  const [qFilter, setQFilter] = useState<QFilter>('all');

  // Symbol insertion — track active textarea by field name
  const [activeField, setActiveField] = useState<string | null>(null);
  const textareaRefs = useRef<Record<string, HTMLTextAreaElement | null>>({});

  const isMath = activeSet?.subject === 'math';

  // Queries
  const { data: sets = [], isLoading: setsLoading } = useQuery({ queryKey: ['teacher', 'question-sets'], queryFn: getQuestionSets });
  const { data: passages = [] } = useQuery({ queryKey: ['teacher', 'passages', activeSet?.id], queryFn: () => getSetPassages(activeSet!.id), enabled: !!activeSet });
  const { data: questions = [] } = useQuery({ queryKey: ['teacher', 'questions', activeSet?.id], queryFn: () => getSetQuestions(activeSet!.id), enabled: !!activeSet });

  // Switch question type — keep shared fields
  const switchQType = (t: QuestionType) => {
    setQType(t);
    if (t === 'multiple_choice') {
      setQForm({ ...emptyMC, passageId: (qForm as any).passageId ?? '', questionText: qForm.questionText, explanation: qForm.explanation });
    } else {
      setQForm({ ...emptySPR, passageId: (qForm as any).passageId ?? '', questionText: qForm.questionText, explanation: qForm.explanation });
    }
    setQErrors({});
  };

  // Draft auto-save (question form)
  const saveDraft = useCallback(async () => {
    if (!activeSet) return;
    await saveTeacherDraft(`q-draft-${activeSet.id}`, activeSet.id, qForm as unknown as Record<string, unknown>);
    setDraftSaved(true);
    setTimeout(() => setDraftSaved(false), 1500);
  }, [activeSet, qForm]);

  useEffect(() => { const t = setTimeout(saveDraft, 900); return () => clearTimeout(t); }, [qForm, saveDraft]);

  useEffect(() => {
    if (!activeSet) return;
    loadTeacherDraft(`q-draft-${activeSet.id}`).then((saved) => {
      if (saved?.questionForm?.questionText) setQForm(saved.questionForm as unknown as QuestionForm);
    });
  }, [activeSet?.id]);

  // Symbol toolbar insertion
  const handleSymbolInsert = useCallback((symbol: string) => {
    if (!activeField) return;
    const el = textareaRefs.current[activeField];
    if (!el) return;
    const start = el.selectionStart ?? el.value.length;
    const end = el.selectionEnd ?? el.value.length;
    const newCursorPos = start + symbol.length;
    const newValue = el.value.substring(0, start) + symbol + el.value.substring(end);
    setQForm((prev) => ({ ...prev, [activeField]: newValue } as QuestionForm));
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(newCursorPos, newCursorPos); });
  }, [activeField]);

  function registerRef(field: string) {
    return (el: HTMLTextAreaElement | null) => { textareaRefs.current[field] = el; };
  }

  function focusField(field: string) {
    return () => setActiveField(field);
  }

  function updateQ(field: string, value: string) {
    setQForm((prev) => ({ ...prev, [field]: value } as QuestionForm));
    setQErrors((e) => { const n = { ...e }; delete n[field]; return n; });
  }

  // Mutations — sets
  const createSetMutation = useMutation({
    mutationFn: () => createQuestionSet({ title: newSetTitle.trim(), subject: newSetSubject, description: newSetDesc.trim(), difficulty: newSetDifficulty || null, isLiveExam: newSetIsLiveExam }),
    onSuccess: (set) => {
      queryClient.invalidateQueries({ queryKey: ['teacher', 'question-sets'] });
      setActiveSet(set); setNewSetTitle(''); setNewSetDesc(''); setNewSetDifficulty(''); setNewSetIsLiveExam(false); setShowNewSet(false); setSetError('');
    },
    onError: (err) => setSetError(getApiError(err)),
  });

  const deleteSetMutation = useMutation({
    mutationFn: (id: string) => deleteQuestionSet(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['teacher', 'question-sets'] });
      if (activeSet?.id === deleteTarget?.id) setActiveSet(null);
      setDeleteTarget(null);
    },
  });

  // Mutations — passages
  const createPassageMutation = useMutation({
    mutationFn: () => createPassage(activeSet!.id, { title: passageTitle.trim(), passageText: passageText.trim(), orderIndex: passages.length }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['teacher', 'passages', activeSet?.id] });
      setPassageTitle(''); setPassageText(''); setPassageError('');
    },
    onError: (err) => setPassageError(getApiError(err)),
  });

  const deletePassageMutation = useMutation({
    mutationFn: (id: string) => deletePassage(id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['teacher', 'passages', activeSet?.id] }); setDeleteTarget(null); },
  });

  // Mutations — questions
  const addQuestionMutation = useMutation({
    mutationFn: () => {
      const base = { passageId: (qForm as any).passageId || null, subSkill: (qForm.subSkill || null) as SubSkill | null, questionText: qForm.questionText, explanation: qForm.explanation || null, orderIndex: questions.length };
      if (qForm.questionType === 'multiple_choice') {
        const f = qForm as MCForm;
        return addQuestion(activeSet!.id, { ...base, questionType: 'multiple_choice', optionA: f.optionA, optionB: f.optionB, optionC: f.optionC, optionD: f.optionD, correctAnswer: f.correctAnswer, correctAnswerText: null });
      } else {
        const f = qForm as SPRForm;
        return addQuestion(activeSet!.id, { ...base, questionType: 'student_produced_response', optionA: null, optionB: null, optionC: null, optionD: null, correctAnswer: null, correctAnswerText: f.correctAnswerText });
      }
    },
    onSuccess: async () => {
      queryClient.invalidateQueries({ queryKey: ['teacher', 'questions', activeSet?.id] });
      if (activeSet) await clearTeacherDraft(`q-draft-${activeSet.id}`);
      setQForm(qType === 'multiple_choice' ? { ...emptyMC } : { ...emptySPR });
      setQErrors({}); setQError('');
    },
    onError: (err) => setQError(getApiError(err)),
  });

  const deleteQuestionMutation = useMutation({
    mutationFn: (id: string) => deleteQuestion(id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['teacher', 'questions', activeSet?.id] }); setDeleteTarget(null); },
  });

  const confirmSubSkillMutation = useMutation({
    mutationFn: (questionId: string) => updateQuestionSubSkill(questionId, { subSkillSource: 'human_confirmed' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['teacher', 'questions', activeSet?.id] }),
  });

  const overrideSubSkillMutation = useMutation({
    mutationFn: ({ questionId, subSkill }: { questionId: string; subSkill: SubSkill }) =>
      updateQuestionSubSkill(questionId, { subSkill, subSkillSource: 'human_confirmed' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['teacher', 'questions', activeSet?.id] }),
  });

  function validateAndAdd() {
    const errors: Record<string, string> = {};
    if (!qForm.questionText.trim()) errors.questionText = 'Required';
    if (qForm.questionType === 'multiple_choice') {
      const f = qForm as MCForm;
      if (!f.optionA.trim()) errors.optionA = 'Required';
      if (!f.optionB.trim()) errors.optionB = 'Required';
      if (!f.optionC.trim()) errors.optionC = 'Required';
      if (!f.optionD.trim()) errors.optionD = 'Required';
    } else {
      const f = qForm as SPRForm;
      if (!f.correctAnswerText.trim()) errors.correctAnswerText = 'Required';
    }
    setQErrors(errors);
    if (Object.keys(errors).length === 0) addQuestionMutation.mutate();
  }

  // ── Render: Vocab Bank ───────────────────────────────────────────────────────
  if (!activeSet && mainView === 'vocab') {
    const handleAddVocab = (e: React.FormEvent) => {
      e.preventDefault();
      if (!vocabForm.word.trim()) { setVocabFormError('Word is required.'); return; }
      if (!vocabForm.definition.trim()) { setVocabFormError('Definition is required.'); return; }
      addVocabMutation.mutate({ word: vocabForm.word.trim(), definition: vocabForm.definition.trim(), exampleSentence: vocabForm.exampleSentence.trim() });
    };
    return (
      <div className="screen-fade" style={{ padding: '36px 48px 64px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 28 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#E2562B', marginBottom: 6 }}>Teacher</div>
            <h1 style={{ fontFamily: "'Instrument Serif', serif", fontSize: 44, margin: 0, letterSpacing: '-0.02em', color: '#0B0B0E' }}>Content Manager</h1>
          </div>
        </div>

        {/* View toggle */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 28 }}>
          {([{ value: 'sets', label: 'Question Sets' }, { value: 'vocab', label: 'Vocab Bank' }] as const).map(({ value, label }) => (
            <button key={value} onClick={() => setMainView(value)}
              style={{ padding: '8px 18px', borderRadius: 9999, fontSize: 13.5, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer', border: mainView === value ? 'none' : '1px solid #E7E4DE', background: mainView === value ? '#0B0B0E' : '#F2F0EC', color: mainView === value ? '#fff' : 'rgba(11,11,14,0.5)', transition: 'all 0.15s' }}
            >{label}</button>
          ))}
        </div>

        {/* Add word form */}
        <div style={{ ...CARD, padding: '24px 28px', marginBottom: 28 }}>
          <h3 style={{ fontSize: 15, fontWeight: 700, margin: '0 0 16px' }}>Add Vocab Word</h3>
          <form onSubmit={handleAddVocab} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <Input label="Word" value={vocabForm.word} onChange={(e) => setVocabForm((f) => ({ ...f, word: e.target.value }))} placeholder="e.g. ephemeral" />
            <Textarea label="Definition" value={vocabForm.definition} onChange={(e) => setVocabForm((f) => ({ ...f, definition: e.target.value }))} placeholder="Lasting for a very short time." rows={2} />
            <Textarea label="Example Sentence (optional)" value={vocabForm.exampleSentence} onChange={(e) => setVocabForm((f) => ({ ...f, exampleSentence: e.target.value }))} placeholder="The ephemeral beauty of cherry blossoms makes them all the more precious." rows={2} />
            {vocabFormError && <p style={{ fontSize: 13, color: '#C0392B', margin: 0 }}>{vocabFormError}</p>}
            <div>
              <Button type="submit" loading={addVocabMutation.isPending}><Plus size={14} style={{ marginRight: 6 }} />Add Word</Button>
            </div>
          </form>
        </div>

        {/* Word list */}
        {vocabLoading ? (
          <div style={{ textAlign: 'center', padding: 40 }}><Spinner /></div>
        ) : vocabWords.length === 0 ? (
          <div style={{ ...CARD, padding: '40px 24px', textAlign: 'center', color: 'rgba(11,11,14,0.4)', fontSize: 14 }}>No vocab words yet. Add one above.</div>
        ) : (
          <div style={{ ...CARD, overflow: 'hidden' }}>
            {vocabWords.map((w: TeacherVocabWord, i: number) => (
              <div key={w.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 16, padding: '16px 24px', borderBottom: i < vocabWords.length - 1 ? '1px solid #F2F0EC' : 'none' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 15, color: '#0B0B0E', marginBottom: 2 }}>{w.word}</div>
                  <div style={{ fontSize: 13.5, color: 'rgba(11,11,14,0.7)', marginBottom: w.exampleSentence ? 4 : 0 }}>{w.definition}</div>
                  {w.exampleSentence && <div style={{ fontSize: 12.5, color: 'rgba(11,11,14,0.45)', fontStyle: 'italic' }}>"{w.exampleSentence}"</div>}
                </div>
                <button onClick={() => deleteVocabMutation.mutate(w.id)}
                  style={{ flexShrink: 0, background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(11,11,14,0.3)', padding: 4, marginTop: 2 }}
                  title="Delete word">
                  <Trash2 size={15} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  // ── Render: Sets list ────────────────────────────────────────────────────────
  if (!activeSet) {
    return (
      <div className="screen-fade" style={{ padding: '36px 48px 64px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 28 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#E2562B', marginBottom: 6 }}>Teacher</div>
            <h1 style={{ fontFamily: "'Instrument Serif', serif", fontSize: 44, margin: 0, letterSpacing: '-0.02em', color: '#0B0B0E' }}>Content Manager</h1>
          </div>
          <div style={{ display: 'flex', gap: 10, alignSelf: 'center', alignItems: 'center' }}>
            <input
              ref={jsonFileRef}
              type="file"
              accept=".json,application/json"
              style={{ display: 'none' }}
              onChange={handleJsonUpload}
            />
            <Button
              variant="secondary"
              onClick={() => { setJsonImportError(''); jsonFileRef.current?.click(); }}
              loading={jsonImporting}
            >
              <Upload size={15} style={{ marginRight: 7 }} />Upload JSON
            </Button>
            <Button onClick={() => setShowNewSet(true)}><Plus size={15} style={{ marginRight: 7 }} />New Question Set</Button>
          </div>
        </div>

        {/* View toggle */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 28 }}>
          {([{ value: 'sets', label: 'Question Sets' }, { value: 'vocab', label: 'Vocab Bank' }] as const).map(({ value, label }) => (
            <button key={value} onClick={() => setMainView(value)}
              style={{ padding: '8px 18px', borderRadius: 9999, fontSize: 13.5, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer', border: mainView === value ? 'none' : '1px solid #E7E4DE', background: mainView === value ? '#0B0B0E' : '#F2F0EC', color: mainView === value ? '#fff' : 'rgba(11,11,14,0.5)', transition: 'all 0.15s' }}
            >{label}</button>
          ))}
        </div>

        {jsonImportError && (
          <div style={{ background: 'rgba(192,57,43,0.06)', border: '1px solid rgba(192,57,43,0.2)', borderRadius: 10, padding: '10px 16px', marginBottom: 16, fontSize: 13.5, color: '#C0392B' }}>
            {jsonImportError}
          </div>
        )}

        {showNewSet && (
          <div style={{ ...CARD, marginBottom: 24, overflow: 'hidden' }}>
            <div style={{ padding: '16px 24px', borderBottom: '1px solid #EEEBE5' }}>
              <h3 style={{ fontSize: 16, fontWeight: 600, color: '#0B0B0E', margin: 0 }}>Create Question Set</h3>
            </div>
            <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
              <Input label="Title" value={newSetTitle} onChange={(e) => setNewSetTitle(e.target.value)} placeholder="e.g. SAT Reading Practice — Passage 1" />
              <div>
                <p style={{ fontSize: 13, fontWeight: 600, color: 'rgba(11,11,14,0.65)', marginBottom: 8 }}>Subject</p>
                <div style={{ display: 'flex', gap: 10 }}>
                  {(['english', 'math'] as const).map((s) => (
                    <button key={s} onClick={() => setNewSetSubject(s)}
                      style={{ padding: '9px 22px', borderRadius: 9999, fontSize: 14, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer', border: newSetSubject === s ? 'none' : '1px solid #E7E4DE', background: newSetSubject === s ? (s === 'english' ? '#2563A8' : '#B8893E') : '#F2F0EC', color: newSetSubject === s ? '#fff' : '#8C8880' }}
                    >{s === 'english' ? '📖 Reading & Writing' : '∫ Math'}</button>
                  ))}
                </div>
              </div>
              <div>
                <p style={{ fontSize: 13, fontWeight: 600, color: 'rgba(11,11,14,0.65)', marginBottom: 8 }}>Difficulty <span style={{ fontWeight: 400, color: 'rgba(11,11,14,0.4)' }}>(optional — used for mock test adaptive selection)</span></p>
                <div style={{ display: 'flex', gap: 8 }}>
                  {([
                    { value: '', label: 'Unset', bg: '#F2F0EC', color: '#8C8880', activeBg: '#0B0B0E', activeColor: '#fff' },
                    { value: 'low', label: 'Low', bg: '#F2F0EC', color: '#8C8880', activeBg: 'rgba(46,125,90,0.15)', activeColor: '#1A5C38' },
                    { value: 'medium', label: 'Medium', bg: '#F2F0EC', color: '#8C8880', activeBg: 'rgba(184,137,62,0.15)', activeColor: '#7A5C18' },
                    { value: 'hard', label: 'Hard', bg: '#F2F0EC', color: '#8C8880', activeBg: 'rgba(192,57,43,0.1)', activeColor: '#8B1A10' },
                  ] as const).map(({ value, label, activeBg, activeColor }) => (
                    <button key={value} type="button" onClick={() => setNewSetDifficulty(value)}
                      style={{ padding: '8px 18px', borderRadius: 9999, fontSize: 13.5, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer', border: newSetDifficulty === value ? '1.5px solid currentColor' : '1px solid #E7E4DE', background: newSetDifficulty === value ? activeBg : '#F2F0EC', color: newSetDifficulty === value ? activeColor : '#8C8880', transition: 'all 0.15s' }}
                    >{label}</button>
                  ))}
                </div>
              </div>
              <Textarea label="Description (optional)" value={newSetDesc} onChange={(e) => setNewSetDesc(e.target.value)} placeholder="Brief description…" rows={2} />
              <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', userSelect: 'none' }}>
                <div
                  onClick={() => setNewSetIsLiveExam((v) => !v)}
                  style={{ width: 40, height: 22, borderRadius: 11, background: newSetIsLiveExam ? '#0B0B0E' : '#D1CEC8', position: 'relative', flexShrink: 0, transition: 'background 0.2s', cursor: 'pointer' }}
                >
                  <div style={{ position: 'absolute', top: 3, left: newSetIsLiveExam ? 21 : 3, width: 16, height: 16, borderRadius: 9999, background: '#fff', transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }} />
                </div>
                <span style={{ fontSize: 13.5, fontWeight: 600, color: '#0B0B0E' }}>Live Exam Set</span>
                <span style={{ fontSize: 12, color: '#888' }}>Students won't see this in their normal practice</span>
              </label>
              {setError && <p style={{ color: '#C0392B', fontSize: 13 }}>{setError}</p>}
              <div style={{ display: 'flex', gap: 10 }}>
                <Button onClick={() => { setSetError(''); createSetMutation.mutate(); }} loading={createSetMutation.isPending} disabled={!newSetTitle.trim()}>Create & Add Questions</Button>
                <Button variant="secondary" onClick={() => { setShowNewSet(false); setSetError(''); }}>Cancel</Button>
              </div>
            </div>
          </div>
        )}

        {/* Subject filter pills */}
        {!setsLoading && sets.length > 0 && (
          <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
            {([
              { value: 'all', label: 'All Sets' },
              { value: 'english', label: 'Reading & Writing' },
              { value: 'math', label: 'Math' },
            ] as const).map(({ value, label }) => {
              const active = subjectFilter === value;
              const color = value === 'english' ? '#2563A8' : value === 'math' ? '#B8893E' : '#0B0B0E';
              return (
                <button
                  key={value}
                  onClick={() => setSubjectFilter(value)}
                  style={{
                    padding: '8px 18px', borderRadius: 9999, fontSize: 13.5, fontWeight: 600,
                    fontFamily: 'inherit', cursor: 'pointer',
                    border: active ? 'none' : '1px solid #E7E4DE',
                    background: active ? color : '#F2F0EC',
                    color: active ? '#fff' : 'rgba(11,11,14,0.5)',
                    transition: 'all 0.15s',
                  }}
                >{label}</button>
              );
            })}
          </div>
        )}

        {setsLoading ? (
          <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 64 }}><Spinner className="w-8 h-8 text-[#E2562B]" /></div>
        ) : sets.length === 0 && !showNewSet ? (
          <div style={{ textAlign: 'center', paddingTop: 80 }}>
            <BookOpen size={52} color="rgba(11,11,14,0.18)" style={{ margin: '0 auto 16px', display: 'block' }} />
            <p style={{ color: 'rgba(11,11,14,0.4)', fontSize: 15, marginBottom: 20 }}>No question sets yet.</p>
            <Button onClick={() => setShowNewSet(true)}><Plus size={15} style={{ marginRight: 7 }} />Create your first set</Button>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 14 }}>
            {sets.filter((s) => subjectFilter === 'all' || s.subject === subjectFilter).map((set) => (
              <div key={set.id} style={{ ...CARD, padding: '20px 22px', cursor: 'pointer', transition: 'box-shadow 0.15s' }}
                onClick={() => { setActiveSet(set); setEditorTab('questions'); setQType('multiple_choice'); setQForm({ ...emptyMC }); }}
                onMouseEnter={(e) => (e.currentTarget.style.boxShadow = '0 4px 16px rgba(11,11,14,0.1)')}
                onMouseLeave={(e) => (e.currentTarget.style.boxShadow = '0 1px 3px rgba(11,11,14,0.05)')}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                      <SubjectBadge subject={set.subject} />
                      {set.difficulty && (
                        <span style={{
                          fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase',
                          padding: '2px 8px', borderRadius: 9999,
                          background: set.difficulty === 'low' ? 'rgba(46,125,90,0.12)' : set.difficulty === 'medium' ? 'rgba(184,137,62,0.14)' : 'rgba(192,57,43,0.1)',
                          color: set.difficulty === 'low' ? '#1A5C38' : set.difficulty === 'medium' ? '#7A5C18' : '#8B1A10',
                        }}>{set.difficulty}</span>
                      )}
                      {set.isDraft && (
                        <span style={{
                          fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase',
                          padding: '2px 8px', borderRadius: 9999,
                          background: 'rgba(192,57,43,0.1)', color: '#C0392B',
                        }}>DRAFT</span>
                      )}
                      {set.isLiveExam && (
                        <span style={{
                          fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase',
                          padding: '2px 8px', borderRadius: 9999,
                          background: 'rgba(37,99,168,0.1)', color: '#1E5090',
                        }}>LIVE</span>
                      )}
                    </div>
                    <p style={{ fontSize: 15, fontWeight: 600, color: '#0B0B0E', margin: '8px 0 3px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{set.title}</p>
                    {set.description && <p style={{ fontSize: 12.5, color: 'rgba(11,11,14,0.45)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{set.description}</p>}
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); setDeleteTarget({ type: 'set', id: set.id }); }}
                    style={{ padding: 6, borderRadius: 8, border: 'none', background: 'transparent', cursor: 'pointer', color: 'rgba(11,11,14,0.3)', flexShrink: 0 }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(192,57,43,0.08)'; e.currentTarget.style.color = '#C0392B'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'rgba(11,11,14,0.3)'; }}
                  ><Trash2 size={14} /></button>
                </div>
              </div>
            ))}
          </div>
        )}

        <ConfirmModal isOpen={deleteTarget?.type === 'set'} onClose={() => setDeleteTarget(null)}
          onConfirm={() => deleteSetMutation.mutate(deleteTarget!.id)} loading={deleteSetMutation.isPending}
          title="Delete Question Set?" message="This will delete all questions and passages in this set. This cannot be undone." confirmLabel="Delete Set" />
      </div>
    );
  }

  // ── Render: Set Editor ────────────────────────────────────────────────────────
  const passageOptions = passages;

  return (
    <div className="screen-fade" style={{ padding: '36px 48px 64px', maxWidth: 960, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 6 }}>
        <button onClick={() => setActiveSet(null)}
          style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600, color: 'rgba(11,11,14,0.5)', border: 'none', background: 'none', cursor: 'pointer', padding: '4px 0', fontFamily: 'inherit' }}
          onMouseEnter={(e) => (e.currentTarget.style.color = '#0B0B0E')}
          onMouseLeave={(e) => (e.currentTarget.style.color = 'rgba(11,11,14,0.5)')}
        ><ChevronLeft size={15} />All Sets</button>
        <span style={{ color: 'rgba(11,11,14,0.2)' }}>/</span>
        <SubjectBadge subject={activeSet.subject} />
        <span style={{ fontSize: 15, fontWeight: 600, color: '#0B0B0E', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{activeSet.title}</span>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10 }}>
          {!online && <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: '#C0392B' }}><WifiOff size={13} />Offline</span>}
          {draftSaved && <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: '#2E7D5A' }}><CheckCircle2 size={13} />Draft saved</span>}
        </div>
      </div>

      <div style={{ fontSize: 13, color: 'rgba(11,11,14,0.45)', marginBottom: 20 }}>
        {questions.length} question{questions.length !== 1 ? 's' : ''} · {passages.length} passage{passages.length !== 1 ? 's' : ''}
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid #E7E4DE', marginBottom: 24 }}>
        {(['questions', 'passages'] as EditorTab[]).map((t) => (
          <button key={t} onClick={() => setEditorTab(t)}
            style={{ padding: '10px 20px', fontSize: 14, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer', border: 'none', background: 'none', borderBottom: editorTab === t ? '2px solid #E2562B' : '2px solid transparent', color: editorTab === t ? '#E2562B' : 'rgba(11,11,14,0.5)', marginBottom: -1 }}
          >{t === 'questions' ? 'Questions' : 'Passages'}</button>
        ))}
      </div>

      {/* ── Passages tab ── */}
      {editorTab === 'passages' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Add passage form */}
          <div style={{ ...CARD, overflow: 'hidden' }}>
            <div style={{ padding: '16px 24px', borderBottom: '1px solid #EEEBE5' }}>
              <h3 style={{ fontSize: 15, fontWeight: 600, color: '#0B0B0E', margin: 0 }}>Add Passage</h3>
              <p style={{ fontSize: 12.5, color: 'rgba(11,11,14,0.45)', margin: '3px 0 0' }}>A passage can be shared by multiple questions in this set.</p>
            </div>
            <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
              <Input label="Passage title (optional)" value={passageTitle} onChange={(e) => setPassageTitle(e.target.value)} placeholder="e.g. The following passage is adapted from a 2022 scientific article…" />
              <Textarea label="Passage text" value={passageText} onChange={(e) => setPassageText(e.target.value)} placeholder="Paste or type the reading passage here…" rows={8} />
              {passageError && <p style={{ color: '#C0392B', fontSize: 13 }}>{passageError}</p>}
              <Button onClick={() => { setPassageError(''); createPassageMutation.mutate(); }} loading={createPassageMutation.isPending} disabled={!passageText.trim()} style={{ alignSelf: 'flex-start' }}>
                <Plus size={15} style={{ marginRight: 6 }} />Save Passage
              </Button>
            </div>
          </div>

          {/* Passage list */}
          {passages.length > 0 && (
            <div style={{ ...CARD, overflow: 'hidden' }}>
              <div style={{ padding: '14px 22px', borderBottom: '1px solid #EEEBE5' }}>
                <h3 style={{ fontSize: 14, fontWeight: 600, color: '#0B0B0E', margin: 0 }}>Saved Passages ({passages.length})</h3>
              </div>
              {passages.map((p, i) => (
                <div key={p.id} style={{ padding: '16px 22px', borderBottom: i < passages.length - 1 ? '1px solid #F2F0EC' : 'none', display: 'flex', gap: 14 }}>
                  <FileText size={16} color="#B8893E" style={{ flexShrink: 0, marginTop: 2 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    {p.title && <p style={{ fontSize: 13, fontWeight: 600, color: '#0B0B0E', margin: '0 0 4px' }}>{p.title}</p>}
                    <p style={{ fontSize: 13, color: 'rgba(11,11,14,0.6)', margin: 0, lineHeight: 1.5, display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{p.passageText}</p>
                  </div>
                  <button onClick={() => setDeleteTarget({ type: 'passage', id: p.id })}
                    style={{ padding: 6, borderRadius: 8, border: 'none', background: 'transparent', cursor: 'pointer', color: 'rgba(11,11,14,0.3)', flexShrink: 0 }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(192,57,43,0.08)'; e.currentTarget.style.color = '#C0392B'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'rgba(11,11,14,0.3)'; }}
                  ><Trash2 size={14} /></button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Questions tab ── */}
      {editorTab === 'questions' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Question form */}
          <div style={{ ...CARD, overflow: 'hidden' }}>
            <div style={{ padding: '16px 24px', borderBottom: '1px solid #EEEBE5' }}>
              <h3 style={{ fontSize: 15, fontWeight: 600, color: '#0B0B0E', margin: '0 0 12px' }}>Add Question</h3>

              {/* Question type selector */}
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => switchQType('multiple_choice')}
                  style={{ padding: '7px 16px', borderRadius: 9999, fontSize: 13, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer', border: qType === 'multiple_choice' ? '1.5px solid #0B0B0E' : '1px solid #E7E4DE', background: qType === 'multiple_choice' ? '#0B0B0E' : '#F2F0EC', color: qType === 'multiple_choice' ? '#fff' : '#8C8880' }}
                >Multiple Choice</button>
                {isMath && (
                  <button onClick={() => switchQType('student_produced_response')}
                    style={{ padding: '7px 16px', borderRadius: 9999, fontSize: 13, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer', border: qType === 'student_produced_response' ? '1.5px solid #E2562B' : '1px solid #E7E4DE', background: qType === 'student_produced_response' ? 'rgba(226,86,43,0.08)' : '#F2F0EC', color: qType === 'student_produced_response' ? '#E2562B' : '#8C8880' }}
                  >Student-Produced Response</button>
                )}
                <span style={{ fontSize: 11.5, color: 'rgba(11,11,14,0.4)', alignSelf: 'center', marginLeft: 4 }}>
                  {qType === 'student_produced_response' ? '— student types a numeric answer' : isMath ? '— 4 options A–D' : '— 4 options A–D'}
                </span>
              </div>
            </div>

            <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
              {/* Passage selector */}
              {passageOptions.length > 0 && (
                <div>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'rgba(11,11,14,0.65)', marginBottom: 6 }}>Associated Passage (optional)</label>
                  <select
                    value={(qForm as any).passageId ?? ''}
                    onChange={(e) => updateQ('passageId', e.target.value)}
                    style={{ width: '100%', height: 40, padding: '0 12px', border: '1px solid #E7E4DE', borderRadius: 10, background: '#fff', color: '#0B0B0E', fontSize: 14, fontFamily: 'inherit', outline: 'none' }}
                  >
                    <option value="">No passage</option>
                    {passageOptions.map((p) => <option key={p.id} value={p.id}>{p.title || p.passageText.substring(0, 60) + '…'}</option>)}
                  </select>
                </div>
              )}

              {/* Sub-skill (Reading & Writing sets only) */}
              {!isMath && (
                <div>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'rgba(11,11,14,0.65)', marginBottom: 6 }}>Sub-skill (optional)</label>
                  <select
                    value={(qForm as any).subSkill ?? ''}
                    onChange={(e) => updateQ('subSkill', e.target.value)}
                    style={{ width: '100%', height: 40, padding: '0 12px', border: '1px solid #E7E4DE', borderRadius: 10, background: '#fff', color: '#0B0B0E', fontSize: 14, fontFamily: 'inherit', outline: 'none' }}
                  >
                    <option value="">— Untagged</option>
                    {SUB_SKILL_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                  <p style={{ fontSize: 11.5, color: 'rgba(11,11,14,0.4)', margin: '5px 0 0' }}>Used by AI features (Phases 2–5) to target specific feedback.</p>
                </div>
              )}

              {/* Question text */}
              <div>
                {isMath && <MathToolbar onInsert={handleSymbolInsert} />}
                <Textarea
                  label="Question text"
                  value={qForm.questionText}
                  onChange={(e) => updateQ('questionText', e.target.value)}
                  error={qErrors.questionText}
                  placeholder="Enter the question…"
                  rows={3}
                  ref={registerRef('questionText')}
                  onFocus={focusField('questionText')}
                />
              </div>

              {/* Multiple Choice options */}
              {qForm.questionType === 'multiple_choice' && (
                <>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    {(['A', 'B', 'C', 'D'] as const).map((letter) => {
                      const key = `option${letter}` as 'optionA' | 'optionB' | 'optionC' | 'optionD';
                      const field = key;
                      return (
                        <div key={letter}>
                          {isMath && letter === 'A' && <MathToolbar onInsert={handleSymbolInsert} />}
                          <Textarea
                            label={`Option ${letter}`}
                            value={(qForm as MCForm)[key] as string}
                            onChange={(e) => updateQ(field, e.target.value)}
                            error={qErrors[field]}
                            placeholder={`Enter option ${letter}…`}
                            rows={2}
                            ref={registerRef(field)}
                            onFocus={focusField(field)}
                          />
                        </div>
                      );
                    })}
                  </div>
                  <div>
                    <p style={{ fontSize: 13, fontWeight: 600, color: 'rgba(11,11,14,0.65)', marginBottom: 8 }}>Correct Answer</p>
                    <div style={{ display: 'flex', gap: 8 }}>
                      {(['a', 'b', 'c', 'd'] as const).map((k) => (
                        <button key={k} onClick={() => updateQ('correctAnswer', k)}
                          style={{ width: 48, height: 48, borderRadius: 12, fontWeight: 700, fontSize: 16, fontFamily: 'inherit', cursor: 'pointer', border: 'none', background: (qForm as MCForm).correctAnswer === k ? '#2E7D5A' : '#F2F0EC', color: (qForm as MCForm).correctAnswer === k ? '#fff' : '#8C8880', transition: 'all 0.15s' }}
                        >{k.toUpperCase()}</button>
                      ))}
                    </div>
                  </div>
                </>
              )}

              {/* SPR answer */}
              {qForm.questionType === 'student_produced_response' && (
                <div>
                  <div style={{ background: 'rgba(226,86,43,0.05)', border: '1px solid rgba(226,86,43,0.2)', borderRadius: 10, padding: '10px 14px', marginBottom: 12 }}>
                    <p style={{ fontSize: 12.5, color: 'rgba(11,11,14,0.6)', margin: 0, lineHeight: 1.5 }}>
                      <strong style={{ color: '#E2562B' }}>SPR format:</strong> The student types their answer. Accept decimals (e.g. <code>1.5</code>), fractions (e.g. <code>3/4</code>), or whole numbers. The system matches numeric equivalents automatically.
                    </p>
                  </div>
                  {isMath && <MathToolbar onInsert={handleSymbolInsert} />}
                  <Input
                    label="Correct Answer"
                    value={(qForm as SPRForm).correctAnswerText}
                    onChange={(e) => updateQ('correctAnswerText', e.target.value)}
                    error={qErrors.correctAnswerText}
                    placeholder="e.g. 3/4 or 0.75 or 12"
                  />
                </div>
              )}

              {/* Explanation */}
              <Textarea label="Explanation (optional)" value={qForm.explanation} onChange={(e) => updateQ('explanation', e.target.value)} placeholder="Why is the correct answer correct?" rows={2} />

              {qError && <p style={{ color: '#C0392B', fontSize: 13 }}>{qError}</p>}
              <Button onClick={validateAndAdd} loading={addQuestionMutation.isPending} style={{ alignSelf: 'flex-start' }}>
                <Plus size={15} style={{ marginRight: 6 }} />Add Question
              </Button>
            </div>
          </div>

          {/* Save Set button — appears once questions exist */}
          {questions.length > 0 && (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '4px 0 8px' }}>
              <button
                onClick={async () => {
                  setDoneSaving(true);
                  try { if (activeSet) await publishQuestionSet(activeSet.id); } catch { /* best-effort */ }
                  setTimeout(() => { setDoneSaving(false); setActiveSet(null); }, 800);
                }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  height: 48, padding: '0 36px', borderRadius: 9999,
                  border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                  fontSize: 15, fontWeight: 700, letterSpacing: '-0.01em',
                  background: doneSaving ? '#2E7D5A' : '#0B0B0E',
                  color: '#fff',
                  boxShadow: doneSaving ? '0 4px 20px rgba(46,125,90,0.35)' : '0 4px 16px rgba(11,11,14,0.18)',
                  transition: 'background 0.2s, box-shadow 0.2s',
                }}
              >
                <CheckCircle2 size={17} />
                {doneSaving ? 'Set saved!' : `Save Set · ${questions.length} question${questions.length !== 1 ? 's' : ''}`}
              </button>
            </div>
          )}

          {/* Question list */}
          {questions.length > 0 && (() => {
            const hasAiSuggested = questions.some((q) => q.subSkillSource === 'ai_suggested');
            const hasUntagged = !isMath && questions.some((q) => !q.subSkill);
            const showFilter = hasAiSuggested || hasUntagged;
            const filtered = qFilter === 'ai_suggested'
              ? questions.filter((q) => q.subSkillSource === 'ai_suggested')
              : qFilter === 'untagged'
              ? questions.filter((q) => !q.subSkill)
              : questions;

            return (
              <div style={{ ...CARD, overflow: 'hidden' }}>
                <div style={{ padding: '14px 22px', borderBottom: '1px solid #EEEBE5', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
                  <h3 style={{ fontSize: 14, fontWeight: 600, color: '#0B0B0E', margin: 0 }}>Questions Added ({questions.length})</h3>
                  {showFilter && (
                    <div style={{ display: 'flex', gap: 6 }}>
                      {(['all', ...(hasAiSuggested ? ['ai_suggested'] : []), ...(hasUntagged ? ['untagged'] : [])] as QFilter[]).map((f) => {
                        const labels: Record<QFilter, string> = { all: 'All', ai_suggested: 'AI Review', untagged: 'Untagged' };
                        const active = qFilter === f;
                        return (
                          <button key={f} onClick={() => setQFilter(f)}
                            style={{ padding: '4px 12px', fontSize: 11.5, fontWeight: 600, borderRadius: 9999, border: active ? 'none' : '1px solid #E7E4DE', background: active ? (f === 'ai_suggested' ? '#B8893E' : '#0B0B0E') : '#F2F0EC', color: active ? '#fff' : '#8C8880', cursor: 'pointer', fontFamily: 'inherit' }}>
                            {f === 'ai_suggested' && '⚡ '}{labels[f]}
                            {f === 'ai_suggested' && !active && <span style={{ marginLeft: 5, background: '#B8893E', color: '#fff', borderRadius: 9999, padding: '1px 5px', fontSize: 10 }}>{questions.filter((q) => q.subSkillSource === 'ai_suggested').length}</span>}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
                {filtered.map((q, i) => (
                  <QuestionRow key={q.id} q={q} index={questions.indexOf(q)} isLast={i === filtered.length - 1} passages={passages}
                    onDelete={() => setDeleteTarget({ type: 'question', id: q.id })}
                    onConfirm={q.subSkillSource === 'ai_suggested' ? () => confirmSubSkillMutation.mutate(q.id) : undefined}
                    onOverride={q.subSkillSource === 'ai_suggested' ? (sk) => overrideSubSkillMutation.mutate({ questionId: q.id, subSkill: sk }) : undefined}
                  />
                ))}
              </div>
            );
          })()}
        </div>
      )}

      {/* Confirm modals */}
      <ConfirmModal
        isOpen={!!deleteTarget && deleteTarget.type !== 'set'}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => {
          if (!deleteTarget) return;
          if (deleteTarget.type === 'question') deleteQuestionMutation.mutate(deleteTarget.id);
          else if (deleteTarget.type === 'passage') deletePassageMutation.mutate(deleteTarget.id);
        }}
        loading={deleteQuestionMutation.isPending || deletePassageMutation.isPending}
        title={deleteTarget?.type === 'question' ? 'Delete Question?' : 'Delete Passage?'}
        message={deleteTarget?.type === 'question' ? 'This question will be permanently deleted.' : 'Deleting this passage will unlink it from all questions that reference it.'}
        confirmLabel="Delete"
      />
    </div>
  );
}

// ── Question Row ──────────────────────────────────────────────────────────────

function QuestionRow({ q, index, isLast, passages, onDelete, onConfirm, onOverride }: {
  q: Question; index: number; isLast: boolean; passages: Passage[];
  onDelete: () => void;
  onConfirm?: () => void;
  onOverride?: (subSkill: SubSkill) => void;
}) {
  const isMC = q.questionType === 'multiple_choice';
  const passage = passages.find((p) => p.id === q.passageId);
  const isAiSuggested = q.subSkillSource === 'ai_suggested';

  return (
    <div style={{ borderBottom: isLast ? 'none' : '1px solid #F2F0EC', background: isAiSuggested ? 'rgba(184,137,62,0.03)' : undefined }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '14px 22px' }}>
        <span style={{ width: 24, height: 24, borderRadius: 7, background: '#F2F0EC', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 600, color: 'rgba(11,11,14,0.5)', flexShrink: 0, marginTop: 2 }}>{index + 1}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', padding: '2px 7px', borderRadius: 5, background: isMC ? '#EEF2FB' : 'rgba(226,86,43,0.08)', color: isMC ? '#2563A8' : '#E2562B' }}>{isMC ? 'MC' : 'SPR'}</span>
            {q.subSkill && (
              <span style={{ fontSize: 10.5, fontWeight: 600, letterSpacing: '0.04em', padding: '2px 7px', borderRadius: 5, background: isAiSuggested ? 'rgba(184,137,62,0.12)' : '#F0ECE4', color: isAiSuggested ? '#8A6020' : '#6B5F4A', border: isAiSuggested ? '1px solid rgba(184,137,62,0.3)' : 'none' }}>
                {isAiSuggested && '⚡ '}{q.subSkill.replace(/_/g, ' ')}
              </span>
            )}
            {passage && <span style={{ fontSize: 11, color: '#B8893E', display: 'flex', alignItems: 'center', gap: 3 }}><FileText size={11} />{passage.title || 'Passage'}</span>}
          </div>
          <p style={{ fontSize: 13.5, color: '#0B0B0E', margin: '0 0 3px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{q.questionText}</p>
          {isMC ? (
            <p style={{ fontSize: 12, color: '#2E7D5A', margin: 0, fontWeight: 600 }}>Correct: {q.correctAnswer?.toUpperCase()}</p>
          ) : (
            <p style={{ fontSize: 12, color: '#E2562B', margin: 0, fontWeight: 600 }}>Answer: {q.correctAnswerText}</p>
          )}
        </div>
        <button onClick={onDelete}
          style={{ padding: 6, borderRadius: 7, border: 'none', background: 'transparent', cursor: 'pointer', color: 'rgba(11,11,14,0.3)', flexShrink: 0 }}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(192,57,43,0.08)'; e.currentTarget.style.color = '#C0392B'; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'rgba(11,11,14,0.3)'; }}
        ><Trash2 size={14} /></button>
      </div>

      {/* AI review bar — only for ai_suggested questions */}
      {isAiSuggested && onConfirm && onOverride && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 22px 10px 60px', background: 'rgba(184,137,62,0.06)', borderTop: '1px solid rgba(184,137,62,0.12)' }}>
          <span style={{ fontSize: 11, color: '#8A6020', fontWeight: 600 }}>⚡ AI-suggested — review needed:</span>
          <button
            onClick={onConfirm}
            style={{ padding: '3px 12px', fontSize: 11.5, fontWeight: 600, borderRadius: 6, border: '1px solid rgba(46,125,90,0.4)', background: 'rgba(46,125,90,0.08)', color: '#2E7D5A', cursor: 'pointer', fontFamily: 'inherit' }}
          >✓ Confirm</button>
          <select
            defaultValue=""
            onChange={(e) => { if (e.target.value) onOverride(e.target.value as SubSkill); e.target.value = ''; }}
            style={{ padding: '3px 8px', fontSize: 11.5, borderRadius: 6, border: '1px solid #E7E4DE', background: '#fff', color: '#0B0B0E', cursor: 'pointer', fontFamily: 'inherit' }}
          >
            <option value="" disabled>Override skill…</option>
            {SUB_SKILL_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
}
