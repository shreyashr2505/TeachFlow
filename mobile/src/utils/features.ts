import { ManagedPlan, User } from '../types';
import { canAccessFeature, PlanFeature } from './plan';

export type FeatureId =
  | 'dashboard'
  | 'students'
  | 'teachers'
  | 'batches'
  | 'lectures'
  | 'attendance'
  | 'marks'
  | 'fees'
  | 'approvals'
  | 'messages'
  | 'reports'
  | 'analytics'
  | 'ai'
  | 'branches'
  | 'settings'
  | 'classes'
  | 'payments'
  | 'pricing'
  | 'growth'
  | 'users';

export type FeatureDescriptor = {
  id: FeatureId;
  label: string;
  shortLabel: string;
  access?: PlanFeature;
};

const roleFeatures: Record<User['role'], FeatureDescriptor[]> = {
  super_admin: [
    { id: 'dashboard', label: 'Overview', shortLabel: 'Home' },
    { id: 'classes', label: 'Classes', shortLabel: 'Classes' },
    { id: 'payments', label: 'Payments', shortLabel: 'Payments' },
    { id: 'pricing', label: 'Pricing', shortLabel: 'Pricing' },
    { id: 'growth', label: 'Growth', shortLabel: 'Growth' },
    { id: 'users', label: 'Users', shortLabel: 'Users' },
  ],
  admin: [
    { id: 'dashboard', label: 'Dashboard', shortLabel: 'Home' },
    { id: 'students', label: 'Students', shortLabel: 'Students' },
    { id: 'teachers', label: 'Teachers', shortLabel: 'Teachers' },
    { id: 'batches', label: 'Batches', shortLabel: 'Batches' },
    { id: 'lectures', label: 'Lectures', shortLabel: 'Lectures' },
    { id: 'attendance', label: 'Attendance', shortLabel: 'Attend' },
    { id: 'marks', label: 'Marks', shortLabel: 'Marks' },
    { id: 'fees', label: 'Fees', shortLabel: 'Fees' },
    { id: 'approvals', label: 'Approvals', shortLabel: 'Approve' },
    { id: 'messages', label: 'Messages', shortLabel: 'Chat', access: 'messaging' },
    { id: 'reports', label: 'Reports', shortLabel: 'Reports', access: 'ai' },
    { id: 'analytics', label: 'Analytics', shortLabel: 'Analytics', access: 'advanced_analytics' },
    { id: 'ai', label: 'AI', shortLabel: 'AI', access: 'ai' },
    { id: 'branches', label: 'Branches', shortLabel: 'Branches', access: 'branches' },
    { id: 'settings', label: 'Settings', shortLabel: 'Settings' },
  ],
  teacher: [
    { id: 'dashboard', label: 'Dashboard', shortLabel: 'Home' },
    { id: 'lectures', label: 'Schedule', shortLabel: 'Schedule' },
    { id: 'attendance', label: 'Attendance', shortLabel: 'Attend' },
    { id: 'marks', label: 'Marks', shortLabel: 'Marks' },
    { id: 'students', label: 'Students', shortLabel: 'Students' },
    { id: 'messages', label: 'Messages', shortLabel: 'Chat', access: 'messaging' },
  ],
  student: [
    { id: 'dashboard', label: 'Dashboard', shortLabel: 'Home' },
    { id: 'lectures', label: 'Schedule', shortLabel: 'Schedule' },
    { id: 'attendance', label: 'Attendance', shortLabel: 'Attend' },
    { id: 'marks', label: 'Marks', shortLabel: 'Marks' },
    { id: 'fees', label: 'Fees', shortLabel: 'Fees' },
    { id: 'messages', label: 'Messages', shortLabel: 'Chat', access: 'messaging' },
    { id: 'reports', label: 'Reports', shortLabel: 'Reports', access: 'ai' },
  ],
  parent: [
    { id: 'dashboard', label: 'Dashboard', shortLabel: 'Home' },
    { id: 'attendance', label: 'Attendance', shortLabel: 'Attend' },
    { id: 'marks', label: 'Marks', shortLabel: 'Marks' },
    { id: 'fees', label: 'Fees', shortLabel: 'Fees' },
    { id: 'messages', label: 'Messages', shortLabel: 'Chat', access: 'messaging' },
    { id: 'reports', label: 'Reports', shortLabel: 'Reports', access: 'ai' },
  ],
};

export const getFeatureTabs = (role?: User['role'] | null, plan?: ManagedPlan, canAccess?: (feature: PlanFeature) => boolean) => {
  const items = role ? roleFeatures[role] ?? [] : [];
  return items.filter((item) => !item.access || (canAccess ? canAccess(item.access) : true));
};

export const getTabById = (role: User['role'], id: FeatureId) => roleFeatures[role].find((item) => item.id === id) ?? roleFeatures[role][0];

export const usePlanGate = (plan: ManagedPlan, access: PlanFeature) => canAccessFeature(access, plan);
