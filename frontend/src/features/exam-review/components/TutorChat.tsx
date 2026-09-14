import type { RefObject } from 'react';
import { cn } from '@/shared/lib/utils';

export type ChatMessage = { role: 'user' | 'assistant'; content: string };

/** The tutor chat docked to the bottom of the report, scoped to one question. */
export function TutorChat({
  questionNumber, messages, loading, error, input, onInput, onSend, onClose, messagesRef,
}: {
  questionNumber: number | '';
  messages: ChatMessage[];
  loading: boolean;
  error: string | null;
  input: string;
  onInput: (value: string) => void;
  onSend: () => void;
  onClose: () => void;
  messagesRef: RefObject<HTMLDivElement>;
}) {
  const canSend = !!input.trim() && !loading;

  return (
    <div className="fixed bottom-0 inset-x-0 h-[52vh] sm:h-[380px] bg-white border-t border-border shadow-[0_-8px_32px_rgba(11,11,14,0.12)] flex flex-col z-[44] animate-[chatSlideUp_0.2s_ease-out]">
      <div className="h-12 shrink-0 flex items-center justify-between px-5 border-b border-[#F0ECE4]">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-teal-sat shrink-0" />
          <span className="text-[13.5px] font-bold">SAT Tutor</span>
          <span className="text-[11px] text-muted font-medium">· Q{questionNumber}</span>
        </div>
        <button onClick={onClose} className="bg-transparent cursor-pointer text-stone text-[22px] leading-none p-0">×</button>
      </div>

      <div ref={messagesRef} className="scrollarea flex-1 overflow-y-auto px-5 py-3.5 flex flex-col gap-2.5">
        {messages.length === 0 && (
          <p className="text-muted text-[13.5px] text-center mt-5 mb-0">
            Ask anything about this question — grammar rules, what the passage means, strategy.
          </p>
        )}
        {messages.map((msg, mi) => (
          <div key={mi} className={cn('flex', msg.role === 'user' ? 'justify-end' : 'justify-start')}>
            <div
              className={cn(
                'max-w-[82%] px-3.5 py-[9px] text-[13.5px] leading-[1.55]',
                msg.role === 'user' ? 'rounded-[14px_14px_4px_14px] bg-ink text-white' : 'rounded-[14px_14px_14px_4px] bg-sunken text-ink',
              )}
            >
              {msg.content}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="px-4 py-2.5 rounded-[14px_14px_14px_4px] bg-sunken flex gap-[5px] items-center">
              {['[animation-delay:0s]', '[animation-delay:0.2s]', '[animation-delay:0.4s]'].map((delay) => (
                <div key={delay} className={cn('w-[7px] h-[7px] rounded-full bg-ink/45 animate-chat-dot', delay)} />
              ))}
            </div>
          </div>
        )}
        {error && <p className="text-[12.5px] text-danger text-center m-0">{error}</p>}
      </div>

      <div className="h-[60px] shrink-0 border-t border-[#F0ECE4] flex items-center gap-2.5 px-4">
        <input
          type="text"
          value={input}
          onChange={(e) => onInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onSend(); } }}
          placeholder="Ask about this question…"
          disabled={loading}
          className="flex-1 h-[38px] px-3.5 border border-border rounded-full text-[13.5px] bg-paper text-ink outline-none"
        />
        <button
          onClick={onSend}
          disabled={loading || !input.trim()}
          className={cn('h-[38px] px-[18px] rounded-full text-white text-[13px] font-semibold shrink-0', canSend ? 'bg-ink cursor-pointer' : 'bg-field cursor-default')}
        >Send</button>
      </div>
    </div>
  );
}
