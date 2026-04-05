import React, { useState } from 'react';
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
  const { user, currentClass, isLoading } = useAuth();
  const [activeTab, setActiveTab] = useState('dashboard');

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
          <AppContent />
        </AuthProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
