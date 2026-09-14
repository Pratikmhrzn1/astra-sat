import { useCallback, useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, ChevronLeft, Pencil, Plus, WifiOff } from 'lucide-react';
import { addQuestion, deletePassage, deleteQuestion, getSetPassages, getSetQuestions, publishQuestionSet, updateQuestion, updateQuestionSet, updateQuestionSubSkill, type Question, type QuestionSet } from '@/features/content/api';
import { getApiError } from '@/shared/api/http';
import { clearTeacherDraft, loadTeacherDraft, saveTeacherDraft } from '@/shared/lib/offline';
import { useOnlineStatus } from '@/shared/hooks/useOnlineStatus';
import {
  Button, ConfirmModal, Input, SubjectBadge, Textarea, surfaceClass,
} from '@/shared/ui';
import { SkillSelect } from '@/entities/skill';
import { MathToolbar } from '@/features/content/components/MathToolbar';
import { RichTextArea, UnderlineBtn } from '@/features/content/components/RichTextArea';
import { cn } from '@/shared/lib/utils';
import { ImagePickerModal } from './ImagePickerModal';
import { PassagesTab } from './PassagesTab';
import { QuestionList } from './QuestionList';
import {
  emptyMC, emptySPR, fieldLabelClass, hintClass, moduleLimit,
  type EditorTab, type MCForm, type QuestionForm, type QuestionType, type SPRForm,
} from './questionForm';

/**
 * Authoring one question set: its header controls, the passages tab, and the
 * question form with the list of questions already added.
 *
 * Mounted only while a set is open, so leaving the set discards an unsaved
 * edit — the draft auto-save below is what carries unsubmitted work across.
 */
export function SetEditor({ activeSet, onActiveSetChange, onExit }: {
  activeSet: QuestionSet;
  onActiveSetChange: (set: QuestionSet) => void;
  onExit: () => void;
}) {
  const queryClient = useQueryClient();
  const online = useOnlineStatus();
  const isMath = activeSet.subject === 'math';

  const [editorTab, setEditorTab] = useState<EditorTab>('questions');

  // Question form
  const [qType, setQType] = useState<QuestionType>('multiple_choice');
  const [qForm, setQForm] = useState<QuestionForm>({ ...emptyMC });
  const [qErrors, setQErrors] = useState<Record<string, string>>({});
  const [qError, setQError] = useState('');
  const [draftSaved, setDraftSaved] = useState(false);
  const [doneSaving, setDoneSaving] = useState(false);
  const [showImagePicker, setShowImagePicker] = useState(false);

  // Edit mode
  const [editingQuestion, setEditingQuestion] = useState<Question | null>(null);
  const formCardRef = useRef<HTMLDivElement | null>(null);
  const questionTextDivRef = useRef<HTMLDivElement | null>(null);

  const [deleteTarget, setDeleteTarget] = useState<{ type: 'question' | 'passage'; id: string } | null>(null);

  // Symbol insertion — track active textarea by field name
  const [activeField, setActiveField] = useState<string | null>(null);
  const textareaRefs = useRef<Record<string, HTMLTextAreaElement | null>>({});

  const { data: passages = [] } = useQuery({ queryKey: ['teacher', 'passages', activeSet.id], queryFn: () => getSetPassages(activeSet.id) });
  const { data: questions = [] } = useQuery({ queryKey: ['teacher', 'questions', activeSet.id], queryFn: () => getSetQuestions(activeSet.id) });

  const limit = moduleLimit(activeSet.subject);

  // Switch question type — keep shared fields
  const switchQType = (t: QuestionType) => {
    setQType(t);
    const shared = { passageId: qForm.passageId ?? '', questionText: qForm.questionText, explanation: qForm.explanation };
    setQForm(t === 'multiple_choice' ? { ...emptyMC, ...shared } : { ...emptySPR, ...shared });
    setQErrors({});
  };

  // Draft auto-save (question form)
  const saveDraft = useCallback(async () => {
    if (editingQuestion) return;
    await saveTeacherDraft(`q-draft-${activeSet.id}`, activeSet.id, qForm as unknown as Record<string, unknown>);
    setDraftSaved(true);
    setTimeout(() => setDraftSaved(false), 1500);
  }, [activeSet, qForm, editingQuestion]);

  useEffect(() => { const t = setTimeout(saveDraft, 900); return () => clearTimeout(t); }, [qForm, saveDraft]);

  useEffect(() => {
    loadTeacherDraft(`q-draft-${activeSet.id}`).then((saved) => {
      if (saved?.questionForm?.questionText) setQForm(saved.questionForm as unknown as QuestionForm);
    });
  }, [activeSet.id]);

  // Symbol toolbar insertion
  const handleSymbolInsert = useCallback((symbol: string) => {
    if (!activeField) return;
    if (activeField === 'questionText') {
      // contenteditable: insert via Selection API
      const el = questionTextDivRef.current;
      if (!el) return;
      el.focus();
      const sel = window.getSelection();
      if (sel && sel.rangeCount > 0) {
        const range = sel.getRangeAt(0);
        range.deleteContents();
        const node = document.createTextNode(symbol);
        range.insertNode(node);
        range.setStartAfter(node);
        range.collapse(true);
        sel.removeAllRanges();
        sel.addRange(range);
      }
      requestAnimationFrame(() => {
        if (questionTextDivRef.current) setQForm((prev) => ({ ...prev, questionText: questionTextDivRef.current!.innerHTML } as QuestionForm));
      });
    } else {
      const el = textareaRefs.current[activeField];
      if (!el) return;
      const start = el.selectionStart ?? el.value.length;
      const end = el.selectionEnd ?? el.value.length;
      const newCursorPos = start + symbol.length;
      const newValue = el.value.substring(0, start) + symbol + el.value.substring(end);
      setQForm((prev) => ({ ...prev, [activeField]: newValue } as QuestionForm));
      requestAnimationFrame(() => { el.focus(); el.setSelectionRange(newCursorPos, newCursorPos); });
    }
  }, [activeField]);

  // Underline: uses execCommand on contenteditable (question text),
  // or wraps <u>…</u> for plain textareas (options, explanation)
  const handleUnderline = useCallback(() => {
    if (activeField === 'questionText') {
      const el = questionTextDivRef.current;
      if (!el) return;
      document.execCommand('underline', false);
      setQForm((prev) => ({ ...prev, questionText: el.innerHTML } as QuestionForm));
    } else {
      if (!activeField) return;
      const el = textareaRefs.current[activeField];
      if (!el) return;
      const start = el.selectionStart ?? 0;
      const end = el.selectionEnd ?? 0;
      if (start === end) return;
      const before = el.value.substring(0, start);
      const selected = el.value.substring(start, end);
      const after = el.value.substring(end);
      const newValue = `${before}<u>${selected}</u>${after}`;
      const cursor = before.length + 3 + selected.length + 4;
      setQForm((prev) => ({ ...prev, [activeField]: newValue } as QuestionForm));
      requestAnimationFrame(() => { el.focus(); el.setSelectionRange(cursor, cursor); });
    }
  }, [activeField]);

  const registerRef = (field: string) => (el: HTMLTextAreaElement | null) => { textareaRefs.current[field] = el; };
  const focusField = (field: string) => () => setActiveField(field);

  function updateQ(field: string, value: string) {
    setQForm((prev) => ({ ...prev, [field]: value } as QuestionForm));
    setQErrors((e) => { const n = { ...e }; delete n[field]; return n; });
  }

  const resetForm = () => {
    setQForm(qType === 'multiple_choice' ? { ...emptyMC } : { ...emptySPR });
    setQErrors({}); setQError('');
  };

  // Mutations — set
  const updateSetMutation = useMutation({
    mutationFn: (payload: { difficulty?: 'low' | 'medium' | 'hard' | null; isLiveExam?: boolean }) =>
      updateQuestionSet(activeSet.id, payload),
    onSuccess: (updated) => {
      onActiveSetChange(updated);
      queryClient.invalidateQueries({ queryKey: ['teacher', 'question-sets'] });
    },
    onError: (err) => alert(getApiError(err)),
  });

  // Mutations — questions
  const questionPayload = (questionText: string, orderIndex: number) => {
    const base = { passageId: qForm.passageId || null, skillCode: qForm.skillCode || null, difficulty: qForm.difficulty || null, questionText, explanation: qForm.explanation || null, imageUrl: qForm.imageUrl || null, orderIndex };
    if (qForm.questionType === 'multiple_choice') {
      const f = qForm as MCForm;
      return { ...base, questionType: 'multiple_choice' as const, optionA: f.optionA, optionB: f.optionB, optionC: f.optionC, optionD: f.optionD, correctAnswer: f.correctAnswer, correctAnswerText: null };
    }
    const f = qForm as SPRForm;
    return { ...base, questionType: 'student_produced_response' as const, optionA: null, optionB: null, optionC: null, optionD: null, correctAnswer: null, correctAnswerText: f.correctAnswerText };
  };

  const addQuestionMutation = useMutation({
    mutationFn: (questionText: string) => addQuestion(activeSet.id, questionPayload(questionText, questions.length)),
    onSuccess: async () => {
      queryClient.invalidateQueries({ queryKey: ['teacher', 'questions', activeSet.id] });
      await clearTeacherDraft(`q-draft-${activeSet.id}`);
      resetForm();
    },
    onError: (err) => setQError(getApiError(err)),
  });

  const updateQuestionMutation = useMutation({
    mutationFn: (questionText: string) => updateQuestion(editingQuestion!.id, questionPayload(questionText, editingQuestion!.orderIndex)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['teacher', 'questions', activeSet.id] });
      setEditingQuestion(null);
      resetForm();
    },
    onError: (err) => setQError(getApiError(err)),
  });

  const deleteQuestionMutation = useMutation({
    mutationFn: (id: string) => deleteQuestion(id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['teacher', 'questions', activeSet.id] }); setDeleteTarget(null); },
  });

  const deletePassageMutation = useMutation({
    mutationFn: (id: string) => deletePassage(id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['teacher', 'passages', activeSet.id] }); setDeleteTarget(null); },
  });

  const confirmSubSkillMutation = useMutation({
    mutationFn: (questionId: string) => updateQuestionSubSkill(questionId, { subSkillSource: 'human_confirmed' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['teacher', 'questions', activeSet.id] }),
  });

  const overrideSubSkillMutation = useMutation({
    mutationFn: ({ questionId, skillCode }: { questionId: string; skillCode: string }) =>
      updateQuestionSubSkill(questionId, { skillCode, subSkillSource: 'human_confirmed' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['teacher', 'questions', activeSet.id] }),
  });

  function validateAndSubmit() {
    // Block adding new questions when module limit is reached (editing existing is always allowed)
    if (!editingQuestion && questions.length >= limit) {
      setQError(`This module is full (${limit} questions maximum for ${activeSet.subject === 'english' ? 'Reading & Writing' : 'Math'}). Delete an existing question to add a new one.`);
      return;
    }
    // Read directly from DOM so any HTML formatting (underlines etc.) is captured regardless of React state timing
    const questionText = questionTextDivRef.current?.innerHTML ?? qForm.questionText;
    const errors: Record<string, string> = {};
    if (!(questionTextDivRef.current?.innerText.trim() ?? qForm.questionText.trim())) errors.questionText = 'Required';
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
    if (Object.keys(errors).length === 0) {
      if (editingQuestion) updateQuestionMutation.mutate(questionText);
      else addQuestionMutation.mutate(questionText);
    }
  }

  function startEdit(q: Question) {
    setQType(q.questionType);
    const shared = {
      passageId: q.passageId ?? '', skillCode: q.skillCode ?? '', difficulty: q.difficulty ?? '',
      questionText: q.questionText, explanation: q.explanation ?? '', imageUrl: q.imageUrl ?? null,
    } as const;
    setQForm(q.questionType === 'multiple_choice'
      ? { questionType: 'multiple_choice', ...shared, optionA: q.optionA ?? '', optionB: q.optionB ?? '', optionC: q.optionC ?? '', optionD: q.optionD ?? '', correctAnswer: q.correctAnswer ?? 'a' }
      : { questionType: 'student_produced_response', ...shared, correctAnswerText: q.correctAnswerText ?? '' });
    setEditingQuestion(q);
    setQErrors({}); setQError('');
    requestAnimationFrame(() => formCardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  }

  function cancelEdit() {
    setEditingQuestion(null);
    resetForm();
  }

  async function saveSet() {
    setDoneSaving(true);

    // Auto-save the current question form if it has content
    const qt = questionTextDivRef.current?.innerHTML ?? qForm.questionText;
    const hasText = !!(questionTextDivRef.current?.innerText?.trim() || qForm.questionText.trim());
    if (hasText) {
      let valid = true;
      if (qForm.questionType === 'multiple_choice') {
        const f = qForm as MCForm;
        if (!f.optionA.trim() || !f.optionB.trim() || !f.optionC.trim() || !f.optionD.trim()) valid = false;
      } else if (!(qForm as SPRForm).correctAnswerText.trim()) {
        valid = false;
      }
      if (valid) {
        try {
          if (editingQuestion) await updateQuestionMutation.mutateAsync(qt);
          else if (questions.length < limit) await addQuestionMutation.mutateAsync(qt);
        } catch { /* best-effort — proceed to publish regardless */ }
      }
    }

    try { await publishQuestionSet(activeSet.id); } catch { /* best-effort */ }
    setTimeout(() => { setDoneSaving(false); onExit(); }, 800);
  }

  const atLimit = questions.length >= limit;
  const mc = qForm as MCForm;

  return (
    <div className="screen-fade px-4 pt-5 pb-20 sm:px-12 sm:pt-9 sm:pb-16 max-w-[960px] mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3.5 flex-wrap mb-1.5">
        <button onClick={onExit} className="flex items-center gap-1.5 text-[13px] font-semibold text-subtle hover:text-ink bg-transparent cursor-pointer py-1 px-0">
          <ChevronLeft size={15} />All Sets
        </button>
        <span className="text-ink/20">/</span>
        <SubjectBadge subject={activeSet.subject} />
        <span className="text-[15px] font-semibold text-ink truncate min-w-0">{activeSet.title}</span>
        <div className="ml-auto flex items-center gap-2.5 flex-wrap">
          {!online && <span className="flex items-center gap-[5px] text-xs text-danger"><WifiOff size={13} />Offline</span>}
          {draftSaved && <span className="flex items-center gap-[5px] text-xs text-green-sat"><CheckCircle2 size={13} />Draft saved</span>}
          <select
            value={activeSet.difficulty ?? ''}
            disabled={updateSetMutation.isPending}
            onChange={(e) => updateSetMutation.mutate({ difficulty: (e.target.value as 'low' | 'medium' | 'hard') || null })}
            className="text-xs font-semibold border border-border rounded-lg px-2 py-1 bg-white cursor-pointer text-ink"
          >
            <option value="">No difficulty</option>
            <option value="low">Low (M2 easy)</option>
            <option value="medium">Medium (M1)</option>
            <option value="hard">Hard (M2 hard)</option>
          </select>

          {/* A live session can only be built from sets marked here, so this has
              to be changeable on a set that already exists — otherwise running
              one means re-authoring the whole paper. */}
          <label
            title="Make this set selectable when creating a live exam"
            className={cn(
              'flex items-center gap-[7px] text-xs font-semibold border border-border rounded-lg px-2.5 py-1',
              activeSet.isLiveExam ? 'text-accent-text bg-ember/[.07]' : 'text-subtle bg-white',
              updateSetMutation.isPending ? 'cursor-default' : 'cursor-pointer',
            )}
          >
            <input
              type="checkbox"
              checked={activeSet.isLiveExam}
              disabled={updateSetMutation.isPending}
              onChange={(e) => updateSetMutation.mutate({ isLiveExam: e.target.checked })}
              className="w-3.5 h-3.5 [cursor:inherit]"
            />
            Live exam set
          </label>
        </div>
      </div>

      <div className="text-[13px] mb-5 flex items-center gap-2">
        <span className={atLimit ? 'text-danger font-bold' : 'text-muted font-normal'}>
          {questions.length}/{limit} question{questions.length !== 1 ? 's' : ''}
        </span>
        <span className="text-muted">· {passages.length} passage{passages.length !== 1 ? 's' : ''}</span>
        {atLimit && <span className="text-[11px] font-bold tracking-[0.06em] uppercase text-danger bg-danger/[.08] px-2 py-0.5 rounded-md">Module full</span>}
      </div>

      {/* Tabs */}
      <div className="flex border-b border-border mb-6">
        {(['questions', 'passages'] as EditorTab[]).map((t) => (
          <button
            key={t}
            onClick={() => setEditorTab(t)}
            className={cn(
              'px-5 py-2.5 text-sm font-semibold cursor-pointer bg-transparent border-b-2 -mb-px',
              editorTab === t ? 'border-ember text-accent-text' : 'border-transparent text-subtle',
            )}
          >{t === 'questions' ? 'Questions' : 'Passages'}</button>
        ))}
      </div>

      {editorTab === 'passages' && (
        <PassagesTab setId={activeSet.id} passages={passages} onDelete={(id) => setDeleteTarget({ type: 'passage', id })} />
      )}

      {editorTab === 'questions' && (
        <div className="flex flex-col gap-5">
          {/* Question form */}
          <div ref={formCardRef} className={cn(surfaceClass, 'overflow-hidden')}>
            <div className="px-6 py-4 border-b border-border-soft">
              <div className="flex items-center justify-between mb-3">
                <h3 className={cn('text-[15px] font-semibold m-0', editingQuestion ? 'text-accent-text' : 'text-ink')}>
                  {editingQuestion ? `Edit Question #${questions.findIndex((q) => q.id === editingQuestion.id) + 1}` : 'Add Question'}
                </h3>
                {editingQuestion && (
                  <button onClick={cancelEdit} className="text-[12.5px] font-semibold text-subtle border border-border rounded-lg bg-sunken px-3 py-1 cursor-pointer">Cancel</button>
                )}
              </div>
              {editingQuestion && (
                <p className="text-[12.5px] text-subtle -mt-1 mb-3 leading-normal">
                  Changes apply to new attempts. Students who already answered this question keep the version they saw, so their results don't change.
                </p>
              )}

              {/* Question type selector */}
              <div className="flex gap-2 flex-wrap">
                <button
                  onClick={() => switchQType('multiple_choice')}
                  className={cn('px-4 py-[7px] rounded-full text-[13px] font-semibold cursor-pointer', qType === 'multiple_choice' ? 'border-[1.5px] border-ink bg-ink text-white' : 'border border-border bg-sunken text-stone')}
                >Multiple Choice</button>
                {isMath && (
                  <button
                    onClick={() => switchQType('student_produced_response')}
                    className={cn('px-4 py-[7px] rounded-full text-[13px] font-semibold cursor-pointer', qType === 'student_produced_response' ? 'border-[1.5px] border-ember bg-ember/[.08] text-accent-text' : 'border border-border bg-sunken text-stone')}
                  >Student-Produced Response</button>
                )}
                <span className="text-[11.5px] text-muted self-center ml-1">
                  {qType === 'student_produced_response' ? '— student types a numeric answer' : '— 4 options A–D'}
                </span>
              </div>
            </div>

            <div className="px-6 py-5 flex flex-col gap-4">
              {/* Passage selector */}
              {passages.length > 0 && (
                <div>
                  <label className={fieldLabelClass}>Associated Passage (optional)</label>
                  <select
                    value={qForm.passageId ?? ''}
                    onChange={(e) => updateQ('passageId', e.target.value)}
                    className="w-full h-10 px-3 border border-border rounded-[10px] bg-white text-ink text-sm outline-none"
                  >
                    <option value="">No passage</option>
                    {passages.map((p) => <option key={p.id} value={p.id}>{p.title || p.passageText.substring(0, 60) + '…'}</option>)}
                  </select>
                </div>
              )}

              {/* Topic and difficulty — both subjects. Math used to be
                  untaggable here, which left half the corpus invisible to
                  analytics and topic practice. */}
              <div className="flex gap-3 flex-wrap">
                <div className="flex-[1_1_260px] min-w-0">
                  <label className={fieldLabelClass}>Topic (optional)</label>
                  <SkillSelect
                    subject={isMath ? 'math' : 'english'}
                    value={qForm.skillCode || null}
                    onChange={(code) => updateQ('skillCode', code ?? '')}
                  />
                  <p className={hintClass}>Drives topic practice, per-skill analytics and targeted AI feedback.</p>
                </div>
                <div className="flex-[0_1_200px]">
                  <label className={fieldLabelClass}>Difficulty (optional)</label>
                  <div className="flex gap-1.5">
                    {(['easy', 'medium', 'hard'] as const).map((level) => {
                      const active = qForm.difficulty === level;
                      return (
                        <button
                          key={level}
                          type="button"
                          onClick={() => updateQ('difficulty', active ? '' : level)}
                          className={cn(
                            'flex-1 h-10 rounded-[10px] border text-[13px] font-semibold cursor-pointer capitalize',
                            active ? 'border-ember bg-ember/[.08] text-accent-text' : 'border-border bg-white text-ink/60',
                          )}
                        >{level}</button>
                      );
                    })}
                  </div>
                  <p className={hintClass}>Per question — separate from the set's difficulty tier.</p>
                </div>
              </div>

              {/* Question text */}
              <div>
                {isMath && <MathToolbar onInsert={handleSymbolInsert} />}
                <div className="flex items-center gap-2 mb-1.5">
                  <UnderlineBtn onApply={handleUnderline} />
                  <span className="text-[11px] text-muted">Select text in any field below, then click</span>
                </div>
                <RichTextArea
                  label="Question text"
                  value={qForm.questionText}
                  onChange={(html) => updateQ('questionText', html)}
                  error={qErrors.questionText}
                  placeholder="Enter the question…"
                  rows={3}
                  ref={questionTextDivRef}
                  onFocus={focusField('questionText')}
                />
              </div>

              {/* Multiple Choice options */}
              {qForm.questionType === 'multiple_choice' && (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {(['A', 'B', 'C', 'D'] as const).map((letter) => {
                      const field = `option${letter}` as 'optionA' | 'optionB' | 'optionC' | 'optionD';
                      return (
                        <div key={letter}>
                          {isMath && letter === 'A' && <MathToolbar onInsert={handleSymbolInsert} />}
                          <Textarea
                            label={`Option ${letter}`}
                            value={mc[field]}
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
                    <p className="text-[13px] font-semibold text-subtle mb-2">Correct Answer</p>
                    <div className="flex gap-2">
                      {(['a', 'b', 'c', 'd'] as const).map((k) => (
                        <button
                          key={k}
                          onClick={() => updateQ('correctAnswer', k)}
                          className={cn('w-12 h-12 rounded-xl font-bold text-base cursor-pointer transition-all duration-150', mc.correctAnswer === k ? 'bg-green-sat text-white' : 'bg-sunken text-stone')}
                        >{k.toUpperCase()}</button>
                      ))}
                    </div>
                  </div>
                </>
              )}

              {/* SPR answer */}
              {qForm.questionType === 'student_produced_response' && (
                <div>
                  <div className="bg-ember/5 border border-ember/20 rounded-[10px] px-3.5 py-2.5 mb-3">
                    <p className="text-[12.5px] text-ink/60 m-0 leading-normal">
                      <strong className="text-accent-text">SPR format:</strong> The student types their answer. Accept decimals (e.g. <code>1.5</code>), fractions (e.g. <code>3/4</code>), or whole numbers. The system matches numeric equivalents automatically.
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

              {/* Image attachment */}
              <div>
                <p className="text-[13px] font-semibold text-subtle mb-2">Diagram / Image (optional)</p>
                {qForm.imageUrl ? (
                  <div className="flex items-start gap-3">
                    <img src={qForm.imageUrl} alt="Question diagram" className="w-[120px] h-[90px] object-cover rounded-lg border border-border shrink-0" />
                    <div className="flex flex-col gap-1.5">
                      <button type="button" onClick={() => setShowImagePicker(true)} className="px-3.5 py-1.5 text-[12.5px] font-semibold border border-border rounded-lg bg-sunken text-ink cursor-pointer">
                        Change image
                      </button>
                      <button type="button" onClick={() => updateQ('imageUrl', '')} className="px-3.5 py-1.5 text-[12.5px] font-semibold border border-danger/25 rounded-lg bg-transparent text-danger cursor-pointer">
                        Remove image
                      </button>
                    </div>
                  </div>
                ) : (
                  <button type="button" onClick={() => setShowImagePicker(true)} className="flex items-center gap-[7px] px-4 py-2 text-[13px] font-semibold border-[1.5px] border-dashed border-field rounded-[10px] bg-transparent text-subtle cursor-pointer">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
                    Attach image from library
                  </button>
                )}
              </div>

              {showImagePicker && (
                <ImagePickerModal
                  selectedUrl={qForm.imageUrl}
                  onPick={(url) => { updateQ('imageUrl', url); setShowImagePicker(false); }}
                  onClose={() => setShowImagePicker(false)}
                />
              )}

              {qError && <p className="text-danger text-[13px]">{qError}</p>}
              <Button onClick={validateAndSubmit} loading={addQuestionMutation.isPending || updateQuestionMutation.isPending} className="self-start">
                {editingQuestion
                  ? <><Pencil size={15} className="mr-1.5" />Save Changes</>
                  : <><Plus size={15} className="mr-1.5" />Add Question</>}
              </Button>
            </div>
          </div>

          {/* Save Set button — appears once questions exist */}
          {questions.length > 0 && (
            <div className="flex justify-center pt-1 pb-2">
              <button
                onClick={saveSet}
                className={cn(
                  'flex items-center gap-2 h-12 px-9 rounded-full cursor-pointer text-[15px] font-bold tracking-[-0.01em] text-white transition-[background-color,box-shadow] duration-200',
                  doneSaving ? 'bg-green-sat shadow-[0_4px_20px_rgba(46,125,90,0.35)]' : 'bg-ink shadow-[0_4px_16px_rgba(11,11,14,0.18)]',
                )}
              >
                <CheckCircle2 size={17} />
                {doneSaving ? 'Set saved!' : `Save Set · ${questions.length} question${questions.length !== 1 ? 's' : ''}`}
              </button>
            </div>
          )}

          {questions.length > 0 && (
            <QuestionList
              questions={questions}
              passages={passages}
              subject={isMath ? 'math' : 'english'}
              editingId={editingQuestion?.id ?? null}
              onEdit={startEdit}
              onDelete={(id) => setDeleteTarget({ type: 'question', id })}
              onConfirmTag={(id) => confirmSubSkillMutation.mutate(id)}
              onOverrideTag={(questionId, skillCode) => overrideSubSkillMutation.mutate({ questionId, skillCode })}
            />
          )}
        </div>
      )}

      <ConfirmModal
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => {
          if (!deleteTarget) return;
          if (deleteTarget.type === 'question') deleteQuestionMutation.mutate(deleteTarget.id);
          else deletePassageMutation.mutate(deleteTarget.id);
        }}
        loading={deleteQuestionMutation.isPending || deletePassageMutation.isPending}
        title={deleteTarget?.type === 'question' ? 'Delete Question?' : 'Delete Passage?'}
        message={deleteTarget?.type === 'question' ? 'It will be removed from this set. If students have already answered it, it is retired instead, so their past results stay unchanged.' : 'Deleting this passage will unlink it from all questions that reference it.'}
        confirmLabel="Delete"
      />
    </div>
  );
}
