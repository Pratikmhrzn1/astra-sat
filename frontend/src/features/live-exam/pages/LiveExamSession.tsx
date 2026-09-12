import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import {
  getSessionDetail, startSession, releaseOne, releaseAll,
  type SessionDetail, type LiveExamParticipant,
} from '@/features/live-exam/api/live-exam.api';
import { getApiError } from '@/shared/api/client';
import {
  CARD, CopyButton, ErrorNote, H1, JoinCodePlate, PillButton, StatusPill, T,
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
  const [session, setSession] = useState<SessionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionError, setActionError] = useState('');
  const [starting, setStarting] = useState(false);
  const [releasing, setReleasing] = useState(false);
  const statusRef = useRef<string | null>(null);

  const load = useCallback(async () => {
    if (!sessionId) return;
    try {
      const next = await getSessionDetail(sessionId);
      statusRef.current = next.status;
      setSession(next);
    } catch {
      // A transient failure between polls is not worth interrupting the lesson for.
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  // Polls only while something can still change. A finished session used to keep
  // refreshing every three seconds for as long as the tab stayed open.
  useEffect(() => {
    load();
    const interval = setInterval(() => {
      if (statusRef.current === 'completed') return;
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

  if (loading) {
    return <div style={{ padding: '64px 48px', textAlign: 'center', color: T.faint, fontSize: 14 }}>Loading…</div>;
  }
  if (!session) {
    return (
      <div style={{ padding: '36px 48px' }}>
        <ErrorNote>This session no longer exists. It may have been deleted.</ErrorNote>
      </div>
    );
  }

  const { participants, status } = session;
  const released = participants.filter((p) => p.resultReleased).length;
  const joinUrl = `${window.location.origin}/sat/live/${session.joinCode}`;
  const notStarted = status === 'waiting';

  return (
    <div className="screen-fade" style={{ padding: '36px 48px 64px', maxWidth: 880 }}>
      <button
        onClick={() => navigate('/teacher/live-exams')}
        style={{ display: 'flex', alignItems: 'center', gap: 4, border: 'none', background: 'none', padding: 0, marginBottom: 18, fontSize: 13, fontWeight: 600, color: T.muted, cursor: 'pointer', fontFamily: 'inherit' }}
      ><ChevronLeft size={15} />Live exams</button>

      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 20, flexWrap: 'wrap', marginBottom: 24 }}>
        <div>
          <h1 style={{ ...H1, fontSize: 40, marginBottom: 8 }}>{session.title}</h1>
          <StatusPill status={status} />
        </div>
        {notStarted ? (
          <PillButton
            onClick={() => run(() => startSession(session.id), setStarting)}
            disabled={starting || participants.length === 0}
            style={{ height: 44, fontSize: 15 }}
          >{starting ? 'Starting…' : 'Start exam'}</PillButton>
        ) : (
          released < participants.length && (
            <PillButton
              onClick={() => run(() => releaseAll(session.id), setReleasing)}
              disabled={releasing}
              style={{ height: 44, fontSize: 15 }}
            >{releasing ? 'Releasing…' : `Release all results (${participants.length - released})`}</PillButton>
          )
        )}
      </div>

      {actionError && <div style={{ marginBottom: 20 }}><ErrorNote>{actionError}</ErrorNote></div>}

      {/* The code, sized to be read across a room. Only shown while it can still
          be used — once everyone is sitting the paper it is just noise. */}
      {notStarted && (
        <div style={{ ...CARD, padding: '26px 28px', marginBottom: 22 }}>
          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 24, flexWrap: 'wrap' }}>
            <div>
              <p style={{ fontSize: 14, color: T.muted, margin: '0 0 14px' }}>
                Read this out. Students enter it under <strong style={{ color: T.ink, fontWeight: 600 }}>Live Exam</strong>.
              </p>
              <JoinCodePlate code={session.joinCode} />
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <CopyButton value={session.joinCode} label="Copy code" />
              <CopyButton value={joinUrl} label="Copy link" />
            </div>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 12 }}>
        <h2 style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>
          {notStarted ? 'In the lobby' : 'Sitting the exam'}
        </h2>
        <span style={{ fontSize: 13, color: T.muted, fontFamily: "'JetBrains Mono', monospace" }}>
          {participants.length}
          {!notStarted && participants.length > 0 && ` · ${released} released`}
        </span>
        {!notStarted && (
          <span style={{ marginLeft: 'auto', fontSize: 12.5, color: T.faint }}>Code {session.joinCode}</span>
        )}
      </div>

      {participants.length === 0 ? (
        <div style={{ ...CARD, padding: '40px 24px', textAlign: 'center' }}>
          <p style={{ fontSize: 14.5, color: T.muted, margin: 0, lineHeight: 1.6 }}>
            Nobody has joined yet.<br />
            Read out the code above — names appear here as students arrive.
          </p>
        </div>
      ) : (
        <div style={{ ...CARD, overflow: 'hidden' }}>
          {participants.map((p, i) => (
            <ParticipantRow
              key={p.id}
              participant={p}
              isLast={i === participants.length - 1}
              sessionStatus={status}
              onRelease={() => run(() => releaseOne(session.id, p.id), () => {})}
              onView={() => navigate(`/teacher/live-exams/${session.id}/participants/${p.id}`)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ParticipantRow({
  participant, isLast, sessionStatus, onRelease, onView,
}: {
  participant: LiveExamParticipant;
  isLast: boolean;
  sessionStatus: string;
  onRelease: () => void;
  onView: () => void;
}) {
  const started = sessionStatus !== 'waiting';

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 14, padding: '14px 20px',
      borderBottom: isLast ? 'none' : `1px solid ${T.lineSoft}`,
    }}>
      <span style={{
        width: 32, height: 32, borderRadius: 9999, flexShrink: 0, background: T.lineSoft,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 13, fontWeight: 600, color: 'rgba(11,11,14,0.55)',
      }}>{participant.name.charAt(0).toUpperCase()}</span>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14.5, fontWeight: 600, color: T.ink }}>{participant.name}</div>
        <div style={{ fontSize: 12, color: T.muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {participant.email}
        </div>
      </div>

      {!started && (
        <span style={{ fontSize: 12, color: T.faint, flexShrink: 0 }}>
          {joinedAgo(participant.joinedAt)}
        </span>
      )}

      {started && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          {participant.resultReleased ? (
            <span style={{ fontSize: 12.5, fontWeight: 600, color: T.green }}>Released</span>
          ) : (
            <PillButton variant="secondary" onClick={onRelease} style={{ height: 32, padding: '0 13px', fontSize: 12.5 }}>
              Release
            </PillButton>
          )}
          <PillButton variant="quiet" onClick={onView} style={{ height: 32, padding: '0 13px', fontSize: 12.5 }}>
            Mark
          </PillButton>
        </div>
      )}
    </div>
  );
}
