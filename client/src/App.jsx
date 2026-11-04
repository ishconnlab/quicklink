import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { lazy, Suspense } from 'react';
import { useAuth } from './context/AuthContext.jsx';
import AppLayout from './components/AppLayout.jsx';
import LoginPage from './pages/LoginPage.jsx';
import RegisterPage from './pages/RegisterPage.jsx';
import LearningPage from './pages/LearningPage.jsx';
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
import StudentDashboard from './pages/StudentDashboard.jsx';
import TeacherDashboard from './pages/TeacherDashboard.jsx';
import CertificateVerifyPage from './pages/CertificateVerifyPage.jsx';
import PublicTrainingRegistrationPage from './pages/PublicTrainingRegistrationPage.jsx';
import TrainingRegistrationsPage from './pages/TrainingRegistrationsPage.jsx';

const LiveSessionPage = lazy(() => import('./pages/LiveSessionPage.jsx'));

function Protected({ children }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <SplashScreen />;
  if (!user) return <Navigate to="/login" replace state={{ from: location }} />;
  return children;
}

function Landing() {
  const { user } = useAuth();
  return <Navigate to={user?.role === 'owner' ? '/learning' : '/dashboard'} replace />;
}

function OwnerOnly({ children }) {
  const { user } = useAuth();
  return user?.role === 'owner' ? children : <Navigate to="/learn" replace />;
}

function StudentLearning({ children }) {
  const { user } = useAuth();
  return user?.role === 'owner' ? <Navigate to="/learning" replace /> : children;
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
        <Route path="/learn" element={<StudentLearning><LearningPage learner /></StudentLearning>} />
        <Route path="/dashboard" element={<StudentLearning>{user?.role === 'teacher' ? <TeacherDashboard /> : <StudentDashboard />}</StudentLearning>} />
        <Route path="/courses" element={<StudentLearning><CoursesPage /></StudentLearning>} />
        <Route path="/courses/:id" element={<StudentLearning><CourseDetailPage /></StudentLearning>} />
        <Route path="/learning" element={<OwnerOnly><LearningPage /></OwnerOnly>} />
        <Route path="/classes" element={<ClassesPage />} />
        <Route path="/classes/join/:sessionCode" element={<JoinClassPage />} />
        <Route path="/classes/invitations/:token" element={<ClassInvitationPage />} />
        <Route path="/classes/sessions/:sessionId/live" element={<Suspense fallback={<SplashScreen />}><LiveSessionPage /></Suspense>} />
        <Route path="/classes/sessions/:sessionId/report" element={<ClassReportPage />} />
        <Route path="/classes/:id" element={<ClassDetailPage />} />
        <Route path="/users" element={<OwnerOnly><UsersPage /></OwnerOnly>} />
        <Route path="/registrations" element={<OwnerOnly><TrainingRegistrationsPage /></OwnerOnly>} />
        <Route path="/settings" element={<SettingsPage />} />
      </Route>
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
