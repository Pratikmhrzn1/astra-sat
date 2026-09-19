import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronDown, ChevronUp, Pencil, Plus, Search, Trash2 } from 'lucide-react';
import {
  createSurveyQuestion,
  deleteSurveyQuestion,
  getSurveyQuestions,
  getSurveyResponses,
  reorderSurveyQuestions,
  updateSurveyQuestion,
  type AdminSurveyQuestion,
  type SurveyQuestionPayload,
  type SurveyRespondent,
} from '@/features/survey/api';
import { QuestionEditor, TYPE_LABELS, emptyQuestionForm } from '@/features/survey/components/QuestionEditor';
import { ResponseSummary, answerText } from '@/features/survey/components/ResponseSummary';
import {
  Button, EmptyState, InlineLoader, Modal, PageHeader,
  accentActionClass, iconButtonClass, inputClass, pageClass, segmentClass, segmentGroupClass, surfaceClass,
} from '@/shared/ui';
import { showErrorToast } from '@/shared/ui/toast/ErrorToasts';
import { cn, formatDate } from '@/shared/lib/utils';
import { getApiError } from '@/shared/api/http';

/**
 * Where the signup survey is authored, and where its answers are read.
 *
 * The question set is data: whatever is active here is what a new student is
 * asked at signup, with no deploy in between. An empty set means no survey —
 * new students go straight to their dashboard.
 *
 * Both of the writes that reorder or (de)activate a question apply to the cache
 * first and reconcile after. They are single clicks on a list the admin is
 * looking at, and a list that only moves once the server answers reads as a
 * broken button.
 */

const QUESTIONS_KEY = ['admin', 'survey-questions'];
const RESPONSES_KEY = ['admin', 'survey-responses'];

const pillBase = 'px-2.5 py-[3px] rounded-full text-[11.5px] font-bold tracking-[0.04em] uppercase';

// ── Questions tab ────────────────────────────────────────────────────────────

/**
 * Deleting takes the answers with it, and the safer move is almost always to
 * deactivate — so that move is offered here as a button rather than as advice
 * the admin has to back out of the dialog to follow.
 */
function DeleteQuestionModal({
  question,
  deleting,
  deactivating,
  onClose,
  onDeactivate,
  onDelete,
}: {
  question: AdminSurveyQuestion | null;
  deleting: boolean;
  deactivating: boolean;
  onClose: () => void;
  onDeactivate: () => void;
  onDelete: () => void;
}) {
  const busy = deleting || deactivating;
  const count = question?.responseCount ?? 0;
  const offerDeactivate = !!question?.isActive && count > 0;

  return (
    <Modal
      isOpen={!!question}
      onClose={busy ? () => {} : onClose}
      title="Delete Survey Question?"
      size="md"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button variant="danger" onClick={onDelete} loading={deleting} disabled={deactivating}>
            Delete permanently
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <p className="text-body m-0">
          <span className="font-semibold text-ink">“{question?.prompt}”</span>{' '}
          {count > 0
            ? `will be deleted, along with the ${count} answer${count === 1 ? '' : 's'} student${count === 1 ? '' : 's'} gave to it. This cannot be undone.`
            : 'will be permanently deleted. No one has answered it, so nothing else is lost.'}
        </p>

        {offerDeactivate && (
          <div className="rounded-xl border border-border bg-sunken px-4 py-3.5">
            <div className="text-[13px] font-semibold text-ink mb-1">Keep the answers instead</div>
            <p className="text-[13px] text-subtle leading-[1.5] mt-0 mb-3">
              An inactive question is never asked again, but the {count} answer{count === 1 ? '' : 's'} already given
              stay in your results.
            </p>
            <Button size="sm" variant="secondary" onClick={onDeactivate} loading={deactivating} disabled={deleting}>
              Make it inactive
            </Button>
          </div>
        )}
      </div>
    </Modal>
  );
}

function QuestionRow({
  question,
  index,
  total,
  onMove,
  onToggleActive,
  onEdit,
  onDelete,
}: {
  question: AdminSurveyQuestion;
  index: number;
  total: number;
  onMove: (delta: number) => void;
  onToggleActive: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div className={cn(surfaceClass, 'lift hover:shadow-card-hover px-5 py-4 flex items-start gap-3.5')}>
      <div className="flex flex-col gap-1 shrink-0 pt-0.5">
        <button
          onClick={() => onMove(-1)}
          disabled={index === 0}
          className={iconButtonClass()}
          aria-label={`Move “${question.prompt}” up`}
        ><ChevronUp size={14} /></button>
        <button
          onClick={() => onMove(1)}
          disabled={index === total - 1}
          className={iconButtonClass()}
          aria-label={`Move “${question.prompt}” down`}
        ><ChevronDown size={14} /></button>
      </div>

      <div className="flex-1 min-w-0">
        {/*
          Only the question's own text dims when it is inactive. Dimming the
          whole row took the badges and the controls down with it, which made
          the one control that turns it back on the hardest thing to read.
        */}
        <div className={cn('transition-opacity duration-quick ease-ui', !question.isActive && 'opacity-55')}>
          <div className="text-[14.5px] font-semibold text-ink mb-1.5">{question.prompt}</div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <span className={cn(pillBase, 'bg-ink/[.06] text-stone')}>{TYPE_LABELS[question.type]}</span>
          {question.isRequired && <span className={cn(pillBase, 'bg-ember/[.08] text-accent-text')}>Required</span>}
          {/*
            The status badge is the switch. A row's most frequent edit is
            "stop asking this", and routing it through the editor modal made a
            one-bit change cost two dialogs.
          */}
          <button
            onClick={onToggleActive}
            aria-pressed={question.isActive}
            title={question.isActive ? 'Asked at signup — click to stop asking it' : 'Not asked — click to start asking it'}
            className={cn(
              pillBase, 'cursor-pointer border-0',
              question.isActive ? 'bg-green-sat/[.12] text-green-sat' : 'bg-[#8C8880]/10 text-[#6B7280]',
            )}
          >
            {question.isActive ? 'Active' : 'Inactive'}
          </button>
          <span className="text-muted text-xs tnum">
            {question.responseCount} response{question.responseCount === 1 ? '' : 's'}
          </span>
        </div>

        {question.options.length > 0 && (
          <div className={cn('mt-2 text-[13px] text-subtle', !question.isActive && 'opacity-55')}>
            {question.options.join(' · ')}
          </div>
        )}
      </div>

      <div className="flex items-center gap-1.5 shrink-0">
        <button onClick={onEdit} className={iconButtonClass()} aria-label={`Edit “${question.prompt}”`}><Pencil size={15} /></button>
        <button onClick={onDelete} className={iconButtonClass('danger')} aria-label={`Delete “${question.prompt}”`}><Trash2 size={15} /></button>
      </div>
    </div>
  );
}

function QuestionsTab({ onAdd, creating, onCloseCreate }: { onAdd: () => void; creating: boolean; onCloseCreate: () => void }) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<AdminSurveyQuestion | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AdminSurveyQuestion | null>(null);
  const [error, setError] = useState('');

  const { data: questions = [], isLoading } = useQuery({ queryKey: QUESTIONS_KEY, queryFn: getSurveyQuestions });
  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: QUESTIONS_KEY });
    // A deleted question takes its answers with it, so the other tab is stale too.
    queryClient.invalidateQueries({ queryKey: RESPONSES_KEY });
  };

  /** Applies `next` to the cached list now, and hands back the rollback. */
  const optimistic = async (next: (list: AdminSurveyQuestion[]) => AdminSurveyQuestion[]) => {
    await queryClient.cancelQueries({ queryKey: QUESTIONS_KEY });
    const previous = queryClient.getQueryData<AdminSurveyQuestion[]>(QUESTIONS_KEY);
    if (previous) queryClient.setQueryData(QUESTIONS_KEY, next(previous));
    return { previous };
  };

  const rollback = (err: unknown, context?: { previous?: AdminSurveyQuestion[] }) => {
    if (context?.previous) queryClient.setQueryData(QUESTIONS_KEY, context.previous);
    showErrorToast(getApiError(err));
  };

  const createMutation = useMutation({
    mutationFn: createSurveyQuestion,
    onSuccess: () => { invalidate(); onCloseCreate(); },
    onError: (err) => setError(getApiError(err)),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Partial<SurveyQuestionPayload> }) => updateSurveyQuestion(id, payload),
    onSuccess: () => { invalidate(); setEditing(null); },
    onError: (err) => setError(getApiError(err)),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteSurveyQuestion(id),
    onSuccess: () => { invalidate(); setDeleteTarget(null); },
  });

  const activeMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) => updateSurveyQuestion(id, { isActive }),
    onMutate: ({ id, isActive }) =>
      optimistic((list) => list.map((q) => (q.id === id ? { ...q, isActive } : q))),
    onError: (err, _vars, context) => rollback(err, context),
    onSettled: invalidate,
  });

  // No refetch on settle, unlike the others. The server stores `sortOrder` as
  // the index it was sent, which is exactly what the optimistic write already
  // put in the cache — so a refetch can only return the same list, and while
  // the admin is clicking "up" repeatedly each one landing mid-click would
  // snap the list back to the previous move for a frame. A failure still rolls
  // the cache back.
  const reorderMutation = useMutation({
    mutationFn: reorderSurveyQuestions,
    onMutate: (ids: string[]) =>
      optimistic((list) => {
        const byId = new Map(list.map((q) => [q.id, q]));
        return ids.flatMap((id, index) => {
          const question = byId.get(id);
          return question ? [{ ...question, sortOrder: index }] : [];
        });
      }),
    onError: (err, _ids, context) => rollback(err, context),
  });

  /** Swaps a question with its neighbour and sends the whole order back. */
  const move = (index: number, delta: number) => {
    const next = [...questions];
    const target = index + delta;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    reorderMutation.mutate(next.map((q) => q.id));
  };

  const deactivate = () => {
    if (!deleteTarget) return;
    activeMutation.mutate(
      { id: deleteTarget.id, isActive: false },
      { onSuccess: () => setDeleteTarget(null) },
    );
  };

  if (isLoading) return <InlineLoader />;

  return (
    <>
      {questions.length === 0 ? (
        <EmptyState
          title="No questions yet"
          action={<Button onClick={onAdd}><Plus size={16} /> Add the first question</Button>}
        >
          Until a question is added there is no survey, and new students go straight to their dashboard.
        </EmptyState>
      ) : (
        <div className="flex flex-col gap-2.5">
          {questions.map((question, index) => (
            <QuestionRow
              key={question.id}
              question={question}
              index={index}
              total={questions.length}
              onMove={(delta) => move(index, delta)}
              onToggleActive={() => activeMutation.mutate({ id: question.id, isActive: !question.isActive })}
              onEdit={() => { setEditing(question); setError(''); }}
              onDelete={() => setDeleteTarget(question)}
            />
          ))}
        </div>
      )}

      {creating && (
        <QuestionEditor
          key="create"
          open
          title="Add Survey Question"
          initial={emptyQuestionForm}
          saving={createMutation.isPending}
          error={error}
          onClose={onCloseCreate}
          onSave={(payload) => createMutation.mutate(payload)}
        />
      )}

      {editing && (
        <QuestionEditor
          key={editing.id}
          open
          title="Edit Survey Question"
          initial={{
            prompt: editing.prompt,
            type: editing.type,
            options: editing.options.length ? editing.options : ['', ''],
            isRequired: editing.isRequired,
            isActive: editing.isActive,
          }}
          responseCount={editing.responseCount}
          saving={updateMutation.isPending}
          error={error}
          onClose={() => setEditing(null)}
          onSave={(payload) => updateMutation.mutate({ id: editing.id, payload })}
        />
      )}

      <DeleteQuestionModal
        question={deleteTarget}
        deleting={deleteMutation.isPending}
        deactivating={activeMutation.isPending}
        onClose={() => setDeleteTarget(null)}
        onDeactivate={deactivate}
        onDelete={() => deleteMutation.mutate(deleteTarget!.id)}
      />
    </>
  );
}

// ── Responses tab ────────────────────────────────────────────────────────────

function RespondentList({ people }: { people: SurveyRespondent[] }) {
  const [query, setQuery] = useState('');

  const needle = query.trim().toLowerCase();
  const filtered = needle
    ? people.filter((person) =>
        [person.userName, person.userEmail, ...person.answers.map((a) => answerText(a.answer, a.type))]
          .some((field) => field?.toLowerCase().includes(needle)),
      )
    : people;

  return (
    <>
      <div className="relative mb-4 max-w-[380px]">
        <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted pointer-events-none" aria-hidden />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name, email or answer"
          aria-label="Search respondents"
          className={inputClass(false, 'pl-9')}
        />
      </div>

      {filtered.length === 0 ? (
        <p className="text-sm text-muted">No one matches “{query}”.</p>
      ) : (
        <div className="flex flex-col gap-2.5">
          {filtered.map((person) => (
            <div key={person.userId} className={cn(surfaceClass, 'px-5 py-4')}>
              <div className="flex items-center gap-2.5 flex-wrap mb-3">
                <span className="text-sm font-semibold text-ink">{person.userName ?? 'Unknown'}</span>
                {person.userEmail && <span className="text-[12.5px] text-muted">{person.userEmail}</span>}
                <span className="text-xs text-muted ml-auto">{formatDate(person.submittedAt)}</span>
              </div>
              <div className="flex flex-col gap-2.5">
                {person.answers.map((answer) => (
                  <div key={answer.questionId}>
                    <div className="text-[13px] font-semibold text-subtle">{answer.prompt}</div>
                    <div className="text-[14px] text-ink whitespace-pre-wrap">{answerText(answer.answer, answer.type)}</div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

function ResponsesTab() {
  const [view, setView] = useState<'summary' | 'people'>('summary');
  const { data: respondents = [], isLoading } = useQuery({ queryKey: RESPONSES_KEY, queryFn: getSurveyResponses });
  const { data: questions = [], isLoading: questionsLoading } = useQuery({
    queryKey: QUESTIONS_KEY,
    queryFn: getSurveyQuestions,
  });

  // A question nobody has answered is still worth seeing as an empty bar; one
  // that is inactive *and* unanswered is just noise.
  const relevant = useMemo(
    () =>
      questions.filter(
        (q) => q.isActive || respondents.some((person) => person.answers.some((a) => a.questionId === q.id)),
      ),
    [questions, respondents],
  );

  if (isLoading || questionsLoading) return <InlineLoader />;

  if (respondents.length === 0) {
    return (
      <EmptyState title="No answers yet">
        As soon as a student signs up and answers the survey, their responses show up here.
      </EmptyState>
    );
  }

  return (
    <>
      <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
        <div role="tablist" aria-label="Response view" className={cn(segmentGroupClass, 'w-[260px]')}>
          {(['summary', 'people'] as const).map((value) => (
            <button
              key={value}
              role="tab"
              aria-selected={view === value}
              onClick={() => setView(value)}
              className={segmentClass(view === value)}
            >
              {value === 'summary' ? 'By question' : 'By student'}
            </button>
          ))}
        </div>
        <span className="text-[13px] text-muted tnum">
          {respondents.length} student{respondents.length === 1 ? '' : 's'} answered
        </span>
      </div>

      {view === 'summary' ? (
        <ResponseSummary questions={relevant} respondents={respondents} />
      ) : (
        <RespondentList people={respondents} />
      )}
    </>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function AdminSurvey() {
  const [tab, setTab] = useState<'questions' | 'responses'>('questions');
  const [creating, setCreating] = useState(false);

  return (
    <div className={pageClass}>
      <PageHeader
        kicker="Registration"
        title="Signup Survey"
        subtitle="Asked once, right after a student signs up. Active questions are the survey."
      >
        {tab === 'questions' && (
          <button onClick={() => setCreating(true)} className={accentActionClass}>
            <Plus size={16} /> Add Question
          </button>
        )}
      </PageHeader>

      <div role="tablist" aria-label="Survey" className={cn(segmentGroupClass, 'max-w-[320px] mb-5')}>
        {(['questions', 'responses'] as const).map((value) => (
          <button
            key={value}
            id={`survey-tab-${value}`}
            role="tab"
            aria-selected={tab === value}
            aria-controls={`survey-panel-${value}`}
            onClick={() => setTab(value)}
            className={segmentClass(tab === value)}
          >
            {value === 'questions' ? 'Questions' : 'Responses'}
          </button>
        ))}
      </div>

      <div id={`survey-panel-${tab}`} role="tabpanel" aria-labelledby={`survey-tab-${tab}`}>
        {tab === 'questions' ? (
          <QuestionsTab
            onAdd={() => setCreating(true)}
            creating={creating}
            onCloseCreate={() => setCreating(false)}
          />
        ) : (
          <ResponsesTab />
        )}
      </div>
    </div>
  );
}
