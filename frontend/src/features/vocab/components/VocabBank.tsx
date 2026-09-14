import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2 } from 'lucide-react';
import { createTeacherVocabWord, deleteTeacherVocabWord, getTeacherVocabWords, type TeacherVocabWord } from '@/features/vocab/api';
import { Button, Input, Spinner, Textarea, surfaceClass } from '@/shared/ui';
import { cn } from '@/shared/lib/utils';

/** The teacher's own vocab words, which feed students' spaced-repetition deck. */
export function VocabBank() {
  const queryClient = useQueryClient();
  const [vocabForm, setVocabForm] = useState({ word: '', definition: '', exampleSentence: '' });
  const [vocabFormError, setVocabFormError] = useState('');
  const { data: vocabWords = [], isLoading: vocabLoading } = useQuery({ queryKey: ['teacher', 'vocab-words'], queryFn: getTeacherVocabWords });

  const addVocabMutation = useMutation({
    mutationFn: createTeacherVocabWord,
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['teacher', 'vocab-words'] }); setVocabForm({ word: '', definition: '', exampleSentence: '' }); setVocabFormError(''); },
    onError: () => setVocabFormError('Failed to add word. Please try again.'),
  });
  const deleteVocabMutation = useMutation({
    mutationFn: deleteTeacherVocabWord,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['teacher', 'vocab-words'] }),
  });

  const handleAddVocab = (e: React.FormEvent) => {
    e.preventDefault();
    if (!vocabForm.word.trim()) { setVocabFormError('Word is required.'); return; }
    if (!vocabForm.definition.trim()) { setVocabFormError('Definition is required.'); return; }
    addVocabMutation.mutate({ word: vocabForm.word.trim(), definition: vocabForm.definition.trim(), exampleSentence: vocabForm.exampleSentence.trim() });
  };

  return (
    <>
      <div className={cn(surfaceClass, 'px-5 py-6 sm:px-7 mb-7')}>
        <h3 className="text-[15px] font-bold mt-0 mb-4">Add Vocab Word</h3>
        <form onSubmit={handleAddVocab} className="flex flex-col gap-3">
          <Input label="Word" value={vocabForm.word} onChange={(e) => setVocabForm((f) => ({ ...f, word: e.target.value }))} placeholder="e.g. ephemeral" />
          <Textarea label="Definition" value={vocabForm.definition} onChange={(e) => setVocabForm((f) => ({ ...f, definition: e.target.value }))} placeholder="Lasting for a very short time." rows={2} />
          <Textarea label="Example Sentence (optional)" value={vocabForm.exampleSentence} onChange={(e) => setVocabForm((f) => ({ ...f, exampleSentence: e.target.value }))} placeholder="The ephemeral beauty of cherry blossoms makes them all the more precious." rows={2} />
          {vocabFormError && <p className="text-[13px] text-danger m-0">{vocabFormError}</p>}
          <div>
            <Button type="submit" loading={addVocabMutation.isPending}><Plus size={14} className="mr-1.5" />Add Word</Button>
          </div>
        </form>
      </div>

      {vocabLoading ? (
        <div className="text-center p-10"><Spinner /></div>
      ) : vocabWords.length === 0 ? (
        <div className={cn(surfaceClass, 'px-6 py-10 text-center text-muted text-sm')}>No vocab words yet. Add one above.</div>
      ) : (
        <div className={cn(surfaceClass, 'overflow-hidden')}>
          {vocabWords.map((w: TeacherVocabWord) => (
            <div key={w.id} className="flex items-start gap-4 px-6 py-4 border-b border-sunken last:border-b-0">
              <div className="flex-1 min-w-0">
                <div className="font-bold text-[15px] text-ink mb-0.5">{w.word}</div>
                <div className={cn('text-[13.5px] text-body', w.exampleSentence && 'mb-1')}>{w.definition}</div>
                {w.exampleSentence && <div className="text-[12.5px] text-muted italic">"{w.exampleSentence}"</div>}
              </div>
              <button
                onClick={() => deleteVocabMutation.mutate(w.id)}
                className="shrink-0 bg-transparent cursor-pointer text-muted p-1 mt-0.5"
                title="Delete word"
              >
                <Trash2 size={15} />
              </button>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
