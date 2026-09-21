import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getLibraryItems, type LibraryItem } from '@/features/library/api';
import { PageHeader, Spinner, pageClass, pillClass, surfaceClass } from '@/shared/ui';
import { LIBRARY_FILTERS, TYPE_META } from '@/features/library/components/libraryMeta';
import { NoteReadModal } from '@/features/library/components/NoteReadModal';
import { cn } from '@/shared/lib/utils';

export default function Library() {
  const [filter, setFilter] = useState('All');
  const [readNote, setReadNote] = useState<LibraryItem | null>(null);

  const { data: items = [], isLoading, isError } = useQuery({
    queryKey: ['library'],
    queryFn: getLibraryItems,
    meta: { handlesError: true },
  });

  const shown = items.filter((i) => filter === 'All' || i.fileType.toLowerCase() === filter.toLowerCase());

  return (
    <div className={pageClass}>
      <PageHeader title="Library" subtitle="Guides, lessons and practice material to close the gaps your reports reveal." />

      <div className="flex gap-2 mb-5 flex-wrap">
        {LIBRARY_FILTERS.map((t) => (
          <button key={t} onClick={() => setFilter(t)} className={pillClass(filter === t, 'px-[13px] py-[7px] sm:px-4 sm:py-2 text-[13px]')}>{t}</button>
        ))}
      </div>

      {isLoading ? (
        <div className="flex justify-center p-12"><Spinner /></div>
      ) : isError ? (
        <div className="bg-white border border-border rounded-2xl px-6 py-12 text-center">
          <div className="text-[15px] text-[#DC2626]">Failed to load library. Please try again.</div>
        </div>
      ) : shown.length === 0 ? (
        <div className="bg-white border border-border rounded-2xl px-6 py-12 text-center">
          <div className="text-[32px] mb-3">📚</div>
          <div className="text-[15px] font-semibold text-ink mb-1.5">
            {filter === 'All' ? 'No resources yet' : `No ${filter.toLowerCase()} resources`}
          </div>
          <div className="text-[13.5px] text-subtle">
            {filter === 'All' ? 'Your teacher will add resources here soon.' : 'Try a different filter.'}
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
          {shown.map((item) => {
            const meta = TYPE_META[item.fileType] ?? TYPE_META.other;
            const isNote = item.fileType === 'note';
            return (
              <div
                key={item.id}
                className={cn(
                  surfaceClass,
                  // Phones: a compact row. Wider: a card with the type label on top.
                  'lift shadow-card cursor-pointer flex flex-row sm:flex-col items-center sm:items-stretch gap-3.5 sm:gap-0',
                  'px-4 pt-4 pb-3.5 sm:px-[22px] sm:pt-[22px] sm:pb-5',
                  'hover:shadow-[0_8px_24px_rgba(11,11,14,0.09)] hover:-translate-y-0.5 hover:border-border-strong',
                )}
                onClick={() => isNote ? setReadNote(item) : item.fileUrl && window.open(item.fileUrl, '_blank')}
              >
                {/* Icon/type badge */}
                <div className={cn('inline-flex items-center gap-1.5 shrink-0 mb-0 sm:mb-3.5 text-sm sm:text-[10.5px] font-normal sm:font-bold tracking-normal sm:tracking-[0.08em] sm:uppercase', meta.tone)}>
                  <span className="text-[28px] sm:text-base">{meta.icon}</span>
                  <span className="hidden sm:inline">{meta.label}</span>
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="text-[14.5px] sm:text-[17px] font-semibold leading-[1.3] mb-0.5 sm:mb-2">{item.title}</div>
                  {item.description && (
                    <div className="text-[13px] text-subtle leading-normal line-clamp-1 sm:line-clamp-2">{item.description}</div>
                  )}
                  {isNote && !item.description && item.noteContent && (
                    <div className="max-sm:hidden text-[13px] text-muted leading-[1.55] line-clamp-2 italic">{item.noteContent}</div>
                  )}
                </div>

                <div className="mt-0 sm:mt-auto shrink-0">
                  <span className="text-[13px] font-semibold text-accent-text">{isNote ? 'Read →' : 'Open →'}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {readNote && <NoteReadModal item={readNote} onClose={() => setReadNote(null)} />}
    </div>
  );
}
