import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Search, Pencil, Trash2 } from 'lucide-react';
import { getUsers, updateUser, deleteUser, assignStudentsToTeacher } from '@/features/admin/api/admin.api';
import { useAuthStore } from '@/shared/store/auth';
import { Button, Input, Modal, ConfirmModal, RoleBadge, Spinner } from '@/shared/ui';
import { formatDate } from '@/shared/lib/utils';
import { getApiError } from '@/shared/api/client';
import type { AdminUser } from '@/features/admin/api/admin.api';

type RoleFilter = 'all' | 'student' | 'teacher' | 'admin';

const CARD: React.CSSProperties = { background: '#fff', border: '1px solid #E7E4DE', borderRadius: 16, boxShadow: '0 1px 3px rgba(11,11,14,0.05)' };

export default function Users() {
  const { user: me } = useAuthStore();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<RoleFilter>('all');
  const [editUser, setEditUser] = useState<AdminUser | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AdminUser | null>(null);
  const [editForm, setEditForm] = useState({ name: '', password: '', teacherId: '' });
  const [editError, setEditError] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkTeacherId, setBulkTeacherId] = useState('');
  const [bulkResult, setBulkResult] = useState('');

  const { data: users = [], isLoading } = useQuery({ queryKey: ['admin', 'users'], queryFn: getUsers });
  const { data: allUsers = [] } = useQuery({ queryKey: ['admin', 'users'], queryFn: getUsers });
  const teachers = allUsers.filter((u) => u.role === 'teacher');

  const updateMutation = useMutation({
    mutationFn: () => {
      const payload: { name?: string; password?: string; teacherId?: string | null } = {};
      if (editForm.name && editForm.name !== editUser?.name) payload.name = editForm.name;
      if (editForm.password) payload.password = editForm.password;
      if (editUser?.role === 'student') payload.teacherId = editForm.teacherId || null;
      return updateUser(editUser!.id, payload);
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['admin', 'users'] }); setEditUser(null); },
    onError: (err) => setEditError(getApiError(err)),
  });

  const assignMutation = useMutation({
    mutationFn: () =>
      assignStudentsToTeacher({ studentIds: [...selected], teacherId: bulkTeacherId || null }),
    onSuccess: ({ assigned }) => {
      const target = teachers.find((t) => t.id === bulkTeacherId);
      setBulkResult(
        target
          ? `Assigned ${assigned} student${assigned === 1 ? '' : 's'} to ${target.name}.`
          : `Cleared the teacher for ${assigned} student${assigned === 1 ? '' : 's'}.`,
      );
      setSelected(new Set());
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
    },
    onError: (err) => { setBulkResult(''); setEditError(getApiError(err)); },
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteUser(deleteTarget!.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'stats'] });
      setDeleteTarget(null);
    },
    onError: (err) => setEditError(getApiError(err)),
  });

  const filtered = users.filter((u) => {
    const matchesRole = roleFilter === 'all' || u.role === roleFilter;
    const matchesSearch = !search || u.name.toLowerCase().includes(search.toLowerCase()) || u.email.toLowerCase().includes(search.toLowerCase());
    return matchesRole && matchesSearch;
  });

  const unassignedCount = users.filter((u) => u.role === 'student' && !u.teacherId).length;

  // Only students can carry a teacher, so only they are selectable.
  const selectableIds = filtered.filter((u) => u.role === 'student').map((u) => u.id);
  const allSelected = selectableIds.length > 0 && selectableIds.every((id) => selected.has(id));

  const toggleOne = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });

  const toggleAll = () =>
    setSelected(allSelected ? new Set() : new Set(selectableIds));

  const openEdit = (u: AdminUser) => { setEditUser(u); setEditForm({ name: u.name, password: '', teacherId: u.teacherId ?? '' }); setEditError(''); };

  return (
    <div className="screen-fade" style={{ padding: '36px 48px 64px' }}>
      <h1 style={{ fontFamily: "'Instrument Serif', serif", fontSize: 44, margin: '0 0 24px', letterSpacing: '-0.02em', color: '#0B0B0E' }}>User Management</h1>

      <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: 200 }}>
          <Search style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', width: 16, height: 16, color: 'rgba(11,11,14,0.35)', pointerEvents: 'none' }} />
          <input
            type="text"
            placeholder="Search users…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ width: '100%', paddingLeft: 36, paddingRight: 14, height: 38, border: '1px solid #E7E4DE', borderRadius: 10, background: '#fff', color: '#0B0B0E', fontSize: 14, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }}
          />
        </div>
        <div style={{ display: 'flex', gap: 7 }}>
          {(['all', 'student', 'teacher', 'admin'] as RoleFilter[]).map((r) => (
            <button
              key={r}
              onClick={() => setRoleFilter(r)}
              style={{ padding: '7px 14px', borderRadius: 9999, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', border: roleFilter === r ? '1px solid #0B0B0E' : '1px solid #C8C4BC', background: roleFilter === r ? '#0B0B0E' : '#fff', color: roleFilter === r ? '#fff' : '#0B0B0E' }}
            >
              {r === 'all' ? 'All' : r.charAt(0).toUpperCase() + r.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Unassigned-students nudge. A teacher's roster, results and feedback all
          filter on this, so an unassigned cohort means an empty teacher portal. */}
      {unassignedCount > 0 && selected.size === 0 && (
        <div style={{ background: 'rgba(184,137,62,0.08)', border: '1px solid rgba(184,137,62,0.25)', borderRadius: 12, padding: '12px 18px', marginBottom: 16, fontSize: 13.5, color: '#8A6020', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <span>
            <strong>{unassignedCount}</strong> student{unassignedCount === 1 ? ' has' : 's have'} no teacher assigned, so {unassignedCount === 1 ? 'they are' : 'they are'} invisible on every teacher's dashboard.
          </span>
          <button
            onClick={() => setSelected(new Set(users.filter((u) => u.role === 'student' && !u.teacherId).map((u) => u.id)))}
            style={{ marginLeft: 'auto', height: 30, padding: '0 14px', border: '1px solid rgba(184,137,62,0.4)', borderRadius: 9999, background: '#fff', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', color: '#8A6020' }}
          >Select them</button>
        </div>
      )}

      {bulkResult && (
        <div style={{ background: 'rgba(46,125,90,0.07)', border: '1px solid rgba(46,125,90,0.22)', borderRadius: 12, padding: '10px 18px', marginBottom: 16, fontSize: 13.5, color: '#1A6B3C' }}>
          {bulkResult}
        </div>
      )}

      {/* Bulk assign bar */}
      {selected.size > 0 && (
        <div style={{ ...CARD, padding: '14px 18px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 13.5, fontWeight: 600 }}>{selected.size} student{selected.size === 1 ? '' : 's'} selected</span>
          <select
            value={bulkTeacherId}
            onChange={(e) => setBulkTeacherId(e.target.value)}
            style={{ height: 38, padding: '0 12px', border: '1px solid #C8C4BC', borderRadius: 10, background: '#fff', fontSize: 13.5, fontFamily: 'inherit', cursor: 'pointer', minWidth: 220 }}
          >
            <option value="">Remove teacher assignment</option>
            {teachers.map((t) => <option key={t.id} value={t.id}>{t.name} ({t.email})</option>)}
          </select>
          <Button onClick={() => { setEditError(''); setBulkResult(''); assignMutation.mutate(); }} loading={assignMutation.isPending}>
            Assign
          </Button>
          <button
            onClick={() => setSelected(new Set())}
            style={{ height: 38, padding: '0 14px', border: '1px solid #E7E4DE', borderRadius: 9999, background: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', color: 'rgba(11,11,14,0.55)' }}
          >Clear</button>
          {teachers.length === 0 && (
            <span style={{ fontSize: 12.5, color: '#C0392B' }}>No teacher accounts exist yet — create one first.</span>
          )}
        </div>
      )}

      {editError && !editUser && (
        <div style={{ background: 'rgba(192,57,43,0.06)', border: '1px solid rgba(192,57,43,0.2)', borderRadius: 12, padding: '10px 18px', marginBottom: 16, fontSize: 13.5, color: '#C0392B' }}>
          {editError}
        </div>
      )}

      {isLoading ? (
        <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 64 }}><Spinner className="w-8 h-8 text-[#E2562B]" /></div>
      ) : (
        <div style={{ ...CARD, overflow: 'hidden' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '28px 1.8fr 1fr 1fr 1fr', gap: 12, padding: '12px 22px', borderBottom: '1px solid #EEEBE5', alignItems: 'center' }}>
            <input
              type="checkbox"
              checked={allSelected}
              disabled={selectableIds.length === 0}
              onChange={toggleAll}
              title="Select all students shown"
              style={{ width: 15, height: 15, cursor: selectableIds.length ? 'pointer' : 'default' }}
            />
            {['User', 'Role', 'Joined', 'Actions'].map((c, i) => (
              <span key={c} style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'rgba(11,11,14,0.4)', textAlign: i === 3 ? 'right' : 'left' }}>{c}</span>
            ))}
          </div>
          {filtered.length === 0 ? (
            <div style={{ padding: '48px 22px', textAlign: 'center', color: 'rgba(11,11,14,0.4)', fontSize: 14 }}>No users found</div>
          ) : (
            filtered.map((u, i) => (
              <div key={u.id} style={{ display: 'grid', gridTemplateColumns: '28px 1.8fr 1fr 1fr 1fr', gap: 12, padding: '14px 22px', borderBottom: i < filtered.length - 1 ? '1px solid #F2F0EC' : 'none', alignItems: 'center', background: selected.has(u.id) ? 'rgba(226,86,43,0.04)' : undefined }}>
                {u.role === 'student' ? (
                  <input
                    type="checkbox"
                    checked={selected.has(u.id)}
                    onChange={() => toggleOne(u.id)}
                    style={{ width: 15, height: 15, cursor: 'pointer' }}
                  />
                ) : <span />}
                <div>
                  <div style={{ fontSize: 14.5, fontWeight: 600, color: '#0B0B0E' }}>{u.name}</div>
                  <div style={{ fontSize: 12, color: 'rgba(11,11,14,0.45)' }}>
                    {u.email}
                    {u.role === 'student' && (
                      <span style={{ marginLeft: 8, color: u.teacherId ? 'rgba(11,11,14,0.45)' : '#C47A1B' }}>
                        {u.teacherId
                          ? `· ${teachers.find((t) => t.id === u.teacherId)?.name ?? 'teacher'}`
                          : '· no teacher'}
                      </span>
                    )}
                  </div>
                </div>
                <div><RoleBadge role={u.role} /></div>
                <div style={{ fontSize: 13.5, color: 'rgba(11,11,14,0.55)' }}>{formatDate(u.createdAt)}</div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 4 }}>
                  <button onClick={() => openEdit(u)} style={{ padding: 7, borderRadius: 8, border: 'none', background: 'transparent', cursor: 'pointer', color: 'rgba(11,11,14,0.4)' }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(37,99,168,0.08)'; e.currentTarget.style.color = '#2563A8'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'rgba(11,11,14,0.4)'; }}
                  ><Pencil size={15} /></button>
                  {u.id !== me?.id && (
                    <button onClick={() => setDeleteTarget(u)} style={{ padding: 7, borderRadius: 8, border: 'none', background: 'transparent', cursor: 'pointer', color: 'rgba(11,11,14,0.4)' }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(192,57,43,0.08)'; e.currentTarget.style.color = '#C0392B'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'rgba(11,11,14,0.4)'; }}
                    ><Trash2 size={15} /></button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      <Modal isOpen={!!editUser} onClose={() => setEditUser(null)} title={`Edit ${editUser?.name}`}
        footer={<><Button variant="secondary" onClick={() => setEditUser(null)}>Cancel</Button><Button onClick={() => updateMutation.mutate()} loading={updateMutation.isPending}>Save Changes</Button></>}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Input label="Name" value={editForm.name} onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))} />
          <Input label="New Password (leave blank to keep unchanged)" type="password" value={editForm.password} onChange={(e) => setEditForm((f) => ({ ...f, password: e.target.value }))} placeholder="Min 8 characters" />
          {editUser?.role === 'student' && (
            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'rgba(11,11,14,0.65)', marginBottom: 6 }}>Assigned Teacher</label>
              <select
                value={editForm.teacherId}
                onChange={(e) => setEditForm((f) => ({ ...f, teacherId: e.target.value }))}
                style={{ width: '100%', height: 40, padding: '0 12px', border: '1px solid #E7E4DE', borderRadius: 10, background: '#fff', color: '#0B0B0E', fontSize: 14, fontFamily: 'inherit', outline: 'none' }}
              >
                <option value="">No teacher assigned</option>
                {teachers.map((t) => <option key={t.id} value={t.id}>{t.name} ({t.email})</option>)}
              </select>
            </div>
          )}
          {editError && <p style={{ color: '#C0392B', fontSize: 13 }}>{editError}</p>}
        </div>
      </Modal>

      <ConfirmModal
        isOpen={!!deleteTarget} onClose={() => setDeleteTarget(null)} onConfirm={() => deleteMutation.mutate()}
        loading={deleteMutation.isPending} title="Delete User?"
        message={`Are you sure you want to delete ${deleteTarget?.name}? This will also delete all their exams, results, and feedback.`}
        confirmLabel="Delete User"
      />
    </div>
  );
}
