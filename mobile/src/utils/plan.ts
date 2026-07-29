import { CoachingClass, ManagedPlan, PlanDefinition, PlanSettings } from '../types';

export type PlanFeature = 'ai' | 'messaging' | 'advanced_analytics' | 'branches';

export const DEFAULT_PLAN_SETTINGS: PlanSettings = {
  free: {
    name: 'Free',
    price: 0,
    features: {
      studentsLimit: 45,
      teachersLimit: 5,
      batchesLimit: 3,
      branchesLimit: 1,
      branchesEnabled: false,
      messaging: false,
      aiReports: false,
      analytics: false,
    },
  },
  standard: {
    name: 'Standard',
    price: 399,
    features: {
      studentsLimit: 240,
      teachersLimit: 25,
      batchesLimit: 9,
      branchesLimit: 3,
      branchesEnabled: true,
      messaging: true,
      aiReports: true,
      analytics: false,
    },
  },
  pro: {
    name: 'Pro',
    price: 999,
    features: {
      studentsLimit: 999999,
      teachersLimit: 999999,
      batchesLimit: 999999,
      branchesLimit: 999999,
      branchesEnabled: true,
      messaging: true,
      aiReports: true,
      analytics: true,
    },
  },
};

let runtimePlanSettings: PlanSettings = DEFAULT_PLAN_SETTINGS;

export const setPlanSettingsCache = (settings: PlanSettings) => {
  runtimePlanSettings = settings;
};

export const getPlanDefinition = (plan: ManagedPlan, settings: PlanSettings = runtimePlanSettings): PlanDefinition =>
  settings[plan] ?? DEFAULT_PLAN_SETTINGS[plan];

export const getPlanLimits = (plan: ManagedPlan, settings: PlanSettings = runtimePlanSettings) => {
  const features = getPlanDefinition(plan, settings).features;
  return {
    students: features.studentsLimit,
    teachers: features.teachersLimit,
    batches: features.batchesLimit,
    branches: features.branchesLimit,
  };
};

export const canAccessFeature = (feature: PlanFeature, plan: CoachingClass['plan'], settings: PlanSettings = runtimePlanSettings) => {
  const planDefinition = getPlanDefinition(plan, settings);
  if (feature === 'ai') return planDefinition.features.aiReports;
  if (feature === 'messaging') return planDefinition.features.messaging;
  if (feature === 'advanced_analytics') return planDefinition.features.analytics;
  if (feature === 'branches') return planDefinition.features.branchesEnabled;
  return false;
};

export const formatPlanName = (plan: CoachingClass['plan']) => {
  if (plan === 'pro') return 'Pro';
  if (plan === 'standard') return 'Standard';
  return 'Free';
};
