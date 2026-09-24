import { useQuery } from '@tanstack/react-query';
import { MessageSquare } from 'lucide-react';
import { fetchSentFeedback } from '@/features/messages/api';
import { Tag, IconBlank, InlineSpinner, ScreenMasthead, screenStyle, surfaceStyle } from '@/shared/ui';
import { classes, renderDateTime } from '@/shared/lib/utils';

export default function CoachNotesScreen() {
  const { data: feedbacks = [], isLoading } = useQuery({ queryKey: ['teacher', 'feedback'], queryFn: fetchSentFeedback });

  if (isLoading) return <InlineSpinner />;

  return (
    <div className={classes(screenStyle, 'max-w-[820px] mx-auto')}>
      <ScreenMasthead title="Sent Feedback" subtitle="Feedback you've sent to your students" className="mb-6" />

      {feedbacks.length === 0 ? (
        <IconBlank icon={MessageSquare}><p>No feedback sent yet.</p></IconBlank>
      ) : (
        <div className="flex flex-col gap-3">
          {feedbacks.map((fb) => (
            <div key={fb.id} className={classes(surfaceStyle, 'px-[22px] py-[18px]')}>
              <div className="flex items-start justify-between gap-3 flex-wrap mb-3">
                <div>
                  <div className="text-[14.5px] font-semibold text-ink">{fb.studentName}</div>
                  <div className="text-xs text-muted">{fb.studentEmail}</div>
                </div>
                <div className="flex items-center gap-2.5 shrink-0">
                  <Tag variant={fb.isRead ? 'success' : 'neutral'}>{fb.isRead ? 'Read' : 'Unread'}</Tag>
                  <span className="text-xs text-muted">{renderDateTime(fb.createdAt)}</span>
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
