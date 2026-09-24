import type { ResourceItem } from '@/features/library/api';
import { Dialog } from '@/shared/ui';

export function NoteReadDialog({ item, onClose }: { item: ResourceItem; onClose: () => void }) {
  return (
    <Dialog isOpen onClose={onClose} title={item.title} size="md">
      <div className="whitespace-pre-wrap text-sm leading-[1.75] text-ink min-h-[80px]">
        {item.noteContent || <span className="text-muted">No content.</span>}
      </div>
    </Dialog>
  );
}
