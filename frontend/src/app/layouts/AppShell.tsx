import React, { useEffect, useRef, useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/features/auth';
import { Sheet } from '@/shared/ui';
import { cn } from '@/shared/lib/utils';

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
 * The width-dependent rail behaviour (sidebar, labels, indicator, items, tab
 * bar) lives in index.css under "App shell"; everything else is utilities.
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

const shellIcon = 'flex shrink-0 w-6 justify-center [&_svg]:w-[21px] [&_svg]:h-[21px]';
const avatar = 'flex items-center justify-center shrink-0 rounded-full bg-ink text-white font-semibold tracking-[0.02em]';

const menuItem = (destructive: boolean) => cn(
  'flex items-center gap-2.5 w-full px-2.5 py-[9px] rounded-[9px] bg-transparent text-sm text-left cursor-pointer',
  destructive ? 'text-danger hover:bg-danger/[.08]' : 'text-ink hover:bg-ink/5',
);

const tab = (open: boolean) => cn(
  'flex flex-1 flex-col items-center justify-center gap-[3px] min-w-0 bg-transparent cursor-pointer',
  'text-[10.5px] font-medium tracking-[0.01em] leading-none text-ink/[.62] [&_svg]:w-[23px] [&_svg]:h-[23px]',
  'aria-[current=page]:text-accent-text aria-[current=page]:font-semibold',
  open && 'text-accent-text font-semibold',
);

const sheetRow = (destructive: boolean) => cn(
  'group flex items-center gap-3.5 w-full min-h-12 px-5 bg-transparent text-base font-medium tracking-[-0.012em] text-left cursor-pointer',
  '[&_svg]:w-5 [&_svg]:h-5 active:bg-ink/5 active:transform-none',
  'aria-[current=page]:text-accent-text aria-[current=page]:font-semibold aria-[current=page]:bg-ember/[.06]',
  destructive ? 'text-danger' : 'text-ink',
);
const sheetRowIcon = 'flex shrink-0 text-[var(--ink-3)] group-aria-[current=page]:text-accent-text group-[.text-danger]:text-danger';

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
    <div className="w-6 h-6 rounded-[7px] bg-ember shrink-0 flex items-center justify-center shadow-brand">
      <div className="w-[9px] h-[9px] rounded-[2.5px] bg-white" />
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
    <div className="min-h-screen bg-paper">
      {/* ── Sidebar / rail ─────────────────────────────────────────────── */}
      <nav className="shell-sidebar" aria-label="Main">
        <div className="flex items-center gap-3.5 h-16 px-[26px] shrink-0">
          <BrandMark />
          <span className="shell-label font-display text-[19px] font-bold tracking-[-0.03em] text-ink">Score Studio</span>
        </div>

        {(roleLabel || status) && (
          <div className="flex items-center justify-between h-7 px-7 text-[11px] font-semibold tracking-[0.06em] uppercase text-[var(--ink-3)]">
            <span className="shell-label">{roleLabel}</span>
            {status && <span className="shell-label">{status}</span>}
          </div>
        )}

        <div className="scrollarea flex-1 overflow-y-auto overflow-x-hidden">
          <div className="relative flex flex-col gap-0.5 px-3.5 py-1">
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
                <span className={shellIcon}>{item.icon}</span>
                <span className="shell-label">{item.label}</span>
              </button>
            ))}
          </div>
        </div>

        {utilityAction && (
          <div className="px-3.5 pt-1 pb-2">
            <button className="shell-item" title={utilityAction.label} onClick={utilityAction.onClick}>
              <span className={shellIcon}>{utilityAction.icon}</span>
              <span className="shell-label">{utilityAction.label}</span>
            </button>
          </div>
        )}

        <div className="relative px-3.5 pt-2 pb-3 border-t border-[var(--hairline-soft)]" ref={footerRef}>
          {menuOpen && (
            <div
              className="material pop absolute left-3.5 bottom-[calc(100%-4px)] w-[232px] p-1.5 z-[60] bg-[var(--material-thick)] border border-ink/[.08] rounded-[14px] shadow-lg origin-[20px_100%]"
              role="menu"
            >
              <div className="px-2.5 pt-2 pb-2.5">
                <div className="text-sm font-semibold tracking-[-0.01em] truncate">{user?.name}</div>
                <div className="text-[12.5px] text-subtle truncate">{user?.email}</div>
              </div>
              <div className="h-px bg-ink/[.08] mx-1 mb-1" />
              {menuActions.map((a) => (
                <button key={a.label} role="menuitem" className={menuItem(false)} onClick={() => { setMenuOpen(false); a.onClick(); }}>
                  {a.icon}{a.label}
                </button>
              ))}
              <button role="menuitem" className={menuItem(true)} onClick={signOut}>
                {SignOutIcon}Sign out
              </button>
            </div>
          )}
          <button
            className="shell-item h-[52px] px-2"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((o) => !o)}
          >
            <span className={cn(avatar, 'w-8 h-8 text-[12.5px]')}>{initials}</span>
            <span className="shell-label flex flex-col leading-[1.25]">
              <span className="text-[13.5px] font-semibold text-ink tracking-[-0.01em]">{user?.name}</span>
              <span className="text-xs font-normal text-muted">{profileSubtitle}</span>
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
            className={tab(false)}
            aria-current={isActive(item.path) ? 'page' : undefined}
            onClick={() => go(item.path)}
          >
            {item.icon}
            <span>{item.tabLabel ?? item.label}</span>
          </button>
        ))}
        {(overflow.length > 0 || utilityAction) && (
          <button
            className={tab(moreOpen)}
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
        <div className="flex items-center gap-3 px-5 pt-1.5 pb-3.5">
          <span className={cn(avatar, 'w-10 h-10 text-sm')}>{initials}</span>
          <div className="min-w-0">
            <div className="text-base font-semibold tracking-[-0.015em] truncate">{user?.name}</div>
            <div className="text-[13px] text-subtle truncate">{user?.email}</div>
          </div>
        </div>
        <div className="h-[0.5px] bg-ink/[.12]" />
        <div className="py-1.5">
          {overflow.map((item) => (
            <button
              key={item.path}
              className={sheetRow(false)}
              aria-current={isActive(item.path) ? 'page' : undefined}
              onClick={() => go(item.path)}
            >
              <span className={sheetRowIcon}>{item.icon}</span>
              {item.label}
            </button>
          ))}
        </div>
        <div className="h-[0.5px] bg-ink/[.12]" />
        <div className="pt-1.5 pb-3">
          {utilityAction && (
            <button className={sheetRow(false)} onClick={() => { setMoreOpen(false); utilityAction.onClick(); }}>
              <span className={sheetRowIcon}>{utilityAction.icon}</span>
              {utilityAction.label}
            </button>
          )}
          <button className={sheetRow(true)} onClick={() => { setMoreOpen(false); signOut(); }}>
            <span className={sheetRowIcon}>{SignOutIcon}</span>
            Sign out
          </button>
        </div>
      </Sheet>

      {children}
    </div>
  );
}
