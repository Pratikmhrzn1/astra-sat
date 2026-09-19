import { kickerClass } from '@/shared/ui';
import { cn } from '@/shared/lib/utils';

/**
 * The passage a question refers to, and the diagram it carries, shown in review.
 *
 * Both were missing from every review screen until now — not because they were
 * hidden, but because three separate review queries each forgot to join
 * `passages` and to select `imageUrl`. A question like "Which choice most
 * logically completes the text?" is unanswerable without the text, so these
 * are not decoration.
 *
 * Shared by the student's report and the teacher's read of it, so the two
 * cannot drift.
 *
 * Typography follows `exam-player/components/QuestionPane.tsx`: serif, a size
 * up from the UI text, and `whitespace-pre-wrap`, because passages are stored
 * as authored HTML but most are plain text whose paragraphing lives in its
 * newlines. A pixel or two smaller than the player's, since a review card is
 * narrower than a full-screen passage column.
 */

export function PassageBlock({
  passageTitle,
  passageText,
  className,
}: {
  passageTitle: string | null;
  passageText: string | null;
  className?: string;
}) {
  if (!passageText) return null;

  return (
    <div className={cn('rounded-xl bg-[#FBFAF8] border border-border-soft px-4 py-3.5 mb-3.5', className)}>
      {/*
        A label, not just the title: every passage in the database has an empty
        title, and without something here the passage runs straight into the
        question with nothing to say which is which.
      */}
      <div className={cn(kickerClass, 'mb-2')}>{passageTitle || 'Passage'}</div>
      <p
        className="font-serif text-[15px] sm:text-[16.5px] leading-[1.7] text-ink m-0 whitespace-pre-wrap"
        dangerouslySetInnerHTML={{ __html: passageText }}
      />
    </div>
  );
}

/** A question's diagram. Sits under the question text, as it does in the player. */
export function QuestionImage({ imageUrl, className }: { imageUrl: string | null; className?: string }) {
  if (!imageUrl) return null;
  return (
    <div className={cn('mb-3.5', className)}>
      <img
        src={imageUrl}
        alt="Question diagram"
        className="max-w-full max-h-[320px] rounded-[10px] border border-border object-contain block"
      />
    </div>
  );
}
