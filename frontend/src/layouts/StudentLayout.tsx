import React, { useState, useEffect } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { useAuthStore } from '@/shared/store/auth';
import { Modal } from '@/shared/ui/Modal';
import { Button } from '@/shared/ui/Button';
import { submitFeedback } from '@/features/feedback/api/feedback.api';

const NAV = [
  { path: '/student/dashboard', label: 'Dashboard', icon: (
    <svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7.5" height="7.5" rx="1.6"/><rect x="13.5" y="3" width="7.5" height="7.5" rx="1.6"/>
      <rect x="3" y="13.5" width="7.5" height="7.5" rx="1.6"/><rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.6"/>
    </svg>
  )},
  { path: '/student/mock-test', label: 'Mock Test', icon: (
    <svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 3h6a2 2 0 0 1 2 2H7a2 2 0 0 1 2-2Z"/>
      <rect x="4" y="4" width="16" height="17" rx="2.5"/>
      <path d="M8.5 13l2 2 4-4.5"/>
    </svg>
  )},
  { path: '/student/exams', label: 'Practice Tests', icon: (
    <svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="3" width="16" height="18" rx="2.5"/>
      <path d="M8 8h8M8 12h8M8 16h4"/>
    </svg>
  )},
  { path: '/student/results', label: 'History', icon: (
    <svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3.5 5.5A9 9 0 1 1 3 12"/>
      <path d="M3 4v4h4"/>
      <path d="M12 8v4.5l3 1.8"/>
    </svg>
  )},
  { path: '/student/library', label: 'Library', icon: (
    <svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/>
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2Z"/>
    </svg>
  )},
  { path: '/student/vocab-review', label: 'Vocab Review', icon: (
    <svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="5" width="20" height="14" rx="2.5"/>
      <path d="M2 10h20"/>
      <path d="M7 15h2M12 15h3"/>
    </svg>
  )},
  { path: '/student/settings', label: 'Settings', icon: (
    <svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <line x1="4" y1="7" x2="20" y2="7"/>
      <circle cx="9" cy="7" r="2.3" fill="#FAF9F6"/>
      <line x1="4" y1="17" x2="20" y2="17"/>
      <circle cx="15" cy="17" r="2.3" fill="#FAF9F6"/>
    </svg>
  )},
];

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '10px 12px', border: '1px solid #C8C4BC', borderRadius: 10,
  fontSize: 14, background: '#fff', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box',
};

type FeedbackCategory = 'bug' | 'suggestion' | 'other';

export default function StudentLayout() {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();
  const location = useLocation();
  const [profileMenu, setProfileMenu] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [moreClosing, setMoreClosing] = useState(false);

  const closeMore = () => {
    setMoreClosing(true);
    setTimeout(() => { setMoreOpen(false); setMoreClosing(false); }, 220);
  };
  const [showFeedback, setShowFeedback] = useState(false);
  const [feedbackCategory, setFeedbackCategory] = useState<FeedbackCategory>('other');
  const [feedbackMessage, setFeedbackMessage] = useState('');
  const [feedbackSent, setFeedbackSent] = useState(false);

  const feedbackMutation = useMutation({
    mutationFn: () => submitFeedback({ category: feedbackCategory, message: feedbackMessage }),
    onSuccess: () => setFeedbackSent(true),
  });

  const closeFeedbackModal = () => {
    setShowFeedback(false);
    setFeedbackSent(false);
    setFeedbackMessage('');
    setFeedbackCategory('other');
    feedbackMutation.reset();
  };

  const initials = user?.name.split(' ').map((w: string) => w[0]).slice(0, 2).join('') ?? '?';

  const isActive = (p: string) => location.pathname === p || location.pathname.startsWith(p + '/');

  const handleSignOut = () => { logout(); navigate('/login', { replace: true }); };

  const [notifications, setNotifications] = useState<{ id: string; title: string; message: string; link: string | null }[]>([]);

  useEffect(() => {
    let active = true;
    async function checkNotifs() {
      try {
        const { getNotifications, markNotificationRead } = await import('@/features/live-exam/api/live-exam.api');
        const notifs = await getNotifications();
        if (active && notifs.length > 0) {
          setNotifications(notifs);
          for (const n of notifs) markNotificationRead(n.id).catch(() => null);
        }
      } catch { /* ignore */ }
    }
    checkNotifs();
    const iv = setInterval(checkNotifs, 30000);
    return () => { active = false; clearInterval(iv); };
  }, []);

  return (
    <div style={{ minHeight: '100vh', background: '#FAF9F6' }} onClick={() => setProfileMenu(false)}>
      {/* Nav Rail */}
      <nav
        className="nav-rail"
        style={{ position: 'fixed', left: 0, top: 0, bottom: 0, background: '#fff', borderRight: '1px solid #E7E4DE', zIndex: 40, display: 'flex', flexDirection: 'column' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Logo */}
        <div style={{ height: 72, display: 'flex', alignItems: 'center', padding: '0 27px', flexShrink: 0 }}>
          <div style={{ width: 22, height: 22, borderRadius: 7, background: '#E2562B', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ width: 9, height: 9, borderRadius: 2, background: '#fff' }} />
          </div>
          <span className="nav-label" style={{ marginLeft: 16, fontFamily: "'Instrument Serif', serif", fontSize: 22, color: '#0B0B0E' }}>
            Score Studio
          </span>
        </div>
        <div style={{ height: 1, background: '#EEEBE5', margin: '0 0 8px' }} />

        {/* Items */}
        <div style={{ flex: 1, paddingTop: 4 }}>
          {NAV.map((item) => {
            const active = isActive(item.path);
            return (
              <button
                key={item.path}
                onClick={() => navigate(item.path)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 16, height: 46, padding: '0 27px',
                  cursor: 'pointer', border: 'none', background: 'none', width: '100%', position: 'relative',
                  textAlign: 'left', fontSize: 14, fontWeight: active ? 600 : 500, fontFamily: 'inherit',
                  color: active ? '#E2562B' : '#8C8880', transition: 'color 0.18s, background 0.18s',
                }}
                onMouseEnter={(e) => { if (!active) { e.currentTarget.style.color = '#0B0B0E'; e.currentTarget.style.background = 'rgba(11,11,14,0.04)'; } }}
                onMouseLeave={(e) => { e.currentTarget.style.color = active ? '#E2562B' : '#8C8880'; e.currentTarget.style.background = 'none'; }}
              >
                {active && <span style={{ position: 'absolute', left: 0, top: 9, bottom: 9, width: 3, background: '#E2562B', borderRadius: '0 4px 4px 0' }} />}
                <span style={{ flexShrink: 0 }}>{item.icon}</span>
                <span className="nav-label">{item.label}</span>
              </button>
            );
          })}
        </div>

        {/* Send Feedback */}
        <div style={{ padding: '4px 16px 8px' }}>
          <button
            onClick={() => setShowFeedback(true)}
            style={{ display: 'flex', alignItems: 'center', gap: 14, height: 40, padding: '0 11px', width: '100%', border: '1px solid #E7E4DE', borderRadius: 10, background: '#fff', cursor: 'pointer', fontFamily: 'inherit', fontSize: 13, fontWeight: 500, color: '#8C8880' }}
            onMouseEnter={(e) => { e.currentTarget.style.color = '#0B0B0E'; e.currentTarget.style.background = 'rgba(11,11,14,0.04)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = '#8C8880'; e.currentTarget.style.background = '#fff'; }}
          >
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
            </svg>
            <span className="nav-label">Send Feedback</span>
          </button>
        </div>

        {/* Profile */}
        <div style={{ borderTop: '1px solid #EEEBE5', padding: '10px 0', position: 'relative' }}>
          {profileMenu && (
            <div className="pop" style={{ position: 'absolute', left: 16, bottom: 64, width: 220, background: '#fff', border: '1px solid #E7E4DE', borderRadius: 14, boxShadow: '0 16px 48px rgba(11,11,14,0.16)', padding: 8, zIndex: 60 }}>
              <div style={{ padding: '10px 12px 12px' }}>
                <div style={{ fontSize: 14, fontWeight: 600 }}>{user?.name}</div>
                <div style={{ fontSize: 12, color: 'rgba(11,11,14,0.5)' }}>{user?.email}</div>
              </div>
              <div style={{ height: 1, background: '#EEEBE5', margin: '2px 0 6px' }} />
              <button
                onClick={() => { navigate('/student/settings'); setProfileMenu(false); }}
                style={{ width: '100%', textAlign: 'left', padding: '9px 12px', border: 'none', background: 'none', borderRadius: 9, fontSize: 13.5, color: '#0B0B0E', cursor: 'pointer', fontFamily: 'inherit' }}
                onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(11,11,14,0.05)')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}
              >Account settings</button>
              <button
                onClick={handleSignOut}
                style={{ width: '100%', textAlign: 'left', padding: '9px 12px', border: 'none', background: 'none', borderRadius: 9, fontSize: 13.5, color: '#C0392B', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10, fontFamily: 'inherit' }}
                onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(192,57,43,0.07)')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}
              >
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5"/><path d="M21 12H9"/>
                </svg>
                Sign out
              </button>
            </div>
          )}
          <button
            onClick={(e) => { e.stopPropagation(); setProfileMenu((p) => !p); }}
            style={{ display: 'flex', alignItems: 'center', gap: 16, height: 54, padding: '0 27px', cursor: 'pointer', border: 'none', background: 'none', width: '100%', fontFamily: 'inherit' }}
          >
            <div style={{ width: 32, height: 32, borderRadius: 9999, background: '#0B0B0E', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 600, flexShrink: 0 }}>
              {initials}
            </div>
            <span className="nav-label" style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.2 }}>
              <span style={{ fontSize: 13.5, fontWeight: 600, color: '#0B0B0E' }}>{user?.name}</span>
              <span style={{ fontSize: 11.5, color: 'rgba(11,11,14,0.45)' }}>View profile</span>
            </span>
          </button>
        </div>
      </nav>

      {/* Main */}
      {notifications.length > 0 && (
        <div style={{ position: 'fixed', top: 16, left: '50%', transform: 'translateX(-50%)', zIndex: 999, display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 420, width: 'calc(100% - 32px)' }}>
          {notifications.map((n) => (
            <div key={n.id} style={{ background: '#0B0B0E', color: '#fff', borderRadius: 12, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12, boxShadow: '0 4px 20px rgba(0,0,0,0.25)' }}>
              <div style={{ flex: 1 }}>
                <p style={{ fontWeight: 700, fontSize: 13, margin: 0 }}>{n.title}</p>
                <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)', margin: 0 }}>{n.message}</p>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                {n.link && (
                  <button onClick={() => { setNotifications((prev) => prev.filter((x) => x.id !== n.id)); navigate(n.link!); }} style={{ background: '#fff', color: '#0B0B0E', border: 'none', borderRadius: 9999, padding: '6px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}>View</button>
                )}
                <button onClick={() => setNotifications((prev) => prev.filter((x) => x.id !== n.id))} style={{ background: 'rgba(255,255,255,0.15)', color: '#fff', border: 'none', borderRadius: 9999, padding: '6px 10px', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>✕</button>
              </div>
            </div>
          ))}
        </div>
      )}

      <main className="scrollarea main-content" style={{ marginLeft: 76, minHeight: '100vh', height: '100vh', overflowY: 'auto' }}>
        <Outlet />
      </main>

      {/* Bottom nav — mobile only (shown via CSS media query) */}
      <nav className="bottom-nav">
        {[
          { path: '/student/dashboard', label: 'Home', icon: <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7.5" height="7.5" rx="1.6"/><rect x="13.5" y="3" width="7.5" height="7.5" rx="1.6"/><rect x="3" y="13.5" width="7.5" height="7.5" rx="1.6"/><rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.6"/></svg> },
          { path: '/student/exams',     label: 'Practice', icon: <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="3" width="16" height="18" rx="2.5"/><path d="M8 8h8M8 12h8M8 16h4"/></svg> },
          { path: '/student/mock-test', label: 'Mock',     icon: <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M9 3h6a2 2 0 0 1 2 2H7a2 2 0 0 1 2-2Z"/><rect x="4" y="4" width="16" height="17" rx="2.5"/><path d="M8.5 13l2 2 4-4.5"/></svg> },
          { path: '/student/results',   label: 'History',  icon: <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M3.5 5.5A9 9 0 1 1 3 12"/><path d="M3 4v4h4"/><path d="M12 8v4.5l3 1.8"/></svg> },
        ].map(({ path, label, icon }) => {
          const active = location.pathname === path || location.pathname.startsWith(path + '/');
          return (
            <button key={path} className={`bottom-nav-item${active ? ' active' : ''}`} onClick={() => { setMoreOpen(false); navigate(path); }}>
              {icon}
              {label}
            </button>
          );
        })}

        {/* More button */}
        <button className={`bottom-nav-item${moreOpen ? ' active' : ''}`} onClick={() => moreOpen ? closeMore() : setMoreOpen(true)}>
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="5" cy="12" r="1.2" fill="currentColor" stroke="none"/>
            <circle cx="12" cy="12" r="1.2" fill="currentColor" stroke="none"/>
            <circle cx="19" cy="12" r="1.2" fill="currentColor" stroke="none"/>
          </svg>
          More
        </button>
      </nav>

      {/* More sheet — mobile only */}
      {moreOpen && (
        <>
          {/* Backdrop */}
          <div
            style={{ position: 'fixed', inset: 0, background: 'rgba(11,11,14,0.35)', zIndex: 48 }}
            onClick={closeMore}
          />

          {/* Sheet */}
          <div
            className={`more-sheet${moreClosing ? ' more-sheet-closing' : ''}`}
            style={{ position: 'fixed', bottom: 0, left: 0, right: 0, background: '#fff', borderRadius: '20px 20px 0 0', zIndex: 49, boxShadow: '0 -4px 32px rgba(11,11,14,0.14)' }}
          >
            {/* Handle */}
            <div style={{ display: 'flex', justifyContent: 'center', padding: '10px 0 4px' }}>
              <div style={{ width: 36, height: 4, borderRadius: 9999, background: '#E7E4DE' }} />
            </div>

            {/* User info */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 20px 16px', borderBottom: '1px solid #F2F0EC' }}>
              <div style={{ width: 38, height: 38, borderRadius: 9999, background: '#0B0B0E', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 600, flexShrink: 0 }}>
                {initials}
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 14.5, fontWeight: 600, color: '#0B0B0E', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user?.name}</div>
                <div style={{ fontSize: 12, color: 'rgba(11,11,14,0.45)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user?.email}</div>
              </div>
            </div>

            {/* Nav links */}
            {[
              { path: '/student/vocab-review', label: 'Vocab Review', icon: <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="5" width="20" height="14" rx="2.5"/><path d="M2 10h20"/><path d="M7 15h2M12 15h3"/></svg> },
              { path: '/student/library',      label: 'Library',      icon: <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2Z"/></svg> },
              { path: '/student/settings',     label: 'Settings',     icon: <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><line x1="4" y1="7" x2="20" y2="7"/><circle cx="9" cy="7" r="2.3" fill="#fff"/><line x1="4" y1="17" x2="20" y2="17"/><circle cx="15" cy="17" r="2.3" fill="#fff"/></svg> },
            ].map(({ path, label, icon }) => {
              const active = isActive(path);
              return (
                <button
                  key={path}
                  onClick={() => { setMoreOpen(false); navigate(path); }}
                  style={{ display: 'flex', alignItems: 'center', gap: 14, width: '100%', padding: '13px 20px', border: 'none', background: active ? 'rgba(226,86,43,0.06)' : 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 14.5, fontWeight: active ? 600 : 500, color: active ? '#E2562B' : '#0B0B0E', textAlign: 'left' }}
                >
                  <span style={{ color: active ? '#E2562B' : 'rgba(11,11,14,0.5)', flexShrink: 0 }}>{icon}</span>
                  {label}
                </button>
              );
            })}

            <div style={{ height: 1, background: '#F2F0EC', margin: '4px 0' }} />

            {/* Actions */}
            <button
              onClick={() => { setMoreOpen(false); setShowFeedback(true); }}
              style={{ display: 'flex', alignItems: 'center', gap: 14, width: '100%', padding: '13px 20px', border: 'none', background: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 14.5, fontWeight: 500, color: '#0B0B0E', textAlign: 'left' }}
            >
              <span style={{ color: 'rgba(11,11,14,0.5)', flexShrink: 0 }}>
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                </svg>
              </span>
              Send Feedback
            </button>

            <button
              onClick={() => { setMoreOpen(false); handleSignOut(); }}
              style={{ display: 'flex', alignItems: 'center', gap: 14, width: '100%', padding: '13px 20px', border: 'none', background: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 14.5, fontWeight: 500, color: '#C0392B', textAlign: 'left' }}
            >
              <span style={{ flexShrink: 0 }}>
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5"/><path d="M21 12H9"/>
                </svg>
              </span>
              Sign out
            </button>

            <div style={{ height: 24 }} />
          </div>
        </>
      )}

      <Modal
        isOpen={showFeedback}
        onClose={closeFeedbackModal}
        title="Send Feedback"
        size="sm"
        footer={
          feedbackSent ? (
            <Button variant="secondary" onClick={closeFeedbackModal}>Close</Button>
          ) : (
            <>
              <Button variant="secondary" onClick={closeFeedbackModal}>Cancel</Button>
              <Button
                variant="primary"
                onClick={() => feedbackMutation.mutate()}
                loading={feedbackMutation.isPending}
                disabled={feedbackMessage.trim().length < 10}
              >Send</Button>
            </>
          )
        }
      >
        {feedbackSent ? (
          <div style={{ textAlign: 'center', padding: '16px 0' }}>
            <div style={{ fontSize: 36, marginBottom: 12 }}>✅</div>
            <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 6 }}>Thank you!</div>
            <div style={{ fontSize: 13.5, color: 'rgba(11,11,14,0.55)' }}>Your feedback has been sent to the admin team.</div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {feedbackMutation.isError && (
              <div style={{ background: 'rgba(220,38,38,0.08)', color: '#dc2626', padding: '9px 12px', borderRadius: 8, fontSize: 13 }}>
                Something went wrong. Please try again.
              </div>
            )}
            <div>
              <label style={{ display: 'block', fontSize: 12.5, fontWeight: 600, marginBottom: 7, color: 'rgba(11,11,14,0.65)' }}>Category</label>
              <div style={{ display: 'flex', gap: 8 }}>
                {(['bug', 'suggestion', 'other'] as FeedbackCategory[]).map((cat) => (
                  <button
                    key={cat}
                    onClick={() => setFeedbackCategory(cat)}
                    style={{ flex: 1, height: 34, border: feedbackCategory === cat ? '1.5px solid #0B0B0E' : '1px solid #C8C4BC', borderRadius: 9, background: feedbackCategory === cat ? '#0B0B0E' : '#fff', color: feedbackCategory === cat ? '#fff' : '#0B0B0E', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', textTransform: 'capitalize' }}
                  >{cat === 'bug' ? 'Bug Report' : cat === 'suggestion' ? 'Suggestion' : 'Other'}</button>
                ))}
              </div>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12.5, fontWeight: 600, marginBottom: 7, color: 'rgba(11,11,14,0.65)' }}>
                Message <span style={{ color: 'rgba(11,11,14,0.4)', fontWeight: 400 }}>({feedbackMessage.length}/2000)</span>
              </label>
              <textarea
                style={{ ...inputStyle, height: 110, resize: 'vertical' }}
                placeholder="Describe the bug or share your suggestion… (min 10 characters)"
                value={feedbackMessage}
                onChange={(e) => setFeedbackMessage(e.target.value.slice(0, 2000))}
              />
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
