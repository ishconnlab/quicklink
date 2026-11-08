import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { lazy, Suspense } from 'react';
import { useAuth } from './context/AuthContext.jsx';
import AppLayout from './components/AppLayout.jsx';
import LoginPage from './pages/LoginPage.jsx';
import RegisterPage from './pages/RegisterPage.jsx';
import UsersPage from './pages/UsersPage.jsx';
import SettingsPage from './pages/SettingsPage.jsx';
import NotFoundPage from './pages/NotFoundPage.jsx';
import SplashScreen from './components/SplashScreen.jsx';
import ClassesPage from './pages/ClassesPage.jsx';
import ClassDetailPage from './pages/ClassDetailPage.jsx';
import JoinClassPage from './pages/JoinClassPage.jsx';
import ClassReportPage from './pages/ClassReportPage.jsx';
import ClassInvitationPage from './pages/ClassInvitationPage.jsx';
import CoursesPage from './pages/CoursesPage.jsx';
import CourseDetailPage from './pages/CourseDetailPage.jsx';
import TrainingEditorPage from './pages/TrainingEditorPage.jsx';
import AdminEnrollmentsPage from './pages/AdminEnrollmentsPage.jsx';
import StudentDashboard from './pages/StudentDashboard.jsx';
import AdminDashboard from './pages/AdminDashboard.jsx';
import CertificateVerifyPage from './pages/CertificateVerifyPage.jsx';
import PublicTrainingRegistrationPage from './pages/PublicTrainingRegistrationPage.jsx';
import TrainingRegistrationsPage from './pages/TrainingRegistrationsPage.jsx';
import CertificatesPage from './pages/CertificatesPage.jsx';
import { isAdmin } from './lib/roles.js';

const LiveSessionPage = lazy(() => import('./pages/LiveSessionPage.jsx'));

function Protected({ children }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <SplashScreen />;
  if (!user) return <Navigate to="/login" replace state={{ from: location }} />;
  return children;
}

function Landing() {
  return <Navigate to="/dashboard" replace />;
}

function AdminOnly({ children }) {
  const { user } = useAuth();
  return isAdmin(user) ? children : <Navigate to="/dashboard" replace />;
}

export default function App() {
  const { user, loading } = useAuth();
  if (loading) return <SplashScreen />;

  return (
    <Routes>
      <Route path="/login" element={user ? <Landing /> : <LoginPage />} />
      <Route path="/register" element={user ? <Landing /> : <RegisterPage />} />
      <Route path="/training-registration/:slug" element={<PublicTrainingRegistrationPage />} />
      <Route path="/verify/:code" element={<CertificateVerifyPage />} />
      <Route element={<Protected><AppLayout /></Protected>}>
        <Route path="/" element={<Landing />} />
        <Route path="/dashboard" element={isAdmin(user) ? <AdminOnly><AdminDashboard /></AdminOnly> : <StudentDashboard />} />
        <Route path="/courses" element={<CoursesPage />} />
        <Route path="/courses/new" element={<AdminOnly><TrainingEditorPage /></AdminOnly>} />
        <Route path="/courses/:id" element={<CourseDetailPage />} />
        <Route path="/courses/:id/edit" element={<AdminOnly><TrainingEditorPage /></AdminOnly>} />
        <Route path="/classes" element={<ClassesPage />} />
        <Route path="/classes/join/:sessionCode" element={<JoinClassPage />} />
        <Route path="/classes/invitations/:token" element={<ClassInvitationPage />} />
        <Route path="/classes/sessions/:sessionId/live" element={<Suspense fallback={<SplashScreen />}><LiveSessionPage /></Suspense>} />
        <Route path="/classes/sessions/:sessionId/report" element={<ClassReportPage />} />
        <Route path="/classes/:id" element={<ClassDetailPage />} />
        <Route path="/enrollments" element={<AdminOnly><AdminEnrollmentsPage /></AdminOnly>} />
        <Route path="/certificates" element={<CertificatesPage />} />
        <Route path="/students" element={<AdminOnly><UsersPage /></AdminOnly>} />
        <Route path="/users" element={<Navigate to="/students" replace />} />
        <Route path="/registrations" element={<AdminOnly><TrainingRegistrationsPage /></AdminOnly>} />
        <Route path="/settings" element={<SettingsPage />} />
      </Route>
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
