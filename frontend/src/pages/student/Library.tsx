import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getLibraryItems } from '../../api/library';
import type { FileType, LibraryItem } from '../../api/library';
import { Modal } from '../../components/ui/Modal';
import { Spinner } from '../../components/ui/Spinner';
import { useMobile } from '../../hooks/useMobile';

const TYPE_META: Record<FileType, { color: string; label: string; icon: string }> = {
  audio:    { color: '#B8893E', label: 'Audio',    icon: '🎵' },
  video:    { color: '#2563A8', label: 'Video',    icon: '🎬' },
  image:    { color: '#2E7D5A', label: 'Image',    icon: '🖼️' },
  document: { color: '#E2562B', label: 'Document', icon: '📄' },
  other:    { color: '#8C8880', label: 'Other',    icon: '📎' },
  note:     { color: '#7C3AED', label: 'Note',     icon: '📝' },
};

const TABS = ['All', 'Audio', 'Video', 'Image', 'Document', 'Note', 'Other'];

function NoteModal({ item, onClose }: { item: LibraryItem; onClose: () => void }) {
  return (
    <Modal isOpen onClose={onClose} title={item.title} size="md">
      <div style={{ whiteSpace: 'pre-wrap', fontSize: 14, lineHeight: 1.8, color: '#0B0B0E', minHeight: 80 }}>
        {item.noteContent || <span style={{ color: 'rgba(11,11,14,0.35)' }}>No content.</span>}
      </div>
    </Modal>
  );
}

export default function Library() {
  const [filter, setFilter] = useState('All');
  const [readNote, setReadNote] = useState<LibraryItem | null>(null);
  const isMobile = useMobile();

  const { data: items = [], isLoading, isError } = useQuery({
    queryKey: ['library'],
    queryFn: getLibraryItems,
  });

  const shown = items.filter((i) => filter === 'All' || i.fileType.toLowerCase() === filter.toLowerCase());

  return (
    <div className="screen-fade" style={{ padding: isMobile ? '20px 16px 80px' : '36px 48px 64px' }}>
      <h1 style={{ fontFamily: "'Instrument Serif', serif", fontSize: isMobile ? 32 : 44, margin: '0 0 6px', letterSpacing: '-0.02em' }}>Library</h1>
      <p style={{ fontSize: isMobile ? 14 : 15, color: 'rgba(11,11,14,0.55)', margin: '0 0 20px' }}>
        Guides, lessons and practice material to close the gaps your reports reveal.
      </p>

      <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setFilter(t)}
            style={{
              padding: isMobile ? '7px 13px' : '8px 16px', borderRadius: 9999, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
              border: filter === t ? '1px solid #0B0B0E' : '1px solid #C8C4BC',
              background: filter === t ? '#0B0B0E' : '#fff',
              color: filter === t ? '#fff' : '#0B0B0E',
            }}
          >{t}</button>
        ))}
      </div>

      {isLoading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}><Spinner /></div>
      ) : isError ? (
        <div style={{ background: '#fff', border: '1px solid #E7E4DE', borderRadius: 16, padding: '48px 24px', textAlign: 'center' }}>
          <div style={{ fontSize: 15, color: '#dc2626' }}>Failed to load library. Please try again.</div>
        </div>
      ) : shown.length === 0 ? (
        <div style={{ background: '#fff', border: '1px solid #E7E4DE', borderRadius: 16, padding: '48px 24px', textAlign: 'center' }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>📚</div>
          <div style={{ fontSize: 15, fontWeight: 600, color: '#0B0B0E', marginBottom: 6 }}>
            {filter === 'All' ? 'No resources yet' : `No ${filter.toLowerCase()} resources`}
          </div>
          <div style={{ fontSize: 13.5, color: 'rgba(11,11,14,0.5)' }}>
            {filter === 'All' ? 'Your teacher will add resources here soon.' : 'Try a different filter.'}
          </div>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, 1fr)', gap: isMobile ? 12 : 16 }}>
          {shown.map((item) => {
            const meta = TYPE_META[item.fileType] ?? TYPE_META.other;
            const isNote = item.fileType === 'note';
            return (
              <div
                key={item.id}
                className="lift"
                style={{ background: '#fff', border: '1px solid #E7E4DE', borderRadius: 16, padding: isMobile ? '16px 16px 14px' : '22px 22px 20px', boxShadow: '0 1px 3px rgba(11,11,14,0.04)', cursor: 'pointer', display: 'flex', flexDirection: isMobile ? 'row' : 'column', alignItems: isMobile ? 'center' : undefined, gap: isMobile ? 14 : undefined }}
                onMouseEnter={(e) => { e.currentTarget.style.boxShadow = '0 8px 24px rgba(11,11,14,0.09)'; e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.borderColor = '#D8D4CC'; }}
                onMouseLeave={(e) => { e.currentTarget.style.boxShadow = '0 1px 3px rgba(11,11,14,0.04)'; e.currentTarget.style.transform = 'none'; e.currentTarget.style.borderColor = '#E7E4DE'; }}
                onClick={() => isNote ? setReadNote(item) : item.fileUrl && window.open(item.fileUrl, '_blank')}
              >
                {/* Icon/type badge */}
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: isMobile ? 14 : 10.5, fontWeight: isMobile ? 400 : 700, letterSpacing: isMobile ? 0 : '0.08em', textTransform: isMobile ? undefined : 'uppercase', color: meta.color, marginBottom: isMobile ? 0 : 14, flexShrink: 0 }}>
                  <span style={{ fontSize: isMobile ? 28 : 16 }}>{meta.icon}</span>
                  {!isMobile && meta.label}
                </div>

                {/* Content */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: isMobile ? 14.5 : 17, fontWeight: 600, lineHeight: 1.3, marginBottom: isMobile ? 2 : 8 }}>{item.title}</div>
                  {item.description && (
                    <div style={{ fontSize: 13, color: 'rgba(11,11,14,0.55)', lineHeight: 1.5, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: isMobile ? 1 : 2, WebkitBoxOrient: 'vertical' as any }}>
                      {item.description}
                    </div>
                  )}
                  {isNote && !item.description && item.noteContent && !isMobile && (
                    <div style={{ fontSize: 13, color: 'rgba(11,11,14,0.45)', lineHeight: 1.55, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as any, fontStyle: 'italic' }}>
                      {item.noteContent}
                    </div>
                  )}
                </div>

                <div style={{ marginTop: isMobile ? 0 : 'auto', flexShrink: 0 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: '#E2562B' }}>{isNote ? 'Read →' : 'Open →'}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {readNote && <NoteModal item={readNote} onClose={() => setReadNote(null)} />}
    </div>
  );
}
