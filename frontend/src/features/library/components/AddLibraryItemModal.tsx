import { useCallback, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { FileText, Upload } from 'lucide-react';
import { addResourceItem, uploadAsset } from '@/features/library/api';
import { fetchApiError } from '@/shared/api/http';
import { Control, Dialog, Loader } from '@/shared/ui';
import { classes } from '@/shared/lib/utils';
import {
  ASSET_KINDS, ASSET_META, inferAssetKind, resourceErrorStyle, libraryFieldClass, libraryCaptionClass,
  resourceTextareaStyle, type UploadableKind,
} from './libraryMeta';

type AddMode = 'file' | 'note';
interface FileState { url: string; fileName: string; fileType: UploadableKind }

/** Upload a file or write a note. Owns its own form state, so closing resets it. */
export function AddResourceItemModal({ open, onClose, noteExample }: {
  open: boolean;
  onClose: () => void;
  /** The example line in the note placeholder. */
  noteExample: string;
}) {
  const queryClient = useQueryClient();
  const [addMode, setAddMode] = useState<AddMode>('file');
  const [formError, setFormError] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadedFile, setUploadedFile] = useState<FileState | null>(null);
  const [fileTitle, setFileTitle] = useState('');
  const [fileDesc, setFileDesc] = useState('');
  const [fileType, setFileType] = useState<UploadableKind>('document');
  const [noteTitle, setNoteTitle] = useState('');
  const [noteContent, setNoteContent] = useState('');
  const [noteDesc, setNoteDesc] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const reset = () => {
    setAddMode('file');
    setUploadedFile(null);
    setFileTitle(''); setFileDesc(''); setFileType('document');
    setNoteTitle(''); setNoteContent(''); setNoteDesc('');
    setFormError('');
    setIsDragging(false);
  };
  const close = () => { onClose(); reset(); };

  const processFile = useCallback(async (file: File) => {
    setUploading(true);
    setFormError('');
    try {
      const result = await uploadAsset(file);
      const inferredType = inferAssetKind(file.name);
      setUploadedFile({ url: result.url, fileName: result.fileName, fileType: inferredType });
      setFileType(inferredType);
      if (!fileTitle) setFileTitle(file.name.replace(/\.[^.]+$/, ''));
    } catch {
      setFormError('Upload failed. Please try again.');
    } finally {
      setUploading(false);
    }
  }, [fileTitle]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) processFile(file);
  }, [processFile]);

  const createMutation = useMutation({
    mutationFn: () => addMode === 'note'
      ? addResourceItem({ title: noteTitle, description: noteDesc || undefined, fileType: 'note', noteContent })
      : addResourceItem({ title: fileTitle, description: fileDesc || undefined, fileType, fileUrl: uploadedFile!.url, fileName: uploadedFile!.fileName }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['library'] }); close(); },
    onError: (err) => setFormError(fetchApiError(err)),
  });

  const canSubmit = addMode === 'note' ? !!noteTitle && !!noteContent : !!fileTitle && !!uploadedFile;

  return (
    <Dialog
      isOpen={open}
      onClose={close}
      title="Add Library Item"
      size="md"
      footer={
        <>
          <Control variant="secondary" onClick={close}>Cancel</Control>
          <Control variant="primary" onClick={() => createMutation.mutate()} loading={createMutation.isPending} disabled={!canSubmit || uploading}>Add Item</Control>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {formError && <div className={resourceErrorStyle}>{formError}</div>}

        {/* Mode switcher */}
        <div className="inline-flex self-start gap-1 bg-sunken-2 rounded-[10px] p-1">
          {([['file', Upload, 'Upload File'], ['note', FileText, 'Write Note']] as const).map(([m, Icon, label]) => (
            <button
              key={m}
              onClick={() => { setAddMode(m); setFormError(''); }}
              className={classes(
                'flex items-center gap-1.5 px-4 py-[7px] rounded-[7px] text-[13px] font-semibold cursor-pointer transition-colors duration-150',
                addMode === m ? 'bg-white text-ink shadow-[0_1px_4px_rgba(11,11,14,0.1)]' : 'bg-transparent text-muted',
              )}
            ><Icon size={13} />{label}</button>
          ))}
        </div>

        {addMode === 'file' ? (
          <>
            {/* Drag-and-drop zone */}
            <div>
              <label className={classes(libraryCaptionClass, 'mb-1.5')}>File *</label>
              <input ref={fileInputRef} type="file" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) processFile(f); }} />
              <div
                onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={handleDrop}
                onClick={() => !uploading && fileInputRef.current?.click()}
                className={classes(
                  'border-2 rounded-xl px-5 py-6 text-center transition-[border-color,background-color] duration-150',
                  uploading ? 'cursor-default' : 'cursor-pointer',
                  isDragging ? 'border-dashed border-ember bg-ember/[.04]'
                    : uploadedFile ? 'border-solid border-ink bg-ink/[.02]'
                      : 'border-dashed border-field bg-[#FAFAF8]',
                )}
              >
                {uploading ? (
                  <div className="flex flex-col items-center gap-2">
                    <Loader />
                    <div className="text-[13px] text-subtle">Uploading…</div>
                  </div>
                ) : uploadedFile ? (
                  <div className="flex flex-col items-center gap-1.5">
                    <span className="text-[28px]">{ASSET_META[uploadedFile.fileType].icon}</span>
                    <div className="text-[13.5px] font-semibold text-ink">{uploadedFile.fileName}</div>
                    <div className="text-xs text-muted">Click to change file</div>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-2">
                    <Upload size={24} className="text-ink/25" />
                    <div className="text-[13.5px] font-medium text-ink">Drag & drop or click to upload</div>
                    <div className="text-xs text-muted">Any file type · max 50 MB</div>
                  </div>
                )}
              </div>
            </div>

            {/* File type (auto-set but editable) */}
            {uploadedFile && (
              <div>
                <label className={libraryCaptionClass}>
                  File Type <span className="font-normal text-muted">(auto-detected — correct if wrong)</span>
                </label>
                <select className={libraryFieldClass} value={fileType} onChange={(e) => setFileType(e.target.value as UploadableKind)}>
                  {ASSET_KINDS.map((t) => <option key={t} value={t}>{ASSET_META[t].label}</option>)}
                </select>
              </div>
            )}

            <div>
              <label className={libraryCaptionClass}>Title *</label>
              <input className={libraryFieldClass} value={fileTitle} onChange={(e) => setFileTitle(e.target.value)} placeholder="e.g. Math Formula Sheet" />
            </div>
            <div>
              <label className={libraryCaptionClass}>Description</label>
              <textarea className={classes(resourceTextareaStyle, 'h-[72px] py-2')} value={fileDesc} onChange={(e) => setFileDesc(e.target.value)} placeholder="Optional description…" />
            </div>
          </>
        ) : (
          <>
            <div>
              <label className={libraryCaptionClass}>Title *</label>
              <input className={libraryFieldClass} value={noteTitle} onChange={(e) => setNoteTitle(e.target.value)} placeholder="e.g. Useful YouTube Videos" />
            </div>
            <div>
              <label className={libraryCaptionClass}>Content *</label>
              <textarea
                className={classes(resourceTextareaStyle, 'h-[180px] py-2.5 leading-[1.6]')}
                value={noteContent}
                onChange={(e) => setNoteContent(e.target.value)}
                placeholder={`Write anything here — links, notes, instructions…\n\nExample:\n${noteExample}\nhttps://www.youtube.com/watch?v=...`}
              />
            </div>
            <div>
              <label className={libraryCaptionClass}>Description</label>
              <input className={libraryFieldClass} value={noteDesc} onChange={(e) => setNoteDesc(e.target.value)} placeholder="Optional short description shown on the card…" />
            </div>
          </>
        )}
      </div>
    </Dialog>
  );
}
