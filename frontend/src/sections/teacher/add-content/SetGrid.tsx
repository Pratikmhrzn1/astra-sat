import { Trash2 } from 'lucide-react';
import type { QuestionSet } from '@/api/teacher';
import { SubjectBadge, iconButtonClass, surfaceClass } from '@/components/common';
import { cn } from '@/lib/utils';

export type SubjectFilter = 'all' | 'english' | 'math';

const tag = 'text-[10px] font-bold tracking-[0.08em] uppercase px-2 py-0.5 rounded-full';
const DIFFICULTY_TONE = {
  low: 'bg-green-sat/[.12] text-green-deep',
  medium: 'bg-gold/[.14] text-[#7A5C18]',
  hard: 'bg-danger/10 text-danger-dark',
} as const;

export function SubjectFilterPills({ value, onChange }: { value: SubjectFilter; onChange: (v: SubjectFilter) => void }) {
  return (
    <div className="flex gap-2 mb-5 flex-wrap">
      {([
        { value: 'all', label: 'All Sets', active: 'bg-ink' },
        { value: 'english', label: 'Reading & Writing', active: 'bg-blue-sat' },
        { value: 'math', label: 'Math', active: 'bg-gold' },
      ] as const).map((pill) => (
        <button
          key={pill.value}
          onClick={() => onChange(pill.value)}
          className={cn(
            'px-[18px] py-2 rounded-full text-[13.5px] font-semibold cursor-pointer transition-all duration-150',
            value === pill.value ? cn('text-white', pill.active) : 'border border-border bg-sunken text-subtle',
          )}
        >{pill.label}</button>
      ))}
    </div>
  );
}

/** The teacher's question sets as cards: open one to edit, or remove it. */
export function SetGrid({ sets, onOpen, onDelete }: { sets: QuestionSet[]; onOpen: (set: QuestionSet) => void; onDelete: (id: string) => void }) {
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(min(320px,100%),1fr))] gap-3.5">
      {sets.map((set) => (
        <div
          key={set.id}
          onClick={() => onOpen(set)}
          className={cn(surfaceClass, 'px-[22px] py-5 cursor-pointer transition-shadow duration-150 hover:shadow-[0_4px_16px_rgba(11,11,14,0.1)]')}
        >
          <div className="flex items-start justify-between gap-2.5">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 flex-wrap">
                <SubjectBadge subject={set.subject} />
                {set.difficulty && <span className={cn(tag, DIFFICULTY_TONE[set.difficulty])}>{set.difficulty}</span>}
                {set.isDraft && <span className={cn(tag, 'bg-danger/10 text-danger')}>DRAFT</span>}
                {set.isLiveExam && <span className={cn(tag, 'bg-blue-sat/10 text-[#1E5090]')}>LIVE</span>}
              </div>
              <p className="text-[15px] font-semibold text-ink mt-2 mb-[3px] truncate">{set.title}</p>
              {set.description && <p className="text-[12.5px] text-muted m-0 truncate">{set.description}</p>}
            </div>
            <button
              onClick={(e) => { e.stopPropagation(); onDelete(set.id); }}
              className={iconButtonClass('danger', 'p-1.5 shrink-0')}
            ><Trash2 size={14} /></button>
          </div>
        </div>
      ))}
    </div>
  );
}
