import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Modal, Button, inputClass, segmentGroupClass, segmentClass } from '@/shared/ui';
import { cn } from '@/shared/lib/utils';
import { submitFeedback } from '../api';

type FeedbackCategory = 'bug' | 'suggestion' | 'other';

/** The in-app bug report / suggestion form. Owns its state; closing resets it. */
export function SendFeedbackModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [category, setCategory] = useState<FeedbackCategory>('other');
  const [message, setMessage] = useState('');
  const [sent, setSent] = useState(false);

  const feedbackMutation = useMutation({
    mutationFn: () => submitFeedback({ category, message }),
    onSuccess: () => setSent(true),
    onError: () => {}, // shown inline in the modal, not as a toast
  });

  const close = () => {
    onClose();
    setSent(false);
    setMessage('');
    setCategory('other');
    feedbackMutation.reset();
  };

  return (
    <Modal
      isOpen={open}
      onClose={close}
      title="Send Feedback"
      size="sm"
      footer={
        sent ? (
          <Button variant="secondary" onClick={close}>Close</Button>
        ) : (
          <>
            <Button variant="secondary" onClick={close}>Cancel</Button>
            <Button
              variant="primary"
              onClick={() => feedbackMutation.mutate()}
              loading={feedbackMutation.isPending}
              disabled={message.trim().length < 10}
            >Send</Button>
          </>
        )
      }
    >
      {sent ? (
        <div className="text-center py-4">
          <div aria-hidden className="w-[52px] h-[52px] rounded-full bg-green-dark/10 text-green-dark flex items-center justify-center mx-auto mb-3.5"><svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg></div>
          <div className="text-[19px] font-semibold tracking-[-0.02em] mb-1.5">Thank you!</div>
          <div className="text-[14.5px] text-muted leading-normal">Your feedback has been sent to the admin team.</div>
        </div>
      ) : (
        <div className="flex flex-col gap-3.5">
          {feedbackMutation.isError && (
            <div role="alert" className="bg-danger/[.07] text-danger px-3 py-2.5 rounded-[10px] text-[13.5px]">
              Something went wrong. Please try again.
            </div>
          )}
          <div>
            <label className="block text-[13px] font-medium mb-2 text-ink/[.62]">Category</label>
            <div role="radiogroup" aria-label="Category" className={segmentGroupClass}>
              {(['bug', 'suggestion', 'other'] as FeedbackCategory[]).map((cat) => (
                <button
                  key={cat}
                  onClick={() => setCategory(cat)}
                  role="radio"
                  aria-checked={category === cat}
                  className={cn(segmentClass(category === cat), 'capitalize')}
                >{cat === 'bug' ? 'Bug Report' : cat === 'suggestion' ? 'Suggestion' : 'Other'}</button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-[13px] font-medium mb-2 text-ink/[.62]">
              Message <span className="text-muted font-normal">({message.length}/2000)</span>
            </label>
            <textarea
              className={inputClass(false, 'h-[110px] resize-y')}
              placeholder="Describe the bug or share your suggestion… (min 10 characters)"
              value={message}
              onChange={(e) => setMessage(e.target.value.slice(0, 2000))}
            />
          </div>
        </div>
      )}
    </Modal>
  );
}
