import { httpsCallable } from 'firebase/functions';
import { billingFunctions, functions as paymentFunctions } from './firebase';
import { BillingOverview } from '../types';

type UpgradablePlan = 'standard' | 'pro';

type CreateOrderResponse = {
  orderId: string;
  amount: number;
  currency: string;
  key: string;
  plan: UpgradablePlan;
};

type CreateSubscriptionResponse = {
  success: boolean;
  subscriptionId: string;
  key: string;
  shortUrl?: string | null;
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
  reason: string;
  paymentId?: string;
};

type MarkAttemptInput = {
  classId: string;
  adminId: string;
  plan: UpgradablePlan;
  orderId: string;
};

type PaymentAdminAction = 'refund' | 'mark_failed' | 'retry';

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => {
      open: () => void;
      on?: (eventName: string, handler: (...args: unknown[]) => void) => void;
    };
  }
}

const RAZORPAY_SCRIPT_URL = 'https://checkout.razorpay.com/v1/checkout.js';
const CHECKOUT_COOLDOWN_MS = 3000;
const pendingUpgradeOrders = new Map<string, Promise<void>>();
const lastUpgradeAttempts = new Map<string, number>();
const pendingSubscriptionOrders = new Map<string, Promise<void>>();
const lastSubscriptionAttempts = new Map<string, number>();

const loadRazorpayScript = () =>
  new Promise<void>((resolve, reject) => {
    if (typeof window === 'undefined') {
      reject(new Error('Razorpay checkout is only available in the browser.'));
      return;
    }

    if (window.Razorpay) {
      resolve();
      return;
    }

    const existingScript = document.querySelector<HTMLScriptElement>(`script[src="${RAZORPAY_SCRIPT_URL}"]`);
    if (existingScript) {
      existingScript.addEventListener('load', () => resolve(), { once: true });
      existingScript.addEventListener('error', () => reject(new Error('Failed to load Razorpay checkout.')), {
        once: true,
      });
      return;
    }

    const script = document.createElement('script');
    script.src = RAZORPAY_SCRIPT_URL;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Failed to load Razorpay checkout.'));
    document.body.appendChild(script);
  });

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
      throw new Error(`Please wait ${Math.ceil(cooldownRemainingMs / 1000)} seconds before trying again.`);
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
      await loadRazorpayScript();

      const orderResponse = await createOrder({ classId, plan, adminId });
      const order = orderResponse.data;

      await new Promise<void>((resolve, reject) => {
        let settled = false;
        let currentOrderId = order.orderId;
        let currentPaymentId: string | undefined;

        const finishResolve = () => {
          if (settled) return;
          settled = true;
          resolve();
        };

        const finishReject = async (error: Error) => {
          if (settled) return;
          settled = true;

          await markPaymentFailed({
            classId,
            adminId,
            plan,
            orderId: currentOrderId,
            paymentId: currentPaymentId,
            reason: error.message || 'Payment failed.',
          }).catch(() => undefined);

          reject(error);
        };

        const razorpay = new window.Razorpay({
          key: order.key,
          amount: order.amount,
          currency: order.currency,
          name: 'TeachFlow',
          description: `${plan === 'pro' ? 'Pro' : 'Standard'} Plan Upgrade`,
          order_id: order.orderId,
          handler: async (response: VerifyPaymentInput) => {
            currentOrderId = response.razorpay_order_id;
            currentPaymentId = response.razorpay_payment_id;
            try {
              await verifyPayment({
                classId,
                adminId,
                plan,
                razorpay_order_id: response.razorpay_order_id,
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_signature: response.razorpay_signature,
              });
              finishResolve();
            } catch (error) {
              await finishReject(error instanceof Error ? error : new Error('Payment verification failed.'));
            }
          },
          modal: {
            ondismiss: () => {
              void finishReject(new Error('Payment was cancelled before completion.'));
            },
          },
          retry: {
            enabled: false,
          },
          theme: {
            color: '#f59e0b',
          },
        });

        void (async () => {
          try {
            await markPaymentAttempted({
              classId,
              adminId,
              plan,
              orderId: order.orderId,
            });

            razorpay.on?.('payment.failed', (response: { error?: { description?: string; reason?: string; metadata?: { order_id?: string; payment_id?: string } } }) => {
              currentOrderId = response.error?.metadata?.order_id ?? currentOrderId;
              currentPaymentId = response.error?.metadata?.payment_id ?? currentPaymentId;
              void finishReject(
                new Error(response.error?.description || response.error?.reason || 'Payment failed. Please try again.')
              );
            });

            razorpay.open();
          } catch (error) {
            await finishReject(error instanceof Error ? error : new Error('Unable to start payment.'));
          }
        })();
      });
    })().finally(() => {
      pendingUpgradeOrders.delete(attemptKey);
    });

    pendingUpgradeOrders.set(attemptKey, request);
    return request;
  },

  async managePayment(paymentId: string, action: PaymentAdminAction) {
    const managePayment = httpsCallable<
      { paymentId: string; action: PaymentAdminAction },
      { success: boolean; action: PaymentAdminAction; newPaymentId?: string; refundId?: string }
    >(paymentFunctions, 'superAdminManagePayment');

    const response = await managePayment({ paymentId, action });
    return response.data;
  },

  async getBillingOverview(classId: string) {
    const getBillingOverview = httpsCallable<{ classId: string }, BillingOverview>(billingFunctions, 'getAdminBillingOverview');
    const response = await getBillingOverview({ classId });
    return response.data;
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
      throw new Error(`Please wait ${Math.ceil(cooldownRemainingMs / 1000)} seconds before trying again.`);
    }

    lastSubscriptionAttempts.set(attemptKey, Date.now());

    const createSubscription = httpsCallable<
      { classId: string; adminId: string },
      CreateSubscriptionResponse
    >(billingFunctions, 'createSubscription');

    const request = (async () => {
      await loadRazorpayScript();
      const response = await createSubscription({ classId, adminId });
      const subscription = response.data;

      await new Promise<void>((resolve, reject) => {
        let settled = false;

        const finishResolve = () => {
          if (settled) return;
          settled = true;
          resolve();
        };

        const finishReject = (error: Error) => {
          if (settled) return;
          settled = true;
          reject(error);
        };

        const razorpay = new window.Razorpay({
          key: subscription.key,
          subscription_id: subscription.subscriptionId,
          name: 'TeachFlow',
          description: `Enable auto-pay for ${className ?? 'your class'}`,
          modal: {
            ondismiss: () => finishReject(new Error('Auto-pay setup was cancelled.')),
          },
          retry: {
            enabled: false,
          },
          theme: {
            color: '#f59e0b',
          },
          handler: () => finishResolve(),
        });

        razorpay.on?.('payment.failed', (event: { error?: { description?: string; reason?: string } }) => {
          finishReject(new Error(event.error?.description || event.error?.reason || 'Auto-pay setup failed.'));
        });

        razorpay.open();
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
};
