import type { ConfirmFeedbacks } from '@/features/exam-review/api';
import type { QuestionWithAnswer } from '@/entities/exam';
import { AiFeedbackPanel } from '@/features/exam-review/components/AiFeedbackPanel';
import { PassageBlock, QuestionImage } from '@/features/exam-review/components/PassageBlock';
import { surfaceClass } from '@/shared/ui';
import { cn } from '@/shared/lib/utils';
import { AnswerReview } from './AnswerReview';

export type Confidence = 'sure' | 'eliminated' | 'guessed';
export type AiPending = { confidence: Confidence | null; reasoning: string };
export type AiResult = { isCorrect: boolean; feedbacks: ConfirmFeedbacks; vocabTrackingId: string | null };

const CONFIDENCE_CHIPS: { value: Confidence; label: string }[] = [
  { value: 'sure',       label: 'I was sure' },
  { value: 'eliminated', label: 'Eliminated the wrong ones' },
  { value: 'guessed',    label: 'Guessed' },
];

const toggleBtn = (active: boolean, tone: 'ember' | 'teal') => cn(
  'flex items-center gap-1.5 h-9 px-3.5 rounded-full text-[13px] font-semibold cursor-pointer border',
  !active && 'border-field bg-white text-ink',
  active && tone === 'ember' && 'border-ember bg-ember/[.06] text-accent-text',
  active && tone === 'teal' && 'border-teal-sat bg-teal-sat/[.07] text-teal-sat',
);

/**
 * One question in the report: a row that expands into the answer review, the
 * explanation, and (for practice and mocks) AI guidance and the tutor chat.
 * State lives in the page, so opening the chat on one question closes it on
 * another and AI results survive collapsing a row.
 */
export function ReviewItem({
  r, number, open, onToggle, aiEnabled,
  aiOpen, onToggleAi, aiResult, aiPending, onPending, aiLoading, onGetGuidance,
  chatActive, onToggleChat,
  vocabPick, vocabSubmitted, setVocabPick, setVocabSubmitted,
}: {
  r: QuestionWithAnswer;
  number: number;
  open: boolean;
  onToggle: () => void;
  aiEnabled: boolean;
  aiOpen: boolean;
  onToggleAi: () => void;
  aiResult: AiResult | undefined;
  aiPending: AiPending;
  onPending: (next: AiPending) => void;
  aiLoading: boolean;
  onGetGuidance: () => void;
  chatActive: boolean;
  onToggleChat: () => void;
  vocabPick: Record<string, string>;
  vocabSubmitted: Record<string, boolean>;
  setVocabPick: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  setVocabSubmitted: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
}) {
  const ok = r.isCorrect === true;
  const canGuide = !!aiPending.confidence && !aiLoading;

  return (
    <div className={cn(surfaceClass, 'overflow-hidden')}>
      <button onClick={onToggle} className="w-full flex items-center gap-3.5 px-[18px] py-3.5 bg-transparent cursor-pointer text-left">
        <span
          className={cn(
            'w-[26px] h-[26px] rounded-full shrink-0 flex items-center justify-center text-sm font-bold',
            ok ? 'bg-green-sat/[.12] text-green-sat' : r.isCorrect === false ? 'bg-danger/10 text-danger' : 'bg-ink/[.06] text-stone',
          )}
        >
          {ok ? '✓' : r.isCorrect === false ? '✕' : '–'}
        </span>
        <span className="text-[13px] font-bold text-muted w-[26px]">{String(number).padStart(2, '0')}</span>
        <span className="text-[14.5px] font-semibold flex-1">Question {number}</span>
        <span
          className={cn(
            'text-base inline-block shrink-0 transition-[transform,color] duration-200',
            open ? 'text-accent-text rotate-90' : 'text-gold/75',
          )}
        >▸</span>
      </button>

      {open && (
        <div className="px-3.5 pb-[18px] sm:pl-16 sm:pr-[18px] sm:pb-5">
          {/*
            Passage first, then the question — the order they have to be read
            in. Only an expanded row renders its passage, so several questions
            sharing one never repeat it on screen and no deduplication is
            needed.
          */}
          <PassageBlock passageTitle={r.passageTitle} passageText={r.passageText} />
          <p className="text-[14.5px] font-medium leading-normal mt-0 mb-3.5" dangerouslySetInnerHTML={{ __html: r.questionText }} />
          <QuestionImage imageUrl={r.imageUrl} />
          <AnswerReview r={r} />
          {r.explanation && (
            <div className="bg-sunken rounded-[10px] px-3.5 py-3 text-[13.5px] leading-[1.55] text-body mb-3.5">
              <strong className="text-ink">Why: </strong>{r.explanation}
            </div>
          )}

          {aiEnabled && (
            <div className="flex gap-2 mt-1.5 flex-wrap">
              <button onClick={onToggleAi} className={toggleBtn(aiOpen, 'ember')}>
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/>
                </svg>
                AI Guidance
              </button>
              <button onClick={onToggleChat} className={toggleBtn(chatActive, 'teal')}>
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                </svg>
                Ask a question
              </button>
            </div>
          )}

          {aiEnabled && aiOpen && (
            <div className="mt-3.5 px-5 py-[18px] rounded-[14px] bg-[#F8F6F2] border border-border">
              {aiResult ? (
                <AiFeedbackPanel
                  feedbacks={aiResult.feedbacks}
                  vocabTrackingId={aiResult.vocabTrackingId}
                  questionId={r.id}
                  vocabPick={vocabPick}
                  vocabSubmitted={vocabSubmitted}
                  setVocabPick={setVocabPick}
                  setVocabSubmitted={setVocabSubmitted}
                />
              ) : (
                <>
                  <p className="text-xs font-bold tracking-[0.08em] uppercase text-muted mt-0 mb-3">
                    How did you approach this?
                  </p>
                  <div className="flex gap-2 flex-wrap mb-3">
                    {CONFIDENCE_CHIPS.map((chip) => {
                      const active = aiPending.confidence === chip.value;
                      return (
                        <button
                          key={chip.value}
                          onClick={() => onPending({ ...aiPending, confidence: chip.value })}
                          className={cn(
                            'px-4 py-2 rounded-full text-[13px] font-semibold cursor-pointer transition-all duration-150',
                            active ? 'border-[1.5px] border-ink bg-ink text-white' : 'border border-field bg-white text-stone',
                          )}
                        >
                          {chip.label}
                        </button>
                      );
                    })}
                  </div>
                  <input
                    type="text"
                    value={aiPending.reasoning}
                    onChange={(e) => onPending({ ...aiPending, reasoning: e.target.value })}
                    placeholder="Anything else? (optional)"
                    className="w-full h-10 px-3.5 border border-border rounded-[10px] text-[13.5px] bg-white text-ink outline-none mb-3"
                  />
                  <button
                    onClick={onGetGuidance}
                    disabled={!aiPending.confidence || aiLoading}
                    className={cn('h-[38px] px-5 rounded-full text-white text-[13px] font-semibold', canGuide ? 'bg-accent-text cursor-pointer' : 'bg-field cursor-default')}
                  >
                    {aiLoading ? 'Analysing…' : 'Get AI Guidance →'}
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
