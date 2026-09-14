import { useCallback, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BookOpen, Plus, Upload } from 'lucide-react';
import {
  deleteQuestionSet, getQuestionSets, importQuestionSetFromJSON, type QuestionSet,
} from '@/api/teacher';
import { getApiError } from '@/api/http';
import { Button, ConfirmModal, ErrorBanner, InlineLoader, pageClass } from '@/components/common';
import { cn } from '@/lib/utils';
import { ContentHeader, type MainView } from '@/sections/teacher/add-content/ContentHeader';
import { JsonImportHelp } from '@/sections/teacher/add-content/JsonImportHelp';
import { NewSetForm } from '@/sections/teacher/add-content/NewSetForm';
import { SetEditor } from '@/sections/teacher/add-content/SetEditor';
import { SetGrid, SubjectFilterPills, type SubjectFilter } from '@/sections/teacher/add-content/SetGrid';
import { VocabBank } from '@/sections/teacher/add-content/VocabBank';

/**
 * The teacher's content manager: question sets (list → editor) and the vocab
 * bank. This page only decides which of those is on screen; each lives in
 * sections/teacher/add-content.
 */
export default function ContentManager() {
  const queryClient = useQueryClient();

  const [activeSet, setActiveSet] = useState<QuestionSet | null>(null);
  const [mainView, setMainView] = useState<MainView>('sets');
  const [showNewSet, setShowNewSet] = useState(false);
  const [showJsonHelp, setShowJsonHelp] = useState(false);
  const [subjectFilter, setSubjectFilter] = useState<SubjectFilter>('all');
  const [deleteSetId, setDeleteSetId] = useState<string | null>(null);

  // JSON import
  const [jsonImporting, setJsonImporting] = useState(false);
  const [jsonImportError, setJsonImportError] = useState('');
  const jsonFileRef = useRef<HTMLInputElement | null>(null);

  const { data: sets = [], isLoading: setsLoading } = useQuery({ queryKey: ['teacher', 'question-sets'], queryFn: getQuestionSets });

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
      const result = await importQuestionSetFromJSON(payload);
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
    mutationFn: (id: string) => deleteQuestionSet(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['teacher', 'question-sets'] });
      setDeleteSetId(null);
    },
    onError: (err) => alert(getApiError(err)),
  });

  if (activeSet) {
    return (
      <SetEditor
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
      <div className={pageClass}>
        <ContentHeader view={mainView} onView={setMainView} />
        <VocabBank />
      </div>
    );
  }

  return (
    <div className={pageClass}>
      <ContentHeader
        view={mainView}
        onView={setMainView}
        actions={
          <>
            <input ref={jsonFileRef} type="file" accept=".json,application/json" className="hidden" onChange={handleJsonUpload} />
            <button
              onClick={() => setShowJsonHelp((open) => !open)}
              title="What does the JSON file look like?"
              className={cn('w-8 h-8 rounded-full border border-border text-sm font-bold cursor-pointer', showJsonHelp ? 'bg-ink text-white' : 'bg-white text-subtle')}
            >?</button>
            <Button variant="secondary" onClick={() => { setJsonImportError(''); jsonFileRef.current?.click(); }} loading={jsonImporting}>
              <Upload size={15} className="mr-[7px]" />Upload JSON
            </Button>
            <Button onClick={() => setShowNewSet(true)}><Plus size={15} className="mr-[7px]" />New Question Set</Button>
          </>
        }
      />

      {showJsonHelp && <JsonImportHelp />}

      {jsonImportError && <ErrorBanner className="rounded-[10px]">{jsonImportError}</ErrorBanner>}

      {showNewSet && (
        <NewSetForm
          onCreated={(set) => { setShowNewSet(false); setActiveSet(set); }}
          onCancel={() => setShowNewSet(false)}
        />
      )}

      {!setsLoading && sets.length > 0 && <SubjectFilterPills value={subjectFilter} onChange={setSubjectFilter} />}

      {setsLoading ? (
        <InlineLoader />
      ) : sets.length === 0 && !showNewSet ? (
        <div className="text-center pt-20">
          <BookOpen size={52} className="text-ink/[.18] mx-auto mb-4 block" />
          <p className="text-muted text-[15px] mb-5">No question sets yet.</p>
          <Button onClick={() => setShowNewSet(true)}><Plus size={15} className="mr-[7px]" />Create your first set</Button>
        </div>
      ) : (
        <SetGrid
          sets={sets.filter((s) => subjectFilter === 'all' || s.subject === subjectFilter)}
          onOpen={setActiveSet}
          onDelete={setDeleteSetId}
        />
      )}

      <ConfirmModal
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
