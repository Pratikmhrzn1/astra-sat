import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { getAnalytics, startTopicExam } from '@/api/student';
import { getApiError } from '@/api/http';
import { useMobile } from '@/hooks/useMobile';
import { DomainPanel, ReadinessCard, TrendPanel } from '@/components/student/ProgressPanels';

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
    return <div style={{ padding: '64px 48px', textAlign: 'center', color: 'rgba(11,11,14,0.58)', fontSize: 14 }}>Loading…</div>;
  }

  const hasAnything = !!data && (data.trend.length > 0 || data.domains.length > 0);

  return (
    <div className="screen-fade" style={{ padding: isMobile ? '20px 16px 80px' : '36px 48px 64px', maxWidth: 900 }}>
      <h1 style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: isMobile ? 32 : 44, margin: '0 0 6px', letterSpacing: '-0.02em' }}>
        Progress
      </h1>
      <p style={{ fontSize: isMobile ? 14 : 15, color: 'rgba(11,11,14,0.64)', margin: '0 0 24px', maxWidth: 620, lineHeight: 1.6 }}>
        Where you stand, what's moving, and which topics are costing you the most.
      </p>

      {error && (
        <div style={{ background: 'rgba(192,57,43,0.06)', border: '1px solid rgba(192,57,43,0.2)', borderRadius: 12, padding: '10px 16px', marginBottom: 18, fontSize: 13.5, color: '#C0392B' }}>
          {error}
        </div>
      )}

      {!hasAnything ? (
        <div style={{ background: '#fff', border: '1px solid #E7E4DE', borderRadius: 16, padding: '48px 24px', textAlign: 'center' }}>
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 26, color: 'rgba(11,11,14,0.64)', marginBottom: 6 }}>
            Nothing to show yet
          </div>
          <p style={{ fontSize: 14, color: 'rgba(11,11,14,0.58)', margin: '0 auto 18px', maxWidth: 400, lineHeight: 1.6 }}>
            Sit a practice set or a full mock and this fills in — a score trend, and accuracy for every topic you've answered.
          </p>
          <button
            onClick={() => navigate('/student/exams')}
            style={{ height: 40, padding: '0 20px', border: 'none', borderRadius: 9999, background: '#C4471F', color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}
          >Start practising</button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
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
