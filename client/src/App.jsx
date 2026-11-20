import { lazy, Suspense, useEffect } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from './context/AuthContext.jsx';
import AppLayout from './components/AppLayout.jsx';
import LoginPage from './pages/LoginPage.jsx';
import RegisterPage from './pages/RegisterPage.jsx';
import NotFoundPage from './pages/NotFoundPage.jsx';
import SplashScreen from './components/SplashScreen.jsx';

const UsersPage = lazy(() => import('./pages/UsersPage.jsx'));
const SettingsPage = lazy(() => import('./pages/SettingsPage.jsx'));
const ClassesPage = lazy(() => import('./pages/ClassesPage.jsx'));
const ClassDetailPage = lazy(() => import('./pages/ClassDetailPage.jsx'));
const JoinClassPage = lazy(() => import('./pages/JoinClassPage.jsx'));
const ClassReportPage = lazy(() => import('./pages/ClassReportPage.jsx'));
const ClassInvitationPage = lazy(() => import('./pages/ClassInvitationPage.jsx'));
const CoursesPage = lazy(() => import('./pages/CoursesPage.jsx'));
const CourseDetailPage = lazy(() => import('./pages/CourseDetailPage.jsx'));
const CourseLearningPage = lazy(() => import('./pages/CourseLearningPage.jsx'));
const TrainingEditorPage = lazy(() => import('./pages/TrainingEditorPage.jsx'));
const AdminEnrollmentsPage = lazy(() => import('./pages/AdminEnrollmentsPage.jsx'));
const StudentDashboard = lazy(() => import('./pages/StudentDashboard.jsx'));
const AdminDashboard = lazy(() => import('./pages/AdminDashboard.jsx'));
const CertificateVerifyPage = lazy(() => import('./pages/CertificateVerifyPage.jsx'));
const CertificateLookupPage = lazy(() => import('./pages/CertificateLookupPage.jsx'));
const TrainingRegistrationsPage = lazy(() => import('./pages/TrainingRegistrationsPage.jsx'));
const CertificatesPage = lazy(() => import('./pages/CertificatesPage.jsx'));
const LiveSessionPage = lazy(() => import('./pages/LiveSessionPage.jsx'));

function Protected({ children }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <SplashScreen />;
  if (!user) return <Navigate to="/login" replace state={{ from: location }} />;
  return children;
}

function DashboardRedirect() {
  return <Navigate to="/dashboard" replace />;
}

function AdminOnly({ children }) {
  const { user } = useAuth();
  return user?.role === 'admin' ? children : <Navigate to="/dashboard" replace />;
}

function PrivateRobots() {
  const { pathname } = useLocation();
  useEffect(() => {
    if (pathname === '/verify' || /^\/verify\/[^/]+$/.test(pathname)) return;
    document.head.querySelector('link[rel="canonical"]')?.remove();
    document.head.querySelector('script[data-quicklink-schema]')?.remove();
    let robots = document.head.querySelector('meta[name="robots"]');
    if (!robots) { robots = document.createElement('meta'); robots.name = 'robots'; document.head.appendChild(robots); }
    robots.content = 'noindex, nofollow, nosnippet';
  }, [pathname]);
  return null;
}

export default function App() {
  const { user, loading } = useAuth();
  return <>
    <PrivateRobots />
    <Suspense fallback={<SplashScreen />}>
      <Routes>
        <Route path="/" element={<Navigate to="/login" replace />} />
        <Route path="/login" element={loading ? <SplashScreen /> : user ? <DashboardRedirect /> : <LoginPage />} />
        <Route path="/register" element={loading ? <SplashScreen /> : user ? <DashboardRedirect /> : <RegisterPage />} />
        <Route path="/verify" element={<CertificateLookupPage />} />
        <Route path="/verify/:code" element={<CertificateVerifyPage />} />
        <Route element={<Protected><AppLayout /></Protected>}>
          <Route path="/dashboard" element={user?.role === 'admin' ? <AdminOnly><AdminDashboard /></AdminOnly> : <StudentDashboard />} />
          <Route path="/courses" element={<CoursesPage offeringType="training" />} />
          <Route path="/admin/courses" element={<AdminOnly><CoursesPage offeringType="course" /></AdminOnly>} />
          <Route path="/courses/new" element={<AdminOnly><TrainingEditorPage /></AdminOnly>} />
          <Route path="/courses/:id" element={<CourseDetailPage />} />
          <Route path="/courses/:id/learn" element={<CourseLearningPage />} />
          <Route path="/courses/:id/edit" element={<AdminOnly><TrainingEditorPage /></AdminOnly>} />
          <Route path="/classes" element={<ClassesPage />} />
          <Route path="/classes/join/:sessionCode" element={<JoinClassPage />} />
          <Route path="/classes/invitations/:token" element={<ClassInvitationPage />} />
          <Route path="/classes/sessions/:sessionId/live" element={<LiveSessionPage />} />
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
    </Suspense>
  </>;
}
