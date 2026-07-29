export type UserRole = 'admin' | 'teacher' | 'student' | 'parent' | 'super_admin';

export type PlanName = 'free' | 'standard' | 'pro';
export type PaymentStatus = 'created' | 'attempted' | 'paid' | 'failed' | 'expired' | 'signature_mismatch' | 'refunded' | 'retry_requested' | 'cancelled';
export type FeeStatus = 'paid' | 'partial' | 'due' | 'pending';
export type FeePaymentMethod = 'cash' | 'upi' | 'card' | 'bank_transfer' | 'cheque' | 'razorpay' | 'manual';
export type PaymentAdminAction = 'retry' | 'refund' | 'cancel';

export type UserProfile = {
  uid: string;
  email: string | null;
  name: string;
  role: UserRole;
  classIds: string[];
  activeClassId: string | null;
  linkedStudentIds: string[];
  linkedStudentId: string | null;
  batchId: string | null;
  approved: boolean;
};

export type CoachingClass = {
  id: string;
  name: string;
  adminId: string;
  subdomain: string;
  plan: PlanName;
  planExpiry?: string;
  autoRenew?: boolean;
  lastPaymentDate?: string;
  nextBillingDate?: string;
  subscriptionId?: string;
  subscriptionStatus?: string;
  failedAttemptsCount?: number;
  blockedUntil?: string;
  isActive: boolean;
  studentCount: number;
  teacherCount: number;
  limits: {
    students: number;
    teachers: number;
    batches: number;
    branches?: number;
  };
  settings: {
    allowSelfRegistration: boolean;
    requireApproval: boolean;
  };
  createdAt: string;
};

export type Student = {
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
};

export type Teacher = {
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
};

export type Batch = {
  id: string;
  name: string;
  timing: string;
  teacherId?: string;
  teacherName?: string;
  subjects: string[];
  classId: string;
  createdAt: string;
};

export type Lecture = {
  id: string;
  title: string;
  subject: string;
  teacherId: string;
  teacherName: string;
  batch: string;
  batchName?: string;
  batchId?: string;
  grade?: string;
  board?: string;
  branchId?: string;
  branchName?: string;
  roomNumber?: string;
  lecMode?: 'ONLINE' | 'OFFLINE';
  date: string;
  time: string;
  duration: number;
  durationHours?: number;
  lectureCode?: string;
  batchCode?: string;
  status: 'scheduled' | 'completed' | 'cancelled';
  description?: string;
  classId: string;
};

export type AttendanceRecord = {
  id: string;
  lectureId: string;
  studentId: string;
  studentName: string;
  lectureTitle?: string;
  batch?: string;
  date?: string;
  status: 'present' | 'absent';
  markedAt: string;
  markedBy: string;
  classId?: string;
};

export type MarksRecord = {
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
};

export type Fee = {
  id: string;
  studentId: string;
  studentName: string;
  amount: number;
  dueDate: string;
  status: FeeStatus;
  paidAmount: number;
  paidDate?: string;
  paymentDate?: string;
  paymentMethod?: FeePaymentMethod;
  classId: string;
  description: string;
  installments?: FeeInstallment[];
  paymentHistory?: FeePayment[];
  receiptCount?: number;
};

export type FeeInstallment = {
  id: string;
  amount: number;
  dueDate: string;
  status: 'paid' | 'due';
  paidDate?: string;
};

export type FeePayment = {
  id: string;
  amount: number;
  paidDate: string;
  method: FeePaymentMethod;
  receiptNumber: string;
  notes?: string;
  orderId?: string;
  paymentId?: string;
};

export type PaymentRecord = {
  id: string;
  classId: string;
  adminId: string;
  userId?: string;
  plan: PlanName;
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
  status: PaymentStatus;
  createdAt: string;
  updatedAt?: string;
  verifiedAt?: string;
  refundedAt?: string;
  invoiceGeneratedAt?: string;
};

export type BillingSettings = {
  standardSubscriptionPlanId: string;
  proSubscriptionPlanId: string;
  companyName: string;
  companyAddress: string;
  gstNumber: string;
  updatedAt?: string;
  updatedBy?: string;
};

export type BillingOverview = {
  class: {
    id: string;
    name: string;
    plan: PlanName;
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
};

export type AppUser = {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  classIds: string[];
  activeClassId?: string;
  linkedStudentIds?: string[];
  linkedStudentId?: string;
  approved: boolean;
};

export type MessageRecord = {
  id: string;
  classId: string;
  fromUserId: string;
  fromUserName: string;
  fromRole: UserRole;
  toUserId: string;
  toRole?: UserRole;
  subject: string;
  message: string;
  status: 'sent' | 'read';
  createdAt: string;
  readAt?: string;
};

export type PricingSettings = {
  id: string;
  currency: string;
  standardMonthlyPrice: number;
  proMonthlyPrice: number;
  updatedAt?: string;
};

export type GrowthEvent = {
  id: string;
  classId?: string;
  type: string;
  label: string;
  amount?: number;
  userId?: string;
  createdAt: string;
};

export type InviteRecord = {
  id: string;
  email: string;
  role: UserRole;
  classId: string;
  invitedBy: string;
  status: 'pending' | 'accepted' | 'rejected';
  studentId?: string;
  createdAt: string;
  expiresAt?: string;
};

export type Invite = {
  email: string;
  role: UserRole;
  classId: string;
  invitedBy: string;
  studentId?: string;
};
