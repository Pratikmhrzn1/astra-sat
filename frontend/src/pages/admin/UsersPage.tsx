import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Search, Pencil, Trash2 } from 'lucide-react';
import { getUsers, updateUser, deleteUser, assignStudentsToTeacher } from '@/api/admin';
import { useAuthStore } from '@/store/auth';
import {
  Button, Input, Modal, ConfirmModal, RoleBadge, InlineLoader, ErrorBanner,
  iconButtonClass, pageClass, pillClass, surfaceClass, tableHeadClass,
} from '@/components/common';
import { cn, formatDate } from '@/lib/utils';
import { getApiError } from '@/api/http';
import type { AdminUser } from '@/api/admin';

type RoleFilter = 'all' | 'student' | 'teacher' | 'admin';

const COLS = 'grid grid-cols-[28px_1.8fr_1fr_1fr_1fr] gap-3 px-[22px] items-center';

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
    <div className={pageClass}>
      <h1 className="font-display font-semibold text-[32px] sm:text-[44px] mt-0 mb-6 tracking-[-0.02em] text-ink">User Management</h1>

      <div className="flex gap-3 mb-5 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted pointer-events-none" />
          <input
            type="text"
            placeholder="Search users…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3.5 h-[38px] border border-border rounded-[10px] bg-white text-ink text-sm outline-none"
          />
        </div>
        <div className="flex gap-[7px] flex-wrap">
          {(['all', 'student', 'teacher', 'admin'] as RoleFilter[]).map((r) => (
            <button key={r} onClick={() => setRoleFilter(r)} className={pillClass(roleFilter === r, 'px-3.5 py-[7px] text-[13px]')}>
              {r === 'all' ? 'All' : r.charAt(0).toUpperCase() + r.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Unassigned-students nudge. A teacher's roster, results and feedback all
          filter on this, so an unassigned cohort means an empty teacher portal. */}
      {unassignedCount > 0 && selected.size === 0 && (
        <div className="bg-gold/[.08] border border-gold/25 rounded-xl px-[18px] py-3 mb-4 text-[13.5px] text-gold-dark flex items-center gap-3 flex-wrap">
          <span>
            <strong>{unassignedCount}</strong> student{unassignedCount === 1 ? ' has' : 's have'} no teacher assigned, so {unassignedCount === 1 ? 'they are' : 'they are'} invisible on every teacher's dashboard.
          </span>
          <button
            onClick={() => setSelected(new Set(users.filter((u) => u.role === 'student' && !u.teacherId).map((u) => u.id)))}
            className="ml-auto h-[30px] px-3.5 border border-gold/40 rounded-full bg-white text-[12.5px] font-semibold cursor-pointer text-gold-dark"
          >Select them</button>
        </div>
      )}

      {bulkResult && (
        <div className="bg-green-sat/[.07] border border-green-sat/[.22] rounded-xl px-[18px] py-2.5 mb-4 text-[13.5px] text-green-dark">
          {bulkResult}
        </div>
      )}

      {/* Bulk assign bar */}
      {selected.size > 0 && (
        <div className={cn(surfaceClass, 'px-[18px] py-3.5 mb-4 flex items-center gap-3 flex-wrap')}>
          <span className="text-[13.5px] font-semibold">{selected.size} student{selected.size === 1 ? '' : 's'} selected</span>
          <select
            value={bulkTeacherId}
            onChange={(e) => setBulkTeacherId(e.target.value)}
            className="h-[38px] px-3 border border-field rounded-[10px] bg-white text-[13.5px] cursor-pointer min-w-[220px]"
          >
            <option value="">Remove teacher assignment</option>
            {teachers.map((t) => <option key={t.id} value={t.id}>{t.name} ({t.email})</option>)}
          </select>
          <Button onClick={() => { setEditError(''); setBulkResult(''); assignMutation.mutate(); }} loading={assignMutation.isPending}>
            Assign
          </Button>
          <button
            onClick={() => setSelected(new Set())}
            className="h-[38px] px-3.5 border border-border rounded-full bg-white text-[13px] font-semibold cursor-pointer text-subtle"
          >Clear</button>
          {teachers.length === 0 && (
            <span className="text-[12.5px] text-danger">No teacher accounts exist yet — create one first.</span>
          )}
        </div>
      )}

      {editError && !editUser && <ErrorBanner>{editError}</ErrorBanner>}

      {isLoading ? (
        <InlineLoader />
      ) : (
        <div className={cn(surfaceClass, 'overflow-x-auto')}>
          <div className="min-w-[680px]">
            <div className={cn(COLS, 'py-3 border-b border-border-soft')}>
              <input
                type="checkbox"
                checked={allSelected}
                disabled={selectableIds.length === 0}
                onChange={toggleAll}
                title="Select all students shown"
                className={cn('w-[15px] h-[15px]', selectableIds.length ? 'cursor-pointer' : 'cursor-default')}
              />
              {['User', 'Role', 'Joined', 'Actions'].map((c, i) => (
                <span key={c} className={cn(tableHeadClass, i === 3 ? 'text-right' : 'text-left')}>{c}</span>
              ))}
            </div>
            {filtered.length === 0 ? (
              <div className="px-[22px] py-12 text-center text-muted text-sm">No users found</div>
            ) : (
              filtered.map((u) => (
                <div key={u.id} className={cn(COLS, 'py-3.5 border-b border-sunken last:border-b-0', selected.has(u.id) && 'bg-ember/[.04]')}>
                  {u.role === 'student' ? (
                    <input
                      type="checkbox"
                      checked={selected.has(u.id)}
                      onChange={() => toggleOne(u.id)}
                      className="w-[15px] h-[15px] cursor-pointer"
                    />
                  ) : <span />}
                  <div className="min-w-0">
                    <div className="text-[14.5px] font-semibold text-ink">{u.name}</div>
                    <div className="text-xs text-muted">
                      {u.email}
                      {u.role === 'student' && (
                        <span className={cn('ml-2', u.teacherId ? 'text-muted' : 'text-amber-sat')}>
                          {u.teacherId
                            ? `· ${teachers.find((t) => t.id === u.teacherId)?.name ?? 'teacher'}`
                            : '· no teacher'}
                        </span>
                      )}
                    </div>
                  </div>
                  <div><RoleBadge role={u.role} /></div>
                  <div className="text-[13.5px] text-subtle">{formatDate(u.createdAt)}</div>
                  <div className="flex justify-end gap-1">
                    <button onClick={() => openEdit(u)} className={iconButtonClass('edit')}><Pencil size={15} /></button>
                    {u.id !== me?.id && (
                      <button onClick={() => setDeleteTarget(u)} className={iconButtonClass('danger')}><Trash2 size={15} /></button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      <Modal isOpen={!!editUser} onClose={() => setEditUser(null)} title={`Edit ${editUser?.name}`}
        footer={<><Button variant="secondary" onClick={() => setEditUser(null)}>Cancel</Button><Button onClick={() => updateMutation.mutate()} loading={updateMutation.isPending}>Save Changes</Button></>}
      >
        <div className="flex flex-col gap-4">
          <Input label="Name" value={editForm.name} onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))} />
          <Input label="New Password (leave blank to keep unchanged)" type="password" value={editForm.password} onChange={(e) => setEditForm((f) => ({ ...f, password: e.target.value }))} placeholder="Min 8 characters" />
          {editUser?.role === 'student' && (
            <div>
              <label className="block text-[13px] font-semibold text-subtle mb-1.5">Assigned Teacher</label>
              <select
                value={editForm.teacherId}
                onChange={(e) => setEditForm((f) => ({ ...f, teacherId: e.target.value }))}
                className="w-full h-10 px-3 border border-border rounded-[10px] bg-white text-ink text-sm outline-none"
              >
                <option value="">No teacher assigned</option>
                {teachers.map((t) => <option key={t.id} value={t.id}>{t.name} ({t.email})</option>)}
              </select>
            </div>
          )}
          {editError && <p className="text-danger text-[13px]">{editError}</p>}
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
