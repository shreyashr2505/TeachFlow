import {
  addDoc,
  arrayUnion,
  collection,
  deleteDoc,
  documentId,
  doc,
  getDoc,
  getDocs,
  increment,
  onSnapshot,
  orderBy,
  QueryConstraint,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db } from './firebase';
import { billingFunctions } from './firebase';
import { buildBatchCode, buildLectureCode } from '../utils/teaching';
import {
  Attendance,
  AnalyticsSnapshot,
  Batch,
  BillingOverview,
  BillingSettings,
  CoachingClass,
  Fee,
  Invite,
  Lecture,
  Leave,
  Marks,
  AIUsageLog,
  Message,
  NotificationJob,
  PaymentRecord,
  PlanSettings,
  PricingSettings,
  ReportCard,
  Student,
  Teacher,
  User,
  AuditLog,
  GrowthEvent,
} from '../types';
import { DEFAULT_PLAN_SETTINGS, getEffectivePlan, getPlanDefinition, getPlanLimits, isPlanExpired, setPlanSettingsCache } from '../utils/plan';

type FirestoreDate = Timestamp | string | null | undefined;
type FirestoreSnapshotLike = { id: string; data: () => Record<string, unknown> };
type FirestoreSingleSnapshotLike = FirestoreSnapshotLike & { exists?: () => boolean };

class ServiceError extends Error {
  constructor(message: string, public cause?: unknown) {
    super(message);
    this.name = 'ServiceError';
  }
}

const toIsoString = (value: FirestoreDate) =>
  value instanceof Timestamp ? value.toDate().toISOString() : value ?? new Date().toISOString();

const mapDoc = <T>(snapshot: FirestoreSnapshotLike) =>
  ({
    id: snapshot.id,
    ...snapshot.data(),
  }) as T;

const asString = (value: unknown, fallback = ''): string => (typeof value === 'string' ? value : fallback);
const asNumber = (value: unknown, fallback = 0): number =>
  typeof value === 'number' && Number.isFinite(value)
    ? value
    : typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))
      ? Number(value)
      : fallback;
const asBoolean = (value: unknown, fallback = false): boolean => (typeof value === 'boolean' ? value : fallback);
const asStringArray = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0) : [];
const asRecord = (value: unknown): Record<string, unknown> =>
  Object.prototype.toString.call(value) === '[object Object]' ? (value as Record<string, unknown>) : {};
const asNullableString = (value: unknown): string | undefined => {
  const normalized = asString(value).trim();
  return normalized.length > 0 ? normalized : undefined;
};

const normalizeDoc = <T>(
  snapshot: FirestoreSnapshotLike,
  normalizer: (value: T) => T,
  label: string
): T | null => {
  try {
    return normalizer(mapDoc<T>(snapshot));
  } catch (error) {
    console.warn(`Skipped malformed ${label} document ${snapshot.id}.`, error, snapshot.data());
    return null;
  }
};

const normalizeSnapshotDocs = <T>(
  snapshots: FirestoreSnapshotLike[],
  normalizer: (value: T) => T,
  label: string
): T[] =>
  snapshots
    .map((snapshot) => normalizeDoc<T>(snapshot, normalizer, label))
    .filter((item): item is T => item !== null);

const normalizeOptionalSnapshot = <T>(
  snapshot: FirestoreSingleSnapshotLike,
  normalizer: (value: T) => T,
  label: string
): T | null => {
  if (typeof snapshot.exists === 'function' && !snapshot.exists()) {
    return null;
  }

  return normalizeDoc<T>(snapshot, normalizer, label);
};

const withErrorHandling = async <T>(message: string, action: () => Promise<T>) => {
  try {
    return await action();
  } catch (error) {
    console.error(message, error);
    throw new ServiceError(message, error);
  }
};

const usersCollection = collection(db, 'users');
const classesCollection = collection(db, 'classes');
const invitesCollection = collection(db, 'invites');
const messagesCollection = collection(db, 'messages');
const reportsCollection = collection(db, 'reports');
const analyticsSnapshotsCollection = collection(db, 'analyticsSnapshots');
const aiUsageCollection = collection(db, 'aiUsageLogs');
const paymentsCollection = collection(db, 'payments');
const growthEventsCollection = collection(db, 'growthEvents');
const leavesCollection = collection(db, 'leaves');
const plansSettingsDoc = doc(db, 'settings', 'plans');
const classStudentsCollection = (classId: string) => collection(db, 'classes', classId, 'students');
const classTeachersCollection = (classId: string) => collection(db, 'classes', classId, 'teachers');
const classLecturesCollection = (classId: string) => collection(db, 'classes', classId, 'lectures');
const classBatchesCollection = (classId: string) => collection(db, 'classes', classId, 'batches');
const classAttendanceCollection = (classId: string) => collection(db, 'classes', classId, 'attendance');
const classMarksCollection = (classId: string) => collection(db, 'classes', classId, 'marks');
const classFeesCollection = (classId: string) => collection(db, 'classes', classId, 'fees');
const classAuditCollection = (classId: string) => collection(db, 'classes', classId, 'auditLogs');
const classStudentDoc = (classId: string, studentId: string) => doc(db, 'classes', classId, 'students', studentId);
const notificationsCollection = collection(db, 'notifications');

const classLimitsByPlan: Record<CoachingClass['plan'], { students: number; teachers: number; batches: number; branches: number }> = {
  free: getPlanLimits('free'),
  standard: getPlanLimits('standard'),
  pro: getPlanLimits('pro'),
};

const planOrder: CoachingClass['plan'][] = ['free', 'standard', 'pro'];
const getPlanRank = (plan: CoachingClass['plan']) => planOrder.indexOf(plan);
const getHigherPlan = (left: CoachingClass['plan'], right: CoachingClass['plan']) => (getPlanRank(left) >= getPlanRank(right) ? left : right);
const PLAN_DOWNGRADED_REASON = 'Plan downgraded';

const normalizeUser = (user: User): User => ({
  ...user,
  id: asString(user.id),
  email: asString(user.email),
  name: asString(user.name, 'TeachFlow User'),
  role:
    user.role === ('super admin' as User['role']) ||
    user.role === ('super-admin' as User['role']) ||
    user.role === ('superadmin' as User['role'])
      ? 'super_admin'
      : (['super_admin', 'admin', 'teacher', 'student', 'parent'].includes(asString(user.role)) ? user.role : 'student'),
  approved: asBoolean(user.approved, false),
  createdAt: toIsoString(user.createdAt),
  classId: asNullableString(user.classId),
  classIds: asStringArray(user.classIds).length > 0 ? asStringArray(user.classIds) : asNullableString(user.classId) ? [asString(user.classId)] : [],
  activeClassId: asNullableString(user.activeClassId) ?? asNullableString(user.classId),
  branchIds: asStringArray(user.branchIds),
  fcmTokens: asStringArray(user.fcmTokens),
  subscriptionPlan: ['free', 'standard', 'pro'].includes(asString(user.subscriptionPlan)) ? user.subscriptionPlan : undefined,
  linkedStudentId: asNullableString(user.linkedStudentId),
  linkedStudentIds: asStringArray(user.linkedStudentIds).length > 0
    ? asStringArray(user.linkedStudentIds)
    : asNullableString(user.linkedStudentId)
      ? [asString(user.linkedStudentId)]
      : [],
  batchId: asNullableString(user.batchId),
});

const normalizeClass = (coachingClass: CoachingClass): CoachingClass => {
  const rawPlan = ['free', 'standard', 'pro'].includes(asString(coachingClass.plan)) ? coachingClass.plan : 'free';
  const normalizedPlanExpiry = coachingClass.planExpiry ? toIsoString(coachingClass.planExpiry as FirestoreDate) : undefined;
  const effectivePlan = getEffectivePlan(rawPlan, normalizedPlanExpiry);
  const forceEffectiveLimits = effectivePlan !== rawPlan;
  const effectiveLimits = getPlanLimits(effectivePlan);

  return {
    ...coachingClass,
    id: asString(coachingClass.id),
    name: asString(coachingClass.name, 'Untitled Class'),
    description: asNullableString(coachingClass.description),
    logo: asNullableString(coachingClass.logo),
    subdomain: asString(coachingClass.subdomain),
    adminId: asString(coachingClass.adminId),
    createdAt: toIsoString(coachingClass.createdAt),
    plan: effectivePlan,
    planExpiry: normalizedPlanExpiry,
    autoRenew: asBoolean((coachingClass as CoachingClass & { autoRenew?: boolean }).autoRenew, false),
    lastPaymentDate: asNullableString((coachingClass as CoachingClass & { lastPaymentDate?: string }).lastPaymentDate),
    nextBillingDate: asNullableString((coachingClass as CoachingClass & { nextBillingDate?: string }).nextBillingDate),
    subscriptionId: asNullableString((coachingClass as CoachingClass & { subscriptionId?: string }).subscriptionId),
    subscriptionStatus: asNullableString((coachingClass as CoachingClass & { subscriptionStatus?: string }).subscriptionStatus),
    failedAttemptsCount: asNumber((coachingClass as CoachingClass & { failedAttemptsCount?: number }).failedAttemptsCount, 0),
    failedAttemptsWindowStart: asNullableString((coachingClass as CoachingClass & { failedAttemptsWindowStart?: string }).failedAttemptsWindowStart),
    blockedUntil: asNullableString((coachingClass as CoachingClass & { blockedUntil?: string }).blockedUntil),
    isActive: asBoolean(coachingClass.isActive, true),
    disabledReason: asNullableString(coachingClass.disabledReason),
    studentCount: asNumber(coachingClass.studentCount, 0),
    teacherCount: asNumber(coachingClass.teacherCount, 0),
    limits: {
      students: forceEffectiveLimits ? effectiveLimits.students : asNumber(coachingClass.limits?.students, classLimitsByPlan[effectivePlan].students),
      teachers: forceEffectiveLimits ? effectiveLimits.teachers : asNumber(coachingClass.limits?.teachers, classLimitsByPlan[effectivePlan].teachers),
      batches: forceEffectiveLimits ? effectiveLimits.batches : asNumber(coachingClass.limits?.batches, classLimitsByPlan[effectivePlan].batches),
      branches: forceEffectiveLimits ? effectiveLimits.branches : asNumber(coachingClass.limits?.branches, classLimitsByPlan[effectivePlan].branches),
    },
    settings: {
      allowSelfRegistration: asBoolean(coachingClass.settings?.allowSelfRegistration, true),
      requireApproval: asBoolean(coachingClass.settings?.requireApproval, false),
      aiEnabled: forceEffectiveLimits ? getPlanDefinition(effectivePlan).features.aiReports : asBoolean(coachingClass.settings?.aiEnabled, true),
      aiMonthlyLimit: asNumber(coachingClass.settings?.aiMonthlyLimit, 0) || undefined,
      previousPaidPlan: ['free', 'standard', 'pro'].includes(asString(coachingClass.settings?.previousPaidPlan))
        ? coachingClass.settings?.previousPaidPlan
        : undefined,
      downgradeReason: ['expired', 'manual'].includes(asString(coachingClass.settings?.downgradeReason))
        ? coachingClass.settings?.downgradeReason
        : undefined,
      downgradedAt: coachingClass.settings?.downgradedAt ? toIsoString(coachingClass.settings.downgradedAt as FirestoreDate) : undefined,
      aiUsage: {
        used: asNumber(coachingClass.settings?.aiUsage?.used, 0),
        limit: asNumber(coachingClass.settings?.aiUsage?.limit, 0),
        lastUsed: coachingClass.settings?.aiUsage?.lastUsed ? toIsoString(coachingClass.settings.aiUsage.lastUsed as FirestoreDate) : undefined,
      },
    },
  };
};

const normalizeStudent = (student: Student): Student => ({
  ...student,
  id: asString(student.id),
  name: asString(student.name, 'Unnamed Student'),
  email: asString(student.email),
  phone: asNullableString(student.phone),
  grade: asNullableString(student.grade),
  board: asNullableString(student.board),
  batch: asString(student.batch, 'Batch A'),
  batchId: asNullableString(student.batchId),
  parentIds: asStringArray(student.parentIds),
  parentEmail: asNullableString(student.parentEmail),
  parentId: asNullableString(student.parentId),
  parentPhone: asNullableString(student.parentPhone),
  classId: asString(student.classId),
  rollNumber: asString(student.rollNumber, 'N/A'),
  joinedAt: toIsoString(student.joinedAt),
  feeStatus: ['paid', 'partial', 'due'].includes(asString(student.feeStatus)) ? student.feeStatus : 'due',
  totalFees: asNumber(student.totalFees, 0),
  paidFees: asNumber(student.paidFees, 0),
});

const normalizeTeacher = (teacher: Teacher): Teacher => ({
  ...teacher,
  id: asString(teacher.id),
  name: asString(teacher.name, 'Unnamed Teacher'),
  email: asString(teacher.email),
  phone: asNullableString(teacher.phone),
  classId: asString(teacher.classId),
  joinedAt: toIsoString(teacher.joinedAt),
  subjects: asStringArray(teacher.subjects),
  batches: asStringArray(teacher.batches),
  batchIds: asStringArray(teacher.batchIds),
  salary: teacher.salary == null ? undefined : asNumber(teacher.salary, 0),
  salaryType: teacher.salaryType === 'hourly' || teacher.salaryType === 'fixed' ? teacher.salaryType : undefined,
  hourlyRate: teacher.hourlyRate == null ? undefined : asNumber(teacher.hourlyRate, 0),
  fixedSalary: teacher.fixedSalary == null ? undefined : asNumber(teacher.fixedSalary, 0),
});

const normalizeLecture = (lecture: Lecture): Lecture => ({
  ...lecture,
  id: asString(lecture.id),
  title: asString(lecture.title, 'Untitled Lecture'),
  subject: asString(lecture.subject, 'General'),
  batch: asString(lecture.batch, 'Batch A'),
  batchName: asNullableString(lecture.batchName) ?? asString(lecture.batch, 'Batch A'),
  batchId: asNullableString(lecture.batchId),
  teacherId: asString(lecture.teacherId),
  teacherName: asString(lecture.teacherName, 'Teacher'),
  date: asString(lecture.date),
  time: asString(lecture.time),
  duration: asNumber(lecture.duration, 60),
  durationHours: lecture.durationHours == null ? asNumber(lecture.duration, 60) / 60 : asNumber(lecture.durationHours, 0),
  classId: asString(lecture.classId),
  branchId: asNullableString(lecture.branchId),
  branchName: asNullableString(lecture.branchName),
  roomNumber: asNullableString(lecture.roomNumber),
  grade: asNullableString(lecture.grade),
  board: asNullableString(lecture.board),
  lecMode: lecture.lecMode === 'ONLINE' || lecture.lecMode === 'OFFLINE' ? lecture.lecMode : 'OFFLINE',
  lectureCode: asNullableString(lecture.lectureCode),
  batchCode: asNullableString(lecture.batchCode),
  status: ['scheduled', 'completed', 'cancelled'].includes(asString(lecture.status)) ? lecture.status : 'scheduled',
  description: asNullableString(lecture.description),
});

const normalizeLeave = (leave: Leave): Leave => ({
  ...leave,
  id: asString(leave.id),
  teacherId: asString(leave.teacherId),
  classId: asString(leave.classId),
  fromDate: asString(leave.fromDate),
  toDate: asString(leave.toDate),
  reason: asString(leave.reason),
  status: ['pending', 'approved', 'rejected'].includes(asString(leave.status)) ? leave.status : 'pending',
  createdAt: toIsoString(leave.createdAt),
  updatedAt: leave.updatedAt ? toIsoString(leave.updatedAt) : undefined,
});
const normalizeBatch = (batch: Batch): Batch => ({
  ...batch,
  id: asString(batch.id),
  name: asString(batch.name, 'Untitled Batch'),
  timing: asString(batch.timing, 'TBD'),
  teacherId: asNullableString(batch.teacherId),
  teacherName: asNullableString(batch.teacherName),
  subjects: asStringArray(batch.subjects),
  classId: asString(batch.classId),
  createdAt: toIsoString(batch.createdAt),
});
const normalizeAttendance = (attendance: Attendance): Attendance => ({
  ...attendance,
  id: asString(attendance.id),
  lectureId: asString(attendance.lectureId),
  studentId: asString(attendance.studentId),
  studentName: asString(attendance.studentName, 'Student'),
  classId: asNullableString(attendance.classId),
  lectureTitle: asNullableString(attendance.lectureTitle),
  batch: asNullableString(attendance.batch),
  date: asNullableString(attendance.date),
  status: ['present', 'absent'].includes(asString(attendance.status)) ? attendance.status : 'absent',
  markedAt: toIsoString(attendance.markedAt),
  markedBy: asString(attendance.markedBy),
});
const normalizeMarks = (marks: Marks): Marks => ({
  ...marks,
  id: asString(marks.id),
  studentId: asString(marks.studentId),
  studentName: asString(marks.studentName, 'Student'),
  subject: asString(marks.subject, 'General'),
  examType: asString(marks.examType, 'Exam'),
  examName: asString(marks.examName, 'Assessment'),
  totalMarks: asNumber(marks.totalMarks, 0),
  obtainedMarks: asNumber(marks.obtainedMarks, 0),
  date: asString(marks.date),
  classId: asString(marks.classId),
  teacherId: asString(marks.teacherId),
  batch: asString(marks.batch, 'Batch A'),
});
const normalizeFeePayment = (payment: Record<string, unknown>) => ({
  id: asString(payment.id),
  amount: asNumber(payment.amount, 0),
  paidDate: asString(payment.paidDate),
  method: ['cash', 'upi', 'card', 'bank_transfer', 'cheque'].includes(asString(payment.method))
    ? (payment.method as Fee['paymentHistory'][number]['method'])
    : 'cash',
  receiptNumber: asString(payment.receiptNumber),
  notes: asNullableString(payment.notes),
});
const normalizeFeeInstallment = (installment: Record<string, unknown>) => ({
  id: asString(installment.id),
  amount: asNumber(installment.amount, 0),
  dueDate: asString(installment.dueDate),
  status: ['paid', 'due'].includes(asString(installment.status)) ? (installment.status as 'paid' | 'due') : 'due',
  paidDate: asNullableString(installment.paidDate),
});
const normalizeFee = (fee: Fee): Fee => ({
  ...fee,
  id: asString(fee.id),
  studentId: asString(fee.studentId),
  studentName: asString(fee.studentName, 'Student'),
  amount: asNumber(fee.amount, 0),
  dueDate: asString(fee.dueDate),
  status: ['paid', 'partial', 'due'].includes(asString(fee.status)) ? fee.status : 'due',
  paidAmount: asNumber(fee.paidAmount, 0),
  paidDate: asNullableString(fee.paidDate),
  classId: asString(fee.classId),
  description: asString(fee.description, 'Fee'),
  installments: Array.isArray(fee.installments) ? fee.installments.map((item) => normalizeFeeInstallment(asRecord(item))) : [],
  paymentHistory: Array.isArray(fee.paymentHistory) ? fee.paymentHistory.map((item) => normalizeFeePayment(asRecord(item))) : [],
  receiptCount: fee.receiptCount == null ? undefined : asNumber(fee.receiptCount, 0),
});
const normalizeInvite = (invite: Invite): Invite => ({
  ...invite,
  id: asString(invite.id),
  email: asString(invite.email),
  role: ['super_admin', 'admin', 'teacher', 'student', 'parent'].includes(asString(invite.role)) ? invite.role : 'student',
  classId: asString(invite.classId),
  invitedBy: asString(invite.invitedBy),
  studentId: asNullableString(invite.studentId),
  status: ['pending', 'accepted'].includes(asString(invite.status)) ? invite.status : 'pending',
  createdAt: toIsoString(invite.createdAt),
  acceptedAt: invite.acceptedAt ? toIsoString(invite.acceptedAt) : undefined,
  expiresAt: invite.expiresAt ? toIsoString(invite.expiresAt) : undefined,
});
const normalizeAuditLog = (log: AuditLog): AuditLog => ({
  ...log,
  id: asString(log.id),
  actorId: asString(log.actorId),
  actorName: asString(log.actorName, 'Unknown User'),
  action: asString(log.action),
  entityType: ['student', 'teacher', 'lecture', 'attendance', 'marks', 'fee', 'class', 'invite', 'system'].includes(asString(log.entityType))
    ? log.entityType
    : 'system',
  entityId: asString(log.entityId),
  classId: asString(log.classId),
  createdAt: toIsoString(log.createdAt),
  metadata: asRecord(log.metadata),
});
const normalizeNotification = (notification: NotificationJob): NotificationJob => ({
  ...notification,
  id: asString(notification.id),
  channel: ['email', 'whatsapp'].includes(asString(notification.channel)) ? notification.channel : 'email',
  recipient: asString(notification.recipient),
  template: asString(notification.template),
  classId: asString(notification.classId),
  status: ['queued', 'sent', 'failed'].includes(asString(notification.status)) ? notification.status : 'queued',
  payload: asRecord(notification.payload) as Record<string, string | number>,
  createdAt: toIsoString(notification.createdAt),
});
const normalizeMessage = (message: Message): Message => ({
  ...message,
  id: asString(message.id),
  classId: asString(message.classId),
  fromUserId: asString(message.fromUserId),
  fromUserName: asString(message.fromUserName, 'Unknown User'),
  fromRole: ['super_admin', 'admin', 'teacher', 'student', 'parent'].includes(asString(message.fromRole)) ? message.fromRole : 'student',
  toUserId: asNullableString(message.toUserId),
  toRole: ['super_admin', 'admin', 'teacher', 'student', 'parent'].includes(asString(message.toRole)) ? message.toRole : undefined,
  subject: asNullableString(message.subject),
  message: asString(message.message),
  status: ['sent', 'read'].includes(asString(message.status)) ? message.status : 'sent',
  createdAt: toIsoString(message.createdAt),
  readAt: message.readAt ? toIsoString(message.readAt) : undefined,
});
const normalizeReportCardMark = (mark: Record<string, unknown>) => ({
  subject: asString(mark.subject, 'General'),
  examType: asString(mark.examType, 'Exam'),
  examName: asString(mark.examName, 'Assessment'),
  examDate: asString(mark.examDate, ''),
  totalMarks: asNumber(mark.totalMarks, 0),
  obtainedMarks: asNumber(mark.obtainedMarks, 0),
  percentage: asNumber(mark.percentage, 0),
});
const normalizeReportCard = (report: ReportCard): ReportCard => ({
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
  marks: Array.isArray(report.marks) ? report.marks.map((item) => normalizeReportCardMark(asRecord(item))) : [],
  aiSummary: asNullableString(report.aiSummary),
  generatedBy: asString(report.generatedBy),
  generatedAt: toIsoString(report.generatedAt),
  updatedAt: report.updatedAt ? toIsoString(report.updatedAt) : undefined,
  aiStatus: ['not_requested', 'pending', 'ready', 'failed'].includes(asString(report.aiStatus)) ? report.aiStatus : 'not_requested',
});
const normalizeAnalyticsSnapshot = (snapshot: AnalyticsSnapshot): AnalyticsSnapshot => ({
  ...snapshot,
  id: asString(snapshot.id),
  classId: asString(snapshot.classId),
  periodLabel: asString(snapshot.periodLabel, 'Current Period'),
  attendancePercentage: asNumber(snapshot.attendancePercentage, 0),
  passPercentage: asNumber(snapshot.passPercentage, 0),
  topStudents: asStringArray(snapshot.topStudents),
  weakStudents: asStringArray(snapshot.weakStudents),
  aiSummary: asNullableString(snapshot.aiSummary),
  createdAt: toIsoString(snapshot.createdAt),
  updatedAt: snapshot.updatedAt ? toIsoString(snapshot.updatedAt) : undefined,
  aiStatus: ['not_requested', 'pending', 'ready', 'failed'].includes(asString(snapshot.aiStatus)) ? snapshot.aiStatus : 'not_requested',
});
const normalizeAIUsageLog = (entry: AIUsageLog): AIUsageLog => ({
  ...entry,
  id: asString(entry.id),
  classId: asString(entry.classId),
  feature: ['class_analytics', 'student_analysis', 'improvement_plan', 'admin_chat', 'report_card'].includes(asString(entry.feature))
    ? entry.feature
    : 'admin_chat',
  promptTokens: asNumber(entry.promptTokens, 0),
  completionTokens: asNumber(entry.completionTokens, 0),
  totalTokens: asNumber(entry.totalTokens, 0),
  monthKey: asString(entry.monthKey),
  createdAt: toIsoString(entry.createdAt),
});
const normalizePaymentRecord = (payment: PaymentRecord): PaymentRecord => ({
  ...payment,
  id: asString(payment.id),
  classId: asString(payment.classId),
  adminId: asString((payment as PaymentRecord & { adminId?: string; userId?: string }).adminId ?? payment.userId),
  userId: asNullableString(payment.userId),
  plan: ['free', 'standard', 'pro'].includes(asString(payment.plan)) ? payment.plan : 'free',
  amount: asNumber(payment.amount, 0),
  currency: asString(payment.currency, 'INR'),
  orderId: asString(payment.orderId),
  paymentId: asNullableString(payment.paymentId),
  subscriptionId: asNullableString((payment as PaymentRecord & { subscriptionId?: string }).subscriptionId),
  subscriptionStatus: asNullableString((payment as PaymentRecord & { subscriptionStatus?: string }).subscriptionStatus),
  refundId: asNullableString(payment.refundId),
  invoiceNumber: asNullableString((payment as PaymentRecord & { invoiceNumber?: string }).invoiceNumber),
  invoiceUrl: asNullableString(payment.invoiceUrl),
  invoicePath: asNullableString(payment.invoicePath),
  invoiceFailureReason: asNullableString(payment.invoiceFailureReason),
  failureReason: asNullableString(payment.failureReason),
  paymentMode: asNullableString((payment as PaymentRecord & { paymentMode?: string }).paymentMode),
  planExpiry: asNullableString((payment as PaymentRecord & { planExpiry?: string }).planExpiry),
  status: ['created', 'attempted', 'paid', 'failed', 'expired', 'signature_mismatch', 'refunded', 'retry_requested', 'cancelled'].includes(asString(payment.status))
    ? payment.status
    : 'created',
  createdAt: toIsoString(payment.createdAt),
  updatedAt: payment.updatedAt ? toIsoString(payment.updatedAt) : undefined,
  verifiedAt: payment.verifiedAt ? toIsoString(payment.verifiedAt) : undefined,
  refundedAt: payment.refundedAt ? toIsoString(payment.refundedAt) : undefined,
  invoiceGeneratedAt: payment.invoiceGeneratedAt ? toIsoString(payment.invoiceGeneratedAt) : undefined,
});
const normalizePricingSettings = (settings: PricingSettings): PricingSettings => ({
  ...settings,
  id: asString(settings.id, 'pricing'),
  currency: asString(settings.currency, 'INR'),
  standardMonthlyPrice: asNumber(settings.standardMonthlyPrice, 39900),
  proMonthlyPrice: asNumber(settings.proMonthlyPrice, 99900),
  updatedAt: settings.updatedAt ? toIsoString(settings.updatedAt) : undefined,
});
const normalizeBillingSettings = (settings: BillingSettings): BillingSettings => ({
  ...settings,
  standardSubscriptionPlanId: asString(settings.standardSubscriptionPlanId, ''),
  proSubscriptionPlanId: asString(settings.proSubscriptionPlanId, ''),
  companyName: asString(settings.companyName, 'TeachFlow'),
  companyAddress: asString(settings.companyAddress, 'TeachFlow Billing, India'),
  gstNumber: asString(settings.gstNumber, ''),
  updatedAt: settings.updatedAt ? toIsoString(settings.updatedAt) : undefined,
  updatedBy: asNullableString(settings.updatedBy),
});
const normalizeBillingOverview = (overview: BillingOverview): BillingOverview => ({
  ...overview,
  class: {
    ...overview.class,
    id: asString(overview.class.id),
    name: asString(overview.class.name, 'Untitled Class'),
    plan: ['free', 'standard', 'pro'].includes(asString(overview.class.plan)) ? overview.class.plan : 'free',
    planExpiry: asNullableString(overview.class.planExpiry),
    nextBillingDate: asNullableString(overview.class.nextBillingDate),
    autoRenew: asBoolean(overview.class.autoRenew, false),
    subscriptionId: asNullableString(overview.class.subscriptionId),
    subscriptionStatus: asNullableString(overview.class.subscriptionStatus),
    failedAttemptsCount: asNumber(overview.class.failedAttemptsCount, 0),
    blockedUntil: asNullableString(overview.class.blockedUntil),
  },
  payments: (overview.payments || []).map((payment) => normalizePaymentRecord(payment)),
  billingSettings: overview.billingSettings ? normalizeBillingSettings(overview.billingSettings) : undefined,
});
const normalizePlanSettings = (settings: PlanSettings): PlanSettings => {
  const normalizePlanDefinition = (
    planKey: keyof PlanSettings & CoachingClass['plan'],
    fallback: PlanSettings[CoachingClass['plan']]
  ) => {
    const rawPlan = (settings as unknown as Record<string, unknown>)[planKey];
    const record = asRecord(rawPlan);
    const features = asRecord(record.features);

    return {
      name: asString(record.name, fallback.name),
      price: asNumber(record.price, fallback.price),
      features: {
        studentsLimit: asNumber(features.studentsLimit, fallback.features.studentsLimit),
        teachersLimit: asNumber(features.teachersLimit, fallback.features.teachersLimit),
        batchesLimit: asNumber(features.batchesLimit, fallback.features.batchesLimit),
        branchesLimit: asNumber(features.branchesLimit, fallback.features.branchesLimit),
        branchesEnabled: asBoolean(features.branchesEnabled, fallback.features.branchesEnabled),
        messaging: asBoolean(features.messaging, fallback.features.messaging),
        aiReports: asBoolean(features.aiReports, fallback.features.aiReports),
        analytics: asBoolean(features.analytics, fallback.features.analytics),
      },
    };
  };

  const normalized: PlanSettings = {
    free: normalizePlanDefinition('free', DEFAULT_PLAN_SETTINGS.free),
    standard: normalizePlanDefinition('standard', DEFAULT_PLAN_SETTINGS.standard),
    pro: normalizePlanDefinition('pro', DEFAULT_PLAN_SETTINGS.pro),
    updatedAt: settings.updatedAt ? toIsoString(settings.updatedAt) : undefined,
  };
  setPlanSettingsCache(normalized);
  return normalized;
};
const normalizeGrowthEvent = (event: GrowthEvent): GrowthEvent => ({
  ...event,
  id: asString(event.id),
  type: ['landing_cta', 'signup', 'upgrade', 'login'].includes(asString(event.type)) ? event.type : 'landing_cta',
  source: asNullableString(event.source),
  plan: ['free', 'standard', 'pro'].includes(asString(event.plan)) ? event.plan : undefined,
  classId: asNullableString(event.classId),
  userId: asNullableString(event.userId),
  createdAt: toIsoString(event.createdAt),
});

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  Object.prototype.toString.call(value) === '[object Object]';

const sanitizeFirestoreData = <T>(value: T): T => {
  if (Array.isArray(value)) {
    return value
      .map((item) => sanitizeFirestoreData(item))
      .filter((item) => item !== undefined) as T;
  }

  if (isPlainObject(value)) {
    return Object.fromEntries(
      Object.entries(value)
        .map(([key, entry]) => [key, sanitizeFirestoreData(entry)])
        .filter(([, entry]) => entry !== undefined)
    ) as T;
  }

  return value;
};

const prepareUserForWrite = (user: Omit<User, 'createdAt'> & { createdAt?: string }) => {
  const normalizedRole =
    ['super_admin', 'admin', 'teacher', 'student', 'parent'].includes(asString(user.role)) ? user.role : 'student';
  const linkedStudentIds =
    normalizedRole === 'parent'
      ? asStringArray(user.linkedStudentIds ?? (user.linkedStudentId ? [user.linkedStudentId] : []))
      : [];

  return {
    ...sanitizeFirestoreData(user),
    classIds: asStringArray(user.classIds ?? (user.classId ? [user.classId] : [])),
    branchIds: asStringArray(user.branchIds),
    linkedStudentIds,
    linkedStudentId: normalizedRole === 'parent' ? asNullableString(user.linkedStudentId) ?? null : null,
    batchId: normalizedRole === 'student' ? asNullableString(user.batchId) ?? null : null,
  };
};

const prepareStudentForWrite = (student: Omit<Student, 'id' | 'classId' | 'joinedAt'> | Partial<Student>) => ({
  ...sanitizeFirestoreData(student),
  grade: asNullableString(student.grade) ?? null,
  board: asNullableString(student.board) ?? null,
  batch: asString(student.batch, 'Batch A'),
  batchId: asNullableString(student.batchId) ?? null,
});

const prepareTeacherForWrite = (teacher: Omit<Teacher, 'id' | 'classId' | 'joinedAt'> | Partial<Teacher>) => ({
  ...sanitizeFirestoreData(teacher),
  subjects: asStringArray(teacher.subjects),
  batches: asStringArray(teacher.batches),
  batchIds: asStringArray(teacher.batchIds),
  salaryType: teacher.salaryType === 'hourly' || teacher.salaryType === 'fixed' ? teacher.salaryType : null,
  hourlyRate: teacher.hourlyRate == null ? null : asNumber(teacher.hourlyRate, 0),
  fixedSalary: teacher.fixedSalary == null ? null : asNumber(teacher.fixedSalary, 0),
});

const prepareLectureForWrite = (lecture: Omit<Lecture, 'id' | 'classId'> | Partial<Lecture>) => ({
  ...sanitizeFirestoreData(lecture),
  batch: asString(lecture.batch, 'Batch A'),
  batchName: asNullableString(lecture.batchName) ?? asString(lecture.batch, 'Batch A'),
  batchId: asNullableString(lecture.batchId) ?? null,
  branchId: asNullableString(lecture.branchId) ?? null,
  branchName: asNullableString(lecture.branchName) ?? null,
  roomNumber: asNullableString(lecture.roomNumber) ?? null,
  grade: asNullableString(lecture.grade) ?? null,
  board: asNullableString(lecture.board) ?? null,
  lecMode: lecture.lecMode === 'ONLINE' || lecture.lecMode === 'OFFLINE' ? lecture.lecMode : 'OFFLINE',
  durationHours: lecture.durationHours == null ? (asNumber(lecture.duration, 60) / 60) : asNumber(lecture.durationHours, 0),
  lectureCode: buildLectureCode({
    grade: asNullableString(lecture.grade) ?? 'NA',
    board: asNullableString(lecture.board) ?? 'NA',
    subject: asString(lecture.subject, 'Subject'),
  }),
  batchCode: buildBatchCode({
    date: asString(lecture.date, new Date().toISOString()),
    lecMode: lecture.lecMode === 'ONLINE' || lecture.lecMode === 'OFFLINE' ? lecture.lecMode : 'OFFLINE',
    branchName: asNullableString(lecture.branchName) ?? asString(lecture.branchName, 'BR'),
    grade: asNullableString(lecture.grade) ?? 'NA',
    board: asNullableString(lecture.board) ?? 'NA',
    batchName: asNullableString(lecture.batchName) ?? asString(lecture.batch, 'Batch A'),
  }),
});

const prepareLeaveForWrite = (leave: Omit<Leave, 'id' | 'createdAt'> | Partial<Leave>) => ({
  ...sanitizeFirestoreData(leave),
  teacherId: asString(leave.teacherId),
  classId: asString(leave.classId),
  fromDate: asString(leave.fromDate),
  toDate: asString(leave.toDate),
  reason: asString(leave.reason),
  status: ['pending', 'approved', 'rejected'].includes(asString(leave.status)) ? leave.status : 'pending',
});

const prepareBatchForWrite = (batch: Omit<Batch, 'id' | 'classId' | 'createdAt'> | Partial<Batch>) => ({
  ...sanitizeFirestoreData(batch),
  name: asString(batch.name, 'Batch'),
  timing: asString(batch.timing, 'TBD'),
  teacherId: asNullableString(batch.teacherId) ?? null,
  teacherName: asNullableString(batch.teacherName) ?? null,
  subjects: asStringArray(batch.subjects),
});

const prepareFeeForWrite = (fee: Omit<Fee, 'id' | 'classId'> | Partial<Fee>) => ({
  ...sanitizeFirestoreData(fee),
  installments: Array.isArray(fee.installments) ? fee.installments.map((item) => sanitizeFirestoreData(item)) : [],
  paymentHistory: Array.isArray(fee.paymentHistory) ? fee.paymentHistory.map((item) => sanitizeFirestoreData(item)) : [],
});

const prepareReportForWrite = (report: Omit<ReportCard, 'id' | 'generatedAt' | 'updatedAt'> | Partial<ReportCard>) => ({
  ...sanitizeFirestoreData(report),
  marks: Array.isArray(report.marks) ? report.marks.map((item) => sanitizeFirestoreData(item)) : [],
});

const makeExpiry = () => {
  const expires = new Date();
  expires.setDate(expires.getDate() + 7);
  return expires.toISOString();
};

const ensureClassAllowsAccess = (coachingClass: CoachingClass) => {
  if (coachingClass.isActive === false) {
    throw new Error('Subscription expired. Upgrade plan to continue using this class workspace.');
  }
};

const ensureClassCanAddStudent = (coachingClass: CoachingClass) => {
  ensureClassAllowsAccess(coachingClass);
  const limit = coachingClass.limits?.students ?? classLimitsByPlan[coachingClass.plan].students;
  const current = coachingClass.studentCount ?? 0;
  if (current >= limit) {
    throw new Error(`${coachingClass.plan.charAt(0).toUpperCase() + coachingClass.plan.slice(1)} plan student limit reached.`);
  }
};

const ensureClassCanAddTeacher = (coachingClass: CoachingClass) => {
  ensureClassAllowsAccess(coachingClass);
  const limit = coachingClass.limits?.teachers ?? classLimitsByPlan[coachingClass.plan].teachers;
  const current = coachingClass.teacherCount ?? 0;
  if (current >= limit) {
    throw new Error(`${coachingClass.plan.charAt(0).toUpperCase() + coachingClass.plan.slice(1)} plan teacher limit reached.`);
  }
};

const ensureClassCanAddBatch = async (coachingClass: CoachingClass, classId: string) => {
  ensureClassAllowsAccess(coachingClass);
  const snapshot = await getDocs(classBatchesCollection(classId));
  const current = snapshot.size;
  const limit = coachingClass.limits?.batches ?? classLimitsByPlan[coachingClass.plan].batches;
  if (current >= limit) {
    throw new Error(`${coachingClass.plan.charAt(0).toUpperCase() + coachingClass.plan.slice(1)} plan batch limit reached.`);
  }
};

const getNormalizedPlanSettings = async () => {
  const snapshot = await getDoc(plansSettingsDoc);
  if (!snapshot.exists()) {
    return normalizePlanSettings(DEFAULT_PLAN_SETTINGS);
  }

  return normalizeOptionalSnapshot<PlanSettings>(snapshot, normalizePlanSettings, 'planSettings') ?? normalizePlanSettings(DEFAULT_PLAN_SETTINGS);
};

const deleteSnapshotDocs = async (
  snapshot: Awaited<ReturnType<typeof getDocs>>
) => {
  await Promise.all(snapshot.docs.map((entry) => deleteDoc(entry.ref)));
};

const sortClassesForBranchAllowance = (classes: CoachingClass[], preferredClassId?: string) =>
  [...classes].sort((left, right) => {
    if (preferredClassId) {
      if (left.id === preferredClassId) return -1;
      if (right.id === preferredClassId) return 1;
    }

    return new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime();
  });

export const firebaseService = {
  async upsertUser(user: Omit<User, 'createdAt'> & { createdAt?: string }) {
    return withErrorHandling('Failed to save user profile.', async () => {
      const userRef = doc(usersCollection, user.id);
      const existing = await getDoc(userRef);
      const preparedUser = prepareUserForWrite(user);
      const normalizedClassIds = preparedUser.classIds;

      await setDoc(
        userRef,
        sanitizeFirestoreData({
          ...preparedUser,
          classId: preparedUser.classId ?? null,
          classIds: normalizedClassIds,
          activeClassId: preparedUser.activeClassId ?? preparedUser.classId ?? null,
          createdAt: existing.exists() ? existing.data().createdAt ?? serverTimestamp() : serverTimestamp(),
          updatedAt: serverTimestamp(),
        }),
        { merge: true }
      );
      return this.getUserProfile(user.id);
    });
  },

  async linkUserToClass(userId: string, classId: string) {
    return withErrorHandling('Failed to link user to class.', async () => {
      const userRef = doc(usersCollection, userId);
      await updateDoc(userRef, {
        classIds: arrayUnion(classId),
        classId: classId,
        activeClassId: classId,
        updatedAt: serverTimestamp(),
      });
    });
  },

  async getUserProfile(userId: string) {
    return withErrorHandling('Failed to load user profile.', async () => {
      const snapshot = await getDoc(doc(usersCollection, userId));
      if (!snapshot.exists()) return null;
      return normalizeOptionalSnapshot<User>(snapshot, normalizeUser, 'user');
    });
  },

  async getClassesByIds(classIds: string[]) {
    return withErrorHandling('Failed to load classes.', async () => {
      if (classIds.length === 0) return [];
      const snapshots = await Promise.all(classIds.map((classId) => getDoc(doc(classesCollection, classId))));
      return normalizeSnapshotDocs(
        snapshots.filter((snapshot) => snapshot.exists()),
        normalizeClass,
        'class'
      );
    });
  },

  async getClassesByAdmin(adminId: string) {
    return withErrorHandling('Failed to load admin classes.', async () => {
      const snapshot = await getDocs(query(classesCollection, where('adminId', '==', adminId)));
      return normalizeSnapshotDocs(snapshot.docs, normalizeClass, 'class');
    });
  },

  async getClassBySlug(subdomain: string) {
    return withErrorHandling('Failed to load class by slug.', async () => {
      const snapshot = await getDocs(query(classesCollection, where('subdomain', '==', subdomain)));
      const classDoc = snapshot.docs[0];
      return classDoc ? normalizeDoc<CoachingClass>(classDoc, normalizeClass, 'class') : null;
    });
  },

  async getClass(classId: string) {
    return withErrorHandling('Failed to load class.', async () => {
      const snapshot = await getDoc(doc(classesCollection, classId));
      if (!snapshot.exists()) return null;
      return normalizeOptionalSnapshot<CoachingClass>(snapshot, normalizeClass, 'class');
    });
  },

  async syncAdminPlanState(
    adminId: string,
    options?: {
      targetPlan?: CoachingClass['plan'];
      reason?: 'expired' | 'manual';
      preferredClassId?: string;
      planExpiry?: Timestamp | null;
    }
  ) {
    return withErrorHandling('Failed to sync plan downgrade state.', async () => {
      const planSettings = await getNormalizedPlanSettings();
      const snapshot = await getDocs(query(classesCollection, where('adminId', '==', adminId)));
      const adminClasses = snapshot.docs
        .map((entry) => {
          const normalized = normalizeDoc<CoachingClass>(entry, normalizeClass, 'class');
          if (!normalized) return null;
          const raw = entry.data();
          const rawPlan = ['free', 'standard', 'pro'].includes(asString(raw.plan)) ? (raw.plan as CoachingClass['plan']) : normalized.plan;
          const rawPlanExpiry = raw.planExpiry ? toIsoString(raw.planExpiry as FirestoreDate) : normalized.planExpiry;
          return {
            snapshot: entry,
            classData: normalized,
            rawPlan,
            rawPlanExpiry,
          };
        })
        .filter((item): item is NonNullable<typeof item> => item !== null);

      if (adminClasses.length === 0) return [];

      const expiredPaidClasses = adminClasses.filter(
        (item) => item.rawPlan !== 'free' && isPlanExpired(item.rawPlanExpiry)
      );
      const targetPlan =
        options?.targetPlan ??
        (expiredPaidClasses.length > 0 ? 'free' : adminClasses.reduce<CoachingClass['plan']>((best, item) => getHigherPlan(best, item.classData.plan), 'free'));
      const planDefinition = getPlanDefinition(targetPlan, planSettings);
      const limits = getPlanLimits(targetPlan, planSettings);
      const preferredClassId = options?.preferredClassId ?? adminClasses[0]?.classData.id;
      const allowedBranchIds = new Set(
        sortClassesForBranchAllowance(adminClasses.map((item) => item.classData), preferredClassId)
          .slice(0, Math.max(1, planDefinition.features.branchesLimit))
          .map((item) => item.id)
      );
      const downgradeReason =
        options?.reason ??
        (expiredPaidClasses.length > 0 && targetPlan === 'free' ? 'expired' : undefined);

      await Promise.all(
        adminClasses.map(async (item) => {
          const coachingClass = item.classData;
          const wasPaidPlan = item.rawPlan !== 'free';
          const shouldSoftDisableBranch = !allowedBranchIds.has(coachingClass.id);
          const shouldReEnableBranch = !shouldSoftDisableBranch && coachingClass.disabledReason === PLAN_DOWNGRADED_REASON;

          await updateDoc(item.snapshot.ref, {
            plan: targetPlan,
            planExpiry:
              options?.targetPlan && targetPlan !== 'free'
                ? options.planExpiry ?? Timestamp.fromMillis(Date.now() + 30 * 24 * 60 * 60 * 1000)
                : targetPlan === 'free'
                  ? null
                  : item.rawPlanExpiry ?? null,
            nextBillingDate:
              options?.targetPlan && targetPlan !== 'free'
                ? options.planExpiry ?? Timestamp.fromMillis(Date.now() + 30 * 24 * 60 * 60 * 1000)
                : targetPlan === 'free'
                  ? null
                  : item.rawPlanExpiry ?? null,
            limits,
            isActive: shouldSoftDisableBranch ? false : shouldReEnableBranch ? true : coachingClass.isActive,
            disabledReason: shouldSoftDisableBranch
              ? PLAN_DOWNGRADED_REASON
              : shouldReEnableBranch
                ? null
                : coachingClass.disabledReason ?? null,
            settings: sanitizeFirestoreData({
              ...coachingClass.settings,
              aiEnabled: planDefinition.features.aiReports,
              previousPaidPlan: targetPlan === 'free' && wasPaidPlan ? item.rawPlan : coachingClass.settings.previousPaidPlan ?? null,
              downgradeReason: targetPlan === 'free' ? downgradeReason ?? coachingClass.settings.downgradeReason ?? null : null,
              downgradedAt: targetPlan === 'free' && downgradeReason ? new Date().toISOString() : null,
              aiUsage: {
                used: coachingClass.settings.aiUsage?.used ?? 0,
                limit:
                  targetPlan === 'free'
                    ? 5
                    : targetPlan === 'standard'
                      ? 50
                      : 200,
                lastUsed: coachingClass.settings.aiUsage?.lastUsed ?? null,
              },
            }),
            updatedAt: serverTimestamp(),
          });
        })
      );

      return this.getClassesByAdmin(adminId);
    });
  },

  async createClass(adminId: string, classData: Omit<CoachingClass, 'id' | 'adminId' | 'createdAt'>) {
    return withErrorHandling('Failed to create class.', async () => {
      const existing = await getDocs(query(classesCollection, where('subdomain', '==', classData.subdomain)));
      if (!existing.empty) {
        throw new Error('This class URL is already taken. Please choose a different subdomain.');
      }

      const planSettings = await getNormalizedPlanSettings();
      const existingClassesSnapshot = await getDocs(query(classesCollection, where('adminId', '==', adminId)));
      const existingClasses = normalizeSnapshotDocs(existingClassesSnapshot.docs, normalizeClass, 'class');
      const requestedPlan = classData.plan ?? existingClasses.reduce<CoachingClass['plan']>((best, item) => getHigherPlan(best, item.plan), 'free');
      const controllingPlan = existingClasses.length > 0 ? requestedPlan : (classData.plan ?? 'free');
      const controllingDefinition = getPlanDefinition(controllingPlan, planSettings);

      if (existingClasses.length > 0 && !controllingDefinition.features.branchesEnabled) {
        throw new Error('Branch feature not allowed in this plan.');
      }

      if (existingClasses.length >= controllingDefinition.features.branchesLimit) {
        throw new Error('Branch limit reached. Upgrade plan.');
      }

      const limits = getPlanLimits(controllingPlan, planSettings);

      const classRef = await addDoc(classesCollection, {
        ...classData,
        adminId,
        plan: controllingPlan,
        isActive: classData.isActive ?? true,
        studentCount: classData.studentCount ?? 0,
        teacherCount: classData.teacherCount ?? 0,
        limits: classData.limits ?? limits,
        settings: {
          allowSelfRegistration: classData.settings?.allowSelfRegistration ?? true,
          requireApproval: classData.settings?.requireApproval ?? false,
          aiEnabled: classData.settings?.aiEnabled ?? controllingDefinition.features.aiReports,
          aiMonthlyLimit: classData.settings?.aiMonthlyLimit ?? Number(import.meta.env.VITE_AI_MONTHLY_TOKEN_LIMIT ?? '200000'),
        },
        autoRenew: classData.autoRenew ?? false,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      await updateDoc(doc(usersCollection, adminId), {
        classIds: arrayUnion(classRef.id),
        classId: classRef.id,
        activeClassId: classRef.id,
        updatedAt: serverTimestamp(),
      });

      const snapshot = await getDoc(classRef);
      return normalizeOptionalSnapshot<CoachingClass>(snapshot, normalizeClass, 'class');
    });
  },

  async switchUserClass(userId: string, classId: string) {
    return withErrorHandling('Failed to switch class.', async () => {
      await updateDoc(doc(usersCollection, userId), {
        activeClassId: classId,
        classId,
        updatedAt: serverTimestamp(),
      });
    });
  },

  async addStudent(classId: string, studentData: Omit<Student, 'id' | 'classId' | 'joinedAt'>) {
    return withErrorHandling('Failed to add student.', async () => {
      const coachingClass = await this.getClass(classId);
      if (!coachingClass) {
        throw new Error('Class not found.');
      }
      ensureClassCanAddStudent(coachingClass);

      const docRef = await addDoc(classStudentsCollection(classId), {
        ...prepareStudentForWrite(studentData),
        classId,
        joinedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      await updateDoc(doc(classesCollection, classId), {
        studentCount: increment(1),
        updatedAt: serverTimestamp(),
      });
      const snapshot = await getDoc(docRef);
      return normalizeOptionalSnapshot<Student>(snapshot, normalizeStudent, 'student');
    });
  },

  async updateStudent(classId: string, studentId: string, studentData: Partial<Student>) {
    return withErrorHandling('Failed to update student.', async () => {
      await updateDoc(doc(classStudentsCollection(classId), studentId), {
        ...prepareStudentForWrite(studentData),
        updatedAt: serverTimestamp(),
      });
    });
  },

  async deleteStudent(classId: string, studentId: string) {
    return withErrorHandling('Failed to delete student.', async () => {
      await deleteDoc(doc(classStudentsCollection(classId), studentId));
      await updateDoc(doc(classesCollection, classId), {
        studentCount: increment(-1),
        updatedAt: serverTimestamp(),
      });
    });
  },

  async addTeacher(classId: string, teacherData: Omit<Teacher, 'id' | 'classId' | 'joinedAt'>) {
    return withErrorHandling('Failed to add teacher.', async () => {
      const coachingClass = await this.getClass(classId);
      if (!coachingClass) {
        throw new Error('Class not found.');
      }
      ensureClassCanAddTeacher(coachingClass);

      const docRef = await addDoc(classTeachersCollection(classId), {
        ...prepareTeacherForWrite(teacherData),
        classId,
        joinedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      await updateDoc(doc(classesCollection, classId), {
        teacherCount: increment(1),
        updatedAt: serverTimestamp(),
      });
      const snapshot = await getDoc(docRef);
      return normalizeOptionalSnapshot<Teacher>(snapshot, normalizeTeacher, 'teacher');
    });
  },

  async updateTeacher(classId: string, teacherId: string, teacherData: Partial<Teacher>) {
    return withErrorHandling('Failed to update teacher.', async () => {
      await updateDoc(doc(classTeachersCollection(classId), teacherId), {
        ...prepareTeacherForWrite(teacherData),
        updatedAt: serverTimestamp(),
      });
    });
  },

  async deleteTeacher(classId: string, teacherId: string) {
    return withErrorHandling('Failed to delete teacher.', async () => {
      await deleteDoc(doc(classTeachersCollection(classId), teacherId));
      await updateDoc(doc(classesCollection, classId), {
        teacherCount: increment(-1),
        updatedAt: serverTimestamp(),
      });
    });
  },

  async addLeave(leaveData: Omit<Leave, 'id' | 'createdAt'>) {
    return withErrorHandling('Failed to submit leave request.', async () => {
      const docRef = await addDoc(leavesCollection, {
        ...prepareLeaveForWrite(leaveData),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      const snapshot = await getDoc(docRef);
      return normalizeOptionalSnapshot<Leave>(snapshot, normalizeLeave, 'leave');
    });
  },

  async updateLeaveStatus(leaveId: string, status: Leave['status']) {
    return withErrorHandling('Failed to update leave status.', async () => {
      await updateDoc(doc(leavesCollection, leaveId), {
        status,
        updatedAt: serverTimestamp(),
      });
    });
  },

  async addLecture(classId: string, lectureData: Omit<Lecture, 'id' | 'classId'>) {
    return withErrorHandling('Failed to create lecture.', async () => {
      const docRef = await addDoc(classLecturesCollection(classId), {
        ...prepareLectureForWrite(lectureData),
        classId,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      const snapshot = await getDoc(docRef);
      return normalizeOptionalSnapshot<Lecture>(snapshot, normalizeLecture, 'lecture');
    });
  },

  async updateLecture(classId: string, lectureId: string, lectureData: Partial<Lecture>) {
    return withErrorHandling('Failed to update lecture.', async () => {
      await updateDoc(doc(classLecturesCollection(classId), lectureId), {
        ...prepareLectureForWrite(lectureData),
        updatedAt: serverTimestamp(),
      });
    });
  },

  async deleteLecture(classId: string, lectureId: string) {
    return withErrorHandling('Failed to delete lecture.', async () => {
      await deleteDoc(doc(classLecturesCollection(classId), lectureId));
    });
  },

  async addBatch(classId: string, batchData: Omit<Batch, 'id' | 'classId' | 'createdAt'>) {
    return withErrorHandling('Failed to create batch.', async () => {
      const coachingClass = await this.getClass(classId);
      if (!coachingClass) {
        throw new Error('Class not found.');
      }
      await ensureClassCanAddBatch(coachingClass, classId);

      const docRef = await addDoc(classBatchesCollection(classId), {
        ...prepareBatchForWrite(batchData),
        classId,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      const snapshot = await getDoc(docRef);
      return normalizeOptionalSnapshot<Batch>(snapshot, normalizeBatch, 'batch');
    });
  },

  async updateBatch(classId: string, batchId: string, batchData: Partial<Batch>) {
    return withErrorHandling('Failed to update batch.', async () => {
      await updateDoc(doc(classBatchesCollection(classId), batchId), {
        ...prepareBatchForWrite(batchData),
        updatedAt: serverTimestamp(),
      });
    });
  },

  async deleteBatch(classId: string, batchId: string) {
    return withErrorHandling('Failed to delete batch.', async () => {
      await deleteDoc(doc(classBatchesCollection(classId), batchId));
    });
  },

  async saveAttendanceBatch(classId: string, entries: Attendance[]) {
    return withErrorHandling('Failed to save attendance.', async () => {
      await Promise.all(
        entries.map((entry) =>
          setDoc(doc(classAttendanceCollection(classId), entry.id), {
            ...sanitizeFirestoreData(entry),
            classId,
            updatedAt: serverTimestamp(),
          })
        )
      );
    });
  },

  async addMarks(classId: string, marksData: Omit<Marks, 'id' | 'classId'>) {
    return withErrorHandling('Failed to add marks.', async () => {
      const docRef = await addDoc(classMarksCollection(classId), {
        ...sanitizeFirestoreData(marksData),
        classId,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      const snapshot = await getDoc(docRef);
      return normalizeOptionalSnapshot<Marks>(snapshot, normalizeMarks, 'marks');
    });
  },

  async updateMarks(classId: string, marksId: string, marksData: Partial<Marks>) {
    return withErrorHandling('Failed to update marks.', async () => {
      await updateDoc(doc(classMarksCollection(classId), marksId), {
        ...sanitizeFirestoreData(marksData),
        updatedAt: serverTimestamp(),
      });
    });
  },

  async deleteMarks(classId: string, marksId: string) {
    return withErrorHandling('Failed to delete marks.', async () => {
      await deleteDoc(doc(classMarksCollection(classId), marksId));
    });
  },

  async addFee(classId: string, feeData: Omit<Fee, 'id' | 'classId'>) {
    return withErrorHandling('Failed to add fee.', async () => {
      const docRef = await addDoc(classFeesCollection(classId), {
        ...prepareFeeForWrite(feeData),
        classId,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      const snapshot = await getDoc(docRef);
      return normalizeOptionalSnapshot<Fee>(snapshot, normalizeFee, 'fee');
    });
  },

  async updateFee(classId: string, feeId: string, feeData: Partial<Fee>) {
    return withErrorHandling('Failed to update fee.', async () => {
      await updateDoc(doc(classFeesCollection(classId), feeId), {
        ...prepareFeeForWrite(feeData),
        updatedAt: serverTimestamp(),
      });
    });
  },

  async deleteFee(classId: string, feeId: string) {
    return withErrorHandling('Failed to delete fee.', async () => {
      await deleteDoc(doc(classFeesCollection(classId), feeId));
    });
  },

  async createAuditLog(classId: string, log: Omit<AuditLog, 'id' | 'createdAt' | 'classId'>) {
    return withErrorHandling('Failed to create audit log.', async () => {
      const docRef = await addDoc(classAuditCollection(classId), {
        ...sanitizeFirestoreData(log),
        classId,
        createdAt: serverTimestamp(),
      });
      const snapshot = await getDoc(docRef);
      return normalizeOptionalSnapshot<AuditLog>(snapshot, normalizeAuditLog, 'auditLog');
    });
  },

  async queueNotification(notification: Omit<NotificationJob, 'id' | 'createdAt' | 'status'>) {
    return withErrorHandling('Failed to queue notification.', async () => {
      const docRef = await addDoc(notificationsCollection, {
        ...sanitizeFirestoreData(notification),
        status: 'queued',
        createdAt: serverTimestamp(),
      });
      const snapshot = await getDoc(docRef);
      return normalizeOptionalSnapshot<NotificationJob>(snapshot, normalizeNotification, 'notification');
    });
  },

  async createMessage(messageData: Omit<Message, 'id' | 'createdAt' | 'status' | 'readAt'>) {
    return withErrorHandling('Failed to send message.', async () => {
      const docRef = await addDoc(messagesCollection, {
        ...sanitizeFirestoreData(messageData),
        status: 'sent',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      const snapshot = await getDoc(docRef);
      return normalizeOptionalSnapshot<Message>(snapshot, normalizeMessage, 'message');
    });
  },

  async markMessageAsRead(messageId: string) {
    return withErrorHandling('Failed to mark message as read.', async () => {
      await updateDoc(doc(messagesCollection, messageId), {
        status: 'read',
        readAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    });
  },

  subscribeToMessagesForClass(classId: string, callback: (messages: Message[]) => void, onError?: (error: Error) => void) {
    return onSnapshot(
      query(messagesCollection, where('classId', '==', classId), orderBy('createdAt', 'desc')),
      (snapshot) => callback(normalizeSnapshotDocs(snapshot.docs, normalizeMessage, 'message')),
      (error) => onError?.(new ServiceError('Failed to listen to messages.', error))
    );
  },

  subscribeToMessagesForUser(
    classId: string,
    userId: string,
    callback: (messages: Message[]) => void,
    onError?: (error: Error) => void
  ) {
    return onSnapshot(
      query(messagesCollection, where('classId', '==', classId), where('toUserId', '==', userId), orderBy('createdAt', 'desc')),
      (snapshot) => callback(normalizeSnapshotDocs(snapshot.docs, normalizeMessage, 'message')),
      (error) => onError?.(new ServiceError('Failed to listen to user messages.', error))
    );
  },

  subscribeToMessagesSentByUser(
    classId: string,
    userId: string,
    callback: (messages: Message[]) => void,
    onError?: (error: Error) => void
  ) {
    return onSnapshot(
      query(messagesCollection, where('classId', '==', classId), where('fromUserId', '==', userId), orderBy('createdAt', 'desc')),
      (snapshot) => callback(normalizeSnapshotDocs(snapshot.docs, normalizeMessage, 'message')),
      (error) => onError?.(new ServiceError('Failed to listen to sent messages.', error))
    );
  },

  async createReport(reportData: Omit<ReportCard, 'id' | 'generatedAt' | 'updatedAt'>) {
    return withErrorHandling('Failed to create report card.', async () => {
      const docRef = await addDoc(reportsCollection, {
        ...prepareReportForWrite(reportData),
        aiStatus: reportData.aiStatus ?? 'not_requested',
        generatedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      const snapshot = await getDoc(docRef);
      return normalizeOptionalSnapshot<ReportCard>(snapshot, normalizeReportCard, 'report');
    });
  },

  async updateReport(reportId: string, reportData: Partial<ReportCard>) {
    return withErrorHandling('Failed to update report card.', async () => {
      await updateDoc(doc(reportsCollection, reportId), {
        ...prepareReportForWrite(reportData),
        updatedAt: serverTimestamp(),
      });
    });
  },

  subscribeToReportsByStudent(
    classId: string,
    studentId: string,
    callback: (reports: ReportCard[]) => void,
    onError?: (error: Error) => void
  ) {
    return onSnapshot(
      query(reportsCollection, where('classId', '==', classId), where('studentId', '==', studentId), orderBy('generatedAt', 'desc')),
      (snapshot) => callback(normalizeSnapshotDocs(snapshot.docs, normalizeReportCard, 'report')),
      (error) => onError?.(new ServiceError('Failed to listen to report cards.', error))
    );
  },

  subscribeToClassReports(classId: string, callback: (reports: ReportCard[]) => void, onError?: (error: Error) => void) {
    return onSnapshot(
      query(reportsCollection, where('classId', '==', classId), orderBy('generatedAt', 'desc')),
      (snapshot) => callback(normalizeSnapshotDocs(snapshot.docs, normalizeReportCard, 'report')),
      (error) => onError?.(new ServiceError('Failed to listen to class reports.', error))
    );
  },

  async createAnalyticsSnapshot(snapshotData: Omit<AnalyticsSnapshot, 'id' | 'createdAt' | 'updatedAt'>) {
    return withErrorHandling('Failed to create analytics snapshot.', async () => {
      const docRef = await addDoc(analyticsSnapshotsCollection, {
        ...sanitizeFirestoreData(snapshotData),
        aiStatus: snapshotData.aiStatus ?? 'not_requested',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      const snapshot = await getDoc(docRef);
      return normalizeOptionalSnapshot<AnalyticsSnapshot>(snapshot, normalizeAnalyticsSnapshot, 'analyticsSnapshot');
    });
  },

  subscribeToAnalyticsSnapshots(
    classId: string,
    callback: (snapshots: AnalyticsSnapshot[]) => void,
    onError?: (error: Error) => void
  ) {
    return onSnapshot(
      query(analyticsSnapshotsCollection, where('classId', '==', classId), orderBy('createdAt', 'desc')),
      (snapshot) => callback(normalizeSnapshotDocs(snapshot.docs, normalizeAnalyticsSnapshot, 'analyticsSnapshot')),
      (error) => onError?.(new ServiceError('Failed to listen to analytics snapshots.', error))
    );
  },

  async createAIUsageLog(entry: Omit<AIUsageLog, 'id' | 'createdAt'>) {
    return withErrorHandling('Failed to store AI usage.', async () => {
      const docRef = await addDoc(aiUsageCollection, {
        ...sanitizeFirestoreData(entry),
        createdAt: serverTimestamp(),
      });
      if (entry.feature === 'report_card') {
        const coachingClass = await this.getClass(entry.classId);
        if (coachingClass) {
          await updateDoc(doc(classesCollection, entry.classId), {
            settings: sanitizeFirestoreData({
              ...coachingClass.settings,
              aiUsage: {
                used: (coachingClass.settings.aiUsage?.used ?? 0) + 1,
                limit: coachingClass.settings.aiUsage?.limit ?? 0,
                lastUsed: new Date().toISOString(),
              },
            }),
            updatedAt: serverTimestamp(),
          });
        }
      }
      const snapshot = await getDoc(docRef);
      return normalizeOptionalSnapshot<AIUsageLog>(snapshot, normalizeAIUsageLog, 'aiUsageLog');
    });
  },

  async getAIUsageForMonth(classId: string, monthKey: string) {
    return withErrorHandling('Failed to load AI usage.', async () => {
      const snapshot = await getDocs(query(aiUsageCollection, where('classId', '==', classId), where('monthKey', '==', monthKey)));
      return snapshot.docs.reduce((sum, item) => sum + Number(item.data().totalTokens ?? 0), 0);
    });
  },

  async getAIUsageCountForMonth(classId: string, monthKey: string, feature?: AIUsageLog['feature']) {
    return withErrorHandling('Failed to load AI usage count.', async () => {
      const constraints: QueryConstraint[] = [
        where('classId', '==', classId),
        where('monthKey', '==', monthKey),
      ];
      if (feature) {
        constraints.push(where('feature', '==', feature));
      }
      const snapshot = await getDocs(query(aiUsageCollection, ...constraints));
      return snapshot.size;
    });
  },

  subscribeToAIUsageForMonth(
    classId: string,
    monthKey: string,
    callback: (entries: AIUsageLog[]) => void,
    onError?: (error: Error) => void
  ) {
    return onSnapshot(
      query(aiUsageCollection, where('classId', '==', classId), where('monthKey', '==', monthKey), orderBy('createdAt', 'desc')),
      (snapshot) => callback(normalizeSnapshotDocs(snapshot.docs, normalizeAIUsageLog, 'aiUsageLog')),
      (error) => onError?.(new ServiceError('Failed to listen to AI usage.', error))
    );
  },

  subscribeToStudents(classId: string, callback: (students: Student[]) => void, onError?: (error: Error) => void) {
    return onSnapshot(
      query(classStudentsCollection(classId), orderBy('joinedAt', 'desc')),
      (snapshot) => callback(normalizeSnapshotDocs(snapshot.docs, normalizeStudent, 'student')),
      (error) => onError?.(new ServiceError('Failed to listen to students.', error))
    );
  },

  subscribeToAllUsers(callback: (users: User[]) => void, onError?: (error: Error) => void) {
    return onSnapshot(
      usersCollection,
      (snapshot) => callback(normalizeSnapshotDocs(snapshot.docs, normalizeUser, 'user')),
      (error) => onError?.(new ServiceError('Failed to listen to users.', error))
    );
  },

  subscribeToAllClasses(callback: (classes: CoachingClass[]) => void, onError?: (error: Error) => void) {
    return onSnapshot(
      classesCollection,
      (snapshot) => callback(normalizeSnapshotDocs(snapshot.docs, normalizeClass, 'class')),
      (error) => onError?.(new ServiceError('Failed to listen to classes.', error))
    );
  },

  subscribeToPayments(callback: (payments: PaymentRecord[]) => void, onError?: (error: Error) => void) {
    return onSnapshot(
      query(paymentsCollection, orderBy('createdAt', 'desc')),
      (snapshot) => callback(normalizeSnapshotDocs(snapshot.docs, normalizePaymentRecord, 'payment')),
      (error) => onError?.(new ServiceError('Failed to listen to payments.', error))
    );
  },

  async getPaidPaymentsForClass(classId: string) {
    return withErrorHandling('Failed to load paid payments.', async () => {
      const snapshot = await getDocs(query(paymentsCollection, where('classId', '==', classId), where('status', '==', 'paid')));
      return normalizeSnapshotDocs(snapshot.docs, normalizePaymentRecord, 'payment');
    });
  },

  subscribeToAllAIUsage(callback: (entries: AIUsageLog[]) => void, onError?: (error: Error) => void) {
    return onSnapshot(
      query(aiUsageCollection, orderBy('createdAt', 'desc')),
      (snapshot) => callback(normalizeSnapshotDocs(snapshot.docs, normalizeAIUsageLog, 'aiUsageLog')),
      (error) => onError?.(new ServiceError('Failed to listen to AI usage.', error))
    );
  },

  async getPlanSettings() {
    return withErrorHandling('Failed to load plan settings.', async () => {
      return getNormalizedPlanSettings();
    });
  },

  subscribeToPlanSettings(callback: (settings: PlanSettings) => void, onError?: (error: Error) => void) {
    return onSnapshot(
      plansSettingsDoc,
      (snapshot) => {
        const normalized = snapshot.exists()
          ? normalizeOptionalSnapshot<PlanSettings>(snapshot, normalizePlanSettings, 'planSettings')
          : normalizePlanSettings(DEFAULT_PLAN_SETTINGS);
        if (normalized) {
          callback(normalized);
        }
      },
      (error) => onError?.(new ServiceError('Failed to listen to plan settings.', error))
    );
  },

  async updatePlanSettings(settings: PlanSettings) {
    return withErrorHandling('Failed to update plan settings.', async () => {
      await setDoc(
        plansSettingsDoc,
        sanitizeFirestoreData({
          free: settings.free,
          standard: settings.standard,
          pro: settings.pro,
          updatedAt: serverTimestamp(),
        }),
        { merge: true }
      );
      setPlanSettingsCache(normalizePlanSettings(settings));
    });
  },

  async getBillingSettings() {
    return withErrorHandling('Failed to load billing settings.', async () => {
      const getSettings = httpsCallable<void, BillingSettings>(billingFunctions, 'getBillingSettings');
      const response = await getSettings();
      return normalizeBillingSettings(response.data);
    });
  },

  async updateBillingSettings(settings: BillingSettings) {
    return withErrorHandling('Failed to update billing settings.', async () => {
      const updateSettings = httpsCallable<
        Partial<BillingSettings>,
        { success: boolean; billingSettings: BillingSettings }
      >(billingFunctions, 'updateBillingSettings');
      const response = await updateSettings(settings);
      return {
        ...response.data,
        billingSettings: normalizeBillingSettings(response.data.billingSettings),
      };
    });
  },

  async getBillingOverview(classId: string) {
    return withErrorHandling('Failed to load billing overview.', async () => {
      const getOverview = httpsCallable<{ classId: string }, BillingOverview>(billingFunctions, 'getAdminBillingOverview');
      const response = await getOverview({ classId });
      return normalizeBillingOverview(response.data);
    });
  },

  async createSubscription(classId: string, adminId: string) {
    return withErrorHandling('Failed to create subscription.', async () => {
      const createSubscription = httpsCallable<
        { classId: string; adminId: string },
        { success: boolean; subscriptionId: string; key: string; shortUrl?: string | null; plan: CoachingClass['plan'] }
      >(billingFunctions, 'createSubscription');
      const response = await createSubscription({ classId, adminId });
      return response.data;
    });
  },

  async cancelSubscription(classId: string, adminId: string, subscriptionId: string) {
    return withErrorHandling('Failed to cancel subscription.', async () => {
      const cancelSubscription = httpsCallable<
        { classId: string; adminId: string; subscriptionId: string },
        { success: boolean; subscriptionId: string; autoRenew: boolean }
      >(billingFunctions, 'cancelSubscription');
      const response = await cancelSubscription({ classId, adminId, subscriptionId });
      return response.data;
    });
  },

  async getPricingSettings() {
    return withErrorHandling('Failed to load pricing settings.', async () => {
      const settings = await getNormalizedPlanSettings();
      return normalizePricingSettings({
        id: 'pricing',
        currency: 'INR',
        standardMonthlyPrice: settings.standard.price * 100,
        proMonthlyPrice: settings.pro.price * 100,
        updatedAt: settings.updatedAt,
      });
    });
  },

  subscribeToPricingSettings(callback: (settings: PricingSettings) => void, onError?: (error: Error) => void) {
    return this.subscribeToPlanSettings(
      (settings) =>
        callback(
          normalizePricingSettings({
            id: 'pricing',
            currency: 'INR',
            standardMonthlyPrice: settings.standard.price * 100,
            proMonthlyPrice: settings.pro.price * 100,
            updatedAt: settings.updatedAt,
          })
        ),
      onError
    );
  },

  async updatePricingSettings(settings: Pick<PricingSettings, 'currency' | 'standardMonthlyPrice' | 'proMonthlyPrice'>) {
    return withErrorHandling('Failed to update pricing settings.', async () => {
      const currentSettings = await getNormalizedPlanSettings();
      await this.updatePlanSettings({
        ...currentSettings,
        standard: {
          ...currentSettings.standard,
          price: Math.round(settings.standardMonthlyPrice / 100),
        },
        pro: {
          ...currentSettings.pro,
          price: Math.round(settings.proMonthlyPrice / 100),
        },
      });
    });
  },

  async trackGrowthEvent(event: Omit<GrowthEvent, 'id' | 'createdAt'>) {
    return withErrorHandling('Failed to track growth event.', async () => {
      await addDoc(growthEventsCollection, {
        ...sanitizeFirestoreData(event),
        createdAt: serverTimestamp(),
      });
    });
  },

  subscribeToGrowthEvents(callback: (events: GrowthEvent[]) => void, onError?: (error: Error) => void) {
    return onSnapshot(
      query(growthEventsCollection, orderBy('createdAt', 'desc')),
      (snapshot) => callback(normalizeSnapshotDocs(snapshot.docs, normalizeGrowthEvent, 'growthEvent')),
      (error) => onError?.(new ServiceError('Failed to listen to growth events.', error))
    );
  },

  async updateClassPlan(classId: string, plan: CoachingClass['plan']) {
    return withErrorHandling('Failed to update class plan.', async () => {
      const coachingClass = await this.getClass(classId);
      if (!coachingClass) {
        throw new Error('Class not found.');
      }
      await this.syncAdminPlanState(coachingClass.adminId, {
        targetPlan: plan,
        reason: plan === 'free' ? 'manual' : undefined,
        preferredClassId: classId,
        planExpiry: plan === 'free' ? null : Timestamp.fromMillis(Date.now() + 30 * 24 * 60 * 60 * 1000),
      });
    });
  },

  async setClassActiveState(classId: string, isActive: boolean) {
    return withErrorHandling('Failed to update class status.', async () => {
      await updateDoc(doc(classesCollection, classId), {
        isActive,
        ...(isActive ? { disabledReason: null } : {}),
        updatedAt: serverTimestamp(),
      });
    });
  },

  async updateUserAdminState(
    userId: string,
    updates: Partial<Pick<User, 'role' | 'approved'>>
  ) {
    return withErrorHandling('Failed to update user.', async () => {
      const payload: Record<string, unknown> = {
        updatedAt: serverTimestamp(),
      };

      if (updates.role && ['super_admin', 'admin', 'teacher', 'student', 'parent'].includes(updates.role)) {
        payload.role = updates.role;
      }

      if (typeof updates.approved === 'boolean') {
        payload.approved = updates.approved;
      }

      await updateDoc(doc(usersCollection, userId), payload);
    });
  },

  async deleteUser(userId: string) {
    return withErrorHandling('Failed to delete user.', async () => {
      await deleteDoc(doc(usersCollection, userId));
    });
  },

  async deleteClass(classId: string) {
    return withErrorHandling('Failed to delete class.', async () => {
      const classRef = doc(classesCollection, classId);
      const classSnapshot = await getDoc(classRef);
      if (!classSnapshot.exists()) {
        throw new Error('Class not found.');
      }

      const classData = normalizeOptionalSnapshot<CoachingClass>(classSnapshot, normalizeClass, 'class');
      if (!classData) {
        throw new Error('Class data is invalid.');
      }

      const [
        studentsSnapshot,
        teachersSnapshot,
        lecturesSnapshot,
        batchesSnapshot,
        attendanceSnapshot,
        marksSnapshot,
        feesSnapshot,
        auditSnapshot,
        reportsSnapshot,
        analyticsSnapshot,
        aiUsageSnapshot,
        paymentsSnapshot,
        growthSnapshot,
        invitesSnapshot,
        messagesSnapshot,
        notificationsSnapshot,
        linkedUsersSnapshot,
      ] = await Promise.all([
        getDocs(classStudentsCollection(classId)),
        getDocs(classTeachersCollection(classId)),
        getDocs(classLecturesCollection(classId)),
        getDocs(classBatchesCollection(classId)),
        getDocs(classAttendanceCollection(classId)),
        getDocs(classMarksCollection(classId)),
        getDocs(classFeesCollection(classId)),
        getDocs(classAuditCollection(classId)),
        getDocs(query(reportsCollection, where('classId', '==', classId))),
        getDocs(query(analyticsSnapshotsCollection, where('classId', '==', classId))),
        getDocs(query(aiUsageCollection, where('classId', '==', classId))),
        getDocs(query(paymentsCollection, where('classId', '==', classId))),
        getDocs(query(growthEventsCollection, where('classId', '==', classId))),
        getDocs(query(invitesCollection, where('classId', '==', classId))),
        getDocs(query(messagesCollection, where('classId', '==', classId))),
        getDocs(query(notificationsCollection, where('classId', '==', classId))),
        getDocs(query(usersCollection, where('classIds', 'array-contains', classId))),
      ]);

      await Promise.all([
        deleteSnapshotDocs(studentsSnapshot),
        deleteSnapshotDocs(teachersSnapshot),
        deleteSnapshotDocs(lecturesSnapshot),
        deleteSnapshotDocs(batchesSnapshot),
        deleteSnapshotDocs(attendanceSnapshot),
        deleteSnapshotDocs(marksSnapshot),
        deleteSnapshotDocs(feesSnapshot),
        deleteSnapshotDocs(auditSnapshot),
        deleteSnapshotDocs(reportsSnapshot),
        deleteSnapshotDocs(analyticsSnapshot),
        deleteSnapshotDocs(aiUsageSnapshot),
        deleteSnapshotDocs(paymentsSnapshot),
        deleteSnapshotDocs(growthSnapshot),
        deleteSnapshotDocs(invitesSnapshot),
        deleteSnapshotDocs(messagesSnapshot),
        deleteSnapshotDocs(notificationsSnapshot),
        Promise.all(
          linkedUsersSnapshot.docs.map(async (userSnapshot) => {
            const user = normalizeOptionalSnapshot<User>(userSnapshot, normalizeUser, 'user');
            if (!user) return;

            const nextClassIds = (user.classIds ?? []).filter((id) => id !== classId);
            await updateDoc(userSnapshot.ref, {
              classIds: nextClassIds,
              classId: user.classId === classId ? (nextClassIds[0] ?? null) : (user.classId ?? null),
              activeClassId: user.activeClassId === classId ? (nextClassIds[0] ?? null) : (user.activeClassId ?? null),
              updatedAt: serverTimestamp(),
            });
          })
        ),
      ]);

      await deleteDoc(classRef);

      if (classData.adminId) {
        const adminRef = doc(usersCollection, classData.adminId);
        const adminSnapshot = await getDoc(adminRef);
        if (adminSnapshot.exists()) {
          const adminProfile = normalizeOptionalSnapshot<User>(adminSnapshot, normalizeUser, 'user');
          if (adminProfile) {
            const nextClassIds = (adminProfile.classIds ?? []).filter((id) => id !== classId);
            await updateDoc(adminRef, {
              classIds: nextClassIds,
              classId: adminProfile.classId === classId ? (nextClassIds[0] ?? null) : (adminProfile.classId ?? null),
              activeClassId: adminProfile.activeClassId === classId ? (nextClassIds[0] ?? null) : (adminProfile.activeClassId ?? null),
              updatedAt: serverTimestamp(),
            });
          }
        }
      }
    });
  },

  async extendClassPlan(classId: string, days: 7 | 30) {
    return withErrorHandling('Failed to extend class plan.', async () => {
      const coachingClass = await this.getClass(classId);
      if (!coachingClass) {
        throw new Error('Class not found.');
      }

      const currentExpiry = coachingClass.planExpiry ? new Date(coachingClass.planExpiry).getTime() : Date.now();
      const baseTime = Number.isFinite(currentExpiry) && currentExpiry > Date.now() ? currentExpiry : Date.now();
      const nextExpiry = Timestamp.fromMillis(baseTime + days * 24 * 60 * 60 * 1000);

      await updateDoc(doc(classesCollection, classId), {
        planExpiry: nextExpiry,
        isActive: true,
        updatedAt: serverTimestamp(),
      });
    });
  },

  async updateClassBillingState(classId: string, autoRenew: boolean) {
    return withErrorHandling('Failed to update billing state.', async () => {
      const coachingClass = await this.getClass(classId);
      if (!coachingClass) {
        throw new Error('Class not found.');
      }

      const nextBillingDate = coachingClass.planExpiry ? Timestamp.fromDate(new Date(coachingClass.planExpiry)) : null;

      await updateDoc(doc(classesCollection, classId), {
        autoRenew,
        nextBillingDate: autoRenew ? nextBillingDate : null,
        updatedAt: serverTimestamp(),
      });
    });
  },

  async updateClassAIControls(
    classId: string,
    updates: { aiEnabled?: boolean; aiMonthlyLimit?: number }
  ) {
    return withErrorHandling('Failed to update AI controls.', async () => {
      const coachingClass = await this.getClass(classId);
      if (!coachingClass) {
        throw new Error('Class not found.');
      }

      await updateDoc(doc(classesCollection, classId), {
        settings: sanitizeFirestoreData({
          ...coachingClass.settings,
          ...(typeof updates.aiEnabled === 'boolean' ? { aiEnabled: updates.aiEnabled } : {}),
          ...(typeof updates.aiMonthlyLimit === 'number' ? { aiMonthlyLimit: updates.aiMonthlyLimit } : {}),
        }),
        updatedAt: serverTimestamp(),
      });
    });
  },

  async resetClassAIUsage(classId: string, monthKey: string) {
    return withErrorHandling('Failed to reset AI usage.', async () => {
      const snapshot = await getDocs(query(aiUsageCollection, where('classId', '==', classId), where('monthKey', '==', monthKey)));
      await Promise.all(snapshot.docs.map((entry) => deleteDoc(entry.ref)));
    });
  },

  subscribeToClassUsers(classId: string, callback: (users: User[]) => void, onError?: (error: Error) => void) {
    return onSnapshot(
      query(usersCollection, where('classIds', 'array-contains', classId)),
      (snapshot) => callback(normalizeSnapshotDocs(snapshot.docs, normalizeUser, 'user')),
      (error) => onError?.(new ServiceError('Failed to listen to class users.', error))
    );
  },

  subscribeToStudentByEmail(
    classId: string,
    email: string,
    callback: (student: Student | null) => void,
    onError?: (error: Error) => void
  ) {
    return onSnapshot(
      query(classStudentsCollection(classId), where('email', '==', email)),
      (snapshot) => callback(snapshot.docs[0] ? normalizeDoc<Student>(snapshot.docs[0], normalizeStudent, 'student') : null),
      (error) => onError?.(new ServiceError('Failed to listen to student profile.', error))
    );
  },

  subscribeToStudentByParentEmail(
    classId: string,
    email: string,
    callback: (student: Student | null) => void,
    onError?: (error: Error) => void
  ) {
    return onSnapshot(
      query(classStudentsCollection(classId), where('parentEmail', '==', email)),
      (snapshot) => callback(snapshot.docs[0] ? normalizeDoc<Student>(snapshot.docs[0], normalizeStudent, 'student') : null),
      (error) => onError?.(new ServiceError('Failed to listen to linked child.', error))
    );
  },

  subscribeToStudentById(
    classId: string,
    studentId: string,
    callback: (student: Student | null) => void,
    onError?: (error: Error) => void
  ) {
    return onSnapshot(
      classStudentDoc(classId, studentId),
      (snapshot) => callback(normalizeOptionalSnapshot<Student>(snapshot, normalizeStudent, 'student')),
      (error) => onError?.(new ServiceError('Failed to listen to student profile.', error))
    );
  },

  subscribeToStudentsByIds(
    classId: string,
    studentIds: string[],
    callback: (students: Student[]) => void,
    onError?: (error: Error) => void
  ) {
    if (studentIds.length === 0) {
      callback([]);
      return () => undefined;
    }

    return onSnapshot(
      query(classStudentsCollection(classId), where(documentId(), 'in', studentIds.slice(0, 10))),
      (snapshot) => callback(normalizeSnapshotDocs(snapshot.docs, normalizeStudent, 'student')),
      (error) => onError?.(new ServiceError('Failed to listen to linked students.', error))
    );
  },

  subscribeToTeachers(classId: string, onUpdate: (teachers: Teacher[]) => void, onError?: (error: Error) => void) {
    return onSnapshot(
      query(classTeachersCollection(classId), orderBy('joinedAt', 'desc')),
      (snapshot) => onUpdate(normalizeSnapshotDocs(snapshot.docs, normalizeTeacher, 'teacher')),
      (error) => onError?.(new ServiceError('Failed to listen to teachers.', error))
    );
  },

  subscribeToBatches(classId: string, callback: (batches: Batch[]) => void, onError?: (error: Error) => void) {
    return onSnapshot(
      query(classBatchesCollection(classId), orderBy('createdAt', 'asc')),
      (snapshot) => callback(normalizeSnapshotDocs(snapshot.docs, normalizeBatch, 'batch')),
      (error) => onError?.(new ServiceError('Failed to listen to batches.', error))
    );
  },

  async getPendingApprovals(classId: string) {
    return withErrorHandling('Failed to load pending approvals.', async () => {
      const q = query(
        usersCollection,
        where('classIds', 'array-contains', classId)
      );
      const snapshot = await getDocs(q);
      return normalizeSnapshotDocs(snapshot.docs, normalizeUser, 'user').filter((user) => user.approved === false);
    });
  },

  async approveUser(userId: string) {
    return withErrorHandling('Failed to approve user.', async () => {
      const userRef = doc(usersCollection, userId);
      await updateDoc(userRef, {
        approved: true,
        updatedAt: serverTimestamp(),
      });
    });
  },

  async approvePendingUser(input: {
    userId: string;
    classId: string;
    role: User['role'];
    batchId?: string;
    batchName?: string;
    linkedStudentIds?: string[];
  }) {
    return withErrorHandling('Failed to approve user with assignment.', async () => {
      const userRef = doc(usersCollection, input.userId);
      const userSnapshot = await getDoc(userRef);
      if (!userSnapshot.exists()) {
        throw new Error('Pending user not found.');
      }

      const userData = normalizeOptionalSnapshot<User>(userSnapshot, normalizeUser, 'user');
      if (!userData) {
        throw new Error('Pending user data is invalid.');
      }

      const batchName = input.batchName ?? 'Batch A';

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
          doc(classStudentsCollection(input.classId), input.userId),
          sanitizeFirestoreData({
            name: userData.name,
            email: userData.email,
            phone: '',
            batch: batchName,
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
          }),
          { merge: true }
        );

        await setDoc(
          doc(classFeesCollection(input.classId), input.userId),
          sanitizeFirestoreData({
            studentId: input.userId,
            studentName: userData.name,
            amount: 0,
            dueDate: new Date().toISOString().slice(0, 10),
            status: 'due',
            paidAmount: 0,
            classId: input.classId,
            description: 'Tuition Fee',
            installments: [],
            paymentHistory: [],
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          }),
          { merge: true }
        );
      }

      if (input.role === 'teacher') {
        await setDoc(
          doc(classTeachersCollection(input.classId), input.userId),
          sanitizeFirestoreData({
            name: userData.name,
            email: userData.email,
            phone: '',
            subjects: [],
            batches: input.batchId ? [batchName] : [],
            batchIds: input.batchId ? [input.batchId] : [],
            salary: 0,
            classId: input.classId,
            joinedAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          }),
          { merge: true }
        );
      }

      if (input.role === 'parent' && (input.linkedStudentIds?.length ?? 0) > 0) {
        await Promise.all(
          input.linkedStudentIds!.map((studentId) =>
            updateDoc(doc(classStudentsCollection(input.classId), studentId), {
              parentIds: arrayUnion(input.userId),
              updatedAt: serverTimestamp(),
            })
          )
        );
      }
    });
  },

  async rejectUser(userId: string, classId: string) {
    return withErrorHandling('Failed to reject user.', async () => {
      // Fetch user to safely remove them from the class, or delete if it's their only class
      const userRef = doc(usersCollection, userId);
      const userSnap = await getDoc(userRef);
      if (!userSnap.exists()) return;
      const data = userSnap.data();
      const currentClassIds: string[] = data.classIds || [];
      
      if (currentClassIds.length <= 1) {
        await deleteDoc(userRef); // Delete if this was their only class
      } else {
        await updateDoc(userRef, {
          classIds: currentClassIds.filter((id) => id !== classId),
          updatedAt: serverTimestamp(),
        });
      }
    });
  },

  async updateClassSettings(classId: string, settings: CoachingClass['settings']) {
    return withErrorHandling('Failed to update class settings.', async () => {
      const classRef = doc(classesCollection, classId);
      await updateDoc(classRef, {
        settings,
        updatedAt: serverTimestamp(),
      });
    });
  },

  subscribeToTeacherByEmail(
    classId: string,
    email: string,
    callback: (teacher: Teacher | null) => void,
    onError?: (error: Error) => void
  ) {
    return onSnapshot(
      query(classTeachersCollection(classId), where('email', '==', email)),
      (snapshot) => callback(snapshot.docs[0] ? normalizeDoc<Teacher>(snapshot.docs[0], normalizeTeacher, 'teacher') : null),
      (error) => onError?.(new ServiceError('Failed to listen to teacher profile.', error))
    );
  },

  subscribeToTeacherById(
    classId: string,
    teacherId: string,
    callback: (teacher: Teacher | null) => void,
    onError?: (error: Error) => void
  ) {
    return onSnapshot(
      doc(classTeachersCollection(classId), teacherId),
      (snapshot) => callback(normalizeOptionalSnapshot<Teacher>(snapshot, normalizeTeacher, 'teacher')),
      (error) => onError?.(new ServiceError('Failed to listen to teacher profile.', error))
    );
  },

  subscribeToLeavesByClass(
    classId: string,
    callback: (leaves: Leave[]) => void,
    onError?: (error: Error) => void
  ) {
    return onSnapshot(
      query(leavesCollection, where('classId', '==', classId), orderBy('createdAt', 'desc')),
      (snapshot) => callback(normalizeSnapshotDocs(snapshot.docs, normalizeLeave, 'leave')),
      (error) => onError?.(new ServiceError('Failed to listen to leaves.', error))
    );
  },

  subscribeToLeavesByTeacher(
    classId: string,
    teacherId: string,
    callback: (leaves: Leave[]) => void,
    onError?: (error: Error) => void
  ) {
    return onSnapshot(
      query(leavesCollection, where('classId', '==', classId), where('teacherId', '==', teacherId), orderBy('createdAt', 'desc')),
      (snapshot) => callback(normalizeSnapshotDocs(snapshot.docs, normalizeLeave, 'leave')),
      (error) => onError?.(new ServiceError('Failed to listen to teacher leaves.', error))
    );
  },

  async updateStudentBatch(classId: string, studentId: string, batch: { id: string; name: string }) {
    return withErrorHandling('Failed to update student batch.', async () => {
      await updateDoc(doc(classStudentsCollection(classId), studentId), {
        batchId: batch.id,
        batch: batch.name,
        updatedAt: serverTimestamp(),
      });

      await updateDoc(doc(usersCollection, studentId), {
        batchId: batch.id,
        updatedAt: serverTimestamp(),
      });
    });
  },

  subscribeToLectures(classId: string, callback: (lectures: Lecture[]) => void, onError?: (error: Error) => void) {
    return onSnapshot(
      query(classLecturesCollection(classId), orderBy('date', 'asc')),
      (snapshot) => callback(normalizeSnapshotDocs(snapshot.docs, normalizeLecture, 'lecture')),
      (error) => onError?.(new ServiceError('Failed to listen to lectures.', error))
    );
  },

  subscribeToLecturesByTeacher(
    classId: string,
    teacherId: string,
    callback: (lectures: Lecture[]) => void,
    onError?: (error: Error) => void
  ) {
    return onSnapshot(
      query(classLecturesCollection(classId), where('teacherId', '==', teacherId), orderBy('date', 'asc')),
      (snapshot) => callback(normalizeSnapshotDocs(snapshot.docs, normalizeLecture, 'lecture')),
      (error) => onError?.(new ServiceError('Failed to listen to teacher lectures.', error))
    );
  },

  subscribeToLecturesByBatch(
    classId: string,
    batch: string,
    callback: (lectures: Lecture[]) => void,
    onError?: (error: Error) => void
  ) {
    return onSnapshot(
      query(classLecturesCollection(classId), where('batch', '==', batch), orderBy('date', 'asc')),
      (snapshot) => callback(normalizeSnapshotDocs(snapshot.docs, normalizeLecture, 'lecture')),
      (error) => onError?.(new ServiceError('Failed to listen to lectures.', error))
    );
  },

  subscribeToLecturesByBatchId(
    classId: string,
    batchId: string,
    callback: (lectures: Lecture[]) => void,
    onError?: (error: Error) => void
  ) {
    return onSnapshot(
      query(classLecturesCollection(classId), where('batchId', '==', batchId), orderBy('date', 'asc')),
      (snapshot) => callback(normalizeSnapshotDocs(snapshot.docs, normalizeLecture, 'lecture')),
      (error) => onError?.(new ServiceError('Failed to listen to batch lectures.', error))
    );
  },

  subscribeToAttendance(
    classId: string,
    callback: (attendance: Attendance[]) => void,
    onError?: (error: Error) => void
  ) {
    return onSnapshot(
      classAttendanceCollection(classId),
      (snapshot) => callback(normalizeSnapshotDocs(snapshot.docs, normalizeAttendance, 'attendance')),
      (error) => onError?.(new ServiceError('Failed to listen to attendance.', error))
    );
  },

  subscribeToAttendanceByStudent(
    classId: string,
    studentId: string,
    callback: (attendance: Attendance[]) => void,
    onError?: (error: Error) => void
  ) {
    return onSnapshot(
      query(classAttendanceCollection(classId), where('studentId', '==', studentId)),
      (snapshot) => callback(normalizeSnapshotDocs(snapshot.docs, normalizeAttendance, 'attendance')),
      (error) => onError?.(new ServiceError('Failed to listen to attendance.', error))
    );
  },

  subscribeToMarks(classId: string, callback: (marks: Marks[]) => void, onError?: (error: Error) => void) {
    return onSnapshot(
      query(classMarksCollection(classId), orderBy('date', 'desc')),
      (snapshot) => callback(normalizeSnapshotDocs(snapshot.docs, normalizeMarks, 'marks')),
      (error) => onError?.(new ServiceError('Failed to listen to marks.', error))
    );
  },

  subscribeToMarksByStudent(
    classId: string,
    studentId: string,
    callback: (marks: Marks[]) => void,
    onError?: (error: Error) => void
  ) {
    return onSnapshot(
      query(classMarksCollection(classId), where('studentId', '==', studentId), orderBy('date', 'desc')),
      (snapshot) => callback(normalizeSnapshotDocs(snapshot.docs, normalizeMarks, 'marks')),
      (error) => onError?.(new ServiceError('Failed to listen to marks.', error))
    );
  },

  subscribeToFees(classId: string, callback: (fees: Fee[]) => void, onError?: (error: Error) => void) {
    return onSnapshot(
      query(classFeesCollection(classId), orderBy('dueDate', 'asc')),
      (snapshot) => callback(normalizeSnapshotDocs(snapshot.docs, normalizeFee, 'fee')),
      (error) => onError?.(new ServiceError('Failed to listen to fees.', error))
    );
  },

  subscribeToFeesByStudent(
    classId: string,
    studentId: string,
    callback: (fees: Fee[]) => void,
    onError?: (error: Error) => void
  ) {
    return onSnapshot(
      query(classFeesCollection(classId), where('studentId', '==', studentId), orderBy('dueDate', 'asc')),
      (snapshot) => callback(normalizeSnapshotDocs(snapshot.docs, normalizeFee, 'fee')),
      (error) => onError?.(new ServiceError('Failed to listen to fees.', error))
    );
  },

  async createInvite(inviteData: Omit<Invite, 'id' | 'createdAt' | 'status'>) {
    return withErrorHandling('Failed to create invite.', async () => {
      const existing = await getDocs(
        query(
          invitesCollection,
          where('email', '==', inviteData.email),
          where('classId', '==', inviteData.classId),
          where('role', '==', inviteData.role),
          where('status', '==', 'pending')
        )
      );

      const validInvite = normalizeSnapshotDocs(existing.docs, normalizeInvite, 'invite')
        .find((invite) => !invite.expiresAt || new Date(invite.expiresAt) > new Date());

      if (validInvite) {
        return validInvite;
      }

      const inviteRef = await addDoc(invitesCollection, {
        ...sanitizeFirestoreData(inviteData),
        status: 'pending',
        createdAt: serverTimestamp(),
        expiresAt: makeExpiry(),
        updatedAt: serverTimestamp(),
      });
      const snapshot = await getDoc(inviteRef);
      return normalizeOptionalSnapshot<Invite>(snapshot, normalizeInvite, 'invite');
    });
  },

  async getPendingInvitesByEmail(email: string) {
    return withErrorHandling('Failed to load invites.', async () => {
      const snapshot = await getDocs(
        query(invitesCollection, where('email', '==', email), where('status', '==', 'pending'))
      );
      return normalizeSnapshotDocs(snapshot.docs, normalizeInvite, 'invite')
        .filter((invite) => !invite.expiresAt || new Date(invite.expiresAt) > new Date());
    });
  },

  async acceptInvitesForUser(userId: string, email: string) {
    return withErrorHandling('Failed to accept invites.', async () => {
      const invites = await this.getPendingInvitesByEmail(email);
      if (invites.length === 0) return [];

      const primaryInvite = invites[0];
      const classIds = invites.map((invite) => invite.classId);
      const linkedInvite = invites.find((invite) => invite.studentId);

      await updateDoc(doc(usersCollection, userId), {
        classIds: arrayUnion(...classIds),
        classId: primaryInvite.classId,
        activeClassId: primaryInvite.classId,
        role: primaryInvite.role,
        approved: true,
        linkedStudentId: linkedInvite?.studentId ?? null,
        updatedAt: serverTimestamp(),
      });

      await Promise.all(
        invites.map((invite) =>
          updateDoc(doc(invitesCollection, invite.id), {
            status: 'accepted',
            acceptedAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          })
        )
      );

      return invites;
    });
  },
};

export { ServiceError };
