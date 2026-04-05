import React, { useEffect, useState } from 'react';
import { ArrowRight, ChevronRight, Route, School, ShieldCheck, Users } from 'lucide-react';
import { Navigate, Route as RouterRoute, Routes, useLocation, useNavigate, useParams } from 'react-router-dom';
import { useAuth, AuthProvider } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import AuthForm from './components/Auth/AuthForm';
import ClassSetup from './components/Setup/ClassSetup';
import Header from './components/Layout/Header';
import Sidebar from './components/Layout/Sidebar';
import AdminDashboard from './components/Dashboard/AdminDashboard';
import TeacherDashboard from './components/Dashboard/TeacherDashboard';
import StudentDashboard from './components/Dashboard/StudentDashboard';
import ParentDashboard from './components/Dashboard/ParentDashboard';
import SuperAdminDashboard from './components/Dashboard/SuperAdminDashboard';
import StudentManagement from './components/Management/StudentManagement';
import TeacherManagement from './components/Management/TeacherManagement';
import LectureManagement from './components/Management/LectureManagement';
import AttendanceManagement from './components/Management/AttendanceManagement';
import MarksManagement from './components/Management/MarksManagement';
import FeeManagement from './components/Management/FeeManagement';
import UserApprovals from './components/Management/UserApprovals';
import SettingsManagement from './components/Management/SettingsManagement';
import ErrorBoundary from './components/Common/ErrorBoundary';

const Unauthorized: React.FC = () => (
  <div className="p-8 text-center">
    <h2 className="text-2xl font-semibold text-gray-900">Unauthorized</h2>
    <p className="mt-2 text-gray-600">You do not have permission to access this area.</p>
  </div>
);

const PendingApprovalScreen: React.FC = () => {
  const { logout } = useAuth();
  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center px-4">
      <div className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-8 text-center shadow-sm">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-blue-100 mb-4">
          <ShieldCheck className="h-6 w-6 text-blue-600" />
        </div>
        <h2 className="text-xl font-bold text-gray-900">Approval Pending</h2>
        <p className="mt-2 text-gray-600 mb-6">
          Your account is pending approval from the admin. You will be able to access your dashboard once your request is approved.
        </p>
        <button
          onClick={logout}
          className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          Sign Out
        </button>
      </div>
    </div>
  );
};

const LoadingScreen: React.FC = () => (
  <div className="min-h-screen bg-gray-100 flex items-center justify-center">
    <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-600"></div>
  </div>
);

const InactiveClassScreen: React.FC<{ className?: string; plan?: string }> = ({ className, plan }) => (
  <div className="min-h-screen bg-gray-100 flex items-center justify-center px-4">
    <div className="w-full max-w-xl rounded-2xl border border-orange-100 bg-white p-8 shadow-sm text-center">
      <h1 className="text-2xl font-bold text-gray-900">Subscription expired</h1>
      <p className="mt-3 text-gray-600">
        {className ?? 'This class workspace'} is currently inactive. Upgrade the plan to continue using lectures,
        attendance, marks, fees, and dashboards.
      </p>
      {plan ? <p className="mt-2 text-sm text-orange-600">Current plan: {plan}</p> : null}
      <a
        href="/login"
        className="mt-6 inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-blue-600 to-orange-500 px-5 py-2 text-white transition hover:from-blue-700 hover:to-orange-600"
      >
        <span>Back to Login</span>
        <ChevronRight className="h-4 w-4" />
      </a>
    </div>
  </div>
);

const LandingPage: React.FC = () => {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-orange-50">
      <div className="mx-auto flex min-h-screen max-w-7xl flex-col px-6 py-10 lg:px-10">
        <header className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="rounded-2xl bg-gradient-to-r from-blue-600 to-orange-500 p-3">
              <School className="h-8 w-8 text-white" />
            </div>
            <div>
              <div className="text-2xl font-bold text-gray-900">TeachFlow</div>
              <div className="text-sm text-gray-600">Coaching class SaaS for admins, teachers, students, and parents</div>
            </div>
          </div>
          <a
            href="/login"
            className="inline-flex items-center gap-2 rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-gray-800"
          >
            <span>Login</span>
            <ChevronRight className="h-4 w-4" />
          </a>
        </header>

        <div className="grid flex-1 items-center gap-12 py-12 lg:grid-cols-[1.2fr,0.8fr]">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-blue-600">Modern Coaching Operations</p>
            <h1 className="mt-4 max-w-3xl text-5xl font-bold leading-tight text-gray-900">
              Run every class from its own secure TeachFlow workspace.
            </h1>
            <p className="mt-6 max-w-2xl text-lg text-gray-600">
              Create a class, share a unique URL like `/rane-classes`, and give each admin, teacher, student, and parent the right dashboard instantly.
            </p>
            <div className="mt-8 flex flex-wrap gap-4">
              <a
                href="/login"
                className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-orange-500 px-5 py-3 font-medium text-white transition hover:from-blue-700 hover:to-orange-600"
              >
                <span>Start With Admin Login</span>
                <ArrowRight className="h-4 w-4" />
              </a>
              <div className="rounded-xl border border-gray-200 bg-white px-5 py-3 text-sm text-gray-600 shadow-sm">
                Class login example: `teachflow.app/rane-classes/login`
              </div>
            </div>
          </div>

          <div className="grid gap-4">
            {[
              { title: 'Class-Isolated Workspaces', description: 'Every coaching class runs inside its own URL and Firestore tenant path.', icon: ShieldCheck },
              { title: 'Role-Based Dashboards', description: 'Admins, teachers, students, and parents see only the data they should.', icon: Users },
              { title: 'Realtime Operations', description: 'Attendance, marks, fees, and lectures stay synced live across dashboards.', icon: Route },
            ].map((item) => {
              const Icon = item.icon;
              return (
                <div key={item.title} className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
                  <div className="flex items-start gap-4">
                    <div className="rounded-xl bg-blue-100 p-3 text-blue-700">
                      <Icon className="h-5 w-5" />
                    </div>
                    <div>
                      <h2 className="text-lg font-semibold text-gray-900">{item.title}</h2>
                      <p className="mt-2 text-sm text-gray-600">{item.description}</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};

const TenantAppShell: React.FC = () => {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState('dashboard');
  const { classSlug } = useParams();

  useEffect(() => {
    setActiveTab('dashboard');
  }, [classSlug]);

  const renderContent = () => {
    if (user?.role === 'super_admin') {
      return <SuperAdminDashboard />;
    }

    if (user?.role === 'admin') {
      switch (activeTab) {
        case 'dashboard':
          return <AdminDashboard onNavigate={setActiveTab} />;
        case 'students':
          return <StudentManagement />;
        case 'teachers':
          return <TeacherManagement />;
        case 'lectures':
          return <LectureManagement />;
        case 'attendance':
          return <AttendanceManagement />;
        case 'marks':
          return <MarksManagement />;
        case 'fees':
          return <FeeManagement />;
        case 'approvals':
          return <UserApprovals />;
        case 'settings':
          return <SettingsManagement />;
        case 'reports':
          return <div className="p-8 text-center text-gray-500">Reports - Coming Soon</div>;
        default:
          return <AdminDashboard onNavigate={setActiveTab} />;
      }
    }

    if (user?.role === 'teacher') {
      switch (activeTab) {
        case 'dashboard':
          return <TeacherDashboard />;
        case 'schedule':
          return <LectureManagement />;
        case 'attendance':
          return <AttendanceManagement />;
        case 'marks':
          return <MarksManagement />;
        case 'students':
          return <StudentManagement />;
        default:
          return <TeacherDashboard />;
      }
    }

    if (user?.role === 'student') {
      switch (activeTab) {
        case 'dashboard':
          return <StudentDashboard />;
        case 'schedule':
          return <StudentDashboard initialTab="schedule" />;
        case 'attendance':
          return <StudentDashboard initialTab="attendance" />;
        case 'marks':
          return <StudentDashboard initialTab="marks" />;
        case 'fees':
          return <StudentDashboard initialTab="fees" />;
        default:
          return <StudentDashboard />;
      }
    }

    if (user?.role === 'parent') {
      switch (activeTab) {
        case 'dashboard':
          return <ParentDashboard />;
        case 'attendance':
          return <ParentDashboard initialTab="attendance" />;
        case 'marks':
          return <ParentDashboard initialTab="marks" />;
        case 'fees':
          return <ParentDashboard initialTab="fees" />;
        default:
          return <ParentDashboard />;
      }
    }

    return <Unauthorized />;
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />
      <div className="flex">
        <Sidebar activeTab={activeTab} setActiveTab={setActiveTab} />
        <main className="flex-1 p-8">{renderContent()}</main>
      </div>
    </div>
  );
};

const LoginScreen: React.FC<{ tenantSlug?: string; initialMode?: 'login' | 'signup' }> = ({
  tenantSlug,
  initialMode = 'login',
}) => {
  const { user, currentClass, classes, isLoading } = useAuth();

  if (isLoading) {
    return <LoadingScreen />;
  }

  if (user) {
    if (user.role === 'super_admin') {
      return <Navigate to="/platform" replace />;
    }

    if (user.role === 'admin' && (!user.classIds || user.classIds.length === 0)) {
      return <Navigate to="/setup" replace />;
    }

    const targetClass = tenantSlug
      ? classes.find((item) => item.subdomain === tenantSlug) ?? currentClass ?? classes[0]
      : currentClass ?? classes[0];

    if (targetClass) {
      return <Navigate to={`/${targetClass.subdomain}`} replace />;
    }
  }

  return <AuthForm tenantSlug={tenantSlug} initialMode={initialMode} />;
};

const TenantLoginScreen: React.FC = () => {
  const { classSlug } = useParams();
  return <LoginScreen tenantSlug={classSlug} initialMode="login" />;
};

const SignupScreen: React.FC = () => <LoginScreen initialMode="signup" />;

const TenantSignupScreen: React.FC = () => {
  const { classSlug } = useParams();
  return <LoginScreen tenantSlug={classSlug} initialMode="signup" />;
};

const TenantRoute: React.FC = () => {
  const { user, currentClass, classes, isLoading, switchClass } = useAuth();
  const { classSlug } = useParams();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (isLoading || !user || !classSlug) return;

    const targetClass = classes.find((item) => item.subdomain === classSlug);
    const fallbackClass = currentClass ?? classes[0];

    if (!targetClass) {
      if (fallbackClass) {
        navigate(`/${fallbackClass.subdomain}`, { replace: true });
      } else if (user.role === 'admin') {
        navigate('/setup', { replace: true });
      } else {
        navigate(`/${classSlug}/login`, { replace: true });
      }
      return;
    }

    if (currentClass?.id !== targetClass.id) {
      void switchClass(targetClass.id);
      return;
    }

    if (targetClass.subdomain !== classSlug) {
      navigate(`/${targetClass.subdomain}`, { replace: true });
    }
  }, [classSlug, classes, currentClass, isLoading, navigate, switchClass, user]);

  if (isLoading) {
    return <LoadingScreen />;
  }

  if (user?.role === 'super_admin') {
    return <Navigate to="/platform" replace />;
  }

  if (!user && classSlug) {
    return <Navigate to={`/${classSlug}/login`} replace state={{ from: location.pathname }} />;
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  if (user.role === 'admin' && classes.length === 0) {
    return <Navigate to="/setup" replace />;
  }

  if (user.approved === false) {
    return <PendingApprovalScreen />;
  }

  if (!classSlug) {
    const targetClass = currentClass ?? classes[0];
    if (targetClass) {
      return <Navigate to={`/${targetClass.subdomain}`} replace />;
    }
  }

  if (!currentClass || currentClass.subdomain !== classSlug) {
    return <LoadingScreen />;
  }

  if (currentClass.isActive === false) {
    return <InactiveClassScreen className={currentClass.name} plan={currentClass.plan} />;
  }

  return <TenantAppShell />;
};

const SetupScreen: React.FC = () => {
  const { user, currentClass, classes, isLoading } = useAuth();

  if (isLoading) {
    return <LoadingScreen />;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (user.role === 'super_admin') {
    return <Navigate to="/platform" replace />;
  }

  if (currentClass ?? classes[0]) {
    const targetClass = currentClass ?? classes[0];
    return <Navigate to={`/${targetClass!.subdomain}`} replace />;
  }

  if (user.role !== 'admin') {
    return <Navigate to="/login" replace />;
  }

  return <ClassSetup />;
};

const PlatformRoute: React.FC = () => {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return <LoadingScreen />;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (user.role !== 'super_admin') {
    return <Navigate to="/" replace />;
  }

  return <TenantAppShell />;
};

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider>
        <AuthProvider>
          <Routes>
            <RouterRoute path="/" element={<LandingPage />} />
            <RouterRoute path="/login" element={<LoginScreen />} />
            <RouterRoute path="/signup" element={<SignupScreen />} />
            <RouterRoute path="/setup" element={<SetupScreen />} />
            <RouterRoute path="/platform" element={<PlatformRoute />} />
            <RouterRoute path="/:classSlug/login" element={<TenantLoginScreen />} />
            <RouterRoute path="/:classSlug/signup" element={<TenantSignupScreen />} />
            <RouterRoute path="/:classSlug/*" element={<TenantRoute />} />
            <RouterRoute path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </AuthProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
