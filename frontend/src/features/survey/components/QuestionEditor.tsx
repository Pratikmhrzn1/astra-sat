import { useRef, useState } from 'react';
import { X } from 'lucide-react';
import {
  type IntakeAnswer,
  type IntakeQuestionPayload,
  type IntakeQuestionType,
} from '@/features/survey/api';
import { ItemField } from '@/features/survey/components/QuestionField';
import {
  Control, Dialog, Switch,
  alertStyle, hintTextStyle, iconControlStyle, fieldInputStyle, fieldCaptionStyle, segmentStyle,
} from '@/shared/ui';
import { classes } from '@/shared/lib/utils';

/**
 * Authoring one survey question.
 *
 * The form is remounted per open (the `key` at the call sites), which is what
 * resets it — editing one question never shows another's draft.
 *
 * Every rule the server enforces is also checked here, so a mistake is named
 * under the field that caused it instead of arriving as a rejected save. The
 * server remains the authority; this only saves the round trip.
 */

export const TYPE_CAPTIONS: Record<IntakeQuestionType, string> = {
  single_choice: 'Single choice',
  multi_choice: 'Multiple choice',
  short_text: 'Short text',
  scale: 'Scale 1–5',
};

export const CHOICE_KINDS: IntakeQuestionType[] = ['single_choice', 'multi_choice'];

export const MAX_CHOICES = 12;

export const emptyItemSheet: IntakeQuestionPayload = {
  prompt: '',
  type: 'single_choice',
  options: ['', ''],
  isRequired: true,
  isActive: true,
};

interface Problems {
  prompt?: string;
  options?: string;
}

function validate(form: IntakeQuestionPayload, filled: string[]): Problems {
  const problems: Problems = {};
  if (form.prompt.trim().length < 3) problems.prompt = 'Give the question at least 3 characters.';

  if (CHOICE_KINDS.includes(form.type)) {
    if (filled.length < 2) {
      problems.options = 'A choice question needs at least 2 options.';
    } else if (new Set(filled.map((o) => o.toLowerCase())).size !== filled.length) {
      // Matches the server's case-insensitive check, so "Maths" and "maths"
      // are rejected here rather than on save.
      problems.options = 'Two options are the same. Each option must be distinct.';
    }
  }
  return problems;
}

export function ItemComposer({
  open,
  initial,
  title,
  saving,
  error,
  /** Answers already given to this question; above zero the type is frozen. */
  responseCount = 0,
  onClose,
  onSave,
}: {
  open: boolean;
  initial: IntakeQuestionPayload;
  title: string;
  saving: boolean;
  error: string;
  responseCount?: number;
  onClose: () => void;
  onSave: (payload: IntakeQuestionPayload) => void;
}) {
  const [form, setForm] = useState(initial);
  const [preview, setPreview] = useState<IntakeAnswer | undefined>(undefined);
  const optionRefs = useRef(new Map<number, HTMLInputElement>());

  const takesOptions = CHOICE_KINDS.includes(form.type);
  const filled = form.options.map((o) => o.trim()).filter(Boolean);
  const problems = validate(form, filled);
  const valid = !problems.prompt && !problems.options;

  // The server refuses a type change once answers exist, because nothing
  // rewrites the answers already stored in the old type's shape.
  const typeLocked = responseCount > 0;

  const setOptions = (next: (options: string[]) => string[]) =>
    setForm((f) => ({ ...f, options: next(f.options) }));

  const addOption = (focusIt = true) => {
    if (form.options.length >= MAX_CHOICES) return;
    const index = form.options.length;
    setOptions((options) => [...options, '']);
    if (focusIt) requestAnimationFrame(() => optionRefs.current.get(index)?.focus());
  };

  const previewQuestion = {
    id: 'preview',
    prompt: form.prompt.trim() || 'Your question',
    type: form.type,
    // Deduped: two options read the same while one is still being typed, and a
    // choice list keyed by its own text would collide on the way through.
    options: [...new Set(filled)],
    isRequired: form.isRequired,
  };
  // A preview of a question that cannot be saved would show a list the student
  // will never see; the problem under the options field is the useful thing.
  const previewReady = !takesOptions || (filled.length >= 2 && !problems.options);

  return (
    <Dialog
      isOpen={open}
      // Closing mid-save would leave the student-facing survey in whichever
      // state the request settles on, with nothing on screen to say so.
      onClose={saving ? () => {} : onClose}
      title={title}
      size="lg"
      footer={
        <>
          <Control variant="secondary" onClick={onClose} disabled={saving}>Cancel</Control>
          <Control
            onClick={() => onSave({ ...form, prompt: form.prompt.trim(), options: takesOptions ? filled : [] })}
            loading={saving}
            disabled={!valid}
          >
            Save Question
          </Control>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        <div>
          <label className={fieldCaptionStyle} htmlFor="survey-prompt">Question</label>
          <textarea
            id="survey-prompt"
            value={form.prompt}
            onChange={(e) => setForm((f) => ({ ...f, prompt: e.target.value }))}
            rows={2}
            placeholder="e.g. What is your target SAT score?"
            aria-invalid={!!problems.prompt}
            className={fieldInputStyle(false, 'resize-y min-h-[64px]')}
          />
          {problems.prompt && <p className={hintTextStyle}>{problems.prompt}</p>}
        </div>

        <div>
          <label className={fieldCaptionStyle}>Answer type</label>
          {/*
            A grid rather than the four-up segmented control: "Multiple choice"
            does not fit a quarter of this modal on a phone, and the labels were
            clipping. Two columns below `sm`, four above, same recipe either way.
          */}
          <div
            role="radiogroup"
            aria-label="Answer type"
            className="grid grid-cols-2 sm:grid-cols-4 gap-0.5 p-0.5 rounded-[10px] bg-ink/[.06]"
          >
            {(Object.keys(TYPE_CAPTIONS) as IntakeQuestionType[]).map((type) => (
              <button
                key={type}
                type="button"
                role="radio"
                aria-checked={form.type === type}
                disabled={typeLocked && form.type !== type}
                onClick={() =>
                  setForm((f) => ({
                    ...f,
                    type,
                    // Keep whatever options were typed when moving between the
                    // two choice types; seed a pair when arriving from a type
                    // that has none.
                    options: CHOICE_KINDS.includes(type) ? (f.options.length ? f.options : ['', '']) : f.options,
                  }))
                }
                className={classes(segmentStyle(form.type === type), 'disabled:opacity-40 disabled:cursor-not-allowed')}
              >
                {TYPE_CAPTIONS[type]}
              </button>
            ))}
          </div>
          {typeLocked && (
            <p className={hintTextStyle}>
              {responseCount} student{responseCount === 1 ? ' has' : 's have'} already answered this, so its answer type
              is fixed. Make it inactive and add a replacement instead.
            </p>
          )}
        </div>

        {takesOptions && (
          <div>
            <label className={fieldCaptionStyle}>Options</label>
            <div className="flex flex-col gap-2">
              {form.options.map((option, index) => (
                <div key={index} className="flex gap-2">
                  <input
                    ref={(node) => {
                      if (node) optionRefs.current.set(index, node);
                      else optionRefs.current.delete(index);
                    }}
                    value={option}
                    onChange={(e) => setOptions((options) => options.map((o, i) => (i === index ? e.target.value : o)))}
                    onKeyDown={(e) => {
                      // Enter on the last option adds the next one, so a list
                      // can be typed without reaching for the mouse each time.
                      if (e.key !== 'Enter') return;
                      e.preventDefault();
                      if (index === form.options.length - 1) addOption();
                      else optionRefs.current.get(index + 1)?.focus();
                    }}
                    placeholder={`Option ${index + 1}`}
                    aria-label={`Option ${index + 1}`}
                    className={fieldInputStyle()}
                  />
                  <button
                    type="button"
                    onClick={() => setOptions((options) => options.filter((_, i) => i !== index))}
                    disabled={form.options.length <= 2}
                    className={iconControlStyle('danger')}
                    aria-label={`Remove option ${index + 1}`}
                    title={form.options.length <= 2 ? 'A choice question needs at least 2 options' : 'Remove option'}
                  >
                    <X size={15} />
                  </button>
                </div>
              ))}
            </div>
            {problems.options && <p className={hintTextStyle}>{problems.options}</p>}
            {form.options.length < MAX_CHOICES ? (
              <button
                type="button"
                onClick={() => addOption()}
                className="mt-2 -ml-1.5 px-1.5 py-1 rounded-lg text-[13px] font-semibold text-accent-text bg-transparent border-0 cursor-pointer hover:bg-ember/[.08]"
              >
                + Add option
              </button>
            ) : (
              <p className={hintTextStyle}>That is the maximum of {MAX_CHOICES} options.</p>
            )}
          </div>
        )}

        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="text-[13px] font-semibold text-body">Required</div>
            <div className="text-xs text-muted">Students cannot continue without answering it.</div>
          </div>
          <Switch on={form.isRequired} onClick={() => setForm((f) => ({ ...f, isRequired: !f.isRequired }))} label="Required" />
        </div>

        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="text-[13px] font-semibold text-body">Active</div>
            <div className="text-xs text-muted">Inactive questions keep past answers but are no longer asked.</div>
          </div>
          <Switch on={form.isActive} onClick={() => setForm((f) => ({ ...f, isActive: !f.isActive }))} label="Active" />
        </div>

        {/*
          The same component the student answers, not a mock-up of it — an admin
          checking whether five options fit or whether a scale reads the right
          way round is looking at the real thing.
        */}
        <div>
          <label className={fieldCaptionStyle}>Student preview</label>
          <div className="rounded-2xl border border-border bg-sunken p-4">
            <div className={classes(fieldCaptionStyle, 'mb-3')}>
              {previewQuestion.prompt}
              {!form.isRequired && <span className="ml-2 font-normal text-muted">(optional)</span>}
            </div>
            {previewReady ? (
              <ItemField question={previewQuestion} value={preview} onChange={setPreview} />
            ) : (
              <p className="text-[13px] text-muted m-0">
                {problems.options ?? 'Add at least 2 options to see the preview.'}
              </p>
            )}
          </div>
        </div>

        {error && <div role="alert" className={alertStyle}>{error}</div>}
      </div>
    </Dialog>
  );
}
