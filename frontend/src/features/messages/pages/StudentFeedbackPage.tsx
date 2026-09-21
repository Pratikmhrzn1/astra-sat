import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { MessageSquare } from 'lucide-react';
import { getFeedback, markFeedbackRead } from '@/features/messages/api';
import { IconEmpty, InlineLoader, PageHeader, pageClass } from '@/shared/ui';
import { cn, formatDateTime } from '@/shared/lib/utils';

export default function StudentFeedback() {
  const queryClient = useQueryClient();

  const { data: feedbacks = [], isLoading } = useQuery({
    queryKey: ['student', 'feedback'],
    queryFn: getFeedback,
  });

  const markRead = useMutation({
    mutationFn: markFeedbackRead,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['student', 'feedback'] }),
  });

  if (isLoading) return <InlineLoader />;

  return (
    <div className={cn(pageClass, 'max-w-[820px] mx-auto')}>
      <PageHeader title="Feedback" subtitle="Messages from your teacher" className="mb-6" />

      {feedbacks.length === 0 ? (
        <IconEmpty icon={MessageSquare}><p>No feedback yet.</p></IconEmpty>
      ) : (
        <div className="flex flex-col gap-3">
          {feedbacks.map((fb) => (
            <div
              key={fb.id}
              onClick={() => { if (!fb.isRead) markRead.mutate(fb.id); }}
              className={cn(
                'relative bg-white rounded-2xl px-[22px] py-[18px] cursor-pointer border hover:bg-[#FBFAF8]',
                fb.isRead ? 'border-border shadow-stat' : 'border-ember/[.35] shadow-[0_2px_12px_rgba(226,86,43,0.1)]',
              )}
            >
              {!fb.isRead && (
                <div className="absolute left-0 top-3.5 bottom-3.5 w-[3px] bg-ember rounded-r" />
              )}
              <div className="flex items-start justify-between gap-3 mb-2.5">
                <div>
                  <div className="text-[14.5px] font-semibold text-ink">{fb.teacherName}</div>
                  <div className="text-xs text-muted">{fb.teacherEmail}</div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-xs text-muted">{formatDateTime(fb.createdAt)}</div>
                  {!fb.isRead && (
                    <span className="inline-block mt-1 px-2 py-0.5 bg-ember/10 text-accent-text text-[11px] font-bold rounded-full tracking-[0.05em]">NEW</span>
                  )}
                </div>
              </div>
              <p className="text-sm text-body leading-[1.6] m-0 whitespace-pre-wrap">{fb.content}</p>
              {fb.examId && (
                <p className="text-xs text-muted mt-2 mb-0">Related to an exam</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
