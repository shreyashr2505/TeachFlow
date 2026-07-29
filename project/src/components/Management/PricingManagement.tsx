import React, { useMemo, useState } from 'react';
import { Check, CreditCard, Sparkles } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { paymentService } from '../../services/paymentService';
import FeedbackMessage from '../Common/FeedbackMessage';
import { ManagedPlan } from '../../types';
import { canAccessFeature, formatPlanName, getPlanDefinition } from '../../utils/plan';

type PaidPlan = 'standard' | 'pro';

const formatPrice = (amount: number) => `Rs ${Math.round(amount).toLocaleString('en-IN')}`;
const formatLimit = (value: number) => (value >= 999999 ? 'Unlimited' : value.toLocaleString('en-IN'));

const normalizePricingError = (error: unknown) => {
  const message = error instanceof Error ? error.message.trim() : '';
  const normalized = message.toLowerCase();

  if (!message || normalized === 'internal' || normalized.includes('internal error')) {
    return 'Payment service is temporarily unavailable right now. Please try again in a moment.';
  }

  if (normalized.includes('cancelled')) {
    return 'Payment was cancelled before completion.';
  }

  if (normalized.includes('network')) {
    return 'Network issue while starting payment. Please check your connection and try again.';
  }

  return message;
};

const PricingManagement: React.FC = () => {
  const { currentClass, refreshUserData, planSettings, user } = useAuth();
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [activePlan, setActivePlan] = useState<PaidPlan | ''>('');

  const currentPlan = currentClass?.plan ?? 'free';
  const currentPlanRank = currentPlan === 'free' ? 0 : currentPlan === 'standard' ? 1 : 2;
  const canInitiatePayment = user?.role === 'admin' && Boolean(currentClass?.id) && currentClass?.adminId === user?.id;

  const plans = useMemo(
    () =>
      (['free', 'standard', 'pro'] as ManagedPlan[]).map((planId) => {
        const definition = getPlanDefinition(planId, planSettings);
        return {
          id: planId,
          title: definition.name,
          priceLabel: formatPrice(definition.price),
          description:
            planId === 'free'
              ? 'Best for trying TeachFlow with a small coaching setup.'
              : planId === 'standard'
                ? 'Unlock AI tools, messaging, and branch support for a growing class.'
                : 'For larger institutes that need analytics, branch scale, and high limits.',
          highlight: planId === 'standard',
          features: [
            `${formatLimit(definition.features.studentsLimit)} students`,
            `${formatLimit(definition.features.teachersLimit)} teachers`,
            `${formatLimit(definition.features.batchesLimit)} batches`,
            definition.features.branchesEnabled
              ? `Up to ${formatLimit(definition.features.branchesLimit)} branches`
              : 'No branch support',
            definition.features.messaging ? 'Messaging unlocked' : 'Messaging locked',
            definition.features.aiReports ? 'AI reports unlocked' : 'AI reports locked',
            definition.features.analytics ? 'Advanced analytics included' : 'Advanced analytics locked',
          ],
        };
      }),
    [planSettings]
  );

  const comparisonRows = useMemo(
    () => [
      {
        label: 'Students',
        values: plans.map((plan) => formatLimit(getPlanDefinition(plan.id, planSettings).features.studentsLimit)),
      },
      {
        label: 'Teachers',
        values: plans.map((plan) => formatLimit(getPlanDefinition(plan.id, planSettings).features.teachersLimit)),
      },
      {
        label: 'Batches',
        values: plans.map((plan) => formatLimit(getPlanDefinition(plan.id, planSettings).features.batchesLimit)),
      },
      {
        label: 'Branches',
        values: plans.map((plan) => {
          const definition = getPlanDefinition(plan.id, planSettings);
          return definition.features.branchesEnabled
            ? `Up to ${formatLimit(definition.features.branchesLimit)}`
            : 'Not included';
        }),
      },
      {
        label: 'Messaging',
        values: plans.map((plan) =>
          getPlanDefinition(plan.id, planSettings).features.messaging ? 'Included' : 'Not included'
        ),
      },
      {
        label: 'AI reports',
        values: plans.map((plan) =>
          getPlanDefinition(plan.id, planSettings).features.aiReports ? 'Included' : 'Not included'
        ),
      },
      {
        label: 'Advanced analytics',
        values: plans.map((plan) =>
          getPlanDefinition(plan.id, planSettings).features.analytics ? 'Included' : 'Not included'
        ),
      },
    ],
    [planSettings, plans]
  );

  const handleUpgrade = async (plan: PaidPlan) => {
    if (!currentClass?.id || !user?.id) return;

    if (!canInitiatePayment) {
      setError('Only the class admin can upgrade this plan.');
      return;
    }

    try {
      setError('');
      setSuccess('');
      setActivePlan(plan);
      await paymentService.upgradePlan(currentClass.id, plan, user.id);
      await refreshUserData();
      setSuccess(`Payment verified. Your class plan is now ${formatPlanName(plan)}.`);
    } catch (err) {
      setError(normalizePricingError(err) || 'Failed to complete payment.');
    } finally {
      setActivePlan('');
    }
  };

  return (
    <div className="space-y-6">
      <div className="overflow-hidden rounded-[32px] border border-slate-700/70 bg-[radial-gradient(circle_at_top_right,_rgba(59,130,246,0.28),_transparent_32%),radial-gradient(circle_at_left,_rgba(168,85,247,0.22),_transparent_26%),linear-gradient(135deg,_rgba(15,23,42,0.98),_rgba(30,41,59,0.94))] p-8 shadow-[0_28px_70px_rgba(15,23,42,0.32)]">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div className="max-w-3xl">
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-cyan-300">Pricing And Billing</p>
            <h1 className="mt-3 text-3xl font-bold text-white sm:text-4xl">Choose the right plan before payment</h1>
            <p className="mt-3 max-w-2xl text-base leading-7 text-slate-300">
              Compare live pricing, limits, branch support, AI features, messaging access, and analytics before selecting a plan for this class.
            </p>
          </div>
          <div data-no-tilt="true" className="rounded-2xl border border-slate-600/80 bg-slate-950/55 px-5 py-4 shadow-[0_18px_40px_rgba(15,23,42,0.3)] backdrop-blur">
            <div className="text-xs uppercase tracking-[0.2em] text-cyan-300">Current plan</div>
            <div className="mt-2 text-2xl font-bold text-white">{formatPlanName(currentPlan)}</div>
            <div className="mt-1 text-sm text-slate-300">{currentClass?.name ?? 'Current class workspace'}</div>
          </div>
        </div>
      </div>

      <FeedbackMessage type="error" message={error} />
      <FeedbackMessage type="success" message={success} />

      <div className="grid gap-6 xl:grid-cols-3">
        {plans.map((plan) => {
          const planRank = plan.id === 'free' ? 0 : plan.id === 'standard' ? 1 : 2;
          const isCurrent = currentPlan === plan.id;
          const isDowngrade = planRank < currentPlanRank;
          const canUpgrade = plan.id !== 'free' && planRank > currentPlanRank;

          return (
            <div
              key={plan.id}
              className={`flex h-full flex-col rounded-[28px] border p-6 shadow-sm ${
                plan.highlight
                  ? 'border-blue-200 bg-gradient-to-br from-blue-50 via-white to-indigo-50'
                  : 'border-gray-100 bg-white'
              }`}
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-sm font-semibold uppercase tracking-[0.2em] text-blue-600">{plan.title}</div>
                  <div className="mt-3 text-4xl font-bold text-gray-900">{plan.priceLabel}</div>
                  <div className="mt-1 text-sm text-gray-500">per month</div>
                </div>
                {isCurrent ? (
                  <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-emerald-700">
                    Current
                  </span>
                ) : null}
              </div>

              <p className="mt-4 text-sm leading-6 text-gray-600">{plan.description}</p>

              <div className="mt-6 flex-1 space-y-3">
                {plan.features.map((feature) => (
                  <div key={feature} className="flex items-start gap-3 text-sm text-gray-700">
                    <div className="mt-0.5 rounded-full bg-blue-100 p-1 text-blue-700">
                      <Check className="h-3.5 w-3.5" />
                    </div>
                    <span>{feature}</span>
                  </div>
                ))}
              </div>

              <div className="mt-8 border-t border-gray-200/80 pt-6">
                <button
                  onClick={() => (canUpgrade ? void handleUpgrade(plan.id as PaidPlan) : undefined)}
                  disabled={!canUpgrade || activePlan !== '' || !canInitiatePayment}
                  className={`inline-flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold transition ${
                    canUpgrade && canInitiatePayment
                      ? 'bg-gradient-to-r from-blue-600 to-purple-600 text-white hover:from-blue-700 hover:to-purple-700'
                      : 'cursor-not-allowed border border-gray-200 bg-gray-100 text-gray-500'
                  }`}
                >
                  <CreditCard className="h-4 w-4" />
                  <span>
                    {isCurrent
                      ? 'Current Plan'
                      : isDowngrade
                        ? 'Already Included'
                        : !canInitiatePayment
                          ? 'Admin Only'
                          : activePlan === plan.id
                          ? 'Processing payment...'
                          : `Choose ${plan.title}`}
                  </span>
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {!canInitiatePayment ? (
        <div data-no-tilt="true" className="rounded-[24px] border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-900">
          Only the class admin can start Razorpay payments for plan upgrades.
        </div>
      ) : null}

      <div data-no-tilt="true" className="rounded-[28px] border border-gray-100 bg-white p-6 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="rounded-2xl bg-purple-100 p-3 text-purple-700">
            <Sparkles className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-xl font-semibold text-gray-900">Feature comparison</h2>
            <p className="text-sm text-gray-500">See exactly what changes when you move to a higher plan.</p>
          </div>
        </div>

        <div className="mt-6 overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead>
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">Feature</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">{formatPlanName('free')}</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">{formatPlanName('standard')}</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">{formatPlanName('pro')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {comparisonRows.map((row) => (
                <tr key={row.label}>
                  <td className="px-4 py-4 text-sm font-medium text-gray-900">{row.label}</td>
                  {row.values.map((value, index) => (
                    <td key={`${row.label}-${index}`} className="px-4 py-4 text-sm text-gray-600">
                      {value}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-4">
          <div className="rounded-2xl border border-gray-100 bg-gray-50 p-4">
            <div className="text-xs uppercase tracking-[0.2em] text-gray-500">AI access</div>
            <div className="mt-2 text-sm text-gray-700">
              {currentClass && canAccessFeature('ai', currentClass.plan, planSettings) ? 'Enabled on your current plan' : `Upgrade to ${formatPlanName('standard')} or ${formatPlanName('pro')} to unlock AI tools`}
            </div>
          </div>
          <div className="rounded-2xl border border-gray-100 bg-gray-50 p-4">
            <div className="text-xs uppercase tracking-[0.2em] text-gray-500">Messaging</div>
            <div className="mt-2 text-sm text-gray-700">
              {currentClass && canAccessFeature('messaging', currentClass.plan, planSettings) ? 'Enabled on your current plan' : `Upgrade to ${formatPlanName('standard')} or ${formatPlanName('pro')} to enable messaging`}
            </div>
          </div>
          <div className="rounded-2xl border border-gray-100 bg-gray-50 p-4">
            <div className="text-xs uppercase tracking-[0.2em] text-gray-500">Branches</div>
            <div className="mt-2 text-sm text-gray-700">
              {currentClass && canAccessFeature('branches', currentClass.plan, planSettings) ? 'Branch support is enabled on your current plan' : 'Upgrade to unlock multi-branch management'}
            </div>
          </div>
          <div className="rounded-2xl border border-gray-100 bg-gray-50 p-4">
            <div className="text-xs uppercase tracking-[0.2em] text-gray-500">Advanced analytics</div>
            <div className="mt-2 text-sm text-gray-700">
              {currentClass && canAccessFeature('advanced_analytics', currentClass.plan, planSettings) ? 'Enabled on your current plan' : `Available on ${formatPlanName('pro')} only`}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PricingManagement;
