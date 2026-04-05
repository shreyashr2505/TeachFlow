import React, { useState } from 'react';
import { Navigate, Route, Routes, useNavigate, useParams } from 'react-router-dom';
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
import StudentManagement from './components/Management/StudentManagement';
import TeacherManagement from './components/Management/TeacherManagement';
import LectureManagement from './components/Management/LectureManagement';
import AttendanceManagement from './components/Management/AttendanceManagement';
import MarksManagement from './components/Management/MarksManagement';
import FeeManagement from './components/Management/FeeManagement';
import ErrorBoundary from './components/Common/ErrorBoundary';

const Unauthorized: React.FC = () => (
  <div className="p-8 text-center">
    <h2 className="text-2xl font-semibold text-gray-900">Unauthorized</h2>
    <p className="mt-2 text-gray-600">You do not have permission to access this area.</p>
  </div>
);

const AppContent: React.FC = () => {
  const { user, currentClass, classes, isLoading, switchClass } = useAuth();
  const { classSlug } = useParams();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('dashboard');

  React.useEffect(() => {
    if (isLoading || !user) return;

    if (classes.length === 0) {
      if (classSlug) {
        navigate('/', { replace: true });
      }
      return;
    }

    const defaultClass = currentClass ?? classes[0];
    const matchedClass = classSlug ? classes.find((item) => item.subdomain === classSlug) : defaultClass;

    if (!matchedClass) {
      navigate(`/${defaultClass.subdomain}`, { replace: true });
      return;
    }

    if (currentClass?.id !== matchedClass.id) {
      void switchClass(matchedClass.id);
    }

    if (classSlug !== matchedClass.subdomain) {
      navigate(`/${matchedClass.subdomain}`, { replace: true });
    }
  }, [classSlug, classes, currentClass, isLoading, navigate, switchClass, user]);

  React.useEffect(() => {
    setActiveTab('dashboard');
  }, [classSlug]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!user) {
    return <AuthForm />;
  }

  // Show class setup for admin users who haven't created a class yet
  if (user.role === 'admin' && !currentClass) {
    return <ClassSetup />;
  }

  if (classSlug && currentClass && currentClass.subdomain !== classSlug) {
    return null;
  }

  const renderContent = () => {
    if (user.role === 'admin') {
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
        case 'reports':
          return <div className="p-8 text-center text-gray-500">Reports - Coming Soon</div>;
        default:
          return <AdminDashboard onNavigate={setActiveTab} />;
      }
    } else if (user.role === 'teacher') {
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
    } else if (user.role === 'student') {
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
    } else if (user.role === 'parent') {
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
        <main className="flex-1 p-8">
          {renderContent()}
        </main>
      </div>
    </div>
  );
};

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider>
        <AuthProvider>
          <Routes>
            <Route path="/" element={<AppContent />} />
            <Route path="/:classSlug/*" element={<AppContent />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </AuthProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
