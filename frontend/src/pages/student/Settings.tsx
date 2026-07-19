import React, { useState } from 'react';
import { useAuthStore } from '../../store/auth';
import { useNavigate } from 'react-router-dom';
import { useMobile } from '../../hooks/useMobile';

function Toggle({ on, onClick }: { on: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{ width: 46, height: 27, borderRadius: 9999, border: 'none', cursor: 'pointer', background: on ? '#E2562B' : '#C8C4BC', position: 'relative', transition: 'background 0.2s', padding: 0, flexShrink: 0 }}
    >
      <span style={{ position: 'absolute', top: 3, left: on ? 22 : 3, width: 21, height: 21, borderRadius: 9999, background: '#fff', transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.25)' }} />
    </button>
  );
}

function SectionTitle({ children }: { children: string }) {
  return <h3 style={{ fontSize: 13, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'rgba(11,11,14,0.45)', margin: '0 0 12px' }}>{children}</h3>;
}

function Row({ title, desc, control, last, isMobile }: { title: string; desc?: string; control: React.ReactNode; last?: boolean; isMobile?: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: isMobile ? 'flex-start' : 'center', flexDirection: isMobile ? 'column' : 'row', gap: isMobile ? 10 : 20, padding: isMobile ? '14px 16px' : '16px 22px', borderBottom: last ? 'none' : '1px solid #F2F0EC' }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 14.5, fontWeight: 600 }}>{title}</div>
        {desc && <div style={{ fontSize: 13, color: 'rgba(11,11,14,0.5)', marginTop: 2 }}>{desc}</div>}
      </div>
      <div style={{ width: isMobile ? '100%' : undefined }}>{control}</div>
    </div>
  );
}

const CARD: React.CSSProperties = { background: '#fff', border: '1px solid #E7E4DE', borderRadius: 16, boxShadow: '0 1px 3px rgba(11,11,14,0.05)', overflow: 'hidden' };

export default function StudentSettings() {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();
  const isMobile = useMobile();
  const [settings, setSettings] = useState({ notifications: true, sound: true, autoCalc: true, timer: true, fontLarge: false });
  const toggle = (key: keyof typeof settings) => setSettings((s) => ({ ...s, [key]: !s[key] }));

  const initials = user?.name.split(' ').map((w) => w[0]).slice(0, 2).join('') ?? '?';

  const handleSignOut = () => { logout(); navigate('/login', { replace: true }); };

  const inputWidth = isMobile ? '100%' : 240;

  const outlineBtn = (label: string, onClick?: () => void, danger?: boolean): React.ReactNode => (
    <button
      onClick={onClick}
      style={{ height: 38, padding: '0 16px', border: danger ? '1px solid rgba(192,57,43,0.4)' : '1px solid #C8C4BC', background: '#fff', color: danger ? '#C0392B' : '#0B0B0E', borderRadius: 9999, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', width: isMobile ? '100%' : undefined }}
    >
      {label}
    </button>
  );

  const darkBtn = (label: string, onClick?: () => void): React.ReactNode => (
    <button
      onClick={onClick}
      style={{ height: 38, padding: '0 18px', border: 'none', background: '#0B0B0E', color: '#fff', borderRadius: 9999, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', width: isMobile ? '100%' : undefined }}
    >
      {label}
    </button>
  );

  return (
    <div className="screen-fade" style={{ padding: isMobile ? '20px 16px 80px' : '36px 48px 64px', maxWidth: 820, margin: '0 auto' }}>
      <h1 style={{ fontFamily: "'Instrument Serif', serif", fontSize: isMobile ? 32 : 44, margin: '0 0 6px', letterSpacing: '-0.02em' }}>Settings</h1>
      <p style={{ fontSize: isMobile ? 14 : 15, color: 'rgba(11,11,14,0.55)', margin: '0 0 24px' }}>Manage your account, preferences, and how tests behave.</p>

      {/* Profile */}
      <div style={{ marginBottom: 24 }}>
        <SectionTitle>Profile</SectionTitle>
        <div style={CARD}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: isMobile ? '16px 16px' : '20px 22px', borderBottom: '1px solid #F2F0EC' }}>
            <div style={{ width: isMobile ? 44 : 56, height: isMobile ? 44 : 56, borderRadius: 9999, background: '#0B0B0E', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: isMobile ? 16 : 20, fontWeight: 600, flexShrink: 0 }}>{initials}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: isMobile ? 15 : 16, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user?.name}</div>
              <div style={{ fontSize: 13, color: 'rgba(11,11,14,0.5)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user?.email}</div>
            </div>
          </div>
          <Row isMobile={isMobile} title="Full name" control={<input defaultValue={user?.name} style={{ width: inputWidth, height: 40, padding: '0 14px', border: '1px solid #C8C4BC', borderRadius: 10, fontSize: 14, background: '#fff', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' }} />} />
          <Row isMobile={isMobile} title="Email address" control={<input defaultValue={user?.email} style={{ width: inputWidth, height: 40, padding: '0 14px', border: '1px solid #C8C4BC', borderRadius: 10, fontSize: 14, background: '#fff', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' }} />} last />
        </div>
      </div>

      {/* Preferences */}
      <div style={{ marginBottom: 24 }}>
        <SectionTitle>Preferences</SectionTitle>
        <div style={CARD}>
          <Row isMobile={false} title="Email notifications" desc="Streak reminders and weekly progress recaps." control={<Toggle on={settings.notifications} onClick={() => toggle('notifications')} />} />
          <Row isMobile={false} title="Sound effects" desc="Subtle cues on submit and score reveal." control={<Toggle on={settings.sound} onClick={() => toggle('sound')} />} last />
        </div>
      </div>

      {/* Test experience */}
      <div style={{ marginBottom: 24 }}>
        <SectionTitle>Test experience</SectionTitle>
        <div style={CARD}>
          <Row isMobile={false} title="Show countdown timer" desc="Hide it during practice if it stresses you out." control={<Toggle on={settings.timer} onClick={() => toggle('timer')} />} />
          <Row isMobile={false} title="Open calculator by default" desc="Math sections start with the calculator visible." control={<Toggle on={settings.autoCalc} onClick={() => toggle('autoCalc')} />} />
          <Row isMobile={false} title="Larger question text" desc="Increase font size in the test player." control={<Toggle on={settings.fontLarge} onClick={() => toggle('fontLarge')} />} last />
        </div>
      </div>

      {/* Account */}
      <div>
        <SectionTitle>Account</SectionTitle>
        <div style={CARD}>
          <Row isMobile={isMobile} title="Password" desc="Update your account password." control={outlineBtn('Change password')} />
          <Row isMobile={isMobile} title="Sign out" desc="Sign out of this device." control={darkBtn('Sign out', handleSignOut)} />
          <Row isMobile={isMobile} title="Delete account" desc="Permanently remove your data. This can't be undone." control={outlineBtn('Delete', undefined, true)} last />
        </div>
      </div>
    </div>
  );
}
