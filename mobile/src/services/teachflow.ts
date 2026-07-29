import {
  addDoc,
  arrayUnion,
  collection,
  deleteDoc,
  doc,
  documentId,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
  type Query,
} from 'firebase/firestore';
import { db } from './firebase';
import {
  AIUsageLog,
  CoachingClass,
  GrowthEvent,
  ManagedPlan,
  Message,
  PaymentRecord,
  PlanSettings,
  PricingSettings,
  User,
} from '../types';
import { DEFAULT_PLAN_SETTINGS, getEffectivePlan, getPlanLimits, setPlanSettingsCache } from '../utils/plan';

const asString = (value: unknown, fallback = '') => (typeof value === 'string' ? value : fallback);
const asNumber = (value: unknown, fallback = 0) => (typeof value === 'number' && Number.isFinite(value) ? value : fallback);
const asBool = (value: unknown, fallback = false) => (typeof value === 'boolean' ? value : fallback);
const asArray = (value: unknown) => (Array.isArray(value) ? value.filter((item) => typeof item === 'string') as string[] : []);
const toIso = (value: unknown) => {
  if (value instanceof Timestamp) return value.toDate().toISOString();
  if (typeof value === 'string') return value;
  return new Date().toISOString();
};

const mapDoc = <T>(snapshot: { id: string; data: () => Record<string, unknown> }) => ({ id: snapshot.id, ...snapshot.data() }) as T;
const listen = <T>(q: Query, normalize: (value: T) => T, callback: (data: T[]) => void, onError?: (error: Error) => void) =>
  onSnapshot(q, (snapshot) => callback(snapshot.docs.map((item) => normalize(mapDoc<T>(item)))), (error) => onError?.(error as Error));

const normalizeUser = (user: User): User => ({
  ...user,
  id: asString(user.id),
  email: asString(user.email),
  name: asString(user.name, 'TeachFlow User'),
  role: ['super_admin', 'admin', 'teacher', 'student', 'parent'].includes(asString(user.role)) ? user.role : 'student',
  approved: asBool(user.approved, false),
  createdAt: toIso(user.createdAt),
  classIds: asArray(user.classIds),
  activeClassId: asString(user.activeClassId),
  classId: asString(user.classId),
  branchIds: asArray(user.branchIds),
  fcmTokens: asArray(user.fcmTokens),
  linkedStudentIds: asArray(user.linkedStudentIds),
  linkedStudentId: asString(user.linkedStudentId),
  batchId: asString(user.batchId),
});

const normalizeClass = (value: CoachingClass): CoachingClass => {
  const rawPlan = ['free', 'standard', 'pro'].includes(asString(value.plan)) ? value.plan : 'free';
  const plan = getEffectivePlan(rawPlan, value.planExpiry);
  const limits = getPlanLimits(plan);
  return {
    ...value,
    id: asString(value.id),
    name: asString(value.name, 'Untitled Class'),
    description: asString(value.description),
    logo: asString(value.logo),
    subdomain: asString(value.subdomain),
    adminId: asString(value.adminId),
    createdAt: toIso(value.createdAt),
    plan,
    planExpiry: asString(value.planExpiry),
    isActive: asBool(value.isActive, true),
    disabledReason: asString(value.disabledReason),
    studentCount: asNumber(value.studentCount, 0),
    teacherCount: asNumber(value.teacherCount, 0),
    limits: {
      students: asNumber(value.limits?.students, limits.students),
      teachers: asNumber(value.limits?.teachers, limits.teachers),
      batches: asNumber(value.limits?.batches, limits.batches),
      branches: asNumber(value.limits?.branches, limits.branches),
    },
    settings: {
      allowSelfRegistration: asBool(value.settings?.allowSelfRegistration, true),
      requireApproval: asBool(value.settings?.requireApproval, false),
      aiEnabled: asBool(value.settings?.aiEnabled, true),
      aiMonthlyLimit: asNumber(value.settings?.aiMonthlyLimit, 0) || undefined,
      previousPaidPlan: value.settings?.previousPaidPlan,
      downgradeReason: value.settings?.downgradeReason,
      downgradedAt: asString(value.settings?.downgradedAt),
      aiUsage: value.settings?.aiUsage
        ? { used: asNumber(value.settings.aiUsage.used, 0), limit: asNumber(value.settings.aiUsage.limit, 0), lastUsed: asString(value.settings.aiUsage.lastUsed) }
        : undefined,
    },
  };
};

const normalizeMessage = (message: Message): Message => ({
  ...message,
  id: asString(message.id),
  classId: asString(message.classId),
  fromUserId: asString(message.fromUserId),
  fromUserName: asString(message.fromUserName, 'Unknown User'),
  fromRole: ['super_admin', 'admin', 'teacher', 'student', 'parent'].includes(asString(message.fromRole)) ? message.fromRole : 'student',
  toUserId: asString(message.toUserId),
  toRole: ['super_admin', 'admin', 'teacher', 'student', 'parent'].includes(asString(message.toRole)) ? message.toRole : undefined,
  subject: asString(message.subject),
  message: asString(message.message),
  status: message.status === 'read' ? 'read' : 'sent',
  createdAt: toIso(message.createdAt),
  readAt: asString(message.readAt),
});

const normalizePayment = (payment: PaymentRecord): PaymentRecord => ({
  ...payment,
  id: asString(payment.id),
  classId: asString(payment.classId),
  userId: asString(payment.userId),
  plan: payment.plan,
  amount: asNumber(payment.amount, 0),
  currency: asString(payment.currency, 'INR'),
  orderId: asString(payment.orderId),
  paymentId: asString(payment.paymentId),
  refundId: asString(payment.refundId),
  status: payment.status,
  createdAt: toIso(payment.createdAt),
  updatedAt: asString(payment.updatedAt),
  verifiedAt: asString(payment.verifiedAt),
  refundedAt: asString(payment.refundedAt),
});

const normalizeReport = (report: ReportCard) => ({
  ...report,
  id: asString(report.id),
  studentId: asString(report.studentId),
  classId: asString(report.classId),
  attendance: {
    total: asNumber(report.attendance?.total, 0),
    present: asNumber(report.attendance?.present, 0),
    absent: asNumber(report.attendance?.absent, 0),
    percentage: asNumber(report.attendance?.percentage, 0),
  },
  marks: Array.isArray(report.marks) ? report.marks.map((mark) => ({ ...mark })) : [],
  aiSummary: asString(report.aiSummary),
  aiStatus: ['not_requested', 'pending', 'ready', 'failed'].includes(asString(report.aiStatus)) ? report.aiStatus : 'not_requested',
  generatedBy: asString(report.generatedBy),
  generatedAt: toIso(report.generatedAt),
  updatedAt: asString(report.updatedAt),
});

const normalizeSnapshot = (snapshot: AnalyticsSnapshot) => ({
  ...snapshot,
  id: asString(snapshot.id),
  classId: asString(snapshot.classId),
  periodLabel: asString(snapshot.periodLabel, 'Current period'),
  attendancePercentage: asNumber(snapshot.attendancePercentage, 0),
  passPercentage: asNumber(snapshot.passPercentage, 0),
  topStudents: asArray(snapshot.topStudents),
  weakStudents: asArray(snapshot.weakStudents),
  aiSummary: asString(snapshot.aiSummary),
  aiStatus: ['not_requested', 'pending', 'ready', 'failed'].includes(asString(snapshot.aiStatus)) ? snapshot.aiStatus : 'not_requested',
  createdAt: toIso(snapshot.createdAt),
  updatedAt: asString(snapshot.updatedAt),
});

const normalizeGrowthEvent = (event: GrowthEvent): GrowthEvent => ({
  ...event,
  id: asString(event.id),
  type: event.type,
  source: asString(event.source),
  plan: event.plan,
  classId: asString(event.classId),
  userId: asString(event.userId),
  createdAt: toIso(event.createdAt),
});

const normalizeAIUsage = (usage: AIUsageLog): AIUsageLog => ({
  ...usage,
  id: asString(usage.id),
  classId: asString(usage.classId),
  feature: usage.feature,
  promptTokens: asNumber(usage.promptTokens, 0),
  completionTokens: asNumber(usage.completionTokens, 0),
  totalTokens: asNumber(usage.totalTokens, 0),
  monthKey: asString(usage.monthKey),
  createdAt: toIso(usage.createdAt),
});

const usersCollection = collection(db, 'users');
const classesCollection = collection(db, 'classes');
const messagesCollection = collection(db, 'messages');
const paymentsCollection = collection(db, 'payments');
const growthEventsCollection = collection(db, 'growthEvents');
const aiUsageCollection = collection(db, 'aiUsageLogs');
const planSettingsDoc = doc(db, 'settings', 'plans');
const pricingSettingsDoc = doc(db, 'settings', 'pricing');
const invitesCollection = collection(db, 'invites');
const leavesCollection = collection(db, 'leaves');

const classCollection = (classId: string, name: string) => collection(db, 'classes', classId, name);
const classDoc = (classId: string, name: string, id: string) => doc(db, 'classes', classId, name, id);

export const teachflowService = {
  async getUserProfile(userId: string) {
    const snap = await getDoc(doc(usersCollection, userId));
    return snap.exists() ? normalizeUser(mapDoc<User>(snap)) : null;
  },

  async upsertUser(userData: Omit<User, 'createdAt'>) {
    await setDoc(doc(usersCollection, userData.id), { ...userData, classIds: userData.classIds ?? (userData.classId ? [userData.classId] : []), activeClassId: userData.activeClassId ?? userData.classId, createdAt: serverTimestamp(), updatedAt: serverTimestamp() }, { merge: true });
    const snap = await getDoc(doc(usersCollection, userData.id));
    return normalizeUser(mapDoc<User>(snap));
  },

  async getClassBySlug(subdomain: string) {
    const snap = await getDocs(query(classesCollection, where('subdomain', '==', subdomain)));
    return snap.docs[0] ? normalizeClass(mapDoc<CoachingClass>(snap.docs[0])) : null;
  },

  async getClass(classId: string) {
    const snap = await getDoc(doc(classesCollection, classId));
    return snap.exists() ? normalizeClass(mapDoc<CoachingClass>(snap)) : null;
  },

  async getClassesByIds(classIds: string[]) {
    if (classIds.length === 0) return [];
    const snap = await getDocs(query(classesCollection, where(documentId(), 'in', classIds.slice(0, 10))));
    return snap.docs.map((item) => normalizeClass(mapDoc<CoachingClass>(item)));
  },

  async getClassesByAdmin(adminId: string) {
    const snap = await getDocs(query(classesCollection, where('adminId', '==', adminId)));
    return snap.docs.map((item) => normalizeClass(mapDoc<CoachingClass>(item)));
  },

  async createClass(adminId: string, classData: Omit<CoachingClass, 'id' | 'adminId' | 'createdAt'>) {
    const ref = await addDoc(classesCollection, { ...classData, adminId, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
    return normalizeClass(mapDoc<CoachingClass>(await getDoc(ref)));
  },

  async switchUserClass(userId: string, classId: string) {
    await updateDoc(doc(usersCollection, userId), { classId, activeClassId: classId, classIds: arrayUnion(classId), updatedAt: serverTimestamp() });
  },

  async linkUserToClass(userId: string, classId: string) {
    await updateDoc(doc(usersCollection, userId), { classIds: arrayUnion(classId), updatedAt: serverTimestamp() });
  },

  subscribeToPlanSettings(callback: (settings: PlanSettings) => void, onError?: (error: Error) => void) {
    return onSnapshot(planSettingsDoc, (snapshot) => {
      const settings = (snapshot.exists() ? (snapshot.data() as PlanSettings) : DEFAULT_PLAN_SETTINGS) ?? DEFAULT_PLAN_SETTINGS;
      callback(settings);
      setPlanSettingsCache(settings);
    }, (error) => onError?.(error as Error));
  },

  async getPlanSettings() {
    const snap = await getDoc(planSettingsDoc);
    return (snap.exists() ? (snap.data() as PlanSettings) : DEFAULT_PLAN_SETTINGS) ?? DEFAULT_PLAN_SETTINGS;
  },

  async updatePlanSettings(settings: PlanSettings) {
    await setDoc(planSettingsDoc, { ...settings, updatedAt: serverTimestamp() }, { merge: true });
  },

  async getPricingSettings() {
    const snap = await getDoc(pricingSettingsDoc);
    return (snap.exists() ? (snap.data() as PricingSettings) : { id: 'pricing', currency: 'INR', standardMonthlyPrice: 399, proMonthlyPrice: 999 }) as PricingSettings;
  },

  async updatePricingSettings(settings: Pick<PricingSettings, 'currency' | 'standardMonthlyPrice' | 'proMonthlyPrice'>) {
    await setDoc(pricingSettingsDoc, { id: 'pricing', ...settings, updatedAt: serverTimestamp() }, { merge: true });
  },

  subscribeToCollection<T>(q: Query, normalize: (value: T) => T, callback: (data: T[]) => void, onError?: (error: Error) => void) {
    return listen(q, normalize, callback, onError);
  },

  subscribeToClassCollection<T>(
    classId: string,
    collectionName: string,
    normalize: (value: T) => T,
    callback: (data: T[]) => void,
    onError?: (error: Error) => void
  ) {
    return listen(query(classCollection(classId, collectionName)), normalize, callback, onError);
  },

  async createClassDoc<T>(classId: string, collectionName: string, payload: Omit<T, 'id'>) {
    const ref = await addDoc(classCollection(classId, collectionName), { ...payload, classId, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
    return mapDoc<T>(await getDoc(ref));
  },

  async updateClassDoc(classId: string, collectionName: string, id: string, payload: Partial<Record<string, unknown>>) {
    await updateDoc(classDoc(classId, collectionName, id), { ...payload, updatedAt: serverTimestamp() });
  },

  async deleteClassDoc(classId: string, collectionName: string, id: string) {
    await deleteDoc(classDoc(classId, collectionName, id));
  },

  subscribeToStudents(classId: string, callback: (students: unknown[]) => void, onError?: (error: Error) => void) {
    return this.subscribeToClassCollection(classId, 'students', (item) => item, callback, onError);
  },

  subscribeToTeachers(classId: string, callback: (teachers: unknown[]) => void, onError?: (error: Error) => void) {
    return this.subscribeToClassCollection(classId, 'teachers', (item) => item, callback, onError);
  },

  subscribeToBatches(classId: string, callback: (batches: unknown[]) => void, onError?: (error: Error) => void) {
    return this.subscribeToClassCollection(classId, 'batches', (item) => item, callback, onError);
  },

  subscribeToLectures(classId: string, callback: (lectures: unknown[]) => void, onError?: (error: Error) => void) {
    return this.subscribeToClassCollection(classId, 'lectures', (item) => item, callback, onError);
  },

  subscribeToAttendance(classId: string, callback: (attendance: unknown[]) => void, onError?: (error: Error) => void) {
    return this.subscribeToClassCollection(classId, 'attendance', (item) => item, callback, onError);
  },

  subscribeToMarks(classId: string, callback: (marks: unknown[]) => void, onError?: (error: Error) => void) {
    return this.subscribeToClassCollection(classId, 'marks', (item) => item, callback, onError);
  },

  subscribeToFees(classId: string, callback: (fees: unknown[]) => void, onError?: (error: Error) => void) {
    return this.subscribeToClassCollection(classId, 'fees', (item) => item, callback, onError);
  },

  subscribeToClassReports(classId: string, callback: (reports: unknown[]) => void, onError?: (error: Error) => void) {
    return this.subscribeToClassCollection(classId, 'reports', (item) => item, callback, onError);
  },

  subscribeToAnalyticsSnapshots(classId: string, callback: (snapshots: unknown[]) => void, onError?: (error: Error) => void) {
    return this.subscribeToClassCollection(classId, 'analyticsSnapshots', (item) => item, callback, onError);
  },

  subscribeToMessagesForClass(classId: string, callback: (messages: Message[]) => void, onError?: (error: Error) => void) {
    return listen(query(messagesCollection, where('classId', '==', classId), orderBy('createdAt', 'desc')), normalizeMessage, callback, onError);
  },

  subscribeToMessagesForUser(classId: string, userId: string, callback: (messages: Message[]) => void, onError?: (error: Error) => void) {
    return listen(query(messagesCollection, where('classId', '==', classId), where('toUserId', '==', userId), orderBy('createdAt', 'desc')), normalizeMessage, callback, onError);
  },

  subscribeToMessagesSentByUser(classId: string, userId: string, callback: (messages: Message[]) => void, onError?: (error: Error) => void) {
    return listen(query(messagesCollection, where('classId', '==', classId), where('fromUserId', '==', userId), orderBy('createdAt', 'desc')), normalizeMessage, callback, onError);
  },

  subscribeToClassUsers(classId: string, callback: (users: User[]) => void, onError?: (error: Error) => void) {
    return listen(query(usersCollection, where('classIds', 'array-contains', classId)), normalizeUser, callback, onError);
  },

  subscribeToAllClasses(callback: (classes: CoachingClass[]) => void, onError?: (error: Error) => void) {
    return listen(query(classesCollection, orderBy('createdAt', 'desc')), normalizeClass, callback, onError);
  },

  subscribeToAllUsers(callback: (users: User[]) => void, onError?: (error: Error) => void) {
    return listen(query(usersCollection, orderBy('createdAt', 'desc')), normalizeUser, callback, onError);
  },

  subscribeToPayments(callback: (payments: PaymentRecord[]) => void, onError?: (error: Error) => void) {
    return listen(query(paymentsCollection, orderBy('createdAt', 'desc')), normalizePayment, callback, onError);
  },

  subscribeToGrowthEvents(callback: (events: GrowthEvent[]) => void, onError?: (error: Error) => void) {
    return listen(query(growthEventsCollection, orderBy('createdAt', 'desc')), normalizeGrowthEvent, callback, onError);
  },

  subscribeToAllAIUsage(callback: (entries: AIUsageLog[]) => void, onError?: (error: Error) => void) {
    return listen(query(aiUsageCollection, orderBy('createdAt', 'desc')), normalizeAIUsage, callback, onError);
  },

  async getAIUsageForMonth(classId: string, monthKey: string) {
    const snap = await getDocs(query(aiUsageCollection, where('classId', '==', classId), where('monthKey', '==', monthKey)));
    return snap.docs.map((item) => normalizeAIUsage(mapDoc<AIUsageLog>(item)));
  },

  async getAIUsageCountForMonth(classId: string, monthKey: string, feature?: string) {
    const usage = await this.getAIUsageForMonth(classId, monthKey);
    return usage.filter((item) => (feature ? item.feature === feature : true)).length;
  },

  async createAIUsageLog(entry: Omit<AIUsageLog, 'id' | 'createdAt'>) {
    await addDoc(aiUsageCollection, { ...entry, createdAt: serverTimestamp() });
  },

  subscribeToAIUsageForMonth(classId: string, monthKey: string, callback: (entries: AIUsageLog[]) => void, onError?: (error: Error) => void) {
    return listen(query(aiUsageCollection, where('classId', '==', classId), where('monthKey', '==', monthKey)), normalizeAIUsage, callback, onError);
  },

  async createAuditLog(classId: string, log: Record<string, unknown>) {
    await addDoc(collection(db, 'classes', classId, 'auditLogs'), { ...log, classId, createdAt: serverTimestamp() });
  },

  async createMessage(messageData: Omit<Message, 'id' | 'createdAt' | 'status' | 'readAt'>) {
    const ref = await addDoc(messagesCollection, { ...messageData, status: 'sent', createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
    return normalizeMessage(mapDoc<Message>(await getDoc(ref)));
  },

  async createInvite(inviteData: Record<string, unknown>) {
    await addDoc(invitesCollection, { ...inviteData, status: 'pending', createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
  },

  async addLeave(leaveData: Record<string, unknown>) {
    await addDoc(leavesCollection, { ...leaveData, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
  },

  async updateLeaveStatus(leaveId: string, status: 'pending' | 'approved' | 'rejected') {
    await updateDoc(doc(leavesCollection, leaveId), { status, updatedAt: serverTimestamp() });
  },

  async updateClassSettings(classId: string, settings: CoachingClass['settings']) {
    await updateDoc(doc(classesCollection, classId), { settings, updatedAt: serverTimestamp() });
  },

  async updateClassPlan(classId: string, plan: ManagedPlan) {
    await updateDoc(doc(classesCollection, classId), { plan, updatedAt: serverTimestamp() });
  },

  async setClassActiveState(classId: string, isActive: boolean) {
    await updateDoc(doc(classesCollection, classId), { isActive, updatedAt: serverTimestamp() });
  },

  async updateUserAdminState(userId: string, updates: Partial<Pick<User, 'approved' | 'role'>>) {
    await updateDoc(doc(usersCollection, userId), { ...updates, updatedAt: serverTimestamp() });
  },

  async deleteUser(userId: string) {
    await deleteDoc(doc(usersCollection, userId));
  },

  async deleteClass(classId: string) {
    await deleteDoc(doc(classesCollection, classId));
  },

  async extendClassPlan(classId: string, days: 7 | 30) {
    const coachingClass = await this.getClass(classId);
    if (!coachingClass) throw new Error('Class not found.');
    const currentExpiry = coachingClass.planExpiry ? new Date(coachingClass.planExpiry).getTime() : Date.now();
    const baseTime = Number.isFinite(currentExpiry) && currentExpiry > Date.now() ? currentExpiry : Date.now();
    await updateDoc(doc(classesCollection, classId), { planExpiry: Timestamp.fromMillis(baseTime + days * 24 * 60 * 60 * 1000), isActive: true, updatedAt: serverTimestamp() });
  },

  async updateClassAIControls(classId: string, updates: { aiEnabled?: boolean; aiMonthlyLimit?: number }) {
    const classData = await this.getClass(classId);
    if (!classData) throw new Error('Class not found.');
    await updateDoc(doc(classesCollection, classId), {
      settings: { ...classData.settings, ...(typeof updates.aiEnabled === 'boolean' ? { aiEnabled: updates.aiEnabled } : {}), ...(typeof updates.aiMonthlyLimit === 'number' ? { aiMonthlyLimit: updates.aiMonthlyLimit } : {}) },
      updatedAt: serverTimestamp(),
    });
  },

  async resetClassAIUsage(classId: string, monthKey: string) {
    const snap = await getDocs(query(aiUsageCollection, where('classId', '==', classId), where('monthKey', '==', monthKey)));
    await Promise.all(snap.docs.map((entry) => deleteDoc(entry.ref)));
  },

  async getPendingApprovals(classId: string) {
    const snap = await getDocs(query(usersCollection, where('classIds', 'array-contains', classId)));
    return snap.docs.map((item) => normalizeUser(mapDoc<User>(item))).filter((user) => user.approved === false);
  },

  async approvePendingUser(input: { userId: string; classId: string; role: User['role']; batchId?: string; batchName?: string; linkedStudentIds?: string[] }) {
    const userRef = doc(usersCollection, input.userId);
    const userSnap = await getDoc(userRef);
    if (!userSnap.exists()) throw new Error('Pending user not found.');
    const userData = normalizeUser(mapDoc<User>(userSnap));
    await updateDoc(userRef, {
      approved: true,
      role: input.role,
      classIds: [input.classId],
      classId: input.classId,
      activeClassId: input.classId,
      batchId: input.role === 'student' ? input.batchId ?? null : null,
      linkedStudentIds: input.role === 'parent' ? (input.linkedStudentIds ?? []) : [],
      linkedStudentId: input.role === 'parent' ? input.linkedStudentIds?.[0] ?? null : null,
      updatedAt: serverTimestamp(),
    });

    if (input.role === 'student') {
      await setDoc(
        doc(db, 'classes', input.classId, 'students', input.userId),
        {
          name: userData.name,
          email: userData.email,
          phone: '',
          batch: input.batchName ?? 'Batch A',
          batchId: input.batchId ?? null,
          parentIds: [],
          parentEmail: '',
          parentPhone: '',
          rollNumber: `AUTO-${input.userId.slice(0, 6).toUpperCase()}`,
          totalFees: 0,
          paidFees: 0,
          feeStatus: 'due',
          classId: input.classId,
          joinedAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
    }

    if (input.role === 'teacher') {
      await setDoc(
        doc(db, 'classes', input.classId, 'teachers', input.userId),
        {
          name: userData.name,
          email: userData.email,
          phone: '',
          subjects: [],
          batches: input.batchName ? [input.batchName] : [],
          batchIds: input.batchId ? [input.batchId] : [],
          salary: 0,
          classId: input.classId,
          joinedAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
    }

    if (input.role === 'parent' && (input.linkedStudentIds?.length ?? 0) > 0) {
      await Promise.all(
        input.linkedStudentIds!.map((studentId) =>
          updateDoc(doc(db, 'classes', input.classId, 'students', studentId), {
            parentIds: arrayUnion(input.userId),
            updatedAt: serverTimestamp(),
          })
        )
      );
    }
  },

  async rejectUser(userId: string, classId: string) {
    const userRef = doc(usersCollection, userId);
    const userSnap = await getDoc(userRef);
    if (!userSnap.exists()) return;
    const data = userSnap.data();
    const currentClassIds: string[] = (data.classIds as string[]) ?? [];
    if (currentClassIds.length <= 1) {
      await deleteDoc(userRef);
    } else {
      await updateDoc(userRef, { classIds: currentClassIds.filter((id) => id !== classId), updatedAt: serverTimestamp() });
    }
  },

  async acceptInvitesForUser(userId: string, email: string) {
    const snap = await getDocs(query(invitesCollection, where('email', '==', email), where('status', '==', 'pending')));
    if (snap.empty) return [];
    const invites = snap.docs.map((item) => ({ id: item.id, ...(item.data() as Record<string, unknown>) }));
    const primaryInvite = invites[0];
    const classIds = invites.map((invite) => asString(invite.classId));
    await updateDoc(doc(usersCollection, userId), { classIds: arrayUnion(...classIds), classId: asString(primaryInvite.classId), activeClassId: asString(primaryInvite.classId), role: asString(primaryInvite.role) as User['role'], approved: true, updatedAt: serverTimestamp() });
    return invites;
  },

  async trackGrowthEvent(event: Omit<GrowthEvent, 'id' | 'createdAt'>) {
    await addDoc(growthEventsCollection, { ...event, createdAt: serverTimestamp() });
  },

  async getPaidPaymentsForClass(classId: string) {
    const snap = await getDocs(query(paymentsCollection, where('classId', '==', classId), where('status', '==', 'paid')));
    return snap.docs.map((item) => normalizePayment(mapDoc<PaymentRecord>(item)));
  },
};
