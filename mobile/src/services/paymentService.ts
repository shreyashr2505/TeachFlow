import { httpsCallable } from 'firebase/functions';
import RazorpayCheckout from 'react-native-razorpay';
import { billingFunctions, paymentFunctions } from './firebase';
import { PaymentAdminAction, PaymentRecord, PlanName } from '../types/Models';

type UpgradablePlan = Exclude<PlanName, 'free'>;

type CreateOrderResponse = {
  success: boolean;
  orderId: string;
  amount: number;
  currency: string;
  key: string;
  plan: UpgradablePlan;
};

type VerifyPaymentInput = {
  classId: string;
  adminId: string;
  plan: UpgradablePlan;
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
};

type MarkFailureInput = {
  classId: string;
  adminId: string;
  plan: UpgradablePlan;
  orderId: string;
  paymentId?: string;
  reason: string;
};

type MarkAttemptInput = {
  classId: string;
  adminId: string;
  plan: UpgradablePlan;
  orderId: string;
};

type CreateSubscriptionResponse = {
  success: boolean;
  subscriptionId: string;
  key: string;
  shortUrl?: string | null;
  plan: UpgradablePlan;
};

const CHECKOUT_COOLDOWN_MS = 12_000;
const lastUpgradeAttempts = new Map<string, number>();
const pendingUpgradeOrders = new Map<string, Promise<void>>();
const lastSubscriptionAttempts = new Map<string, number>();
const pendingSubscriptionOrders = new Map<string, Promise<CreateSubscriptionResponse>>();

const getCooldownError = (remainingMs: number) => `Please wait ${Math.ceil(remainingMs / 1000)} seconds before trying again.`;

export const paymentService = {
  async upgradePlan(classId: string, plan: UpgradablePlan, adminId: string) {
    const attemptKey = `${classId}:${plan}`;
    const existingRequest = pendingUpgradeOrders.get(attemptKey);
    if (existingRequest) {
      return existingRequest;
    }

    const lastAttemptAt = lastUpgradeAttempts.get(attemptKey) ?? 0;
    const cooldownRemainingMs = CHECKOUT_COOLDOWN_MS - (Date.now() - lastAttemptAt);
    if (cooldownRemainingMs > 0) {
      throw new Error(getCooldownError(cooldownRemainingMs));
    }

    lastUpgradeAttempts.set(attemptKey, Date.now());

    const createOrder = httpsCallable<{ classId: string; plan: UpgradablePlan; adminId: string }, CreateOrderResponse>(
      paymentFunctions,
      'createRazorpayOrder'
    );
    const verifyPayment = httpsCallable<VerifyPaymentInput, { success: boolean; plan: UpgradablePlan; invoiceUrl?: string }>(
      paymentFunctions,
      'verifyRazorpayPayment'
    );
    const markPaymentFailed = httpsCallable<MarkFailureInput, { success: boolean; status: string }>(
      paymentFunctions,
      'markRazorpayPaymentFailed'
    );
    const markPaymentAttempted = httpsCallable<MarkAttemptInput, { success: boolean; status: string }>(
      paymentFunctions,
      'markRazorpayPaymentAttempted'
    );

    const request = (async () => {
      const orderResponse = await createOrder({ classId, plan, adminId });
      const order = orderResponse.data;

      await markPaymentAttempted({
        classId,
        adminId,
        plan,
        orderId: order.orderId,
      });

      try {
        const result = await RazorpayCheckout.open({
          key: order.key,
          amount: order.amount,
          currency: order.currency,
          name: 'TeachFlow',
          description: `${plan === 'pro' ? 'Pro' : 'Standard'} Plan Upgrade`,
          order_id: order.orderId,
          retry: {
            enabled: false,
          },
          theme: {
            color: '#f59e0b',
          },
        });

        await verifyPayment({
          classId,
          adminId,
          plan,
          razorpay_order_id: result.razorpay_order_id,
          razorpay_payment_id: result.razorpay_payment_id,
          razorpay_signature: result.razorpay_signature,
        });
      } catch (error) {
        const paymentId = error && typeof error === 'object' && 'razorpay_payment_id' in error ? String(error.razorpay_payment_id ?? '') : undefined;
        const reason =
          error instanceof Error
            ? error.message
            : typeof error === 'object' && error && 'description' in error
              ? String(error.description ?? 'Payment failed.')
              : 'Payment failed.';

        await markPaymentFailed({
          classId,
          adminId,
          plan,
          orderId: order.orderId,
          paymentId,
          reason,
        }).catch(() => undefined);

        throw error instanceof Error ? error : new Error(reason);
      }
    })().finally(() => {
      pendingUpgradeOrders.delete(attemptKey);
    });

    pendingUpgradeOrders.set(attemptKey, request);
    return request;
  },

  async enableAutoPay(classId: string, adminId: string, className?: string) {
    const attemptKey = `${classId}:subscription`;
    const existingRequest = pendingSubscriptionOrders.get(attemptKey);
    if (existingRequest) {
      return existingRequest;
    }

    const lastAttemptAt = lastSubscriptionAttempts.get(attemptKey) ?? 0;
    const cooldownRemainingMs = CHECKOUT_COOLDOWN_MS - (Date.now() - lastAttemptAt);
    if (cooldownRemainingMs > 0) {
      throw new Error(getCooldownError(cooldownRemainingMs));
    }

    lastSubscriptionAttempts.set(attemptKey, Date.now());

    const createSubscription = httpsCallable<{ classId: string; adminId: string }, CreateSubscriptionResponse>(billingFunctions, 'createSubscription');

    const request = (async () => {
      const response = await createSubscription({ classId, adminId });
      const subscription = response.data;

      await RazorpayCheckout.open({
        key: subscription.key,
        subscription_id: subscription.subscriptionId,
        name: 'TeachFlow',
        description: `Enable auto-pay for ${className ?? 'your class'}`,
        retry: {
          enabled: false,
        },
        theme: {
          color: '#f59e0b',
        },
      });

      return subscription;
    })().finally(() => {
      pendingSubscriptionOrders.delete(attemptKey);
    });

    pendingSubscriptionOrders.set(attemptKey, request);
    return request;
  },

  async disableAutoPay(classId: string, adminId: string, subscriptionId: string) {
    const cancelSubscription = httpsCallable<
      { classId: string; adminId: string; subscriptionId: string },
      { success: boolean; subscriptionId: string; autoRenew: boolean }
    >(billingFunctions, 'cancelSubscription');
    const response = await cancelSubscription({ classId, adminId, subscriptionId });
    return response.data;
  },

  async managePayment(paymentId: string, action: PaymentAdminAction) {
    const managePayment = httpsCallable<
      { paymentId: string; action: PaymentAdminAction },
      { success: boolean; action: PaymentAdminAction; newPaymentId?: string; refundId?: string }
    >(paymentFunctions, 'superAdminManagePayment');
    const response = await managePayment({ paymentId, action });
    return response.data;
  },

  getFailureLabel(reason?: string) {
    if (!reason) return 'Unknown failure';
    if (reason === 'payment_cancelled') return 'User cancelled';
    if (reason === 'signature_failed') return 'Signature failed';
    if (reason === 'network_error') return 'Network error';
    if (reason === 'payment_expired') return 'Expired';
    return reason.replace(/_/g, ' ');
  },

  getRevenueMetrics(payments: PaymentRecord[]) {
    const paidPayments = payments.filter((payment) => payment.status === 'paid');
    const failedPayments = payments.filter((payment) => ['failed', 'expired', 'cancelled'].includes(payment.status));
    const revenue = paidPayments.reduce((sum, payment) => sum + payment.amount, 0);
    return {
      paidPayments,
      failedPayments,
      revenue,
      paidCount: paidPayments.length,
      failedCount: failedPayments.length,
    };
  },
};
