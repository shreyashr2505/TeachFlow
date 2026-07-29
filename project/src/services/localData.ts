import {
  Attendance,
  CoachingClass,
  Fee,
  Lecture,
  Marks,
  Student,
  Teacher,
  User,
} from '../types';

type StoredUser = User & { password: string };

interface DataStore {
  users: StoredUser[];
  classes: CoachingClass[];
  students: Student[];
  teachers: Teacher[];
  lectures: Lecture[];
  attendance: Attendance[];
  marks: Marks[];
  fees: Fee[];
}

const STORAGE_KEY = 'teachflow_store_v2';
const SESSION_USER_KEY = 'teachflow_user';
const SESSION_CLASS_KEY = 'teachflow_class';

const createId = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const seedStore = (): DataStore => {
  const classId = 'class-demo-1';
  const adminId = 'user-admin-1';
  const teacherUserId = 'user-teacher-1';
  const studentUserId = 'user-student-1';
  const parentUserId = 'user-parent-1';
  const teacherId = 'teacher-1';
  const studentId = 'student-1';
  const today = new Date();
  const todayIso = today.toISOString();
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);

  return {
    users: [
      {
        id: adminId,
        email: 'admin@teachflow.com',
        name: 'Admin User',
        role: 'admin',
        classId,
        approved: true,
        createdAt: todayIso,
        password: 'password123',
      },
      {
        id: teacherUserId,
        email: 'teacher@teachflow.com',
        name: 'John Teacher',
        role: 'teacher',
        classId,
        approved: true,
        createdAt: todayIso,
        password: 'password123',
      },
      {
        id: studentUserId,
        email: 'student@teachflow.com',
        name: 'Jane Student',
        role: 'student',
        classId,
        approved: true,
        createdAt: todayIso,
        password: 'password123',
      },
      {
        id: parentUserId,
        email: 'parent@teachflow.com',
        name: 'Parent User',
        role: 'parent',
        classId,
        approved: true,
        createdAt: todayIso,
        password: 'password123',
      },
    ],
    classes: [
      {
        id: classId,
        name: 'Excellence Academy',
        description: 'Coaching class for science and board exam preparation.',
        subdomain: 'excellence-academy',
        adminId,
        createdAt: todayIso,
        settings: {
          allowSelfRegistration: true,
          requireApproval: false,
        },
      },
    ],
    students: [
      {
        id: studentId,
        name: 'Jane Student',
        email: 'student@teachflow.com',
        phone: '+91 9876543210',
        batch: 'Batch A',
        parentEmail: 'parent@teachflow.com',
        parentPhone: '+91 9988776655',
        classId,
        rollNumber: 'A001',
        joinedAt: todayIso,
        feeStatus: 'partial',
        totalFees: 24000,
        paidFees: 16000,
      },
      {
        id: 'student-2',
        name: 'Arjun Mehta',
        email: 'arjun@teachflow.com',
        phone: '+91 9012345678',
        batch: 'Batch A',
        parentEmail: 'mehta.parent@teachflow.com',
        parentPhone: '+91 9123456780',
        classId,
        rollNumber: 'A002',
        joinedAt: todayIso,
        feeStatus: 'paid',
        totalFees: 24000,
        paidFees: 24000,
      },
      {
        id: 'student-3',
        name: 'Riya Patel',
        email: 'riya@teachflow.com',
        phone: '+91 9234567890',
        batch: 'Batch B',
        parentEmail: 'patel.parent@teachflow.com',
        parentPhone: '+91 9345678901',
        classId,
        rollNumber: 'B001',
        joinedAt: todayIso,
        feeStatus: 'due',
        totalFees: 24000,
        paidFees: 8000,
      },
    ],
    teachers: [
      {
        id: teacherId,
        name: 'John Teacher',
        email: 'teacher@teachflow.com',
        phone: '+91 9876501234',
        subjects: ['Mathematics', 'Physics'],
        batches: ['Batch A'],
        classId,
        joinedAt: todayIso,
        salary: 45000,
      },
      {
        id: 'teacher-2',
        name: 'Neha Sharma',
        email: 'neha@teachflow.com',
        phone: '+91 9765401234',
        subjects: ['Chemistry'],
        batches: ['Batch B'],
        classId,
        joinedAt: todayIso,
        salary: 40000,
      },
    ],
    lectures: [
      {
        id: 'lecture-1',
        title: 'Algebra Revision',
        subject: 'Mathematics',
        batch: 'Batch A',
        teacherId,
        teacherName: 'John Teacher',
        date: today.toISOString().slice(0, 10),
        time: '09:00',
        duration: 90,
        classId,
        status: 'scheduled',
        description: 'Linear equations and word problems',
      },
      {
        id: 'lecture-2',
        title: 'Motion Practice',
        subject: 'Physics',
        batch: 'Batch A',
        teacherId,
        teacherName: 'John Teacher',
        date: tomorrow.toISOString().slice(0, 10),
        time: '15:00',
        duration: 60,
        classId,
        status: 'scheduled',
      },
      {
        id: 'lecture-3',
        title: 'Organic Chemistry',
        subject: 'Chemistry',
        batch: 'Batch B',
        teacherId: 'teacher-2',
        teacherName: 'Neha Sharma',
        date: today.toISOString().slice(0, 10),
        time: '11:00',
        duration: 75,
        classId,
        status: 'completed',
      },
    ],
    attendance: [
      {
        id: 'attendance-1',
        lectureId: 'lecture-1',
        studentId,
        studentName: 'Jane Student',
        status: 'present',
        markedAt: todayIso,
        markedBy: teacherId,
      },
      {
        id: 'attendance-2',
        lectureId: 'lecture-2',
        studentId,
        studentName: 'Jane Student',
        status: 'present',
        markedAt: todayIso,
        markedBy: teacherId,
      },
      {
        id: 'attendance-3',
        lectureId: 'lecture-3',
        studentId: 'student-3',
        studentName: 'Riya Patel',
        status: 'absent',
        markedAt: todayIso,
        markedBy: 'teacher-2',
      },
    ],
    marks: [
      {
        id: 'mark-1',
        studentId,
        studentName: 'Jane Student',
        subject: 'Mathematics',
        examType: 'Unit Test',
        examName: 'Algebra Test',
        totalMarks: 100,
        obtainedMarks: 88,
        date: today.toISOString().slice(0, 10),
        classId,
        teacherId,
        batch: 'Batch A',
      },
      {
        id: 'mark-2',
        studentId,
        studentName: 'Jane Student',
        subject: 'Physics',
        examType: 'Quiz',
        examName: 'Motion Quiz',
        totalMarks: 50,
        obtainedMarks: 41,
        date: today.toISOString().slice(0, 10),
        classId,
        teacherId,
        batch: 'Batch A',
      },
    ],
    fees: [
      {
        id: 'fee-1',
        studentId,
        studentName: 'Jane Student',
        amount: 24000,
        dueDate: tomorrow.toISOString().slice(0, 10),
        status: 'partial',
        paidAmount: 16000,
        paidDate: today.toISOString().slice(0, 10),
        classId,
        description: 'Annual fee plan',
      },
      {
        id: 'fee-2',
        studentId: 'student-3',
        studentName: 'Riya Patel',
        amount: 24000,
        dueDate: tomorrow.toISOString().slice(0, 10),
        status: 'due',
        paidAmount: 8000,
        classId,
        description: 'Annual fee plan',
      },
    ],
  };
};

const readStore = (): DataStore => {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    const seeded = seedStore();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(seeded));
    return seeded;
  }

  try {
    return JSON.parse(raw) as DataStore;
  } catch {
    const seeded = seedStore();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(seeded));
    return seeded;
  }
};

const writeStore = (store: DataStore) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
};

const toPublicUser = (user: StoredUser): User => {
  const publicUser = { ...user };
  delete publicUser.password;
  return publicUser;
};

export const LocalDataService = {
  ensureSeeded() {
    readStore();
  },

  getSessionUser(): User | null {
    const raw = localStorage.getItem(SESSION_USER_KEY);
    return raw ? (JSON.parse(raw) as User) : null;
  },

  setSession(user: User | null, coachingClass: CoachingClass | null) {
    if (user) {
      localStorage.setItem(SESSION_USER_KEY, JSON.stringify(user));
    } else {
      localStorage.removeItem(SESSION_USER_KEY);
    }

    if (coachingClass) {
      localStorage.setItem(SESSION_CLASS_KEY, JSON.stringify(coachingClass));
    } else {
      localStorage.removeItem(SESSION_CLASS_KEY);
    }
  },

  getClassById(classId?: string) {
    if (!classId) return null;
    return readStore().classes.find((item) => item.id === classId) ?? null;
  },

  getAdminClass(adminId: string) {
    return readStore().classes.find((item) => item.adminId === adminId) ?? null;
  },

  authenticate(email: string, password: string) {
    const store = readStore();
    const found = store.users.find((user) => user.email === email && user.password === password);
    if (!found) {
      return { user: null, coachingClass: null };
    }

    const publicUser = toPublicUser(found);
    const coachingClass =
      publicUser.role === 'admin'
        ? this.getAdminClass(publicUser.id)
        : this.getClassById(publicUser.classId);

    return { user: publicUser, coachingClass };
  },

  signup(email: string, password: string, name: string, role: User['role']) {
    const store = readStore();
    const exists = store.users.some((user) => user.email === email);
    if (exists) {
      return null;
    }

    const newUser: StoredUser = {
      id: createId('user'),
      email,
      name,
      role,
      approved: role === 'admin',
      createdAt: new Date().toISOString(),
      password,
    };

    store.users.push(newUser);
    writeStore(store);
    return toPublicUser(newUser);
  },

  createClass(admin: User, classData: Omit<CoachingClass, 'id' | 'adminId' | 'createdAt'>) {
    const store = readStore();
    const newClass: CoachingClass = {
      ...classData,
      id: createId('class'),
      adminId: admin.id,
      createdAt: new Date().toISOString(),
    };

    store.classes.push(newClass);
    store.users = store.users.map((item) =>
      item.id === admin.id ? { ...item, classId: newClass.id, approved: true } : item
    );
    writeStore(store);

    const updatedUser = toPublicUser(store.users.find((item) => item.id === admin.id)!);
    return { user: updatedUser, coachingClass: newClass };
  },

  getStudentsByClass(classId?: string) {
    if (!classId) return [];
    return readStore().students.filter((student) => student.classId === classId);
  },

  saveStudent(student: Student) {
    const store = readStore();
    const exists = store.students.some((item) => item.id === student.id);
    store.students = exists
      ? store.students.map((item) => (item.id === student.id ? student : item))
      : [...store.students, student];
    writeStore(store);
  },

  deleteStudent(studentId: string) {
    const store = readStore();
    store.students = store.students.filter((student) => student.id !== studentId);
    store.attendance = store.attendance.filter((item) => item.studentId !== studentId);
    store.marks = store.marks.filter((item) => item.studentId !== studentId);
    store.fees = store.fees.filter((item) => item.studentId !== studentId);
    writeStore(store);
  },

  getTeachersByClass(classId?: string) {
    if (!classId) return [];
    return readStore().teachers.filter((teacher) => teacher.classId === classId);
  },

  saveTeacher(teacher: Teacher) {
    const store = readStore();
    const exists = store.teachers.some((item) => item.id === teacher.id);
    store.teachers = exists
      ? store.teachers.map((item) => (item.id === teacher.id ? teacher : item))
      : [...store.teachers, teacher];
    writeStore(store);
  },

  deleteTeacher(teacherId: string) {
    const store = readStore();
    store.teachers = store.teachers.filter((teacher) => teacher.id !== teacherId);
    store.lectures = store.lectures.filter((lecture) => lecture.teacherId !== teacherId);
    writeStore(store);
  },

  getLecturesByClass(classId?: string) {
    if (!classId) return [];
    return readStore().lectures.filter((lecture) => lecture.classId === classId);
  },

  getMarksByClass(classId?: string) {
    if (!classId) return [];
    return readStore().marks.filter((item) => item.classId === classId);
  },

  getFeesByClass(classId?: string) {
    if (!classId) return [];
    return readStore().fees.filter((item) => item.classId === classId);
  },

  getStudentForUser(user: User | null) {
    if (!user?.classId) return null;
    return this.getStudentsByClass(user.classId).find((student) => student.email === user.email) ?? null;
  },

  getTeacherForUser(user: User | null) {
    if (!user?.classId) return null;
    return this.getTeachersByClass(user.classId).find((teacher) => teacher.email === user.email) ?? null;
  },

  getParentChild(user: User | null) {
    if (!user?.classId) return null;
    return (
      this.getStudentsByClass(user.classId).find((student) => student.parentEmail === user.email) ?? null
    );
  },

  getAttendanceForStudent(studentId?: string) {
    if (!studentId) return [];
    return readStore().attendance.filter((item) => item.studentId === studentId);
  },

  getMarksForStudent(studentId?: string) {
    if (!studentId) return [];
    return readStore().marks.filter((item) => item.studentId === studentId);
  },

  getFeesForStudent(studentId?: string) {
    if (!studentId) return [];
    return readStore().fees.filter((item) => item.studentId === studentId);
  },
};
