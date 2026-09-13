import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  getMistakes, getMistakeSummary, startMistakePractice, type Mistake,
} from '@/features/student/api/student.api';
import { getSkills, skillLabel, skillsQueryKey } from '@/shared/api/skills';
import { getApiError } from '@/shared/api/client';
import { useMobile } from '@/shared/hooks/useMobile';
import { formatDate } from '@/shared/lib/utils';

/**
 * The mistake bank: a worklist of every question this student has got wrong.
 *
 * Grouped by domain rather than listed flat, because "you have missed 14
 * questions" is discouraging and "9 of them are Algebra" is actionable. The
 * practise button turns any slice of it into a real exam, which is what makes
 * the list drain rather than just accumulate.
 */

const CARD: React.CSSProperties = {
  background: '#fff', border: '1px solid #E7E4DE', borderRadius: 16,
  boxShadow: '0 1px 3px rgba(11,11,14,0.05)',
};

type SubjectFilter = 'all' | 'english' | 'math';
type StatusFilter = 'open' | 'resolved';

export default function Mistakes() {
  const navigate = useNavigate();
  const isMobile = useMobile();
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
    <button
      key={label}
      onClick={onClick}
      style={{
        padding: '5px 14px', fontSize: 12.5, fontWeight: 600, borderRadius: 9999,
        border: active ? 'none' : '1px solid #E7E4DE', background: active ? '#0B0B0E' : '#F2F0EC',
        color: active ? '#fff' : '#6F6B64', cursor: 'pointer', fontFamily: 'inherit',
      }}
    >{label}</button>
  );

  return (
    <div className="screen-fade" style={{ padding: isMobile ? '20px 16px 80px' : '36px 48px 64px' }}>
      <h1 style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: isMobile ? 32 : 44, margin: '0 0 6px', letterSpacing: '-0.02em' }}>
        Mistake Bank
      </h1>
      <p style={{ fontSize: isMobile ? 14 : 15, color: 'rgba(11,11,14,0.64)', margin: '0 0 20px' }}>
        Every question you've missed, worst first. Answer one correctly and it clears itself.
      </p>

      {error && (
        <div style={{ background: 'rgba(192,57,43,0.06)', border: '1px solid rgba(192,57,43,0.2)', borderRadius: 10, padding: '10px 16px', marginBottom: 16, fontSize: 13.5, color: '#C0392B' }}>
          {error}
        </div>
      )}

      {/* Headline + practise-everything */}
      <div style={{ ...CARD, padding: isMobile ? '18px 20px' : '22px 24px', marginBottom: 18, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(11,11,14,0.58)' }}>Still open</div>
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: isMobile ? 40 : 50, lineHeight: 1, color: totalOpen > 0 ? '#C47A1B' : '#1A6B3C' }}>{totalOpen}</div>
        </div>
        {totalOpen > 0 && (
          <button
            onClick={() => { setError(''); practiceMutation.mutate(subject === 'all' ? {} : { subject }); }}
            disabled={practiceMutation.isPending}
            style={{ height: 42, padding: '0 22px', border: 'none', borderRadius: 9999, background: '#C4471F', color: '#fff', fontSize: 14, fontWeight: 600, cursor: practiceMutation.isPending ? 'default' : 'pointer', opacity: practiceMutation.isPending ? 0.6 : 1, fontFamily: 'inherit' }}
          >
            {practiceMutation.isPending ? 'Building…' : `Practise these (${Math.min(totalOpen, 20)})`}
          </button>
        )}
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 18, flexWrap: 'wrap' }}>
        {chip('All subjects', subject === 'all', () => setSubject('all'))}
        {chip('Reading & Writing', subject === 'english', () => setSubject('english'))}
        {chip('Math', subject === 'math', () => setSubject('math'))}
        <span style={{ width: 1, background: '#E7E4DE', margin: '0 4px' }} />
        {chip('Open', status === 'open', () => setStatus('open'))}
        {chip('Resolved', status === 'resolved', () => setStatus('resolved'))}
      </div>

      {isLoading ? (
        <div style={{ ...CARD, padding: '40px 22px', textAlign: 'center', color: 'rgba(11,11,14,0.58)', fontSize: 14 }}>Loading…</div>
      ) : ordered.length === 0 ? (
        <div style={{ ...CARD, padding: '48px 22px', textAlign: 'center' }}>
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 26, color: 'rgba(11,11,14,0.64)', marginBottom: 6 }}>
            {status === 'open' ? 'Nothing to review' : 'Nothing resolved yet'}
          </div>
          <p style={{ fontSize: 14, color: 'rgba(11,11,14,0.58)', margin: 0 }}>
            {status === 'open'
              ? 'Questions you miss on an exam land here automatically.'
              : 'Clear an open mistake by answering it correctly in a review.'}
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {ordered.map(([domainCode, rows]) => (
            <div key={domainCode} style={{ ...CARD, overflow: 'hidden' }}>
              <div style={{ padding: '14px 20px', borderBottom: '1px solid #EEEBE5', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 15, fontWeight: 600 }}>
                  {domainCode === 'untagged' ? 'Untagged' : skillLabel(skillTree, domainCode)}
                </span>
                <span style={{ fontSize: 12.5, color: 'rgba(11,11,14,0.58)', fontFamily: 'var(--font-mono)' }}>
                  {rows.length} question{rows.length === 1 ? '' : 's'}
                </span>
                {status === 'open' && domainCode !== 'untagged' && (
                  <button
                    onClick={() => { setError(''); practiceMutation.mutate({ skillCode: rows[0].skillCode ?? undefined }); }}
                    disabled={practiceMutation.isPending}
                    style={{ marginLeft: 'auto', height: 32, padding: '0 14px', border: '1px solid #E7E4DE', borderRadius: 9999, background: '#fff', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', color: '#0B0B0E' }}
                  >Practise these</button>
                )}
              </div>

              {rows.map((mistake, i) => {
                const open = !!expanded[mistake.questionId];
                return (
                  <div key={mistake.questionId} style={{ borderBottom: i < rows.length - 1 ? '1px solid #F2F0EC' : 'none' }}>
                    <button
                      onClick={() => setExpanded((prev) => ({ ...prev, [mistake.questionId]: !prev[mistake.questionId] }))}
                      style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '13px 20px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit' }}
                    >
                      <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 9999, background: mistake.missCount > 1 ? 'rgba(192,57,43,0.1)' : '#F2F0EC', color: mistake.missCount > 1 ? '#C0392B' : '#6F6B64', flexShrink: 0 }}>
                        ×{mistake.missCount}
                      </span>
                      <span style={{ flex: 1, minWidth: 0, fontSize: 13.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {mistake.questionText}
                      </span>
                      {mistake.skillLabel && !isMobile && (
                        <span style={{ fontSize: 11, color: 'rgba(11,11,14,0.58)', flexShrink: 0 }}>{mistake.skillLabel}</span>
                      )}
                      {mistake.resolvedAt && (
                        <span style={{ fontSize: 11, fontWeight: 600, color: '#2E7D5A', flexShrink: 0 }}>✓ resolved</span>
                      )}
                    </button>

                    {open && (
                      <div style={{ padding: '0 20px 16px', fontSize: 13.5, lineHeight: 1.6 }}>
                        <p style={{ margin: '0 0 10px', color: '#0B0B0E' }}>{mistake.questionText}</p>
                        {mistake.questionType === 'multiple_choice' ? (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 10 }}>
                            {(['a', 'b', 'c', 'd'] as const).map((key) => {
                              const text = mistake[`option${key.toUpperCase()}` as 'optionA'];
                              if (!text) return null;
                              const isAnswer = mistake.correctAnswer === key;
                              return (
                                <div key={key} style={{ padding: '5px 10px', borderRadius: 8, background: isAnswer ? 'rgba(46,125,90,0.08)' : 'transparent', color: isAnswer ? '#1A6B3C' : 'rgba(11,11,14,0.6)', fontWeight: isAnswer ? 600 : 400 }}>
                                  {key.toUpperCase()}. {text}{isAnswer && ' ✓'}
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          <p style={{ margin: '0 0 10px', color: '#1A6B3C', fontWeight: 600 }}>Answer: {mistake.correctAnswerText}</p>
                        )}
                        {mistake.explanation && (
                          <p style={{ margin: '0 0 8px', color: 'rgba(11,11,14,0.65)' }}>{mistake.explanation}</p>
                        )}
                        <p style={{ margin: 0, fontSize: 12, color: 'rgba(11,11,14,0.58)' }}>
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
