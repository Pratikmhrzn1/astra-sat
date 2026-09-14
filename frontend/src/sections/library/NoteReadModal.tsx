import type { LibraryItem } from '@/api/library';
import { Modal } from '@/components/common';

export function NoteReadModal({ item, onClose }: { item: LibraryItem; onClose: () => void }) {
  return (
    <Modal isOpen onClose={onClose} title={item.title} size="md">
      <div className="whitespace-pre-wrap text-sm leading-[1.75] text-ink min-h-[80px]">
        {item.noteContent || <span className="text-muted">No content.</span>}
      </div>
    </Modal>
  );
}
