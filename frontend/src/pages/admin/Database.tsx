import { useState, useRef } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Download, Upload, Play, AlertTriangle } from 'lucide-react';
import { downloadBackup, restoreBackup, runMigrations } from '../../api/admin';
import { Button } from '../../components/ui/Button';
import { ConfirmModal } from '../../components/ui/Modal';
import { getApiError } from '../../api/client';

const CARD: React.CSSProperties = { background: '#fff', border: '1px solid #E7E4DE', borderRadius: 16, boxShadow: '0 1px 3px rgba(11,11,14,0.05)', overflow: 'hidden', marginBottom: 16 };

export default function Database() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [restoreFile, setRestoreFile] = useState<File | null>(null);
  const [showRestoreConfirm, setShowRestoreConfirm] = useState(false);
  const [migrateResult, setMigrateResult] = useState('');
  const [restoreResult, setRestoreResult] = useState('');
  const [error, setError] = useState('');

  const backupMutation = useMutation({ mutationFn: downloadBackup, onError: (err) => setError(getApiError(err)) });

  const restoreMutation = useMutation({
    mutationFn: async () => {
      if (!restoreFile) throw new Error('No file selected');
      const text = await restoreFile.text();
      return restoreBackup(JSON.parse(text));
    },
    onSuccess: (result) => { setRestoreResult(result.message); setRestoreFile(null); setShowRestoreConfirm(false); if (fileInputRef.current) fileInputRef.current.value = ''; },
    onError: (err) => { setError(getApiError(err)); setShowRestoreConfirm(false); },
  });

  const migrateMutation = useMutation({
    mutationFn: runMigrations,
    onSuccess: (result) => setMigrateResult(result.message),
    onError: (err) => setError(getApiError(err)),
  });

  return (
    <div className="screen-fade" style={{ padding: '36px 48px 64px', maxWidth: 820, margin: '0 auto' }}>
      <div style={{ marginBottom: 28 }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#E2562B', marginBottom: 6 }}>System</div>
        <h1 style={{ fontFamily: "'Instrument Serif', serif", fontSize: 44, margin: '0 0 4px', letterSpacing: '-0.02em', color: '#0B0B0E' }}>Database Management</h1>
        <p style={{ fontSize: 14, color: 'rgba(11,11,14,0.55)', margin: 0 }}>Backup, restore, and manage database migrations</p>
      </div>

      {error && (
        <div style={{ background: 'rgba(192,57,43,0.06)', border: '1px solid rgba(192,57,43,0.2)', borderRadius: 12, padding: '12px 16px', marginBottom: 16 }}>
          <p style={{ color: '#C0392B', fontSize: 13, margin: 0 }}>{error}</p>
        </div>
      )}

      {/* Backup */}
      <div style={CARD}>
        <div style={{ padding: '18px 24px', borderBottom: '1px solid #EEEBE5' }}>
          <h3 style={{ fontSize: 16, fontWeight: 600, color: '#0B0B0E', margin: 0 }}>Database Backup</h3>
        </div>
        <div style={{ padding: '18px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          <p style={{ fontSize: 13.5, color: 'rgba(11,11,14,0.55)', margin: 0 }}>Download a complete JSON backup of all database tables. Store this file safely.</p>
          <Button onClick={() => { setError(''); backupMutation.mutate(); }} loading={backupMutation.isPending} style={{ alignSelf: 'flex-start' }}>
            <Download size={15} style={{ marginRight: 8 }} /> Download JSON Backup
          </Button>
        </div>
      </div>

      {/* Restore */}
      <div style={CARD}>
        <div style={{ padding: '18px 24px', borderBottom: '1px solid #EEEBE5' }}>
          <h3 style={{ fontSize: 16, fontWeight: 600, color: '#0B0B0E', margin: 0 }}>Restore from Backup</h3>
        </div>
        <div style={{ padding: '18px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ background: 'rgba(184,137,62,0.07)', border: '1px solid rgba(184,137,62,0.25)', borderRadius: 10, padding: '10px 14px', display: 'flex', gap: 10, alignItems: 'flex-start' }}>
            <AlertTriangle size={15} color="#B8893E" style={{ flexShrink: 0, marginTop: 2 }} />
            <p style={{ fontSize: 13, color: '#0B0B0E', margin: 0, lineHeight: 1.5 }}><strong style={{ color: '#B8893E' }}>Warning:</strong> Restoring from a backup will overwrite ALL existing data. This action cannot be undone.</p>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'rgba(11,11,14,0.65)', marginBottom: 6 }}>Select backup file (.json)</label>
            <input ref={fileInputRef} type="file" accept=".json" onChange={(e) => setRestoreFile(e.target.files?.[0] ?? null)}
              style={{ display: 'block', width: '100%', fontSize: 13, color: 'rgba(11,11,14,0.6)', cursor: 'pointer' }}
            />
          </div>
          {restoreFile && <p style={{ fontSize: 12, color: 'rgba(11,11,14,0.45)', margin: 0 }}>Selected: {restoreFile.name} ({(restoreFile.size / 1024).toFixed(1)} KB)</p>}
          {restoreResult && <p style={{ fontSize: 13, color: '#2E7D5A', margin: 0 }}>{restoreResult}</p>}
          <Button variant="danger" onClick={() => { setError(''); setShowRestoreConfirm(true); }} disabled={!restoreFile} style={{ alignSelf: 'flex-start' }}>
            <Upload size={15} style={{ marginRight: 8 }} /> Restore from Backup
          </Button>
        </div>
      </div>

      {/* Migrations */}
      <div style={CARD}>
        <div style={{ padding: '18px 24px', borderBottom: '1px solid #EEEBE5' }}>
          <h3 style={{ fontSize: 16, fontWeight: 600, color: '#0B0B0E', margin: 0 }}>Run Migrations</h3>
        </div>
        <div style={{ padding: '18px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          <p style={{ fontSize: 13.5, color: 'rgba(11,11,14,0.55)', margin: 0 }}>Run database migrations to create or update tables. Safe to run on a live database.</p>
          {migrateResult && <p style={{ fontSize: 13, color: '#2E7D5A', margin: 0 }}>{migrateResult}</p>}
          <Button variant="secondary" onClick={() => { setError(''); setMigrateResult(''); migrateMutation.mutate(); }} loading={migrateMutation.isPending} style={{ alignSelf: 'flex-start' }}>
            <Play size={15} style={{ marginRight: 8 }} /> Run Migrations
          </Button>
        </div>
      </div>

      <ConfirmModal
        isOpen={showRestoreConfirm} onClose={() => setShowRestoreConfirm(false)} onConfirm={() => restoreMutation.mutate()}
        loading={restoreMutation.isPending} title="Restore Database?"
        message={`This will completely overwrite the current database with the data from "${restoreFile?.name}". All current data will be permanently lost. Are you absolutely sure?`}
        confirmLabel="Yes, Restore Database" confirmVariant="danger"
      />
    </div>
  );
}
