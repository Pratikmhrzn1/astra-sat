import type { QuestionWithAnswer } from '@/api/student';
import { cn } from '@/lib/utils';

/**
 * What the student picked against what was right, for one reviewed question.
 *
 * The summary line always states both, because a colour on one row is easy to
 * miss and says nothing on its own when the pick was correct or when nothing was
 * answered. The options below repeat it in place: the correct row in green, a
 * wrong pick in red, and the student's own choice labelled either way.
 */
export function AnswerReview({ r }: { r: QuestionWithAnswer }) {
  const isSPR = r.questionType === 'student_produced_response';
  const picked = isSPR ? (r.selectedAnswerText?.trim() || null) : r.selectedAnswer;
  const correct = isSPR ? r.correctAnswerText : r.correctAnswer;
  const show = (v: string | null) => (v === null ? '—' : isSPR ? v : v.toUpperCase());
  const outcome = picked === null ? 'skipped' : r.isCorrect ? 'right' : 'wrong';
  const tone = { right: 'text-green-dark', wrong: 'text-danger', skipped: 'text-subtle' }[outcome];

  return (
    <div className="mb-3.5">
      <div
        className={cn(
          'flex flex-wrap items-baseline gap-x-3.5 gap-y-1 px-3.5 py-2.5 rounded-[10px] text-sm',
          outcome === 'right' ? 'bg-green-sat/[.07]' : outcome === 'wrong' ? 'bg-danger/[.06]' : 'bg-sunken',
          isSPR ? 'mb-0' : 'mb-2',
        )}
      >
        <span>
          <span className="text-subtle">Your answer </span>
          <strong className={tone}>{picked === null ? 'Not answered' : show(picked)}</strong>
        </span>
        {outcome !== 'right' && (
          <span>
            <span className="text-subtle">Correct answer </span>
            <strong className="text-green-dark">{show(correct)}</strong>
          </span>
        )}
        {outcome === 'right' && <strong className={tone}>Correct</strong>}
      </div>

      {!isSPR && (
        <div className="flex flex-col gap-[7px]">
          {(['a', 'b', 'c', 'd'] as const).map((key) => {
            const text = r[`option${key.toUpperCase()}` as 'optionA' | 'optionB' | 'optionC' | 'optionD'];
            if (!text) return null;
            const isCorrect = r.correctAnswer === key;
            const isYour = r.selectedAnswer === key;
            return (
              <div
                key={key}
                className={cn(
                  'flex items-center gap-2.5 px-3.5 py-2.5 rounded-[10px]',
                  isCorrect ? 'bg-green-sat/[.08] border border-green-sat/40'
                    : isYour ? 'bg-danger/[.06] border-[1.5px] border-danger/45'
                      : 'bg-paper border border-[#EAE7E1]',
                )}
              >
                <span
                  className={cn(
                    'w-[22px] h-[22px] shrink-0 rounded-full flex items-center justify-center text-xs font-bold',
                    // The student's own pick gets a filled letter, whichever way it went.
                    isYour ? cn('text-white', isCorrect ? 'bg-green-dark' : 'bg-danger') : 'bg-transparent text-stone border border-border-strong',
                  )}
                >{key.toUpperCase()}</span>
                <span className="text-sm flex-1">{text}</span>
                <span className="flex gap-2 shrink-0">
                  {isYour && <span className={cn('text-[11.5px] font-bold', isCorrect ? 'text-green-dark' : 'text-danger')}>Your answer</span>}
                  {isCorrect && <span className="text-[11.5px] font-bold text-green-dark">Correct</span>}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
