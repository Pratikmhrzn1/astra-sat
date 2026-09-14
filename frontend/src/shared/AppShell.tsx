import React, { useEffect, useRef, useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/store/auth';
import { Sheet } from '@/components/common';

/**
 * The navigation chrome shared by all three roles.
 *
 * One structure, three widths, so a person moving between devices always
 * finds the same destinations in the same order:
 *   ≥1280px  a persistent sidebar with labels
 *   640–1279 an icon rail that opens over content on hover or keyboard focus
 *   <640px   a translucent tab bar with the most-used destinations, and a
 *            grabbable "More" sheet holding the rest in sidebar order
 *
 * Styling lives in index.css under "App shell".
 */

export interface ShellNavItem {
  path: string;
  label: string;
  icon: React.ReactNode;
  /** Shorter label for the phone tab bar. */
  tabLabel?: string;
}

export interface ShellAction {
  label: string;
  icon?: React.ReactNode;
  onClick: () => void;
}

interface AppShellProps {
  nav: ShellNavItem[];
  /** Paths from `nav` shown directly in the phone tab bar (up to four). */
  tabPaths: string[];
  roleLabel?: string;
  /** Small status shown beside the role label, e.g. an offline marker. */
  status?: React.ReactNode;
  profileSubtitle: string;
  /** Profile-menu entries above "Sign out". */
  menuActions?: ShellAction[];
  /** A secondary action pinned above the profile, also listed in the More sheet. */
  utilityAction?: ShellAction;
  /** Overlays owned by the role layout: modals, toasts. */
  children?: React.ReactNode;
}

const ITEM_PITCH = 42; // item height 40 + gap 2 — keeps the indicator aligned

const SignOutIcon = (
  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="M16 17l5-5-5-5" /><path d="M21 12H9" />
  </svg>
);

const MoreIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <circle cx="5" cy="12" r="1.4" fill="currentColor" stroke="none" />
    <circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none" />
    <circle cx="19" cy="12" r="1.4" fill="currentColor" stroke="none" />
  </svg>
);

export function BrandMark() {
  return (
    <div style={{ width: 24, height: 24, borderRadius: 7, background: '#E2562B', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: 'inset 0 -1px 0 rgba(0,0,0,0.12)' }}>
      <div style={{ width: 9, height: 9, borderRadius: 2.5, background: '#fff' }} />
    </div>
  );
}

export default function AppShell({
  nav, tabPaths, roleLabel, status, profileSubtitle, menuActions = [], utilityAction, children,
}: AppShellProps) {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const footerRef = useRef<HTMLDivElement>(null);
  const mainRef = useRef<HTMLElement>(null);

  const initials = user?.name.split(' ').map((w: string) => w[0]).slice(0, 2).join('') ?? '?';
  const isActive = (p: string) => location.pathname === p || location.pathname.startsWith(p + '/');
  const activeIndex = nav.findIndex((item) => isActive(item.path));

  const tabs = tabPaths.map((p) => nav.find((n) => n.path === p)).filter(Boolean) as ShellNavItem[];
  const overflow = nav.filter((n) => !tabPaths.includes(n.path));
  const overflowActive = overflow.some((n) => isActive(n.path));

  const go = (path: string) => { setMenuOpen(false); setMoreOpen(false); navigate(path); };
  const signOut = () => { logout(); navigate('/login', { replace: true }); };

  // A new destination starts at its top, and closes any transient chrome.
  useEffect(() => {
    mainRef.current?.scrollTo({ top: 0 });
    setMenuOpen(false);
    setMoreOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: PointerEvent) => {
      if (!footerRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenuOpen(false); };
    document.addEventListener('pointerdown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [menuOpen]);

  return (
    <div style={{ minHeight: '100vh', background: '#FAF9F6' }}>
      {/* ── Sidebar / rail ─────────────────────────────────────────────── */}
      <nav className="shell-sidebar" aria-label="Main">
        <div className="shell-brand">
          <BrandMark />
          <span className="shell-label shell-brand-name">Score Studio</span>
        </div>

        {(roleLabel || status) && (
          <div className="shell-eyebrow">
            <span className="shell-label">{roleLabel}</span>
            {status && <span className="shell-label">{status}</span>}
          </div>
        )}

        <div className="scrollarea" style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden' }}>
          <div className="shell-list">
            <span
              className="shell-indicator"
              aria-hidden
              style={{
                transform: `translateY(${Math.max(activeIndex, 0) * ITEM_PITCH}px)`,
                opacity: activeIndex >= 0 ? 1 : 0,
              }}
            />
            {nav.map((item) => (
              <button
                key={item.path}
                className="shell-item"
                aria-current={isActive(item.path) ? 'page' : undefined}
                title={item.label}
                onClick={() => go(item.path)}
              >
                <span className="shell-icon">{item.icon}</span>
                <span className="shell-label">{item.label}</span>
              </button>
            ))}
          </div>
        </div>

        {utilityAction && (
          <div style={{ padding: '4px 14px 8px' }}>
            <button className="shell-item" title={utilityAction.label} onClick={utilityAction.onClick}>
              <span className="shell-icon">{utilityAction.icon}</span>
              <span className="shell-label">{utilityAction.label}</span>
            </button>
          </div>
        )}

        <div className="shell-footer" ref={footerRef}>
          {menuOpen && (
            <div className="shell-menu pop" role="menu">
              <div style={{ padding: '8px 10px 10px' }}>
                <div style={{ fontSize: 14, fontWeight: 600, letterSpacing: '-0.01em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user?.name}</div>
                <div style={{ fontSize: 12.5, color: 'rgba(11,11,14,0.64)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user?.email}</div>
              </div>
              <div style={{ height: 1, background: 'rgba(11,11,14,0.08)', margin: '0 4px 4px' }} />
              {menuActions.map((a) => (
                <button key={a.label} role="menuitem" className="shell-menu-item" onClick={() => { setMenuOpen(false); a.onClick(); }}>
                  {a.icon}{a.label}
                </button>
              ))}
              <button role="menuitem" className="shell-menu-item is-destructive" onClick={signOut}>
                {SignOutIcon}Sign out
              </button>
            </div>
          )}
          <button
            className="shell-item"
            style={{ height: 52, padding: '0 8px' }}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((o) => !o)}
          >
            <span className="shell-avatar">{initials}</span>
            <span className="shell-label" style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.25 }}>
              <span style={{ fontSize: 13.5, fontWeight: 600, color: '#0B0B0E', letterSpacing: '-0.01em' }}>{user?.name}</span>
              <span style={{ fontSize: 12, fontWeight: 400, color: 'rgba(11,11,14,0.58)' }}>{profileSubtitle}</span>
            </span>
          </button>
        </div>
      </nav>

      <main ref={mainRef} className="scrollarea shell-main">
        <Outlet />
      </main>

      {/* ── Tab bar (phones) ───────────────────────────────────────────── */}
      <nav className="shell-tabbar" aria-label="Main">
        {tabs.map((item) => (
          <button
            key={item.path}
            className="shell-tab"
            aria-current={isActive(item.path) ? 'page' : undefined}
            onClick={() => go(item.path)}
          >
            {item.icon}
            <span>{item.tabLabel ?? item.label}</span>
          </button>
        ))}
        {(overflow.length > 0 || utilityAction) && (
          <button
            className={`shell-tab${moreOpen ? ' is-open' : ''}`}
            aria-current={overflowActive && !moreOpen ? 'page' : undefined}
            aria-haspopup="dialog"
            aria-expanded={moreOpen}
            onClick={() => setMoreOpen((o) => !o)}
          >
            {MoreIcon}
            <span>More</span>
          </button>
        )}
      </nav>

      <Sheet open={moreOpen} onClose={() => setMoreOpen(false)} label="More">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '6px 20px 14px' }}>
          <span className="shell-avatar" style={{ width: 40, height: 40, fontSize: 14 }}>{initials}</span>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 16, fontWeight: 600, letterSpacing: '-0.015em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user?.name}</div>
            <div style={{ fontSize: 13, color: 'rgba(11,11,14,0.64)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user?.email}</div>
          </div>
        </div>
        <div style={{ height: 0.5, background: 'rgba(11,11,14,0.12)' }} />
        <div style={{ padding: '6px 0' }}>
          {overflow.map((item) => (
            <button
              key={item.path}
              className="sheet-row"
              aria-current={isActive(item.path) ? 'page' : undefined}
              onClick={() => go(item.path)}
            >
              <span className="sheet-row-icon">{item.icon}</span>
              {item.label}
            </button>
          ))}
        </div>
        <div style={{ height: 0.5, background: 'rgba(11,11,14,0.12)' }} />
        <div style={{ padding: '6px 0 12px' }}>
          {utilityAction && (
            <button className="sheet-row" onClick={() => { setMoreOpen(false); utilityAction.onClick(); }}>
              <span className="sheet-row-icon">{utilityAction.icon}</span>
              {utilityAction.label}
            </button>
          )}
          <button className="sheet-row is-destructive" onClick={() => { setMoreOpen(false); signOut(); }}>
            <span className="sheet-row-icon">{SignOutIcon}</span>
            Sign out
          </button>
        </div>
      </Sheet>

      {children}
    </div>
  );
}
