import {
  drillLetterStyle, quizChoiceClass, quizChoiceStatus, quizOutcomeClass, quizOutcomeCaptionClass,
  reviewLexicon, type LexiconDrillContent,
} from '@/features/vocab';
import { classes } from '@/shared/lib/utils';
import type { AcknowledgeNotes, ReasoningTag, CommandOfEvidenceAuthoring, TransitionsCoachAuthoring } from '@/features/exam-review/api';

/**
 * Renders the AI feedback cards for one confirmed answer.
 *
 * The backend decides which of the six feedback types apply to a question and
 * returns null for any that failed, so this renders whatever arrived and skips
 * the rest — a missing card is never an error state here.
 */

export const TAG_META: Record<
  ReasoningTag,
  { label: string; tone: string; labelTone: string }
> = {
  correct_logic_correct_answer: { label: 'Strong reasoning',                     tone: 'bg-green-sat/[.07] border-green-sat/25', labelTone: 'text-green-dark' },
  correct_logic_wrong_answer:   { label: 'Sound logic — likely a misread',        tone: 'bg-gold/[.07] border-gold/30',           labelTone: 'text-gold' },
  wrong_logic_correct_answer:   { label: 'Right answer — review your reasoning',  tone: 'bg-gold/[.07] border-gold/30',           labelTone: 'text-gold' },
  wrong_logic_wrong_answer:     { label: 'Comprehension gap identified',          tone: 'bg-danger/[.07] border-danger/20',       labelTone: 'text-danger' },
};

const kicker = 'text-[10.5px] font-bold tracking-[0.08em] uppercase';
const body = 'text-[13.5px] leading-[1.55] text-ink m-0';
const note = 'px-4 py-3 rounded-[10px] border';

export function AiNotePane({
  feedbacks,
  vocabTrackingId,
  questionId,
  vocabPick,
  vocabSubmitted,
  setVocabPick,
  setVocabSubmitted,
}: {
  feedbacks: AcknowledgeNotes;
  vocabTrackingId: string | null;
  questionId: string;
  vocabPick: Record<string, string>;
  vocabSubmitted: Record<string, boolean>;
  setVocabPick: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  setVocabSubmitted: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
}) {
  return (
    <div className="flex flex-col gap-2.5 mt-3.5">
      {feedbacks.reasoning_checkpoint && (() => {
        const rc = feedbacks.reasoning_checkpoint!;
        const meta = TAG_META[rc.classification as ReasoningTag] ?? TAG_META.correct_logic_correct_answer;
        return (
          <div className={classes('px-[18px] py-4 rounded-xl border', meta.tone)}>
            <div className={classes('text-[11px] font-bold tracking-[0.08em] uppercase mb-2', meta.labelTone)}>{meta.label}</div>
            <p className="text-sm leading-[1.6] text-ink m-0">{rc.explanation}</p>
          </div>
        );
      })()}

      {feedbacks.grammar_diagnosis && (
        <div className={classes(note, 'bg-[#F0ECE4] border-gold/25')}>
          <div className={classes(kicker, 'text-gold-dark mb-[5px]')}>
            Grammar rule: {feedbacks.grammar_diagnosis.grammarRule}
          </div>
          <p className={body}>{feedbacks.grammar_diagnosis.grammarFix}</p>
        </div>
      )}

      {feedbacks.trap_explainer && (
        <div className={classes(note, 'bg-ink/[.03] border-border')}>
          <div className={classes(kicker, 'text-muted mb-[5px]')}>
            Trap: {feedbacks.trap_explainer.trap}
          </div>
          <p className={body}>{feedbacks.trap_explainer.explanation}</p>
        </div>
      )}

      {feedbacks.command_of_evidence && (() => {
        const coe = feedbacks.command_of_evidence as CommandOfEvidenceAuthoring;
        return (
          <div className={classes(note, 'bg-[rgba(37,99,235,0.04)] border-[rgba(37,99,235,0.2)]')}>
            <div className={classes(kicker, 'text-[#1D4ED8] mb-2')}>Supporting evidence</div>
            <blockquote className="font-serif text-[15px] leading-[1.6] text-ink mt-0 mx-0 mb-2.5 pl-3 border-l-2 border-[rgba(37,99,235,0.35)] italic">
              "{coe.supportingLine}"
            </blockquote>
            <p className={classes(body, 'mb-1')}>{coe.whyCorrect}</p>
            <p className={classes(body, 'text-ink/60')}>{coe.whyStudentWrong}</p>
          </div>
        );
      })()}

      {feedbacks.transitions_coach && (() => {
        const tc = feedbacks.transitions_coach as TransitionsCoachAuthoring;
        return (
          <div className={classes(note, 'bg-[rgba(124,58,237,0.04)] border-[rgba(124,58,237,0.2)]')}>
            <div className={classes(kicker, 'text-[#6D28D9] mb-2')}>Transition logic</div>
            <p className={classes(body, 'mb-1.5')}>{tc.logicalRelationship}</p>
            <p className={classes(body, 'mb-1')}>{tc.whyCorrect}</p>
            <p className={classes(body, 'text-ink/60')}>{tc.whyStudentWrong}</p>
          </div>
        );
      })()}

      {feedbacks.vocab_drill && (() => {
        const vd = feedbacks.vocab_drill as LexiconDrillContent;
        const optLetters = ['A', 'B', 'C', 'D'];
        const picked = vocabPick[questionId];
        const isSubmitted = !!vocabSubmitted[questionId];
        const isPickCorrect = picked === vd.correctOption;

        const handleVocabSubmit = () => {
          if (!picked || isSubmitted) return;
          setVocabSubmitted((s) => ({ ...s, [questionId]: true }));
          if (vocabTrackingId) reviewLexicon(vocabTrackingId, picked === vd.correctOption).catch(console.error);
        };

        return (
          <div className="px-4 py-3.5 rounded-xl bg-[rgba(0,128,128,0.04)] border-2 border-[rgba(0,128,128,0.18)]">
            <div className={classes(kicker, 'text-teal-sat mb-1.5')}>
              Vocab drill — "{vd.word}"
            </div>
            <p className="text-[13px] leading-[1.55] text-ink/60 mt-0 mb-2.5 italic">"{vd.sentenceContext}"</p>
            <p className="text-[13.5px] font-semibold text-ink mt-0 mb-2.5">{vd.followUpQuestion}</p>
            <div className="flex flex-col gap-1.5 mb-2.5">
              {vd.options.map((opt, oi) => {
                const letter = optLetters[oi];
                const state = quizChoiceStatus({ submitted: isSubmitted, picked: picked === letter, correct: letter === vd.correctOption });
                return (
                  <button
                    key={letter}
                    onClick={() => { if (!isSubmitted) setVocabPick((p) => ({ ...p, [questionId]: letter })); }}
                    disabled={isSubmitted}
                    className={quizChoiceClass(state, isSubmitted, 'sm')}
                  >
                    <span className={drillLetterStyle(state, 'sm')}>{letter}</span>
                    {opt}
                  </button>
                );
              })}
            </div>
            {isSubmitted ? (
              <div className={classes('px-3 py-2.5 rounded-lg mt-1', quizOutcomeClass(isPickCorrect))}>
                <div className={classes('text-[11.5px] font-bold mb-1', quizOutcomeCaptionClass(isPickCorrect))}>
                  {isPickCorrect ? '✓ Correct' : '✗ Incorrect — correct answer: ' + vd.correctOption}
                </div>
                <p className="text-[13px] leading-normal text-ink m-0">{vd.explanation}</p>
              </div>
            ) : (
              <button
                onClick={handleVocabSubmit}
                disabled={!picked}
                className={classes('h-9 px-[18px] rounded-full text-white text-[13px] font-bold', picked ? 'bg-teal-sat cursor-pointer' : 'bg-field cursor-default')}
              >
                Check answer
              </button>
            )}
          </div>
        );
      })()}
    </div>
  );
}
