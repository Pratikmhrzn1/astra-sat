import type { MockSection } from '@/entities/exam';

const bar = 'shrink-0 flex items-center justify-between px-3.5 sm:px-6 py-2.5';
const dismiss = 'bg-transparent cursor-pointer text-[#6B7280] text-lg leading-none px-1';

/** "Module 1 complete" note at the top of the next module or section. */
export function SectionBanner({ mockSection, onDismiss }: { mockSection: MockSection | undefined; onDismiss: () => void }) {
  const [short, long] = mockSection === 'english_m2'
    ? ['R&W Module 1 done — Module 2 starts', 'Reading & Writing Module 1 complete — now on Module 2']
    : mockSection === 'math_m2'
      ? ['Math Module 1 done — Module 2 starts', 'Math Module 1 complete — now on Module 2']
      : ['Section 1 done — now on Section 2: Math', "Section 1 (Reading & Writing) complete — you're now on Section 2: Math"];

  return (
    <div className={`${bar} bg-blue-sat/[.07] border-b border-blue-sat/[.18]`}>
      <div className="flex items-center gap-2.5">
        <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="#2563A8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
        <span className="text-[13px] font-semibold text-[#1D4ED8]">
          <span className="sm:hidden">{short}</span>
          <span className="hidden sm:inline">{long}</span>
        </span>
      </div>
      <button onClick={onDismiss} className={dismiss}>×</button>
    </div>
  );
}

/** A failed submit or transition, with a retry, so the student is never stuck. */
export function ActionErrorBanner({ message, onRetry, onDismiss }: { message: string; onRetry: () => void; onDismiss: () => void }) {
  return (
    <div role="alert" className={`${bar} gap-3 bg-danger/[.07] border-b border-danger/25`}>
      <span className="text-[13px] font-semibold text-[#A93226]">{message}</span>
      <div className="flex gap-2 shrink-0">
        <button onClick={onRetry} className="bg-danger text-white rounded-full px-3.5 py-1.5 text-[13px] font-semibold cursor-pointer">Retry</button>
        <button onClick={onDismiss} aria-label="Dismiss" className={dismiss}>×</button>
      </div>
    </div>
  );
}
