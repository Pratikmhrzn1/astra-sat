import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { useAuthStore } from '@/shared/store/auth';
import { ProtectedRoute } from '@/app/guards/ProtectedRoute';

import StudentLayout from '@/layouts/StudentLayout';
import TeacherLayout from '@/layouts/TeacherLayout';
import AdminLayout from '@/layouts/AdminLayout';

import Login from '@/features/auth/pages/Login';
import Register from '@/features/auth/pages/Register';
import ForgotPassword from '@/features/auth/pages/ForgotPassword';
import ResetPassword from '@/features/auth/pages/ResetPassword';

import StudentDashboard from '@/features/student/pages/Dashboard';
import ExamCatalogue from '@/features/student/pages/ExamCatalogue';
import TakeExam from '@/features/student/pages/TakeExam';
import MockTest from '@/features/student/pages/MockTest';
import Results from '@/features/student/pages/Results';
import Mistakes from '@/features/student/pages/Mistakes';
import Progress from '@/features/student/pages/Progress';
import JoinLiveExam from '@/features/student/pages/JoinLiveExam';
import ExamDetail from '@/features/student/pages/ExamDetail';
import VocabReview from '@/features/student/pages/VocabReview';
import StudentSettings from '@/features/student/pages/Settings';

import TeacherDashboard from '@/features/teacher/pages/Dashboard';
import Students from '@/features/teacher/pages/Students';
import StudentDetail from '@/features/teacher/pages/StudentDetail';
import StudentExamDetail from '@/features/teacher/pages/StudentExamDetail';
import AddContent from '@/features/teacher/pages/AddContent';

import AdminDashboard from '@/features/admin/pages/Dashboard';
import Users from '@/features/admin/pages/Users';
import AccessCodes from '@/features/admin/pages/AccessCodes';
import Database from '@/features/admin/pages/Database';

import LiveExamLobby from '@/features/live-exam/pages/LiveExamLobby';
import LiveExams from '@/features/live-exam/pages/LiveExams';
import LiveExamSessionPage from '@/features/live-exam/pages/LiveExamSession';
import LiveExamStudentResult from '@/features/live-exam/pages/LiveExamStudentResult';

import StudentLibrary from '@/features/library/pages/StudentLibrary';
import TeacherLibrary from '@/features/library/pages/TeacherLibrary';
import AdminLibrary from '@/features/library/pages/AdminLibrary';

import StudentFeedback from '@/features/feedback/pages/StudentFeedback';
import TeacherFeedback from '@/features/feedback/pages/TeacherFeedback';
import AdminFeedback from '@/features/feedback/pages/AdminFeedback';

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
        <Route path="/register" element={<Register />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />

        <Route
          path="/student"
          element={
            <ProtectedRoute role="student">
              <StudentLayout />
            </ProtectedRoute>
          }
        >
          <Route index element={<Navigate to="dashboard" replace />} />
          <Route path="dashboard" element={<StudentDashboard />} />
          <Route path="exams" element={<ExamCatalogue />} />
          <Route path="mock-test" element={<MockTest />} />
          <Route path="results" element={<Results />} />
          <Route path="results/:examId" element={<ExamDetail />} />
          <Route path="feedback" element={<StudentFeedback />} />
          <Route path="library" element={<StudentLibrary />} />
          <Route path="progress" element={<Progress />} />
          <Route path="mistakes" element={<Mistakes />} />
          <Route path="live-exam" element={<JoinLiveExam />} />
          <Route path="vocab-review" element={<VocabReview />} />
          <Route path="settings" element={<StudentSettings />} />
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
          <Route path="dashboard" element={<TeacherDashboard />} />
          <Route path="students" element={<Students />} />
          <Route path="students/:studentId" element={<StudentDetail />} />
          <Route path="students/:studentId/exams/:examId" element={<StudentExamDetail />} />
          <Route path="content" element={<AddContent />} />
          <Route path="feedback" element={<TeacherFeedback />} />
          <Route path="library" element={<TeacherLibrary />} />
          <Route path="live-exams" element={<LiveExams />} />
          <Route path="live-exams/:sessionId" element={<LiveExamSessionPage />} />
          <Route path="live-exams/:sessionId/participants/:participantId" element={<LiveExamStudentResult />} />
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
          <Route path="dashboard" element={<AdminDashboard />} />
          <Route path="users" element={<Users />} />
          <Route path="access-codes" element={<AccessCodes />} />
          <Route path="database" element={<Database />} />
          <Route path="feedback" element={<AdminFeedback />} />
          <Route path="library" element={<AdminLibrary />} />
        </Route>

        <Route
          path="/student/exams/:examId"
          element={
            <ProtectedRoute role="student">
              <TakeExam />
            </ProtectedRoute>
          }
        />
        <Route path="/live/:joinCode" element={<LiveExamLobby />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
