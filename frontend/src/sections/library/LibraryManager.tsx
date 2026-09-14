import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { deleteLibraryItem, getLibraryItems, type LibraryItem } from '@/api/library';
import { ConfirmModal, Spinner, pageClass, pillClass, surfaceClass } from '@/components/common';
import { cn } from '@/lib/utils';
import { AddLibraryItemModal } from './AddLibraryItemModal';
import { EditLibraryItemModal } from './EditLibraryItemModal';
import { LibraryItemCard } from './LibraryItemCard';
import { LIBRARY_FILTERS } from './libraryMeta';
import { NoteReadModal } from './NoteReadModal';

/**
 * The library as teachers and admins manage it: filter, add, edit, hide, delete.
 * The two role pages differ only in the copy and who may edit what, so they pass
 * that in and share everything else.
 */
export function LibraryManager({
  subtitle, emptyHint, hideLabel, noteExample, canEdit, showUploader,
}: {
  subtitle: string;
  emptyHint: string;
  hideLabel: string;
  noteExample: string;
  canEdit: (item: LibraryItem) => boolean;
  showUploader?: boolean;
}) {
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState('All');
  const [showCreate, setShowCreate] = useState(false);
  const [editItem, setEditItem] = useState<LibraryItem | null>(null);
  const [readNote, setReadNote] = useState<LibraryItem | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<LibraryItem | null>(null);

  const { data: items = [], isLoading } = useQuery({ queryKey: ['library'], queryFn: getLibraryItems });

  const deleteMutation = useMutation({
    mutationFn: () => deleteLibraryItem(deleteTarget!.id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['library'] }); setDeleteTarget(null); },
  });

  const shown = items.filter((i) => filter === 'All' || i.fileType.toLowerCase() === filter.toLowerCase());

  return (
    <div className={pageClass}>
      <div className="flex items-start justify-between gap-3 flex-wrap mb-6">
        <div>
          <h1 className="font-display font-semibold text-[32px] sm:text-[44px] m-0 tracking-[-0.02em]">Library</h1>
          <p className="text-[15px] text-subtle mt-1 mb-0">{subtitle}</p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 h-10 px-[18px] bg-accent-text text-white rounded-full text-sm font-semibold cursor-pointer"
        >
          <Plus size={16} /> Add Item
        </button>
      </div>

      <div className="flex gap-2 mb-6 flex-wrap">
        {LIBRARY_FILTERS.map((t) => (
          <button key={t} onClick={() => setFilter(t)} className={pillClass(filter === t, 'px-4 py-[7px] text-[13px]')}>{t}</button>
        ))}
      </div>

      {isLoading ? (
        <div className="flex justify-center p-12"><Spinner /></div>
      ) : shown.length === 0 ? (
        <div className={cn(surfaceClass, 'px-6 py-12 text-center')}>
          <div className="text-[32px] mb-3">📚</div>
          <div className="text-[15px] font-semibold mb-1.5">No items yet</div>
          <div className="text-[13.5px] text-subtle">{emptyHint}</div>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {shown.map((item) => (
            <LibraryItemCard
              key={item.id}
              item={item}
              canEdit={canEdit(item)}
              showUploader={showUploader}
              onEdit={() => setEditItem(item)}
              onDelete={() => setDeleteTarget(item)}
              onRead={() => setReadNote(item)}
            />
          ))}
        </div>
      )}

      <AddLibraryItemModal open={showCreate} onClose={() => setShowCreate(false)} noteExample={noteExample} />
      <EditLibraryItemModal item={editItem} onClose={() => setEditItem(null)} hideLabel={hideLabel} />
      {readNote && <NoteReadModal item={readNote} onClose={() => setReadNote(null)} />}

      <ConfirmModal
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => deleteMutation.mutate()}
        title="Delete item"
        message={`"${deleteTarget?.title}" will be permanently deleted.`}
        confirmLabel="Delete"
        confirmVariant="danger"
        loading={deleteMutation.isPending}
      />
    </div>
  );
}
