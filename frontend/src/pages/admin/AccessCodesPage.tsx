import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, Key, RefreshCw } from 'lucide-react';
import { getAccessCodes, createAccessCode, deleteAccessCode } from '@/api/admin';
import { Button, Input, Modal, ConfirmModal, RoleBadge, Spinner } from '@/components/common';
import { formatDate } from '@/lib/utils';
import { getApiError } from '@/api/http';

type Role = 'student' | 'teacher' | 'admin';

function randomCode() {
  return Math.random().toString(36).substring(2, 10).toUpperCase();
}

const CARD: React.CSSProperties = { background: '#fff', border: '1px solid #E7E4DE', borderRadius: 16, boxShadow: '0 1px 3px rgba(11,11,14,0.05)', overflow: 'hidden' };

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

  const roleStyle: Record<Role, React.CSSProperties> = {
    student: { background: 'rgba(37,99,168,0.08)', color: '#2563A8', border: '1px solid rgba(37,99,168,0.2)' },
    teacher: { background: 'rgba(46,125,90,0.08)', color: '#2E7D5A', border: '1px solid rgba(46,125,90,0.2)' },
    admin: { background: 'rgba(226,86,43,0.08)', color: '#C4471F', border: '1px solid rgba(226,86,43,0.2)' },
  };

  return (
    <div className="screen-fade" style={{ padding: '36px 48px 64px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 28 }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#C4471F', marginBottom: 6 }}>Registration</div>
          <h1 style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 44, margin: '0 0 6px', letterSpacing: '-0.02em', color: '#0B0B0E' }}>Access Codes</h1>
          <p style={{ fontSize: 14, color: 'rgba(11,11,14,0.64)', margin: 0 }}>Required during registration to assign a role to new accounts.</p>
        </div>
        <button
          onClick={() => { setShowCreate(true); setCreateError(''); }}
          style={{ display: 'flex', alignItems: 'center', gap: 8, height: 42, padding: '0 18px', background: '#C4471F', color: '#fff', border: 'none', borderRadius: 9999, fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', boxShadow: '0 2px 10px rgba(226,86,43,0.26)', flexShrink: 0, marginTop: 8 }}
        >
          <Plus size={16} /> Create Code
        </button>
      </div>

      {isLoading ? (
        <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 64 }}><Spinner className="w-8 h-8 text-[#C4471F]" /></div>
      ) : codes.length === 0 ? (
        <div style={{ textAlign: 'center', paddingTop: 64 }}>
          <Key size={48} color="rgba(11,11,14,0.2)" style={{ margin: '0 auto 16px', display: 'block' }} />
          <p style={{ color: 'rgba(11,11,14,0.58)', fontSize: 14 }}>No access codes yet.</p>
        </div>
      ) : (
        <div style={CARD}>
          <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr 1fr 1fr 1fr', gap: 12, padding: '12px 22px', borderBottom: '1px solid #EEEBE5' }}>
            {['Code', 'Role', 'Uses', 'Created', 'Action'].map((c, i) => (
              <span key={c} style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'rgba(11,11,14,0.58)', textAlign: i === 4 ? 'right' : 'left' }}>{c}</span>
            ))}
          </div>
          {codes.map((c, i) => (
            <div key={c.id} style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr 1fr 1fr 1fr', gap: 12, padding: '14px 22px', borderBottom: i < codes.length - 1 ? '1px solid #F2F0EC' : 'none', alignItems: 'center' }}
              onPointerEnter={(el) => { if (el.pointerType !== 'mouse') return; el.currentTarget.style.background = '#FBFAF8'; }}
              onPointerLeave={(el) => (el.currentTarget.style.background = 'transparent')}
            >
              <div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 14, fontWeight: 700, color: '#0B0B0E' }}>{c.code}</div>
                {c.description && <div style={{ fontSize: 12, color: 'rgba(11,11,14,0.58)' }}>{c.description}</div>}
              </div>
              <div><RoleBadge role={c.role} /></div>
              <div style={{ fontSize: 13.5, color: 'rgba(11,11,14,0.64)' }}>{c.useCount}{c.maxUses ? ` / ${c.maxUses}` : ''}</div>
              <div style={{ fontSize: 13.5, color: 'rgba(11,11,14,0.64)' }}>{formatDate(c.createdAt)}</div>
              <div style={{ textAlign: 'right' }}>
                <button onClick={() => setDeleteTarget(c.id)} style={{ padding: 7, borderRadius: 8, border: 'none', background: 'transparent', cursor: 'pointer', color: 'rgba(11,11,14,0.58)' }}
                  onPointerEnter={(e) => { if (e.pointerType !== 'mouse') return; e.currentTarget.style.background = 'rgba(192,57,43,0.08)'; e.currentTarget.style.color = '#C0392B'; }}
                  onPointerLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'rgba(11,11,14,0.58)'; }}
                ><Trash2 size={15} /></button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal isOpen={showCreate} onClose={() => setShowCreate(false)} title="Create Access Code"
        footer={<><Button variant="secondary" onClick={() => setShowCreate(false)}>Cancel</Button><Button onClick={() => createMutation.mutate()} loading={createMutation.isPending} disabled={!form.code.trim()}>Create Code</Button></>}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'rgba(11,11,14,0.65)', marginBottom: 6 }}>Access Code</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                type="text"
                value={form.code}
                onChange={(e) => setForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))}
                placeholder="e.g. STUDENT2024"
                style={{ flex: 1, height: 40, padding: '0 12px', border: '1px solid #E7E4DE', borderRadius: 10, background: '#fff', color: '#0B0B0E', fontFamily: 'var(--font-mono)', fontSize: 14, outline: 'none' }}
              />
              <button onClick={() => setForm((f) => ({ ...f, code: randomCode() }))}
                style={{ width: 40, height: 40, borderRadius: 10, border: '1px solid #E7E4DE', background: '#F2F0EC', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              ><RefreshCw size={15} color="#0B0B0E" /></button>
            </div>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'rgba(11,11,14,0.65)', marginBottom: 8 }}>Role</label>
            <div style={{ display: 'flex', gap: 8 }}>
              {(['student', 'teacher', 'admin'] as Role[]).map((r) => (
                <button key={r} onClick={() => setForm((f) => ({ ...f, role: r }))}
                  style={{ padding: '8px 18px', borderRadius: 9, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', ...(form.role === r ? roleStyle[r] : { background: '#F2F0EC', color: '#6F6B64', border: '1px solid #E7E4DE' }) }}
                >{r.charAt(0).toUpperCase() + r.slice(1)}</button>
              ))}
            </div>
          </div>
          <Input label="Description (optional)" value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} placeholder="e.g. Spring 2024 student batch" />
          <Input label="Max Uses (leave blank for unlimited)" type="number" value={form.maxUses} onChange={(e) => setForm((f) => ({ ...f, maxUses: e.target.value }))} placeholder="Unlimited" />
          {createError && <p style={{ color: '#C0392B', fontSize: 13 }}>{createError}</p>}
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
