import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext.jsx';
import AppLayout from './components/AppLayout.jsx';
import LoginPage from './pages/LoginPage.jsx';
import RegisterPage from './pages/RegisterPage.jsx';
import DashboardPage from './pages/DashboardPage.jsx';
import SchoolsPage from './pages/SchoolsPage.jsx';
import SchoolFormPage from './pages/SchoolFormPage.jsx';
import SchoolDetailPage from './pages/SchoolDetailPage.jsx';
import StudentsPage from './pages/StudentsPage.jsx';
import StudentFormPage from './pages/StudentFormPage.jsx';
import UsersPage from './pages/UsersPage.jsx';
import ReportsPage from './pages/ReportsPage.jsx';
import SyncPage from './pages/SyncPage.jsx';
import SettingsPage from './pages/SettingsPage.jsx';
import OnboardingPage from './pages/OnboardingPage.jsx';
import AdmissionPacksPage from './pages/AdmissionPacksPage.jsx';
import AdmissionPackFormPage from './pages/AdmissionPackFormPage.jsx';
import AdmissionsPage from './pages/AdmissionsPage.jsx';
import AdmissionFormPage from './pages/AdmissionFormPage.jsx';
import AdmissionDetailPage from './pages/AdmissionDetailPage.jsx';
import MessagesPage from './pages/MessagesPage.jsx';
import ConnectPage from './pages/ConnectPage.jsx';
import ParentPortalPage from './pages/ParentPortalPage.jsx';
import NotFoundPage from './pages/NotFoundPage.jsx';
import SplashScreen from './components/SplashScreen.jsx';

function Protected({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <SplashScreen />;
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

function StaffOnly({ children }) {
  const { user } = useAuth();
  if (user?.role === 'parent') return <Navigate to="/parent" replace />;
  return children;
}

function ParentOnly({ children }) {
  const { user } = useAuth();
  if (user && user.role !== 'parent') return <Navigate to="/" replace />;
  return children;
}

export default function App() {
  const { user, loading } = useAuth();
  if (loading) return <SplashScreen />;

  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/" replace /> : <LoginPage />} />
      <Route path="/register" element={user ? <Navigate to="/" replace /> : <RegisterPage />} />
      <Route path="/connect" element={<ConnectPage />} />
      <Route
        path="/parent"
        element={
          <Protected>
            <ParentOnly>
              <ParentPortalPage />
            </ParentOnly>
          </Protected>
        }
      />
      <Route
        element={
          <Protected>
            <StaffOnly>
              <AppLayout />
            </StaffOnly>
          </Protected>
        }
      >
        <Route path="/" element={<DashboardPage />} />
        <Route path="/onboarding" element={<OnboardingPage />} />
        <Route path="/schools" element={<SchoolsPage />} />
        <Route path="/schools/new" element={<SchoolFormPage />} />
        <Route path="/schools/:id" element={<SchoolDetailPage />} />
        <Route path="/schools/:id/edit" element={<SchoolFormPage />} />
        <Route path="/students" element={<StudentsPage />} />
        <Route path="/students/new" element={<StudentFormPage />} />
        <Route path="/students/:id/edit" element={<StudentFormPage />} />
        <Route path="/admissions" element={<AdmissionsPage />} />
        <Route path="/admissions/new" element={<AdmissionFormPage />} />
        <Route path="/admissions/:id" element={<AdmissionDetailPage />} />
        <Route path="/admission-packs" element={<AdmissionPacksPage />} />
        <Route path="/admission-packs/new" element={<AdmissionPackFormPage />} />
        <Route path="/admission-packs/:id/edit" element={<AdmissionPackFormPage />} />
        <Route path="/messages" element={<MessagesPage />} />
        <Route path="/messages/:id" element={<MessagesPage />} />
        <Route path="/reports" element={<ReportsPage />} />
        <Route path="/sync" element={<SyncPage />} />
        <Route path="/users" element={<UsersPage />} />
        <Route path="/settings" element={<SettingsPage />} />
      </Route>
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
