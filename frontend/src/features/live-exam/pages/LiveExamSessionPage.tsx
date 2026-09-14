import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import {
  getSessionDetail, startSession, releaseOne, releaseAll,
  type SessionDetail, type LiveExamParticipant,
} from '@/features/live-exam/api';
import { getApiError } from '@/shared/api/http';
import { Modal, EmptyState, Button, surfaceClass, kickerClass } from '@/shared/ui';
import { BackLink, CopyButton, ErrorNote, JoinCodePlate, LivePage, LoadingRows, StatTile, StatusPill, liveTitleClass } from '@/features/live-exam/components/ui';
import { cn } from '@/shared/lib/utils';

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
        <div className="h-10 w-[260px] rounded-[10px] bg-sunken mb-6" />
        <LoadingRows rows={3} height={72} />
      </LivePage>
    );
  }
  if (!session) {
    return (
      <LivePage>
        <BackLink onClick={() => navigate('/teacher/live-exams')}>Live exams</BackLink>
        <ErrorNote action={loadError ? <Button type="button" variant="secondary" onClick={() => { setLoading(true); load(); }} className="h-8 text-[13px]">Try again</Button> : undefined}>
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

  const primaryClass = 'h-11 text-[15px] px-6 w-full sm:w-auto';
  const primaryAction = notStarted ? (
    <Button type="button"
      onClick={() => setConfirm('start')}
      disabled={starting || participants.length === 0}
      className={primaryClass}
    >{starting ? 'Starting…' : 'Start exam'}</Button>
  ) : pending > 0 && participants.length > 0 ? (
    <Button type="button"
      onClick={() => setConfirm('releaseAll')}
      disabled={releasing}
      className={primaryClass}
    >{releasing ? 'Releasing…' : `Release all results (${pending})`}</Button>
  ) : null;

  return (
    <LivePage>
      <BackLink onClick={() => navigate('/teacher/live-exams')}>Live exams</BackLink>

      <div className="flex flex-col sm:flex-row items-stretch sm:items-start justify-between gap-4 mb-[22px]">
        <div className="min-w-0">
          <h1 className={cn(liveTitleClass, 'text-[30px] sm:text-[40px] leading-[1.12] mb-2.5 [overflow-wrap:anywhere]')}>{session.title}</h1>
          <div className="flex items-center gap-3 flex-wrap">
            <StatusPill status={status} />
            {live && (
              <span className="inline-flex items-center gap-1.5 text-[12.5px] text-muted">
                <span aria-hidden className="w-[7px] h-[7px] rounded-full bg-green-dark animate-live-beat motion-reduce:animate-none" />Updates live
              </span>
            )}
            {!notStarted && (
              <span className="text-[12.5px] text-muted">
                Code <span className="font-mono text-subtle font-semibold">{session.joinCode}</span>
              </span>
            )}
          </div>
        </div>
        {primaryAction && (
          <div className="flex flex-col items-stretch sm:items-end gap-1.5 shrink-0">
            {primaryAction}
            {notStarted && participants.length === 0 && (
              <span className="text-[12.5px] text-muted text-center sm:text-right">Available once a student joins</span>
            )}
          </div>
        )}
      </div>

      {actionError && <div className="mb-[18px]"><ErrorNote>{actionError}</ErrorNote></div>}

      {/* The code, sized to be read across a room. Only shown while it can still
          be used — once everyone is sitting the paper it is just noise. */}
      {notStarted ? (
        <div className={cn(surfaceClass, 'px-4 py-5 sm:px-7 sm:py-6 mb-[22px]')}>
          <div className={cn(kickerClass, 'mb-1.5')}>Join code</div>
          <p className="text-sm text-subtle mt-0 mb-4 leading-[1.55]">
            Read this out. Students enter it under <strong className="text-ink font-semibold">Live Exam</strong>, or open the link.
          </p>
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <JoinCodePlate code={session.joinCode} />
            <div className="flex gap-2">
              <CopyButton value={session.joinCode} label="Copy code" />
              <CopyButton value={joinUrl} label="Copy link" />
            </div>
          </div>
        </div>
      ) : participants.length > 0 && (
        <div className="grid grid-cols-2 gap-2.5 mb-[22px]">
          <StatTile label="Students" value={participants.length} sub={status === 'completed' ? 'sat this exam' : 'sitting the exam'} />
          <StatTile
            label="Results released"
            value={<>{released}<span className="text-lg text-muted"> / {participants.length}</span></>}
            valueClassName={pending === 0 ? 'text-green-dark' : 'text-ink'}
            sub={
              <span className="block h-1 rounded-full bg-sunken overflow-hidden mt-1">
                <span
                  className="block h-full bg-green-dark rounded-full transition-[width] duration-300 ease-[cubic-bezier(0.2,0,0,1)]"
                  style={{ width: `${(released / participants.length) * 100}%` }}
                />
              </span>
            }
          />
        </div>
      )}

      <div className="flex items-baseline justify-between gap-3 mb-2.5">
        <h2 className="text-base font-semibold m-0">
          {notStarted ? 'In the lobby' : 'Students'}
          <span className="ml-2 text-[13px] font-medium text-muted tnum">{participants.length}</span>
        </h2>
        {!notStarted && pending > 0 && (
          <span className="hidden sm:inline text-[12.5px] text-muted">Open a paper to mark it and add notes</span>
        )}
      </div>

      {participants.length === 0 ? (
        <EmptyState className="py-11" titleClassName="text-2xl text-ink/[.72]" title={notStarted ? 'Waiting for students' : 'Nobody joined'}>
          {notStarted
            ? 'Read out the code above. Names appear here as students arrive.'
            : 'No students joined this session before it started.'}
        </EmptyState>
      ) : (
        <div className={cn(surfaceClass, 'overflow-hidden')}>
          {participants.map((p) => (
            <ParticipantRow
              key={p.id}
              participant={p}
              sessionStatus={status}
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
            <Button type="button" variant="secondary" onClick={() => setConfirm(null)}>Cancel</Button>
            <Button type="button"
              onClick={() => {
                const action = confirm;
                setConfirm(null);
                if (action === 'start') run(() => startSession(session.id), setStarting);
                else run(() => releaseAll(session.id), setReleasing);
              }}
            >{confirm === 'start' ? `Start for ${participants.length}` : `Release ${pending}`}</Button>
          </>
        }
      >
        <p className="m-0 text-subtle text-[14.5px] leading-[1.6]">
          {confirm === 'start'
            ? `The paper opens for the ${participants.length} student${participants.length === 1 ? '' : 's'} in the lobby and the clock starts. Students who join later start late.`
            : `${pending} student${pending === 1 ? '' : 's'} will see their scores, answers and any notes you have saved. This can't be undone.`}
        </p>
      </Modal>
    </LivePage>
  );
}

function ParticipantRow({
  participant, sessionStatus, releasing, onRelease, onView,
}: {
  participant: LiveExamParticipant;
  sessionStatus: string;
  releasing: boolean;
  onRelease: () => void;
  onView: () => void;
}) {
  const started = sessionStatus !== 'waiting';
  const initials = participant.name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join('');

  const identity = (
    <div className="flex items-center gap-3 flex-1 min-w-0">
      <span aria-hidden className="w-9 h-9 rounded-full shrink-0 bg-sunken flex items-center justify-center text-[13px] font-semibold text-subtle">
        {initials || '?'}
      </span>
      <div className="min-w-0">
        <div className="text-[14.5px] font-semibold text-ink truncate">{participant.name}</div>
        <div className="text-[12.5px] text-subtle truncate">{participant.email}</div>
      </div>
    </div>
  );

  const smallBtn = 'h-[34px] px-3.5 text-[13px]';

  return (
    <div
      className={cn(
        'flex px-3.5 py-3 sm:pl-5 sm:pr-4 border-b border-sunken last:border-b-0',
        started ? 'flex-col items-stretch gap-2.5 sm:flex-row sm:items-center sm:gap-3.5' : 'flex-row items-center gap-3.5',
      )}
    >
      {identity}

      {!started && (
        <span className="text-[12.5px] text-muted shrink-0">
          Joined {joinedAgo(participant.joinedAt)}
        </span>
      )}

      {started && (
        <div className="flex items-center justify-between sm:justify-end gap-2 shrink-0 pl-12 sm:pl-0">
          {participant.resultReleased ? (
            <span className="inline-flex items-center gap-[5px] h-[34px] px-0 sm:px-1.5 text-[13px] font-semibold text-green-dark">
              <span aria-hidden>✓</span>Released
            </span>
          ) : (
            <Button type="button" variant="secondary" onClick={onRelease} disabled={releasing} className={smallBtn}>
              {releasing ? 'Releasing…' : 'Release'}
            </Button>
          )}
          <Button type="button" variant="quiet" onClick={onView} className={cn(smallBtn, 'text-ink pr-2.5')} aria-label={`Open ${participant.name}'s paper`}>
            Open paper<ChevronRight size={15} aria-hidden className="-ml-[3px]" />
          </Button>
        </div>
      )}
    </div>
  );
}
