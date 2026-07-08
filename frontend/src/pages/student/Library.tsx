import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getLibraryItems } from '../../api/library';
import type { FileType } from '../../api/library';
import { Spinner } from '../../components/ui/Spinner';

const TYPE_META: Record<FileType, { color: string; label: string; icon: string }> = {
  audio:    { color: '#B8893E', label: 'Audio',    icon: '🎵' },
  video:    { color: '#2563A8', label: 'Video',    icon: '🎬' },
  image:    { color: '#2E7D5A', label: 'Image',    icon: '🖼️' },
  document: { color: '#E2562B', label: 'Document', icon: '📄' },
  other:    { color: '#8C8880', label: 'Other',    icon: '📎' },
};

const TABS = ['All', 'Audio', 'Video', 'Image', 'Document', 'Other'];

export default function Library() {
  const [filter, setFilter] = useState('All');

  const { data: items = [], isLoading, isError } = useQuery({
    queryKey: ['library'],
    queryFn: getLibraryItems,
  });

  const shown = items.filter((i) => filter === 'All' || i.fileType.toLowerCase() === filter.toLowerCase());

  return (
    <div className="screen-fade" style={{ padding: '36px 48px 64px' }}>
      <h1 style={{ fontFamily: "'Instrument Serif', serif", fontSize: 44, margin: '0 0 6px', letterSpacing: '-0.02em' }}>Library</h1>
      <p style={{ fontSize: 15, color: 'rgba(11,11,14,0.55)', margin: '0 0 24px' }}>
        Guides, lessons and practice material to close the gaps your reports reveal.
      </p>

      <div style={{ display: 'flex', gap: 9, marginBottom: 22, flexWrap: 'wrap' }}>
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setFilter(t)}
            style={{
              padding: '8px 16px', borderRadius: 9999, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
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
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
          {shown.map((item) => {
            const meta = TYPE_META[item.fileType] ?? TYPE_META.other;
            return (
              <div
                key={item.id}
                className="lift"
                style={{ background: '#fff', border: '1px solid #E7E4DE', borderRadius: 16, padding: '22px 22px 20px', boxShadow: '0 1px 3px rgba(11,11,14,0.04)', cursor: 'pointer', display: 'flex', flexDirection: 'column' }}
                onMouseEnter={(e) => { e.currentTarget.style.boxShadow = '0 8px 24px rgba(11,11,14,0.09)'; e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.borderColor = '#D8D4CC'; }}
                onMouseLeave={(e) => { e.currentTarget.style.boxShadow = '0 1px 3px rgba(11,11,14,0.04)'; e.currentTarget.style.transform = 'none'; e.currentTarget.style.borderColor = '#E7E4DE'; }}
                onClick={() => window.open(item.fileUrl, '_blank')}
              >
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 7, alignSelf: 'flex-start', fontSize: 10.5, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: meta.color, marginBottom: 14 }}>
                  <span style={{ fontSize: 16 }}>{meta.icon}</span>
                  {meta.label}
                </div>
                <div style={{ fontSize: 17, fontWeight: 600, lineHeight: 1.3, marginBottom: 8 }}>{item.title}</div>
                {item.description && (
                  <div style={{ fontSize: 13.5, color: 'rgba(11,11,14,0.55)', lineHeight: 1.55, flex: 1, marginBottom: 18, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as any }}>
                    {item.description}
                  </div>
                )}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 'auto' }}>
                  {item.fileName && (
                    <span style={{ fontSize: 12, color: 'rgba(11,11,14,0.45)', fontFamily: "'JetBrains Mono', monospace", overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '60%' }}>{item.fileName}</span>
                  )}
                  <span style={{ fontSize: 13, fontWeight: 600, color: '#E2562B', marginLeft: 'auto' }}>Open →</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
