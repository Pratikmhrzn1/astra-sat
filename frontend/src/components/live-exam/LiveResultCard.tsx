import { ChevronRight } from 'lucide-react';
import type { LiveExamResult } from '@/api/liveExam';
import { liveCardClass, liveKickerClass, liveTitleClass } from '@/components/live-exam/ui';
import { cn } from '@/lib/utils';

/**
 * One released live exam in the student's History: when it was sat, a link into
 * each section's full review, and the teacher's note on the paper.
 */
export function LiveResultCard({ result, onOpen }: {
  result: LiveExamResult;
  onOpen: (examId: string) => void;
}) {
  const sections = [
    { label: 'Reading & Writing', short: 'R&W', examId: result.englishExamId, dot: 'bg-green-sat' },
    { label: 'Math', short: 'Math', examId: result.mathExamId, dot: 'bg-blue-sat' },
  ].filter((s): s is typeof s & { examId: string } => !!s.examId);

  const date = result.startedAt
    ? new Date(result.startedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
    : null;

  return (
    <article className={cn(liveCardClass, 'overflow-hidden')}>
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 sm:gap-4 px-4 py-3.5 sm:pl-5 sm:pr-[18px] sm:py-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className={cn(liveKickerClass, 'text-accent-text')}>Live exam</span>
            {date && <span className="text-[12.5px] text-muted">· {date}</span>}
          </div>
          <h3 className={cn(liveTitleClass, 'text-xl leading-[1.25] [overflow-wrap:anywhere]')}>{result.sessionTitle}</h3>
        </div>

        <div className={cn('grid gap-2 sm:grid-flow-col sm:grid-cols-none', sections.length === 2 ? 'grid-cols-2' : 'grid-cols-1')}>
          {sections.map((s) => (
            <button
              key={s.label}
              onClick={() => onOpen(s.examId)}
              aria-label={`Open ${s.label} review`}
              className="inline-flex items-center justify-center gap-[7px] h-[38px] pl-3.5 pr-2.5 rounded-full border border-border bg-white text-ink text-[13px] font-semibold cursor-pointer whitespace-nowrap"
            >
              <span aria-hidden className={cn('w-[7px] h-[7px] rounded-full', s.dot)} />
              <span className="sm:hidden">{s.short}</span>
              <span className="hidden sm:inline">{s.label}</span>
              <ChevronRight size={15} aria-hidden className="text-muted -ml-0.5" />
            </button>
          ))}
        </div>
      </div>

      {result.globalFeedback && (
        <div className="border-t border-sunken bg-[#FBFAF8] px-4 sm:px-5 pt-3 pb-3.5">
          <div className={cn(liveKickerClass, 'mb-1')}>Note from your teacher</div>
          <p className="text-sm text-ink m-0 leading-[1.6] whitespace-pre-line [overflow-wrap:anywhere]">{result.globalFeedback}</p>
        </div>
      )}
    </article>
  );
}
