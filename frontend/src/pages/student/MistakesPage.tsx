import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  getMistakes, getMistakeSummary, startMistakePractice, type Mistake,
} from '@/api/student';
import { getSkills, skillLabel, skillsQueryKey } from '@/api/skills';
import { getApiError } from '@/api/http';
import { PageHeader, ErrorBanner, NoteCard, EmptyState, chipClass, surfaceClass, kickerClass, pageClass } from '@/components/common';
import { cn, formatDate } from '@/lib/utils';

/**
 * The mistake bank: a worklist of every question this student has got wrong.
 *
 * Grouped by domain rather than listed flat, because "you have missed 14
 * questions" is discouraging and "9 of them are Algebra" is actionable. The
 * practise button turns any slice of it into a real exam, which is what makes
 * the list drain rather than just accumulate.
 */

type SubjectFilter = 'all' | 'english' | 'math';
type StatusFilter = 'open' | 'resolved';

export default function Mistakes() {
  const navigate = useNavigate();
  const [subject, setSubject] = useState<SubjectFilter>('all');
  const [status, setStatus] = useState<StatusFilter>('open');
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [error, setError] = useState('');

  const filters = {
    ...(subject === 'all' ? {} : { subject }),
    status,
  } as const;

  const { data: mistakes = [], isLoading } = useQuery({
    queryKey: ['student', 'mistakes', filters],
    queryFn: () => getMistakes(filters),
  });
  const { data: summary = [] } = useQuery({
    queryKey: ['student', 'mistakes', 'summary'],
    queryFn: getMistakeSummary,
  });
  const { data: skillTree = [] } = useQuery({
    queryKey: skillsQueryKey(),
    queryFn: () => getSkills(),
    staleTime: 60 * 60 * 1000,
  });

  const practiceMutation = useMutation({
    mutationFn: (payload: { subject?: 'english' | 'math'; skillCode?: string }) =>
      startMistakePractice({ ...payload, limit: 20 }),
    // Straight into the player. Resolution happens through the normal submit
    // path, so nothing here has to know about resolving.
    onSuccess: (data) =>
      navigate(`/student/exams/${data.exam.id}`, {
        state: { timerEnabled: false, examTitle: 'Mistake review' },
      }),
    onError: (err) => setError(getApiError(err)),
  });

  // Grouped by domain, biggest group first — where the practice is worth most.
  const groups = new Map<string, Mistake[]>();
  for (const mistake of mistakes) {
    const key = mistake.domainCode ?? 'untagged';
    groups.set(key, [...(groups.get(key) ?? []), mistake]);
  }
  const ordered = [...groups.entries()].sort((a, b) => b[1].length - a[1].length);

  const totalOpen = summary.reduce((sum, row) => sum + row.openCount, 0);

  const chip = (label: string, active: boolean, onClick: () => void) => (
    <button key={label} onClick={onClick} className={chipClass(active)}>{label}</button>
  );

  return (
    <div className={pageClass}>
      <PageHeader
        title="Mistake Bank"
        subtitle="Every question you've missed, worst first. Answer one correctly and it clears itself."
      />

      {error && <ErrorBanner className="rounded-[10px]">{error}</ErrorBanner>}

      {/* Headline + practise-everything */}
      <div className={cn(surfaceClass, 'px-5 py-[18px] sm:px-6 sm:py-[22px] mb-[18px] flex items-center justify-between gap-4 flex-wrap')}>
        <div>
          <div className={cn(kickerClass, 'tracking-[0.1em]')}>Still open</div>
          <div className={cn('font-display font-semibold text-[40px] sm:text-[50px] leading-none', totalOpen > 0 ? 'text-amber-sat' : 'text-green-dark')}>{totalOpen}</div>
        </div>
        {totalOpen > 0 && (
          <button
            onClick={() => { setError(''); practiceMutation.mutate(subject === 'all' ? {} : { subject }); }}
            disabled={practiceMutation.isPending}
            className="h-[42px] px-[22px] rounded-full bg-accent-text text-white text-sm font-semibold cursor-pointer disabled:cursor-default disabled:opacity-60"
          >
            {practiceMutation.isPending ? 'Building…' : `Practise these (${Math.min(totalOpen, 20)})`}
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="flex gap-2 mb-[18px] flex-wrap">
        {chip('All subjects', subject === 'all', () => setSubject('all'))}
        {chip('Reading & Writing', subject === 'english', () => setSubject('english'))}
        {chip('Math', subject === 'math', () => setSubject('math'))}
        <span className="w-px bg-border mx-1" />
        {chip('Open', status === 'open', () => setStatus('open'))}
        {chip('Resolved', status === 'resolved', () => setStatus('resolved'))}
      </div>

      {isLoading ? (
        <NoteCard>Loading…</NoteCard>
      ) : ordered.length === 0 ? (
        <EmptyState title={status === 'open' ? 'Nothing to review' : 'Nothing resolved yet'}>
          {status === 'open'
            ? 'Questions you miss on an exam land here automatically.'
            : 'Clear an open mistake by answering it correctly in a review.'}
        </EmptyState>
      ) : (
        <div className="flex flex-col gap-3.5">
          {ordered.map(([domainCode, rows]) => (
            <div key={domainCode} className={cn(surfaceClass, 'overflow-hidden')}>
              <div className="px-5 py-3.5 border-b border-border-soft flex items-center gap-3 flex-wrap">
                <span className="text-[15px] font-semibold">
                  {domainCode === 'untagged' ? 'Untagged' : skillLabel(skillTree, domainCode)}
                </span>
                <span className="text-[12.5px] text-muted font-mono">
                  {rows.length} question{rows.length === 1 ? '' : 's'}
                </span>
                {status === 'open' && domainCode !== 'untagged' && (
                  <button
                    onClick={() => { setError(''); practiceMutation.mutate({ skillCode: rows[0].skillCode ?? undefined }); }}
                    disabled={practiceMutation.isPending}
                    className="ml-auto h-8 px-3.5 border border-border rounded-full bg-white text-[12.5px] font-semibold cursor-pointer text-ink"
                  >Practise these</button>
                )}
              </div>

              {rows.map((mistake) => {
                const open = !!expanded[mistake.questionId];
                return (
                  <div key={mistake.questionId} className="border-b border-sunken last:border-b-0">
                    <button
                      onClick={() => setExpanded((prev) => ({ ...prev, [mistake.questionId]: !prev[mistake.questionId] }))}
                      className="w-full flex items-center gap-3 px-5 py-[13px] bg-transparent cursor-pointer text-left"
                    >
                      <span className={cn('text-[11px] font-bold px-2 py-0.5 rounded-full shrink-0', mistake.missCount > 1 ? 'bg-danger/10 text-danger' : 'bg-sunken text-stone')}>
                        ×{mistake.missCount}
                      </span>
                      <span className="flex-1 min-w-0 text-[13.5px] truncate">
                        {mistake.questionText}
                      </span>
                      {mistake.skillLabel && (
                        <span className="hidden sm:inline text-[11px] text-muted shrink-0">{mistake.skillLabel}</span>
                      )}
                      {mistake.resolvedAt && (
                        <span className="text-[11px] font-semibold text-green-sat shrink-0">✓ resolved</span>
                      )}
                    </button>

                    {open && (
                      <div className="px-5 pb-4 text-[13.5px] leading-[1.6]">
                        <p className="mt-0 mb-2.5 text-ink">{mistake.questionText}</p>
                        {mistake.questionType === 'multiple_choice' ? (
                          <div className="flex flex-col gap-1 mb-2.5">
                            {(['a', 'b', 'c', 'd'] as const).map((key) => {
                              const text = mistake[`option${key.toUpperCase()}` as 'optionA'];
                              if (!text) return null;
                              const isAnswer = mistake.correctAnswer === key;
                              return (
                                <div key={key} className={cn('px-2.5 py-[5px] rounded-lg', isAnswer ? 'bg-green-sat/[.08] text-green-dark font-semibold' : 'bg-transparent text-ink/60')}>
                                  {key.toUpperCase()}. {text}{isAnswer && ' ✓'}
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          <p className="mt-0 mb-2.5 text-green-dark font-semibold">Answer: {mistake.correctAnswerText}</p>
                        )}
                        {mistake.explanation && (
                          <p className="mt-0 mb-2 text-subtle">{mistake.explanation}</p>
                        )}
                        <p className="m-0 text-xs text-muted">
                          First missed {formatDate(mistake.firstMissedAt)} · last {formatDate(mistake.lastMissedAt)}
                          {mistake.resolvedAt && ` · resolved ${formatDate(mistake.resolvedAt)}`}
                        </p>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
