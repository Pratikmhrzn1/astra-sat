import React, { useState } from 'react';

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

/** The platform's pill button, in its three weights. */
export function PillButton({
  children, onClick, variant = 'primary', disabled, type = 'button', style,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  variant?: 'primary' | 'secondary' | 'quiet';
  disabled?: boolean;
  type?: 'button' | 'submit';
  style?: React.CSSProperties;
}) {
  const palette = {
    primary: { background: T.accentText, color: '#fff', border: 'none' },
    secondary: { background: '#fff', color: T.ink, border: `1px solid ${T.line}` },
    quiet: { background: 'transparent', color: T.muted, border: `1px solid ${T.line}` },
  }[variant];

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      style={{
        height: 40, padding: '0 20px', borderRadius: 9999, fontSize: 14, fontWeight: 600,
        fontFamily: 'inherit', cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.45 : 1, whiteSpace: 'nowrap', ...palette, ...style,
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
      display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 11px',
      borderRadius: 9999, background: bg, color, fontSize: 12, fontWeight: 600,
    }}>
      <span style={{ width: 6, height: 6, borderRadius: 9999, background: color }} />
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
 * It is also the only loud thing on the page. Everything around it is quiet.
 */
export function JoinCodePlate({ code, size = 'large' }: { code: string; size?: 'large' | 'small' }) {
  const cell = size === 'large' ? { w: 46, h: 58, font: 30 } : { w: 26, h: 32, font: 16 };

  return (
    <div style={{ display: 'flex', gap: size === 'large' ? 8 : 4 }} aria-label={`Join code ${code.split('').join(' ')}`}>
      {code.split('').map((char, i) => (
        <span
          key={i}
          aria-hidden
          style={{
            width: cell.w, height: cell.h, display: 'flex', alignItems: 'center',
            justifyContent: 'center', borderRadius: size === 'large' ? 10 : 6,
            background: T.wash, border: `1px solid ${T.line}`,
            fontFamily: 'var(--font-mono)', fontSize: cell.font,
            fontWeight: 600, color: T.ink,
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
      style={{ height: 34, padding: '0 14px', fontSize: 13 }}
    >{copied ? 'Copied' : label}</PillButton>
  );
}

/** Consistent empty states: say what is missing and what to do about it. */
export function EmptyState({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div style={{ ...CARD, padding: '48px 24px', textAlign: 'center' }}>
      <div style={{ ...H1, fontSize: 24, color: 'rgba(11,11,14,0.64)', marginBottom: 6 }}>{title}</div>
      {children && (
        <p style={{ fontSize: 14, color: T.muted, margin: '0 auto', maxWidth: 380, lineHeight: 1.6 }}>
          {children}
        </p>
      )}
    </div>
  );
}

export function ErrorNote({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      background: 'rgba(192,57,43,0.06)', border: '1px solid rgba(192,57,43,0.2)',
      borderRadius: 12, padding: '10px 16px', fontSize: 13.5, color: T.danger, lineHeight: 1.5,
    }}>{children}</div>
  );
}
