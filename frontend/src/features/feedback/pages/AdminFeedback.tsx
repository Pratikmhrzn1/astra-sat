import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Trash2, ChevronDown, ChevronUp } from 'lucide-react';
import { getAdminFeedback, markFeedbackRead, deleteFeedback } from '@/features/feedback/api/feedback.api';
import type { FeedbackItem } from '@/features/feedback/api/feedback.api';
import { ConfirmModal, Spinner } from '@/shared/ui';
import { formatDate } from '@/shared/lib/utils';

const CARD: React.CSSProperties = { background: '#fff', border: '1px solid #E7E4DE', borderRadius: 16, boxShadow: '0 1px 3px rgba(11,11,14,0.05)' };

const CATEGORY_STYLES: Record<string, { bg: string; color: string; label: string }> = {
  bug:        { bg: 'rgba(239,68,68,0.1)',   color: '#dc2626', label: 'Bug Report' },
  suggestion: { bg: 'rgba(184,137,62,0.12)', color: '#B8893E', label: 'Suggestion' },
  other:      { bg: 'rgba(140,136,128,0.1)', color: '#6b7280', label: 'Other' },
};

type Filter = 'all' | 'unread' | 'bug' | 'suggestion' | 'other';

function CategoryBadge({ category }: { category: string }) {
  const s = CATEGORY_STYLES[category] ?? CATEGORY_STYLES.other;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', padding: '3px 10px', borderRadius: 9999, fontSize: 11.5, fontWeight: 700, background: s.bg, color: s.color, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
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
    <div style={{ ...CARD, marginBottom: 10, overflow: 'hidden', opacity: item.isRead ? 0.75 : 1 }}>
      <div
        style={{ display: 'flex', alignItems: 'flex-start', gap: 14, padding: '16px 20px', cursor: 'pointer' }}
        onClick={handleExpand}
      >
        <div style={{ width: 36, height: 36, borderRadius: 9999, background: item.isRead ? '#e5e4e0' : '#0B0B0E', color: item.isRead ? '#6F6B64' : '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 600, flexShrink: 0 }}>
          {initials}
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 4 }}>
            <span style={{ fontSize: 14, fontWeight: 600, color: '#0B0B0E' }}>{item.userName ?? 'Unknown'}</span>
            <span style={{ fontSize: 12.5, color: 'rgba(11,11,14,0.58)' }}>{item.userEmail}</span>
            <CategoryBadge category={item.category} />
            {!item.isRead && (
              <span style={{ width: 8, height: 8, borderRadius: 9999, background: '#E2562B', display: 'inline-block' }} />
            )}
          </div>
          <p style={{ margin: 0, fontSize: 13.5, color: 'rgba(11,11,14,0.65)', lineHeight: 1.5, overflow: expanded ? 'visible' : 'hidden', display: expanded ? 'block' : '-webkit-box', WebkitLineClamp: expanded ? undefined : 2, WebkitBoxOrient: 'vertical' as any }}>
            {item.message}
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          <span style={{ fontSize: 12, color: 'rgba(11,11,14,0.58)' }}>{formatDate(item.createdAt)}</span>
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(); }}
            style={{ width: 32, height: 32, borderRadius: 8, border: '1px solid #E7E4DE', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#dc2626', flexShrink: 0 }}
            title="Delete"
          >
            <Trash2 size={14} />
          </button>
          <span style={{ color: 'rgba(11,11,14,0.58)', flexShrink: 0 }}>
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
    <div className="screen-fade" style={{ padding: '36px 48px 64px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <h1 style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 44, margin: 0, letterSpacing: '-0.02em' }}>Platform Feedback</h1>
            {unreadCount > 0 && (
              <span style={{ background: '#C4471F', color: '#fff', fontSize: 12, fontWeight: 700, padding: '3px 9px', borderRadius: 9999 }}>
                {unreadCount} unread
              </span>
            )}
          </div>
          <p style={{ fontSize: 15, color: 'rgba(11,11,14,0.64)', margin: '4px 0 0' }}>
            Feedback submitted by students and teachers.
          </p>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 24, flexWrap: 'wrap' }}>
        {FILTERS.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setFilter(key)}
            style={{
              padding: '7px 16px', borderRadius: 9999, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
              border: filter === key ? '1px solid #0B0B0E' : '1px solid #C8C4BC',
              background: filter === key ? '#0B0B0E' : '#fff',
              color: filter === key ? '#fff' : '#0B0B0E',
            }}
          >{label}{key === 'unread' && unreadCount > 0 ? ` (${unreadCount})` : ''}</button>
        ))}
      </div>

      {isLoading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}><Spinner /></div>
      ) : filtered.length === 0 ? (
        <div style={{ ...CARD, padding: '48px 24px', textAlign: 'center' }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>💬</div>
          <div style={{ fontSize: 15, fontWeight: 600, color: '#0B0B0E', marginBottom: 6 }}>No feedback yet</div>
          <div style={{ fontSize: 13.5, color: 'rgba(11,11,14,0.64)' }}>
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
