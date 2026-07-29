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

export const isPlanExpired = (planExpiry?: string) => {
  if (!planExpiry) return false;
  const expiryTime = new Date(planExpiry).getTime();
  return Number.isFinite(expiryTime) && expiryTime < Date.now();
};

export const getEffectivePlan = (
  classOrPlan: Pick<CoachingClass, 'plan' | 'planExpiry'> | ManagedPlan,
  planExpiry?: string
): ManagedPlan => {
  const plan = typeof classOrPlan === 'string' ? classOrPlan : classOrPlan.plan;
  const expiry = typeof classOrPlan === 'string' ? planExpiry : classOrPlan.planExpiry;

  if (plan !== 'free' && isPlanExpired(expiry)) {
    return 'free';
  }

  return plan;
};

export const setPlanSettingsCache = (settings: PlanSettings) => {
  runtimePlanSettings = settings;
};

export const getPlanSettingsCache = () => runtimePlanSettings;

export const getPlanDefinition = (plan: ManagedPlan, settings: PlanSettings = runtimePlanSettings): PlanDefinition =>
  settings[plan] ?? DEFAULT_PLAN_SETTINGS[plan];

export const PLAN_LIMITS: Record<ManagedPlan, { students: number; teachers: number; batches: number; branches: number }> = {
  free: {
    students: DEFAULT_PLAN_SETTINGS.free.features.studentsLimit,
    teachers: DEFAULT_PLAN_SETTINGS.free.features.teachersLimit,
    batches: DEFAULT_PLAN_SETTINGS.free.features.batchesLimit,
    branches: DEFAULT_PLAN_SETTINGS.free.features.branchesLimit,
  },
  standard: {
    students: DEFAULT_PLAN_SETTINGS.standard.features.studentsLimit,
    teachers: DEFAULT_PLAN_SETTINGS.standard.features.teachersLimit,
    batches: DEFAULT_PLAN_SETTINGS.standard.features.batchesLimit,
    branches: DEFAULT_PLAN_SETTINGS.standard.features.branchesLimit,
  },
  pro: {
    students: DEFAULT_PLAN_SETTINGS.pro.features.studentsLimit,
    teachers: DEFAULT_PLAN_SETTINGS.pro.features.teachersLimit,
    batches: DEFAULT_PLAN_SETTINGS.pro.features.batchesLimit,
    branches: DEFAULT_PLAN_SETTINGS.pro.features.branchesLimit,
  },
};

export const canAccessFeature = (feature: PlanFeature, plan: CoachingClass['plan'], settings: PlanSettings = runtimePlanSettings) => {
  const planDefinition = getPlanDefinition(getEffectivePlan(plan), settings);

  if (feature === 'ai') return planDefinition.features.aiReports;
  if (feature === 'messaging') return planDefinition.features.messaging;
  if (feature === 'advanced_analytics') return planDefinition.features.analytics;
  if (feature === 'branches') return planDefinition.features.branchesEnabled;

  return false;
};

export const getPlanLimits = (plan: CoachingClass['plan'], settings: PlanSettings = runtimePlanSettings) => {
  const features = getPlanDefinition(getEffectivePlan(plan), settings).features;
  return {
    students: features.studentsLimit,
    teachers: features.teachersLimit,
    batches: features.batchesLimit,
    branches: features.branchesLimit,
  };
};

export const formatPlanName = (plan: CoachingClass['plan'], settings: PlanSettings = runtimePlanSettings) =>
  getPlanDefinition(plan, settings).name || DEFAULT_PLAN_SETTINGS[plan].name;
