import { Button } from '@/components/common/Button';
import { Modal } from '@/components/common/Modal';

/** Ending a section cannot be undone, so it asks first and says what is left. */
export function FinishConfirmModal({
  open, onClose, title, finishLabel, onFinish, loading, movesOn,
  total, answeredCount, unansweredCount, flaggedCount, onReview,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  finishLabel: string;
  onFinish: () => void;
  loading: boolean;
  /** True when finishing opens another module/section rather than submitting. */
  movesOn: boolean;
  total: number;
  answeredCount: number;
  unansweredCount: number;
  flaggedCount: number;
  onReview: () => void;
}) {
  const chip = 'px-2.5 py-[5px] rounded-full';
  return (
    <Modal
      isOpen={open}
      onClose={onClose}
      title={title}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Keep working</Button>
          <Button onClick={onFinish} loading={loading}>{finishLabel}</Button>
        </>
      }
    >
      <p className="mt-0 mb-3 text-body">
        {movesOn
          ? "You won't be able to come back to these questions once the next part starts."
          : "You won't be able to change your answers after submitting."}
      </p>
      <div className="flex gap-2 flex-wrap text-[13.5px]">
        <span className={`${chip} bg-sunken`}><strong>{answeredCount}</strong> of {total} answered</span>
        {unansweredCount > 0 && <span className={`${chip} bg-danger/[.08] text-[#A93226]`}><strong>{unansweredCount}</strong> unanswered</span>}
        {flaggedCount > 0 && <span className={`${chip} bg-ember/[.08] text-accent-text`}><strong>{flaggedCount}</strong> flagged</span>}
      </div>
      {(unansweredCount > 0 || flaggedCount > 0) && (
        <button onClick={onReview} className="mt-3 bg-transparent p-0 text-blue-sat text-[13.5px] font-semibold cursor-pointer">
          Review {unansweredCount > 0 ? 'unanswered' : 'flagged'} questions →
        </button>
      )}
    </Modal>
  );
}
