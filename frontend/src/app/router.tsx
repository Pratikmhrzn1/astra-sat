import { lazy, type ReactNode } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { RouteBoundary } from '@/app/RouteBoundary';
import { useAuthStore } from '@/features/auth';
import { ProtectedRoute } from '@/app/ProtectedRoute';

import StudentLayout from '@/app/layouts/StudentLayout';
import TeacherLayout from '@/app/layouts/TeacherLayout';
import AdminLayout from '@/app/layouts/AdminLayout';

import Login from '@/features/auth/pages/LoginPage';
const Register = lazy(() => import('@/features/auth/pages/RegisterPage'));
const ForgotPassword = lazy(() => import('@/features/auth/pages/ForgotPasswordPage'));
const ResetPassword = lazy(() => import('@/features/auth/pages/ResetPasswordPage'));

const StudentDashboard = lazy(() => import('@/features/dashboard/pages/StudentDashboardPage'));
const ExamCatalogue = lazy(() => import('@/features/practice/pages/ExamCataloguePage'));
const TakeExam = lazy(() => import('@/features/exam-player/pages/TakeExamPage'));
const MockTest = lazy(() => import('@/features/practice/pages/MockTestPage'));
const Results = lazy(() => import('@/features/exam-review/pages/ResultsPage'));
const Mistakes = lazy(() => import('@/features/mistakes/pages/MistakesPage'));
const Progress = lazy(() => import('@/features/progress/pages/ProgressPage'));
const JoinLiveExam = lazy(() => import('@/features/live-exam/pages/JoinLiveExamPage'));
const ExamDetail = lazy(() => import('@/features/exam-review/pages/ExamDetailPage'));
const VocabReview = lazy(() => import('@/features/vocab/pages/VocabReviewPage'));
const StudentSettings = lazy(() => import('@/features/account/pages/SettingsPage'));

const TeacherDashboard = lazy(() => import('@/features/dashboard/pages/TeacherDashboardPage'));
const Students = lazy(() => import('@/features/roster/pages/StudentsPage'));
const StudentDetail = lazy(() => import('@/features/roster/pages/StudentDetailPage'));
const StudentExamDetail = lazy(() => import('@/features/roster/pages/StudentExamDetailPage'));
const AddContent = lazy(() => import('@/features/content/pages/AddContentPage'));

const AdminDashboard = lazy(() => import('@/features/dashboard/pages/AdminDashboardPage'));
const Users = lazy(() => import('@/features/admin/pages/UsersPage'));
const AccessCodes = lazy(() => import('@/features/admin/pages/AccessCodesPage'));
const Database = lazy(() => import('@/features/admin/pages/DatabasePage'));

const LiveExamLobby = lazy(() => import('@/features/live-exam/pages/LiveExamLobbyPage'));
const LiveExams = lazy(() => import('@/features/live-exam/pages/LiveExamsPage'));
const LiveExamSessionPage = lazy(() => import('@/features/live-exam/pages/LiveExamSessionPage'));
const LiveExamStudentResult = lazy(() => import('@/features/live-exam/pages/LiveExamStudentResultPage'));

const StudentLibrary = lazy(() => import('@/features/library/pages/StudentLibraryPage'));
const TeacherLibrary = lazy(() => import('@/features/library/pages/TeacherLibraryPage'));
const AdminLibrary = lazy(() => import('@/features/library/pages/AdminLibraryPage'));

const StudentFeedback = lazy(() => import('@/features/messages/pages/StudentFeedbackPage'));
const TeacherFeedback = lazy(() => import('@/features/messages/pages/TeacherFeedbackPage'));
const AdminFeedback = lazy(() => import('@/features/platform-feedback/pages/AdminFeedbackPage'));


/**
 * Every routed page gets its own chunk (so a student never downloads the teacher
 * content editor or the admin database tools), plus a boundary that shows a
 * loading state and catches render crashes instead of blanking the app.
 */
function page(node: ReactNode) {
  return <RouteBoundary>{node}</RouteBoundary>;
}

/** Sends a signed-in user to their own dashboard, and everyone else to login. */
function RootRedirect() {
  const { user } = useAuthStore();
  if (!user) return <Navigate to="/login" replace />;
  if (user.role === 'student') return <Navigate to="/student/dashboard" replace />;
  if (user.role === 'teacher') return <Navigate to="/teacher/dashboard" replace />;
  return <Navigate to="/admin/dashboard" replace />;
}

/**
 * The whole route table.
 *
 * Each role's pages sit behind one `ProtectedRoute` on the parent route, so a
 * page cannot be reached by the wrong role and no page needs its own check.
 *
 * Two routes deliberately sit outside their role's layout: the exam player,
 * which is full-screen with no navigation to leave by mid-test, and the live
 * exam lobby, which students open from a join code before anything else.
 *
 * The app is served under /sat, which is why the router carries a basename.
 */
export function AppRouter() {
  return (
    <BrowserRouter basename="/sat" future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Routes>
        <Route path="/" element={<RootRedirect />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={page(<Register />)} />
        <Route path="/forgot-password" element={page(<ForgotPassword />)} />
        <Route path="/reset-password" element={page(<ResetPassword />)} />

        <Route
          path="/student"
          element={
            <ProtectedRoute role="student">
              <StudentLayout />
            </ProtectedRoute>
          }
        >
          <Route index element={<Navigate to="dashboard" replace />} />
          <Route path="dashboard" element={page(<StudentDashboard />)} />
          <Route path="exams" element={page(<ExamCatalogue />)} />
          <Route path="mock-test" element={page(<MockTest />)} />
          <Route path="results" element={page(<Results />)} />
          <Route path="results/:examId" element={page(<ExamDetail />)} />
          <Route path="feedback" element={page(<StudentFeedback />)} />
          <Route path="library" element={page(<StudentLibrary />)} />
          <Route path="progress" element={page(<Progress />)} />
          <Route path="mistakes" element={page(<Mistakes />)} />
          <Route path="live-exam" element={page(<JoinLiveExam />)} />
          <Route path="vocab-review" element={page(<VocabReview />)} />
          <Route path="settings" element={page(<StudentSettings />)} />
        </Route>

        <Route
          path="/teacher"
          element={
            <ProtectedRoute role="teacher">
              <TeacherLayout />
            </ProtectedRoute>
          }
        >
          <Route index element={<Navigate to="dashboard" replace />} />
          <Route path="dashboard" element={page(<TeacherDashboard />)} />
          <Route path="students" element={page(<Students />)} />
          <Route path="students/:studentId" element={page(<StudentDetail />)} />
          <Route path="students/:studentId/exams/:examId" element={page(<StudentExamDetail />)} />
          <Route path="content" element={page(<AddContent />)} />
          <Route path="feedback" element={page(<TeacherFeedback />)} />
          <Route path="library" element={page(<TeacherLibrary />)} />
          <Route path="live-exams" element={page(<LiveExams />)} />
          <Route path="live-exams/:sessionId" element={page(<LiveExamSessionPage />)} />
          <Route path="live-exams/:sessionId/participants/:participantId" element={page(<LiveExamStudentResult />)} />
        </Route>

        <Route
          path="/admin"
          element={
            <ProtectedRoute role="admin">
              <AdminLayout />
            </ProtectedRoute>
          }
        >
          <Route index element={<Navigate to="dashboard" replace />} />
          <Route path="dashboard" element={page(<AdminDashboard />)} />
          <Route path="users" element={page(<Users />)} />
          <Route path="access-codes" element={page(<AccessCodes />)} />
          <Route path="database" element={page(<Database />)} />
          <Route path="feedback" element={page(<AdminFeedback />)} />
          <Route path="library" element={page(<AdminLibrary />)} />
        </Route>

        <Route
          path="/student/exams/:examId"
          element={
            <ProtectedRoute role="student">
              {page(<TakeExam />)}
            </ProtectedRoute>
          }
        />
        <Route path="/live/:joinCode" element={page(<LiveExamLobby />)} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
