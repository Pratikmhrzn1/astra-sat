import { EyeOff, Pencil, Trash2 } from 'lucide-react';
import type { LibraryItem } from '@/features/library/api';
import { surfaceClass } from '@/shared/ui';
import { cn } from '@/shared/lib/utils';
import { TYPE_META } from './libraryMeta';

const squareBtn = 'w-[34px] h-[34px] border border-border bg-white rounded-lg flex items-center justify-center cursor-pointer';

/** A resource in the teacher/admin grid: open it, and edit or delete it when allowed. */
export function LibraryItemCard({
  item, canEdit, showUploader, onEdit, onDelete, onRead,
}: {
  item: LibraryItem;
  canEdit: boolean;
  showUploader?: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onRead: () => void;
}) {
  const meta = TYPE_META[item.fileType] ?? TYPE_META.other;
  const isNote = item.fileType === 'note';
  return (
    <div className={cn(surfaceClass, 'p-5 flex flex-col relative', item.hidden && 'opacity-60')}>
      {item.hidden && (
        <div className="absolute top-3.5 right-3.5 flex items-center gap-1 bg-ink/[.07] rounded-lg px-2 py-[3px] text-[11px] font-semibold text-stone">
          <EyeOff size={11} /> Hidden
        </div>
      )}
      <div className="flex items-center gap-2 mb-3">
        <span className="text-xl">{meta.icon}</span>
        <span className={cn('text-[11px] font-bold tracking-[0.08em] uppercase', meta.tone)}>{meta.label}</span>
      </div>
      <div className="text-[15px] font-semibold leading-[1.3] mb-2 text-ink flex-1">{item.title}</div>
      {item.description && (
        <div className="text-[13px] text-subtle leading-normal mb-3 line-clamp-2">{item.description}</div>
      )}
      {isNote && item.noteContent && (
        <div className="text-[12.5px] text-muted leading-normal mb-3 line-clamp-2 italic">{item.noteContent}</div>
      )}
      {showUploader && item.uploaderName && (
        <div className="text-[11.5px] text-muted mb-3.5">by {item.uploaderName}</div>
      )}
      <div className="flex gap-2 mt-auto">
        <button
          onClick={isNote ? onRead : () => item.fileUrl && window.open(item.fileUrl, '_blank')}
          className="flex-1 h-[34px] bg-ink text-white rounded-lg text-[13px] font-semibold cursor-pointer"
        >{isNote ? 'Read' : 'Open'}</button>
        {canEdit && (
          <>
            <button onClick={onEdit} className={cn(squareBtn, 'text-ink')} title="Edit"><Pencil size={14} /></button>
            <button onClick={onDelete} className={cn(squareBtn, 'text-[#DC2626]')} title="Delete"><Trash2 size={14} /></button>
          </>
        )}
      </div>
    </div>
  );
}
