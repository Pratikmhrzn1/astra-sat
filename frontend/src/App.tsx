import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './store/auth';
import { ProtectedRoute } from './components/ProtectedRoute';
import { proactiveRefresh } from './api/client';

import Login from './pages/auth/Login';
import Register from './pages/auth/Register';

import StudentLayout from './pages/student/StudentLayout';
import StudentDashboard from './pages/student/Dashboard';
import ExamCatalogue from './pages/student/ExamCatalogue';
import TakeExam from './pages/student/TakeExam';
import MockTest from './pages/student/MockTest';
import Results from './pages/student/Results';
import ExamDetail from './pages/student/ExamDetail';
import StudentFeedback from './pages/student/Feedback';
import Library from './pages/student/Library';
import StudentSettings from './pages/student/Settings';
import VocabReview from './pages/student/VocabReview';

import TeacherLayout from './pages/teacher/TeacherLayout';
import TeacherDashboard from './pages/teacher/Dashboard';
import Students from './pages/teacher/Students';
import StudentDetail from './pages/teacher/StudentDetail';
import StudentExamDetail from './pages/teacher/StudentExamDetail';
import AddContent from './pages/teacher/AddContent';
import TeacherFeedback from './pages/teacher/Feedback';

import AdminLayout from './pages/admin/AdminLayout';
import AdminDashboard from './pages/admin/Dashboard';
import Users from './pages/admin/Users';
import AccessCodes from './pages/admin/AccessCodes';
import Database from './pages/admin/Database';
import AdminFeedback from './pages/admin/Feedback';
import AdminLibrary from './pages/admin/Library';

import TeacherLibrary from './pages/teacher/Library';

function RootRedirect() {
  const { user } = useAuthStore();
  if (!user) return <Navigate to="/login" replace />;
  if (user.role === 'student') return <Navigate to="/student/dashboard" replace />;
  if (user.role === 'teacher') return <Navigate to="/teacher/dashboard" replace />;
  return <Navigate to="/admin/dashboard" replace />;
}

export default function App() {
  useEffect(() => {
    // Refresh the access token whenever the user returns to the tab.
    // This runs BEFORE React Query's refetchOnWindowFocus fires its burst of
    // queries, so all of those requests get a fresh token with no 401 cascade.
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') proactiveRefresh();
    };
    document.addEventListener('visibilitychange', handleVisibility);
    // Also run immediately on mount in case the page loaded with an expired token.
    proactiveRefresh();
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, []);

  return (
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Routes>
        <Route path="/" element={<RootRedirect />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />

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
          <Route path="exams/:examId" element={<TakeExam />} />
          <Route path="mock-test" element={<MockTest />} />
          <Route path="results" element={<Results />} />
          <Route path="results/:examId" element={<ExamDetail />} />
          <Route path="feedback" element={<StudentFeedback />} />
          <Route path="library" element={<Library />} />
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

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
