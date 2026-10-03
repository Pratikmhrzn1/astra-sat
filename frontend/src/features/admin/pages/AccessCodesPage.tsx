import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, Key, RefreshCw } from 'lucide-react';
import { fetchAccessCodes, addAccessCode, removeAccessCode } from '@/features/admin/api';
import {
  Control, Field, Dialog, AcknowledgeDialog, RoleTag, InlineSpinner, IconBlank,
  accentControlStyle, iconControlStyle, screenStyle, surfaceStyle, tableHeadStyle,
} from '@/shared/ui';
import { classes, renderDate } from '@/shared/lib/utils';
import { fetchApiError } from '@/shared/api/http';

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

export default function EnrolmentCodes() {
  const queryClient = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [form, setForm] = useState({ code: '', role: 'student' as Role, description: '', maxUses: '' });
  const [createError, setCreateError] = useState('');

  const { data: codes = [], isLoading } = useQuery({ queryKey: ['admin', 'access-codes'], queryFn: fetchAccessCodes });

  const createMutation = useMutation({
    mutationFn: () => addAccessCode({ code: form.code, role: form.role, description: form.description, maxUses: form.maxUses ? parseInt(form.maxUses) : null }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['admin', 'access-codes'] }); setShowCreate(false); setForm({ code: '', role: 'student', description: '', maxUses: '' }); },
    onError: (err) => setCreateError(fetchApiError(err)),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => removeAccessCode(id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['admin', 'access-codes'] }); setDeleteTarget(null); },
  });

  return (
    <div className={screenStyle}>
      <div className="flex items-start justify-between gap-3 flex-wrap mb-7">
        <div>
          <div className="text-[11px] font-bold tracking-[0.12em] uppercase text-accent-text mb-1.5">Registration</div>
          <h1 className="font-display font-semibold text-[32px] sm:text-[44px] mt-0 mb-1.5 tracking-[-0.02em] text-ink">Access Codes</h1>
          <p className="text-sm text-subtle m-0">Legacy — signup no longer asks for a code. New students verify their email and are approved under User Management; teachers and admins are created there too.</p>
        </div>
        <button onClick={() => { setShowCreate(true); setCreateError(''); }} className={classes(accentControlStyle, 'mt-2')}>
          <Plus size={16} /> Create Code
        </button>
      </div>

      {isLoading ? (
        <InlineSpinner />
      ) : codes.length === 0 ? (
        <IconBlank icon={Key}><p>No access codes yet.</p></IconBlank>
      ) : (
        <div className={classes(surfaceStyle, 'overflow-x-auto')}>
          <div className="min-w-[620px]">
            <div className={classes(COLS, 'py-3 border-b border-border-soft')}>
              {['Code', 'Role', 'Uses', 'Created', 'Action'].map((c, i) => (
                <span key={c} className={classes(tableHeadStyle, i === 4 ? 'text-right' : 'text-left')}>{c}</span>
              ))}
            </div>
            {codes.map((c) => (
              <div key={c.id} className={classes(COLS, 'py-3.5 border-b border-sunken last:border-b-0 items-center hover:bg-[#FBFAF8]')}>
                <div>
                  <div className="font-mono text-sm font-bold text-ink">{c.code}</div>
                  {c.description && <div className="text-xs text-muted">{c.description}</div>}
                </div>
                <div><RoleTag role={c.role} /></div>
                <div className="text-[13.5px] text-subtle">{c.useCount}{c.maxUses ? ` / ${c.maxUses}` : ''}</div>
                <div className="text-[13.5px] text-subtle">{renderDate(c.createdAt)}</div>
                <div className="text-right">
                  <button onClick={() => setDeleteTarget(c.id)} className={iconControlStyle('danger')}><Trash2 size={15} /></button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <Dialog isOpen={showCreate} onClose={() => setShowCreate(false)} title="Create Access Code"
        footer={<><Control variant="secondary" onClick={() => setShowCreate(false)}>Cancel</Control><Control onClick={() => createMutation.mutate()} loading={createMutation.isPending} disabled={!form.code.trim()}>Create Code</Control></>}
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
                  className={classes('px-[18px] py-2 rounded-[9px] text-[13px] font-semibold cursor-pointer border', form.role === r ? ROLE_TONE[r] : 'bg-sunken text-stone border-border')}
                >{r.charAt(0).toUpperCase() + r.slice(1)}</button>
              ))}
            </div>
          </div>
          <Field label="Description (optional)" value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} placeholder="e.g. Spring 2024 student batch" />
          <Field label="Max Uses (leave blank for unlimited)" type="number" value={form.maxUses} onChange={(e) => setForm((f) => ({ ...f, maxUses: e.target.value }))} placeholder="Unlimited" />
          {createError && <p className="text-danger text-[13px]">{createError}</p>}
        </div>
      </Dialog>

      <AcknowledgeDialog
        isOpen={!!deleteTarget} onClose={() => setDeleteTarget(null)} onConfirm={() => deleteMutation.mutate(deleteTarget!)}
        loading={deleteMutation.isPending} title="Delete Access Code?"
        message="This access code will be permanently deleted. Users who have already used it will not be affected."
        confirmLabel="Delete"
      />
    </div>
  );
}
