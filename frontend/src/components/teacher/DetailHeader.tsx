import { ArrowLeft, MessageSquare } from 'lucide-react';

/** "← Back" pill at the top of the teacher's drill-down pages. */
export function BackPill({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-1.5 h-9 px-3.5 border border-border rounded-full bg-white text-[13px] font-semibold cursor-pointer text-ink shrink-0"
    >
      <ArrowLeft size={14} /> Back
    </button>
  );
}

/** The accent "Send Feedback" action beside a student's name. */
export function SendFeedbackPill({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-2 h-10 px-[18px] bg-accent-text text-white rounded-full text-sm font-semibold cursor-pointer shrink-0"
    ><MessageSquare size={15} /> Send Feedback</button>
  );
}
