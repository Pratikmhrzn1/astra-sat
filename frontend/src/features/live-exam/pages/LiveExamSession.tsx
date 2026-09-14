import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import {
  getSessionDetail, startSession, releaseOne, releaseAll,
  type SessionDetail, type LiveExamParticipant,
} from '@/features/live-exam/api/live-exam.api';
import { getApiError } from '@/shared/api/client';
import { Modal } from '@/shared/ui';
import { useMobile } from '@/shared/hooks/useMobile';
import {
  BackLink, CARD, CopyButton, EmptyState, ErrorNote, H1, HOVER_CSS, JoinCodePlate, KICKER, LivePage,
  LoadingRows, PillButton, StatTile, StatusPill, T,
} from '@/features/live-exam/ui';

/**
 * What a teacher runs the lesson from: read out the code, watch the room fill,
 * start, then release results.
 *
 * The join code is the whole point of the top of this page, so it is the only
 * loud thing on it.
 */

/** How often the roster refreshes while people are still arriving or sitting. */
const POLL_MS = 3000;

function joinedAgo(iso: string): string {
  const seconds = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

export default function LiveExamSession() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const isMobile = useMobile();
  const [session, setSession] = useState<SessionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [actionError, setActionError] = useState('');
  const [starting, setStarting] = useState(false);
  const [releasing, setReleasing] = useState(false);
  const [confirm, setConfirm] = useState<'start' | 'releaseAll' | null>(null);
  // Per-row busy state, so one Release click cannot be sent twice.
  const [releasingIds, setReleasingIds] = useState<Set<string>>(new Set());
  const statusRef = useRef<string | null>(null);

  const load = useCallback(async () => {
    if (!sessionId) return;
    try {
      const next = await getSessionDetail(sessionId);
      statusRef.current = next.status;
      setSession(next);
      setLoadError('');
    } catch (err) {
      // A transient failure between polls is not worth interrupting the lesson
      // for — but a first load that fails must say so, not claim the session is gone.
      setLoadError(getApiError(err));
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  // Polls only while something can still change. A finished session used to keep
  // refreshing every three seconds for as long as the tab stayed open.
  useEffect(() => {
    load();
    const interval = setInterval(() => {
      if (statusRef.current === 'completed' || document.hidden) return;
      load();
    }, POLL_MS);
    return () => clearInterval(interval);
  }, [load]);

  async function run(action: () => Promise<unknown>, setBusy: (v: boolean) => void) {
    setBusy(true);
    setActionError('');
    try {
      await action();
      await load();
    } catch (err) {
      setActionError(getApiError(err));
    } finally {
      setBusy(false);
    }
  }

  async function releaseParticipant(id: string) {
    if (!session || releasingIds.has(id)) return;
    setReleasingIds((prev) => new Set(prev).add(id));
    await run(() => releaseOne(session.id, id), () => {});
    setReleasingIds((prev) => { const next = new Set(prev); next.delete(id); return next; });
  }

  if (loading) {
    return (
      <LivePage>
        <div style={{ height: 40, width: 260, borderRadius: 10, background: T.lineSoft, marginBottom: 24 }} />
        <LoadingRows rows={3} height={72} />
      </LivePage>
    );
  }
  if (!session) {
    return (
      <LivePage>
        <BackLink onClick={() => navigate('/teacher/live-exams')}>Live exams</BackLink>
        <ErrorNote action={loadError ? <PillButton variant="secondary" onClick={() => { setLoading(true); load(); }} style={{ height: 32, fontSize: 13 }}>Try again</PillButton> : undefined}>
          {loadError ? `Couldn't load this session: ${loadError}` : 'This session no longer exists. It may have been deleted.'}
        </ErrorNote>
      </LivePage>
    );
  }

  const { participants, status } = session;
  const released = participants.filter((p) => p.resultReleased).length;
  const pending = participants.length - released;
  const joinUrl = `${window.location.origin}/sat/live/${session.joinCode}`;
  const notStarted = status === 'waiting';
  const live = status !== 'completed';

  const primaryAction = notStarted ? (
    <PillButton
      onClick={() => setConfirm('start')}
      disabled={starting || participants.length === 0}
      style={{ height: 44, fontSize: 15, padding: '0 24px', width: isMobile ? '100%' : undefined }}
    >{starting ? 'Starting…' : 'Start exam'}</PillButton>
  ) : pending > 0 && participants.length > 0 ? (
    <PillButton
      onClick={() => setConfirm('releaseAll')}
      disabled={releasing}
      style={{ height: 44, fontSize: 15, padding: '0 24px', width: isMobile ? '100%' : undefined }}
    >{releasing ? 'Releasing…' : `Release all results (${pending})`}</PillButton>
  ) : null;

  return (
    <LivePage>
      <style>{HOVER_CSS}</style>
      <BackLink onClick={() => navigate('/teacher/live-exams')}>Live exams</BackLink>

      <div style={{ display: 'flex', alignItems: isMobile ? 'stretch' : 'flex-start', justifyContent: 'space-between', gap: 16, flexDirection: isMobile ? 'column' : 'row', marginBottom: 22 }}>
        <div style={{ minWidth: 0 }}>
          <h1 style={{ ...H1, fontSize: isMobile ? 30 : 40, lineHeight: 1.12, marginBottom: 10, overflowWrap: 'anywhere' }}>{session.title}</h1>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <StatusPill status={status} />
            {live && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: T.faint }}>
                <span className="live-beat" aria-hidden />Updates live
              </span>
            )}
            {!notStarted && (
              <span style={{ fontSize: 12.5, color: T.faint }}>
                Code <span style={{ fontFamily: 'var(--font-mono)', color: T.muted, fontWeight: 600 }}>{session.joinCode}</span>
              </span>
            )}
          </div>
        </div>
        {primaryAction && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: isMobile ? 'stretch' : 'flex-end', gap: 6, flexShrink: 0 }}>
            {primaryAction}
            {notStarted && participants.length === 0 && (
              <span style={{ fontSize: 12.5, color: T.faint, textAlign: isMobile ? 'center' : 'right' }}>Available once a student joins</span>
            )}
          </div>
        )}
      </div>

      {actionError && <div style={{ marginBottom: 18 }}><ErrorNote>{actionError}</ErrorNote></div>}

      {/* The code, sized to be read across a room. Only shown while it can still
          be used — once everyone is sitting the paper it is just noise. */}
      {notStarted ? (
        <div style={{ ...CARD, padding: isMobile ? '20px 16px' : '24px 28px', marginBottom: 22 }}>
          <div style={{ ...KICKER, marginBottom: 6 }}>Join code</div>
          <p style={{ fontSize: 14, color: T.muted, margin: '0 0 16px', lineHeight: 1.55 }}>
            Read this out. Students enter it under <strong style={{ color: T.ink, fontWeight: 600 }}>Live Exam</strong>, or open the link.
          </p>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
            <JoinCodePlate code={session.joinCode} />
            <div style={{ display: 'flex', gap: 8 }}>
              <CopyButton value={session.joinCode} label="Copy code" />
              <CopyButton value={joinUrl} label="Copy link" />
            </div>
          </div>
        </div>
      ) : participants.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10, marginBottom: 22 }}>
          <StatTile label="Students" value={participants.length} sub={status === 'completed' ? 'sat this exam' : 'sitting the exam'} />
          <StatTile
            label="Results released"
            value={<>{released}<span style={{ fontSize: 18, color: T.faint }}> / {participants.length}</span></>}
            color={pending === 0 ? T.green : T.ink}
            sub={
              <span style={{ display: 'block', height: 4, borderRadius: 9999, background: T.lineSoft, overflow: 'hidden', marginTop: 4 }}>
                <span style={{ display: 'block', height: '100%', width: `${(released / participants.length) * 100}%`, background: T.green, borderRadius: 9999, transition: 'width 300ms cubic-bezier(0.2, 0, 0, 1)' }} />
              </span>
            }
          />
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, marginBottom: 10 }}>
        <h2 style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>
          {notStarted ? 'In the lobby' : 'Students'}
          <span style={{ marginLeft: 8, fontSize: 13, fontWeight: 500, color: T.faint, fontVariantNumeric: 'tabular-nums' }}>{participants.length}</span>
        </h2>
        {!notStarted && pending > 0 && !isMobile && (
          <span style={{ fontSize: 12.5, color: T.faint }}>Open a paper to mark it and add notes</span>
        )}
      </div>

      {participants.length === 0 ? (
        <EmptyState title={notStarted ? 'Waiting for students' : 'Nobody joined'}>
          {notStarted
            ? 'Read out the code above. Names appear here as students arrive.'
            : 'No students joined this session before it started.'}
        </EmptyState>
      ) : (
        <div style={{ ...CARD, overflow: 'hidden' }}>
          {participants.map((p, i) => (
            <ParticipantRow
              key={p.id}
              participant={p}
              isLast={i === participants.length - 1}
              sessionStatus={status}
              isMobile={isMobile}
              releasing={releasingIds.has(p.id)}
              onRelease={() => releaseParticipant(p.id)}
              onView={() => navigate(`/teacher/live-exams/${session.id}/participants/${p.id}`)}
            />
          ))}
        </div>
      )}

      <Modal
        isOpen={confirm !== null}
        onClose={() => setConfirm(null)}
        size="sm"
        title={confirm === 'start' ? 'Start the exam?' : 'Release all results?'}
        footer={
          <>
            <PillButton variant="secondary" onClick={() => setConfirm(null)}>Cancel</PillButton>
            <PillButton
              onClick={() => {
                const action = confirm;
                setConfirm(null);
                if (action === 'start') run(() => startSession(session.id), setStarting);
                else run(() => releaseAll(session.id), setReleasing);
              }}
            >{confirm === 'start' ? `Start for ${participants.length}` : `Release ${pending}`}</PillButton>
          </>
        }
      >
        <p style={{ margin: 0, color: T.muted, fontSize: 14.5, lineHeight: 1.6 }}>
          {confirm === 'start'
            ? `The paper opens for the ${participants.length} student${participants.length === 1 ? '' : 's'} in the lobby and the clock starts. Students who join later start late.`
            : `${pending} student${pending === 1 ? '' : 's'} will see their scores, answers and any notes you have saved. This can't be undone.`}
        </p>
      </Modal>

      <style>{`
        .live-beat { width: 7px; height: 7px; border-radius: 9999px; background: ${T.green}; animation: live-beat 2s ease-in-out infinite; }
        @keyframes live-beat { 0%, 100% { opacity: 1; } 50% { opacity: 0.35; } }
        @media (prefers-reduced-motion: reduce) { .live-beat { animation: none; } }
      `}</style>
    </LivePage>
  );
}

function ParticipantRow({
  participant, isLast, sessionStatus, isMobile, releasing, onRelease, onView,
}: {
  participant: LiveExamParticipant;
  isLast: boolean;
  sessionStatus: string;
  isMobile: boolean;
  releasing: boolean;
  onRelease: () => void;
  onView: () => void;
}) {
  const started = sessionStatus !== 'waiting';
  const initials = participant.name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join('');

  const identity = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1, minWidth: 0 }}>
      <span aria-hidden style={{
        width: 36, height: 36, borderRadius: 9999, flexShrink: 0, background: T.lineSoft,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 13, fontWeight: 600, color: T.muted,
      }}>{initials || '?'}</span>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 14.5, fontWeight: 600, color: T.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{participant.name}</div>
        <div style={{ fontSize: 12.5, color: T.muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {participant.email}
        </div>
      </div>
    </div>
  );

  const smallBtn = { height: 34, padding: '0 14px', fontSize: 13 } as const;

  return (
    <div style={{
      display: 'flex', alignItems: isMobile && started ? 'stretch' : 'center', flexDirection: isMobile && started ? 'column' : 'row',
      gap: isMobile && started ? 10 : 14, padding: isMobile ? '12px 14px' : '12px 16px 12px 20px',
      borderBottom: isLast ? 'none' : `1px solid ${T.lineSoft}`,
    }}>
      {identity}

      {!started && (
        <span style={{ fontSize: 12.5, color: T.faint, flexShrink: 0 }}>
          Joined {joinedAgo(participant.joinedAt)}
        </span>
      )}

      {started && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: isMobile ? 'space-between' : 'flex-end', gap: 8, flexShrink: 0, paddingLeft: isMobile ? 48 : 0 }}>
          {participant.resultReleased ? (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, height: 34, padding: isMobile ? 0 : '0 6px', fontSize: 13, fontWeight: 600, color: T.green }}>
              <span aria-hidden>✓</span>Released
            </span>
          ) : (
            <PillButton variant="secondary" onClick={onRelease} disabled={releasing} style={smallBtn}>
              {releasing ? 'Releasing…' : 'Release'}
            </PillButton>
          )}
          <PillButton variant="quiet" onClick={onView} style={{ ...smallBtn, color: T.ink, paddingRight: 10 }} ariaLabel={`Open ${participant.name}'s paper`}>
            Open paper<ChevronRight size={15} aria-hidden style={{ marginLeft: -3 }} />
          </PillButton>
        </div>
      )}
    </div>
  );
}
