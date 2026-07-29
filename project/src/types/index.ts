export type ManagedPlan = 'free' | 'standard' | 'pro';

export interface PlanFeatures {
  studentsLimit: number;
  teachersLimit: number;
  batchesLimit: number;
  branchesLimit: number;
  branchesEnabled: boolean;
  messaging: boolean;
  aiReports: boolean;
  analytics: boolean;
}

export interface PlanDefinition {
  name: string;
  price: number;
  features: PlanFeatures;
}

export interface PlanSettings {
  free: PlanDefinition;
  standard: PlanDefinition;
  pro: PlanDefinition;
  updatedAt?: string;
}

export interface User {
  id: string;
  email: string;
  name: string;
  role: 'super_admin' | 'admin' | 'teacher' | 'student' | 'parent';
  classId?: string;
  classIds?: string[];
  activeClassId?: string;
  approved: boolean;
  createdAt: string;
  branchIds?: string[];
  fcmTokens?: string[];
  subscriptionPlan?: ManagedPlan;
  linkedStudentId?: string;
  linkedStudentIds?: string[];
  batchId?: string;
}

export interface CoachingClass {
  id: string;
  name: string;
  description?: string;
  logo?: string;
  subdomain: string;
  adminId: string;
  createdAt: string;
  plan: ManagedPlan;
  planExpiry?: string;
  autoRenew?: boolean;
  lastPaymentDate?: string;
  nextBillingDate?: string;
  subscriptionId?: string;
  subscriptionStatus?: string;
  failedAttemptsCount?: number;
  failedAttemptsWindowStart?: string;
  blockedUntil?: string;
  isActive: boolean;
  disabledReason?: string;
  studentCount?: number;
  teacherCount?: number;
  limits: {
    students: number;
    teachers: number;
    batches?: number;
    branches?: number;
  };
  settings: {
    allowSelfRegistration: boolean;
    requireApproval: boolean;
    aiEnabled?: boolean;
    aiMonthlyLimit?: number;
    previousPaidPlan?: ManagedPlan;
    downgradeReason?: 'expired' | 'manual';
    downgradedAt?: string;
    aiUsage?: {
      used: number;
      limit: number;
      lastUsed?: string;
    };
  };
}

export interface Invite {
  id: string;
  email: string;
  role: User['role'];
  classId: string;
  invitedBy: string;
  studentId?: string;
  status: 'pending' | 'accepted';
  createdAt: string;
  acceptedAt?: string;
  expiresAt?: string;
}

export interface AuditLog {
  id: string;
  actorId: string;
  actorName: string;
  action: string;
  entityType: 'student' | 'teacher' | 'lecture' | 'attendance' | 'marks' | 'fee' | 'class' | 'invite' | 'system';
  entityId: string;
  classId: string;
  createdAt: string;
  metadata?: Record<string, string | number | boolean>;
}

export interface NotificationJob {
  id: string;
  channel: 'email' | 'whatsapp';
  recipient: string;
  template: string;
  classId: string;
  status: 'queued' | 'sent' | 'failed';
  payload: Record<string, string | number>;
  createdAt: string;
}

export interface Message {
  id: string;
  classId: string;
  fromUserId: string;
  fromUserName: string;
  fromRole: User['role'];
  toUserId?: string;
  toRole?: User['role'];
  subject?: string;
  message: string;
  status: 'sent' | 'read';
  createdAt: string;
  readAt?: string;
}

export interface ReportCardMark {
  subject: string;
  examType: string;
  examName: string;
  examDate: string;
  totalMarks: number;
  obtainedMarks: number;
  percentage: number;
}

export interface ReportCard {
  id: string;
  studentId: string;
  classId: string;
  attendance: {
    total: number;
    present: number;
    absent: number;
    percentage: number;
  };
  marks: ReportCardMark[];
  aiSummary?: string;
  aiStatus: 'not_requested' | 'pending' | 'ready' | 'failed';
  generatedBy: string;
  generatedAt: string;
  updatedAt?: string;
}

export interface AnalyticsSnapshot {
  id: string;
  classId: string;
  periodLabel: string;
  attendancePercentage: number;
  passPercentage: number;
  topStudents: string[];
  weakStudents: string[];
  aiSummary?: string;
  aiStatus: 'not_requested' | 'pending' | 'ready' | 'failed';
  createdAt: string;
  updatedAt?: string;
}

export interface AIUsageLog {
  id: string;
  classId: string;
  feature: 'class_analytics' | 'student_analysis' | 'improvement_plan' | 'admin_chat' | 'report_card';
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  monthKey: string;
  createdAt: string;
}

export interface PaymentRecord {
  id: string;
  classId: string;
  adminId: string;
  userId?: string;
  plan: ManagedPlan;
  amount: number;
  currency: string;
  orderId: string;
  paymentId?: string;
  subscriptionId?: string;
  subscriptionStatus?: string;
  refundId?: string;
  invoiceNumber?: string;
  invoiceUrl?: string;
  invoicePath?: string;
  invoiceFailureReason?: string;
  failureReason?: string;
  paymentMode?: string;
  planExpiry?: string;
  status: 'created' | 'attempted' | 'paid' | 'failed' | 'expired' | 'signature_mismatch' | 'refunded' | 'retry_requested' | 'cancelled';
  createdAt: string;
  updatedAt?: string;
  verifiedAt?: string;
  refundedAt?: string;
  invoiceGeneratedAt?: string;
}

export interface PaymentOrderRecord {
  orderId: string;
  classId: string;
  adminId: string;
  plan: ManagedPlan;
  amount: number;
  currency: string;
  subscriptionId?: string;
  subscriptionStatus?: string;
  status: 'created' | 'attempted' | 'paid' | 'failed' | 'expired' | 'signature_mismatch' | 'refunded' | 'cancelled';
  paymentId?: string;
  signature?: string;
  createdAt: string;
  updatedAt?: string;
  attemptedAt?: string;
  verifiedAt?: string;
  failureReason?: string;
}

export interface BillingSettings {
  standardSubscriptionPlanId: string;
  proSubscriptionPlanId: string;
  companyName: string;
  companyAddress: string;
  gstNumber: string;
  updatedAt?: string;
  updatedBy?: string;
}

export interface BillingOverview {
  class: {
    id: string;
    name: string;
    plan: ManagedPlan;
    planExpiry?: string | null;
    nextBillingDate?: string | null;
    autoRenew: boolean;
    subscriptionId?: string | null;
    subscriptionStatus?: string | null;
    failedAttemptsCount: number;
    blockedUntil?: string | null;
  };
  payments: PaymentRecord[];
  billingSettings?: BillingSettings;
}

export interface PricingSettings {
  id: string;
  currency: string;
  standardMonthlyPrice: number;
  proMonthlyPrice: number;
  updatedAt?: string;
}

export interface GrowthEvent {
  id: string;
  type: 'landing_cta' | 'signup' | 'upgrade' | 'login';
  source?: string;
  plan?: ManagedPlan;
  classId?: string;
  userId?: string;
  createdAt: string;
}

export interface Student {
  id: string;
  name: string;
  email: string;
  phone?: string;
  grade?: string;
  board?: string;
  batch: string;
  batchId?: string;
  parentIds?: string[];
  parentEmail?: string;
  parentId?: string;
  parentPhone?: string;
  classId: string;
  rollNumber: string;
  joinedAt: string;
  feeStatus: 'paid' | 'partial' | 'due';
  totalFees: number;
  paidFees: number;
}

export interface Teacher {
  id: string;
  name: string;
  email: string;
  phone?: string;
  subjects: string[];
  batches: string[];
  batchIds?: string[];
  classId: string;
  joinedAt: string;
  salary?: number;
  salaryType?: 'hourly' | 'fixed';
  hourlyRate?: number;
  fixedSalary?: number;
}

export interface Lecture {
  id: string;
  title: string;
  subject: string;
  batch: string;
  batchName?: string;
  batchId?: string;
  teacherId: string;
  teacherName: string;
  date: string;
  time: string;
  duration: number;
  durationHours?: number;
  classId: string;
  branchId?: string;
  branchName?: string;
  roomNumber?: string;
  grade?: string;
  board?: string;
  lecMode?: 'ONLINE' | 'OFFLINE';
  lectureCode?: string;
  batchCode?: string;
  status: 'scheduled' | 'completed' | 'cancelled';
  description?: string;
}

export interface Leave {
  id: string;
  teacherId: string;
  classId: string;
  fromDate: string;
  toDate: string;
  reason: string;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: string;
  updatedAt?: string;
}

export interface Attendance {
  id: string;
  lectureId: string;
  studentId: string;
  studentName: string;
  classId?: string;
  lectureTitle?: string;
  batch?: string;
  date?: string;
  status: 'present' | 'absent';
  markedAt: string;
  markedBy: string;
}

export interface Marks {
  id: string;
  studentId: string;
  studentName: string;
  subject: string;
  examType: string;
  examName: string;
  totalMarks: number;
  obtainedMarks: number;
  date: string;
  classId: string;
  teacherId: string;
  batch: string;
}

export interface Fee {
  id: string;
  studentId: string;
  studentName: string;
  amount: number;
  dueDate: string;
  status: 'paid' | 'partial' | 'due';
  paidAmount: number;
  paidDate?: string;
  classId: string;
  description: string;
  installments?: FeeInstallment[];
  paymentHistory?: FeePayment[];
  receiptCount?: number;
}

export interface FeeInstallment {
  id: string;
  amount: number;
  dueDate: string;
  status: 'paid' | 'due';
  paidDate?: string;
}

export interface FeePayment {
  id: string;
  amount: number;
  paidDate: string;
  method: 'cash' | 'upi' | 'card' | 'bank_transfer' | 'cheque';
  receiptNumber: string;
  notes?: string;
}

export interface Batch {
  id: string;
  name: string;
  timing: string;
  teacherId?: string;
  teacherName?: string;
  subjects: string[];
  classId: string;
  createdAt: string;
}
