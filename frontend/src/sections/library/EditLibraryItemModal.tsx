import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { updateLibraryItem, type LibraryItem } from '@/api/library';
import { getApiError } from '@/api/http';
import { Button, Modal } from '@/components/common';
import { cn } from '@/lib/utils';
import { libraryErrorClass, libraryInputClass, libraryLabelClass, libraryTextareaClass } from './libraryMeta';

export function EditLibraryItemModal({ item, onClose, hideLabel }: {
  item: LibraryItem | null;
  onClose: () => void;
  /** Who "hidden" hides the item from, in this role's words. */
  hideLabel: string;
}) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({ title: '', description: '', noteContent: '', hidden: false });
  const [formError, setFormError] = useState('');

  useEffect(() => {
    if (!item) return;
    setForm({ title: item.title, description: item.description ?? '', noteContent: item.noteContent ?? '', hidden: item.hidden });
    setFormError('');
  }, [item]);

  const editMutation = useMutation({
    mutationFn: () => updateLibraryItem(item!.id, {
      title: form.title,
      description: form.description || null,
      noteContent: item?.fileType === 'note' ? (form.noteContent || null) : undefined,
      hidden: form.hidden,
    }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['library'] }); onClose(); setFormError(''); },
    onError: (err) => setFormError(getApiError(err)),
  });

  return (
    <Modal
      isOpen={!!item}
      onClose={onClose}
      title="Edit Item"
      size="sm"
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button variant="primary" onClick={() => editMutation.mutate()} loading={editMutation.isPending} disabled={!form.title}>Save</Button></>}
    >
      <div className="flex flex-col gap-3.5">
        {formError && <div className={libraryErrorClass}>{formError}</div>}
        <div>
          <label className={libraryLabelClass}>Title</label>
          <input className={libraryInputClass} value={form.title} onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))} />
        </div>
        <div>
          <label className={libraryLabelClass}>Description</label>
          <textarea className={cn(libraryTextareaClass, 'h-[72px] py-2')} value={form.description} onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))} />
        </div>
        {item?.fileType === 'note' && (
          <div>
            <label className={libraryLabelClass}>Content</label>
            <textarea className={cn(libraryTextareaClass, 'h-[140px] py-2.5 leading-[1.6]')} value={form.noteContent} onChange={(e) => setForm((p) => ({ ...p, noteContent: e.target.value }))} />
          </div>
        )}
        <label className="flex items-center gap-2.5 text-[13.5px] cursor-pointer">
          <input type="checkbox" checked={form.hidden} onChange={(e) => setForm((p) => ({ ...p, hidden: e.target.checked }))} className="w-4 h-4" />
          {hideLabel}
        </label>
      </div>
    </Modal>
  );
}
