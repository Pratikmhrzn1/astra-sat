import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { FileText, Pencil, Trash2 } from 'lucide-react';
import type { Passage, Question } from '@/features/content/api';
import { getSkills, skillLabel, skillsQueryKey } from '@/entities/skill';
import { SkillSelect } from '@/entities/skill';
import { iconButtonClass, surfaceClass } from '@/shared/ui';
import { cn } from '@/shared/lib/utils';

type QFilter = 'all' | 'ai_suggested' | 'untagged';

/** Every question in the set, filterable to the ones whose AI tag needs review. */
export function QuestionList({
  questions, passages, subject, editingId, onEdit, onDelete, onConfirmTag, onOverrideTag,
}: {
  questions: Question[];
  passages: Passage[];
  subject: 'english' | 'math';
  editingId: string | null;
  onEdit: (q: Question) => void;
  onDelete: (id: string) => void;
  onConfirmTag: (questionId: string) => void;
  onOverrideTag: (questionId: string, skillCode: string) => void;
}) {
  const [qFilter, setQFilter] = useState<QFilter>('all');

  const hasAiSuggested = questions.some((q) => q.subSkillSource === 'ai_suggested');
  const hasUntagged = questions.some((q) => !q.skillCode);
  const showFilter = hasAiSuggested || hasUntagged;
  const filtered = qFilter === 'ai_suggested'
    ? questions.filter((q) => q.subSkillSource === 'ai_suggested')
    : qFilter === 'untagged'
      ? questions.filter((q) => !q.skillCode)
      : questions;
  const labels: Record<QFilter, string> = { all: 'All', ai_suggested: 'AI Review', untagged: 'Untagged' };

  return (
    <div className={cn(surfaceClass, 'overflow-hidden')}>
      <div className="px-[22px] py-3.5 border-b border-border-soft flex items-center justify-between flex-wrap gap-2.5">
        <h3 className="text-sm font-semibold text-ink m-0">Questions Added ({questions.length})</h3>
        {showFilter && (
          <div className="flex gap-1.5">
            {(['all', ...(hasAiSuggested ? ['ai_suggested'] : []), ...(hasUntagged ? ['untagged'] : [])] as QFilter[]).map((f) => {
              const active = qFilter === f;
              return (
                <button
                  key={f}
                  onClick={() => setQFilter(f)}
                  className={cn(
                    'px-3 py-1 text-[11.5px] font-semibold rounded-full cursor-pointer',
                    active ? cn('text-white', f === 'ai_suggested' ? 'bg-gold' : 'bg-ink') : 'border border-border bg-sunken text-stone',
                  )}
                >
                  {f === 'ai_suggested' && '⚡ '}{labels[f]}
                  {f === 'ai_suggested' && !active && (
                    <span className="ml-[5px] bg-gold text-white rounded-full px-[5px] py-px text-[10px]">
                      {questions.filter((q) => q.subSkillSource === 'ai_suggested').length}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>
      {filtered.map((q) => (
        <QuestionRow
          key={q.id}
          q={q}
          index={questions.indexOf(q)}
          passages={passages}
          subject={subject}
          isEditing={editingId === q.id}
          onDelete={() => onDelete(q.id)}
          onEdit={() => onEdit(q)}
          onConfirm={q.subSkillSource === 'ai_suggested' ? () => onConfirmTag(q.id) : undefined}
          onOverride={q.subSkillSource === 'ai_suggested' ? (code) => onOverrideTag(q.id, code) : undefined}
        />
      ))}
    </div>
  );
}

const chip = 'text-[10.5px] px-[7px] py-0.5 rounded-[5px]';

function QuestionRow({ q, index, passages, subject, isEditing, onDelete, onEdit, onConfirm, onOverride }: {
  q: Question; index: number; passages: Passage[];
  subject: 'english' | 'math';
  isEditing?: boolean;
  onDelete: () => void;
  onEdit: () => void;
  onConfirm?: () => void;
  onOverride?: (skillCode: string) => void;
}) {
  const isMC = q.questionType === 'multiple_choice';
  const passage = passages.find((p) => p.id === q.passageId);
  const isAiSuggested = q.subSkillSource === 'ai_suggested';
  const { data: skillTree = [] } = useQuery({
    queryKey: skillsQueryKey(),
    queryFn: () => getSkills(),
    staleTime: 60 * 60 * 1000,
  });

  return (
    <div
      className={cn(
        'border-b border-sunken last:border-b-0',
        isEditing ? 'bg-ember/[.04] outline outline-2 outline-ember/25 -outline-offset-1' : isAiSuggested && 'bg-gold/[.03]',
      )}
    >
      <div className="flex items-start gap-3 px-[22px] py-3.5">
        <span className="w-6 h-6 rounded-[7px] bg-sunken flex items-center justify-center text-xs font-semibold text-subtle shrink-0 mt-0.5">{index + 1}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-[3px] flex-wrap">
            <span className={cn(chip, 'font-bold tracking-[0.06em] uppercase', isMC ? 'bg-[#EEF2FB] text-blue-sat' : 'bg-ember/[.08] text-accent-text')}>{isMC ? 'MC' : 'SPR'}</span>
            {q.skillCode && (
              <span className={cn(chip, 'font-semibold tracking-[0.04em]', isAiSuggested ? 'bg-gold/[.12] text-gold-dark border border-gold/30' : 'bg-[#F0ECE4] text-[#6B5F4A]')}>
                {isAiSuggested && '⚡ '}{skillLabel(skillTree, q.skillCode)}
              </span>
            )}
            {q.difficulty && (
              <span className={cn(chip, 'font-semibold tracking-[0.04em] bg-[#EEF2FB] text-blue-sat capitalize')}>
                {q.difficulty}
              </span>
            )}
            {passage && <span className="text-[11px] text-gold flex items-center gap-[3px]"><FileText size={11} />{passage.title || 'Passage'}</span>}
          </div>
          <p className="text-[13.5px] text-ink mt-0 mb-[3px] truncate">{q.questionText}</p>
          {isMC ? (
            <p className="text-xs text-green-sat m-0 font-semibold">Correct: {q.correctAnswer?.toUpperCase()}</p>
          ) : (
            <p className="text-xs text-accent-text m-0 font-semibold">Answer: {q.correctAnswerText}</p>
          )}
        </div>
        <div className="flex gap-0.5 shrink-0">
          <button
            onClick={onEdit}
            title="Edit question"
            className={isEditing ? 'p-1.5 rounded-[7px] bg-ember/10 cursor-pointer text-accent-text' : iconButtonClass('edit', 'p-1.5 rounded-[7px]')}
          ><Pencil size={14} /></button>
          <button onClick={onDelete} title="Delete question" className={iconButtonClass('danger', 'p-1.5 rounded-[7px]')}><Trash2 size={14} /></button>
        </div>
      </div>

      {/* AI review bar — only for ai_suggested questions */}
      {isAiSuggested && onConfirm && onOverride && (
        <div className="flex items-center gap-2.5 flex-wrap pt-2 pb-2.5 pr-[22px] pl-[60px] bg-gold/[.06] border-t border-gold/[.12]">
          <span className="text-[11px] text-gold-dark font-semibold">⚡ AI-suggested — review needed:</span>
          <button
            onClick={onConfirm}
            className="px-3 py-[3px] text-[11.5px] font-semibold rounded-md border border-green-sat/40 bg-green-sat/[.08] text-green-sat cursor-pointer"
          >✓ Confirm</button>
          {/* The full tree, so a Math suggestion is correctable — the old
              five-value list could not express a Math topic at all. */}
          <div className="min-w-[220px]">
            <SkillSelect
              subject={subject}
              value={null}
              onChange={(code) => { if (code) onOverride(code); }}
              className="h-7 text-[11.5px] rounded-md px-2"
            />
          </div>
        </div>
      )}
    </div>
  );
}
