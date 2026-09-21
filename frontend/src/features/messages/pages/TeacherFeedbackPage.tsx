import { useQuery } from '@tanstack/react-query';
import { MessageSquare } from 'lucide-react';
import { getSentFeedback } from '@/features/messages/api';
import { Badge, IconEmpty, InlineLoader, PageHeader, pageClass, surfaceClass } from '@/shared/ui';
import { cn, formatDateTime } from '@/shared/lib/utils';

export default function TeacherFeedback() {
  const { data: feedbacks = [], isLoading } = useQuery({ queryKey: ['teacher', 'feedback'], queryFn: getSentFeedback });

  if (isLoading) return <InlineLoader />;

  return (
    <div className={cn(pageClass, 'max-w-[820px] mx-auto')}>
      <PageHeader title="Sent Feedback" subtitle="Feedback you've sent to your students" className="mb-6" />

      {feedbacks.length === 0 ? (
        <IconEmpty icon={MessageSquare}><p>No feedback sent yet.</p></IconEmpty>
      ) : (
        <div className="flex flex-col gap-3">
          {feedbacks.map((fb) => (
            <div key={fb.id} className={cn(surfaceClass, 'px-[22px] py-[18px]')}>
              <div className="flex items-start justify-between gap-3 flex-wrap mb-3">
                <div>
                  <div className="text-[14.5px] font-semibold text-ink">{fb.studentName}</div>
                  <div className="text-xs text-muted">{fb.studentEmail}</div>
                </div>
                <div className="flex items-center gap-2.5 shrink-0">
                  <Badge variant={fb.isRead ? 'success' : 'neutral'}>{fb.isRead ? 'Read' : 'Unread'}</Badge>
                  <span className="text-xs text-muted">{formatDateTime(fb.createdAt)}</span>
                </div>
              </div>
              <p className="text-sm text-body leading-[1.6] m-0 whitespace-pre-wrap">{fb.content}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
