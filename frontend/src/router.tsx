import { lazy, type ReactNode } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { RouteBoundary } from '@/components/common/RouteBoundary';
import { useAuthStore } from '@/store/auth';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';

import StudentLayout from '@/shared/StudentLayout';
import TeacherLayout from '@/shared/TeacherLayout';
import AdminLayout from '@/shared/AdminLayout';

import Login from '@/pages/auth/LoginPage';
const Register = lazy(() => import('@/pages/auth/RegisterPage'));
const ForgotPassword = lazy(() => import('@/pages/auth/ForgotPasswordPage'));
const ResetPassword = lazy(() => import('@/pages/auth/ResetPasswordPage'));

const StudentDashboard = lazy(() => import('@/pages/student/DashboardPage'));
const ExamCatalogue = lazy(() => import('@/pages/student/ExamCataloguePage'));
const TakeExam = lazy(() => import('@/pages/student/TakeExamPage'));
const MockTest = lazy(() => import('@/pages/student/MockTestPage'));
const Results = lazy(() => import('@/pages/student/ResultsPage'));
const Mistakes = lazy(() => import('@/pages/student/MistakesPage'));
const Progress = lazy(() => import('@/pages/student/ProgressPage'));
const JoinLiveExam = lazy(() => import('@/pages/student/JoinLiveExamPage'));
const ExamDetail = lazy(() => import('@/pages/student/ExamDetailPage'));
const VocabReview = lazy(() => import('@/pages/student/VocabReviewPage'));
const StudentSettings = lazy(() => import('@/pages/student/SettingsPage'));

const TeacherDashboard = lazy(() => import('@/pages/teacher/DashboardPage'));
const Students = lazy(() => import('@/pages/teacher/StudentsPage'));
const StudentDetail = lazy(() => import('@/pages/teacher/StudentDetailPage'));
const StudentExamDetail = lazy(() => import('@/pages/teacher/StudentExamDetailPage'));
const AddContent = lazy(() => import('@/pages/teacher/AddContentPage'));

const AdminDashboard = lazy(() => import('@/pages/admin/DashboardPage'));
const Users = lazy(() => import('@/pages/admin/UsersPage'));
const AccessCodes = lazy(() => import('@/pages/admin/AccessCodesPage'));
const Database = lazy(() => import('@/pages/admin/DatabasePage'));

const LiveExamLobby = lazy(() => import('@/pages/live-exam/LiveExamLobbyPage'));
const LiveExams = lazy(() => import('@/pages/live-exam/LiveExamsPage'));
const LiveExamSessionPage = lazy(() => import('@/pages/live-exam/LiveExamSessionPage'));
const LiveExamStudentResult = lazy(() => import('@/pages/live-exam/LiveExamStudentResultPage'));

const StudentLibrary = lazy(() => import('@/pages/library/StudentLibraryPage'));
const TeacherLibrary = lazy(() => import('@/pages/library/TeacherLibraryPage'));
const AdminLibrary = lazy(() => import('@/pages/library/AdminLibraryPage'));

const StudentFeedback = lazy(() => import('@/pages/feedback/StudentFeedbackPage'));
const TeacherFeedback = lazy(() => import('@/pages/feedback/TeacherFeedbackPage'));
const AdminFeedback = lazy(() => import('@/pages/feedback/AdminFeedbackPage'));


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
