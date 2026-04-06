import React from 'react';
import { 
  Home, 
  Users, 
  BookOpen, 
  Calendar, 
  FileText, 
  DollarSign, 
  BarChart3,
  UserCheck,
  GraduationCap,
  ClipboardList,
  ShieldCheck,
  Settings,
  MessageSquare,
  Building2
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

interface SidebarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
}

const Sidebar: React.FC<SidebarProps> = ({ activeTab, setActiveTab }) => {
  const { user } = useAuth();

  const getMenuItems = () => {
    switch (user?.role) {
      case 'admin':
        return [
          { id: 'dashboard', label: 'Dashboard', icon: Home },
          { id: 'students', label: 'Students', icon: GraduationCap },
          { id: 'teachers', label: 'Teachers', icon: UserCheck },
          { id: 'lectures', label: 'Lectures', icon: BookOpen },
          { id: 'attendance', label: 'Attendance', icon: ClipboardList },
          { id: 'marks', label: 'Marks', icon: FileText },
          { id: 'fees', label: 'Fees', icon: DollarSign },
          { id: 'approvals', label: 'User Approvals', icon: ShieldCheck },
          { id: 'messages', label: 'Messages', icon: MessageSquare },
          { id: 'reports', label: 'Reports', icon: FileText },
          { id: 'analytics', label: 'Analytics', icon: BarChart3 },
          { id: 'ai', label: 'AI Insights', icon: BarChart3 },
          { id: 'branches', label: 'Branches', icon: Building2 },
          { id: 'settings', label: 'Class Settings', icon: Settings },
        ];
      case 'super_admin':
        return [
          { id: 'dashboard', label: 'Platform', icon: Home },
        ];
      case 'teacher':
        return [
          { id: 'dashboard', label: 'Dashboard', icon: Home },
          { id: 'schedule', label: 'My Schedule', icon: Calendar },
          { id: 'attendance', label: 'Attendance', icon: ClipboardList },
          { id: 'marks', label: 'Enter Marks', icon: FileText },
          { id: 'students', label: 'My Students', icon: Users },
          { id: 'messages', label: 'Messages', icon: MessageSquare },
        ];
      case 'student':
        return [
          { id: 'dashboard', label: 'Dashboard', icon: Home },
          { id: 'schedule', label: 'Class Schedule', icon: Calendar },
          { id: 'attendance', label: 'My Attendance', icon: ClipboardList },
          { id: 'marks', label: 'My Marks', icon: FileText },
          { id: 'fees', label: 'Fee Status', icon: DollarSign },
          { id: 'messages', label: 'Messages', icon: MessageSquare },
          { id: 'reports', label: 'Reports', icon: FileText },
        ];
      case 'parent':
        return [
          { id: 'dashboard', label: 'Dashboard', icon: Home },
          { id: 'attendance', label: "Child's Attendance", icon: ClipboardList },
          { id: 'marks', label: "Child's Marks", icon: FileText },
          { id: 'fees', label: 'Fee Status', icon: DollarSign },
          { id: 'messages', label: 'Messages', icon: MessageSquare },
          { id: 'reports', label: 'Reports', icon: FileText },
        ];
      default:
        return [];
    }
  };

  const menuItems = getMenuItems();

  return (
    <div className="bg-white shadow-sm border-r border-gray-200 w-64 min-h-screen">
      <nav className="mt-8">
        <div className="px-4">
          <ul className="space-y-2">
            {menuItems.map((item) => {
              const Icon = item.icon;
              return (
                <li key={item.id}>
                  <button
                    onClick={() => setActiveTab(item.id)}
                    className={`w-full flex items-center px-4 py-3 text-sm font-medium rounded-lg transition-colors ${
                      activeTab === item.id
                        ? 'bg-gradient-to-r from-blue-50 to-purple-50 text-blue-700 border-l-4 border-blue-600'
                        : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                    }`}
                  >
                    <Icon className="mr-3 h-5 w-5" />
                    {item.label}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      </nav>
    </div>
  );
};

export default Sidebar;
