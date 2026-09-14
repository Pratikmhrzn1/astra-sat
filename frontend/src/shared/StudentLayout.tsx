import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { Modal, Button } from '@/components/common';
import { submitFeedback } from '@/api/feedback';
import AppShell, { type ShellNavItem } from './AppShell';

const NAV: ShellNavItem[] = [
  { path: '/student/dashboard', label: 'Dashboard', tabLabel: 'Home', icon: (
    <svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7.5" height="7.5" rx="1.6"/><rect x="13.5" y="3" width="7.5" height="7.5" rx="1.6"/>
      <rect x="3" y="13.5" width="7.5" height="7.5" rx="1.6"/><rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.6"/>
    </svg>
  )},
  { path: '/student/mock-test', label: 'Mock Test', tabLabel: 'Mock', icon: (
    <svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 3h6a2 2 0 0 1 2 2H7a2 2 0 0 1 2-2Z"/>
      <rect x="4" y="4" width="16" height="17" rx="2.5"/>
      <path d="M8.5 13l2 2 4-4.5"/>
    </svg>
  )},
  { path: '/student/live-exam', label: 'Live Exam', icon: (
    <svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3"/>
      <path d="M7.5 7.5a6.4 6.4 0 0 0 0 9M16.5 16.5a6.4 6.4 0 0 0 0-9"/>
      <path d="M4.5 4.5a10.5 10.5 0 0 0 0 15M19.5 19.5a10.5 10.5 0 0 0 0-15"/>
    </svg>
  )},
  { path: '/student/exams', label: 'Practice Tests', tabLabel: 'Practice', icon: (
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
  { path: '/student/progress', label: 'Progress', icon: (
    <svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 20h18"/>
      <path d="M6 20v-6M11 20V8M16 20v-9M21 20V4"/>
    </svg>
  )},
  { path: '/student/mistakes', label: 'Mistake Bank', icon: (
    <svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9"/>
      <circle cx="12" cy="12" r="4.5"/>
      <circle cx="12" cy="12" r="0.9" fill="currentColor"/>
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
      <circle cx="9" cy="7" r="2.3" fill="currentColor"/>
      <line x1="4" y1="17" x2="20" y2="17"/>
      <circle cx="15" cy="17" r="2.3" fill="currentColor"/>
    </svg>
  )},
];

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '11px 13px', border: '1px solid #E7E4DE', borderRadius: 12,
  fontSize: 15, lineHeight: 1.45, background: '#fff', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box',
};

const FeedbackIcon = (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
  </svg>
);

const SettingsIcon = (
  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>
  </svg>
);

type FeedbackCategory = 'bug' | 'suggestion' | 'other';

export default function StudentLayout() {
  const navigate = useNavigate();
  const [showFeedback, setShowFeedback] = useState(false);
  const [feedbackCategory, setFeedbackCategory] = useState<FeedbackCategory>('other');
  const [feedbackMessage, setFeedbackMessage] = useState('');
  const [feedbackSent, setFeedbackSent] = useState(false);

  const feedbackMutation = useMutation({
    mutationFn: () => submitFeedback({ category: feedbackCategory, message: feedbackMessage }),
    onSuccess: () => setFeedbackSent(true),
    onError: () => {}, // shown inline on the page, not as a toast
  });

  const closeFeedbackModal = () => {
    setShowFeedback(false);
    setFeedbackSent(false);
    setFeedbackMessage('');
    setFeedbackCategory('other');
    feedbackMutation.reset();
  };

  const [notifications, setNotifications] = useState<{ id: string; title: string; message: string; link: string | null }[]>([]);

  useEffect(() => {
    let active = true;
    async function checkNotifs() {
      try {
        const { getNotifications, markNotificationRead } = await import('@/api/liveExam');
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
    <AppShell
      nav={NAV}
      tabPaths={['/student/dashboard', '/student/exams', '/student/mock-test', '/student/results']}
      profileSubtitle="View profile"
      menuActions={[{ label: 'Account settings', icon: SettingsIcon, onClick: () => navigate('/student/settings') }]}
      utilityAction={{ label: 'Send Feedback', icon: FeedbackIcon, onClick: () => setShowFeedback(true) }}
    >
      {notifications.length > 0 && (
        <div role="status" aria-live="polite" style={{ position: 'fixed', top: 'max(12px, env(safe-area-inset-top))', left: '50%', transform: 'translateX(-50%)', zIndex: 999, display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 420, width: 'calc(100% - 32px)' }}>
          {notifications.map((n) => (
            <div key={n.id} className="toast" style={{ color: '#fff', borderRadius: 16, padding: '12px 12px 12px 16px', display: 'flex', alignItems: 'center', gap: 12, boxShadow: '0 8px 32px rgba(0,0,0,0.22)' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontWeight: 600, fontSize: 14, letterSpacing: '-0.01em', margin: 0 }}>{n.title}</p>
                <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.72)', margin: '1px 0 0', lineHeight: 1.4 }}>{n.message}</p>
              </div>
              <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                {n.link && (
                  <button onClick={() => { setNotifications((prev) => prev.filter((x) => x.id !== n.id)); navigate(n.link!); }} style={{ background: '#fff', color: '#0B0B0E', border: 'none', borderRadius: 9999, height: 32, padding: '0 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}>View</button>
                )}
                <button aria-label="Dismiss" onClick={() => setNotifications((prev) => prev.filter((x) => x.id !== n.id))} style={{ background: 'rgba(255,255,255,0.14)', color: '#fff', border: 'none', borderRadius: 9999, width: 32, height: 32, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>✕</button>
              </div>
            </div>
          ))}
        </div>
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
            <div aria-hidden style={{ width: 52, height: 52, borderRadius: 9999, background: 'rgba(26,107,60,0.1)', color: '#1A6B3C', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px' }}><svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg></div>
            <div style={{ fontSize: 19, fontWeight: 600, letterSpacing: '-0.02em', marginBottom: 6 }}>Thank you!</div>
            <div style={{ fontSize: 14.5, color: 'rgba(11,11,14,0.58)', lineHeight: 1.5 }}>Your feedback has been sent to the admin team.</div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {feedbackMutation.isError && (
              <div role="alert" style={{ background: 'rgba(192,57,43,0.07)', color: '#C0392B', padding: '10px 12px', borderRadius: 10, fontSize: 13.5 }}>
                Something went wrong. Please try again.
              </div>
            )}
            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 500, marginBottom: 8, color: 'rgba(11,11,14,0.62)' }}>Category</label>
              <div role="radiogroup" aria-label="Category" style={{ display: 'flex', gap: 2, padding: 2, borderRadius: 10, background: 'rgba(11,11,14,0.06)' }}>
                {(['bug', 'suggestion', 'other'] as FeedbackCategory[]).map((cat) => (
                  <button
                    key={cat}
                    onClick={() => setFeedbackCategory(cat)}
                    role="radio"
                    aria-checked={feedbackCategory === cat}
                    style={{ flex: 1, height: 32, border: 'none', borderRadius: 8, background: feedbackCategory === cat ? '#fff' : 'transparent', boxShadow: feedbackCategory === cat ? '0 1px 3px rgba(11,11,14,0.12), 0 0 0 0.5px rgba(11,11,14,0.04)' : 'none', color: '#0B0B0E', fontSize: 13, fontWeight: feedbackCategory === cat ? 600 : 500, cursor: 'pointer', fontFamily: 'inherit', textTransform: 'capitalize' }}
                  >{cat === 'bug' ? 'Bug Report' : cat === 'suggestion' ? 'Suggestion' : 'Other'}</button>
                ))}
              </div>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 500, marginBottom: 8, color: 'rgba(11,11,14,0.62)' }}>
                Message <span style={{ color: 'rgba(11,11,14,0.58)', fontWeight: 400 }}>({feedbackMessage.length}/2000)</span>
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
    </AppShell>
  );
}
