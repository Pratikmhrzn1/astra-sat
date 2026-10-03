import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Search, Pencil, Trash2, Check, X, Ban, RotateCcw, LockOpen, Mail, Plus } from 'lucide-react';
import {
  fetchUsers, editAccount, removeUser, assignLearnersToTeacher, applyAccountAction, createAccount,
  type ConsoleAccount, type AccountAction,
} from '@/features/admin/api';
import { useSessionVault } from '@/features/auth';
import {
  Control, Field, Dialog, AcknowledgeDialog, RoleTag, Tag, InlineSpinner, ErrorNotice,
  iconControlStyle, accentControlStyle, screenStyle, pillStyle, surfaceStyle, tableHeadStyle,
} from '@/shared/ui';
import { classes, renderDate } from '@/shared/lib/utils';
import { fetchApiError } from '@/shared/api/http';

type RoleFilter = 'all' | 'student' | 'teacher' | 'admin';
type StatusFilter = 'any' | ConsoleAccount['status'];

const COLS = 'grid grid-cols-[28px_1.8fr_0.8fr_1fr_0.9fr_1.3fr] gap-3 px-[22px] items-center';

const ACTION_DONE: Record<AccountAction, string> = {
  approve: 'approved — they have been emailed that they can sign in',
  reject: 'rejected',
  deactivate: 'deactivated and signed out everywhere',
  reactivate: 'reactivated',
  unlock: 'unlocked',
  'resend-verification': 'sent a new verification link',
};

/** Where an account stands on its way to being able to sign in. */
function StatusTags({ user }: { user: ConsoleAccount }) {
  return (
    <div className="flex flex-wrap gap-1">
      {user.status === 'pending' && !user.emailVerified && <Tag variant="warning">Unverified</Tag>}
      {user.status === 'pending' && user.emailVerified && <Tag variant="warning">Awaiting approval</Tag>}
      {user.status === 'active' && <Tag variant="success">Active</Tag>}
      {user.status === 'rejected' && <Tag variant="error">Rejected</Tag>}
      {user.status === 'deactivated' && <Tag variant="neutral">Deactivated</Tag>}
      {user.locked && <Tag variant="error">Locked</Tag>}
    </div>
  );
}

const EMPTY_CREATE = { name: '', email: '', password: '', role: 'teacher' as 'teacher' | 'admin' };

export default function Accounts() {
  const { user: me } = useSessionVault();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<RoleFilter>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('any');
  const [deactivateTarget, setDeactivateTarget] = useState<ConsoleAccount | null>(null);
  const [actionResult, setActionResult] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState(EMPTY_CREATE);
  const [createError, setCreateError] = useState('');
  const [editUser, setEditUser] = useState<ConsoleAccount | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ConsoleAccount | null>(null);
  const [editForm, setEditForm] = useState({ name: '', password: '', teacherId: '' });
  const [editError, setEditError] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkTeacherId, setBulkTeacherId] = useState('');
  const [bulkResult, setBulkResult] = useState('');

  const { data: users = [], isLoading } = useQuery({ queryKey: ['admin', 'users'], queryFn: fetchUsers });
  const { data: allUsers = [] } = useQuery({ queryKey: ['admin', 'users'], queryFn: fetchUsers });
  const teachers = allUsers.filter((u) => u.role === 'teacher');

  const updateMutation = useMutation({
    mutationFn: () => {
      const payload: { name?: string; password?: string; teacherId?: string | null } = {};
      if (editForm.name && editForm.name !== editUser?.name) payload.name = editForm.name;
      if (editForm.password) payload.password = editForm.password;
      if (editUser?.role === 'student') payload.teacherId = editForm.teacherId || null;
      return editAccount(editUser!.id, payload);
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['admin', 'users'] }); setEditUser(null); },
    onError: (err) => setEditError(fetchApiError(err)),
  });

  const assignMutation = useMutation({
    mutationFn: () =>
      assignLearnersToTeacher({ studentIds: [...selected], teacherId: bulkTeacherId || null }),
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
    onError: (err) => { setBulkResult(''); setEditError(fetchApiError(err)); },
  });

  const deleteMutation = useMutation({
    mutationFn: () => removeUser(deleteTarget!.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'stats'] });
      setDeleteTarget(null);
    },
    onError: (err) => setEditError(fetchApiError(err)),
  });

  const lifecycleMutation = useMutation({
    mutationFn: ({ user, action }: { user: ConsoleAccount; action: AccountAction }) => applyAccountAction(user.id, action),
    onSuccess: (_data, { user, action }) => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
      setDeactivateTarget(null);
      setEditError('');
      setActionResult(
        action === 'resend-verification' ? `Sent ${user.name} a new verification link.` : `${user.name} ${ACTION_DONE[action]}.`,
      );
    },
    onError: (err) => { setDeactivateTarget(null); setActionResult(''); setEditError(fetchApiError(err)); },
  });

  const runAction = (user: ConsoleAccount, action: AccountAction) => {
    setActionResult('');
    lifecycleMutation.mutate({ user, action });
  };

  const createMutation = useMutation({
    mutationFn: () => createAccount(createForm),
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'stats'] });
      setShowCreate(false);
      setActionResult(`Created ${created.role} account for ${created.name}. They can sign in now.`);
    },
    onError: (err) => setCreateError(fetchApiError(err)),
  });

  const filtered = users.filter((u) => {
    const matchesRole = roleFilter === 'all' || u.role === roleFilter;
    const matchesStatus = statusFilter === 'any' || u.status === statusFilter;
    const matchesSearch = !search || u.name.toLowerCase().includes(search.toLowerCase()) || u.email.toLowerCase().includes(search.toLowerCase());
    return matchesRole && matchesStatus && matchesSearch;
  });

  const awaitingApproval = users.filter((u) => u.status === 'pending' && u.emailVerified).length;
  const actionBusy = (u: ConsoleAccount) => lifecycleMutation.isPending && lifecycleMutation.variables?.user.id === u.id;

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

  const openEdit = (u: ConsoleAccount) => { setEditUser(u); setEditForm({ name: u.name, password: '', teacherId: u.teacherId ?? '' }); setEditError(''); };

  return (
    <div className={screenStyle}>
      <div className="flex items-start justify-between gap-3 flex-wrap mb-6">
        <h1 className="font-display font-semibold text-[32px] sm:text-[44px] m-0 tracking-[-0.02em] text-ink">User Management</h1>
        <button
          onClick={() => { setCreateForm(EMPTY_CREATE); setCreateError(''); setShowCreate(true); }}
          className={classes(accentControlStyle, 'mt-2')}
        >
          <Plus size={16} /> Create account
        </button>
      </div>

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
            <button key={r} onClick={() => setRoleFilter(r)} className={pillStyle(roleFilter === r, 'px-3.5 py-[7px] text-[13px]')}>
              {r === 'all' ? 'All' : r.charAt(0).toUpperCase() + r.slice(1)}
            </button>
          ))}
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
          className="h-[38px] px-3 border border-border rounded-[10px] bg-white text-ink text-[13px] cursor-pointer"
        >
          <option value="any">Any status</option>
          <option value="pending">Pending</option>
          <option value="active">Active</option>
          <option value="deactivated">Deactivated</option>
          <option value="rejected">Rejected</option>
        </select>
      </div>

      {/* Verified signups waiting on an admin. Until approved they cannot sign in. */}
      {awaitingApproval > 0 && statusFilter !== 'pending' && (
        <div className="bg-gold/[.08] border border-gold/25 rounded-xl px-[18px] py-3 mb-4 text-[13.5px] text-gold-dark flex items-center gap-3 flex-wrap">
          <span>
            <strong>{awaitingApproval}</strong> verified signup{awaitingApproval === 1 ? ' is' : 's are'} waiting for your approval.
          </span>
          <button
            onClick={() => setStatusFilter('pending')}
            className="ml-auto h-[30px] px-3.5 border border-gold/40 rounded-full bg-white text-[12.5px] font-semibold cursor-pointer text-gold-dark"
          >Review them</button>
        </div>
      )}

      {actionResult && (
        <div className="bg-green-sat/[.07] border border-green-sat/[.22] rounded-xl px-[18px] py-2.5 mb-4 text-[13.5px] text-green-dark">
          {actionResult}
        </div>
      )}

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
        <div className={classes(surfaceStyle, 'px-[18px] py-3.5 mb-4 flex items-center gap-3 flex-wrap')}>
          <span className="text-[13.5px] font-semibold">{selected.size} student{selected.size === 1 ? '' : 's'} selected</span>
          <select
            value={bulkTeacherId}
            onChange={(e) => setBulkTeacherId(e.target.value)}
            className="h-[38px] px-3 border border-field rounded-[10px] bg-white text-[13.5px] cursor-pointer min-w-[220px]"
          >
            <option value="">Remove teacher assignment</option>
            {teachers.map((t) => <option key={t.id} value={t.id}>{t.name} ({t.email})</option>)}
          </select>
          <Control onClick={() => { setEditError(''); setBulkResult(''); assignMutation.mutate(); }} loading={assignMutation.isPending}>
            Assign
          </Control>
          <button
            onClick={() => setSelected(new Set())}
            className="h-[38px] px-3.5 border border-border rounded-full bg-white text-[13px] font-semibold cursor-pointer text-subtle"
          >Clear</button>
          {teachers.length === 0 && (
            <span className="text-[12.5px] text-danger">No teacher accounts exist yet — create one first.</span>
          )}
        </div>
      )}

      {editError && !editUser && <ErrorNotice>{editError}</ErrorNotice>}

      {isLoading ? (
        <InlineSpinner />
      ) : (
        <div className={classes(surfaceStyle, 'overflow-x-auto')}>
          <div className="min-w-[860px]">
            <div className={classes(COLS, 'py-3 border-b border-border-soft')}>
              <input
                type="checkbox"
                checked={allSelected}
                disabled={selectableIds.length === 0}
                onChange={toggleAll}
                title="Select all students shown"
                className={classes('w-[15px] h-[15px]', selectableIds.length ? 'cursor-pointer' : 'cursor-default')}
              />
              {['User', 'Role', 'Status', 'Joined', 'Actions'].map((c, i) => (
                <span key={c} className={classes(tableHeadStyle, i === 4 ? 'text-right' : 'text-left')}>{c}</span>
              ))}
            </div>
            {filtered.length === 0 ? (
              <div className="px-[22px] py-12 text-center text-muted text-sm">No users found</div>
            ) : (
              filtered.map((u) => (
                <div key={u.id} className={classes(COLS, 'py-3.5 border-b border-sunken last:border-b-0', selected.has(u.id) && 'bg-ember/[.04]')}>
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
                        <span className={classes('ml-2', u.teacherId ? 'text-muted' : 'text-amber-sat')}>
                          {u.teacherId
                            ? `· ${teachers.find((t) => t.id === u.teacherId)?.name ?? 'teacher'}`
                            : '· no teacher'}
                        </span>
                      )}
                    </div>
                  </div>
                  <div><RoleTag role={u.role} /></div>
                  <StatusTags user={u} />
                  <div className="text-[13.5px] text-subtle">{renderDate(u.createdAt)}</div>
                  <div className="flex justify-end gap-1">
                    {u.status === 'pending' && (
                      <>
                        <button title="Approve" disabled={actionBusy(u)} onClick={() => runAction(u, 'approve')} className={iconControlStyle('edit')}><Check size={15} /></button>
                        <button title="Reject" disabled={actionBusy(u)} onClick={() => runAction(u, 'reject')} className={iconControlStyle('danger')}><X size={15} /></button>
                      </>
                    )}
                    {u.status === 'pending' && !u.emailVerified && (
                      <button title="Resend verification email" disabled={actionBusy(u)} onClick={() => runAction(u, 'resend-verification')} className={iconControlStyle('edit')}><Mail size={15} /></button>
                    )}
                    {(u.status === 'deactivated' || u.status === 'rejected') && (
                      <button title="Reactivate" disabled={actionBusy(u)} onClick={() => runAction(u, 'reactivate')} className={iconControlStyle('edit')}><RotateCcw size={15} /></button>
                    )}
                    {u.locked && (
                      <button title="Unlock (clear failed sign-in attempts)" disabled={actionBusy(u)} onClick={() => runAction(u, 'unlock')} className={iconControlStyle('edit')}><LockOpen size={15} /></button>
                    )}
                    <button title="Edit" onClick={() => openEdit(u)} className={iconControlStyle('edit')}><Pencil size={15} /></button>
                    {u.status === 'active' && u.id !== me?.id && (
                      <button title="Deactivate" onClick={() => setDeactivateTarget(u)} className={iconControlStyle('danger')}><Ban size={15} /></button>
                    )}
                    {u.id !== me?.id && (
                      <button title="Delete" onClick={() => setDeleteTarget(u)} className={iconControlStyle('danger')}><Trash2 size={15} /></button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      <Dialog isOpen={!!editUser} onClose={() => setEditUser(null)} title={`Edit ${editUser?.name}`}
        footer={<><Control variant="secondary" onClick={() => setEditUser(null)}>Cancel</Control><Control onClick={() => updateMutation.mutate()} loading={updateMutation.isPending}>Save Changes</Control></>}
      >
        <div className="flex flex-col gap-4">
          <Field label="Name" value={editForm.name} onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))} />
          <Field label="New Password (leave blank to keep unchanged)" type="password" value={editForm.password} onChange={(e) => setEditForm((f) => ({ ...f, password: e.target.value }))} placeholder="Min 8 characters" />
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
      </Dialog>

      <Dialog isOpen={showCreate} onClose={() => setShowCreate(false)} title="Create account"
        footer={<><Control variant="secondary" onClick={() => setShowCreate(false)}>Cancel</Control><Control onClick={() => { setCreateError(''); createMutation.mutate(); }} loading={createMutation.isPending}>Create Account</Control></>}
      >
        <div className="flex flex-col gap-4">
          <p className="m-0 text-[13px] text-subtle">
            Teachers and admins are created here — they never sign up publicly. The account is active immediately; share the password with them securely.
          </p>
          <div>
            <label className="block text-[13px] font-semibold text-subtle mb-2">Role</label>
            <div className="flex gap-2">
              {(['teacher', 'admin'] as const).map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setCreateForm((f) => ({ ...f, role: r }))}
                  className={pillStyle(createForm.role === r, 'px-[18px] py-2 text-[13px]')}
                >
                  {r.charAt(0).toUpperCase() + r.slice(1)}
                </button>
              ))}
            </div>
          </div>
          <Field label="Name" value={createForm.name} onChange={(e) => setCreateForm((f) => ({ ...f, name: e.target.value }))} />
          <Field label="Email" type="email" value={createForm.email} onChange={(e) => setCreateForm((f) => ({ ...f, email: e.target.value }))} />
          <Field label="Password" type="password" value={createForm.password} onChange={(e) => setCreateForm((f) => ({ ...f, password: e.target.value }))} placeholder="Min 8 characters" />
          {createError && <p className="text-danger text-[13px]">{createError}</p>}
        </div>
      </Dialog>

      <AcknowledgeDialog
        isOpen={!!deactivateTarget} onClose={() => setDeactivateTarget(null)}
        onConfirm={() => deactivateTarget && runAction(deactivateTarget, 'deactivate')}
        loading={lifecycleMutation.isPending} title="Deactivate User?"
        message={`${deactivateTarget?.name} will be signed out everywhere and won't be able to sign in until reactivated. Their exams and results are kept.`}
        confirmLabel="Deactivate"
      />

      <AcknowledgeDialog
        isOpen={!!deleteTarget} onClose={() => setDeleteTarget(null)} onConfirm={() => deleteMutation.mutate()}
        loading={deleteMutation.isPending} title="Delete User?"
        message={`Are you sure you want to delete ${deleteTarget?.name}? This will also delete all their exams, results, and feedback.`}
        confirmLabel="Delete User"
      />
    </div>
  );
}
