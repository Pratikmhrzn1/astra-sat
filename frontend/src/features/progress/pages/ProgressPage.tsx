import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { getAnalytics } from '@/features/progress/api';
import { startTopicExam } from '@/features/practice';
import { getApiError } from '@/shared/api/http';
import { useMobile } from '@/shared/hooks/useMobile';
import { DomainPanel, ReadinessCard, TrendPanel } from '@/features/progress/components/ProgressPanels';
import { pageClass } from '@/shared/ui';
import { cn } from '@/shared/lib/utils';

/**
 * Progress: where a student stands, what is going up, and what to work on.
 *
 * The whole page is arranged around the diagnose-then-practise loop — every
 * topic row is a button that builds an exam from that topic, so the answer to
 * "what should I do about this" is one click away from the finding.
 */
export default function Progress() {
  const navigate = useNavigate();
  const isMobile = useMobile();
  const [error, setError] = useState('');

  const { data, isLoading } = useQuery({ queryKey: ['student', 'analytics'], queryFn: getAnalytics });

  const topicMutation = useMutation({
    mutationFn: startTopicExam,
    onSuccess: (result) =>
      navigate(`/student/exams/${result.exam.id}`, {
        state: { timerEnabled: false, examTitle: `Topic: ${result.skill.label}` },
      }),
    onError: (err) => setError(getApiError(err)),
  });

  if (isLoading) {
    return <div className="px-12 py-16 text-center text-muted text-sm">Loading…</div>;
  }

  const hasAnything = !!data && (data.trend.length > 0 || data.domains.length > 0);

  return (
    <div className={cn(pageClass, 'max-w-[900px]')}>
      <h1 className="font-display font-semibold text-[32px] sm:text-[44px] mt-0 mb-1.5 tracking-[-0.02em]">
        Progress
      </h1>
      <p className="text-sm sm:text-[15px] text-subtle mt-0 mb-6 max-w-[620px] leading-[1.6]">
        Where you stand, what's moving, and which topics are costing you the most.
      </p>

      {error && (
        <div className="bg-danger/[.06] border border-danger/20 rounded-xl px-4 py-2.5 mb-[18px] text-[13.5px] text-danger">
          {error}
        </div>
      )}

      {!hasAnything ? (
        <div className="bg-white border border-border rounded-2xl px-6 py-12 text-center">
          <div className="font-display font-semibold text-[26px] text-subtle mb-1.5">
            Nothing to show yet
          </div>
          <p className="text-sm text-muted mx-auto mt-0 mb-[18px] max-w-[400px] leading-[1.6]">
            Sit a practice set or a full mock and this fills in — a score trend, and accuracy for every topic you've answered.
          </p>
          <button
            onClick={() => navigate('/student/exams')}
            className="h-10 px-5 rounded-full bg-accent-text text-white text-sm font-semibold cursor-pointer"
          >Start practising</button>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <ReadinessCard readiness={data!.readiness} isMobile={isMobile} />
          <TrendPanel trend={data!.trend} isMobile={isMobile} />
          <DomainPanel
            overview={data!}
            isMobile={isMobile}
            onPractise={(domainCode, subject) => {
              setError('');
              topicMutation.mutate({ subject, skillCode: domainCode, count: 10 });
            }}
          />
        </div>
      )}
    </div>
  );
}
