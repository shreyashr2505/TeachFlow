const crypto = require('crypto');
const admin = require('firebase-admin');
const Razorpay = require('razorpay');
const { setGlobalOptions } = require('firebase-functions/v2');
const { HttpsError, onCall, onRequest } = require('firebase-functions/v2/https');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { onDocumentCreated, onDocumentUpdated } = require('firebase-functions/v2/firestore');
const { defineSecret } = require('firebase-functions/params');

admin.initializeApp();
setGlobalOptions({
  region: 'asia-south1',
  memory: '256MiB',
  timeoutSeconds: 60,
});

const razorpayKeyId = defineSecret('RAZORPAY_KEY_ID');
const razorpayKeySecret = defineSecret('RAZORPAY_KEY_SECRET');
const razorpayWebhookSecret = defineSecret('RAZORPAY_WEBHOOK_SECRET');

const DEFAULT_PLAN_SETTINGS = {
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
const PLAN_SETTINGS_DOC_PATH = 'settings/plans';
const BILLING_SETTINGS_DOC_PATH = 'settings/billing';
const FEE_REMINDER_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
const PAYMENT_ORDER_REUSE_WINDOW_MS = 15 * 60 * 1000;
const PAYMENT_EXPIRY_WINDOW_MS = 15 * 60 * 1000;
const INVOICE_COUNTER_DOC_PATH = 'billingCounters/invoices';
const PAYMENT_NOTIFICATION_TOPIC = 'payment_updates';
const FUNCTION_RUNTIME_OPTIONS = {
  memory: '256MiB',
  timeoutSeconds: 60,
};
const PAYMENT_FUNCTION_OPTIONS = {
  ...FUNCTION_RUNTIME_OPTIONS,
  region: 'us-central1',
};
const BILLING_FUNCTION_OPTIONS = {
  ...FUNCTION_RUNTIME_OPTIONS,
  region: 'asia-south1',
};
const SYSTEM_FUNCTION_OPTIONS = {
  ...FUNCTION_RUNTIME_OPTIONS,
  region: 'asia-south1',
};
const COMPANY_DETAILS = {
  name: 'TeachFlow',
  address: 'TeachFlow Billing, India',
  gst: 'GST: Pending',
};

const PAYMENT_FAILURE_REASONS = {
  cancelled: 'payment_cancelled',
  signature: 'signature_failed',
  network: 'network_error',
  timedOut: 'payment_expired',
  unknown: 'payment_failed',
};

const uniqueValues = (values) => [...new Set(values.filter((value) => typeof value === 'string' && value.trim().length > 0))];
const chunkArray = (values, size) => {
  const chunks = [];
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }
  return chunks;
};

const getUserDoc = async (userId) => {
  const snapshot = await admin.firestore().doc(`users/${userId}`).get();
  return snapshot.exists ? snapshot.data() : null;
};

const getClassDoc = async (classId) => {
  const snapshot = await admin.firestore().doc(`classes/${classId}`).get();
  return snapshot.exists ? snapshot.data() : null;
};

const getClassTabUrl = async (classId, tab) => {
  const classData = await getClassDoc(classId);
  if (!classData?.subdomain) {
    return '/';
  }

  return `/${classData.subdomain}?tab=${tab}`;
};

const getRecipientIdsForStudent = async (classId, studentId) => {
  const studentSnapshot = await admin.firestore().doc(`classes/${classId}/students/${studentId}`).get();
  const studentData = studentSnapshot.exists ? studentSnapshot.data() : {};
  return uniqueValues([studentId, ...(studentData?.parentIds || [])]);
};

const getRecipientIdsForLecture = async (classId, lecture) => {
  const studentsRef = admin.firestore().collection(`classes/${classId}/students`);
  const snapshot = lecture.batchId
    ? await studentsRef.where('batchId', '==', lecture.batchId).get()
    : await studentsRef.where('batch', '==', lecture.batch).get();

  const recipientIds = [];
  snapshot.docs.forEach((docSnapshot) => {
    recipientIds.push(docSnapshot.id);
    const studentData = docSnapshot.data();
    (studentData.parentIds || []).forEach((parentId) => recipientIds.push(parentId));
  });

  return uniqueValues(recipientIds);
};

const getTokenEntriesForUsers = async (userIds) => {
  const snapshots = await Promise.all(userIds.map((userId) => admin.firestore().doc(`users/${userId}`).get()));
  return snapshots.flatMap((snapshot) => {
    if (!snapshot.exists) {
      return [];
    }

    const userData = snapshot.data();
    const tokens = uniqueValues(userData?.fcmTokens || []);
    return tokens.map((token) => ({
      userId: snapshot.id,
      token,
    }));
  });
};

const pruneInvalidTokens = async (invalidTokenEntries) => {
  const tokensByUserId = invalidTokenEntries.reduce((accumulator, entry) => {
    accumulator[entry.userId] = accumulator[entry.userId] || [];
    accumulator[entry.userId].push(entry.token);
    return accumulator;
  }, {});

  await Promise.all(
    Object.entries(tokensByUserId).map(([userId, tokens]) =>
      admin.firestore().doc(`users/${userId}`).update({
        fcmTokens: admin.firestore.FieldValue.arrayRemove(...tokens),
      }).catch(() => undefined)
    )
  );
};

const sendPushToUsers = async ({ userIds, title, body, url, type, metadata = {} }) => {
  const uniqueUserIds = uniqueValues(userIds);
  if (uniqueUserIds.length === 0) {
    return { successCount: 0, failureCount: 0 };
  }

  const tokenEntries = await getTokenEntriesForUsers(uniqueUserIds);
  if (tokenEntries.length === 0) {
    return { successCount: 0, failureCount: 0 };
  }

  const data = {
    url,
    type,
    ...Object.entries(metadata).reduce((accumulator, [key, value]) => {
      accumulator[key] = String(value);
      return accumulator;
    }, {}),
  };

  let successCount = 0;
  let failureCount = 0;
  const invalidTokenEntries = [];

  for (const tokenChunk of chunkArray(tokenEntries, 500)) {
    const response = await admin.messaging().sendEachForMulticast({
      tokens: tokenChunk.map((entry) => entry.token),
      notification: {
        title,
        body,
      },
      data,
    });

    successCount += response.successCount;
    failureCount += response.failureCount;

    response.responses
      .map((result, index) => ({ result, entry: tokenChunk[index] }))
      .filter(({ result }) => !result.success)
      .filter(({ result }) => {
        const code = result.error?.code || '';
        return code.includes('registration-token-not-registered') || code.includes('invalid-argument');
      })
      .forEach(({ entry }) => invalidTokenEntries.push(entry));
  }

  if (invalidTokenEntries.length > 0) {
    await pruneInvalidTokens(invalidTokenEntries);
  }

  return {
    successCount,
    failureCount,
  };
};

const sendReportNotificationToStudent = async (classId, studentId) => {
  const userIds = await getRecipientIdsForStudent(classId, studentId);
  return sendPushToUsers({
    userIds,
    title: '📢 Report Generated',
    body: 'Your latest report card is ready.',
    url: await getClassTabUrl(classId, 'reports'),
    type: 'report_generated',
    metadata: { classId, studentId },
  });
};

const sendFeesReminderToStudent = async (classId, studentId) => {
  const userIds = await getRecipientIdsForStudent(classId, studentId);
  return sendPushToUsers({
    userIds,
    title: '💰 Fees Reminder',
    body: 'Your pending fees are due soon.',
    url: await getClassTabUrl(classId, 'fees'),
    type: 'fees_reminder',
    metadata: { classId, studentId },
  });
};

const sendAttendanceUpdateToStudent = async (classId, studentId) => {
  const userIds = await getRecipientIdsForStudent(classId, studentId);
  return sendPushToUsers({
    userIds,
    title: '📊 Attendance Updated',
    body: 'Your attendance has been marked.',
    url: await getClassTabUrl(classId, 'attendance'),
    type: 'attendance_update',
    metadata: { classId, studentId },
  });
};

const sendLectureNotificationToBatch = async (classId, lecture) => {
  const userIds = await getRecipientIdsForLecture(classId, lecture);
  return sendPushToUsers({
    userIds,
    title: '📅 Lecture Scheduled',
    body: lecture.title ? `${lecture.title} has been scheduled.` : 'A new lecture has been scheduled.',
    url: await getClassTabUrl(classId, 'schedule'),
    type: 'lecture_scheduled',
    metadata: {
      classId,
      batchId: lecture.batchId || '',
      lectureId: lecture.id || '',
    },
  });
};

const isFeeDueSoon = (feeData) => {
  if (!feeData || feeData.status === 'paid' || !feeData.dueDate) {
    return false;
  }

  const dueTime = new Date(feeData.dueDate).getTime();
  if (Number.isNaN(dueTime)) {
    return false;
  }

  const remaining = dueTime - Date.now();
  return remaining >= 0 && remaining <= FEE_REMINDER_WINDOW_MS;
};

const shouldSendFeeReminder = (before, after) => {
  if (!isFeeDueSoon(after)) {
    return false;
  }

  if (!before) {
    return true;
  }

  return before.status !== after.status || before.dueDate !== after.dueDate || before.amount !== after.amount;
};

const getAuthenticatedUser = async (request) => {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError('unauthenticated', 'You must be signed in to upgrade a plan.');
  }

  const userSnapshot = await admin.firestore().doc(`users/${uid}`).get();
  if (!userSnapshot.exists) {
    throw new HttpsError('not-found', 'User profile not found.');
  }

  return {
    uid,
    data: userSnapshot.data(),
  };
};

const assertPlanInput = (plan) => {
  if (!['standard', 'pro'].includes(plan)) {
    throw new HttpsError('invalid-argument', 'Unsupported plan selected for payment.');
  }
};

const assertSuperAdmin = async (uid) => {
  const userSnapshot = await admin.firestore().doc(`users/${uid}`).get();
  if (!userSnapshot.exists) {
    throw new HttpsError('not-found', 'User profile not found.');
  }

  const userData = userSnapshot.data();
  if (userData.role !== 'super_admin') {
    throw new HttpsError('permission-denied', 'Only the super admin can perform this action.');
  }

  return userData;
};

const assertClassAdmin = async (uid, classId) => {
  const classSnapshot = await admin.firestore().doc(`classes/${classId}`).get();
  if (!classSnapshot.exists) {
    throw new HttpsError('not-found', 'Class not found.');
  }

  const classData = classSnapshot.data();
  if (classData.adminId !== uid) {
    throw new HttpsError('permission-denied', 'Only the class admin can upgrade the class plan.');
  }

  return classData;
};

const assertAdminPaymentUser = async (uid, classId) => {
  const userData = await getUserDoc(uid);
  if (!userData) {
    throw new HttpsError('not-found', 'User profile not found.');
  }

  if (userData.role !== 'admin') {
    throw new HttpsError('permission-denied', 'Only admin users can perform payments.');
  }

  const classData = await assertClassAdmin(uid, classId);
  return { userData, classData };
};

let cachedRazorpayClient = null;
let cachedRazorpayClientKey = '';

const getRazorpayClient = (keyId, keySecret) =>
  (() => {
    const cacheKey = `${keyId}:${keySecret}`;
    if (!cachedRazorpayClient || cachedRazorpayClientKey !== cacheKey) {
      cachedRazorpayClient = new Razorpay({
        key_id: keyId,
        key_secret: keySecret,
      });
      cachedRazorpayClientKey = cacheKey;
    }

    return cachedRazorpayClient;
  })();

const PAYMENT_INVOICE_STORAGE_PREFIX = 'invoices';

const escapePdfText = (value) =>
  String(value ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)');

const buildInvoicePdfBuffer = ({
  invoiceNumber,
  adminName,
  className,
  plan,
  amount,
  paymentId,
  orderId,
  createdAt,
  companyDetails = COMPANY_DETAILS,
}) => {
  const tax = buildTaxLines(amount);
  const lines = [
    [companyDetails.name, 24],
    ['Tax Invoice', 18],
    [companyDetails.address, 10],
    [companyDetails.gst || COMPANY_DETAILS.gst, 10],
    [''],
    [`Invoice Number: ${invoiceNumber}`],
    [`Admin Name: ${adminName}`],
    [`Class Name: ${className}`],
    [`Plan: ${plan.charAt(0).toUpperCase() + plan.slice(1)}`],
    [`Amount Paid: INR ${(Number(amount) / 100).toFixed(2)}`],
    [`Tax Breakdown: GST on taxable value INR ${(tax.gst / 100).toFixed(2)}`],
    ['Payment Mode: Razorpay'],
    [`Payment ID: ${paymentId}`],
    [`Order ID: ${orderId}`],
    [`Date: ${new Date(createdAt).toLocaleString('en-IN')}`],
    [''],
    ['Generated by TeachFlow', 10],
  ];

  const contentLines = [];
  let currentY = 770;

  lines.forEach((entry, index) => {
    if (entry.length === 0) {
      currentY -= 12;
      return;
    }

    const [text, size = 12] = entry;
    contentLines.push(`BT /F1 ${size} Tf 50 ${currentY} Td (${escapePdfText(text)}) Tj ET`);
    currentY -= index === 0 ? 34 : size >= 18 ? 22 : 18;
  });

  const contentStream = contentLines.join('\n');
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${Buffer.byteLength(contentStream, 'utf8')} >>\nstream\n${contentStream}\nendstream`,
  ];

  const header = '%PDF-1.4\n';
  const bodyParts = [];
  const offsets = [0];
  let offset = Buffer.byteLength(header, 'utf8');

  objects.forEach((object, index) => {
    const serialized = `${index + 1} 0 obj\n${object}\nendobj\n`;
    offsets.push(offset);
    bodyParts.push(serialized);
    offset += Buffer.byteLength(serialized, 'utf8');
  });

  const xrefOffset = offset;
  const xrefEntries = ['0000000000 65535 f '];
  for (let index = 1; index <= objects.length; index += 1) {
    xrefEntries.push(`${String(offsets[index]).padStart(10, '0')} 00000 n `);
  }

  const trailer = [
    'xref',
    `0 ${objects.length + 1}`,
    ...xrefEntries,
    'trailer',
    `<< /Size ${objects.length + 1} /Root 1 0 R >>`,
    'startxref',
    `${xrefOffset}`,
    '%%EOF',
  ].join('\n');

  return Buffer.from(`${header}${bodyParts.join('')}${trailer}`, 'utf8');
};

const uploadInvoicePdf = async ({
  orderId,
  invoiceNumber,
  adminName,
  className,
  plan,
  amount,
  paymentId,
  createdAt,
  companyDetails,
}) => {
  const bucket = admin.storage().bucket();
  const filePath = `${PAYMENT_INVOICE_STORAGE_PREFIX}/${orderId}.pdf`;
  const invoiceBuffer = buildInvoicePdfBuffer({
    invoiceNumber,
    adminName,
    className,
    plan,
    amount,
    paymentId,
    orderId,
    createdAt,
    companyDetails,
  });

  await bucket.file(filePath).save(invoiceBuffer, {
    contentType: 'application/pdf',
    resumable: false,
    metadata: {
      cacheControl: 'private, max-age=0, no-cache, no-store',
    },
  });

  const [signedUrl] = await bucket.file(filePath).getSignedUrl({
    action: 'read',
    expires: '01-01-2500',
  });

  return {
    invoicePath: filePath,
    invoiceUrl: signedUrl,
  };
};

const normalizePlanSettings = (data = {}) => {
  const normalizePlan = (key) => {
    const fallback = DEFAULT_PLAN_SETTINGS[key];
    const plan = data?.[key] || {};
    const features = plan.features || {};

    return {
      name: typeof plan.name === 'string' ? plan.name : fallback.name,
      price: Number.isFinite(plan.price) ? plan.price : fallback.price,
      features: {
        studentsLimit: Number.isFinite(features.studentsLimit) ? features.studentsLimit : fallback.features.studentsLimit,
        teachersLimit: Number.isFinite(features.teachersLimit) ? features.teachersLimit : fallback.features.teachersLimit,
        batchesLimit: Number.isFinite(features.batchesLimit) ? features.batchesLimit : fallback.features.batchesLimit,
        branchesLimit: Number.isFinite(features.branchesLimit) ? features.branchesLimit : fallback.features.branchesLimit,
        branchesEnabled: typeof features.branchesEnabled === 'boolean' ? features.branchesEnabled : fallback.features.branchesEnabled,
        messaging: typeof features.messaging === 'boolean' ? features.messaging : fallback.features.messaging,
        aiReports: typeof features.aiReports === 'boolean' ? features.aiReports : fallback.features.aiReports,
        analytics: typeof features.analytics === 'boolean' ? features.analytics : fallback.features.analytics,
      },
    };
  };

  return {
    free: normalizePlan('free'),
    standard: normalizePlan('standard'),
    pro: normalizePlan('pro'),
  };
};

const getPlanSettings = async () => {
  const snapshot = await admin.firestore().doc(PLAN_SETTINGS_DOC_PATH).get();
  return normalizePlanSettings(snapshot.exists ? snapshot.data() : {});
};

const getPlanAmount = (plan, settings) => {
  return Math.round((settings[plan]?.price || 0) * 100);
};

const getPlanLimits = (plan, settings) => {
  const features = settings[plan]?.features || DEFAULT_PLAN_SETTINGS[plan].features;
  return {
    students: features.studentsLimit,
    teachers: features.teachersLimit,
    batches: features.batchesLimit,
    branches: features.branchesLimit,
  };
};

const getPaymentDocRef = (paymentId) => admin.firestore().doc(`payments/${paymentId}`);

const getBillingSettings = async () => {
  const snapshot = await admin.firestore().doc(BILLING_SETTINGS_DOC_PATH).get();
  const data = snapshot.exists ? snapshot.data() : {};
  return {
    standardSubscriptionPlanId: typeof data.standardSubscriptionPlanId === 'string' ? data.standardSubscriptionPlanId.trim() : '',
    proSubscriptionPlanId: typeof data.proSubscriptionPlanId === 'string' ? data.proSubscriptionPlanId.trim() : '',
    companyName: typeof data.companyName === 'string' && data.companyName.trim() ? data.companyName.trim() : COMPANY_DETAILS.name,
    companyAddress: typeof data.companyAddress === 'string' && data.companyAddress.trim() ? data.companyAddress.trim() : COMPANY_DETAILS.address,
    gstNumber: typeof data.gstNumber === 'string' && data.gstNumber.trim() ? data.gstNumber.trim() : '',
  };
};

const normalizeBillingSettings = (settings = {}) => ({
  standardSubscriptionPlanId:
    typeof settings.standardSubscriptionPlanId === 'string' ? settings.standardSubscriptionPlanId.trim() : '',
  proSubscriptionPlanId: typeof settings.proSubscriptionPlanId === 'string' ? settings.proSubscriptionPlanId.trim() : '',
  companyName: typeof settings.companyName === 'string' && settings.companyName.trim() ? settings.companyName.trim() : COMPANY_DETAILS.name,
  companyAddress:
    typeof settings.companyAddress === 'string' && settings.companyAddress.trim() ? settings.companyAddress.trim() : COMPANY_DETAILS.address,
  gstNumber: typeof settings.gstNumber === 'string' && settings.gstNumber.trim() ? settings.gstNumber.trim() : '',
});

const getSubscriptionPlanId = async (plan) => {
  const billingSettings = await getBillingSettings();
  if (plan === 'standard') {
    return billingSettings.standardSubscriptionPlanId;
  }
  if (plan === 'pro') {
    return billingSettings.proSubscriptionPlanId;
  }
  return '';
};

const toMillis = (value) => {
  if (!value) return NaN;
  if (typeof value === 'number') return value;
  if (typeof value === 'string') return new Date(value).getTime();
  if (typeof value.toMillis === 'function') return value.toMillis();
  if (typeof value.toDate === 'function') return value.toDate().getTime();
  return new Date(value).getTime();
};

const isPaymentOrderExpired = (orderData) => {
  const createdAtMs = toMillis(orderData?.createdAt);
  return Number.isFinite(createdAtMs) && Date.now() - createdAtMs > PAYMENT_EXPIRY_WINDOW_MS;
};

const normalizeFailureReason = (reason) => {
  const value = String(reason || '').toLowerCase();
  if (!value) return PAYMENT_FAILURE_REASONS.unknown;
  if (value.includes('cancel')) return PAYMENT_FAILURE_REASONS.cancelled;
  if (value.includes('signat')) return PAYMENT_FAILURE_REASONS.signature;
  if (value.includes('network')) return PAYMENT_FAILURE_REASONS.network;
  if (value.includes('timeout') || value.includes('expire')) return PAYMENT_FAILURE_REASONS.timedOut;
  return PAYMENT_FAILURE_REASONS.unknown;
};

const allocateInvoiceNumber = async () => {
  const now = new Date();
  const year = now.getFullYear();
  const counterRef = admin.firestore().doc(INVOICE_COUNTER_DOC_PATH);

  const nextSequence = await admin.firestore().runTransaction(async (transaction) => {
    const snapshot = await transaction.get(counterRef);
    const current = snapshot.exists ? snapshot.data() : {};
    const currentYear = Number(current.year) || year;
    const currentSequence = Number(current.sequence) || 0;

    const sequence = currentYear === year ? currentSequence + 1 : 1;
    transaction.set(
      counterRef,
      {
        year,
        sequence,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    return sequence;
  });

  return `INV-${year}-${String(nextSequence).padStart(4, '0')}`;
};

const buildTaxLines = (amount) => {
  const base = Math.max(0, Number(amount) || 0);
  const tax = Math.round(base * 0.18);
  return {
    taxBase: base,
    gst: tax,
    total: base,
  };
};

const isBillingBlocked = (classData) => {
  const blockedUntilMs = toMillis(classData?.blockedUntil);
  return Number.isFinite(blockedUntilMs) && blockedUntilMs > Date.now();
};

const recordBillingFailure = async ({ classRef, classData, reason }) => {
  const now = Date.now();
  const windowStartMs = toMillis(classData?.failedAttemptsWindowStart);
  const withinWindow = Number.isFinite(windowStartMs) && now - windowStartMs <= 10 * 60 * 1000;
  const nextWindowStart = withinWindow ? windowStartMs : now;
  const nextCount = withinWindow ? Number(classData?.failedAttemptsCount || 0) + 1 : 1;
  const shouldBlock = nextCount > 5;
  const blockedUntil = shouldBlock ? new Date(now + 15 * 60 * 1000).toISOString() : null;

  await classRef.set(
    {
      failedAttemptsCount: nextCount,
      failedAttemptsWindowStart: new Date(nextWindowStart).toISOString(),
      blockedUntil,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  await classRef.collection('billingEvents').add({
    type: 'failure',
    reason,
    failedAttemptsCount: nextCount,
    blockedUntil,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  return {
    blockedUntil,
    failedAttemptsCount: nextCount,
  };
};

const ensureBillingIsNotBlocked = (classData) => {
  const blockedUntilMs = toMillis(classData?.blockedUntil);
  if (Number.isFinite(blockedUntilMs) && blockedUntilMs > Date.now()) {
    throw new HttpsError('resource-exhausted', 'Too many failed attempts. Please try again later.');
  }
};

const finalizeSuccessfulBilling = async ({
  classId,
  adminId,
  plan,
  paymentKey,
  orderId,
  paymentId,
  signature,
  orderData,
  classData,
  source,
  subscriptionId,
}) => {
  const planSettings = await getPlanSettings();
  const billingSettings = await getBillingSettings();
  const classRef = admin.firestore().doc(`classes/${classId}`);
  const paymentRef = admin.firestore().doc(`payments/${paymentKey}`);
  const orderRef = admin.firestore().doc(`paymentOrders/${orderId || paymentKey}`);
  const paymentSnapshot = await paymentRef.get();

  if (paymentSnapshot.exists && paymentSnapshot.data()?.status === 'paid') {
    return {
      success: true,
      invoiceUrl: paymentSnapshot.data()?.invoiceUrl,
      invoiceNumber: paymentSnapshot.data()?.invoiceNumber,
      planExpiry: paymentSnapshot.data()?.planExpiry,
    };
  }

  const currentClassData = classData || (await classRef.get()).data() || {};
  const currentExpiryMs = toMillis(currentClassData?.planExpiry);
  const nextExpiryBase = Number.isFinite(currentExpiryMs) && currentExpiryMs > Date.now() ? currentExpiryMs : Date.now();
  const planExpiry = admin.firestore.Timestamp.fromMillis(nextExpiryBase + 30 * 24 * 60 * 60 * 1000);
  const invoiceNumber = await allocateInvoiceNumber();
  const adminUserData = await getUserDoc(adminId);
  let invoiceUrl = '';

  await classRef.update({
    plan,
    planExpiry,
    isActive: true,
    subscriptionId: subscriptionId || currentClassData.subscriptionId || null,
    autoRenew: Boolean(subscriptionId || currentClassData.autoRenew),
    subscriptionStatus: subscriptionId ? 'active' : currentClassData.subscriptionStatus || null,
    lastPaymentDate: admin.firestore.FieldValue.serverTimestamp(),
    nextBillingDate: admin.firestore.Timestamp.fromMillis(planExpiry.toMillis()),
    limits: getPlanLimits(plan, planSettings),
    failedAttemptsCount: 0,
    failedAttemptsWindowStart: null,
    blockedUntil: null,
    settings: {
      ...(currentClassData?.settings || {}),
      aiEnabled: Boolean(planSettings[plan]?.features?.aiReports),
    },
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  await orderRef.set(
    {
      classId,
      adminId,
      plan,
      paymentId,
      signature,
      subscriptionId: subscriptionId || null,
      subscriptionStatus: subscriptionId ? 'active' : currentClassData.subscriptionStatus || null,
      status: 'paid',
      verifiedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  await paymentRef.set(
    {
      classId,
      adminId,
      plan,
      amount: orderData.amount,
      currency: orderData.currency ?? 'INR',
      orderId: orderId || paymentKey,
      paymentId,
      subscriptionId: subscriptionId || null,
      subscriptionStatus: subscriptionId ? 'active' : currentClassData.subscriptionStatus || null,
      signature,
      status: 'paid',
      invoiceNumber,
      planExpiry: planExpiry.toDate().toISOString(),
      paymentMode: 'Razorpay',
      verifiedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  try {
    const invoice = await uploadInvoicePdf({
      orderId: orderId || paymentKey,
      invoiceNumber,
      adminName: adminUserData?.name || 'Admin',
      className: currentClassData?.name || classId,
      plan,
      amount: orderData.amount,
      paymentId,
      createdAt: new Date().toISOString(),
      companyDetails: {
        name: billingSettings.companyName || COMPANY_DETAILS.name,
        address: billingSettings.companyAddress || COMPANY_DETAILS.address,
        gst: billingSettings.gstNumber ? `GST: ${billingSettings.gstNumber}` : COMPANY_DETAILS.gst,
      },
    });
    invoiceUrl = invoice.invoiceUrl;

    await paymentRef.set(
      {
        invoicePath: invoice.invoicePath,
        invoiceUrl: invoice.invoiceUrl,
        invoiceGeneratedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
  } catch (error) {
    await paymentRef.set(
      {
        invoiceFailureReason: error instanceof Error ? error.message : 'Invoice generation failed.',
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
  }

  await admin.firestore().collection('growthEvents').add({
    type: 'upgrade',
    source,
    plan,
    classId,
    userId: adminId,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  return {
    success: true,
    plan,
    planExpiry: planExpiry.toDate().toISOString(),
    invoiceNumber,
    invoiceUrl,
  };
};

exports.createRazorpayOrder = onCall(
  { ...PAYMENT_FUNCTION_OPTIONS, secrets: [razorpayKeyId, razorpayKeySecret] },
  async (request) => {
    const classId = String(request.data?.classId ?? '').trim();
    const adminId = String(request.data?.adminId ?? '').trim();
    const plan = String(request.data?.plan ?? '').trim().toLowerCase();

    if (!classId || !adminId) {
      throw new HttpsError('invalid-argument', 'Class ID and admin ID are required.');
    }

    assertPlanInput(plan);

    const { uid } = await getAuthenticatedUser(request);
    if (uid !== adminId) {
      throw new HttpsError('permission-denied', 'Admin ID does not match the authenticated user.');
    }

    const { classData } = await assertAdminPaymentUser(uid, classId);
    ensureBillingIsNotBlocked(classData);

    const reusableOrderSnapshots = await Promise.all(
      ['created', 'attempted'].map((status) =>
        admin
          .firestore()
          .collection('paymentOrders')
          .where('classId', '==', classId)
          .where('plan', '==', plan)
          .where('adminId', '==', uid)
          .where('status', '==', status)
          .limit(1)
          .get()
      )
    );

    const reusableOrderDoc = reusableOrderSnapshots.find((snapshot) => !snapshot.empty)?.docs[0];
    if (reusableOrderDoc) {
      const reusableOrder = reusableOrderDoc.data();
      if (!isPaymentOrderExpired(reusableOrder)) {
        return {
          key: razorpayKeyId.value(),
          orderId: reusableOrder.orderId ?? reusableOrderDoc.id,
          amount: reusableOrder.amount,
          currency: reusableOrder.currency ?? 'INR',
          plan,
        };
      }

      await reusableOrderDoc.ref.set(
        {
          status: 'expired',
          failureReason: PAYMENT_FAILURE_REASONS.timedOut,
          expiredAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    }

    const keyId = razorpayKeyId.value();
    const keySecret = razorpayKeySecret.value();
    const razorpay = getRazorpayClient(keyId, keySecret);
    const planSettings = await getPlanSettings();
    const amount = getPlanAmount(plan, planSettings);

    const order = await razorpay.orders.create({
      amount,
      currency: 'INR',
      receipt: `teachflow_${classId}_${Date.now()}`,
      notes: {
        classId,
        plan,
        adminId: uid,
      },
    });

    const writeData = {
      classId,
      adminId: uid,
      plan,
      amount,
      currency: order.currency,
      orderId: order.id,
      status: 'created',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      autoRenew: false,
    };

    await admin.firestore().doc(`paymentOrders/${order.id}`).set({ ...writeData });
    await admin.firestore().doc(`payments/${order.id}`).set({ ...writeData });

    return {
      key: keyId,
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      plan,
    };
  }
);

exports.markRazorpayPaymentAttempted = onCall(
  { ...PAYMENT_FUNCTION_OPTIONS, secrets: [razorpayKeyId, razorpayKeySecret] },
  async (request) => {
    const classId = String(request.data?.classId ?? '').trim();
    const adminId = String(request.data?.adminId ?? '').trim();
    const plan = String(request.data?.plan ?? '').trim().toLowerCase();
    const orderId = String(request.data?.orderId ?? '').trim();

    if (!classId || !adminId || !plan || !orderId) {
      throw new HttpsError('invalid-argument', 'Attempt payload is incomplete.');
    }

    assertPlanInput(plan);

    const { uid } = await getAuthenticatedUser(request);
    if (uid !== adminId) {
      throw new HttpsError('permission-denied', 'Admin ID does not match the authenticated user.');
    }

    const { classData } = await assertAdminPaymentUser(uid, classId);
    ensureBillingIsNotBlocked(classData);

    const paymentRef = getPaymentDocRef(orderId);
    const paymentSnapshot = await paymentRef.get();
    if (paymentSnapshot.exists && paymentSnapshot.data()?.status === 'paid') {
      return { success: true, status: 'paid' };
    }

    const orderRef = admin.firestore().doc(`paymentOrders/${orderId}`);
    const orderSnapshot = await orderRef.get();
    if (!orderSnapshot.exists) {
      throw new HttpsError('not-found', 'Payment order not found.');
    }

    const orderData = orderSnapshot.data();
    if (orderData.classId !== classId || orderData.plan !== plan || (orderData.adminId || orderData.userId || '') !== uid) {
      throw new HttpsError('permission-denied', 'Payment order does not match this class upgrade request.');
    }

    if (isPaymentOrderExpired(orderData)) {
      await orderRef.set(
        {
          status: 'expired',
          failureReason: PAYMENT_FAILURE_REASONS.timedOut,
          expiredAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
      await paymentRef.set(
        {
          status: 'expired',
          failureReason: PAYMENT_FAILURE_REASONS.timedOut,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
      throw new HttpsError('deadline-exceeded', 'Payment order has expired.');
    }

    await orderRef.set(
      {
        status: 'attempted',
        attemptedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    await paymentRef.set(
      {
        classId,
        adminId: uid,
        plan,
        amount: orderData.amount,
        currency: orderData.currency ?? 'INR',
        orderId,
        status: 'attempted',
        attemptedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    return { success: true, status: 'attempted' };
  }
);

exports.verifyRazorpayPayment = onCall(
  { ...PAYMENT_FUNCTION_OPTIONS, secrets: [razorpayKeyId, razorpayKeySecret] },
  async (request) => {
    const classId = String(request.data?.classId ?? '').trim();
    const adminId = String(request.data?.adminId ?? '').trim();
    const plan = String(request.data?.plan ?? '').trim().toLowerCase();
    const orderId = String(request.data?.razorpay_order_id ?? '').trim();
    const paymentId = String(request.data?.razorpay_payment_id ?? '').trim();
    const signature = String(request.data?.razorpay_signature ?? '').trim();

    if (!classId || !adminId || !plan || !orderId || !paymentId || !signature) {
      throw new HttpsError('invalid-argument', 'Payment verification payload is incomplete.');
    }

    assertPlanInput(plan);

    const { uid } = await getAuthenticatedUser(request);
    if (uid !== adminId) {
      throw new HttpsError('permission-denied', 'Admin ID does not match the authenticated user.');
    }

    const { classData } = await assertAdminPaymentUser(uid, classId);
    ensureBillingIsNotBlocked(classData);

    const orderRef = admin.firestore().doc(`paymentOrders/${orderId}`);
    const orderSnapshot = await orderRef.get();
    if (!orderSnapshot.exists) {
      throw new HttpsError('not-found', 'Payment order not found.');
    }

    const orderData = orderSnapshot.data();
    const orderOwnerId = orderData.adminId || orderData.userId || '';
    if (orderOwnerId !== uid || orderData.classId !== classId || orderData.plan !== plan) {
      throw new HttpsError('permission-denied', 'Payment order does not match this class upgrade request.');
    }

    const paymentRef = getPaymentDocRef(orderId);
    const paymentSnapshot = await paymentRef.get();
    const paymentData = paymentSnapshot.exists ? paymentSnapshot.data() : null;
    if (paymentData?.status === 'paid') {
      return {
        success: true,
        plan,
        planExpiry: paymentData.planExpiry,
        invoiceUrl: paymentData.invoiceUrl,
      };
    }

    if (orderData.status !== 'paid' && isPaymentOrderExpired(orderData)) {
      await orderRef.set(
        {
          status: 'expired',
          failureReason: PAYMENT_FAILURE_REASONS.timedOut,
          expiredAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

      await paymentRef.set(
        {
          status: 'expired',
          failureReason: PAYMENT_FAILURE_REASONS.timedOut,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

      throw new HttpsError('deadline-exceeded', 'Payment order has expired.');
    }

    const expectedSignature = crypto
      .createHmac('sha256', razorpayKeySecret.value())
      .update(`${orderId}|${paymentId}`)
      .digest('hex');

    if (expectedSignature !== signature) {
      await orderRef.set(
        {
          status: 'signature_mismatch',
          paymentId,
          signature,
          failureReason: PAYMENT_FAILURE_REASONS.signature,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

      await paymentRef.set(
        {
          status: 'signature_mismatch',
          paymentId,
          signature,
          failureReason: PAYMENT_FAILURE_REASONS.signature,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

      throw new HttpsError('permission-denied', 'Payment signature verification failed.');
    }

    const result = await finalizeSuccessfulBilling({
      classId,
      adminId: uid,
      plan,
      paymentKey: orderId,
      orderId,
      paymentId,
      signature,
      orderData,
      classData,
      source: 'payment_success',
    });

    return result;
  }
);

exports.markRazorpayPaymentFailed = onCall(
  { ...PAYMENT_FUNCTION_OPTIONS, secrets: [razorpayKeyId, razorpayKeySecret] },
  async (request) => {
    const classId = String(request.data?.classId ?? '').trim();
    const adminId = String(request.data?.adminId ?? '').trim();
    const plan = String(request.data?.plan ?? '').trim().toLowerCase();
    const orderId = String(request.data?.orderId ?? '').trim();
    const reason = normalizeFailureReason(String(request.data?.reason ?? '').trim());
    const paymentId = String(request.data?.paymentId ?? '').trim();

    if (!classId || !adminId || !plan || !orderId) {
      throw new HttpsError('invalid-argument', 'Failure payload is incomplete.');
    }

    assertPlanInput(plan);

    const { uid } = await getAuthenticatedUser(request);
    if (uid !== adminId) {
      throw new HttpsError('permission-denied', 'Admin ID does not match the authenticated user.');
    }

    const { classData } = await assertAdminPaymentUser(uid, classId);
    ensureBillingIsNotBlocked(classData);

    const orderRef = admin.firestore().doc(`paymentOrders/${orderId}`);
    const orderSnapshot = await orderRef.get();
    const orderData = orderSnapshot.exists ? orderSnapshot.data() : {};

    if (orderData.status === 'paid') {
      return { success: true, status: 'paid' };
    }

    await orderRef.set(
      {
        orderId,
        classId,
        adminId: uid,
        plan,
        amount: orderData.amount ?? 0,
        currency: orderData.currency ?? 'INR',
        paymentId: paymentId || null,
        status: 'failed',
        failureReason: reason,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        createdAt: orderData.createdAt || admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    await admin.firestore().doc(`payments/${orderId}`).set(
      {
        orderId,
        classId,
        adminId: uid,
        plan,
        amount: orderData.amount ?? 0,
        currency: orderData.currency ?? 'INR',
        paymentId: paymentId || null,
        status: 'failed',
        failureReason: reason,
        createdAt: orderData.createdAt || admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    return { success: true, status: 'failed' };
  }
);

exports.superAdminManagePayment = onCall(
  { ...PAYMENT_FUNCTION_OPTIONS, secrets: [razorpayKeyId, razorpayKeySecret] },
  async (request) => {
    const paymentId = String(request.data?.paymentId ?? '').trim();
    const action = String(request.data?.action ?? '').trim().toLowerCase();

    if (!paymentId || !['refund', 'mark_failed', 'retry'].includes(action)) {
      throw new HttpsError('invalid-argument', 'Payment action payload is invalid.');
    }

    const { uid } = await getAuthenticatedUser(request);
    await assertSuperAdmin(uid);

    const paymentRef = admin.firestore().doc(`payments/${paymentId}`);
    const paymentSnapshot = await paymentRef.get();
    if (!paymentSnapshot.exists) {
      throw new HttpsError('not-found', 'Payment record not found.');
    }

    const payment = paymentSnapshot.data();
    const paymentOwnerId = payment.adminId || payment.userId;

    if (action === 'mark_failed') {
      await paymentRef.set(
        {
          status: 'failed',
          failureReason: 'Marked failed by super admin.',
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

      await admin.firestore().doc(`paymentOrders/${payment.orderId || paymentId}`).set(
        {
          status: 'failed',
          failureReason: 'Marked failed by super admin.',
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

      return { success: true, action };
    }

    if (action === 'refund') {
      if (!payment.paymentId) {
        throw new HttpsError('failed-precondition', 'This payment does not have a verified Razorpay payment ID yet.');
      }

      const razorpay = getRazorpayClient(razorpayKeyId.value(), razorpayKeySecret.value());
      const refund = await razorpay.payments.refund(payment.paymentId, {
        amount: payment.amount,
        notes: {
          paymentId,
          classId: payment.classId,
        },
      });

      await paymentRef.set(
        {
          status: 'refunded',
          refundId: refund.id,
          refundedAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

      return { success: true, action, refundId: refund.id };
    }

    const planSettings = await getPlanSettings();
    const amount = getPlanAmount(payment.plan, planSettings);
    const razorpay = getRazorpayClient(razorpayKeyId.value(), razorpayKeySecret.value());
    const nextOrder = await razorpay.orders.create({
      amount,
      currency: 'INR',
      receipt: `teachflow_retry_${payment.classId}_${Date.now()}`,
      notes: {
        classId: payment.classId,
        plan: payment.plan,
        adminId: paymentOwnerId || '',
        retriedFrom: paymentId,
      },
    });

    await admin.firestore().doc(`payments/${paymentId}`).set(
      {
        status: 'retry_requested',
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    await admin.firestore().doc(`paymentOrders/${nextOrder.id}`).set({
      classId: payment.classId,
      plan: payment.plan,
      adminId: paymentOwnerId || '',
      amount,
      currency: 'INR',
      orderId: nextOrder.id,
      status: 'created',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    await admin.firestore().doc(`payments/${nextOrder.id}`).set({
      classId: payment.classId,
      plan: payment.plan,
      adminId: paymentOwnerId || '',
      amount,
      currency: 'INR',
      orderId: nextOrder.id,
      status: 'created',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    return { success: true, action, newPaymentId: nextOrder.id };
  }
);

exports.getAdminBillingOverview = onCall(BILLING_FUNCTION_OPTIONS, async (request) => {
  const classId = String(request.data?.classId ?? '').trim();
  if (!classId) {
    throw new HttpsError('invalid-argument', 'Class ID is required.');
  }

  const { uid } = await getAuthenticatedUser(request);
  const { classData } = await assertAdminPaymentUser(uid, classId);
  ensureBillingIsNotBlocked(classData);

  const paymentsSnapshot = await admin
    .firestore()
    .collection('payments')
    .where('classId', '==', classId)
    .limit(50)
    .get();

  const payments = paymentsSnapshot.docs
    .map((docSnapshot) => ({
      id: docSnapshot.id,
      ...docSnapshot.data(),
    }))
    .sort((left, right) => toMillis(right.createdAt) - toMillis(left.createdAt));

  return {
    class: {
      id: classId,
      name: classData.name || classId,
      plan: classData.plan || 'free',
      planExpiry: classData.planExpiry || null,
      nextBillingDate: classData.nextBillingDate || null,
      autoRenew: Boolean(classData.autoRenew),
      subscriptionId: classData.subscriptionId || null,
      subscriptionStatus: classData.subscriptionStatus || null,
      failedAttemptsCount: Number(classData.failedAttemptsCount || 0),
      blockedUntil: classData.blockedUntil || null,
    },
    billingSettings: await getBillingSettings(),
    payments,
  };
});

exports.getBillingSettings = onCall(BILLING_FUNCTION_OPTIONS, async (request) => {
  const { uid } = await getAuthenticatedUser(request);
  await assertSuperAdmin(uid);
  return getBillingSettings();
});

exports.updateBillingSettings = onCall(BILLING_FUNCTION_OPTIONS, async (request) => {
  const { uid } = await getAuthenticatedUser(request);
  await assertSuperAdmin(uid);

  const current = await getBillingSettings();
  const nextSettings = normalizeBillingSettings(request.data || {});

  await admin.firestore().doc(BILLING_SETTINGS_DOC_PATH).set(
    {
      ...current,
      ...nextSettings,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedBy: uid,
    },
    { merge: true }
  );

  return {
    success: true,
    billingSettings: {
      ...current,
      ...nextSettings,
    },
  };
});

exports.createSubscription = onCall(
  { ...BILLING_FUNCTION_OPTIONS, secrets: [razorpayKeyId, razorpayKeySecret] },
  async (request) => {
    const classId = String(request.data?.classId ?? '').trim();
    const adminId = String(request.data?.adminId ?? '').trim();

    if (!classId || !adminId) {
      throw new HttpsError('invalid-argument', 'Class ID and admin ID are required.');
    }

    const { uid } = await getAuthenticatedUser(request);
    if (uid !== adminId) {
      throw new HttpsError('permission-denied', 'Admin ID does not match the authenticated user.');
    }

    const { classData } = await assertAdminPaymentUser(uid, classId);
    ensureBillingIsNotBlocked(classData);

    if (classData.plan === 'free') {
      throw new HttpsError('failed-precondition', 'Auto-pay is only available for paid plans.');
    }

    const subscriptionPlanId = await getSubscriptionPlanId(classData.plan);
    if (!subscriptionPlanId) {
      throw new HttpsError('failed-precondition', 'Subscription plan ID is not configured yet.');
    }

    if (classData.subscriptionId && classData.autoRenew) {
      return {
        success: true,
        subscriptionId: classData.subscriptionId,
        shortUrl: null,
      };
    }

    const planSettings = await getPlanSettings();
    const razorpay = getRazorpayClient(razorpayKeyId.value(), razorpayKeySecret.value());
    const subscription = await razorpay.subscriptions.create({
      plan_id: subscriptionPlanId,
      total_count: 1200,
      customer_notify: 1,
      quantity: 1,
      notes: {
        classId,
        adminId: uid,
        plan: classData.plan,
      },
    });

    await admin.firestore().doc(`classes/${classId}`).set(
      {
        subscriptionId: subscription.id,
        autoRenew: true,
        subscriptionStatus: subscription.status || 'created',
        nextBillingDate: classData.nextBillingDate || admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    await admin.firestore().doc(`paymentOrders/${subscription.id}`).set(
      {
        classId,
        adminId: uid,
        plan: classData.plan,
        amount: Math.round((planSettings[classData.plan]?.price || 0) * 100),
        currency: 'INR',
        orderId: subscription.id,
        subscriptionId: subscription.id,
        subscriptionStatus: subscription.status || 'created',
        status: 'created',
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    return {
      success: true,
      subscriptionId: subscription.id,
      key: razorpayKeyId.value(),
      shortUrl: subscription.short_url || null,
      plan: classData.plan,
    };
  }
);

exports.cancelSubscription = onCall(
  { ...BILLING_FUNCTION_OPTIONS, secrets: [razorpayKeyId, razorpayKeySecret] },
  async (request) => {
    const classId = String(request.data?.classId ?? '').trim();
    const adminId = String(request.data?.adminId ?? '').trim();
    const subscriptionId = String(request.data?.subscriptionId ?? '').trim();

    if (!classId || !adminId || !subscriptionId) {
      throw new HttpsError('invalid-argument', 'Class ID, admin ID, and subscription ID are required.');
    }

    const { uid } = await getAuthenticatedUser(request);
    if (uid !== adminId) {
      throw new HttpsError('permission-denied', 'Admin ID does not match the authenticated user.');
    }

    const { classData } = await assertAdminPaymentUser(uid, classId);
    const razorpay = getRazorpayClient(razorpayKeyId.value(), razorpayKeySecret.value());
    await razorpay.subscriptions.cancel(subscriptionId, { cancel_at_cycle_end: 0 });

    await admin.firestore().doc(`classes/${classId}`).set(
      {
        autoRenew: false,
        subscriptionStatus: 'cancelled',
        subscriptionId,
        nextBillingDate: null,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    await admin.firestore().doc(`paymentOrders/${subscriptionId}`).set(
      {
        status: 'cancelled',
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    return {
      success: true,
      subscriptionId,
      autoRenew: false,
    };
  }
);

exports.handleRazorpayWebhook = onRequest(
  { ...PAYMENT_FUNCTION_OPTIONS, secrets: [razorpayWebhookSecret, razorpayKeySecret] },
  async (request, response) => {
    try {
      if (request.method !== 'POST') {
        response.status(405).send('Method not allowed');
        return;
      }

      const webhookSecret = razorpayWebhookSecret.value() || '';
      if (!webhookSecret) {
        response.status(500).send('Webhook secret is not configured.');
        return;
      }

      const signature = String(request.headers['x-razorpay-signature'] ?? '');
      const expectedSignature = crypto
        .createHmac('sha256', webhookSecret)
        .update(request.rawBody)
        .digest('hex');

      if (signature !== expectedSignature) {
        response.status(401).send('Invalid signature');
        return;
      }

      const payload = JSON.parse(request.rawBody.toString('utf8'));
      const event = String(payload.event || '');
      const entity = payload.payload || {};
      const paymentEntity = entity.payment?.entity || {};
      const subscriptionEntity = entity.subscription?.entity || {};

      const orderId = String(paymentEntity.order_id || paymentEntity.orderId || paymentEntity.subscription_id || paymentEntity.id || '').trim();
      const paymentId = String(paymentEntity.id || '').trim();
      const subscriptionId = String(subscriptionEntity.id || paymentEntity.subscription_id || '').trim();
      const classId = String(paymentEntity.notes?.classId || subscriptionEntity.notes?.classId || '').trim();
      const adminId = String(paymentEntity.notes?.adminId || subscriptionEntity.notes?.adminId || '').trim();
      const plan = String(paymentEntity.notes?.plan || subscriptionEntity.notes?.plan || '').trim().toLowerCase();
      const classRef = classId ? admin.firestore().doc(`classes/${classId}`) : null;
      const classSnapshot = classRef ? await classRef.get() : null;
      const classData = classSnapshot?.exists ? classSnapshot.data() : {};
      const paymentKey = orderId || paymentId || subscriptionId;
      const paymentRef = paymentKey ? admin.firestore().doc(`payments/${paymentKey}`) : null;
      const orderRef = paymentKey ? admin.firestore().doc(`paymentOrders/${paymentKey}`) : null;

      const handleFailure = async (reason) => {
        if (classRef) {
          await recordBillingFailure({ classRef, classData, reason });
        }

        if (paymentRef) {
          await paymentRef.set(
            {
              classId,
              adminId,
              plan,
              orderId: paymentKey,
              paymentId: paymentId || null,
              subscriptionId: subscriptionId || null,
              status: 'failed',
              failureReason: reason,
              updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            },
            { merge: true }
          );
        }

        if (orderRef) {
          await orderRef.set(
            {
              status: 'failed',
              failureReason: reason,
              paymentId: paymentId || null,
              updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            },
            { merge: true }
          );
        }
      };

      if (event === 'payment.failed') {
        const failureReason = normalizeFailureReason(
          paymentEntity.error_reason || paymentEntity.error_description || paymentEntity.error_source || paymentEntity.reason || 'failed'
        );
        await handleFailure(failureReason);
        response.status(200).json({ received: true });
        return;
      }

      if (event === 'payment.captured' || event === 'subscription.charged') {
        if (!classId || !adminId || !plan || !paymentKey || !paymentId) {
          response.status(200).json({ received: true, skipped: true });
          return;
        }

        const razorpay = getRazorpayClient(razorpayKeyId.value(), razorpayKeySecret.value());
        const fetchedPayment = paymentId ? await razorpay.payments.fetch(paymentId).catch(() => null) : null;
        const orderData = {
          amount: paymentEntity.amount || 0,
          currency: paymentEntity.currency || fetchedPayment?.currency || 'INR',
        };

        await finalizeSuccessfulBilling({
          classId,
          adminId,
          plan,
          paymentKey,
          orderId: paymentKey,
          paymentId,
          signature: String(request.headers['x-razorpay-signature'] ?? ''),
          orderData,
          classData,
          source: event,
          subscriptionId: subscriptionId || null,
        });

        response.status(200).json({ received: true });
        return;
      }

      if (event === 'subscription.activated') {
        if (classRef) {
          await classRef.set(
            {
              subscriptionId: subscriptionId || null,
              autoRenew: true,
              subscriptionStatus: 'active',
              nextBillingDate: classData?.nextBillingDate || admin.firestore.FieldValue.serverTimestamp(),
              updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            },
            { merge: true }
          );
        }
        response.status(200).json({ received: true });
        return;
      }

      if (event === 'subscription.cancelled') {
        if (classRef) {
          await classRef.set(
            {
              subscriptionId: subscriptionId || null,
              autoRenew: false,
              subscriptionStatus: 'cancelled',
              nextBillingDate: null,
              updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            },
            { merge: true }
          );
        }
        response.status(200).json({ received: true });
        return;
      }

      response.status(200).json({ received: true, ignored: true });
    } catch (error) {
      console.error('Razorpay webhook failed', error);
      response.status(500).send('Webhook processing failed');
    }
  }
);

exports.syncBillingState = onSchedule(
  {
    ...BILLING_FUNCTION_OPTIONS,
    schedule: '0 3 * * *',
    timeZone: 'Asia/Kolkata',
    secrets: [razorpayKeyId, razorpayKeySecret],
  },
  async () => {
    const firestore = admin.firestore();
    const now = Date.now();

    const pendingOrdersSnapshot = await firestore.collection('paymentOrders').get();
    await Promise.all(
      pendingOrdersSnapshot.docs.map(async (docSnapshot) => {
        const orderData = docSnapshot.data();
        if (!['created', 'attempted'].includes(orderData.status)) {
          return;
        }

        if (!isPaymentOrderExpired(orderData)) {
          return;
        }

        await docSnapshot.ref.set(
          {
            status: 'expired',
            failureReason: PAYMENT_FAILURE_REASONS.timedOut,
            expiredAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          },
          { merge: true }
        );

        await firestore.doc(`payments/${docSnapshot.id}`).set(
          {
            status: 'expired',
            failureReason: PAYMENT_FAILURE_REASONS.timedOut,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          },
          { merge: true }
        );
      })
    );

    const classSnapshot = await firestore.collection('classes').get();
    const planSettings = await getPlanSettings();
    const razorpay = getRazorpayClient(razorpayKeyId.value(), razorpayKeySecret.value());

    await Promise.all(
      classSnapshot.docs.map(async (classDoc) => {
        const classData = classDoc.data();
        if (!classData?.autoRenew || classData.plan === 'free' || !classData.adminId || !classData.nextBillingDate) {
          return;
        }

        if (classData.subscriptionId) {
          return;
        }

        const nextBillingMs = toMillis(classData.nextBillingDate);
        if (!Number.isFinite(nextBillingMs) || nextBillingMs > now) {
          return;
        }

        const reusableOrders = await Promise.all(
          ['created', 'attempted'].map((status) =>
            firestore
              .collection('paymentOrders')
              .where('classId', '==', classDoc.id)
              .where('plan', '==', classData.plan)
              .where('adminId', '==', classData.adminId)
              .where('status', '==', status)
              .limit(1)
              .get()
          )
        );

        const existingOrderDoc = reusableOrders.find((snapshot) => !snapshot.empty)?.docs[0];
        if (existingOrderDoc && !isPaymentOrderExpired(existingOrderDoc.data())) {
          return;
        }

        if (existingOrderDoc) {
          await existingOrderDoc.ref.set(
            {
              status: 'expired',
              failureReason: PAYMENT_FAILURE_REASONS.timedOut,
              expiredAt: admin.firestore.FieldValue.serverTimestamp(),
              updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            },
            { merge: true }
          );
        }

        const amount = getPlanAmount(classData.plan, planSettings);
        const order = await razorpay.orders.create({
          amount,
          currency: 'INR',
          receipt: `teachflow_renewal_${classDoc.id}_${Date.now()}`,
          notes: {
            classId: classDoc.id,
            plan: classData.plan,
            adminId: classData.adminId,
            renewal: 'true',
          },
        });

        const writeData = {
          classId: classDoc.id,
          adminId: classData.adminId,
          plan: classData.plan,
          amount,
          currency: order.currency,
          orderId: order.id,
          status: 'created',
          renewalSource: 'scheduler',
          autoRenew: true,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        };

        await firestore.doc(`paymentOrders/${order.id}`).set({ ...writeData });
        await firestore.doc(`payments/${order.id}`).set({ ...writeData });

        await sendPushToUsers({
          userIds: [classData.adminId],
          title: 'TeachFlow Renewal Ready',
          body: `Auto-renewal order created for ${classData.name || classDoc.id}.`,
          url: await getClassTabUrl(classDoc.id, 'pricing'),
          type: 'subscription_renewal',
          metadata: {
            classId: classDoc.id,
            orderId: order.id,
          },
        });
      })
    );
  }
);

exports.sendReportNotification = onCall(SYSTEM_FUNCTION_OPTIONS, async (request) => {
  const classId = String(request.data?.classId ?? '').trim();
  const studentId = String(request.data?.studentId ?? '').trim();

  if (!classId || !studentId) {
    throw new HttpsError('invalid-argument', 'classId and studentId are required.');
  }

  const { uid, data } = await getAuthenticatedUser(request);
  if (data.role !== 'super_admin') {
    await assertClassAdmin(uid, classId);
  }

  return sendReportNotificationToStudent(classId, studentId);
});

exports.sendFeesReminder = onCall(SYSTEM_FUNCTION_OPTIONS, async (request) => {
  const classId = String(request.data?.classId ?? '').trim();
  const studentId = String(request.data?.studentId ?? '').trim();

  if (!classId || !studentId) {
    throw new HttpsError('invalid-argument', 'classId and studentId are required.');
  }

  const { uid, data } = await getAuthenticatedUser(request);
  if (data.role !== 'super_admin') {
    await assertClassAdmin(uid, classId);
  }

  return sendFeesReminderToStudent(classId, studentId);
});

exports.sendAttendanceUpdate = onCall(SYSTEM_FUNCTION_OPTIONS, async (request) => {
  const classId = String(request.data?.classId ?? '').trim();
  const studentId = String(request.data?.studentId ?? '').trim();

  if (!classId || !studentId) {
    throw new HttpsError('invalid-argument', 'classId and studentId are required.');
  }

  const { uid, data } = await getAuthenticatedUser(request);
  if (data.role !== 'super_admin') {
    await assertClassAdmin(uid, classId);
  }

  return sendAttendanceUpdateToStudent(classId, studentId);
});

exports.sendLectureNotification = onCall(SYSTEM_FUNCTION_OPTIONS, async (request) => {
  const classId = String(request.data?.classId ?? '').trim();
  const lectureId = String(request.data?.lectureId ?? '').trim();

  if (!classId || !lectureId) {
    throw new HttpsError('invalid-argument', 'classId and lectureId are required.');
  }

  const { uid, data } = await getAuthenticatedUser(request);
  if (data.role !== 'super_admin') {
    await assertClassAdmin(uid, classId);
  }

  const lectureSnapshot = await admin.firestore().doc(`classes/${classId}/lectures/${lectureId}`).get();
  if (!lectureSnapshot.exists) {
    throw new HttpsError('not-found', 'Lecture not found.');
  }

  return sendLectureNotificationToBatch(classId, {
    id: lectureSnapshot.id,
    ...lectureSnapshot.data(),
  });
});

exports.onReportCreated = onDocumentCreated(
  { ...SYSTEM_FUNCTION_OPTIONS },
  'reports/{reportId}',
  async (event) => {
  const reportData = event.data?.data();
  if (!reportData?.classId || !reportData?.studentId) {
    return;
  }

  await sendReportNotificationToStudent(reportData.classId, reportData.studentId);
  }
);

exports.onFeeCreated = onDocumentCreated(
  { ...SYSTEM_FUNCTION_OPTIONS },
  'classes/{classId}/fees/{feeId}',
  async (event) => {
  const feeData = event.data?.data();
  const classId = event.params.classId;

  if (!feeData?.studentId || !shouldSendFeeReminder(null, feeData)) {
    return;
  }

  await sendFeesReminderToStudent(classId, feeData.studentId);
  }
);

exports.onFeeUpdated = onDocumentUpdated(
  { ...SYSTEM_FUNCTION_OPTIONS },
  'classes/{classId}/fees/{feeId}',
  async (event) => {
  const before = event.data?.before.data();
  const after = event.data?.after.data();
  const classId = event.params.classId;

  if (!after?.studentId || !shouldSendFeeReminder(before, after)) {
    return;
  }

  await sendFeesReminderToStudent(classId, after.studentId);
  }
);

exports.onAttendanceCreated = onDocumentCreated(
  { ...SYSTEM_FUNCTION_OPTIONS },
  'classes/{classId}/attendance/{attendanceId}',
  async (event) => {
  const attendanceData = event.data?.data();
  const classId = event.params.classId;

  if (!attendanceData?.studentId) {
    return;
  }

  await sendAttendanceUpdateToStudent(classId, attendanceData.studentId);
  }
);

exports.onLectureCreated = onDocumentCreated(
  { ...SYSTEM_FUNCTION_OPTIONS },
  'classes/{classId}/lectures/{lectureId}',
  async (event) => {
  const lectureData = event.data?.data();
  const classId = event.params.classId;

  if (!lectureData) {
    return;
  }

  await sendLectureNotificationToBatch(classId, {
    id: event.params.lectureId,
    ...lectureData,
  });
  }
);

// Internal controller groupings for clearer ownership and safer refactors.
const paymentController = Object.freeze({
  createOrder: exports.createRazorpayOrder,
  markAttempted: exports.markRazorpayPaymentAttempted,
  verifyPayment: exports.verifyRazorpayPayment,
  markFailed: exports.markRazorpayPaymentFailed,
  managePayment: exports.superAdminManagePayment,
  handleWebhook: exports.handleRazorpayWebhook,
});

const billingController = Object.freeze({
  getOverview: exports.getAdminBillingOverview,
  getSettings: exports.getBillingSettings,
  updateSettings: exports.updateBillingSettings,
  createSubscription: exports.createSubscription,
  cancelSubscription: exports.cancelSubscription,
  syncBillingState: exports.syncBillingState,
});

const systemController = Object.freeze({
  sendReportNotification: exports.sendReportNotification,
  sendFeesReminder: exports.sendFeesReminder,
  sendAttendanceUpdate: exports.sendAttendanceUpdate,
  sendLectureNotification: exports.sendLectureNotification,
  onReportCreated: exports.onReportCreated,
  onFeeCreated: exports.onFeeCreated,
  onFeeUpdated: exports.onFeeUpdated,
  onAttendanceCreated: exports.onAttendanceCreated,
  onLectureCreated: exports.onLectureCreated,
});
