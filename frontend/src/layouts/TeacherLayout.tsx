import { useState, useEffect } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '@/shared/store/auth';
import { useOnlineStatus } from '@/shared/hooks/useOnlineStatus';

const NAV = [
  { path: '/teacher/dashboard', label: 'Dashboard', icon: (
    <svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7.5" height="7.5" rx="1.6"/><rect x="13.5" y="3" width="7.5" height="7.5" rx="1.6"/>
      <rect x="3" y="13.5" width="7.5" height="7.5" rx="1.6"/><rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.6"/>
    </svg>
  )},
  { path: '/teacher/students', label: 'My Students', icon: (
    <svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
      <path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
    </svg>
  )},
  { path: '/teacher/content', label: 'Content Manager', icon: (
    <svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2Z"/>
      <path d="M12 9v6M9 12h6"/>
    </svg>
  )},
  { path: '/teacher/feedback', label: 'Sent Feedback', icon: (
    <svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
    </svg>
  )},
  { path: '/teacher/library', label: 'Library', icon: (
    <svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/>
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2Z"/>
    </svg>
  )},
  { path: '/teacher/live-exams', label: 'Live Exams', icon: (
    <svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"/>
      <circle cx="12" cy="12" r="3"/>
      <line x1="12" y1="2" x2="12" y2="5"/>
      <line x1="12" y1="19" x2="12" y2="22"/>
      <line x1="2" y1="12" x2="5" y2="12"/>
      <line x1="19" y1="12" x2="22" y2="12"/>
    </svg>
  )},
];


export default function TeacherLayout() {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();
  const location = useLocation();
  const online = useOnlineStatus();
  const [profileMenu, setProfileMenu] = useState(false);

  const initials = user?.name.split(' ').map((w: string) => w[0]).slice(0, 2).join('') ?? '?';
  const isActive = (p: string) => location.pathname === p || location.pathname.startsWith(p + '/');
  const handleLogout = () => { logout(); navigate('/login', { replace: true }); };

  return (
    <div style={{ minHeight: '100vh', background: '#FAF9F6' }} onClick={() => setProfileMenu(false)}>
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
        <div style={{ height: 1, background: '#EEEBE5', margin: '0 0 4px' }} />
        <div style={{ padding: '4px 16px 8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span className="nav-label" style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(11,11,14,0.35)' }}>Teacher</span>
          {!online && (
            <span className="nav-label" style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, fontWeight: 600, color: '#B8893E' }}>
              <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="2"><line x1="1" y1="1" x2="23" y2="23"/><path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55M5 12.55a10.94 10.94 0 0 1 5.17-2.39M10.71 5.05A16 16 0 0 1 22.56 9M1.42 9a15.91 15.91 0 0 1 4.7-2.88M8.53 16.11a6 6 0 0 1 6.95 0M12 20h.01"/></svg>
              Offline
            </span>
          )}
        </div>

        {/* Nav items */}
        <div style={{ flex: 1 }}>
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
                onClick={handleLogout}
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
              <span style={{ fontSize: 11.5, color: 'rgba(11,11,14,0.45)' }}>Teacher</span>
            </span>
          </button>
        </div>
      </nav>

      <main className="scrollarea" style={{ marginLeft: 76, minHeight: '100vh', height: '100vh', overflowY: 'auto' }}>
        <Outlet />
      </main>
    </div>
  );
}
