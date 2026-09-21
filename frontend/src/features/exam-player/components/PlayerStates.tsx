import { Button } from '@/shared/ui/Button';

const screen = 'fixed inset-0 z-[100] flex items-center justify-center bg-paper';

export function PlayerLoading() {
  return (
    <div className={screen}>
      <div className="font-display font-semibold text-2xl text-muted">Loading exam…</div>
    </div>
  );
}

export function PlayerLoadError({ message, onBack, onRetry }: { message: string; onBack: () => void; onRetry: () => void }) {
  return (
    <div className={`${screen} flex-col gap-4 p-6 text-center`}>
      <div className="font-display font-semibold text-2xl text-ink">Couldn't open this exam</div>
      <p className="text-[14.5px] text-subtle m-0 max-w-[420px]">{message}</p>
      <div className="flex gap-2.5">
        <Button variant="secondary" onClick={onBack}>Back to dashboard</Button>
        <Button onClick={onRetry}>Try again</Button>
      </div>
    </div>
  );
}

export function PlayerEmpty({ onBack }: { onBack: () => void }) {
  return (
    <div className={`${screen} flex-col gap-4 p-6`}>
      <div className="font-display font-semibold text-2xl">This exam has no questions</div>
      <Button variant="secondary" onClick={onBack}>Back to dashboard</Button>
    </div>
  );
}

/** Covers the player while a section submits or hands over to the next one. */
export function TransitionOverlay() {
  return (
    <div className="fixed inset-0 z-[200] bg-paper flex items-center justify-center flex-col gap-3.5">
      <div className="w-7 h-7 rounded-full border-[3px] border-ember border-t-transparent animate-spin-fast" />
      <div className="text-[15px] font-semibold text-ink">Completing section…</div>
    </div>
  );
}
