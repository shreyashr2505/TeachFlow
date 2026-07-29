import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowUpDown, BarChart3, Building2, CreditCard, Loader2, Search, Trash2, TrendingUp, Users, Wallet } from 'lucide-react';
import { firebaseService } from '../../services/firebaseService';
import { paymentService } from '../../services/paymentService';
import FeedbackMessage from '../Common/FeedbackMessage';
import StyledSelect, { StyledSelectOption } from '../Common/StyledSelect';
import { AIUsageLog, BillingSettings, CoachingClass, GrowthEvent, ManagedPlan, PaymentRecord, PlanFeatures, PlanSettings, User } from '../../types';
import { DEFAULT_PLAN_SETTINGS, formatPlanName } from '../../utils/plan';

type View = 'overview' | 'classes' | 'payments' | 'pricing' | 'ai_control' | 'growth' | 'users';

type SettlementPlan = 'standard' | 'plus' | 'pro';

type SettlementResult = {
  totalCollected: number;
  totalFeeOnly: number;
  totalGst: number;
  totalTransactionFees: number;
  monthlyFee: number;
  freeRemaining: number;
  feeApplied: number;
  monthlyCost: number;
  netSettlement: number;
  profitAfterPlan: number;
};

type SettlementModalState = {
  open: boolean;
  title: string;
  message: string;
  tone: 'success' | 'info';
};

const panel = 'rounded-[28px] border border-slate-700/70 bg-slate-900/95 p-6 shadow-[0_18px_60px_rgba(15,23,42,0.28)]';
const monthKey = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
const formatInr = (amount: number) => `₹${Math.round(amount).toLocaleString('en-IN')}`;
const formatSettlementPlanName = (plan: SettlementPlan) => plan.toUpperCase();
const managedPlans: ManagedPlan[] = ['free', 'standard', 'pro'];
const featureLabels: Record<keyof PlanFeatures, string> = {
  studentsLimit: 'Students Limit',
  teachersLimit: 'Teachers Limit',
  batchesLimit: 'Batches Limit',
  branchesLimit: 'Branches Limit',
  branchesEnabled: 'Branches Enabled',
  messaging: 'Messaging',
  aiReports: 'AI Reports',
  analytics: 'Analytics',
};
const formatLimitValue = (value: number) => (value >= 999999 ? 'Unlimited' : value.toLocaleString('en-IN'));
const formatFailureReason = (value?: string) => {
  if (!value) return '';
  if (value === 'payment_cancelled') return 'User Cancelled';
  if (value === 'signature_failed') return 'Signature Failed';
  if (value === 'network_error') return 'Network Error';
  if (value === 'payment_expired') return 'Expired';
  return value.replace(/_/g, ' ');
};
const settlementPlanConfig: Record<SettlementPlan, { monthlyFee: number; freeLimit: number; feePercent: number }> = {
  standard: { monthlyFee: 0, freeLimit: 5000, feePercent: 0.02 },
  plus: { monthlyFee: 499, freeLimit: 30000, feePercent: 0.019 },
  pro: { monthlyFee: 2199, freeLimit: 150000, feePercent: 0.018 },
};

const buildManualTransactions = (transactionAmount: number, transactionCount: number) =>
  Array.from({ length: Math.max(0, Math.floor(transactionCount)) }, () => Math.max(0, transactionAmount));

const simulateSettlementPlan = (plan: SettlementPlan, transactions: number[]): SettlementResult => {
  const config = settlementPlanConfig[plan];
  let usedSoFar = 0;
  let totalCollected = 0;
  let totalFeeOnly = 0;
  let totalGst = 0;
  let totalTransactionFees = 0;
  let feeApplied = 0;

  for (const transactionAmount of transactions) {
    const freeRemaining = Math.max(0, config.freeLimit - usedSoFar);
    const safeTransactionAmount = Math.max(0, transactionAmount);
    const feeApplicable = Math.max(0, safeTransactionAmount - freeRemaining);
    const fee = feeApplicable * config.feePercent;
    const gst = fee * 0.18;
    const totalFee = fee + gst;

    totalCollected += safeTransactionAmount;
    totalFeeOnly += fee;
    totalGst += gst;
    totalTransactionFees += totalFee;
    feeApplied += feeApplicable;
    usedSoFar += safeTransactionAmount;
  }

  const monthlyCost = totalTransactionFees + config.monthlyFee;
  const netSettlement = totalCollected - totalTransactionFees;

  return {
    totalCollected,
    totalFeeOnly,
    totalGst,
    totalTransactionFees,
    monthlyFee: config.monthlyFee,
    freeRemaining: Math.max(0, config.freeLimit - usedSoFar),
    feeApplied,
    monthlyCost,
    netSettlement,
    profitAfterPlan: netSettlement - config.monthlyFee,
  };
};

const SuperAdminDashboard: React.FC<{ view?: View }> = ({ view = 'overview' }) => {
  const [classes, setClasses] = useState<CoachingClass[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [aiUsageLogs, setAIUsageLogs] = useState<AIUsageLog[]>([]);
  const [growthEvents, setGrowthEvents] = useState<GrowthEvent[]>([]);
  const [planSettings, setPlanSettings] = useState<PlanSettings>(DEFAULT_PLAN_SETTINGS);
  const [planDraft, setPlanDraft] = useState<PlanSettings>(DEFAULT_PLAN_SETTINGS);
  const [billingSettings, setBillingSettings] = useState<BillingSettings>({
    standardSubscriptionPlanId: '',
    proSubscriptionPlanId: '',
    companyName: 'TeachFlow',
    companyAddress: 'TeachFlow Billing, India',
    gstNumber: '',
  });
  const [billingDraft, setBillingDraft] = useState<BillingSettings>({
    standardSubscriptionPlanId: '',
    proSubscriptionPlanId: '',
    companyName: 'TeachFlow',
    companyAddress: 'TeachFlow Billing, India',
    gstNumber: '',
  });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [busyKey, setBusyKey] = useState('');
  const [paymentPlanFilter, setPaymentPlanFilter] = useState<'all' | ManagedPlan>('all');
  const [paymentStatusFilter, setPaymentStatusFilter] = useState<'all' | PaymentRecord['status']>('all');
  const [paymentDateFrom, setPaymentDateFrom] = useState('');
  const [paymentDateTo, setPaymentDateTo] = useState('');
  const [userSearch, setUserSearch] = useState('');
  const [userSort, setUserSort] = useState<'newest' | 'oldest' | 'name_asc' | 'name_desc' | 'role' | 'status'>('newest');
  const [transactionAmount, setTransactionAmount] = useState(1000);
  const [transactionCount, setTransactionCount] = useState(25);
  const [isFetchingSettlementData, setIsFetchingSettlementData] = useState(false);
  const [settlementSummary, setSettlementSummary] = useState<{
    totalVolume: number;
    transactionCount: number;
    results: Record<SettlementPlan, SettlementResult>;
    bestPlan: SettlementPlan;
    savings: number;
  } | null>(null);
  const [settlementModal, setSettlementModal] = useState<SettlementModalState>({
    open: false,
    title: '',
    message: '',
    tone: 'info',
  });
  const dirtyPlanDraftRef = useRef<Record<ManagedPlan, boolean>>({
    free: false,
    standard: false,
    pro: false,
  });
  const settlementModalCardRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const unsubs = [
      firebaseService.subscribeToAllClasses(setClasses, (err) => setError(err.message)),
      firebaseService.subscribeToAllUsers(setUsers, (err) => setError(err.message)),
      firebaseService.subscribeToPayments(setPayments, (err) => setError(err.message)),
      firebaseService.subscribeToAllAIUsage(setAIUsageLogs, (err) => setError(err.message)),
      firebaseService.subscribeToGrowthEvents(setGrowthEvents, (err) => setError(err.message)),
      firebaseService.subscribeToPlanSettings((settings) => {
        setPlanSettings(settings);
        setPlanDraft((prev) => ({
          ...prev,
          free: dirtyPlanDraftRef.current.free ? prev.free : settings.free,
          standard: dirtyPlanDraftRef.current.standard ? prev.standard : settings.standard,
          pro: dirtyPlanDraftRef.current.pro ? prev.pro : settings.pro,
          updatedAt: settings.updatedAt,
        }));
      }, (err) => setError(err.message)),
    ];

    void firebaseService
      .getBillingSettings()
      .then((settings) => {
        setBillingSettings(settings);
        setBillingDraft(settings);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load billing settings.'));

    return () => unsubs.forEach((unsubscribe) => unsubscribe());
  }, []);

  const admins = useMemo(() => users.filter((user) => user.role === 'admin'), [users]);
  const paidPayments = useMemo(() => payments.filter((item) => item.status === 'paid'), [payments]);
  const failedPayments = useMemo(() => payments.filter((item) => ['failed', 'signature_mismatch', 'expired', 'cancelled'].includes(item.status)), [payments]);
  const filteredPayments = useMemo(() => {
    const fromTime = paymentDateFrom ? new Date(paymentDateFrom).getTime() : null;
    const toTime = paymentDateTo ? new Date(`${paymentDateTo}T23:59:59.999`).getTime() : null;

    return payments.filter((item) => {
      const createdTime = new Date(item.createdAt).getTime();
      if (paymentPlanFilter !== 'all' && item.plan !== paymentPlanFilter) {
        return false;
      }

      if (paymentStatusFilter !== 'all' && item.status !== paymentStatusFilter) {
        return false;
      }

      if (fromTime !== null && Number.isFinite(fromTime) && createdTime < fromTime) {
        return false;
      }

      if (toTime !== null && Number.isFinite(toTime) && createdTime > toTime) {
        return false;
      }

      return true;
    });
  }, [paymentDateFrom, paymentDateTo, paymentPlanFilter, paymentStatusFilter, payments]);
  const sortedPaidPayments = useMemo(
    () => [...paidPayments].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()),
    [paidPayments]
  );
  const totalRevenue = useMemo(() => paidPayments.reduce((sum, item) => sum + item.amount, 0), [paidPayments]);
  const monthlyRevenue = useMemo(() => paidPayments.filter((item) => item.createdAt.slice(0, 7) === monthKey).reduce((sum, item) => sum + item.amount, 0), [paidPayments]);
  const mrr = useMemo(
    () =>
      classes
        .filter((item) => item.plan !== 'free' && item.isActive)
        .reduce((sum, item) => sum + Math.round((planSettings[item.plan]?.price || 0) * 100), 0),
    [classes, planSettings]
  );
  const failedPaymentRate = useMemo(() => (payments.length > 0 ? Math.round((failedPayments.length / payments.length) * 100) : 0), [failedPayments.length, payments.length]);
  const activePaidClasses = useMemo(() => classes.filter((item) => item.plan !== 'free' && item.isActive).length, [classes]);
  const conversionRate = useMemo(() => (classes.length > 0 ? Math.round((activePaidClasses / classes.length) * 100) : 0), [activePaidClasses, classes.length]);
  const funnel = useMemo(() => ({
    ctas: growthEvents.filter((e) => e.type === 'landing_cta' && e.createdAt.slice(0, 7) === monthKey).length,
    signups: growthEvents.filter((e) => e.type === 'signup' && e.createdAt.slice(0, 7) === monthKey).length,
    upgrades: growthEvents.filter((e) => e.type === 'upgrade' && e.createdAt.slice(0, 7) === monthKey).length,
  }), [growthEvents]);
  const usageByClass = useMemo(() => {
    const map = new Map<string, { tokens: number; requests: number; recent: number }>();
    const now = Date.now();
    aiUsageLogs.forEach((entry) => {
      const current = map.get(entry.classId) ?? { tokens: 0, requests: 0, recent: 0 };
      current.tokens += entry.totalTokens;
      current.requests += 1;
      const createdAt = new Date(entry.createdAt).getTime();
      if (Number.isFinite(createdAt) && now - createdAt <= 60 * 60 * 1000) current.recent += 1;
      map.set(entry.classId, current);
    });
    return map;
  }, [aiUsageLogs]);
  const visibleUsers = useMemo(() => {
    const query = userSearch.trim().toLowerCase();
    const filtered = users.filter((item) => {
      const linkedClass = classes.find((c) => c.id === item.activeClassId || c.id === item.classIds?.[0]);
      const haystack = [
        item.name,
        item.email,
        item.role,
        linkedClass?.name ?? '',
        item.approved ? 'enabled' : 'disabled',
      ].join(' ').toLowerCase();
      return haystack.includes(query);
    });

    return [...filtered].sort((a, b) => {
      const aCreated = new Date(a.createdAt).getTime();
      const bCreated = new Date(b.createdAt).getTime();
      switch (userSort) {
        case 'oldest':
          return aCreated - bCreated;
        case 'name_asc':
          return a.name.localeCompare(b.name);
        case 'name_desc':
          return b.name.localeCompare(a.name);
        case 'role':
          return a.role.localeCompare(b.role) || a.name.localeCompare(b.name);
        case 'status':
          return Number(b.approved) - Number(a.approved) || a.name.localeCompare(b.name);
        case 'newest':
        default:
          return bCreated - aCreated;
      }
    });
  }, [classes, userSearch, userSort, users]);
  const growthTrend = useMemo(() => {
    const now = new Date();
    const labels = Array.from({ length: 6 }, (_, index) => {
      const date = new Date(now.getFullYear(), now.getMonth() - (5 - index), 1);
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      return {
        key,
        label: date.toLocaleDateString('en-IN', { month: 'short' }),
        ctas: 0,
        signups: 0,
        upgrades: 0,
      };
    });

    growthEvents.forEach((event) => {
      const bucket = labels.find((item) => item.key === event.createdAt.slice(0, 7));
      if (!bucket) return;
      if (event.type === 'landing_cta') bucket.ctas += 1;
      if (event.type === 'signup') bucket.signups += 1;
      if (event.type === 'upgrade') bucket.upgrades += 1;
    });

    return labels.map((item) => ({
      ...item,
      total: item.ctas + item.signups + item.upgrades,
    }));
  }, [growthEvents]);
  const growthPeak = useMemo(() => Math.max(...growthTrend.map((item) => item.total), 1), [growthTrend]);
  const planOptions: StyledSelectOption[] = [
    { value: 'free', label: formatPlanName('free', planSettings) },
    { value: 'standard', label: formatPlanName('standard', planSettings) },
    { value: 'pro', label: formatPlanName('pro', planSettings) },
  ];
  const userSortOptions: StyledSelectOption[] = [
    { value: 'newest', label: 'Newest first' },
    { value: 'oldest', label: 'Oldest first' },
    { value: 'name_asc', label: 'Name A-Z' },
    { value: 'name_desc', label: 'Name Z-A' },
    { value: 'role', label: 'Sort by role' },
    { value: 'status', label: 'Sort by status' },
  ];
  const userRoleOptions: StyledSelectOption[] = [
    { value: 'admin', label: 'Admin' },
    { value: 'teacher', label: 'Teacher' },
    { value: 'student', label: 'Student' },
    { value: 'parent', label: 'Parent' },
    { value: 'super_admin', label: 'Super Admin' },
  ];
  const manualTransactions = useMemo(() => buildManualTransactions(transactionAmount, transactionCount), [transactionAmount, transactionCount]);
  const manualResults = useMemo(
    () => ({
      standard: simulateSettlementPlan('standard', manualTransactions),
      plus: simulateSettlementPlan('plus', manualTransactions),
      pro: simulateSettlementPlan('pro', manualTransactions),
    }),
    [manualTransactions]
  );
  const planControlCards = useMemo(
    () =>
      managedPlans.map((plan) => ({
        key: plan,
        name: planDraft[plan].name,
        price: planDraft[plan].price,
        features: planDraft[plan].features,
      })),
    [planDraft]
  );
  const planComparisonRows = useMemo(
    () => [
      {
        label: 'Price',
        values: managedPlans.map((plan) => `₹${planSettings[plan].price.toLocaleString('en-IN')}`),
      },
      {
        label: 'Students',
        values: managedPlans.map((plan) => formatLimitValue(planSettings[plan].features.studentsLimit)),
      },
      {
        label: 'Teachers',
        values: managedPlans.map((plan) => formatLimitValue(planSettings[plan].features.teachersLimit)),
      },
      {
        label: 'Batches',
        values: managedPlans.map((plan) => formatLimitValue(planSettings[plan].features.batchesLimit)),
      },
      {
        label: 'Branches',
        values: managedPlans.map((plan) =>
          planSettings[plan].features.branchesEnabled
            ? `Up to ${formatLimitValue(planSettings[plan].features.branchesLimit)}`
            : 'Not enabled'
        ),
      },
      {
        label: 'Messaging',
        values: managedPlans.map((plan) => (planSettings[plan].features.messaging ? 'Enabled' : 'Locked')),
      },
      {
        label: 'AI Reports',
        values: managedPlans.map((plan) => (planSettings[plan].features.aiReports ? 'Enabled' : 'Locked')),
      },
      {
        label: 'Analytics',
        values: managedPlans.map((plan) => (planSettings[plan].features.analytics ? 'Enabled' : 'Locked')),
      },
    ],
    [planSettings]
  );

  const run = async (key: string, action: () => Promise<void>, ok: string, fail: string) => {
    try {
      setBusyKey(key);
      setError('');
      setSuccess('');
      await action();
      setSuccess(ok);
    } catch (err) {
      setError(err instanceof Error ? err.message : fail);
    } finally {
      setBusyKey('');
    }
  };

  const updatePlanPrice = (plan: ManagedPlan, value: number) => {
    dirtyPlanDraftRef.current[plan] = true;
    setPlanDraft((prev) => ({
      ...prev,
      [plan]: {
        ...prev[plan],
        price: Math.max(0, value || 0),
      },
    }));
  };

  const updatePlanName = (plan: ManagedPlan, value: string) => {
    const nextName = value.trim();
    if (!nextName) return;
    dirtyPlanDraftRef.current[plan] = true;
    setPlanDraft((prev) => ({
      ...prev,
      [plan]: {
        ...prev[plan],
        name: nextName,
      },
    }));
  };

  const updatePlanFeature = <K extends keyof PlanFeatures>(plan: ManagedPlan, feature: K, value: PlanFeatures[K]) => {
    dirtyPlanDraftRef.current[plan] = true;
    setPlanDraft((prev) => ({
      ...prev,
      [plan]: {
        ...prev[plan],
        features: {
          ...prev[plan].features,
          [feature]:
            typeof value === 'number'
              ? Math.max(0, Number(value) || 0)
              : value,
        },
      },
    }));
  };

  const savePlanSettings = async (plan: ManagedPlan) => {
    await run(
      `pricing:${plan}`,
      async () => {
        await firebaseService.updatePlanSettings({
          ...planSettings,
          [plan]: planDraft[plan],
        });
        dirtyPlanDraftRef.current[plan] = false;
        setPlanSettings((prev) => ({
          ...prev,
          [plan]: planDraft[plan],
        }));
      },
      `${formatPlanName(plan)} plan updated successfully.`,
      'Failed to update plan settings.'
    );
  };

  const saveBillingSettings = async () => {
    await run(
      'billing-settings',
      async () => {
        const response = await firebaseService.updateBillingSettings(billingDraft);
        setBillingSettings(response.billingSettings);
        setBillingDraft(response.billingSettings);
      },
      'Billing settings updated successfully.',
      'Failed to update billing settings.'
    );
  };

  const openSettlementModal = (title: string, message: string, tone: SettlementModalState['tone']) => {
    setSettlementModal({
      open: true,
      title,
      message,
      tone,
    });
  };

  const handleUseSettlementData = () => {
    try {
      setIsFetchingSettlementData(true);
      setError('');
      setSuccess('');

      if (sortedPaidPayments.length === 0) {
        setSettlementSummary(null);
        setSuccess('No payment data found');
        openSettlementModal('No Payment Data Found', 'There are no paid payment records available to auto-fill this calculator yet.', 'info');
        return;
      }

      const transactions = sortedPaidPayments.map((item) => Math.max(0, item.amount / 100));
      const results: Record<SettlementPlan, SettlementResult> = {
        standard: simulateSettlementPlan('standard', transactions),
        plus: simulateSettlementPlan('plus', transactions),
        pro: simulateSettlementPlan('pro', transactions),
      };
      const bestPlan = (Object.entries(results) as [SettlementPlan, SettlementResult][]).reduce<{ plan: SettlementPlan; result: SettlementResult }>(
        (best, current) => (current[1].profitAfterPlan > best.result.profitAfterPlan ? { plan: current[0], result: current[1] } : best),
        { plan: 'standard', result: results.standard }
      ).plan;

      setTransactionAmount(Math.round(transactions[0] ?? 0));
      setTransactionCount(transactions.length);
      setSettlementSummary({
        totalVolume: transactions.reduce((sum, amount) => sum + amount, 0),
        transactionCount: transactions.length,
        results,
        bestPlan,
        savings: Math.max(0, results[bestPlan].profitAfterPlan - results.standard.profitAfterPlan),
      });

      if (results.standard.totalTransactionFees === 0) {
        setSuccess('No fees applied yet');
        openSettlementModal('No Fees Applied Yet', 'Your available payment history is still within the free limit, so no Razorpay transaction fees are being charged yet.', 'success');
        return;
      }

      setSuccess('Payment data loaded.');
      openSettlementModal('Payment Data Loaded', `Loaded ${sortedPaidPayments.length} paid transactions into Smart Mode for comparison.`, 'success');
    } finally {
      setIsFetchingSettlementData(false);
    }
  };

  const handleDeleteUser = (user: User) => {
    if (user.role === 'super_admin') {
      setError('Super admin accounts are protected and cannot be deleted.');
      return;
    }

    const confirmed = window.confirm(`Delete ${user.name} (${user.email}) from the platform users list?`);
    if (!confirmed) return;

    void run(`delete:${user.id}`, () => firebaseService.deleteUser(user.id), 'User deleted successfully.', 'Failed to delete user.');
  };

  const handleDeleteClass = (coachingClass: CoachingClass, owner?: User) => {
    const ownerLabel = owner ? `${owner.name} (${owner.email})` : coachingClass.adminId;
    const confirmed = window.confirm(
      `Delete ${coachingClass.name} and all of its related records?\n\nOwner: ${ownerLabel}\nURL: /${coachingClass.subdomain}\n\nThis will remove students, teachers, batches, lectures, fees, messages, payments, reports, and other linked class data.`
    );
    if (!confirmed) return;

    void run(
      `delete-class:${coachingClass.id}`,
      () => firebaseService.deleteClass(coachingClass.id),
      'Class deleted successfully.',
      'Failed to delete class.'
    );
  };

  const cards = (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-2 2xl:grid-cols-4">
      {[
        ['Total Classes', classes.length, Building2],
        ['Total Users', users.length, Users],
        ['Active Paid Classes', activePaidClasses, CreditCard],
        ['Conversion Rate', `${conversionRate}%`, BarChart3],
        ['Total Revenue', `INR ${(totalRevenue / 100).toLocaleString('en-IN')}`, CreditCard],
        ['Monthly Revenue', `INR ${(monthlyRevenue / 100).toLocaleString('en-IN')}`, CreditCard],
        ['MRR', `INR ${(mrr / 100).toLocaleString('en-IN')}`, Wallet],
        ['Failed Payments', `${failedPaymentRate}%`, TrendingUp],
        ['Monthly Signups', funnel.signups, Users],
        ['Monthly Upgrades', funnel.upgrades, BarChart3],
      ].map(([label, value, Icon]) => {
        const I = Icon as React.ComponentType<{ className?: string }>;
        return (
          <div key={String(label)} className={panel}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-400">{label}</div>
                <div className="mt-4 text-4xl font-bold text-white">{value}</div>
              </div>
              <div className="rounded-2xl bg-slate-800 p-4"><I className="h-6 w-6 text-cyan-300" /></div>
            </div>
          </div>
        );
      })}
    </div>
  );

  const classesPage = (
    <div className="grid gap-5 2xl:grid-cols-2">
      {classes.map((item) => {
        const admin = admins.find((user) => user.id === item.adminId);
        const usage = usageByClass.get(item.id) ?? { tokens: 0, requests: 0, recent: 0 };
        return (
          <div key={item.id} className={panel}>
            <div className="grid gap-6">
              <div className="min-w-0">
                <div className="flex flex-wrap items-start gap-3">
                  <h2 className="text-2xl font-bold leading-tight text-white break-words">{item.name}</h2>
                  <span className="rounded-full bg-slate-200 px-3 py-1 text-xs font-semibold text-slate-700">{formatPlanName(item.plan)}</span>
                  <span className={`rounded-full px-3 py-1 text-xs font-semibold ${item.isActive ? 'bg-emerald-500/15 text-emerald-200' : 'bg-red-500/15 text-red-200'}`}>{item.isActive ? 'Active' : 'Suspended'}</span>
                </div>
                <div className="mt-2 break-all text-slate-400">/{item.subdomain}</div>
                <div className="mt-5 grid gap-3 sm:grid-cols-2">
                  {[
                    ['Class Owner', admin?.name ?? 'Unassigned'],
                    ['Admin Email', admin?.email ?? 'Unassigned'],
                    ['Students', String(item.studentCount ?? 0)],
                    ['Expiry', item.planExpiry ? new Date(item.planExpiry).toLocaleDateString('en-IN') : 'Not set'],
                    ['Auto Renew', item.autoRenew ? 'Enabled' : 'Off'],
                    ['Token Usage', `${usage.tokens.toLocaleString('en-IN')} tokens`],
                  ].map(([label, value]) => (
                    <div key={label} className="rounded-2xl border border-slate-700 bg-slate-950/70 p-4">
                      <div className="text-xs uppercase tracking-[0.18em] text-slate-500">{label}</div>
                      <div className="mt-2 break-words text-base font-semibold text-slate-100">{value}</div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="rounded-[24px] border border-slate-700 bg-slate-900/80 p-5">
                <div className="text-xs uppercase tracking-[0.18em] text-slate-500">Plan And Support Actions</div>
                <div className="mt-4 space-y-3">
                  <StyledSelect
                    value={item.plan}
                    options={planOptions}
                    disabled={busyKey === `plan:${item.id}`}
                    variant="dark"
                    size="md"
                    onChange={(nextValue) => void run(`plan:${item.id}`, () => firebaseService.updateClassPlan(item.id, nextValue as CoachingClass['plan']), 'Class plan updated.', 'Failed to update class plan.')}
                  />
                  <div className="flex flex-wrap gap-3">
                    <button onClick={() => void run(`status:${item.id}`, () => firebaseService.setClassActiveState(item.id, !item.isActive), 'Class status updated.', 'Failed to update class status.')} disabled={busyKey === `status:${item.id}`} className={`rounded-2xl px-4 py-3 text-sm font-semibold ${item.isActive ? 'bg-red-500/15 text-red-200' : 'bg-emerald-500/15 text-emerald-200'}`}>{item.isActive ? 'Suspend Class' : 'Activate Class'}</button>
                    <button onClick={() => void run(`extend7:${item.id}`, () => firebaseService.extendClassPlan(item.id, 7), 'Plan extended by 7 days.', 'Failed to extend plan.')} className="rounded-2xl bg-blue-500/15 px-4 py-3 text-sm font-semibold text-blue-200">+7 Days</button>
                    <button onClick={() => void run(`extend30:${item.id}`, () => firebaseService.extendClassPlan(item.id, 30), 'Plan extended by 30 days.', 'Failed to extend plan.')} className="rounded-2xl bg-blue-500/15 px-4 py-3 text-sm font-semibold text-blue-200">+30 Days</button>
                    <button onClick={() => void run(`autorenew:${item.id}`, () => firebaseService.updateClassBillingState(item.id, !item.autoRenew), item.autoRenew ? 'Auto-renew disabled.' : 'Auto-renew enabled.', 'Failed to update billing state.')} className={`rounded-2xl px-4 py-3 text-sm font-semibold ${item.autoRenew ? 'bg-amber-500/15 text-amber-200' : 'bg-emerald-500/15 text-emerald-200'}`}>{item.autoRenew ? 'Disable Auto-Renew' : 'Enable Auto-Renew'}</button>
                    <button onClick={() => handleDeleteClass(item, admin)} disabled={busyKey === `delete-class:${item.id}`} className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm font-semibold text-red-200 disabled:opacity-50">Delete Class</button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );

  const paymentsPage = (
    <div className="grid gap-4">
      <div className={panel}>
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <div className="text-xs uppercase tracking-[0.18em] text-slate-500">Payment Controls</div>
            <div className="mt-2 text-2xl font-bold text-white">Payment Ledger</div>
            <div className="mt-2 text-sm text-slate-400">Track class upgrades, failures, retries, refunds, and invoice links in one place.</div>
          </div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <StyledSelect
              value={paymentPlanFilter}
              options={[
                { value: 'all', label: 'All Plans' },
                { value: 'standard', label: formatPlanName('standard', planSettings) },
                { value: 'pro', label: formatPlanName('pro', planSettings) },
              ]}
              variant="dark"
              onChange={(value) => setPaymentPlanFilter(value as 'all' | ManagedPlan)}
            />
            <StyledSelect
              value={paymentStatusFilter}
              options={[
                { value: 'all', label: 'All Statuses' },
                { value: 'created', label: 'Created' },
                { value: 'attempted', label: 'Attempted' },
                { value: 'paid', label: 'Paid' },
                { value: 'failed', label: 'Failed' },
                { value: 'expired', label: 'Expired' },
                { value: 'cancelled', label: 'Cancelled' },
                { value: 'signature_mismatch', label: 'Signature mismatch' },
                { value: 'refunded', label: 'Refunded' },
                { value: 'retry_requested', label: 'Retry requested' },
              ]}
              variant="dark"
              onChange={(value) => setPaymentStatusFilter(value as 'all' | PaymentRecord['status'])}
            />
            <input
              type="date"
              value={paymentDateFrom}
              onChange={(event) => setPaymentDateFrom(event.target.value)}
              className="rounded-2xl border border-slate-600 bg-slate-950 px-4 py-3 text-sm text-white"
            />
            <input
              type="date"
              value={paymentDateTo}
              onChange={(event) => setPaymentDateTo(event.target.value)}
              className="rounded-2xl border border-slate-600 bg-slate-950 px-4 py-3 text-sm text-white"
            />
          </div>
        </div>
        <div className="mt-4 text-sm text-slate-400">{filteredPayments.length} payments matched</div>
      </div>

      {filteredPayments.length === 0 ? (
        <div className={panel}>
          <div className="text-2xl font-bold text-white">No payments yet</div>
          <div className="mt-2 max-w-2xl text-sm text-slate-400">
            As soon as plan upgrades or renewals happen, payment records will appear here with retry, refund, and invoice details.
          </div>
        </div>
      ) : null}
      {filteredPayments.slice(0, 20).map((item) => {
        const cls = classes.find((c) => c.id === item.classId);
        const admin = users.find((u) => u.id === item.adminId);
        return (
          <div key={item.id} className={panel}>
            <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
              <div className="space-y-3">
                <div>
                  <div className="text-xl font-semibold text-white">{cls?.name ?? item.classId}</div>
                  <div className="mt-1 text-sm text-slate-400">{admin?.name ?? item.adminId}</div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <span className="rounded-full bg-slate-200 px-3 py-1 text-xs font-semibold text-slate-700">{formatPlanName(item.plan)}</span>
                  <span className="rounded-full bg-blue-500/15 px-3 py-1 text-xs font-semibold text-blue-200">{item.status}</span>
                  <span className="rounded-full bg-amber-500/15 px-3 py-1 text-xs font-semibold text-amber-200">{(item.amount / 100).toLocaleString('en-IN', { style: 'currency', currency: item.currency })}</span>
                </div>
                <div className="text-sm text-slate-500">{new Date(item.createdAt).toLocaleString('en-IN')}</div>
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="rounded-2xl border border-slate-700 bg-slate-950/70 p-4">
                    <div className="text-xs uppercase tracking-[0.16em] text-slate-500">Invoice</div>
                    <div className="mt-2 text-sm font-semibold text-white">{item.invoiceNumber ?? 'Invoice pending'}</div>
                    {item.invoiceUrl ? (
                      <a href={item.invoiceUrl} target="_blank" rel="noreferrer" className="mt-2 inline-block text-sm text-cyan-300 underline">
                        Open invoice PDF
                      </a>
                    ) : null}
                  </div>
                  <div className="rounded-2xl border border-slate-700 bg-slate-950/70 p-4">
                    <div className="text-xs uppercase tracking-[0.16em] text-slate-500">Payment ID</div>
                    <div className="mt-2 break-all text-sm font-semibold text-white">{item.paymentId ?? 'Pending'}</div>
                    {item.failureReason ? <div className="mt-2 text-xs text-red-200">❌ Failed ({formatFailureReason(item.failureReason)})</div> : null}
                    {item.invoiceFailureReason ? <div className="mt-2 text-xs text-amber-200">Invoice issue: {item.invoiceFailureReason}</div> : null}
                  </div>
                </div>
              </div>
              <div className="flex flex-wrap gap-3">
                <button onClick={() => void run(`refund:${item.id}`, async () => { await paymentService.managePayment(item.id, 'refund'); }, 'Refund processed.', 'Failed to update payment.')} disabled={!item.paymentId || item.status !== 'paid'} className="rounded-2xl bg-slate-800 px-4 py-3 text-sm font-semibold text-slate-100 disabled:opacity-50">Refund</button>
                <button onClick={() => void run(`failed:${item.id}`, async () => { await paymentService.managePayment(item.id, 'mark_failed'); }, 'Payment status updated.', 'Failed to update payment.')} disabled={item.status === 'paid' || item.status === 'refunded'} className="rounded-2xl bg-red-500/15 px-4 py-3 text-sm font-semibold text-red-200 disabled:opacity-50">Mark Failed</button>
                <button onClick={() => void run(`retry:${item.id}`, async () => { await paymentService.managePayment(item.id, 'retry'); }, 'Retry order created.', 'Failed to update payment.')} disabled={item.status === 'paid' || item.status === 'refunded'} className="rounded-2xl bg-blue-500/15 px-4 py-3 text-sm font-semibold text-blue-200 disabled:opacity-50">Retry</button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );

  const pricingPage = (
    <div className="space-y-6">
      <div className={`${panel} overflow-hidden bg-[radial-gradient(circle_at_top_left,_rgba(34,197,94,0.14),_transparent_28%),radial-gradient(circle_at_top_right,_rgba(59,130,246,0.18),_transparent_26%),linear-gradient(180deg,_rgba(15,23,42,0.98),_rgba(15,23,42,0.94))]`}>
        <div className="max-w-3xl">
          <div className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-300">Pricing Control</div>
          <h1 className="mt-3 text-3xl font-bold text-white">Super Admin Plan Control</h1>
          <p className="mt-3 text-base leading-7 text-slate-300">
            Update pricing, features, limits, and branch access for every plan. Changes save to <span className="font-semibold text-white">settings/plans</span> and go live everywhere in real time.
          </p>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        {planControlCards.map((plan) => (
          <div key={plan.key} className={panel}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-xs uppercase tracking-[0.16em] text-slate-500">{plan.name} Plan</div>
                <div className="mt-3 text-4xl font-bold text-white">₹{plan.price.toLocaleString('en-IN')}</div>
                <div className="mt-2 text-sm text-slate-400">per month</div>
              </div>
              <div className="rounded-full border border-slate-700 bg-slate-950/70 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-cyan-300">
                {plan.key}
              </div>
            </div>

            <div className="mt-6 space-y-4">
              <div>
                <label className="mb-2 block text-sm font-medium text-slate-300">Plan Name</label>
                <input
                  type="text"
                  value={plan.name}
                  onChange={(event) => updatePlanName(plan.key, event.target.value)}
                  className="w-full rounded-2xl border border-slate-600 bg-slate-950 px-4 py-3 text-lg text-white"
                  placeholder="Plan display name"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-slate-300">Price (Rs)</label>
                <input
                  type="number"
                  min="0"
                  value={plan.price}
                  onChange={(event) => updatePlanPrice(plan.key, Number(event.target.value))}
                  className="w-full rounded-2xl border border-slate-600 bg-slate-950 px-4 py-3 text-lg text-white"
                />
              </div>

              {(['studentsLimit', 'teachersLimit', 'batchesLimit', 'branchesLimit'] as const).map((featureKey) => (
                <div key={featureKey}>
                  <label className="mb-2 block text-sm font-medium text-slate-300">{featureLabels[featureKey]}</label>
                  <input
                    type="number"
                    min="0"
                    value={plan.features[featureKey]}
                    onChange={(event) => updatePlanFeature(plan.key, featureKey, Number(event.target.value))}
                    className="w-full rounded-2xl border border-slate-600 bg-slate-950 px-4 py-3 text-lg text-white"
                  />
                </div>
              ))}

              <div className="grid gap-3">
                {(['branchesEnabled', 'messaging', 'aiReports', 'analytics'] as const).map((featureKey) => (
                  <label key={featureKey} className="flex items-center justify-between rounded-2xl border border-slate-700 bg-slate-950/70 px-4 py-4">
                    <div>
                      <div className="text-sm font-semibold text-white">{featureLabels[featureKey]}</div>
                      <div className="mt-1 text-xs uppercase tracking-[0.14em] text-slate-500">
                        {plan.features[featureKey] ? 'Enabled' : 'Disabled'}
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      checked={plan.features[featureKey]}
                      onChange={(event) => updatePlanFeature(plan.key, featureKey, event.target.checked)}
                      className="h-5 w-5 rounded border-slate-500 bg-slate-950 text-cyan-400 focus:ring-cyan-400"
                    />
                  </label>
                ))}
              </div>

              <button
                onClick={() => void savePlanSettings(plan.key)}
                disabled={busyKey === `pricing:${plan.key}`}
                className="w-full rounded-2xl bg-gradient-to-r from-blue-600 to-fuchsia-600 px-5 py-4 text-base font-semibold text-white disabled:opacity-60"
              >
                {busyKey === `pricing:${plan.key}` ? 'Saving Changes...' : 'Save Changes'}
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className={panel}>
        <div className="text-xs uppercase tracking-[0.16em] text-slate-500">Billing Configuration</div>
        <div className="mt-3 text-2xl font-bold text-white">Razorpay subscription settings</div>
        <div className="mt-2 text-sm text-slate-400">
          Store Razorpay plan IDs and invoice branding here. This keeps subscription creation and invoice generation aligned.
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <div>
            <label className="mb-2 block text-sm font-medium text-slate-300">Standard Subscription Plan ID</label>
            <input
              value={billingDraft.standardSubscriptionPlanId}
              onChange={(event) => setBillingDraft((prev) => ({ ...prev, standardSubscriptionPlanId: event.target.value }))}
              className="w-full rounded-2xl border border-slate-600 bg-slate-950 px-4 py-3 text-sm text-white"
              placeholder="plan_..."
            />
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium text-slate-300">Pro Subscription Plan ID</label>
            <input
              value={billingDraft.proSubscriptionPlanId}
              onChange={(event) => setBillingDraft((prev) => ({ ...prev, proSubscriptionPlanId: event.target.value }))}
              className="w-full rounded-2xl border border-slate-600 bg-slate-950 px-4 py-3 text-sm text-white"
              placeholder="plan_..."
            />
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium text-slate-300">Company Name</label>
            <input
              value={billingDraft.companyName}
              onChange={(event) => setBillingDraft((prev) => ({ ...prev, companyName: event.target.value }))}
              className="w-full rounded-2xl border border-slate-600 bg-slate-950 px-4 py-3 text-sm text-white"
            />
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium text-slate-300">GST Number</label>
            <input
              value={billingDraft.gstNumber}
              onChange={(event) => setBillingDraft((prev) => ({ ...prev, gstNumber: event.target.value }))}
              className="w-full rounded-2xl border border-slate-600 bg-slate-950 px-4 py-3 text-sm text-white"
              placeholder="Optional"
            />
          </div>
          <div className="md:col-span-2">
            <label className="mb-2 block text-sm font-medium text-slate-300">Company Address</label>
            <textarea
              value={billingDraft.companyAddress}
              onChange={(event) => setBillingDraft((prev) => ({ ...prev, companyAddress: event.target.value }))}
              rows={3}
              className="w-full rounded-2xl border border-slate-600 bg-slate-950 px-4 py-3 text-sm text-white"
            />
          </div>
        </div>

        <div className="mt-5 flex flex-wrap gap-3">
          <button
            onClick={() => void saveBillingSettings()}
            disabled={busyKey === 'billing-settings'}
            className="rounded-2xl bg-gradient-to-r from-emerald-600 to-cyan-600 px-5 py-3 text-sm font-semibold text-white disabled:opacity-60"
          >
            {busyKey === 'billing-settings' ? 'Saving Billing Settings...' : 'Save Billing Settings'}
          </button>
          <div className="rounded-2xl border border-slate-700 bg-slate-950/70 px-4 py-3 text-sm text-slate-300">
            Live invoice branding and subscription plan IDs are controlled here.
          </div>
        </div>

        <div className="mt-4 text-xs text-slate-500">
          Current live config:
          <span className="ml-2 text-slate-300">Standard {billingSettings.standardSubscriptionPlanId || 'unset'}</span>
          <span className="ml-2 text-slate-300">Pro {billingSettings.proSubscriptionPlanId || 'unset'}</span>
        </div>
      </div>

      <div className={panel}>
        <div className="text-xs uppercase tracking-[0.16em] text-slate-500">Live Plan Snapshot</div>
        <div className="mt-3 text-2xl font-bold text-white">Realtime plan comparison from Firestore</div>
        <div className="mt-6 overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-700">
            <thead className="bg-slate-900/80">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Metric</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">{formatPlanName('free', planSettings)}</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">{formatPlanName('standard', planSettings)}</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">{formatPlanName('pro', planSettings)}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {planComparisonRows.map((row) => (
                <tr key={row.label}>
                  <td className="px-4 py-4 text-sm font-medium text-white">{row.label}</td>
                  {row.values.map((value, index) => (
                    <td key={`${row.label}-${index}`} className="px-4 py-4 text-sm text-slate-300">
                      {value}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className={panel}>
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <div className="flex items-center gap-3">
              <div className="rounded-2xl bg-emerald-500/15 p-3 text-emerald-300"><Wallet className="h-5 w-5" /></div>
              <div>
                <div className="text-2xl font-bold text-white">Razorpay Settlement Calculator</div>
                <div className="mt-1 text-sm text-slate-400">Estimate platform net settlement after monthly fee, transaction charges, GST, and free-limit usage.</div>
              </div>
            </div>
          </div>
          <button onClick={handleUseSettlementData} disabled={isFetchingSettlementData} className="inline-flex items-center justify-center gap-2 rounded-2xl bg-slate-800 px-5 py-3 text-sm font-semibold text-white disabled:opacity-60">
            {isFetchingSettlementData ? <Loader2 className="h-4 w-4 animate-spin" /> : <BarChart3 className="h-4 w-4" />}
            <span>{isFetchingSettlementData ? 'Fetching payment data...' : '📊 Use My Data'}</span>
          </button>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <div>
            <label className="mb-2 block text-sm font-medium text-slate-300">Transaction amount</label>
            <input type="number" min="0" value={transactionAmount} onChange={(event) => setTransactionAmount(Number(event.target.value) || 0)} className="w-full rounded-2xl border border-slate-600 bg-slate-950 px-4 py-3 text-lg text-white" />
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium text-slate-300">Transactions in month</label>
            <input type="number" min="0" value={transactionCount} onChange={(event) => setTransactionCount(Number(event.target.value) || 0)} className="w-full rounded-2xl border border-slate-600 bg-slate-950 px-4 py-3 text-lg text-white" />
          </div>
        </div>

        <div className="mt-6 grid gap-4 xl:grid-cols-3">
          <div className="rounded-[24px] border border-slate-700 bg-slate-950/80 p-5">
            <div className="text-xs uppercase tracking-[0.16em] text-slate-500">💰 Total Collected</div>
            <div className="mt-3 text-3xl font-bold text-white">{formatInr(settlementSummary?.results.standard.totalCollected ?? manualResults.standard.totalCollected)}</div>
            <div className="mt-2 text-sm text-slate-400">Based on {formatPlanName('standard', planSettings)} plan baseline for comparison.</div>
          </div>
          <div className="rounded-[24px] border border-slate-700 bg-slate-950/80 p-5">
            <div className="text-xs uppercase tracking-[0.16em] text-slate-500">💸 Transaction Fees</div>
            <div className="mt-3 text-3xl font-bold text-white">{formatInr(settlementSummary?.results.standard.totalTransactionFees ?? manualResults.standard.totalTransactionFees)}</div>
            <div className="mt-2 text-sm text-slate-400">Only Razorpay transaction fee + GST.</div>
          </div>
          <div className="rounded-[24px] border border-slate-700 bg-slate-950/80 p-5">
            <div className="text-xs uppercase tracking-[0.16em] text-slate-500">💵 Net Settlement</div>
            <div className="mt-3 text-3xl font-bold text-white">{formatInr(settlementSummary?.results.standard.netSettlement ?? manualResults.standard.netSettlement)}</div>
            <div className="mt-2 text-sm text-slate-400">What you keep after Razorpay deductions.</div>
          </div>
        </div>

        <div className="mt-4 grid gap-4 xl:grid-cols-2">
          <div className="rounded-[24px] border border-amber-500/20 bg-amber-500/10 p-5">
            <div className="text-xs uppercase tracking-[0.16em] text-amber-200">Monthly Plan Cost</div>
            <div className="mt-3 text-3xl font-bold text-white">{formatInr(settlementSummary?.results.standard.monthlyFee ?? manualResults.standard.monthlyFee)}</div>
            <div className="mt-2 text-sm text-slate-300">Subscription cost shown separately from settlement.</div>
          </div>
          <div className="rounded-[24px] border border-fuchsia-500/20 bg-fuchsia-500/10 p-5">
            <div className="text-xs uppercase tracking-[0.16em] text-fuchsia-200">Final Profit</div>
            <div className="mt-3 text-3xl font-bold text-white">{formatInr(settlementSummary?.results.standard.profitAfterPlan ?? manualResults.standard.profitAfterPlan)}</div>
            <div className="mt-2 text-sm text-slate-300">Net settlement minus monthly plan cost.</div>
          </div>
        </div>

        <div className="mt-6 overflow-hidden rounded-[24px] border border-slate-700 bg-slate-950/60">
          <div className="border-b border-slate-700 px-5 py-4">
            <div className="text-sm font-semibold text-white">Plan Comparison</div>
            <div className="text-sm text-slate-400">Plan | Transaction Fees | Net Settlement | Plan Cost | Final Profit</div>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-700">
              <thead className="bg-slate-900/80">
                <tr>
                  <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Plan</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Transaction Fees</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Net Settlement</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Plan Cost</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Final Profit</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {(['standard', 'plus', 'pro'] as SettlementPlan[]).map((plan) => {
                  const result = settlementSummary?.results[plan] ?? manualResults[plan];
                  return (
                    <tr key={plan}>
                      <td className="px-5 py-4 text-sm font-medium text-white">{formatSettlementPlanName(plan)}</td>
                      <td className="px-5 py-4 text-sm text-slate-300">{formatInr(result.totalTransactionFees)}</td>
                      <td className="px-5 py-4 text-sm text-slate-300">{formatInr(result.netSettlement)}</td>
                      <td className="px-5 py-4 text-sm text-slate-300">{formatInr(result.monthlyFee)}</td>
                      <td className="px-5 py-4 text-sm text-slate-300">{formatInr(result.profitAfterPlan)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        <div className="mt-6 rounded-[24px] border border-blue-500/20 bg-blue-500/10 p-5">
          <div className="text-xs uppercase tracking-[0.16em] text-blue-200">Recommendation</div>
          <div className="mt-3 text-2xl font-bold text-white">
            {settlementSummary
              ? settlementSummary.bestPlan === 'standard'
                ? 'STANDARD already gives the best final profit'
                : `💡 Switch to ${formatSettlementPlanName(settlementSummary.bestPlan)} to increase your final profit by ${formatInr(settlementSummary.savings)}/month`
              : 'Use manual values or click Use My Data for a plan recommendation'}
          </div>
          <div className="mt-2 text-sm text-slate-300">
            {settlementSummary
              ? `${formatSettlementPlanName(settlementSummary.bestPlan)} has ${formatInr(settlementSummary.results[settlementSummary.bestPlan].monthlyFee)} monthly fee but still gives higher final profit.`
              : 'Smart Mode uses this month’s paid platform payments and simulates each transaction in order.'}
          </div>
          <div className="mt-2 text-sm text-slate-400">
            {settlementSummary && settlementSummary.results.standard.totalTransactionFees === 0
              ? 'No fees applied yet'
              : sortedPaidPayments.length === 0
                ? 'No payment data found'
                : `Using ${sortedPaidPayments.length} paid transactions from your available payment history.`}
          </div>
        </div>
      </div>
    </div>
  );

  const aiPage = (
    <div className="grid gap-4">
      {classes.map((item) => {
        const usage = usageByClass.get(item.id) ?? { tokens: 0, requests: 0, recent: 0 };
        return (
          <div key={item.id} className={panel}>
            <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
              <div><div className="text-xl font-semibold text-white">{item.name}</div><div className="mt-1 text-sm text-slate-400">{usage.tokens.toLocaleString('en-IN')} tokens | {usage.requests} requests</div><div className="mt-2 text-xs text-slate-500">{usage.tokens > 50000 || usage.recent > 10 ? 'High usage detected' : 'Within normal usage'}</div></div>
              <div className="flex flex-wrap gap-3">
                <button onClick={() => void run(`reset:${item.id}`, () => firebaseService.resetClassAIUsage(item.id, monthKey), 'AI usage reset.', 'Failed to reset AI usage.')} className="rounded-2xl bg-slate-800 px-4 py-3 text-sm font-semibold text-slate-100">Reset Usage</button>
                <button onClick={() => void run(`ai:${item.id}`, () => firebaseService.updateClassAIControls(item.id, { aiEnabled: item.settings.aiEnabled === false }), item.settings.aiEnabled === false ? 'AI restored.' : 'AI blocked.', 'Failed to update AI controls.')} className={`rounded-2xl px-4 py-3 text-sm font-semibold ${item.settings.aiEnabled === false ? 'bg-emerald-500/15 text-emerald-200' : 'bg-red-500/15 text-red-200'}`}>{item.settings.aiEnabled === false ? 'Unblock AI' : 'Block AI'}</button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );

  const growthPage = (
    <div className="space-y-6">
      <div className="grid gap-6 xl:grid-cols-3">
        <div className={panel}><div className="text-xs uppercase tracking-[0.16em] text-slate-500">Landing CTAs</div><div className="mt-3 text-4xl font-bold text-white">{funnel.ctas}</div><div className="mt-2 text-sm text-slate-400">Homepage CTA clicks this month</div></div>
        <div className={panel}><div className="text-xs uppercase tracking-[0.16em] text-slate-500">Signups</div><div className="mt-3 text-4xl font-bold text-white">{funnel.signups}</div><div className="mt-2 text-sm text-slate-400">New accounts this month</div></div>
        <div className={panel}><div className="text-xs uppercase tracking-[0.16em] text-slate-500">Upgrades</div><div className="mt-3 text-4xl font-bold text-white">{funnel.upgrades}</div><div className="mt-2 text-sm text-slate-400">Successful upgrades this month</div></div>
      </div>

      <div className={panel}>
        <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="text-xs uppercase tracking-[0.16em] text-slate-500">Growth Trend</div>
            <div className="mt-2 text-2xl font-bold text-white">Last 6 months growth graph</div>
          </div>
          <div className="inline-flex items-center gap-2 rounded-full bg-emerald-500/10 px-4 py-2 text-sm font-medium text-emerald-200">
            <TrendingUp className="h-4 w-4" />
            <span>CTA + Signup + Upgrade momentum</span>
          </div>
        </div>
        <div className="mt-8 grid grid-cols-6 gap-4">
          {growthTrend.map((item) => (
            <div key={item.key} className="flex flex-col items-center gap-3">
              <div className="flex h-64 w-full max-w-[88px] items-end justify-center rounded-[24px] border border-slate-700 bg-slate-950/80 p-3">
                <div className="flex w-full items-end gap-1">
                  <div
                    className="w-1/3 rounded-t-full bg-cyan-400/85 transition-all"
                    style={{ height: `${Math.max((item.ctas / growthPeak) * 100, item.ctas > 0 ? 10 : 0)}%` }}
                    title={`CTAs: ${item.ctas}`}
                  />
                  <div
                    className="w-1/3 rounded-t-full bg-blue-500/85 transition-all"
                    style={{ height: `${Math.max((item.signups / growthPeak) * 100, item.signups > 0 ? 10 : 0)}%` }}
                    title={`Signups: ${item.signups}`}
                  />
                  <div
                    className="w-1/3 rounded-t-full bg-fuchsia-500/85 transition-all"
                    style={{ height: `${Math.max((item.upgrades / growthPeak) * 100, item.upgrades > 0 ? 10 : 0)}%` }}
                    title={`Upgrades: ${item.upgrades}`}
                  />
                </div>
              </div>
              <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">{item.label}</div>
              <div className="text-xs text-slate-500">{item.total} total</div>
            </div>
          ))}
        </div>
        <div className="mt-6 flex flex-wrap gap-3 text-xs text-slate-400">
          <span className="rounded-full border border-slate-700 bg-slate-950/80 px-3 py-1">Cyan = CTA</span>
          <span className="rounded-full border border-slate-700 bg-slate-950/80 px-3 py-1">Blue = Signup</span>
          <span className="rounded-full border border-slate-700 bg-slate-950/80 px-3 py-1">Magenta = Upgrade</span>
        </div>
      </div>
    </div>
  );

  const usersPage = (
    <div className="space-y-5">
      <div className={`${panel} relative z-40 p-5`}>
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <div className="text-xs uppercase tracking-[0.16em] text-slate-500">User Controls</div>
            <div className="mt-2 text-2xl font-bold text-white">Search And Sort Users</div>
          </div>
          <div className="grid gap-3 md:grid-cols-[minmax(280px,1fr),220px]">
            <label data-no-tilt="true" className="relative block">
              <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
              <input
                data-no-tilt="true"
                type="text"
                value={userSearch}
                onChange={(event) => setUserSearch(event.target.value)}
                placeholder="Search by name, email, role, class, status"
                className="w-full rounded-2xl border border-slate-600 bg-slate-950 py-3 pl-11 pr-4 text-sm text-white placeholder:text-slate-500"
              />
            </label>
            <label className="relative block">
              <ArrowUpDown className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
              <StyledSelect
                value={userSort}
                options={userSortOptions}
                variant="dark"
                onChange={(nextValue) => setUserSort(nextValue as typeof userSort)}
                className="pl-11"
              />
            </label>
          </div>
        </div>
        <div className="mt-4 text-sm text-slate-400">{visibleUsers.length} users matched</div>
      </div>

      {visibleUsers.length === 0 ? (
        <div className={panel}>
          <div className="text-2xl font-bold text-white">No matching users</div>
          <div className="mt-2 text-sm text-slate-400">Try a different search term or change the sort order.</div>
        </div>
      ) : null}

      <div className="relative z-10 grid gap-4 2xl:grid-cols-2">
      {visibleUsers.slice(0, 50).map((item) => {
        const linkedClass = classes.find((c) => c.id === item.activeClassId || c.id === item.classIds?.[0]);
        return (
        <div key={item.id} className={panel}>
            <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
              <div>
                <div className="text-xl font-semibold text-white">{item.name}</div>
                <div className="mt-1 text-sm text-slate-400">{item.email}</div>
                <div className="mt-4 text-sm text-slate-300">Linked Class: {linkedClass?.name ?? 'Unassigned'}</div>
                <div className="mt-2 text-sm text-slate-300">Status: {item.approved ? 'Enabled' : 'Disabled'}</div>
              </div>
              <div className="w-full max-w-xs rounded-[22px] border border-slate-700 bg-slate-900/80 p-4">
                <div className="text-xs uppercase tracking-[0.16em] text-slate-500">Role Control</div>
                <StyledSelect
                  value={item.role}
                  options={userRoleOptions}
                  disabled={item.role === 'super_admin'}
                  variant="dark"
                  onChange={(nextValue) => void run(`role:${item.id}`, () => firebaseService.updateUserAdminState(item.id, { role: nextValue as User['role'] }), 'User role updated.', 'Failed to update user role.')}
                  className="mt-3 text-base"
                />
                <div className="mt-4 space-y-3">
                  {item.role === 'super_admin' ? (
                    <div className="rounded-2xl bg-slate-800 px-4 py-3 text-sm font-medium text-slate-300">Protected super admin account</div>
                  ) : (
                    <>
                      <button onClick={() => void run(`approved:${item.id}`, () => firebaseService.updateUserAdminState(item.id, { approved: !item.approved }), 'User status updated.', 'Failed to update user.')} className={`w-full rounded-2xl px-4 py-3 text-sm font-semibold ${item.approved ? 'bg-red-500/15 text-red-200' : 'bg-emerald-500/15 text-emerald-200'}`}>{item.approved ? 'Disable User' : 'Enable User'}</button>
                      <button onClick={() => handleDeleteUser(item)} disabled={busyKey === `delete:${item.id}`} className="flex w-full items-center justify-center gap-2 rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm font-semibold text-red-200 disabled:opacity-50">
                        <Trash2 className="h-4 w-4" />
                        <span>Delete User</span>
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        );
      })}
      </div>
    </div>
  );

  return (
    <div className="space-y-8">
      {settlementModal.open ? (
        <div className="dashboard-motion fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/70 px-4 py-6 backdrop-blur-sm">
          <div
            ref={settlementModalCardRef}
            className="my-auto flex w-full max-w-md max-h-[calc(100vh-3rem)] flex-col overflow-hidden rounded-[28px] border border-slate-700 bg-slate-900 p-6 shadow-[0_24px_80px_rgba(15,23,42,0.45)]"
          >
            <div className="flex-1 overflow-y-auto pr-2">
              <div
                className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] ${
                  settlementModal.tone === 'success' ? 'bg-emerald-500/15 text-emerald-200' : 'bg-blue-500/15 text-blue-200'
                }`}
              >
                {settlementModal.tone === 'success' ? 'Calculator Update' : 'Smart Mode Notice'}
              </div>
              <div className="mt-4 text-2xl font-bold text-white">{settlementModal.title}</div>
              <div className="mt-3 text-sm leading-7 text-slate-300">{settlementModal.message}</div>
            </div>
            <button
              onClick={() => setSettlementModal((prev) => ({ ...prev, open: false }))}
              className="mt-6 w-full rounded-2xl border border-blue-500/30 bg-gradient-to-r from-blue-600 to-fuchsia-600 px-5 py-3 text-sm font-semibold text-white shadow-[0_18px_40px_rgba(99,102,241,0.2)]"
            >
              Close
            </button>
          </div>
        </div>
      ) : null}

      {view === 'overview' ? <><div className="overflow-hidden rounded-[36px] border border-slate-700/70 bg-[radial-gradient(circle_at_top_left,_rgba(59,130,246,0.28),_transparent_32%),radial-gradient(circle_at_top_right,_rgba(168,85,247,0.22),_transparent_28%),linear-gradient(180deg,_rgba(15,23,42,0.98),_rgba(15,23,42,0.94))] p-8 shadow-[0_28px_90px_rgba(15,23,42,0.38)]"><div className="max-w-3xl"><p className="text-sm font-semibold uppercase tracking-[0.22em] text-cyan-300">Platform Control Room</p><h1 className="mt-3 text-4xl font-bold tracking-tight text-white sm:text-5xl">Super Admin Dashboard</h1><p className="mt-4 text-base leading-7 text-slate-300">Overview only. Use the sidebar to open separate pages for Classes, Payments, Pricing, AI Control, Growth, and Users.</p></div></div>{cards}</> : null}
      <FeedbackMessage type="error" message={error} />
      <FeedbackMessage type="success" message={success} />
      {view === 'classes' ? classesPage : null}
      {view === 'payments' ? paymentsPage : null}
      {view === 'pricing' ? pricingPage : null}
      {view === 'ai_control' ? aiPage : null}
      {view === 'growth' ? growthPage : null}
      {view === 'users' ? usersPage : null}
    </div>
  );
};

export default SuperAdminDashboard;
