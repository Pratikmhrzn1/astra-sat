import { useState, useRef, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Pencil, Trash2, EyeOff, Upload, FileText } from 'lucide-react';
import { getLibraryItems, createLibraryItem, updateLibraryItem, deleteLibraryItem, uploadFile } from '@/api/library';
import type { LibraryItem, FileType } from '@/api/library';
import { Modal, ConfirmModal, Button, Spinner } from '@/components/common';
import { getApiError } from '@/api/http';
import { useAuthStore } from '@/store/auth';

const CARD: React.CSSProperties = { background: '#fff', border: '1px solid #E7E4DE', borderRadius: 16, boxShadow: '0 1px 3px rgba(11,11,14,0.05)' };

const TYPE_META: Record<FileType, { color: string; label: string; icon: string }> = {
  audio:    { color: '#B8893E', label: 'Audio',    icon: '🎵' },
  video:    { color: '#2563A8', label: 'Video',    icon: '🎬' },
  image:    { color: '#2E7D5A', label: 'Image',    icon: '🖼️' },
  document: { color: '#C4471F', label: 'Document', icon: '📄' },
  other:    { color: '#6F6B64', label: 'Other',    icon: '📎' },
  note:     { color: '#7C3AED', label: 'Note',     icon: '📝' },
};

const FILE_TYPES: Exclude<FileType, 'note'>[] = ['audio', 'video', 'image', 'document', 'other'];
const ALL_FILTERS = ['All', 'Audio', 'Video', 'Image', 'Document', 'Note', 'Other'];

const EXT_MAP: Record<string, Exclude<FileType, 'note'>> = {
  pdf: 'document', doc: 'document', docx: 'document', ppt: 'document', pptx: 'document',
  xls: 'document', xlsx: 'document', txt: 'document', csv: 'document', rtf: 'document',
  mp4: 'video', mov: 'video', avi: 'video', webm: 'video', mkv: 'video', flv: 'video',
  mp3: 'audio', wav: 'audio', ogg: 'audio', flac: 'audio', m4a: 'audio', aac: 'audio',
  png: 'image', jpg: 'image', jpeg: 'image', gif: 'image', webp: 'image', svg: 'image', bmp: 'image',
};

function inferFileType(filename: string): Exclude<FileType, 'note'> {
  const ext = filename.split('.').pop()?.toLowerCase() ?? '';
  return EXT_MAP[ext] ?? 'other';
}

const inputStyle: React.CSSProperties = {
  width: '100%', height: 40, padding: '0 12px', border: '1px solid #C8C4BC', borderRadius: 10,
  fontSize: 14, background: '#fff', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box',
};

function NoteReadModal({ item, onClose }: { item: LibraryItem; onClose: () => void }) {
  return (
    <Modal isOpen onClose={onClose} title={item.title} size="md">
      <div style={{ whiteSpace: 'pre-wrap', fontSize: 14, lineHeight: 1.75, color: '#0B0B0E', minHeight: 80 }}>
        {item.noteContent || <span style={{ color: 'rgba(11,11,14,0.58)' }}>No content.</span>}
      </div>
    </Modal>
  );
}

function ItemCard({ item, canEdit, onEdit, onDelete, onRead }: { item: LibraryItem; canEdit: boolean; onEdit: () => void; onDelete: () => void; onRead: () => void }) {
  const meta = TYPE_META[item.fileType] ?? TYPE_META.other;
  const isNote = item.fileType === 'note';
  return (
    <div style={{ ...CARD, padding: '20px', display: 'flex', flexDirection: 'column', position: 'relative', opacity: item.hidden ? 0.65 : 1 }}>
      {item.hidden && (
        <div style={{ position: 'absolute', top: 14, right: 14, display: 'flex', alignItems: 'center', gap: 4, background: 'rgba(11,11,14,0.07)', borderRadius: 8, padding: '3px 8px', fontSize: 11, fontWeight: 600, color: '#6F6B64' }}>
          <EyeOff size={11} /> Hidden
        </div>
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <span style={{ fontSize: 20 }}>{meta.icon}</span>
        <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: meta.color }}>{meta.label}</span>
      </div>
      <div style={{ fontSize: 15, fontWeight: 600, lineHeight: 1.3, marginBottom: 8, color: '#0B0B0E', flex: 1 }}>{item.title}</div>
      {item.description && (
        <div style={{ fontSize: 13, color: 'rgba(11,11,14,0.64)', lineHeight: 1.5, marginBottom: 12, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as any }}>
          {item.description}
        </div>
      )}
      {isNote && item.noteContent && (
        <div style={{ fontSize: 12.5, color: 'rgba(11,11,14,0.58)', lineHeight: 1.5, marginBottom: 12, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as any, fontStyle: 'italic' }}>
          {item.noteContent}
        </div>
      )}
      <div style={{ display: 'flex', gap: 8, marginTop: 'auto' }}>
        <button
          onClick={isNote ? onRead : () => item.fileUrl && window.open(item.fileUrl, '_blank')}
          style={{ flex: 1, height: 34, background: '#0B0B0E', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}
        >{isNote ? 'Read' : 'Open'}</button>
        {canEdit && (
          <>
            <button onClick={onEdit} style={{ width: 34, height: 34, border: '1px solid #E7E4DE', background: '#fff', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#0B0B0E' }} title="Edit"><Pencil size={14} /></button>
            <button onClick={onDelete} style={{ width: 34, height: 34, border: '1px solid #E7E4DE', background: '#fff', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#dc2626' }} title="Delete"><Trash2 size={14} /></button>
          </>
        )}
      </div>
    </div>
  );
}

type AddMode = 'file' | 'note';

interface FileState {
  url: string;
  fileName: string;
  fileType: Exclude<FileType, 'note'>;
}

export default function TeacherLibrary() {
  const { user } = useAuthStore();
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState('All');
  const [showCreate, setShowCreate] = useState(false);
  const [addMode, setAddMode] = useState<AddMode>('file');
  const [editItem, setEditItem] = useState<LibraryItem | null>(null);
  const [readNote, setReadNote] = useState<LibraryItem | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<LibraryItem | null>(null);
  const [formError, setFormError] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadedFile, setUploadedFile] = useState<FileState | null>(null);
  const [fileTitle, setFileTitle] = useState('');
  const [fileDesc, setFileDesc] = useState('');
  const [fileType, setFileType] = useState<Exclude<FileType, 'note'>>('document');
  const [noteTitle, setNoteTitle] = useState('');
  const [noteContent, setNoteContent] = useState('');
  const [noteDesc, setNoteDesc] = useState('');
  const [editForm, setEditForm] = useState({ title: '', description: '', noteContent: '', hidden: false });
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: items = [], isLoading } = useQuery({ queryKey: ['library'], queryFn: getLibraryItems });

  const resetCreate = () => {
    setAddMode('file');
    setUploadedFile(null);
    setFileTitle(''); setFileDesc(''); setFileType('document');
    setNoteTitle(''); setNoteContent(''); setNoteDesc('');
    setFormError('');
    setIsDragging(false);
  };

  const processFile = useCallback(async (file: File) => {
    setUploading(true);
    setFormError('');
    try {
      const result = await uploadFile(file);
      const inferredType = inferFileType(file.name);
      setUploadedFile({ url: result.url, fileName: result.fileName, fileType: inferredType });
      setFileType(inferredType);
      if (!fileTitle) setFileTitle(file.name.replace(/\.[^.]+$/, ''));
    } catch (err) {
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

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
  };

  const createMutation = useMutation({
    mutationFn: () => {
      if (addMode === 'note') {
        return createLibraryItem({ title: noteTitle, description: noteDesc || undefined, fileType: 'note', noteContent });
      }
      return createLibraryItem({ title: fileTitle, description: fileDesc || undefined, fileType, fileUrl: uploadedFile!.url, fileName: uploadedFile!.fileName });
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['library'] }); setShowCreate(false); resetCreate(); },
    onError: (err) => setFormError(getApiError(err)),
  });

  const editMutation = useMutation({
    mutationFn: () => updateLibraryItem(editItem!.id, { title: editForm.title, description: editForm.description || null, noteContent: editItem?.fileType === 'note' ? (editForm.noteContent || null) : undefined, hidden: editForm.hidden }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['library'] }); setEditItem(null); setFormError(''); },
    onError: (err) => setFormError(getApiError(err)),
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteLibraryItem(deleteTarget!.id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['library'] }); setDeleteTarget(null); },
  });

  const canSubmit = addMode === 'note' ? !!noteTitle && !!noteContent : !!fileTitle && !!uploadedFile;
  const shown = items.filter((i) => filter === 'All' || i.fileType.toLowerCase() === filter.toLowerCase());

  return (
    <div className="screen-fade" style={{ padding: '36px 48px 64px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 44, margin: 0, letterSpacing: '-0.02em' }}>Library</h1>
          <p style={{ fontSize: 15, color: 'rgba(11,11,14,0.64)', margin: '4px 0 0' }}>Guides, lessons and resources for your students.</p>
        </div>
        <button
          onClick={() => { setShowCreate(true); resetCreate(); }}
          style={{ display: 'flex', alignItems: 'center', gap: 8, height: 40, padding: '0 18px', background: '#C4471F', color: '#fff', border: 'none', borderRadius: 9999, fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}
        >
          <Plus size={16} /> Add Item
        </button>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 24, flexWrap: 'wrap' }}>
        {ALL_FILTERS.map((t) => (
          <button key={t} onClick={() => setFilter(t)}
            style={{ padding: '7px 16px', borderRadius: 9999, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', border: filter === t ? '1px solid #0B0B0E' : '1px solid #C8C4BC', background: filter === t ? '#0B0B0E' : '#fff', color: filter === t ? '#fff' : '#0B0B0E' }}
          >{t}</button>
        ))}
      </div>

      {isLoading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}><Spinner /></div>
      ) : shown.length === 0 ? (
        <div style={{ ...CARD, padding: '48px 24px', textAlign: 'center' }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>📚</div>
          <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 6 }}>No items yet</div>
          <div style={{ fontSize: 13.5, color: 'rgba(11,11,14,0.64)' }}>Add your first resource using the button above.</div>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
          {shown.map((item) => (
            <ItemCard
              key={item.id}
              item={item}
              canEdit={item.uploadedBy === user?.id}
              onEdit={() => { setEditItem(item); setEditForm({ title: item.title, description: item.description ?? '', noteContent: item.noteContent ?? '', hidden: item.hidden }); setFormError(''); }}
              onDelete={() => setDeleteTarget(item)}
              onRead={() => setReadNote(item)}
            />
          ))}
        </div>
      )}

      {/* Add Item Modal */}
      <Modal
        isOpen={showCreate}
        onClose={() => { setShowCreate(false); resetCreate(); }}
        title="Add Library Item"
        size="md"
        footer={
          <>
            <Button variant="secondary" onClick={() => { setShowCreate(false); resetCreate(); }}>Cancel</Button>
            <Button variant="primary" onClick={() => createMutation.mutate()} loading={createMutation.isPending} disabled={!canSubmit || uploading}>Add Item</Button>
          </>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {formError && <div style={{ background: 'rgba(220,38,38,0.08)', color: '#dc2626', padding: '9px 12px', borderRadius: 8, fontSize: 13 }}>{formError}</div>}

          {/* Mode switcher */}
          <div style={{ display: 'inline-flex', gap: 4, background: '#F0EDE7', borderRadius: 10, padding: 4 }}>
            {([['file', Upload, 'Upload File'], ['note', FileText, 'Write Note']] as const).map(([m, Icon, label]) => (
              <button
                key={m}
                onClick={() => { setAddMode(m); setFormError(''); }}
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 16px', borderRadius: 7, fontSize: 13, fontWeight: 600, cursor: 'pointer', border: 'none', fontFamily: 'inherit', transition: 'background 0.15s', background: addMode === m ? '#fff' : 'transparent', color: addMode === m ? '#0B0B0E' : 'rgba(11,11,14,0.58)', boxShadow: addMode === m ? '0 1px 4px rgba(11,11,14,0.1)' : 'none' }}
              ><Icon size={13} />{label}</button>
            ))}
          </div>

          {addMode === 'file' ? (
            <>
              {/* Drag-and-drop zone */}
              <div>
                <label style={{ display: 'block', fontSize: 12.5, fontWeight: 600, marginBottom: 6, color: 'rgba(11,11,14,0.65)' }}>File *</label>
                <input ref={fileInputRef} type="file" style={{ display: 'none' }} onChange={handleFileInput} />
                <div
                  onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={handleDrop}
                  onClick={() => !uploading && fileInputRef.current?.click()}
                  style={{
                    border: isDragging ? '2px dashed #E2562B' : uploadedFile ? '2px solid #0B0B0E' : '2px dashed #C8C4BC',
                    borderRadius: 12, padding: '24px 20px', textAlign: 'center', cursor: uploading ? 'default' : 'pointer',
                    background: isDragging ? 'rgba(226,86,43,0.04)' : uploadedFile ? 'rgba(11,11,14,0.02)' : '#FAFAF8',
                    transition: 'border-color 0.15s, background 0.15s',
                  }}
                >
                  {uploading ? (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                      <Spinner />
                      <div style={{ fontSize: 13, color: 'rgba(11,11,14,0.64)' }}>Uploading…</div>
                    </div>
                  ) : uploadedFile ? (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontSize: 28 }}>{TYPE_META[uploadedFile.fileType].icon}</span>
                      <div style={{ fontSize: 13.5, fontWeight: 600, color: '#0B0B0E' }}>{uploadedFile.fileName}</div>
                      <div style={{ fontSize: 12, color: 'rgba(11,11,14,0.58)' }}>Click to change file</div>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                      <Upload size={24} color="rgba(11,11,14,0.25)" />
                      <div style={{ fontSize: 13.5, fontWeight: 500, color: '#0B0B0E' }}>Drag & drop or click to upload</div>
                      <div style={{ fontSize: 12, color: 'rgba(11,11,14,0.58)' }}>Any file type · max 50 MB</div>
                    </div>
                  )}
                </div>
              </div>

              {/* File type (auto-set but editable) */}
              {uploadedFile && (
                <div>
                  <label style={{ display: 'block', fontSize: 12.5, fontWeight: 600, marginBottom: 5, color: 'rgba(11,11,14,0.65)' }}>
                    File Type <span style={{ fontWeight: 400, color: 'rgba(11,11,14,0.58)' }}>(auto-detected — correct if wrong)</span>
                  </label>
                  <select style={{ ...inputStyle, height: 40 }} value={fileType} onChange={(e) => setFileType(e.target.value as Exclude<FileType, 'note'>)}>
                    {FILE_TYPES.map((t) => <option key={t} value={t}>{TYPE_META[t].label}</option>)}
                  </select>
                </div>
              )}

              <div>
                <label style={{ display: 'block', fontSize: 12.5, fontWeight: 600, marginBottom: 5, color: 'rgba(11,11,14,0.65)' }}>Title *</label>
                <input style={inputStyle} value={fileTitle} onChange={(e) => setFileTitle(e.target.value)} placeholder="e.g. Math Formula Sheet" />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12.5, fontWeight: 600, marginBottom: 5, color: 'rgba(11,11,14,0.65)' }}>Description</label>
                <textarea style={{ ...inputStyle, height: 72, padding: '8px 12px', resize: 'vertical' }} value={fileDesc} onChange={(e) => setFileDesc(e.target.value)} placeholder="Optional description…" />
              </div>
            </>
          ) : (
            <>
              <div>
                <label style={{ display: 'block', fontSize: 12.5, fontWeight: 600, marginBottom: 5, color: 'rgba(11,11,14,0.65)' }}>Title *</label>
                <input style={inputStyle} value={noteTitle} onChange={(e) => setNoteTitle(e.target.value)} placeholder="e.g. Useful YouTube Videos" />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12.5, fontWeight: 600, marginBottom: 5, color: 'rgba(11,11,14,0.65)' }}>Content *</label>
                <textarea
                  style={{ ...inputStyle, height: 180, padding: '10px 12px', resize: 'vertical', lineHeight: 1.6 }}
                  value={noteContent}
                  onChange={(e) => setNoteContent(e.target.value)}
                  placeholder={"Write anything here — links, notes, instructions…\n\nExample:\nCheck out this Khan Academy video on linear equations:\nhttps://www.youtube.com/watch?v=..."}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12.5, fontWeight: 600, marginBottom: 5, color: 'rgba(11,11,14,0.65)' }}>Description</label>
                <input style={inputStyle} value={noteDesc} onChange={(e) => setNoteDesc(e.target.value)} placeholder="Optional short description shown on the card…" />
              </div>
            </>
          )}
        </div>
      </Modal>

      {/* Edit Modal */}
      <Modal isOpen={!!editItem} onClose={() => setEditItem(null)} title="Edit Item" size="sm"
        footer={<><Button variant="secondary" onClick={() => setEditItem(null)}>Cancel</Button><Button variant="primary" onClick={() => editMutation.mutate()} loading={editMutation.isPending} disabled={!editForm.title}>Save</Button></>}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {formError && <div style={{ background: 'rgba(220,38,38,0.08)', color: '#dc2626', padding: '9px 12px', borderRadius: 8, fontSize: 13 }}>{formError}</div>}
          <div><label style={{ display: 'block', fontSize: 12.5, fontWeight: 600, marginBottom: 5, color: 'rgba(11,11,14,0.65)' }}>Title</label><input style={inputStyle} value={editForm.title} onChange={(e) => setEditForm((p) => ({ ...p, title: e.target.value }))} /></div>
          <div><label style={{ display: 'block', fontSize: 12.5, fontWeight: 600, marginBottom: 5, color: 'rgba(11,11,14,0.65)' }}>Description</label><textarea style={{ ...inputStyle, height: 72, padding: '8px 12px', resize: 'vertical' }} value={editForm.description} onChange={(e) => setEditForm((p) => ({ ...p, description: e.target.value }))} /></div>
          {editItem?.fileType === 'note' && (
            <div><label style={{ display: 'block', fontSize: 12.5, fontWeight: 600, marginBottom: 5, color: 'rgba(11,11,14,0.65)' }}>Content</label><textarea style={{ ...inputStyle, height: 140, padding: '10px 12px', resize: 'vertical', lineHeight: 1.6 }} value={editForm.noteContent} onChange={(e) => setEditForm((p) => ({ ...p, noteContent: e.target.value }))} /></div>
          )}
          <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13.5, cursor: 'pointer' }}>
            <input type="checkbox" checked={editForm.hidden} onChange={(e) => setEditForm((p) => ({ ...p, hidden: e.target.checked }))} style={{ width: 16, height: 16 }} />
            Hide from students
          </label>
        </div>
      </Modal>

      {readNote && <NoteReadModal item={readNote} onClose={() => setReadNote(null)} />}

      <ConfirmModal isOpen={!!deleteTarget} onClose={() => setDeleteTarget(null)} onConfirm={() => deleteMutation.mutate()} title="Delete item" message={`"${deleteTarget?.title}" will be permanently deleted.`} confirmLabel="Delete" confirmVariant="danger" loading={deleteMutation.isPending} />
    </div>
  );
}
