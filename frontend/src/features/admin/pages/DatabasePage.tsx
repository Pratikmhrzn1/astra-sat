import { useState, useRef } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Download, Upload, Play, AlertTriangle, Terminal } from 'lucide-react';
import { backfillScores, downloadBackup, restoreBackup, runMigrations, runSql } from '@/features/admin/api';
import { Button, ConfirmModal, pageClass, surfaceClass } from '@/shared/ui';
import { cn } from '@/shared/lib/utils';
import { getApiError } from '@/shared/api/http';

/** One tool: a titled card with its body stacked beneath. */
function ToolCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className={cn(surfaceClass, 'overflow-hidden mb-4')}>
      <div className="px-6 py-[18px] border-b border-border-soft">
        <h3 className="text-base font-semibold text-ink m-0">{title}</h3>
      </div>
      <div className="px-6 py-[18px] flex flex-col gap-3.5">{children}</div>
    </div>
  );
}

const note = 'text-[13.5px] text-subtle m-0';
const success = 'text-[13px] text-green-sat m-0';

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
    <div className={cn(pageClass, 'max-w-[820px] mx-auto')}>
      <div className="mb-7">
        <div className="text-[11px] font-bold tracking-[0.12em] uppercase text-accent-text mb-1.5">System</div>
        <h1 className="font-display font-semibold text-[32px] sm:text-[44px] mt-0 mb-1 tracking-[-0.02em] text-ink">Database Management</h1>
        <p className="text-sm text-subtle m-0">Backup, restore, and manage database migrations</p>
      </div>

      {error && (
        <div className="bg-danger/[.06] border border-danger/20 rounded-xl px-4 py-3 mb-4">
          <p className="text-danger text-[13px] m-0 font-mono whitespace-pre-wrap break-words">{error}</p>
        </div>
      )}

      <ToolCard title="Database Backup">
        <p className={note}>Download a complete JSON backup of all database tables. Store this file safely.</p>
        <Button onClick={() => { setError(''); backupMutation.mutate(); }} loading={backupMutation.isPending} className="self-start">
          <Download size={15} className="mr-2" /> Download JSON Backup
        </Button>
      </ToolCard>

      <ToolCard title="Restore from Backup">
        <div className="bg-gold/[.07] border border-gold/25 rounded-[10px] px-3.5 py-2.5 flex gap-2.5 items-start">
          <AlertTriangle size={15} className="text-gold shrink-0 mt-0.5" />
          <p className="text-[13px] text-ink m-0 leading-normal"><strong className="text-gold">Warning:</strong> Restoring from a backup will overwrite ALL existing data. This action cannot be undone.</p>
        </div>

        {/* Hidden native file input */}
        <input ref={fileInputRef} type="file" accept=".json" onChange={handleFileChange} className="hidden" />

        {/* Styled file picker */}
        <div>
          <label className="block text-[13px] font-semibold text-subtle mb-2">Select backup file (.json)</label>
          <div
            onClick={triggerFilePicker}
            className={cn(
              'flex items-center gap-3 px-4 py-[11px] rounded-[10px] cursor-pointer transition-[border-color,background-color] duration-150',
              restoreFile
                ? 'border-[1.5px] border-solid border-ink bg-ink/[.03]'
                : 'border-[1.5px] border-dashed border-field bg-[#FAFAF8] hover:border-[#8C8880] hover:bg-ink/[.02]',
            )}
          >
            <div className={cn('w-[34px] h-[34px] rounded-lg flex items-center justify-center shrink-0', restoreFile ? 'bg-ink text-white' : 'bg-sunken-2 text-[#8C8880]')}>
              <Upload size={15} />
            </div>
            <div className="flex-1 min-w-0">
              {restoreFile ? (
                <>
                  <div className="text-[13.5px] font-semibold text-ink truncate">{restoreFile.name}</div>
                  <div className="text-xs text-muted mt-px">{(restoreFile.size / 1024).toFixed(1)} KB · click to change</div>
                </>
              ) : (
                <>
                  <div className="text-[13.5px] font-medium text-ink">Click to select a file</div>
                  <div className="text-xs text-muted mt-px">JSON backup files only</div>
                </>
              )}
            </div>
          </div>
        </div>

        {restoreResult && <p className={success}>{restoreResult}</p>}
        <Button variant="danger" onClick={() => { setError(''); setShowRestoreConfirm(true); }} disabled={!restoreFile} className="self-start">
          <Upload size={15} className="mr-2" /> Restore from Backup
        </Button>
      </ToolCard>

      <ToolCard title="Run Migrations">
        <p className={note}>Creates or updates tables and enums. Safe to run on a live database — uses <code className="text-xs bg-sunken-2 px-[5px] py-px rounded">CREATE TABLE IF NOT EXISTS</code> throughout.</p>
        {migrateResult && <p className={success}>{migrateResult}</p>}
        <Button variant="secondary" onClick={() => { setError(''); setMigrateResult(''); migrateMutation.mutate(); }} loading={migrateMutation.isPending} className="self-start">
          <Play size={15} className="mr-2" /> Run Migrations
        </Button>
      </ToolCard>

      <ToolCard title="Backfill Scaled Scores">
        <p className={cn(note, 'leading-[1.55]')}>
          Exams and mocks completed before scaled scoring existed have no 200-800 score, so students see a dash on their History page and no trend line. This computes them from the stored answers using the same functions the live submit path uses. Safe to run more than once — it only fills scores that are still empty, and never overwrites one. Mock modules are skipped on purpose: a module is half a section, and the score belongs to the mock.
        </p>
        {backfillResult && <p className={success}>{backfillResult}</p>}
        <Button variant="secondary" onClick={() => { setError(''); setBackfillResult(''); backfillMutation.mutate(); }} loading={backfillMutation.isPending} className="self-start">
          <Play size={15} className="mr-2" /> Backfill Scores
        </Button>
      </ToolCard>

      <ToolCard title="SQL Runner">
        <p className={note}>Run arbitrary SQL against the live database. Use for data seeding, one-off fixes, or queries. Results are capped at 100 rows.</p>
        <textarea
          value={sqlText}
          onChange={(e) => { setSqlText(e.target.value); setSqlResult(null); setError(''); }}
          placeholder="-- Paste your SQL here&#10;SELECT * FROM users LIMIT 5;"
          spellCheck={false}
          className="w-full min-h-[160px] px-3.5 py-3 border-[1.5px] border-field focus:border-ink rounded-[10px] text-[13px] font-mono bg-[#FAFAF8] text-ink outline-none resize-y leading-[1.6]"
        />
        <div className="flex items-center gap-3">
          <Button
            variant="secondary"
            onClick={() => { setError(''); setSqlResult(null); sqlMutation.mutate(); }}
            loading={sqlMutation.isPending}
            disabled={!sqlText.trim()}
            className="self-start"
          >
            <Terminal size={15} className="mr-2" /> Run SQL
          </Button>
          {sqlText && (
            <button
              onClick={() => { setSqlText(''); setSqlResult(null); setError(''); }}
              className="text-[13px] text-muted bg-transparent cursor-pointer p-0"
            >Clear</button>
          )}
        </div>

        {sqlResult && (
          <div className="bg-[#F5F3EF] border border-border rounded-[10px] px-3.5 py-3">
            <div className={cn('text-xs font-bold text-green-sat', sqlResult.rows.length > 0 && 'mb-2.5')}>
              ✓ {sqlResult.statements} statement{sqlResult.statements !== 1 ? 's' : ''} · {sqlResult.rowsAffected} row{sqlResult.rowsAffected !== 1 ? 's' : ''} affected
            </div>
            {sqlResult.rows.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-xs font-mono">
                  <thead>
                    <tr>
                      {Object.keys(sqlResult.rows[0]).map((col) => (
                        <th key={col} className="text-left px-2.5 py-1 border-b border-border text-subtle font-bold whitespace-nowrap">{col}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {sqlResult.rows.map((row, i) => (
                      <tr key={i} className="even:bg-ink/[.02]">
                        {Object.values(row).map((val, j) => (
                          <td key={j} className="px-2.5 py-1 border-b border-sunken-2 text-ink whitespace-nowrap max-w-[260px] truncate">
                            {val === null ? <span className="text-muted">null</span> : String(val)}
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
      </ToolCard>

      <ConfirmModal
        isOpen={showRestoreConfirm} onClose={() => setShowRestoreConfirm(false)} onConfirm={() => restoreMutation.mutate()}
        loading={restoreMutation.isPending} title="Restore Database?"
        message={`This will completely overwrite the current database with the data from "${restoreFile?.name}". All current data will be permanently lost. Are you absolutely sure?`}
        confirmLabel="Yes, Restore Database" confirmVariant="danger"
      />
    </div>
  );
}
