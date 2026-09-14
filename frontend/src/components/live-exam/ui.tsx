import React, { useState } from 'react';
import { ChevronLeft } from 'lucide-react';
import { useMobile } from '@/hooks/useMobile';

/**
 * Shared surface for the live-exam screens.
 *
 * These four pages were the only ones in the product built from generic Tailwind
 * greys — `bg-gray-50`, `text-blue-600`, `bg-green-600` — while every other page
 * uses the platform's paper-and-vermilion system. Teachers move between them
 * mid-lesson, so the seam was visible exactly when there was least time to
 * absorb it. The tokens below are the platform's, not new ones.
 */

export const T = {
  ink: '#0B0B0E',
  accent: '#E2562B',
  accentText: '#C4471F', // accent as text or behind white text (AA)
  paper: '#FAF9F6',
  card: '#FFFFFF',
  line: '#E7E4DE',
  lineSoft: '#F2F0EC',
  wash: '#FBFAF8',
  muted: 'rgba(11,11,14,0.64)',
  faint: 'rgba(11,11,14,0.58)',
  english: '#2E7D5A',
  math: '#2563A8',
  amber: '#B8893E',
  green: '#1A6B3C',
  danger: '#C0392B',
} as const;

export const CARD: React.CSSProperties = {
  background: T.card,
  border: `1px solid ${T.line}`,
  borderRadius: 16,
  boxShadow: '0 1px 3px rgba(11,11,14,0.05)',
};

export const H1: React.CSSProperties = {
  fontFamily: 'var(--font-display)',
  fontWeight: 600,
  letterSpacing: '-0.02em',
  margin: 0,
};

/** Small uppercase label above a figure or a group. */
export const KICKER: React.CSSProperties = {
  fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: T.faint,
};

/**
 * Page frame shared by every live-exam screen: the same gutters as the rest of
 * the product (48px desktop, 16px phone) and one content width, so moving
 * between the list, the room and a marking sheet never shifts the left edge.
 */
export function LivePage({ children, width = 880 }: { children: React.ReactNode; width?: number }) {
  const isMobile = useMobile();
  return (
    <div className="screen-fade" style={{ padding: isMobile ? '20px 16px 96px' : '36px 48px 64px', maxWidth: width + (isMobile ? 32 : 96), boxSizing: 'border-box' }}>
      {children}
    </div>
  );
}

/** The "← Back" link at the top of a sub-page. */
export function BackLink({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 2, border: 'none', background: 'none',
        // Pulled left by the chevron's own side bearing so its stem sits on the text edge.
        padding: '6px 8px 6px 2px', margin: '-6px 0 12px -6px',
        fontSize: 13, fontWeight: 600, color: T.muted, cursor: 'pointer', fontFamily: 'inherit', borderRadius: 8,
      }}
    ><ChevronLeft size={16} strokeWidth={2} aria-hidden />{children}</button>
  );
}

/** The platform's pill button, in its three weights. */
export function PillButton({
  children, onClick, variant = 'primary', disabled, type = 'button', style, ariaLabel,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  variant?: 'primary' | 'secondary' | 'quiet';
  disabled?: boolean;
  type?: 'button' | 'submit';
  style?: React.CSSProperties;
  ariaLabel?: string;
}) {
  const palette = {
    primary: { background: T.accentText, color: '#fff', border: '1px solid transparent' },
    secondary: { background: '#fff', color: T.ink, border: `1px solid ${T.line}` },
    quiet: { background: 'transparent', color: T.muted, border: `1px solid ${T.line}` },
  }[variant];

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      style={{
        // Flex-centred so an icon and its label share one optical centre line.
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7,
        height: 40, padding: '0 20px', borderRadius: 9999, fontSize: 14, fontWeight: 600,
        fontFamily: 'inherit', cursor: disabled ? 'default' : 'pointer', boxSizing: 'border-box',
        opacity: disabled ? 0.45 : 1, whiteSpace: 'nowrap', flexShrink: 0, ...palette, ...style,
      }}
    >{children}</button>
  );
}

/**
 * Session state, in the platform's three status colours.
 *
 * Named for what a teacher sees in the room rather than for the database value:
 * a session is not "active", the class is sitting it.
 */
export function StatusPill({ status }: { status: string }) {
  const spec: Record<string, { label: string; color: string; bg: string }> = {
    waiting: { label: 'Lobby open', color: '#8A6020', bg: 'rgba(184,137,62,0.12)' },
    active: { label: 'In progress', color: T.green, bg: 'rgba(26,107,60,0.10)' },
    completed: { label: 'Finished', color: 'rgba(11,11,14,0.64)', bg: T.lineSoft },
  };
  const { label, color, bg } = spec[status] ?? spec.completed;

  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 6, height: 24, padding: '0 10px',
      borderRadius: 9999, background: bg, color, fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap',
    }}>
      <span aria-hidden style={{ width: 6, height: 6, borderRadius: 9999, background: color }} />
      {label}
    </span>
  );
}

/**
 * The join code, set to be read aloud.
 *
 * This is the one element in the product that has to work across a room: a
 * teacher dictates it while thirty people type it. So it gets one character per
 * cell — which is how you read a code out, character by character — at a size
 * that survives a projector, in the mono face the platform already reserves for
 * data. The server's alphabet omits I, O, 0 and 1 for the same reason, so no
 * character here is ambiguous when spoken.
 *
 * The large plate scales with the viewport so six cells always fit a phone.
 */
export function JoinCodePlate({ code, size = 'large' }: { code: string; size?: 'large' | 'small' }) {
  const large = size === 'large';

  return (
    <div
      role="img"
      style={{ display: 'flex', gap: large ? 'clamp(5px, 1.6vw, 8px)' : 4 }}
      aria-label={`Join code ${code.split('').join(' ')}`}
    >
      {code.split('').map((char, i) => (
        <span
          key={i}
          aria-hidden
          style={{
            width: large ? 'clamp(36px, 11vw, 48px)' : 26,
            height: large ? 'clamp(46px, 14vw, 60px)' : 32,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            borderRadius: large ? 10 : 6,
            background: T.wash, border: `1px solid ${T.line}`,
            fontFamily: 'var(--font-mono)', fontSize: large ? 'clamp(22px, 7vw, 30px)' : 16,
            fontWeight: 600, color: T.ink, lineHeight: 1,
          }}
        >{char}</span>
      ))}
    </div>
  );
}

/** Copies text and says so in place, rather than firing a toast the room won't see. */
export function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <PillButton
      variant="secondary"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1800);
        } catch {
          // Clipboard access can be refused; the code is on screen either way.
        }
      }}
      style={{ height: 36, padding: '0 14px', fontSize: 13, color: copied ? T.green : T.ink, minWidth: 96 }}
    >
      <span aria-live="polite">{copied ? 'Copied ✓' : label}</span>
    </PillButton>
  );
}

/** A figure with its label, for the at-a-glance rows. */
export function StatTile({ label, value, sub, color }: { label: string; value: React.ReactNode; sub?: React.ReactNode; color?: string }) {
  return (
    <div style={{ ...CARD, padding: '14px 18px', minWidth: 0 }}>
      <div style={{ ...KICKER, marginBottom: 6 }}>{label}</div>
      <div style={{ ...H1, fontSize: 30, lineHeight: 1, color: color ?? T.ink, fontVariantNumeric: 'tabular-nums' }}>{value}</div>
      {sub && <div style={{ fontSize: 12.5, color: T.muted, marginTop: 6 }}>{sub}</div>}
    </div>
  );
}

/** Consistent empty states: say what is missing and what to do about it. */
export function EmptyState({ title, children, action }: { title: string; children?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div style={{ ...CARD, padding: '44px 24px', textAlign: 'center' }}>
      <div style={{ ...H1, fontSize: 24, color: 'rgba(11,11,14,0.72)', marginBottom: 6 }}>{title}</div>
      {children && (
        <p style={{ fontSize: 14, color: T.muted, margin: '0 auto', maxWidth: 400, lineHeight: 1.6 }}>
          {children}
        </p>
      )}
      {action && <div style={{ marginTop: 18, display: 'flex', justifyContent: 'center' }}>{action}</div>}
    </div>
  );
}

/** Skeleton rows while a list loads, so the page keeps its shape instead of jumping. */
export function LoadingRows({ rows = 3, height = 68 }: { rows?: number; height?: number }) {
  return (
    <div role="status" aria-label="Loading" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="live-skeleton" style={{ height, borderRadius: 16, background: T.lineSoft }} />
      ))}
      <style>{`
        .live-skeleton { animation: live-skeleton 1.4s ease-in-out infinite; }
        @keyframes live-skeleton { 0%, 100% { opacity: 1; } 50% { opacity: 0.55; } }
        @media (prefers-reduced-motion: reduce) { .live-skeleton { animation: none; } }
      `}</style>
    </div>
  );
}

export function ErrorNote({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div role="alert" style={{
      display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
      background: 'rgba(192,57,43,0.06)', border: '1px solid rgba(192,57,43,0.2)',
      borderRadius: 12, padding: '10px 16px', fontSize: 13.5, color: T.danger, lineHeight: 1.5,
    }}>
      <span style={{ flex: 1, minWidth: 180 }}>{children}</span>
      {action}
    </div>
  );
}

/**
 * Question text arrives as authored HTML (the player renders it). Anywhere it is
 * shown as a one-line summary it has to be flattened, or the tags print.
 */
export function plainText(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  return (doc.body.textContent ?? '').replace(/\s+/g, ' ').trim();
}

/** Hover lift for clickable cards. Colour and shadow only, so it stays instant-feeling. */
export const HOVER_CSS = `
  .live-row { transition-property: box-shadow, border-color, transform; transition-duration: 150ms; transition-timing-function: cubic-bezier(0.2, 0, 0, 1); }
  @media (hover: hover) { .live-row:hover { border-color: #D8D4CC !important; box-shadow: var(--shadow-md) !important; } }
`;
