import { ChevronRight } from 'lucide-react';
import type { LiveExamResult } from '@/api/liveExam';
import { CARD, H1, KICKER, T } from '@/components/live-exam/ui';

/**
 * One released live exam in the student's History: when it was sat, a link into
 * each section's full review, and the teacher's note on the paper.
 */
export function LiveResultCard({ result, isMobile, onOpen }: {
  result: LiveExamResult;
  isMobile: boolean;
  onOpen: (examId: string) => void;
}) {
  const sections = [
    { label: 'Reading & Writing', short: 'R&W', examId: result.englishExamId, accent: T.english },
    { label: 'Math', short: 'Math', examId: result.mathExamId, accent: T.math },
  ].filter((s): s is typeof s & { examId: string } => !!s.examId);

  const date = result.startedAt
    ? new Date(result.startedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
    : null;

  return (
    <article style={{ ...CARD, overflow: 'hidden' }}>
      <div style={{
        display: 'flex', alignItems: isMobile ? 'stretch' : 'center', flexDirection: isMobile ? 'column' : 'row',
        gap: isMobile ? 12 : 16, padding: isMobile ? '14px 16px' : '16px 18px 16px 20px',
      }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <span style={{ ...KICKER, color: T.accentText }}>Live exam</span>
            {date && <span style={{ fontSize: 12.5, color: T.faint }}>· {date}</span>}
          </div>
          <h3 style={{ ...H1, fontSize: 20, lineHeight: 1.25, overflowWrap: 'anywhere' }}>{result.sessionTitle}</h3>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? `repeat(${sections.length || 1}, minmax(0, 1fr))` : 'none', gridAutoFlow: isMobile ? undefined : 'column', gap: 8 }}>
          {sections.map((s) => (
            <button
              key={s.label}
              onClick={() => onOpen(s.examId)}
              aria-label={`Open ${s.label} review`}
              style={{
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7,
                height: 38, padding: '0 10px 0 14px', borderRadius: 9999, border: `1px solid ${T.line}`,
                background: '#fff', color: T.ink, fontSize: 13, fontWeight: 600, cursor: 'pointer',
                fontFamily: 'inherit', whiteSpace: 'nowrap', boxSizing: 'border-box',
              }}
            >
              <span aria-hidden style={{ width: 7, height: 7, borderRadius: 9999, background: s.accent }} />
              {isMobile ? s.short : s.label}
              <ChevronRight size={15} aria-hidden style={{ color: T.faint, marginLeft: -2 }} />
            </button>
          ))}
        </div>
      </div>

      {result.globalFeedback && (
        <div style={{ borderTop: `1px solid ${T.lineSoft}`, background: T.wash, padding: isMobile ? '12px 16px 14px' : '12px 20px 14px' }}>
          <div style={{ ...KICKER, marginBottom: 4 }}>Note from your teacher</div>
          <p style={{ fontSize: 14, color: T.ink, margin: 0, lineHeight: 1.6, whiteSpace: 'pre-line', overflowWrap: 'anywhere' }}>{result.globalFeedback}</p>
        </div>
      )}
    </article>
  );
}
