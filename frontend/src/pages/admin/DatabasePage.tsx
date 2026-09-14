import { useState, useRef } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Download, Upload, Play, AlertTriangle, Terminal } from 'lucide-react';
import { backfillScores, downloadBackup, restoreBackup, runMigrations, runSql } from '@/api/admin';
import { Button, ConfirmModal } from '@/components/common';
import { getApiError } from '@/api/http';

const CARD: React.CSSProperties = { background: '#fff', border: '1px solid #E7E4DE', borderRadius: 16, boxShadow: '0 1px 3px rgba(11,11,14,0.05)', overflow: 'hidden', marginBottom: 16 };

export default function Database() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [restoreFile, setRestoreFile] = useState<File | null>(null);
  const [showRestoreConfirm, setShowRestoreConfirm] = useState(false);
  const [migrateResult, setMigrateResult] = useState('');
  const [backfillResult, setBackfillResult] = useState('');
  const [restoreResult, setRestoreResult] = useState('');
  const [sqlText, setSqlText] = useState('');
  const [sqlResult, setSqlResult] = useState<{ statements: number; rowsAffected: number; rows: Record<string, unknown>[] } | null>(null);
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

  const backfillMutation = useMutation({
    mutationFn: backfillScores,
    onSuccess: (run) =>
      setBackfillResult(
        `Scored ${run.examsScored} of ${run.examsFound} exams ` +
          `(${run.examsSkippedAsMockModule} mock modules skipped, ${run.examsTooShort} too short to scale) ` +
          `and ${run.mocksScored} of ${run.mocksFound} mocks ` +
          `(${run.mocksIncomplete} not finished).`,
      ),
    onError: (err) => setError(getApiError(err)),
  });

  const sqlMutation = useMutation({
    mutationFn: () => runSql(sqlText),
    onSuccess: (result) => { setSqlResult(result); setError(''); },
    onError: (err) => { setError(getApiError(err)); setSqlResult(null); },
  });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setRestoreFile(e.target.files?.[0] ?? null);
    setRestoreResult('');
    setError('');
  };

  const triggerFilePicker = () => fileInputRef.current?.click();

  return (
    <div className="screen-fade" style={{ padding: '36px 48px 64px', maxWidth: 820, margin: '0 auto' }}>
      <div style={{ marginBottom: 28 }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#C4471F', marginBottom: 6 }}>System</div>
        <h1 style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 44, margin: '0 0 4px', letterSpacing: '-0.02em', color: '#0B0B0E' }}>Database Management</h1>
        <p style={{ fontSize: 14, color: 'rgba(11,11,14,0.64)', margin: 0 }}>Backup, restore, and manage database migrations</p>
      </div>

      {error && (
        <div style={{ background: 'rgba(192,57,43,0.06)', border: '1px solid rgba(192,57,43,0.2)', borderRadius: 12, padding: '12px 16px', marginBottom: 16 }}>
          <p style={{ color: '#C0392B', fontSize: 13, margin: 0, fontFamily: 'var(--font-mono)', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{error}</p>
        </div>
      )}

      {/* Backup */}
      <div style={CARD}>
        <div style={{ padding: '18px 24px', borderBottom: '1px solid #EEEBE5' }}>
          <h3 style={{ fontSize: 16, fontWeight: 600, color: '#0B0B0E', margin: 0 }}>Database Backup</h3>
        </div>
        <div style={{ padding: '18px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          <p style={{ fontSize: 13.5, color: 'rgba(11,11,14,0.64)', margin: 0 }}>Download a complete JSON backup of all database tables. Store this file safely.</p>
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

          {/* Hidden native file input */}
          <input
            ref={fileInputRef}
            type="file"
            accept=".json"
            onChange={handleFileChange}
            style={{ display: 'none' }}
          />

          {/* Styled file picker */}
          <div>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'rgba(11,11,14,0.65)', marginBottom: 8 }}>Select backup file (.json)</label>
            <div
              onClick={triggerFilePicker}
              style={{
                display: 'flex', alignItems: 'center', gap: 12, padding: '11px 16px',
                border: restoreFile ? '1.5px solid #0B0B0E' : '1.5px dashed #C8C4BC',
                borderRadius: 10, cursor: 'pointer', background: restoreFile ? 'rgba(11,11,14,0.03)' : '#FAFAF8',
                transition: 'border-color 0.15s, background 0.15s',
              }}
              onPointerEnter={(e) => { if (e.pointerType !== 'mouse') return; if (!restoreFile) { (e.currentTarget as HTMLDivElement).style.borderColor = '#8C8880'; (e.currentTarget as HTMLDivElement).style.background = 'rgba(11,11,14,0.02)'; } }}
              onPointerLeave={(e) => { if (!restoreFile) { (e.currentTarget as HTMLDivElement).style.borderColor = '#C8C4BC'; (e.currentTarget as HTMLDivElement).style.background = '#FAFAF8'; } }}
            >
              <div style={{ width: 34, height: 34, borderRadius: 8, background: restoreFile ? '#0B0B0E' : '#F0EDE7', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Upload size={15} color={restoreFile ? '#fff' : '#8C8880'} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                {restoreFile ? (
                  <>
                    <div style={{ fontSize: 13.5, fontWeight: 600, color: '#0B0B0E', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{restoreFile.name}</div>
                    <div style={{ fontSize: 12, color: 'rgba(11,11,14,0.58)', marginTop: 1 }}>{(restoreFile.size / 1024).toFixed(1)} KB · click to change</div>
                  </>
                ) : (
                  <>
                    <div style={{ fontSize: 13.5, fontWeight: 500, color: '#0B0B0E' }}>Click to select a file</div>
                    <div style={{ fontSize: 12, color: 'rgba(11,11,14,0.58)', marginTop: 1 }}>JSON backup files only</div>
                  </>
                )}
              </div>
            </div>
          </div>

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
          <p style={{ fontSize: 13.5, color: 'rgba(11,11,14,0.64)', margin: 0 }}>Creates or updates tables and enums. Safe to run on a live database — uses <code style={{ fontSize: 12, background: '#F0EDE7', padding: '1px 5px', borderRadius: 4 }}>CREATE TABLE IF NOT EXISTS</code> throughout.</p>
          {migrateResult && <p style={{ fontSize: 13, color: '#2E7D5A', margin: 0 }}>{migrateResult}</p>}
          <Button variant="secondary" onClick={() => { setError(''); setMigrateResult(''); migrateMutation.mutate(); }} loading={migrateMutation.isPending} style={{ alignSelf: 'flex-start' }}>
            <Play size={15} style={{ marginRight: 8 }} /> Run Migrations
          </Button>
        </div>
      </div>

      {/* Scaled-score backfill */}
      <div style={CARD}>
        <div style={{ padding: '18px 24px', borderBottom: '1px solid #EEEBE5' }}>
          <h3 style={{ fontSize: 16, fontWeight: 600, color: '#0B0B0E', margin: 0 }}>Backfill Scaled Scores</h3>
        </div>
        <div style={{ padding: '18px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          <p style={{ fontSize: 13.5, color: 'rgba(11,11,14,0.64)', margin: 0, lineHeight: 1.55 }}>
            Exams and mocks completed before scaled scoring existed have no 200-800 score, so students see a dash on their History page and no trend line. This computes them from the stored answers using the same functions the live submit path uses. Safe to run more than once — it only fills scores that are still empty, and never overwrites one. Mock modules are skipped on purpose: a module is half a section, and the score belongs to the mock.
          </p>
          {backfillResult && <p style={{ fontSize: 13, color: '#2E7D5A', margin: 0 }}>{backfillResult}</p>}
          <Button variant="secondary" onClick={() => { setError(''); setBackfillResult(''); backfillMutation.mutate(); }} loading={backfillMutation.isPending} style={{ alignSelf: 'flex-start' }}>
            <Play size={15} style={{ marginRight: 8 }} /> Backfill Scores
          </Button>
        </div>
      </div>

      {/* SQL Runner */}
      <div style={CARD}>
        <div style={{ padding: '18px 24px', borderBottom: '1px solid #EEEBE5' }}>
          <h3 style={{ fontSize: 16, fontWeight: 600, color: '#0B0B0E', margin: 0 }}>SQL Runner</h3>
        </div>
        <div style={{ padding: '18px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          <p style={{ fontSize: 13.5, color: 'rgba(11,11,14,0.64)', margin: 0 }}>Run arbitrary SQL against the live database. Use for data seeding, one-off fixes, or queries. Results are capped at 100 rows.</p>
          <textarea
            value={sqlText}
            onChange={(e) => { setSqlText(e.target.value); setSqlResult(null); setError(''); }}
            placeholder="-- Paste your SQL here&#10;SELECT * FROM users LIMIT 5;"
            spellCheck={false}
            style={{
              width: '100%', minHeight: 160, padding: '12px 14px', border: '1.5px solid #C8C4BC', borderRadius: 10,
              fontSize: 13, fontFamily: 'var(--font-mono)', background: '#FAFAF8', color: '#0B0B0E',
              outline: 'none', resize: 'vertical', lineHeight: 1.6, boxSizing: 'border-box',
            }}
            onFocus={(e) => (e.currentTarget.style.borderColor = '#0B0B0E')}
            onBlur={(e) => (e.currentTarget.style.borderColor = '#C8C4BC')}
          />
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Button
              variant="secondary"
              onClick={() => { setError(''); setSqlResult(null); sqlMutation.mutate(); }}
              loading={sqlMutation.isPending}
              disabled={!sqlText.trim()}
              style={{ alignSelf: 'flex-start' }}
            >
              <Terminal size={15} style={{ marginRight: 8 }} /> Run SQL
            </Button>
            {sqlText && (
              <button
                onClick={() => { setSqlText(''); setSqlResult(null); setError(''); }}
                style={{ fontSize: 13, color: 'rgba(11,11,14,0.58)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', padding: 0 }}
              >Clear</button>
            )}
          </div>

          {sqlResult && (
            <div style={{ background: '#F5F3EF', border: '1px solid #E7E4DE', borderRadius: 10, padding: '12px 14px' }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#2E7D5A', marginBottom: sqlResult.rows.length > 0 ? 10 : 0 }}>
                ✓ {sqlResult.statements} statement{sqlResult.statements !== 1 ? 's' : ''} · {sqlResult.rowsAffected} row{sqlResult.rowsAffected !== 1 ? 's' : ''} affected
              </div>
              {sqlResult.rows.length > 0 && (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, fontFamily: 'var(--font-mono)' }}>
                    <thead>
                      <tr>
                        {Object.keys(sqlResult.rows[0]).map((col) => (
                          <th key={col} style={{ textAlign: 'left', padding: '4px 10px', borderBottom: '1px solid #E7E4DE', color: 'rgba(11,11,14,0.64)', fontWeight: 700, whiteSpace: 'nowrap' }}>{col}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {sqlResult.rows.map((row, i) => (
                        <tr key={i} style={{ background: i % 2 === 0 ? 'transparent' : 'rgba(11,11,14,0.02)' }}>
                          {Object.values(row).map((val, j) => (
                            <td key={j} style={{ padding: '4px 10px', borderBottom: '1px solid #F0EDE7', color: '#0B0B0E', whiteSpace: 'nowrap', maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {val === null ? <span style={{ color: 'rgba(11,11,14,0.58)' }}>null</span> : String(val)}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
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
