import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Trash2, ChevronDown, ChevronUp } from 'lucide-react';
import { getAdminFeedback, markFeedbackRead, deleteFeedback } from '@/api/feedback';
import type { FeedbackItem } from '@/api/feedback';
import { ConfirmModal, Spinner, pageClass, pillClass, surfaceClass } from '@/components/common';
import { cn, formatDate } from '@/lib/utils';

const CATEGORY_STYLES: Record<string, { tone: string; label: string }> = {
  bug:        { tone: 'bg-error-field/10 text-[#DC2626]', label: 'Bug Report' },
  suggestion: { tone: 'bg-gold/[.12] text-gold',        label: 'Suggestion' },
  other:      { tone: 'bg-[#8C8880]/10 text-[#6B7280]', label: 'Other' },
};

type Filter = 'all' | 'unread' | 'bug' | 'suggestion' | 'other';

function CategoryBadge({ category }: { category: string }) {
  const s = CATEGORY_STYLES[category] ?? CATEGORY_STYLES.other;
  return (
    <span className={cn('inline-flex items-center px-2.5 py-[3px] rounded-full text-[11.5px] font-bold tracking-[0.04em] uppercase', s.tone)}>
      {s.label}
    </span>
  );
}

function FeedbackRow({ item, onDelete }: { item: FeedbackItem; onDelete: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const queryClient = useQueryClient();

  const readMutation = useMutation({
    mutationFn: () => markFeedbackRead(item.id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin', 'feedback'] }),
  });

  const handleExpand = () => {
    setExpanded((p) => !p);
    if (!item.isRead && !expanded) readMutation.mutate();
  };

  const initials = item.userName?.split(' ').map((w) => w[0]).slice(0, 2).join('') ?? '?';

  return (
    <div className={cn(surfaceClass, 'mb-2.5 overflow-hidden', item.isRead && 'opacity-75')}>
      <div className="flex items-start gap-3.5 px-5 py-4 cursor-pointer" onClick={handleExpand}>
        <div className={cn('w-9 h-9 rounded-full flex items-center justify-center text-[13px] font-semibold shrink-0', item.isRead ? 'bg-[#E5E4E0] text-stone' : 'bg-ink text-white')}>
          {initials}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2.5 flex-wrap mb-1">
            <span className="text-sm font-semibold text-ink">{item.userName ?? 'Unknown'}</span>
            <span className="text-[12.5px] text-muted">{item.userEmail}</span>
            <CategoryBadge category={item.category} />
            {!item.isRead && <span className="w-2 h-2 rounded-full bg-ember inline-block" />}
          </div>
          <p className={cn('m-0 text-[13.5px] text-subtle leading-normal', !expanded && 'line-clamp-2')}>
            {item.message}
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <span className="hidden sm:inline text-xs text-muted">{formatDate(item.createdAt)}</span>
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(); }}
            className="w-8 h-8 rounded-lg border border-border bg-white flex items-center justify-center cursor-pointer text-[#DC2626] shrink-0"
            title="Delete"
          >
            <Trash2 size={14} />
          </button>
          <span className="text-muted shrink-0">
            {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </span>
        </div>
      </div>
    </div>
  );
}

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'unread', label: 'Unread' },
  { key: 'bug', label: 'Bug Reports' },
  { key: 'suggestion', label: 'Suggestions' },
  { key: 'other', label: 'Other' },
];

export default function AdminFeedback() {
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<Filter>('all');
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  const { data: items = [], isLoading } = useQuery({
    queryKey: ['admin', 'feedback'],
    queryFn: getAdminFeedback,
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteFeedback(deleteTarget!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'feedback'] });
      setDeleteTarget(null);
    },
  });

  const filtered = items.filter((item) => {
    if (filter === 'unread') return !item.isRead;
    if (filter === 'all') return true;
    return item.category === filter;
  });

  const unreadCount = items.filter((i) => !i.isRead).length;

  return (
    <div className={pageClass}>
      <div className="mb-6">
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="font-display font-semibold text-[32px] sm:text-[44px] m-0 tracking-[-0.02em]">Platform Feedback</h1>
          {unreadCount > 0 && (
            <span className="bg-accent-text text-white text-xs font-bold px-[9px] py-[3px] rounded-full">
              {unreadCount} unread
            </span>
          )}
        </div>
        <p className="text-[15px] text-subtle mt-1 mb-0">
          Feedback submitted by students and teachers.
        </p>
      </div>

      <div className="flex gap-2 mb-6 flex-wrap">
        {FILTERS.map(({ key, label }) => (
          <button key={key} onClick={() => setFilter(key)} className={pillClass(filter === key, 'px-4 py-[7px] text-[13px]')}>
            {label}{key === 'unread' && unreadCount > 0 ? ` (${unreadCount})` : ''}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="flex justify-center p-12"><Spinner /></div>
      ) : filtered.length === 0 ? (
        <div className={cn(surfaceClass, 'px-6 py-12 text-center')}>
          <div className="text-[32px] mb-3">💬</div>
          <div className="text-[15px] font-semibold text-ink mb-1.5">No feedback yet</div>
          <div className="text-[13.5px] text-subtle">
            {filter === 'all' ? 'No feedback has been submitted yet.' : 'No items match this filter.'}
          </div>
        </div>
      ) : (
        <div>
          {filtered.map((item) => (
            <FeedbackRow key={item.id} item={item} onDelete={() => setDeleteTarget(item.id)} />
          ))}
        </div>
      )}

      <ConfirmModal
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => deleteMutation.mutate()}
        title="Delete feedback"
        message="This feedback entry will be permanently deleted."
        confirmLabel="Delete"
        confirmVariant="danger"
        loading={deleteMutation.isPending}
      />
    </div>
  );
}
