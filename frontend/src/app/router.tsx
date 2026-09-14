import { lazy, type ReactNode } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { RouteBoundary } from '@/app/RouteBoundary';
import { useAuthStore } from '@/shared/store/auth';
import { ProtectedRoute } from '@/app/guards/ProtectedRoute';

import StudentLayout from '@/layouts/StudentLayout';
import TeacherLayout from '@/layouts/TeacherLayout';
import AdminLayout from '@/layouts/AdminLayout';

import Login from '@/features/auth/pages/Login';
const Register = lazy(() => import('@/features/auth/pages/Register'));
const ForgotPassword = lazy(() => import('@/features/auth/pages/ForgotPassword'));
const ResetPassword = lazy(() => import('@/features/auth/pages/ResetPassword'));

const StudentDashboard = lazy(() => import('@/features/student/pages/Dashboard'));
const ExamCatalogue = lazy(() => import('@/features/student/pages/ExamCatalogue'));
const TakeExam = lazy(() => import('@/features/student/pages/TakeExam'));
const MockTest = lazy(() => import('@/features/student/pages/MockTest'));
const Results = lazy(() => import('@/features/student/pages/Results'));
const Mistakes = lazy(() => import('@/features/student/pages/Mistakes'));
const Progress = lazy(() => import('@/features/student/pages/Progress'));
const JoinLiveExam = lazy(() => import('@/features/student/pages/JoinLiveExam'));
const ExamDetail = lazy(() => import('@/features/student/pages/ExamDetail'));
const VocabReview = lazy(() => import('@/features/student/pages/VocabReview'));
const StudentSettings = lazy(() => import('@/features/student/pages/Settings'));

const TeacherDashboard = lazy(() => import('@/features/teacher/pages/Dashboard'));
const Students = lazy(() => import('@/features/teacher/pages/Students'));
const StudentDetail = lazy(() => import('@/features/teacher/pages/StudentDetail'));
const StudentExamDetail = lazy(() => import('@/features/teacher/pages/StudentExamDetail'));
const AddContent = lazy(() => import('@/features/teacher/pages/AddContent'));

const AdminDashboard = lazy(() => import('@/features/admin/pages/Dashboard'));
const Users = lazy(() => import('@/features/admin/pages/Users'));
const AccessCodes = lazy(() => import('@/features/admin/pages/AccessCodes'));
const Database = lazy(() => import('@/features/admin/pages/Database'));

const LiveExamLobby = lazy(() => import('@/features/live-exam/pages/LiveExamLobby'));
const LiveExams = lazy(() => import('@/features/live-exam/pages/LiveExams'));
const LiveExamSessionPage = lazy(() => import('@/features/live-exam/pages/LiveExamSession'));
const LiveExamStudentResult = lazy(() => import('@/features/live-exam/pages/LiveExamStudentResult'));

const StudentLibrary = lazy(() => import('@/features/library/pages/StudentLibrary'));
const TeacherLibrary = lazy(() => import('@/features/library/pages/TeacherLibrary'));
const AdminLibrary = lazy(() => import('@/features/library/pages/AdminLibrary'));

const StudentFeedback = lazy(() => import('@/features/feedback/pages/StudentFeedback'));
const TeacherFeedback = lazy(() => import('@/features/feedback/pages/TeacherFeedback'));
const AdminFeedback = lazy(() => import('@/features/feedback/pages/AdminFeedback'));


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
