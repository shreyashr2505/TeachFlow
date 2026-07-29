import {
  addDoc,
  arrayUnion,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  increment,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  Timestamp,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { billingFunctions, db, paymentFunctions } from './firebase';
import { buildBatchCode, buildLectureCode } from '../utils/teaching';
import {
  AppUser,
  AttendanceRecord,
  Batch,
  BillingOverview,
  BillingSettings,
  CoachingClass,
  Fee,
  FeeInstallment,
  FeePayment,
  GrowthEvent,
  Invite,
  InviteRecord,
  Lecture,
  MarksRecord,
  MessageRecord,
  PaymentAdminAction,
  PaymentRecord,
  PricingSettings,
  Student,
  Teacher,
  UserProfile,
  UserRole,
} from '../types/Models';

type FirestoreDate = Timestamp | string | null | undefined;
type SnapshotLike = { id: string; data: () => Record<string, unknown> };

const usersCollection = collection(db, 'users');
const classesCollection = collection(db, 'classes');
const invitesCollection = collection(db, 'invites');
const messagesCollection = collection(db, 'messages');
const paymentsCollection = collection(db, 'payments');
const growthEventsCollection = collection(db, 'growthEvents');
const pricingSettingsDoc = doc(db, 'settings', 'pricing');
const classStudentsCollection = (classId: string) => collection(db, 'classes', classId, 'students');
const classTeachersCollection = (classId: string) => collection(db, 'classes', classId, 'teachers');
const classBatchesCollection = (classId: string) => collection(db, 'classes', classId, 'batches');
const classLecturesCollection = (classId: string) => collection(db, 'classes', classId, 'lectures');
const classAttendanceCollection = (classId: string) => collection(db, 'classes', classId, 'attendance');
const classMarksCollection = (classId: string) => collection(db, 'classes', classId, 'marks');
const classFeesCollection = (classId: string) => collection(db, 'classes', classId, 'fees');
const classStudentDoc = (classId: string, studentId: string) => doc(db, 'classes', classId, 'students', studentId);
const classTeacherDoc = (classId: string, teacherId: string) => doc(db, 'classes', classId, 'teachers', teacherId);
const classBatchDoc = (classId: string, batchId: string) => doc(db, 'classes', classId, 'batches', batchId);
const classLectureDoc = (classId: string, lectureId: string) => doc(db, 'classes', classId, 'lectures', lectureId);
const classAttendanceDoc = (classId: string, attendanceId: string) => doc(db, 'classes', classId, 'attendance', attendanceId);
const classMarksDoc = (classId: string, marksId: string) => doc(db, 'classes', classId, 'marks', marksId);
const classFeeDoc = (classId: string, feeId: string) => doc(db, 'classes', classId, 'fees', feeId);

const classLimitsByPlan: Record<CoachingClass['plan'], { students: number; teachers: number; batches: number; branches: number }> = {
  free: { students: 50, teachers: 5, batches: 5, branches: 1 },
  standard: { students: 500, teachers: 25, batches: 25, branches: 3 },
  pro: { students: 5000, teachers: 100, batches: 100, branches: 10 },
};

const asString = (value: unknown, fallback = '') => (typeof value === 'string' ? value : fallback);
const asNullableString = (value: unknown) => {
  const normalized = asString(value).trim();
  return normalized.length > 0 ? normalized : undefined;
};
const asNumber = (value: unknown, fallback = 0) =>
  typeof value === 'number' && Number.isFinite(value)
    ? value
    : typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))
      ? Number(value)
      : fallback;
const asBoolean = (value: unknown, fallback = false) => (typeof value === 'boolean' ? value : fallback);
const asStringArray = (value: unknown) =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0) : [];
const toIsoString = (value: FirestoreDate, fallback = new Date().toISOString()) =>
  value instanceof Timestamp ? value.toDate().toISOString() : typeof value === 'string' ? value : fallback;

const sanitizeFirestoreData = <T,>(value: T): T => {
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeFirestoreData(item)).filter((item) => item !== undefined) as T;
  }

  if (Object.prototype.toString.call(value) === '[object Object]') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .map(([key, entry]) => [key, sanitizeFirestoreData(entry)])
        .filter(([, entry]) => entry !== undefined)
    ) as T;
  }

  return value;
};

const normalizeRole = (value: unknown): UserRole => {
  switch (value) {
    case 'admin':
    case 'teacher':
    case 'student':
    case 'parent':
    case 'super_admin':
      return value;
    default:
      return 'student';
  }
};

const mapUserProfile = (id: string, email: string | null, data: Record<string, unknown>): UserProfile => ({
  uid: id,
  email,
  name: asString(data.name, email?.split('@')[0] ?? 'TeachFlow User'),
  role: normalizeRole(data.role),
  classIds: asStringArray(data.classIds),
  activeClassId: asNullableString(data.activeClassId) ?? asNullableString(data.classId) ?? null,
  linkedStudentIds: asStringArray(data.linkedStudentIds),
  linkedStudentId: asNullableString(data.linkedStudentId) ?? null,
  batchId: asNullableString(data.batchId) ?? null,
  approved: asBoolean(data.approved, false),
});

const mapClass = (snapshot: SnapshotLike): CoachingClass => {
  const data = snapshot.data();
  const plan = ['free', 'standard', 'pro'].includes(asString(data.plan)) ? (data.plan as CoachingClass['plan']) : 'free';
  return {
    id: snapshot.id,
    name: asString(data.name, 'Untitled Class'),
    adminId: asString(data.adminId),
    subdomain: asString(data.subdomain),
    plan,
    planExpiry: asNullableString(data.planExpiry),
    autoRenew: asBoolean(data.autoRenew, false),
    lastPaymentDate: asNullableString(data.lastPaymentDate),
    nextBillingDate: asNullableString(data.nextBillingDate),
    subscriptionId: asNullableString(data.subscriptionId),
    subscriptionStatus: asNullableString(data.subscriptionStatus),
    failedAttemptsCount: asNumber(data.failedAttemptsCount, 0),
    blockedUntil: asNullableString(data.blockedUntil),
    isActive: asBoolean(data.isActive, true),
    studentCount: asNumber(data.studentCount, 0),
    teacherCount: asNumber(data.teacherCount, 0),
    limits: {
      students: asNumber((data.limits as Record<string, unknown> | undefined)?.students, classLimitsByPlan[plan].students),
      teachers: asNumber((data.limits as Record<string, unknown> | undefined)?.teachers, classLimitsByPlan[plan].teachers),
      batches: asNumber((data.limits as Record<string, unknown> | undefined)?.batches, classLimitsByPlan[plan].batches),
      branches: asNumber((data.limits as Record<string, unknown> | undefined)?.branches, classLimitsByPlan[plan].branches),
    },
    settings: {
      allowSelfRegistration: asBoolean((data.settings as Record<string, unknown> | undefined)?.allowSelfRegistration, true),
      requireApproval: asBoolean((data.settings as Record<string, unknown> | undefined)?.requireApproval, false),
    },
    createdAt: toIsoString(data.createdAt as FirestoreDate),
  };
};

const mapStudent = (snapshot: SnapshotLike): Student => {
  const data = snapshot.data();
  return {
    id: snapshot.id,
    name: asString(data.name, 'Unnamed Student'),
    email: asString(data.email),
    phone: asNullableString(data.phone),
    grade: asNullableString(data.grade),
    board: asNullableString(data.board),
    batch: asString(data.batch, 'Batch A'),
    batchId: asNullableString(data.batchId),
    parentIds: asStringArray(data.parentIds),
    parentEmail: asNullableString(data.parentEmail),
    parentId: asNullableString(data.parentId),
    parentPhone: asNullableString(data.parentPhone),
    classId: asString(data.classId),
    rollNumber: asString(data.rollNumber, 'N/A'),
    joinedAt: toIsoString(data.joinedAt as FirestoreDate),
    feeStatus: ['paid', 'partial', 'due'].includes(asString(data.feeStatus)) ? (data.feeStatus as Student['feeStatus']) : 'due',
    totalFees: asNumber(data.totalFees, 0),
    paidFees: asNumber(data.paidFees, 0),
  };
};

const mapTeacher = (snapshot: SnapshotLike): Teacher => {
  const data = snapshot.data();
  return {
    id: snapshot.id,
    name: asString(data.name, 'Unnamed Teacher'),
    email: asString(data.email),
    phone: asNullableString(data.phone),
    subjects: asStringArray(data.subjects),
    batches: asStringArray(data.batches),
    batchIds: asStringArray(data.batchIds),
    classId: asString(data.classId),
    joinedAt: toIsoString(data.joinedAt as FirestoreDate),
    salary: data.salary == null ? undefined : asNumber(data.salary, 0),
    salaryType: data.salaryType === 'hourly' || data.salaryType === 'fixed' ? data.salaryType : undefined,
    hourlyRate: data.hourlyRate == null ? undefined : asNumber(data.hourlyRate, 0),
    fixedSalary: data.fixedSalary == null ? undefined : asNumber(data.fixedSalary, 0),
  };
};

const mapBatch = (snapshot: SnapshotLike): Batch => {
  const data = snapshot.data();
  return {
    id: snapshot.id,
    name: asString(data.name, 'Untitled Batch'),
    timing: asString(data.timing, 'TBD'),
    teacherId: asNullableString(data.teacherId),
    teacherName: asNullableString(data.teacherName),
    subjects: asStringArray(data.subjects),
    classId: asString(data.classId),
    createdAt: toIsoString(data.createdAt as FirestoreDate),
  };
};

const mapLecture = (snapshot: SnapshotLike): Lecture => {
  const data = snapshot.data();
  return {
    id: snapshot.id,
    title: asString(data.title, `${asString(data.subject, 'Lecture')} Lecture`),
    subject: asString(data.subject, 'Subject'),
    teacherId: asString(data.teacherId),
    teacherName: asString(data.teacherName, 'Unknown Teacher'),
    batch: asString(data.batch, asString(data.batchName, 'Batch A')),
    batchName: asNullableString(data.batchName),
    batchId: asNullableString(data.batchId),
    grade: asNullableString(data.grade),
    board: asNullableString(data.board),
    branchId: asNullableString(data.branchId),
    branchName: asNullableString(data.branchName),
    roomNumber: asNullableString(data.roomNumber),
    lecMode: data.lecMode === 'ONLINE' || data.lecMode === 'OFFLINE' ? data.lecMode : 'OFFLINE',
    date: asString(data.date),
    time: asString(data.time),
    duration: asNumber(data.duration, 60),
    durationHours: data.durationHours == null ? undefined : asNumber(data.durationHours, 1),
    lectureCode: asNullableString(data.lectureCode),
    batchCode: asNullableString(data.batchCode),
    status: data.status === 'completed' || data.status === 'cancelled' ? data.status : 'scheduled',
    description: asNullableString(data.description),
    classId: asString(data.classId),
  };
};

const mapAttendance = (snapshot: SnapshotLike): AttendanceRecord => {
  const data = snapshot.data();
  return {
    id: snapshot.id,
    lectureId: asString(data.lectureId),
    studentId: asString(data.studentId),
    studentName: asString(data.studentName, 'Student'),
    lectureTitle: asNullableString(data.lectureTitle),
    batch: asNullableString(data.batch),
    date: asNullableString(data.date),
    status: data.status === 'absent' ? 'absent' : 'present',
    markedAt: toIsoString(data.markedAt as FirestoreDate),
    markedBy: asString(data.markedBy),
    classId: asNullableString(data.classId),
  };
};

const mapMarks = (snapshot: SnapshotLike): MarksRecord => {
  const data = snapshot.data();
  return {
    id: snapshot.id,
    studentId: asString(data.studentId),
    studentName: asString(data.studentName, 'Student'),
    subject: asString(data.subject, 'Subject'),
    examType: asString(data.examType, 'Exam'),
    examName: asString(data.examName, 'Exam'),
    totalMarks: asNumber(data.totalMarks, 0),
    obtainedMarks: asNumber(data.obtainedMarks, 0),
    date: asString(data.date),
    classId: asString(data.classId),
    teacherId: asString(data.teacherId),
    batch: asString(data.batch, 'Batch A'),
  };
};

const mapFee = (snapshot: SnapshotLike): Fee => {
  const data = snapshot.data();
  return {
    id: snapshot.id,
    studentId: asString(data.studentId),
    studentName: asString(data.studentName),
    amount: asNumber(data.amount, 0),
    dueDate: asString(data.dueDate),
    status: ['paid', 'partial', 'due', 'pending'].includes(asString(data.status)) ? (data.status as Fee['status']) : 'due',
    paidAmount: asNumber(data.paidAmount, 0),
    paidDate: asNullableString(data.paidDate),
    paymentDate: asNullableString(data.paymentDate),
    paymentMethod: asNullableString(data.paymentMethod) as Fee['paymentMethod'],
    classId: asString(data.classId),
    description: asString(data.description, 'Fee'),
    installments: Array.isArray(data.installments)
      ? data.installments.map((item, index) => mapFeeInstallment(item, `${snapshot.id}-installment-${index}`))
      : undefined,
    paymentHistory: Array.isArray(data.paymentHistory)
      ? data.paymentHistory.map((item, index) => mapFeePayment(item, `${snapshot.id}-payment-${index}`))
      : undefined,
    receiptCount: data.receiptCount == null ? undefined : asNumber(data.receiptCount, 0),
  };
};

const mapFeeInstallment = (value: unknown, fallbackId: string): FeeInstallment => {
  const item = Object.prototype.toString.call(value) === '[object Object]' ? (value as Record<string, unknown>) : {};
  return {
    id: asString(item.id, fallbackId),
    amount: asNumber(item.amount, 0),
    dueDate: asString(item.dueDate),
    status: item.status === 'paid' ? 'paid' : 'due',
    paidDate: asNullableString(item.paidDate),
  };
};

const mapFeePayment = (value: unknown, fallbackId: string): FeePayment => {
  const item = Object.prototype.toString.call(value) === '[object Object]' ? (value as Record<string, unknown>) : {};
  return {
    id: asString(item.id, fallbackId),
    amount: asNumber(item.amount, 0),
    paidDate: asString(item.paidDate),
    method: (asNullableString(item.method) as FeePayment['method']) ?? 'cash',
    receiptNumber: asString(item.receiptNumber, `RCP-${Date.now()}`),
    notes: asNullableString(item.notes),
    orderId: asNullableString(item.orderId),
    paymentId: asNullableString(item.paymentId),
  };
};

const mapPaymentRecord = (snapshot: SnapshotLike): PaymentRecord => {
  const data = snapshot.data();
  return {
    id: snapshot.id,
    classId: asString(data.classId),
    adminId: asString(data.adminId),
    userId: asNullableString(data.userId),
    plan: ['free', 'standard', 'pro'].includes(asString(data.plan)) ? (data.plan as PaymentRecord['plan']) : 'free',
    amount: asNumber(data.amount, 0),
    currency: asString(data.currency, 'INR'),
    orderId: asString(data.orderId),
    paymentId: asNullableString(data.paymentId),
    subscriptionId: asNullableString(data.subscriptionId),
    subscriptionStatus: asNullableString(data.subscriptionStatus),
    refundId: asNullableString(data.refundId),
    invoiceNumber: asNullableString(data.invoiceNumber),
    invoiceUrl: asNullableString(data.invoiceUrl),
    invoicePath: asNullableString(data.invoicePath),
    invoiceFailureReason: asNullableString(data.invoiceFailureReason),
    failureReason: asNullableString(data.failureReason),
    paymentMode: asNullableString(data.paymentMode),
    planExpiry: asNullableString(data.planExpiry),
    status: (asNullableString(data.status) as PaymentRecord['status']) ?? 'created',
    createdAt: toIsoString(data.createdAt as FirestoreDate),
    updatedAt: asNullableString(data.updatedAt) ?? (data.updatedAt instanceof Timestamp ? data.updatedAt.toDate().toISOString() : undefined),
    verifiedAt: asNullableString(data.verifiedAt) ?? (data.verifiedAt instanceof Timestamp ? data.verifiedAt.toDate().toISOString() : undefined),
    refundedAt: asNullableString(data.refundedAt) ?? (data.refundedAt instanceof Timestamp ? data.refundedAt.toDate().toISOString() : undefined),
    invoiceGeneratedAt:
      asNullableString(data.invoiceGeneratedAt) ?? (data.invoiceGeneratedAt instanceof Timestamp ? data.invoiceGeneratedAt.toDate().toISOString() : undefined),
  };
};

const normalizeBillingSettings = (value: BillingSettings): BillingSettings => ({
  standardSubscriptionPlanId: asString(value.standardSubscriptionPlanId),
  proSubscriptionPlanId: asString(value.proSubscriptionPlanId),
  companyName: asString(value.companyName),
  companyAddress: asString(value.companyAddress),
  gstNumber: asString(value.gstNumber),
  updatedAt: asNullableString(value.updatedAt),
  updatedBy: asNullableString(value.updatedBy),
});

const normalizeBillingOverview = (value: BillingOverview): BillingOverview => ({
  class: {
    id: asString(value.class?.id),
    name: asString(value.class?.name, 'TeachFlow Class'),
    plan: ['free', 'standard', 'pro'].includes(asString(value.class?.plan)) ? (value.class.plan as CoachingClass['plan']) : 'free',
    planExpiry: value.class?.planExpiry ?? null,
    nextBillingDate: value.class?.nextBillingDate ?? null,
    autoRenew: Boolean(value.class?.autoRenew),
    subscriptionId: value.class?.subscriptionId ?? null,
    subscriptionStatus: value.class?.subscriptionStatus ?? null,
    failedAttemptsCount: asNumber(value.class?.failedAttemptsCount, 0),
    blockedUntil: value.class?.blockedUntil ?? null,
  },
  payments: Array.isArray(value.payments)
    ? value.payments.map((payment) =>
        mapPaymentRecord({
          id: payment.id,
          data: () => payment as unknown as Record<string, unknown>,
        })
      )
    : [],
  billingSettings: value.billingSettings ? normalizeBillingSettings(value.billingSettings) : undefined,
});

const mapAppUser = (snapshot: SnapshotLike): AppUser => {
  const data = snapshot.data();
  return {
    id: snapshot.id,
    email: asString(data.email),
    name: asString(data.name, 'TeachFlow User'),
    role: normalizeRole(data.role),
    classIds: asStringArray(data.classIds),
    activeClassId: asNullableString(data.activeClassId),
    linkedStudentIds: asStringArray(data.linkedStudentIds),
    linkedStudentId: asNullableString(data.linkedStudentId),
    approved: asBoolean(data.approved, false),
  };
};

const mapMessage = (snapshot: SnapshotLike): MessageRecord => {
  const data = snapshot.data();
  return {
    id: snapshot.id,
    classId: asString(data.classId),
    fromUserId: asString(data.fromUserId),
    fromUserName: asString(data.fromUserName, 'TeachFlow User'),
    fromRole: normalizeRole(data.fromRole),
    toUserId: asString(data.toUserId),
    toRole: data.toRole == null ? undefined : normalizeRole(data.toRole),
    subject: asString(data.subject),
    message: asString(data.message),
    status: data.status === 'read' ? 'read' : 'sent',
    createdAt: toIsoString(data.createdAt as FirestoreDate),
    readAt:
      asNullableString(data.readAt) ??
      (data.readAt instanceof Timestamp ? data.readAt.toDate().toISOString() : undefined),
  };
};

const mapInviteRecord = (snapshot: SnapshotLike): InviteRecord => {
  const data = snapshot.data();
  return {
    id: snapshot.id,
    email: asString(data.email),
    role: normalizeRole(data.role),
    classId: asString(data.classId),
    invitedBy: asString(data.invitedBy),
    status: data.status === 'accepted' || data.status === 'rejected' ? data.status : 'pending',
    studentId: asNullableString(data.studentId),
    createdAt: toIsoString(data.createdAt as FirestoreDate),
    expiresAt:
      asNullableString(data.expiresAt) ??
      (data.expiresAt instanceof Timestamp ? data.expiresAt.toDate().toISOString() : undefined),
  };
};

const mapPricingSettings = (snapshot: { data: () => Record<string, unknown> }): PricingSettings => {
  const data = snapshot.data();
  return {
    id: asString(data.id, 'pricing'),
    currency: asString(data.currency, 'INR'),
    standardMonthlyPrice: asNumber(data.standardMonthlyPrice, 399),
    proMonthlyPrice: asNumber(data.proMonthlyPrice, 999),
    updatedAt:
      asNullableString(data.updatedAt) ??
      (data.updatedAt instanceof Timestamp ? data.updatedAt.toDate().toISOString() : undefined),
  };
};

const mapGrowthEvent = (snapshot: SnapshotLike): GrowthEvent => {
  const data = snapshot.data();
  return {
    id: snapshot.id,
    classId: asNullableString(data.classId),
    type: asString(data.type, 'event'),
    label: asString(data.label, asString(data.type, 'Event')),
    amount: data.amount == null ? undefined : asNumber(data.amount, 0),
    userId: asNullableString(data.userId),
    createdAt: toIsoString(data.createdAt as FirestoreDate),
  };
};

const prepareStudentForWrite = (student: Partial<Student>) => ({
  ...sanitizeFirestoreData(student),
  grade: asNullableString(student.grade) ?? null,
  board: asNullableString(student.board) ?? null,
  batch: asString(student.batch, 'Batch A'),
  batchId: asNullableString(student.batchId) ?? null,
  parentEmail: asNullableString(student.parentEmail) ?? null,
  parentPhone: asNullableString(student.parentPhone) ?? null,
  parentId: asNullableString(student.parentId) ?? null,
  parentIds: asStringArray(student.parentIds),
});

const prepareTeacherForWrite = (teacher: Partial<Teacher>) => ({
  ...sanitizeFirestoreData(teacher),
  subjects: asStringArray(teacher.subjects),
  batches: asStringArray(teacher.batches),
  batchIds: asStringArray(teacher.batchIds),
  salaryType: teacher.salaryType === 'hourly' || teacher.salaryType === 'fixed' ? teacher.salaryType : null,
  hourlyRate: teacher.hourlyRate == null ? null : asNumber(teacher.hourlyRate, 0),
  fixedSalary: teacher.fixedSalary == null ? null : asNumber(teacher.fixedSalary, 0),
});

const prepareBatchForWrite = (batch: Partial<Batch>) => ({
  ...sanitizeFirestoreData(batch),
  name: asString(batch.name, 'Batch'),
  timing: asString(batch.timing, 'TBD'),
  teacherId: asNullableString(batch.teacherId) ?? null,
  teacherName: asNullableString(batch.teacherName) ?? null,
  subjects: asStringArray(batch.subjects),
});

const prepareLectureForWrite = (lecture: Partial<Lecture>) => {
  const normalized = {
    ...sanitizeFirestoreData(lecture),
    title: asString(lecture.title, `${asString(lecture.subject, 'Lecture')} Lecture`),
    subject: asString(lecture.subject, 'Subject'),
    teacherId: asString(lecture.teacherId),
    teacherName: asString(lecture.teacherName, 'Unknown Teacher'),
    batch: asString(lecture.batch, lecture.batchName ?? 'Batch A'),
    batchName: asNullableString(lecture.batchName) ?? asString(lecture.batch, 'Batch A'),
    batchId: asNullableString(lecture.batchId) ?? null,
    grade: asNullableString(lecture.grade) ?? null,
    board: asNullableString(lecture.board) ?? null,
    branchId: asNullableString(lecture.branchId) ?? null,
    branchName: asNullableString(lecture.branchName) ?? null,
    roomNumber: asNullableString(lecture.roomNumber) ?? null,
    lecMode: lecture.lecMode === 'ONLINE' || lecture.lecMode === 'OFFLINE' ? lecture.lecMode : 'OFFLINE',
    date: asString(lecture.date),
    time: asString(lecture.time),
    duration: asNumber(lecture.duration, 60),
    durationHours:
      lecture.durationHours == null
        ? asNumber(lecture.duration, 60) / 60
        : asNumber(lecture.durationHours, 1),
    status: lecture.status === 'completed' || lecture.status === 'cancelled' ? lecture.status : 'scheduled',
    description: asNullableString(lecture.description) ?? null,
  };

  return {
    ...normalized,
    lectureCode: buildLectureCode({
      grade: normalized.grade ?? 'NA',
      board: normalized.board ?? 'NA',
      subject: normalized.subject,
    }),
    batchCode: buildBatchCode({
      date: normalized.date,
      lecMode: normalized.lecMode,
      branchName: normalized.branchName ?? 'BR',
      grade: normalized.grade ?? 'NA',
      board: normalized.board ?? 'NA',
      batchName: normalized.batchName ?? normalized.batch,
    }),
  };
};

const prepareMarksForWrite = (marks: Partial<MarksRecord>) => ({
  ...sanitizeFirestoreData(marks),
  studentId: asString(marks.studentId),
  studentName: asString(marks.studentName, 'Student'),
  subject: asString(marks.subject, 'Subject'),
  examType: asString(marks.examType, 'Exam'),
  examName: asString(marks.examName, 'Exam'),
  totalMarks: asNumber(marks.totalMarks, 0),
  obtainedMarks: asNumber(marks.obtainedMarks, 0),
  date: asString(marks.date),
  teacherId: asString(marks.teacherId),
  batch: asString(marks.batch, 'Batch A'),
});

const prepareFeeForWrite = (fee: Partial<Fee>) => ({
  ...sanitizeFirestoreData(fee),
  studentId: asString(fee.studentId),
  studentName: asString(fee.studentName, 'Student'),
  amount: asNumber(fee.amount, 0),
  dueDate: asString(fee.dueDate),
  status: ['paid', 'partial', 'due', 'pending'].includes(asString(fee.status)) ? fee.status : 'due',
  paidAmount: asNumber(fee.paidAmount, 0),
  paidDate: asNullableString(fee.paidDate) ?? null,
  paymentDate: asNullableString(fee.paymentDate) ?? null,
  paymentMethod: asNullableString(fee.paymentMethod) ?? null,
  description: asString(fee.description, 'Fee'),
  installments:
    fee.installments?.map((installment) => ({
      id: asString(installment.id),
      amount: asNumber(installment.amount, 0),
      dueDate: asString(installment.dueDate),
      status: installment.status === 'paid' ? 'paid' : 'due',
      paidDate: asNullableString(installment.paidDate) ?? null,
    })) ?? [],
  paymentHistory:
    fee.paymentHistory?.map((payment) => ({
      id: asString(payment.id),
      amount: asNumber(payment.amount, 0),
      paidDate: asString(payment.paidDate),
      method: asString(payment.method, 'cash'),
      receiptNumber: asString(payment.receiptNumber),
      notes: asNullableString(payment.notes) ?? null,
      orderId: asNullableString(payment.orderId) ?? null,
      paymentId: asNullableString(payment.paymentId) ?? null,
    })) ?? [],
  receiptCount: fee.receiptCount == null ? 0 : asNumber(fee.receiptCount, 0),
});

const ensureClassCanAddStudent = (coachingClass: CoachingClass) => {
  if (!coachingClass.isActive) {
    throw new Error('Subscription expired. Upgrade plan to continue using this class workspace.');
  }

  if ((coachingClass.studentCount ?? 0) >= coachingClass.limits.students) {
    throw new Error(`${coachingClass.plan} plan student limit reached.`);
  }
};

const ensureClassCanAddTeacher = (coachingClass: CoachingClass) => {
  if (!coachingClass.isActive) {
    throw new Error('Subscription expired. Upgrade plan to continue using this class workspace.');
  }

  if ((coachingClass.teacherCount ?? 0) >= coachingClass.limits.teachers) {
    throw new Error(`${coachingClass.plan} plan teacher limit reached.`);
  }
};

const ensureClassCanAddBatch = async (coachingClass: CoachingClass, classId: string) => {
  if (!coachingClass.isActive) {
    throw new Error('Subscription expired. Upgrade plan to continue using this class workspace.');
  }

  const snapshot = await getDocs(classBatchesCollection(classId));
  if (snapshot.size >= coachingClass.limits.batches) {
    throw new Error(`${coachingClass.plan} plan batch limit reached.`);
  }
};

const makeExpiry = () => {
  const expires = new Date();
  expires.setDate(expires.getDate() + 7);
  return expires.toISOString();
};

export const teachflowData = {
  async getUserProfile(userId: string, email: string | null) {
    const snapshot = await getDoc(doc(usersCollection, userId));
    if (!snapshot.exists()) {
      return null;
    }

    return mapUserProfile(snapshot.id, email, snapshot.data());
  },

  async getAllClasses() {
    const snapshot = await getDocs(classesCollection);
    return snapshot.docs.map((entry) => mapClass(entry));
  },

  async getClassesByIds(classIds: string[]) {
    if (classIds.length === 0) {
      return [];
    }

    const snapshots = await Promise.all(classIds.map((classId) => getDoc(doc(classesCollection, classId))));
    return snapshots.filter((snapshot) => snapshot.exists()).map((snapshot) => mapClass(snapshot as unknown as SnapshotLike));
  },

  async getClassesByAdmin(adminId: string) {
    const snapshot = await getDocs(query(classesCollection, where('adminId', '==', adminId)));
    return snapshot.docs.map((entry) => mapClass(entry));
  },

  async inferMembershipContexts(userId: string, email: string | null) {
    const normalizedEmail = email?.trim().toLowerCase() ?? '';
    const classes = await this.getAllClasses();

    const contexts = await Promise.all(
      classes.map(async (coachingClass) => {
        const classId = coachingClass.id;
        const [teacherSnapshot, studentSnapshot, parentIdSnapshot, parentEmailSnapshot] = await Promise.all([
          normalizedEmail ? getDocs(query(classTeachersCollection(classId), where('email', '==', normalizedEmail))) : Promise.resolve(null),
          normalizedEmail ? getDocs(query(classStudentsCollection(classId), where('email', '==', normalizedEmail))) : Promise.resolve(null),
          getDocs(query(classStudentsCollection(classId), where('parentIds', 'array-contains', userId))),
          normalizedEmail ? getDocs(query(classStudentsCollection(classId), where('parentEmail', '==', normalizedEmail))) : Promise.resolve(null),
        ]);

        const teacher = teacherSnapshot && !teacherSnapshot.empty ? mapTeacher(teacherSnapshot.docs[0] as unknown as SnapshotLike) : null;
        const student = studentSnapshot && !studentSnapshot.empty ? mapStudent(studentSnapshot.docs[0] as unknown as SnapshotLike) : null;
        const parentStudents = [
          ...(parentIdSnapshot?.docs ?? []),
          ...((parentEmailSnapshot?.docs ?? []).filter((entry) => !(parentIdSnapshot?.docs ?? []).some((item) => item.id === entry.id))),
        ].map((entry) => mapStudent(entry as unknown as SnapshotLike));

        return {
          classData: coachingClass,
          teacher,
          student,
          parentStudents,
        };
      })
    );

    return {
      adminClasses: classes.filter((item) => item.adminId === userId),
      teacherContexts: contexts.filter((entry) => entry.teacher),
      studentContexts: contexts.filter((entry) => entry.student),
      parentContexts: contexts.filter((entry) => entry.parentStudents.length > 0),
    };
  },

  async getClass(classId: string) {
    const snapshot = await getDoc(doc(classesCollection, classId));
    return snapshot.exists() ? mapClass(snapshot as unknown as SnapshotLike) : null;
  },

  subscribeToStudents(classId: string, callback: (students: Student[]) => void, onError?: (error: Error) => void) {
    return onSnapshot(
      query(classStudentsCollection(classId), orderBy('joinedAt', 'desc')),
      (snapshot) => callback(snapshot.docs.map((entry) => mapStudent(entry))),
      (error) => onError?.(error)
    );
  },

  subscribeToTeachers(classId: string, callback: (teachers: Teacher[]) => void, onError?: (error: Error) => void) {
    return onSnapshot(
      query(classTeachersCollection(classId), orderBy('joinedAt', 'desc')),
      (snapshot) => callback(snapshot.docs.map((entry) => mapTeacher(entry))),
      (error) => onError?.(error)
    );
  },

  subscribeToBatches(classId: string, callback: (batches: Batch[]) => void, onError?: (error: Error) => void) {
    return onSnapshot(
      query(classBatchesCollection(classId), orderBy('createdAt', 'asc')),
      (snapshot) => callback(snapshot.docs.map((entry) => mapBatch(entry))),
      (error) => onError?.(error)
    );
  },

  subscribeToFees(classId: string, callback: (fees: Fee[]) => void, onError?: (error: Error) => void) {
    return onSnapshot(
      query(classFeesCollection(classId), orderBy('dueDate', 'asc')),
      (snapshot) => callback(snapshot.docs.map((entry) => mapFee(entry))),
      (error) => onError?.(error)
    );
  },

  subscribeToFeesByStudent(classId: string, studentId: string, callback: (fees: Fee[]) => void, onError?: (error: Error) => void) {
    return onSnapshot(
      query(classFeesCollection(classId), where('studentId', '==', studentId)),
      (snapshot) => callback(snapshot.docs.map((entry) => mapFee(entry)).sort((left, right) => left.dueDate.localeCompare(right.dueDate))),
      (error) => onError?.(error)
    );
  },

  subscribeToAllClasses(callback: (classes: CoachingClass[]) => void, onError?: (error: Error) => void) {
    return onSnapshot(
      classesCollection,
      (snapshot) => callback(snapshot.docs.map((entry) => mapClass(entry))),
      (error) => onError?.(error)
    );
  },

  subscribeToPayments(callback: (payments: PaymentRecord[]) => void, onError?: (error: Error) => void) {
    return onSnapshot(
      query(paymentsCollection, orderBy('createdAt', 'desc')),
      (snapshot) => callback(snapshot.docs.map((entry) => mapPaymentRecord(entry))),
      (error) => onError?.(error)
    );
  },

  subscribeToLectures(classId: string, callback: (lectures: Lecture[]) => void, onError?: (error: Error) => void) {
    return onSnapshot(
      query(classLecturesCollection(classId), orderBy('date', 'asc')),
      (snapshot) =>
        callback(
          snapshot.docs
            .map((entry) => mapLecture(entry))
            .sort((left, right) => new Date(`${left.date}T${left.time}`).getTime() - new Date(`${right.date}T${right.time}`).getTime())
        ),
      (error) => onError?.(error)
    );
  },

  subscribeToLecturesByTeacher(classId: string, teacherId: string, callback: (lectures: Lecture[]) => void, onError?: (error: Error) => void) {
    return onSnapshot(
      query(classLecturesCollection(classId), where('teacherId', '==', teacherId)),
      (snapshot) =>
        callback(
          snapshot.docs
            .map((entry) => mapLecture(entry))
            .sort((left, right) => new Date(`${left.date}T${left.time}`).getTime() - new Date(`${right.date}T${right.time}`).getTime())
        ),
      (error) => onError?.(error)
    );
  },

  subscribeToLecturesByBatchId(classId: string, batchId: string, callback: (lectures: Lecture[]) => void, onError?: (error: Error) => void) {
    return onSnapshot(
      query(classLecturesCollection(classId), where('batchId', '==', batchId)),
      (snapshot) =>
        callback(
          snapshot.docs
            .map((entry) => mapLecture(entry))
            .sort((left, right) => new Date(`${left.date}T${left.time}`).getTime() - new Date(`${right.date}T${right.time}`).getTime())
        ),
      (error) => onError?.(error)
    );
  },

  subscribeToAttendance(classId: string, callback: (attendance: AttendanceRecord[]) => void, onError?: (error: Error) => void) {
    return onSnapshot(
      classAttendanceCollection(classId),
      (snapshot) =>
        callback(
          snapshot.docs
            .map((entry) => mapAttendance(entry))
            .sort((left, right) => new Date(right.date ?? right.markedAt).getTime() - new Date(left.date ?? left.markedAt).getTime())
        ),
      (error) => onError?.(error)
    );
  },

  subscribeToAttendanceByStudent(classId: string, studentId: string, callback: (attendance: AttendanceRecord[]) => void, onError?: (error: Error) => void) {
    return onSnapshot(
      query(classAttendanceCollection(classId), where('studentId', '==', studentId)),
      (snapshot) =>
        callback(
          snapshot.docs
            .map((entry) => mapAttendance(entry))
            .sort((left, right) => new Date(right.date ?? right.markedAt).getTime() - new Date(left.date ?? left.markedAt).getTime())
        ),
      (error) => onError?.(error)
    );
  },

  subscribeToMarks(classId: string, callback: (marks: MarksRecord[]) => void, onError?: (error: Error) => void) {
    return onSnapshot(
      classMarksCollection(classId),
      (snapshot) =>
        callback(
          snapshot.docs
            .map((entry) => mapMarks(entry))
            .sort((left, right) => new Date(right.date).getTime() - new Date(left.date).getTime())
        ),
      (error) => onError?.(error)
    );
  },

  subscribeToMarksByStudent(classId: string, studentId: string, callback: (marks: MarksRecord[]) => void, onError?: (error: Error) => void) {
    return onSnapshot(
      query(classMarksCollection(classId), where('studentId', '==', studentId)),
      (snapshot) =>
        callback(
          snapshot.docs
            .map((entry) => mapMarks(entry))
            .sort((left, right) => new Date(right.date).getTime() - new Date(left.date).getTime())
        ),
      (error) => onError?.(error)
    );
  },

  subscribeToStudentsByIds(classId: string, studentIds: string[], callback: (students: Student[]) => void, onError?: (error: Error) => void) {
    if (studentIds.length === 0) {
      callback([]);
      return () => undefined;
    }

    return onSnapshot(
      query(classStudentsCollection(classId), where('__name__', 'in', studentIds.slice(0, 10))),
      (snapshot) => callback(snapshot.docs.map((entry) => mapStudent(entry))),
      (error) => onError?.(error)
    );
  },

  subscribeToClassUsers(classId: string, callback: (users: AppUser[]) => void, onError?: (error: Error) => void) {
    return onSnapshot(
      query(usersCollection, where('classIds', 'array-contains', classId)),
      (snapshot) => callback(snapshot.docs.map((entry) => mapAppUser(entry))),
      (error) => onError?.(error)
    );
  },

  subscribeToMessagesForClass(classId: string, callback: (messages: MessageRecord[]) => void, onError?: (error: Error) => void) {
    return onSnapshot(
      query(messagesCollection, where('classId', '==', classId), orderBy('createdAt', 'desc')),
      (snapshot) => callback(snapshot.docs.map((entry) => mapMessage(entry))),
      (error) => onError?.(error)
    );
  },

  subscribeToMessagesForUser(classId: string, userId: string, callback: (messages: MessageRecord[]) => void, onError?: (error: Error) => void) {
    return onSnapshot(
      query(messagesCollection, where('classId', '==', classId), where('toUserId', '==', userId), orderBy('createdAt', 'desc')),
      (snapshot) => callback(snapshot.docs.map((entry) => mapMessage(entry))),
      (error) => onError?.(error)
    );
  },

  subscribeToMessagesSentByUser(classId: string, userId: string, callback: (messages: MessageRecord[]) => void, onError?: (error: Error) => void) {
    return onSnapshot(
      query(messagesCollection, where('classId', '==', classId), where('fromUserId', '==', userId), orderBy('createdAt', 'desc')),
      (snapshot) => callback(snapshot.docs.map((entry) => mapMessage(entry))),
      (error) => onError?.(error)
    );
  },

  async addStudent(classId: string, studentData: Omit<Student, 'id' | 'classId' | 'joinedAt'>) {
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
    return mapStudent(snapshot as unknown as SnapshotLike);
  },

  async updateStudent(classId: string, studentId: string, studentData: Partial<Student>) {
    await updateDoc(classStudentDoc(classId, studentId), {
      ...prepareStudentForWrite(studentData),
      updatedAt: serverTimestamp(),
    });
  },

  async deleteStudent(classId: string, studentId: string) {
    await deleteDoc(classStudentDoc(classId, studentId));
    await updateDoc(doc(classesCollection, classId), {
      studentCount: increment(-1),
      updatedAt: serverTimestamp(),
    });
  },

  async updateStudentBatch(classId: string, studentId: string, batch: { id: string; name: string }) {
    await updateDoc(classStudentDoc(classId, studentId), {
      batchId: batch.id,
      batch: batch.name,
      updatedAt: serverTimestamp(),
    });

    await updateDoc(doc(usersCollection, studentId), {
      batchId: batch.id,
      updatedAt: serverTimestamp(),
    });
  },

  async addTeacher(classId: string, teacherData: Omit<Teacher, 'id' | 'classId' | 'joinedAt'>) {
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
    return mapTeacher(snapshot as unknown as SnapshotLike);
  },

  async updateTeacher(classId: string, teacherId: string, teacherData: Partial<Teacher>) {
    await updateDoc(classTeacherDoc(classId, teacherId), {
      ...prepareTeacherForWrite(teacherData),
      updatedAt: serverTimestamp(),
    });
  },

  async deleteTeacher(classId: string, teacherId: string) {
    await deleteDoc(classTeacherDoc(classId, teacherId));
    await updateDoc(doc(classesCollection, classId), {
      teacherCount: increment(-1),
      updatedAt: serverTimestamp(),
    });
  },

  async addBatch(classId: string, batchData: Omit<Batch, 'id' | 'classId' | 'createdAt'>) {
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
    return mapBatch(snapshot as unknown as SnapshotLike);
  },

  async updateBatch(classId: string, batchId: string, batchData: Partial<Batch>) {
    await updateDoc(classBatchDoc(classId, batchId), {
      ...prepareBatchForWrite(batchData),
      updatedAt: serverTimestamp(),
    });
  },

  async deleteBatch(classId: string, batchId: string) {
    await deleteDoc(classBatchDoc(classId, batchId));
  },

  async addLecture(classId: string, lectureData: Omit<Lecture, 'id' | 'classId'>) {
    const docRef = await addDoc(classLecturesCollection(classId), {
      ...prepareLectureForWrite(lectureData),
      classId,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    const snapshot = await getDoc(docRef);
    return mapLecture(snapshot as unknown as SnapshotLike);
  },

  async updateLecture(classId: string, lectureId: string, lectureData: Partial<Lecture>) {
    await updateDoc(classLectureDoc(classId, lectureId), {
      ...prepareLectureForWrite(lectureData),
      updatedAt: serverTimestamp(),
    });
  },

  async deleteLecture(classId: string, lectureId: string) {
    await deleteDoc(classLectureDoc(classId, lectureId));
  },

  async addFee(classId: string, feeData: Omit<Fee, 'id' | 'classId'>) {
    const docRef = await addDoc(classFeesCollection(classId), {
      ...prepareFeeForWrite(feeData),
      classId,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    const snapshot = await getDoc(docRef);
    return mapFee(snapshot as unknown as SnapshotLike);
  },

  async updateFee(classId: string, feeId: string, feeData: Partial<Fee>) {
    await updateDoc(classFeeDoc(classId, feeId), {
      ...prepareFeeForWrite(feeData),
      updatedAt: serverTimestamp(),
    });
  },

  async deleteFee(classId: string, feeId: string) {
    await deleteDoc(classFeeDoc(classId, feeId));
  },

  async saveAttendanceBatch(classId: string, entries: AttendanceRecord[]) {
    await Promise.all(
      entries.map((entry) =>
        setDoc(classAttendanceDoc(classId, entry.id), {
          ...sanitizeFirestoreData(entry),
          classId,
          updatedAt: serverTimestamp(),
        })
      )
    );
  },

  async addMarks(classId: string, marksData: Omit<MarksRecord, 'id' | 'classId'>) {
    const docRef = await addDoc(classMarksCollection(classId), {
      ...prepareMarksForWrite(marksData),
      classId,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    const snapshot = await getDoc(docRef);
    return mapMarks(snapshot as unknown as SnapshotLike);
  },

  async updateMarks(classId: string, marksId: string, marksData: Partial<MarksRecord>) {
    await updateDoc(classMarksDoc(classId, marksId), {
      ...prepareMarksForWrite(marksData),
      updatedAt: serverTimestamp(),
    });
  },

  async deleteMarks(classId: string, marksId: string) {
    await deleteDoc(classMarksDoc(classId, marksId));
  },

  async getBillingSettings() {
    const getSettings = httpsCallable<void, BillingSettings>(billingFunctions, 'getBillingSettings');
    const response = await getSettings();
    return normalizeBillingSettings(response.data);
  },

  async updateBillingSettings(settings: BillingSettings) {
    const updateSettings = httpsCallable<Partial<BillingSettings>, { success: boolean; billingSettings: BillingSettings }>(
      billingFunctions,
      'updateBillingSettings'
    );
    const response = await updateSettings(settings);
    return {
      ...response.data,
      billingSettings: normalizeBillingSettings(response.data.billingSettings),
    };
  },

  async getBillingOverview(classId: string) {
    const getOverview = httpsCallable<{ classId: string }, BillingOverview>(billingFunctions, 'getAdminBillingOverview');
    const response = await getOverview({ classId });
    return normalizeBillingOverview(response.data);
  },

  async createSubscription(classId: string, adminId: string) {
    const createSubscription = httpsCallable<
      { classId: string; adminId: string },
      { success: boolean; subscriptionId: string; key: string; shortUrl?: string | null; plan: CoachingClass['plan'] }
    >(billingFunctions, 'createSubscription');
    const response = await createSubscription({ classId, adminId });
    return response.data;
  },

  async cancelSubscription(classId: string, adminId: string, subscriptionId: string) {
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

  async updateClassBillingState(classId: string, autoRenew: boolean) {
    await updateDoc(doc(classesCollection, classId), {
      autoRenew,
      updatedAt: serverTimestamp(),
    });
  },

  subscribeToAllUsers(callback: (users: AppUser[]) => void, onError?: (error: Error) => void) {
    return onSnapshot(
      query(usersCollection, orderBy('name', 'asc')),
      (snapshot) => callback(snapshot.docs.map((entry) => mapAppUser(entry))),
      (error) => onError?.(error)
    );
  },

  subscribeToGrowthEvents(callback: (events: GrowthEvent[]) => void, onError?: (error: Error) => void) {
    return onSnapshot(
      query(growthEventsCollection, orderBy('createdAt', 'desc')),
      (snapshot) => callback(snapshot.docs.map((entry) => mapGrowthEvent(entry))),
      (error) => onError?.(error)
    );
  },

  async getPricingSettings() {
    const snapshot = await getDoc(pricingSettingsDoc);
    return snapshot.exists()
      ? mapPricingSettings({ data: () => snapshot.data() })
      : {
          id: 'pricing',
          currency: 'INR',
          standardMonthlyPrice: 399,
          proMonthlyPrice: 999,
        };
  },

  async updatePricingSettings(settings: Pick<PricingSettings, 'currency' | 'standardMonthlyPrice' | 'proMonthlyPrice'>) {
    await setDoc(
      pricingSettingsDoc,
      {
        id: 'pricing',
        ...sanitizeFirestoreData(settings),
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
  },

  async createMessage(messageData: Omit<MessageRecord, 'id' | 'createdAt' | 'status' | 'readAt'>) {
    const ref = await addDoc(messagesCollection, {
      ...sanitizeFirestoreData(messageData),
      status: 'sent',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    const snapshot = await getDoc(ref);
    return mapMessage(snapshot as unknown as SnapshotLike);
  },

  async trackGrowthEvent(event: Omit<GrowthEvent, 'id' | 'createdAt'>) {
    await addDoc(growthEventsCollection, {
      ...sanitizeFirestoreData(event),
      createdAt: serverTimestamp(),
    });
  },

  async updateClassSettings(classId: string, settings: CoachingClass['settings']) {
    await updateDoc(doc(classesCollection, classId), {
      settings: sanitizeFirestoreData(settings),
      updatedAt: serverTimestamp(),
    });
  },

  async updateUserAdminState(userId: string, updates: Partial<Pick<AppUser, 'approved' | 'role'>>) {
    await updateDoc(doc(usersCollection, userId), {
      ...sanitizeFirestoreData(updates),
      updatedAt: serverTimestamp(),
    });
  },

  async deleteUser(userId: string) {
    await deleteDoc(doc(usersCollection, userId));
  },

  async deleteClass(classId: string) {
    await deleteDoc(doc(classesCollection, classId));
  },

  async setClassActiveState(classId: string, isActive: boolean) {
    await updateDoc(doc(classesCollection, classId), {
      isActive,
      updatedAt: serverTimestamp(),
    });
  },

  async extendClassPlan(classId: string, days: 7 | 30) {
    const coachingClass = await this.getClass(classId);
    if (!coachingClass) {
      throw new Error('Class not found.');
    }

    const currentExpiryMs = coachingClass.planExpiry ? new Date(coachingClass.planExpiry).getTime() : Date.now();
    const baseTime = Number.isFinite(currentExpiryMs) && currentExpiryMs > Date.now() ? currentExpiryMs : Date.now();

    await updateDoc(doc(classesCollection, classId), {
      planExpiry: Timestamp.fromMillis(baseTime + days * 24 * 60 * 60 * 1000),
      isActive: true,
      updatedAt: serverTimestamp(),
    });
  },

  async getPendingApprovals(classId: string) {
    const snapshot = await getDocs(query(usersCollection, where('classIds', 'array-contains', classId)));
    return snapshot.docs.map((entry) => mapAppUser(entry)).filter((user) => user.approved === false);
  },

  async approvePendingUser(input: {
    userId: string;
    classId: string;
    role: UserRole;
    batchId?: string;
    batchName?: string;
    linkedStudentIds?: string[];
  }) {
    const userRef = doc(usersCollection, input.userId);
    const userSnapshot = await getDoc(userRef);

    if (!userSnapshot.exists()) {
      throw new Error('Pending user not found.');
    }

    const userData = mapAppUser(userSnapshot as unknown as SnapshotLike);

    await updateDoc(userRef, {
      approved: true,
      role: input.role,
      classIds: [input.classId],
      classId: input.classId,
      activeClassId: input.classId,
      batchId: input.role === 'student' ? input.batchId ?? null : null,
      linkedStudentIds: input.role === 'parent' ? input.linkedStudentIds ?? [] : [],
      linkedStudentId: input.role === 'parent' ? input.linkedStudentIds?.[0] ?? null : null,
      updatedAt: serverTimestamp(),
    });

    if (input.role === 'student') {
      await setDoc(
        classStudentDoc(input.classId, input.userId),
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
        classTeacherDoc(input.classId, input.userId),
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
          updateDoc(classStudentDoc(input.classId, studentId), {
            parentIds: arrayUnion(input.userId),
            updatedAt: serverTimestamp(),
          })
        )
      );
    }
  },

  async rejectUser(userId: string, classId: string) {
    const userRef = doc(usersCollection, userId);
    const snapshot = await getDoc(userRef);

    if (!snapshot.exists()) {
      return;
    }

    const data = snapshot.data();
    const currentClassIds = asStringArray(data.classIds);

    if (currentClassIds.length <= 1) {
      await deleteDoc(userRef);
      return;
    }

    await updateDoc(userRef, {
      classIds: currentClassIds.filter((id) => id !== classId),
      updatedAt: serverTimestamp(),
    });
  },

  async createInvite(inviteData: Invite) {
    const existing = await getDocs(
      query(
        invitesCollection,
        where('email', '==', inviteData.email),
        where('classId', '==', inviteData.classId),
        where('role', '==', inviteData.role),
        where('status', '==', 'pending')
      )
    );

    if (!existing.empty) {
      return existing.docs[0].id;
    }

    const ref = await addDoc(invitesCollection, {
      ...sanitizeFirestoreData(inviteData),
      status: 'pending',
      createdAt: serverTimestamp(),
      expiresAt: makeExpiry(),
      updatedAt: serverTimestamp(),
    });

    return ref.id;
  },

  async linkParentToStudent(input: { classId: string; studentId: string; parentEmail: string; parentPhone?: string }) {
    const parentSnapshot = await getDocs(query(usersCollection, where('email', '==', input.parentEmail)));
    const parentUser = parentSnapshot.docs.map((entry) => mapAppUser(entry)).find((entry) => entry.role === 'parent') ?? null;

    await updateDoc(classStudentDoc(input.classId, input.studentId), {
      parentEmail: input.parentEmail,
      parentPhone: input.parentPhone ?? null,
      parentId: parentUser?.id ?? null,
      parentIds: parentUser?.id ? arrayUnion(parentUser.id) : [],
      updatedAt: serverTimestamp(),
    });

    if (parentUser) {
      await updateDoc(doc(usersCollection, parentUser.id), {
        role: 'parent',
        classIds: arrayUnion(input.classId),
        classId: input.classId,
        activeClassId: input.classId,
        linkedStudentIds: arrayUnion(input.studentId),
        linkedStudentId: parentUser.linkedStudentId ?? input.studentId,
        updatedAt: serverTimestamp(),
      });
    }
  },
};
