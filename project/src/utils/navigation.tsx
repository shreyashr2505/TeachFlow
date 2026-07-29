import { BarChart3, BookOpen, Building2, Calendar, ClipboardList, CreditCard, DollarSign, FileText, Home, MessageSquare, Settings, ShieldCheck, UserCheck, Users, Bot, GraduationCap, Wallet } from 'lucide-react';
import { User } from '../types';

export interface NavigationItem {
  id: string;
  label: string;
  shortLabel: string;
  icon: typeof Home;
}

export const getNavigationItems = (role?: User['role'] | null): NavigationItem[] => {
  switch (role) {
    case 'admin':
      return [
        { id: 'dashboard', label: 'Dashboard', shortLabel: 'Home', icon: Home },
        { id: 'students', label: 'Students', shortLabel: 'Students', icon: GraduationCap },
        { id: 'teachers', label: 'Teachers', shortLabel: 'Teachers', icon: UserCheck },
        { id: 'batches', label: 'Batches', shortLabel: 'Batches', icon: Calendar },
        { id: 'lectures', label: 'Lectures', shortLabel: 'Lectures', icon: BookOpen },
        { id: 'attendance', label: 'Attendance', shortLabel: 'Attendance', icon: ClipboardList },
        { id: 'marks', label: 'Marks', shortLabel: 'Marks', icon: FileText },
        { id: 'fees', label: 'Fees', shortLabel: 'Fees', icon: DollarSign },
        { id: 'approvals', label: 'User Approvals', shortLabel: 'Approvals', icon: ShieldCheck },
        { id: 'messages', label: 'Messages', shortLabel: 'Messages', icon: MessageSquare },
        { id: 'pricing', label: 'Pricing & Billing', shortLabel: 'Billing', icon: CreditCard },
        { id: 'billing', label: 'Billing Center', shortLabel: 'Billing', icon: Wallet },
        { id: 'reports', label: 'Reports', shortLabel: 'Reports', icon: FileText },
        { id: 'analytics', label: 'Analytics', shortLabel: 'Analytics', icon: BarChart3 },
        { id: 'ai', label: 'AI Insights', shortLabel: 'AI', icon: Bot },
        { id: 'branches', label: 'Branches', shortLabel: 'Branches', icon: Building2 },
        { id: 'settings', label: 'Class Settings', shortLabel: 'Settings', icon: Settings },
      ];
    case 'super_admin':
      return [
        { id: 'dashboard', label: 'Overview', shortLabel: 'Home', icon: Home },
        { id: 'classes', label: 'Classes', shortLabel: 'Classes', icon: Building2 },
        { id: 'payments', label: 'Payments', shortLabel: 'Payments', icon: CreditCard },
        { id: 'pricing', label: 'Pricing', shortLabel: 'Pricing', icon: Settings },
        { id: 'ai_control', label: 'AI Control', shortLabel: 'AI', icon: Bot },
        { id: 'growth', label: 'Growth', shortLabel: 'Growth', icon: BarChart3 },
        { id: 'users', label: 'Users', shortLabel: 'Users', icon: Users },
      ];
    case 'teacher':
      return [
        { id: 'dashboard', label: 'Dashboard', shortLabel: 'Home', icon: Home },
        { id: 'schedule', label: 'My Schedule', shortLabel: 'Schedule', icon: Calendar },
        { id: 'attendance', label: 'Attendance', shortLabel: 'Attendance', icon: ClipboardList },
        { id: 'marks', label: 'Enter Marks', shortLabel: 'Marks', icon: FileText },
        { id: 'students', label: 'My Students', shortLabel: 'Students', icon: Users },
        { id: 'messages', label: 'Messages', shortLabel: 'Messages', icon: MessageSquare },
      ];
    case 'student':
      return [
        { id: 'dashboard', label: 'Dashboard', shortLabel: 'Home', icon: Home },
        { id: 'schedule', label: 'Class Schedule', shortLabel: 'Schedule', icon: Calendar },
        { id: 'attendance', label: 'My Attendance', shortLabel: 'Attendance', icon: ClipboardList },
        { id: 'marks', label: 'My Marks', shortLabel: 'Marks', icon: FileText },
        { id: 'fees', label: 'Fee Status', shortLabel: 'Fees', icon: DollarSign },
        { id: 'messages', label: 'Messages', shortLabel: 'Messages', icon: MessageSquare },
        { id: 'reports', label: 'Reports', shortLabel: 'Reports', icon: FileText },
      ];
    case 'parent':
      return [
        { id: 'dashboard', label: 'Dashboard', shortLabel: 'Home', icon: Home },
        { id: 'attendance', label: "Child's Attendance", shortLabel: 'Attendance', icon: ClipboardList },
        { id: 'marks', label: "Child's Marks", shortLabel: 'Marks', icon: FileText },
        { id: 'fees', label: 'Fee Status', shortLabel: 'Fees', icon: DollarSign },
        { id: 'messages', label: 'Messages', shortLabel: 'Messages', icon: MessageSquare },
        { id: 'reports', label: 'Reports', shortLabel: 'Reports', icon: FileText },
      ];
    default:
      return [];
  }
};

export const getBottomNavigationItems = (role?: User['role'] | null): NavigationItem[] =>
  getNavigationItems(role).slice(0, 5);
