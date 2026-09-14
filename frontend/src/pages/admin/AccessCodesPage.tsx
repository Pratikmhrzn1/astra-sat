import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, Key, RefreshCw } from 'lucide-react';
import { getAccessCodes, createAccessCode, deleteAccessCode } from '@/api/admin';
import {
  Button, Input, Modal, ConfirmModal, RoleBadge, InlineLoader, IconEmpty,
  accentActionClass, iconButtonClass, pageClass, surfaceClass, tableHeadClass,
} from '@/components/common';
import { cn, formatDate } from '@/lib/utils';
import { getApiError } from '@/api/http';

type Role = 'student' | 'teacher' | 'admin';

function randomCode() {
  return Math.random().toString(36).substring(2, 10).toUpperCase();
}

const COLS = 'grid grid-cols-[1.6fr_1fr_1fr_1fr_1fr] gap-3 px-[22px]';

const ROLE_TONE: Record<Role, string> = {
  student: 'bg-blue-sat/[.08] text-blue-sat border-blue-sat/20',
  teacher: 'bg-green-sat/[.08] text-green-sat border-green-sat/20',
  admin: 'bg-ember/[.08] text-accent-text border-ember/20',
};

export default function AccessCodes() {
  const queryClient = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [form, setForm] = useState({ code: '', role: 'student' as Role, description: '', maxUses: '' });
  const [createError, setCreateError] = useState('');

  const { data: codes = [], isLoading } = useQuery({ queryKey: ['admin', 'access-codes'], queryFn: getAccessCodes });

  const createMutation = useMutation({
    mutationFn: () => createAccessCode({ code: form.code, role: form.role, description: form.description, maxUses: form.maxUses ? parseInt(form.maxUses) : null }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['admin', 'access-codes'] }); setShowCreate(false); setForm({ code: '', role: 'student', description: '', maxUses: '' }); },
    onError: (err) => setCreateError(getApiError(err)),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteAccessCode(id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['admin', 'access-codes'] }); setDeleteTarget(null); },
  });

  return (
    <div className={pageClass}>
      <div className="flex items-start justify-between gap-3 flex-wrap mb-7">
        <div>
          <div className="text-[11px] font-bold tracking-[0.12em] uppercase text-accent-text mb-1.5">Registration</div>
          <h1 className="font-display font-semibold text-[32px] sm:text-[44px] mt-0 mb-1.5 tracking-[-0.02em] text-ink">Access Codes</h1>
          <p className="text-sm text-subtle m-0">Required during registration to assign a role to new accounts.</p>
        </div>
        <button onClick={() => { setShowCreate(true); setCreateError(''); }} className={cn(accentActionClass, 'mt-2')}>
          <Plus size={16} /> Create Code
        </button>
      </div>

      {isLoading ? (
        <InlineLoader />
      ) : codes.length === 0 ? (
        <IconEmpty icon={Key}><p>No access codes yet.</p></IconEmpty>
      ) : (
        <div className={cn(surfaceClass, 'overflow-x-auto')}>
          <div className="min-w-[620px]">
            <div className={cn(COLS, 'py-3 border-b border-border-soft')}>
              {['Code', 'Role', 'Uses', 'Created', 'Action'].map((c, i) => (
                <span key={c} className={cn(tableHeadClass, i === 4 ? 'text-right' : 'text-left')}>{c}</span>
              ))}
            </div>
            {codes.map((c) => (
              <div key={c.id} className={cn(COLS, 'py-3.5 border-b border-sunken last:border-b-0 items-center hover:bg-[#FBFAF8]')}>
                <div>
                  <div className="font-mono text-sm font-bold text-ink">{c.code}</div>
                  {c.description && <div className="text-xs text-muted">{c.description}</div>}
                </div>
                <div><RoleBadge role={c.role} /></div>
                <div className="text-[13.5px] text-subtle">{c.useCount}{c.maxUses ? ` / ${c.maxUses}` : ''}</div>
                <div className="text-[13.5px] text-subtle">{formatDate(c.createdAt)}</div>
                <div className="text-right">
                  <button onClick={() => setDeleteTarget(c.id)} className={iconButtonClass('danger')}><Trash2 size={15} /></button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <Modal isOpen={showCreate} onClose={() => setShowCreate(false)} title="Create Access Code"
        footer={<><Button variant="secondary" onClick={() => setShowCreate(false)}>Cancel</Button><Button onClick={() => createMutation.mutate()} loading={createMutation.isPending} disabled={!form.code.trim()}>Create Code</Button></>}
      >
        <div className="flex flex-col gap-4">
          <div>
            <label className="block text-[13px] font-semibold text-subtle mb-1.5">Access Code</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={form.code}
                onChange={(e) => setForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))}
                placeholder="e.g. STUDENT2024"
                className="flex-1 h-10 px-3 border border-border rounded-[10px] bg-white text-ink font-mono text-sm outline-none"
              />
              <button
                onClick={() => setForm((f) => ({ ...f, code: randomCode() }))}
                className="w-10 h-10 rounded-[10px] border border-border bg-sunken cursor-pointer flex items-center justify-center text-ink"
              ><RefreshCw size={15} /></button>
            </div>
          </div>
          <div>
            <label className="block text-[13px] font-semibold text-subtle mb-2">Role</label>
            <div className="flex gap-2">
              {(['student', 'teacher', 'admin'] as Role[]).map((r) => (
                <button
                  key={r}
                  onClick={() => setForm((f) => ({ ...f, role: r }))}
                  className={cn('px-[18px] py-2 rounded-[9px] text-[13px] font-semibold cursor-pointer border', form.role === r ? ROLE_TONE[r] : 'bg-sunken text-stone border-border')}
                >{r.charAt(0).toUpperCase() + r.slice(1)}</button>
              ))}
            </div>
          </div>
          <Input label="Description (optional)" value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} placeholder="e.g. Spring 2024 student batch" />
          <Input label="Max Uses (leave blank for unlimited)" type="number" value={form.maxUses} onChange={(e) => setForm((f) => ({ ...f, maxUses: e.target.value }))} placeholder="Unlimited" />
          {createError && <p className="text-danger text-[13px]">{createError}</p>}
        </div>
      </Modal>

      <ConfirmModal
        isOpen={!!deleteTarget} onClose={() => setDeleteTarget(null)} onConfirm={() => deleteMutation.mutate(deleteTarget!)}
        loading={deleteMutation.isPending} title="Delete Access Code?"
        message="This access code will be permanently deleted. Users who have already used it will not be affected."
        confirmLabel="Delete"
      />
    </div>
  );
}
