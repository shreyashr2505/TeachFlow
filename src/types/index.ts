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
  subscriptionPlan?: 'free' | 'standard' | 'pro';
  linkedStudentId?: string;
}

export interface CoachingClass {
  id: string;
  name: string;
  description?: string;
  logo?: string;
  subdomain: string;
  adminId: string;
  createdAt: string;
  plan: 'free' | 'standard' | 'pro';
  isActive: boolean;
  studentCount?: number;
  teacherCount?: number;
  limits: {
    students: number;
    teachers: number;
  };
  settings: {
    allowSelfRegistration: boolean;
    requireApproval: boolean;
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

export interface Student {
  id: string;
  name: string;
  email: string;
  phone?: string;
  batch: string;
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
  classId: string;
  joinedAt: string;
  salary?: number;
}

export interface Lecture {
  id: string;
  title: string;
  subject: string;
  batch: string;
  teacherId: string;
  teacherName: string;
  date: string;
  time: string;
  duration: number;
  classId: string;
  status: 'scheduled' | 'completed' | 'cancelled';
  description?: string;
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
  subjects: string[];
  classId: string;
  teacherIds: string[];
  studentCount: number;
  schedule: BatchSchedule[];
}

export interface BatchSchedule {
  day: string;
  time: string;
  subject: string;
  teacherId: string;
  duration: number;
}
