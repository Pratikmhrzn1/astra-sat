import { useCallback, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BookOpen, Plus, Upload } from 'lucide-react';
import { removeQuestionSet, fetchAuthoringBundles, ingestQuestionSetFromJSON, type AuthoringBundle } from '@/features/content/api';
import { fetchApiError } from '@/shared/api/http';
import { Control, AcknowledgeDialog, ErrorNotice, InlineSpinner, screenStyle } from '@/shared/ui';
import { classes } from '@/shared/lib/utils';
import { AuthoringMasthead, type PrimaryPane } from '@/features/content/components/ContentHeader';
import { JsonIngestHelp } from '@/features/content/components/JsonImportHelp';
import { NewBundleSheet } from '@/features/content/components/NewSetForm';
import { BundleComposer } from '@/features/content/components/SetEditor';
import { BundleGrid, SubjectScopePills, type SubjectScope } from '@/features/content/components/SetGrid';
import { LexiconBank } from '@/features/vocab';

/**
 * The teacher's content manager: question sets (list → editor) and the vocab
 * bank. This page only decides which of those is on screen; each lives in
 * sections/teacher/add-content.
 */
export default function AuthoringManager() {
  const queryClient = useQueryClient();

  const [activeSet, setActiveSet] = useState<AuthoringBundle | null>(null);
  const [mainView, setMainView] = useState<PrimaryPane>('sets');
  const [showNewSet, setShowNewSet] = useState(false);
  const [showJsonHelp, setShowJsonHelp] = useState(false);
  const [subjectFilter, setSubjectFilter] = useState<SubjectScope>('all');
  const [deleteSetId, setDeleteSetId] = useState<string | null>(null);

  // JSON import
  const [jsonImporting, setJsonImporting] = useState(false);
  const [jsonImportError, setJsonImportError] = useState('');
  const jsonFileRef = useRef<HTMLInputElement | null>(null);

  const { data: sets = [], isLoading: setsLoading } = useQuery({ queryKey: ['teacher', 'question-sets'], queryFn: fetchAuthoringBundles });

  const handleJsonUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    setJsonImportError('');
    setJsonImporting(true);
    try {
      const text = await file.text();
      const payload = JSON.parse(text);
      if (!payload.title || !payload.subject || !Array.isArray(payload.questions)) {
        throw new Error('JSON must include "title", "subject", and "questions" array.');
      }
      const result = await ingestQuestionSetFromJSON(payload);
      queryClient.invalidateQueries({ queryKey: ['teacher', 'question-sets'] });
      setActiveSet(result.set);
    } catch (err: unknown) {
      const msg = err instanceof SyntaxError ? 'Invalid JSON file.' : (err as Error).message ?? 'Import failed.';
      setJsonImportError(msg);
    } finally {
      setJsonImporting(false);
    }
  }, [queryClient]);

  const deleteSetMutation = useMutation({
    mutationFn: (id: string) => removeQuestionSet(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['teacher', 'question-sets'] });
      setDeleteSetId(null);
    },
    onError: (err) => alert(fetchApiError(err)),
  });

  if (activeSet) {
    return (
      <BundleComposer
        // Keyed by set, so opening another set starts from a clean form.
        key={activeSet.id}
        activeSet={activeSet}
        onActiveSetChange={setActiveSet}
        onExit={() => setActiveSet(null)}
      />
    );
  }

  if (mainView === 'vocab') {
    return (
      <div className={screenStyle}>
        <AuthoringMasthead view={mainView} onView={setMainView} />
        <LexiconBank />
      </div>
    );
  }

  return (
    <div className={screenStyle}>
      <AuthoringMasthead
        view={mainView}
        onView={setMainView}
        actions={
          <>
            <input ref={jsonFileRef} type="file" accept=".json,application/json" className="hidden" onChange={handleJsonUpload} />
            <button
              onClick={() => setShowJsonHelp((open) => !open)}
              title="What does the JSON file look like?"
              className={classes('w-8 h-8 rounded-full border border-border text-sm font-bold cursor-pointer', showJsonHelp ? 'bg-ink text-white' : 'bg-white text-subtle')}
            >?</button>
            <Control variant="secondary" onClick={() => { setJsonImportError(''); jsonFileRef.current?.click(); }} loading={jsonImporting}>
              <Upload size={15} className="mr-[7px]" />Upload JSON
            </Control>
            <Control onClick={() => setShowNewSet(true)}><Plus size={15} className="mr-[7px]" />New Question Set</Control>
          </>
        }
      />

      {showJsonHelp && <JsonIngestHelp />}

      {jsonImportError && <ErrorNotice className="rounded-[10px]">{jsonImportError}</ErrorNotice>}

      {showNewSet && (
        <NewBundleSheet
          onCreated={(set) => { setShowNewSet(false); setActiveSet(set); }}
          onCancel={() => setShowNewSet(false)}
        />
      )}

      {!setsLoading && sets.length > 0 && <SubjectScopePills value={subjectFilter} onChange={setSubjectFilter} />}

      {setsLoading ? (
        <InlineSpinner />
      ) : sets.length === 0 && !showNewSet ? (
        <div className="text-center pt-20">
          <BookOpen size={52} className="text-ink/[.18] mx-auto mb-4 block" />
          <p className="text-muted text-[15px] mb-5">No question sets yet.</p>
          <Control onClick={() => setShowNewSet(true)}><Plus size={15} className="mr-[7px]" />Create your first set</Control>
        </div>
      ) : (
        <BundleGrid
          sets={sets.filter((s) => subjectFilter === 'all' || s.subject === subjectFilter)}
          onOpen={setActiveSet}
          onDelete={setDeleteSetId}
        />
      )}

      <AcknowledgeDialog
        isOpen={!!deleteSetId}
        onClose={() => setDeleteSetId(null)}
        onConfirm={() => deleteSetMutation.mutate(deleteSetId!)}
        loading={deleteSetMutation.isPending}
        title="Remove this question set?"
        message="Students will no longer see it. If anyone has already taken it, it is archived instead of deleted, so their results and scores are kept."
        confirmLabel="Remove set"
      />
    </div>
  );
}
