import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Pencil, Trash2, EyeOff } from 'lucide-react';
import { getLibraryItems, createLibraryItem, updateLibraryItem, deleteLibraryItem } from '../../api/library';
import type { LibraryItem, FileType } from '../../api/library';
import { Modal, ConfirmModal } from '../../components/ui/Modal';
import { Button } from '../../components/ui/Button';
import { Spinner } from '../../components/ui/Spinner';
import { getApiError } from '../../api/client';
import { useAuthStore } from '../../store/auth';

const CARD: React.CSSProperties = { background: '#fff', border: '1px solid #E7E4DE', borderRadius: 16, boxShadow: '0 1px 3px rgba(11,11,14,0.05)' };

const TYPE_META: Record<FileType, { color: string; label: string; icon: string }> = {
  audio:    { color: '#B8893E', label: 'Audio',    icon: '🎵' },
  video:    { color: '#2563A8', label: 'Video',    icon: '🎬' },
  image:    { color: '#2E7D5A', label: 'Image',    icon: '🖼️' },
  document: { color: '#E2562B', label: 'Document', icon: '📄' },
  other:    { color: '#8C8880', label: 'Other',    icon: '📎' },
};

const FILE_TYPES: FileType[] = ['audio', 'video', 'image', 'document', 'other'];
const ALL_FILTERS = ['All', 'Audio', 'Video', 'Image', 'Document', 'Other'];

const inputStyle: React.CSSProperties = {
  width: '100%', height: 40, padding: '0 12px', border: '1px solid #C8C4BC', borderRadius: 10,
  fontSize: 14, background: '#fff', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box',
};

function ItemCard({ item, canEdit, onEdit, onDelete }: { item: LibraryItem; canEdit: boolean; onEdit: () => void; onDelete: () => void }) {
  const meta = TYPE_META[item.fileType] ?? TYPE_META.other;
  return (
    <div style={{ ...CARD, padding: '20px', display: 'flex', flexDirection: 'column', position: 'relative', opacity: item.hidden ? 0.65 : 1 }}>
      {item.hidden && (
        <div style={{ position: 'absolute', top: 14, right: 14, display: 'flex', alignItems: 'center', gap: 4, background: 'rgba(11,11,14,0.07)', borderRadius: 8, padding: '3px 8px', fontSize: 11, fontWeight: 600, color: '#8C8880' }}>
          <EyeOff size={11} /> Hidden
        </div>
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <span style={{ fontSize: 20 }}>{meta.icon}</span>
        <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: meta.color }}>{meta.label}</span>
      </div>
      <div style={{ fontSize: 15, fontWeight: 600, lineHeight: 1.3, marginBottom: 8, color: '#0B0B0E', flex: 1 }}>{item.title}</div>
      {item.description && (
        <div style={{ fontSize: 13, color: 'rgba(11,11,14,0.55)', lineHeight: 1.5, marginBottom: 12, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as any }}>
          {item.description}
        </div>
      )}
      <div style={{ display: 'flex', gap: 8, marginTop: 'auto' }}>
        <button
          onClick={() => window.open(item.fileUrl, '_blank')}
          style={{ flex: 1, height: 34, background: '#0B0B0E', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}
        >Open</button>
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

export default function TeacherLibrary() {
  const { user } = useAuthStore();
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState('All');
  const [showCreate, setShowCreate] = useState(false);
  const [editItem, setEditItem] = useState<LibraryItem | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<LibraryItem | null>(null);
  const [formError, setFormError] = useState('');
  const [createForm, setCreateForm] = useState({ title: '', fileUrl: '', fileType: 'document' as FileType, description: '', mimeType: '', fileName: '' });
  const [editForm, setEditForm] = useState({ title: '', description: '', hidden: false });

  const { data: items = [], isLoading } = useQuery({ queryKey: ['library'], queryFn: getLibraryItems });

  const createMutation = useMutation({
    mutationFn: () => createLibraryItem({ title: createForm.title, fileUrl: createForm.fileUrl, fileType: createForm.fileType, description: createForm.description || undefined, mimeType: createForm.mimeType || undefined, fileName: createForm.fileName || undefined }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['library'] }); setShowCreate(false); setCreateForm({ title: '', fileUrl: '', fileType: 'document', description: '', mimeType: '', fileName: '' }); setFormError(''); },
    onError: (err) => setFormError(getApiError(err)),
  });

  const editMutation = useMutation({
    mutationFn: () => updateLibraryItem(editItem!.id, { title: editForm.title, description: editForm.description || null, hidden: editForm.hidden }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['library'] }); setEditItem(null); setFormError(''); },
    onError: (err) => setFormError(getApiError(err)),
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteLibraryItem(deleteTarget!.id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['library'] }); setDeleteTarget(null); },
  });

  const shown = items.filter((i) => filter === 'All' || i.fileType.toLowerCase() === filter.toLowerCase());

  return (
    <div className="screen-fade" style={{ padding: '36px 48px 64px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontFamily: "'Instrument Serif', serif", fontSize: 44, margin: 0, letterSpacing: '-0.02em' }}>Library</h1>
          <p style={{ fontSize: 15, color: 'rgba(11,11,14,0.55)', margin: '4px 0 0' }}>Guides, lessons and resources for your students.</p>
        </div>
        <button
          onClick={() => { setShowCreate(true); setFormError(''); }}
          style={{ display: 'flex', alignItems: 'center', gap: 8, height: 40, padding: '0 18px', background: '#E2562B', color: '#fff', border: 'none', borderRadius: 9999, fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}
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
          <div style={{ fontSize: 13.5, color: 'rgba(11,11,14,0.5)' }}>Add your first resource using the button above.</div>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
          {shown.map((item) => (
            <ItemCard
              key={item.id}
              item={item}
              canEdit={item.uploadedBy === user?.id}
              onEdit={() => { setEditItem(item); setEditForm({ title: item.title, description: item.description ?? '', hidden: item.hidden }); setFormError(''); }}
              onDelete={() => setDeleteTarget(item)}
            />
          ))}
        </div>
      )}

      <Modal isOpen={showCreate} onClose={() => setShowCreate(false)} title="Add Library Item" size="md"
        footer={<><Button variant="secondary" onClick={() => setShowCreate(false)}>Cancel</Button><Button variant="primary" onClick={() => createMutation.mutate()} loading={createMutation.isPending} disabled={!createForm.title || !createForm.fileUrl}>Add Item</Button></>}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {formError && <div style={{ background: 'rgba(220,38,38,0.08)', color: '#dc2626', padding: '9px 12px', borderRadius: 8, fontSize: 13 }}>{formError}</div>}
          <div><label style={{ display: 'block', fontSize: 12.5, fontWeight: 600, marginBottom: 5, color: 'rgba(11,11,14,0.65)' }}>Title *</label><input style={inputStyle} value={createForm.title} onChange={(e) => setCreateForm((p) => ({ ...p, title: e.target.value }))} placeholder="e.g. Math Formula Sheet" /></div>
          <div><label style={{ display: 'block', fontSize: 12.5, fontWeight: 600, marginBottom: 5, color: 'rgba(11,11,14,0.65)' }}>File URL *</label><input style={inputStyle} value={createForm.fileUrl} onChange={(e) => setCreateForm((p) => ({ ...p, fileUrl: e.target.value }))} placeholder="https://..." /></div>
          <div><label style={{ display: 'block', fontSize: 12.5, fontWeight: 600, marginBottom: 5, color: 'rgba(11,11,14,0.65)' }}>File Type *</label>
            <select style={{ ...inputStyle, height: 40 }} value={createForm.fileType} onChange={(e) => setCreateForm((p) => ({ ...p, fileType: e.target.value as FileType }))}>
              {FILE_TYPES.map((t) => <option key={t} value={t}>{TYPE_META[t].label}</option>)}
            </select>
          </div>
          <div><label style={{ display: 'block', fontSize: 12.5, fontWeight: 600, marginBottom: 5, color: 'rgba(11,11,14,0.65)' }}>Description</label><textarea style={{ ...inputStyle, height: 80, padding: '8px 12px', resize: 'vertical' }} value={createForm.description} onChange={(e) => setCreateForm((p) => ({ ...p, description: e.target.value }))} placeholder="Optional description..." /></div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div><label style={{ display: 'block', fontSize: 12.5, fontWeight: 600, marginBottom: 5, color: 'rgba(11,11,14,0.65)' }}>File Name</label><input style={inputStyle} value={createForm.fileName} onChange={(e) => setCreateForm((p) => ({ ...p, fileName: e.target.value }))} placeholder="Optional" /></div>
            <div><label style={{ display: 'block', fontSize: 12.5, fontWeight: 600, marginBottom: 5, color: 'rgba(11,11,14,0.65)' }}>MIME Type</label><input style={inputStyle} value={createForm.mimeType} onChange={(e) => setCreateForm((p) => ({ ...p, mimeType: e.target.value }))} placeholder="e.g. application/pdf" /></div>
          </div>
        </div>
      </Modal>

      <Modal isOpen={!!editItem} onClose={() => setEditItem(null)} title="Edit Item" size="sm"
        footer={<><Button variant="secondary" onClick={() => setEditItem(null)}>Cancel</Button><Button variant="primary" onClick={() => editMutation.mutate()} loading={editMutation.isPending} disabled={!editForm.title}>Save</Button></>}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {formError && <div style={{ background: 'rgba(220,38,38,0.08)', color: '#dc2626', padding: '9px 12px', borderRadius: 8, fontSize: 13 }}>{formError}</div>}
          <div><label style={{ display: 'block', fontSize: 12.5, fontWeight: 600, marginBottom: 5, color: 'rgba(11,11,14,0.65)' }}>Title</label><input style={inputStyle} value={editForm.title} onChange={(e) => setEditForm((p) => ({ ...p, title: e.target.value }))} /></div>
          <div><label style={{ display: 'block', fontSize: 12.5, fontWeight: 600, marginBottom: 5, color: 'rgba(11,11,14,0.65)' }}>Description</label><textarea style={{ ...inputStyle, height: 80, padding: '8px 12px', resize: 'vertical' }} value={editForm.description} onChange={(e) => setEditForm((p) => ({ ...p, description: e.target.value }))} /></div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13.5, cursor: 'pointer' }}>
            <input type="checkbox" checked={editForm.hidden} onChange={(e) => setEditForm((p) => ({ ...p, hidden: e.target.checked }))} style={{ width: 16, height: 16 }} />
            Hide from students
          </label>
        </div>
      </Modal>

      <ConfirmModal isOpen={!!deleteTarget} onClose={() => setDeleteTarget(null)} onConfirm={() => deleteMutation.mutate()} title="Delete item" message={`"${deleteTarget?.title}" will be permanently deleted.`} confirmLabel="Delete" confirmVariant="danger" loading={deleteMutation.isPending} />
    </div>
  );
}
