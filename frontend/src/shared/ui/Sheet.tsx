import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';

/**
 * A bottom sheet you can grab.
 *
 * It tracks the finger 1:1 from wherever it was grabbed, resists past its top
 * edge instead of stopping hard, and on release projects the flick's momentum
 * to decide between settling open and dismissing — so a short fast flick
 * dismisses and a slow drag halfway does not. Grabbing it mid-animation picks
 * it up from where it is on screen, never from where it was headed.
 *
 * CSS transitions can't take an initial velocity, so the release hands off
 * speed by shortening the settle duration in proportion to how fast the
 * finger was moving.
 */

const EASE = 'cubic-bezier(0.32, 0.72, 0, 1)';
const SETTLE_MS = 380;
const CLOSE_MS = 240; // exits are faster than entries
const DRAG_THRESHOLD = 8;
const VELOCITY_WINDOW_MS = 100;

/** Apple's momentum projection: where a flick at `v` px/s would come to rest. */
function project(v: number, decelerationRate = 0.998) {
  return ((v / 1000) * decelerationRate) / (1 - decelerationRate);
}

/** Progressive resistance past a boundary. */
function rubberband(overshoot: number, dimension: number, constant = 0.55) {
  return (overshoot * dimension * constant) / (dimension + constant * Math.abs(overshoot));
}

function settleDuration(distance: number, velocity: number) {
  if (Math.abs(velocity) < 80) return SETTLE_MS;
  return Math.min(SETTLE_MS, Math.max(180, (distance / Math.abs(velocity)) * 1000 * 1.8));
}

interface SheetProps {
  open: boolean;
  onClose: () => void;
  label: string;
  children: React.ReactNode;
}

export function Sheet({ open, onClose, label, children }: SheetProps) {
  const [mounted, setMounted] = useState(open);
  const sheetRef = useRef<HTMLDivElement>(null);
  const scrimRef = useRef<HTMLDivElement>(null);
  const unmountTimer = useRef<number>();
  const releaseVelocity = useRef(0);
  const suppressClick = useRef(false);
  const drag = useRef<{
    id: number;
    startY: number;
    startOffset: number;
    active: boolean;
    history: { y: number; t: number }[];
  } | null>(null);

  const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const height = () => sheetRef.current?.offsetHeight || 400;

  /** The sheet's live on-screen offset — the value any new motion starts from. */
  const presentationY = () => {
    const el = sheetRef.current;
    if (!el) return 0;
    const t = getComputedStyle(el).transform;
    return t && t !== 'none' ? new DOMMatrixReadOnly(t).m42 : 0;
  };

  const place = (y: number, ms: number) => {
    const el = sheetRef.current;
    const scrim = scrimRef.current;
    if (!el) return;
    const h = height();
    const fade = reducedMotion() && ms > 0;
    const transition = ms > 0 ? (fade ? `opacity ${Math.min(ms, 200)}ms ease` : `transform ${ms}ms ${EASE}`) : 'none';

    el.style.transition = transition;
    if (fade) {
      el.style.transform = 'none';
      el.style.opacity = y >= h ? '0' : '1';
    } else {
      el.style.transform = `translate3d(0, ${y}px, 0)`;
      el.style.opacity = '1';
    }
    if (scrim) {
      scrim.style.transition = ms > 0 ? `opacity ${Math.min(ms, 300)}ms ease` : 'none';
      scrim.style.opacity = String(Math.max(0, Math.min(1, 1 - y / h)));
    }
  };

  // Mount on open; on close, animate out from the current position, then unmount.
  useEffect(() => {
    window.clearTimeout(unmountTimer.current);
    if (open) {
      setMounted(true);
      return;
    }
    if (!mounted) return;
    const from = presentationY();
    const to = height();
    const ms = releaseVelocity.current
      ? settleDuration(to - from, releaseVelocity.current)
      : CLOSE_MS;
    releaseVelocity.current = 0;
    place(to, ms);
    unmountTimer.current = window.setTimeout(() => setMounted(false), ms + 30);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useLayoutEffect(() => {
    if (!mounted || !open) return;
    const el = sheetRef.current;
    if (!el) return;
    // Reopening mid-dismiss continues from where it is; a fresh open starts below.
    if (!el.style.transform) place(height(), 0);
    void el.offsetHeight; // commit the start frame before transitioning
    place(0, SETTLE_MS);
    el.focus({ preventScroll: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mounted, open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  useEffect(() => () => window.clearTimeout(unmountTimer.current), []);

  if (!mounted) return null;

  const onPointerMove = (e: PointerEvent) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    if (!d.active) {
      if (Math.abs(e.clientY - d.startY) < DRAG_THRESHOLD) return;
      d.active = true;
      d.startY = e.clientY; // begin tracking from here, so there is no jump
    }
    let y = d.startOffset + (e.clientY - d.startY);
    if (y < 0) y = -rubberband(-y, height());
    place(y, 0);
    d.history.push({ y: e.clientY, t: e.timeStamp });
    while (d.history.length > 2 && e.timeStamp - d.history[0].t > VELOCITY_WINDOW_MS) d.history.shift();
  };

  const onPointerEnd = (e: PointerEvent) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    drag.current = null;
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', onPointerEnd);
    window.removeEventListener('pointercancel', onPointerEnd);
    if (!d.active) return;

    suppressClick.current = true;
    window.setTimeout(() => { suppressClick.current = false; }, 0);

    const first = d.history[0];
    const last = d.history[d.history.length - 1];
    const dt = last.t - first.t;
    const velocity = dt > 0 ? ((last.y - first.y) / dt) * 1000 : 0;
    const current = presentationY();
    const h = height();

    if (current + project(velocity) > h * 0.5) {
      releaseVelocity.current = velocity;
      onClose();
    } else {
      place(0, settleDuration(Math.abs(current), velocity));
    }
  };

  // Tracked on window, not the sheet: an upward drag leaves the sheet at once,
  // and the finger must stay in control wherever it goes.
  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (drag.current) return;
    const current = presentationY();
    drag.current = {
      id: e.pointerId,
      startY: e.clientY,
      startOffset: current,
      active: false,
      history: [{ y: e.clientY, t: e.timeStamp }],
    };
    // Caught mid-flight: freeze it under the finger immediately.
    if (Math.abs(current) > 1) {
      place(current, 0);
      drag.current.active = true;
    }
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerEnd);
    window.addEventListener('pointercancel', onPointerEnd);
  };

  return (
    <>
      <div ref={scrimRef} className="sheet-scrim" style={{ opacity: 0 }} onClick={onClose} />
      <div
        ref={sheetRef}
        className="sheet"
        role="dialog"
        aria-modal="true"
        aria-label={label}
        tabIndex={-1}
        onPointerDown={onPointerDown}
        onClickCapture={(e) => { if (suppressClick.current) { e.stopPropagation(); e.preventDefault(); } }}
        style={{ outline: 'none' }}
      >
        <div className="sheet-grabber" aria-hidden><span /></div>
        {children}
      </div>
    </>
  );
}
