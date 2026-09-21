import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LiveNotifications } from '@/features/live-exam';
import { SendFeedbackModal } from '@/features/platform-feedback';
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

export default function StudentLayout() {
  const navigate = useNavigate();
  const [showFeedback, setShowFeedback] = useState(false);

  return (
    <AppShell
      nav={NAV}
      tabPaths={['/student/dashboard', '/student/exams', '/student/mock-test', '/student/results']}
      profileSubtitle="View profile"
      menuActions={[{ label: 'Account settings', icon: SettingsIcon, onClick: () => navigate('/student/settings') }]}
      utilityAction={{ label: 'Send Feedback', icon: FeedbackIcon, onClick: () => setShowFeedback(true) }}
    >
      <LiveNotifications />
      <SendFeedbackModal open={showFeedback} onClose={() => setShowFeedback(false)} />
    </AppShell>
  );
}
