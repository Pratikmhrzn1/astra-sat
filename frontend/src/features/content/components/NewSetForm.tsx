import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createQuestionSet, type QuestionSet } from '@/features/content/api';
import { getApiError } from '@/shared/api/http';
import { Button, Input, Textarea, surfaceClass } from '@/shared/ui';
import { cn } from '@/shared/lib/utils';

const DIFFICULTIES = [
  { value: '', label: 'Unset', active: 'bg-ink text-white' },
  { value: 'low', label: 'Low', active: 'bg-green-sat/15 text-green-deep' },
  { value: 'medium', label: 'Medium', active: 'bg-gold/15 text-[#7A5C18]' },
  { value: 'hard', label: 'Hard', active: 'bg-danger/10 text-danger-dark' },
] as const;

/** Creates a question set and hands it back so the editor can open on it. */
export function NewSetForm({ onCreated, onCancel }: { onCreated: (set: QuestionSet) => void; onCancel: () => void }) {
  const queryClient = useQueryClient();
  const [title, setTitle] = useState('');
  const [subject, setSubject] = useState<'english' | 'math'>('english');
  const [desc, setDesc] = useState('');
  const [difficulty, setDifficulty] = useState<'low' | 'medium' | 'hard' | ''>('');
  const [isLiveExam, setIsLiveExam] = useState(false);
  const [error, setError] = useState('');

  const createSetMutation = useMutation({
    mutationFn: () => createQuestionSet({ title: title.trim(), subject, description: desc.trim(), difficulty: difficulty || null, isLiveExam }),
    onSuccess: (set) => {
      queryClient.invalidateQueries({ queryKey: ['teacher', 'question-sets'] });
      setTitle(''); setDesc(''); setDifficulty(''); setIsLiveExam(false); setError('');
      onCreated(set);
    },
    onError: (err) => setError(getApiError(err)),
  });

  return (
    <div className={cn(surfaceClass, 'mb-6 overflow-hidden')}>
      <div className="px-6 py-4 border-b border-border-soft">
        <h3 className="text-base font-semibold text-ink m-0">Create Question Set</h3>
      </div>
      <div className="px-6 py-5 flex flex-col gap-4">
        <Input label="Title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. SAT Reading Practice — Passage 1" />
        <div>
          <p className="text-[13px] font-semibold text-subtle mb-2">Subject</p>
          <div className="flex gap-2.5 flex-wrap">
            {(['english', 'math'] as const).map((s) => (
              <button
                key={s}
                onClick={() => setSubject(s)}
                className={cn(
                  'px-[22px] py-[9px] rounded-full text-sm font-semibold cursor-pointer',
                  subject === s ? cn('text-white', s === 'english' ? 'bg-blue-sat' : 'bg-gold') : 'border border-border bg-sunken text-stone',
                )}
              >{s === 'english' ? '📖 Reading & Writing' : '∫ Math'}</button>
            ))}
          </div>
        </div>
        <div>
          <p className="text-[13px] font-semibold text-subtle mb-2">Difficulty <span className="font-normal text-muted">(optional — used for mock test adaptive selection)</span></p>
          <div className="flex gap-2 flex-wrap">
            {DIFFICULTIES.map(({ value, label, active }) => (
              <button
                key={value}
                type="button"
                onClick={() => setDifficulty(value)}
                className={cn(
                  'px-[18px] py-2 rounded-full text-[13.5px] font-semibold cursor-pointer transition-all duration-150',
                  difficulty === value ? cn('border-[1.5px] border-current', active) : 'border border-border bg-sunken text-stone',
                )}
              >{label}</button>
            ))}
          </div>
        </div>
        <Textarea label="Description (optional)" value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Brief description…" rows={2} />
        <label className="flex items-center gap-2.5 cursor-pointer select-none flex-wrap">
          <div
            onClick={() => setIsLiveExam((v) => !v)}
            className={cn('w-10 h-[22px] rounded-[11px] relative shrink-0 transition-colors duration-200 cursor-pointer', isLiveExam ? 'bg-ink' : 'bg-[#D1CEC8]')}
          >
            <div className={cn('absolute top-[3px] w-4 h-4 rounded-full bg-white transition-[left] duration-200 shadow-[0_1px_3px_rgba(0,0,0,0.2)]', isLiveExam ? 'left-[21px]' : 'left-[3px]')} />
          </div>
          <span className="text-[13.5px] font-semibold text-ink">Live Exam Set</span>
          <span className="text-xs text-[#888]">Students won't see this in their normal practice</span>
        </label>
        {error && <p className="text-danger text-[13px]">{error}</p>}
        <div className="flex gap-2.5 flex-wrap">
          <Button onClick={() => { setError(''); createSetMutation.mutate(); }} loading={createSetMutation.isPending} disabled={!title.trim()}>Create & Add Questions</Button>
          <Button variant="secondary" onClick={() => { onCancel(); setError(''); }}>Cancel</Button>
        </div>
      </div>
    </div>
  );
}
