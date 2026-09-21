import type { LibraryItem } from '@/features/library/api';
import { Modal } from '@/shared/ui';

export function NoteReadModal({ item, onClose }: { item: LibraryItem; onClose: () => void }) {
  return (
    <Modal isOpen onClose={onClose} title={item.title} size="md">
      <div className="whitespace-pre-wrap text-sm leading-[1.75] text-ink min-h-[80px]">
        {item.noteContent || <span className="text-muted">No content.</span>}
      </div>
    </Modal>
  );
}
