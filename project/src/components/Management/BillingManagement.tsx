import React, { useEffect, useMemo, useState } from 'react';
import { AlertCircle, CalendarDays, CreditCard, Download, Loader2, RefreshCw, ToggleLeft, ToggleRight, Wallet } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { firebaseService } from '../../services/firebaseService';
import { paymentService } from '../../services/paymentService';
import FeedbackMessage from '../Common/FeedbackMessage';
import { BillingOverview, ManagedPlan, PaymentRecord } from '../../types';
import { formatPlanName, getPlanDefinition } from '../../utils/plan';

const panel = 'rounded-[28px] border border-slate-700/70 bg-slate-900/95 p-6 shadow-[0_18px_60px_rgba(15,23,42,0.28)]';

const formatMoney = (amount: number, currency = 'INR') =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency }).format(Math.max(0, amount) / 100);

const formatDate = (value?: string | null) => {
  if (!value) return 'Not set';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Not set';
  return date.toLocaleString('en-IN');
};

const formatFailureReason = (value?: string) => {
  if (!value) return '';
  if (value === 'payment_cancelled') return 'User cancelled';
  if (value === 'signature_failed') return 'Signature failed';
  if (value === 'network_error') return 'Network error';
  if (value === 'payment_expired') return 'Expired';
  return value.replace(/_/g, ' ');
};

const BillingManagement: React.FC = () => {
  const { currentClass, user, refreshUserData, planSettings } = useAuth();
  const [overview, setOverview] = useState<BillingOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [busyKey, setBusyKey] = useState('');

  useEffect(() => {
    let mounted = true;

    const loadOverview = async () => {
      if (!currentClass?.id) {
        if (mounted) {
          setLoading(false);
        }
        return;
      }

      try {
        setLoading(true);
        setError('');
        const result = await paymentService.getBillingOverview(currentClass.id);
        if (mounted) {
          setOverview(result);
        }
      } catch (loadError) {
        if (mounted) {
          setError(loadError instanceof Error ? loadError.message : 'Failed to load billing overview.');
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    };

    void loadOverview();

    return () => {
      mounted = false;
    };
  }, [currentClass?.id]);

  const billingClass = overview?.class ?? null;
  const payments = overview?.payments ?? [];
  const paidPayments = useMemo(() => payments.filter((item) => item.status === 'paid'), [payments]);
  const failedPayments = useMemo(() => payments.filter((item) => ['failed', 'expired', 'cancelled'].includes(item.status)), [payments]);
  const totalRevenue = useMemo(() => paidPayments.reduce((sum, item) => sum + item.amount, 0), [paidPayments]);
  const currentPlan = billingClass?.plan ?? currentClass?.plan ?? 'free';
  const canManageBilling = user?.role === 'admin' && currentClass?.id && currentClass?.adminId === user?.id;

  const refreshOverview = async () => {
    if (!currentClass?.id) return;
    const result = await paymentService.getBillingOverview(currentClass.id);
    setOverview(result);
    await refreshUserData();
  };

  const runAction = async (key: string, action: () => Promise<void>, successMessage: string, failureMessage: string) => {
    setBusyKey(key);
    setError('');
    setSuccess('');
    try {
      await action();
      setSuccess(successMessage);
      await refreshOverview();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : failureMessage);
    } finally {
      setBusyKey('');
    }
  };

  const handleEnableAutoPay = async () => {
    if (!currentClass?.id || !user?.id) return;
    await runAction(
      'enable-autopay',
      async () => {
        await paymentService.enableAutoPay(currentClass.id, user.id, currentClass.name);
      },
      'Auto-pay setup started. Complete the mandate in Razorpay checkout.',
      'Failed to start auto-pay.'
    );
  };

  const handleDisableAutoPay = async () => {
    if (!currentClass?.id || !user?.id) return;
    const subscriptionId = overview?.class.subscriptionId ?? currentClass.subscriptionId ?? '';
    if (subscriptionId) {
      await runAction(
        'disable-autopay',
        async () => {
          await paymentService.disableAutoPay(currentClass.id, user.id, subscriptionId);
        },
        'Auto-pay disabled.',
        'Failed to disable auto-pay.'
      );
      return;
    }

    await runAction(
      'disable-autopay',
      async () => {
        await firebaseService.updateClassBillingState(currentClass.id, false);
      },
      'Auto-pay disabled.',
      'Failed to disable auto-pay.'
    );
  };

  const handleRetry = async (payment: PaymentRecord) => {
    if (!currentClass?.id || !user?.id) return;
    await runAction(
      `retry:${payment.id}`,
      async () => {
        await paymentService.upgradePlan(currentClass.id, payment.plan, user.id);
      },
      'Retry payment started.',
      'Failed to retry payment.'
    );
  };

  const handleUpgrade = async (plan: ManagedPlan) => {
    if (!currentClass?.id || !user?.id) return;
    await runAction(
      `upgrade:${plan}`,
      async () => {
        await paymentService.upgradePlan(currentClass.id, plan, user.id);
      },
      `${formatPlanName(plan)} upgrade started.`,
      'Failed to start upgrade.'
    );
  };

  if (!canManageBilling) {
    return (
      <div className={panel}>
        <div className="text-2xl font-bold text-white">Billing access restricted</div>
        <div className="mt-2 text-sm text-slate-400">Only the class admin can manage billing from this screen.</div>
      </div>
    );
  }

  const blockedUntil = billingClass?.blockedUntil ? new Date(billingClass.blockedUntil) : null;
  const isBlocked = Boolean(blockedUntil && !Number.isNaN(blockedUntil.getTime()) && blockedUntil.getTime() > Date.now());

  return (
    <div className="space-y-6">
      <div className={`${panel} overflow-hidden bg-[radial-gradient(circle_at_top_left,_rgba(59,130,246,0.22),_transparent_28%),radial-gradient(circle_at_top_right,_rgba(245,158,11,0.18),_transparent_28%),linear-gradient(180deg,_rgba(15,23,42,0.98),_rgba(15,23,42,0.94))]`}>
        <div className="max-w-3xl">
          <div className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-300">Billing Center</div>
          <h1 className="mt-3 text-3xl font-bold text-white">Manage subscriptions, retries, and invoices</h1>
          <p className="mt-3 text-sm leading-7 text-slate-300">
            Keep plan renewal, auto-pay, and payment history in one place. Webhook processing handles the final billing state even if this page closes.
          </p>
        </div>
      </div>

      <FeedbackMessage type="error" message={error} />
      <FeedbackMessage type="success" message={success} />

      {loading ? (
        <div className={panel}>
          <div className="flex items-center gap-3 text-slate-300">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span>Loading billing data...</span>
          </div>
        </div>
      ) : null}

      {isBlocked ? (
        <div className="rounded-[24px] border border-red-500/20 bg-red-500/10 p-5 text-red-100">
          <div className="flex items-start gap-3">
            <AlertCircle className="mt-0.5 h-5 w-5" />
            <div>
              <div className="font-semibold">Too many failed attempts</div>
              <div className="mt-1 text-sm text-red-100/80">
                Billing is temporarily blocked until {formatDate(blockedUntil?.toISOString() ?? null)}.
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-4">
        {[
          ['Current Plan', formatPlanName(currentPlan), CreditCard],
          ['Plan Expiry', formatDate(billingClass?.planExpiry ?? currentClass?.planExpiry ?? null), CalendarDays],
          ['Next Billing', formatDate(billingClass?.nextBillingDate ?? currentClass?.nextBillingDate ?? null), Wallet],
          ['Auto-Renew', billingClass?.autoRenew ? 'Enabled' : 'Disabled', billingClass?.autoRenew ? ToggleRight : ToggleLeft],
        ].map(([label, value, Icon]) => {
          const I = Icon as React.ComponentType<{ className?: string }>;
          return (
            <div key={String(label)} className={panel}>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-xs uppercase tracking-[0.18em] text-slate-500">{label}</div>
                  <div className="mt-3 text-2xl font-bold text-white">{value}</div>
                </div>
                <div className="rounded-2xl bg-slate-800 p-4"><I className="h-5 w-5 text-cyan-300" /></div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.2fr,0.8fr]">
        <div className={panel}>
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div>
              <div className="text-xs uppercase tracking-[0.18em] text-slate-500">Subscription Controls</div>
              <div className="mt-2 text-2xl font-bold text-white">Auto-pay and plan renewal</div>
              <div className="mt-2 text-sm text-slate-400">
                Enable Razorpay subscriptions for UPI mandate-based renewals, or disable them to return to manual billing.
              </div>
            </div>
            <div className="flex flex-wrap gap-3">
              <button
                onClick={() => void handleEnableAutoPay()}
                disabled={busyKey === 'enable-autopay' || billingClass?.autoRenew}
                className="rounded-2xl bg-emerald-500/15 px-4 py-3 text-sm font-semibold text-emerald-200 disabled:opacity-50"
              >
                {busyKey === 'enable-autopay' ? 'Starting...' : 'Enable Auto-Pay'}
              </button>
              <button
                onClick={() => void handleDisableAutoPay()}
                disabled={busyKey === 'disable-autopay' || !billingClass?.autoRenew}
                className="rounded-2xl bg-amber-500/15 px-4 py-3 text-sm font-semibold text-amber-200 disabled:opacity-50"
              >
                {busyKey === 'disable-autopay' ? 'Updating...' : 'Disable Auto-Pay'}
              </button>
            </div>
          </div>

          <div className="mt-6 grid gap-3 md:grid-cols-2">
            {[
              ['Subscription ID', billingClass?.subscriptionId ?? 'Not created'],
              ['Status', billingClass?.subscriptionStatus ?? 'inactive'],
              ['Failed Attempts', String(billingClass?.failedAttemptsCount ?? 0)],
              ['Blocked Until', formatDate(billingClass?.blockedUntil ?? null)],
            ].map(([label, value]) => (
              <div key={label} className="rounded-2xl border border-slate-700 bg-slate-950/70 p-4">
                <div className="text-xs uppercase tracking-[0.16em] text-slate-500">{label}</div>
                <div className="mt-2 break-words text-sm font-semibold text-white">{value}</div>
              </div>
            ))}
          </div>
        </div>

        <div className={panel}>
          <div className="text-xs uppercase tracking-[0.18em] text-slate-500">Quick Actions</div>
          <div className="mt-2 text-2xl font-bold text-white">Plan upgrades</div>
          <div className="mt-4 space-y-3">
            {(['standard', 'pro'] as ManagedPlan[]).map((plan) => {
              const definition = getPlanDefinition(plan, planSettings);
              const label = `Upgrade to ${formatPlanName(plan)}`;
              const isCurrentOrLower = currentPlan === plan || currentPlan === 'free' || (currentPlan === 'standard' && plan === 'pro');
              return (
                <button
                  key={plan}
                  onClick={() => void handleUpgrade(plan)}
                  disabled={busyKey === `upgrade:${plan}` || (!isCurrentOrLower && currentPlan === 'pro')}
                  className="flex w-full items-center justify-between rounded-2xl border border-slate-700 bg-slate-950/70 px-4 py-4 text-left disabled:opacity-50"
                >
                  <div>
                    <div className="text-sm font-semibold text-white">{label}</div>
                    <div className="mt-1 text-xs text-slate-400">
                      {formatMoney(definition.price * 100)} per month
                    </div>
                  </div>
                  <RefreshCw className="h-4 w-4 text-cyan-300" />
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className={panel}>
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="text-xs uppercase tracking-[0.18em] text-slate-500">Billing Summary</div>
            <div className="mt-2 text-2xl font-bold text-white">Revenue and payment status</div>
          </div>
          <div className="rounded-2xl bg-emerald-500/15 px-4 py-3 text-sm font-semibold text-emerald-200">
            {formatMoney(totalRevenue)} collected
          </div>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-3">
          <div className="rounded-2xl border border-slate-700 bg-slate-950/70 p-4">
            <div className="text-xs uppercase tracking-[0.16em] text-slate-500">Paid</div>
            <div className="mt-2 text-2xl font-bold text-white">{paidPayments.length}</div>
          </div>
          <div className="rounded-2xl border border-slate-700 bg-slate-950/70 p-4">
            <div className="text-xs uppercase tracking-[0.16em] text-slate-500">Failed</div>
            <div className="mt-2 text-2xl font-bold text-white">{failedPayments.length}</div>
          </div>
          <div className="rounded-2xl border border-slate-700 bg-slate-950/70 p-4">
            <div className="text-xs uppercase tracking-[0.16em] text-slate-500">Latest Status</div>
            <div className="mt-2 text-2xl font-bold text-white">
              {billingClass?.subscriptionStatus ? billingClass.subscriptionStatus : billingClass?.autoRenew ? 'active' : 'manual'}
            </div>
          </div>
        </div>
      </div>

      <div className={panel}>
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="text-xs uppercase tracking-[0.18em] text-slate-500">Payment History</div>
            <div className="mt-2 text-2xl font-bold text-white">Invoices and payment events</div>
          </div>
          <div className="text-sm text-slate-400">{payments.length} records</div>
        </div>

        <div className="mt-6 grid gap-4">
          {payments.length === 0 ? (
            <div className="rounded-2xl border border-slate-700 bg-slate-950/70 p-5 text-slate-300">No billing history yet.</div>
          ) : (
            payments.map((payment) => {
              const failedReason = formatFailureReason(payment.failureReason || payment.invoiceFailureReason);
              return (
                <div key={payment.id} className="rounded-[24px] border border-slate-700 bg-slate-950/70 p-5">
                  <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                    <div className="space-y-3">
                      <div className="flex flex-wrap gap-2">
                        <span className="rounded-full bg-slate-200 px-3 py-1 text-xs font-semibold text-slate-700">
                          {formatPlanName(payment.plan)}
                        </span>
                        <span className="rounded-full bg-blue-500/15 px-3 py-1 text-xs font-semibold text-blue-200">
                          {payment.status}
                        </span>
                        <span className="rounded-full bg-amber-500/15 px-3 py-1 text-xs font-semibold text-amber-200">
                          {formatMoney(payment.amount, payment.currency)}
                        </span>
                      </div>
                      <div className="text-sm text-slate-400">{formatDate(payment.createdAt)}</div>
                      <div className="grid gap-3 md:grid-cols-2">
                        <div className="rounded-2xl border border-slate-700 bg-slate-950/70 p-4">
                          <div className="text-xs uppercase tracking-[0.16em] text-slate-500">Invoice</div>
                          <div className="mt-2 break-words text-sm font-semibold text-white">{payment.invoiceNumber ?? 'Pending'}</div>
                          {payment.invoiceUrl ? (
                            <a
                              href={payment.invoiceUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="mt-2 inline-flex items-center gap-2 text-sm text-cyan-300 underline"
                            >
                              <Download className="h-4 w-4" />
                              Download invoice
                            </a>
                          ) : null}
                        </div>
                        <div className="rounded-2xl border border-slate-700 bg-slate-950/70 p-4">
                          <div className="text-xs uppercase tracking-[0.16em] text-slate-500">Payment ID</div>
                          <div className="mt-2 break-all text-sm font-semibold text-white">{payment.paymentId ?? 'Pending'}</div>
                          {failedReason ? <div className="mt-2 text-xs text-red-200">Failed: {failedReason}</div> : null}
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-3">
                      <button
                        onClick={() => void handleRetry(payment)}
                        disabled={busyKey === `retry:${payment.id}` || payment.status === 'paid'}
                        className="rounded-2xl bg-blue-500/15 px-4 py-3 text-sm font-semibold text-blue-200 disabled:opacity-50"
                      >
                        {busyKey === `retry:${payment.id}` ? 'Retrying...' : 'Retry Payment'}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};

export default BillingManagement;
