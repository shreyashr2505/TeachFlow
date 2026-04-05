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
  Timestamp,
  updateDoc,
  where,
} from 'firebase/firestore';
import { db } from './firebase';
import {
  Attendance,
  CoachingClass,
  Fee,
  Invite,
  Lecture,
  Marks,
  NotificationJob,
  Student,
  Teacher,
  User,
  AuditLog,
} from '../types';

type FirestoreDate = Timestamp | string | null | undefined;

class ServiceError extends Error {
  constructor(message: string, public cause?: unknown) {
    super(message);
    this.name = 'ServiceError';
  }
}

const toIsoString = (value: FirestoreDate) =>
  value instanceof Timestamp ? value.toDate().toISOString() : value ?? new Date().toISOString();

const mapDoc = <T>(snapshot: { id: string; data: () => Record<string, unknown> }) =>
  ({
    id: snapshot.id,
    ...snapshot.data(),
  }) as T;

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

const classStudentsCollection = (classId: string) => collection(db, 'classes', classId, 'students');
const classTeachersCollection = (classId: string) => collection(db, 'classes', classId, 'teachers');
const classLecturesCollection = (classId: string) => collection(db, 'classes', classId, 'lectures');
const classAttendanceCollection = (classId: string) => collection(db, 'classes', classId, 'attendance');
const classMarksCollection = (classId: string) => collection(db, 'classes', classId, 'marks');
const classFeesCollection = (classId: string) => collection(db, 'classes', classId, 'fees');
const classAuditCollection = (classId: string) => collection(db, 'classes', classId, 'auditLogs');
const classStudentDoc = (classId: string, studentId: string) => doc(db, 'classes', classId, 'students', studentId);
const notificationsCollection = collection(db, 'notifications');

const classLimitsByPlan: Record<CoachingClass['plan'], { students: number; teachers: number }> = {
  free: { students: 50, teachers: 5 },
  standard: { students: 200, teachers: 25 },
  pro: { students: 100000, teachers: 100000 },
};

const normalizeUser = (user: User): User => ({
  ...user,
  role:
    user.role === ('super admin' as User['role']) ||
    user.role === ('super-admin' as User['role']) ||
    user.role === ('superadmin' as User['role'])
      ? 'super_admin'
      : user.role,
  createdAt: toIsoString(user.createdAt),
  classIds: user.classIds ?? (user.classId ? [user.classId] : []),
  activeClassId: user.activeClassId ?? user.classId,
});

const normalizeClass = (coachingClass: CoachingClass): CoachingClass => ({
  ...coachingClass,
  createdAt: toIsoString(coachingClass.createdAt),
  plan: coachingClass.plan ?? 'free',
  isActive: coachingClass.isActive ?? true,
  studentCount: coachingClass.studentCount ?? 0,
  teacherCount: coachingClass.teacherCount ?? 0,
  limits:
    coachingClass.limits ?? classLimitsByPlan[coachingClass.plan ?? 'free'],
});

const normalizeStudent = (student: Student): Student => ({
  ...student,
  joinedAt: toIsoString(student.joinedAt),
});

const normalizeTeacher = (teacher: Teacher): Teacher => ({
  ...teacher,
  joinedAt: toIsoString(teacher.joinedAt),
});

const normalizeLecture = (lecture: Lecture): Lecture => lecture;
const normalizeAttendance = (attendance: Attendance): Attendance => ({
  ...attendance,
  markedAt: toIsoString(attendance.markedAt),
});
const normalizeMarks = (marks: Marks): Marks => marks;
const normalizeFee = (fee: Fee): Fee => fee;
const normalizeInvite = (invite: Invite): Invite => ({
  ...invite,
  createdAt: toIsoString(invite.createdAt),
  acceptedAt: invite.acceptedAt ? toIsoString(invite.acceptedAt) : undefined,
  expiresAt: invite.expiresAt ? toIsoString(invite.expiresAt) : undefined,
});
const normalizeAuditLog = (log: AuditLog): AuditLog => ({
  ...log,
  createdAt: toIsoString(log.createdAt),
});
const normalizeNotification = (notification: NotificationJob): NotificationJob => ({
  ...notification,
  createdAt: toIsoString(notification.createdAt),
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

export const firebaseService = {
  async upsertUser(user: Omit<User, 'createdAt'> & { createdAt?: string }) {
    return withErrorHandling('Failed to save user profile.', async () => {
      const userRef = doc(usersCollection, user.id);
      const existing = await getDoc(userRef);
      const normalizedClassIds = user.classIds ?? (user.classId ? [user.classId] : []);

      await setDoc(
        userRef,
        sanitizeFirestoreData({
          ...user,
          classId: user.classId ?? null,
          classIds: normalizedClassIds,
          activeClassId: user.activeClassId ?? user.classId ?? null,
          createdAt: existing.exists() ? existing.data().createdAt ?? serverTimestamp() : serverTimestamp(),
          updatedAt: serverTimestamp(),
        }),
        { merge: true }
      );
      return this.getUserProfile(user.id);
    });
  },

  async getUserProfile(userId: string) {
    return withErrorHandling('Failed to load user profile.', async () => {
      const snapshot = await getDoc(doc(usersCollection, userId));
      if (!snapshot.exists()) return null;
      return normalizeUser(mapDoc<User>(snapshot));
    });
  },

  async getClassesByIds(classIds: string[]) {
    return withErrorHandling('Failed to load classes.', async () => {
      if (classIds.length === 0) return [];
      const snapshots = await Promise.all(classIds.map((classId) => getDoc(doc(classesCollection, classId))));
      return snapshots
        .filter((snapshot) => snapshot.exists())
        .map((snapshot) => normalizeClass(mapDoc<CoachingClass>(snapshot)));
    });
  },

  async getClassesByAdmin(adminId: string) {
    return withErrorHandling('Failed to load admin classes.', async () => {
      const snapshot = await getDocs(query(classesCollection, where('adminId', '==', adminId)));
      return snapshot.docs.map((item) => normalizeClass(mapDoc<CoachingClass>(item)));
    });
  },

  async getClassBySlug(subdomain: string) {
    return withErrorHandling('Failed to load class by slug.', async () => {
      const snapshot = await getDocs(query(classesCollection, where('subdomain', '==', subdomain)));
      const classDoc = snapshot.docs[0];
      return classDoc ? normalizeClass(mapDoc<CoachingClass>(classDoc)) : null;
    });
  },

  async getClass(classId: string) {
    return withErrorHandling('Failed to load class.', async () => {
      const snapshot = await getDoc(doc(classesCollection, classId));
      if (!snapshot.exists()) return null;
      return normalizeClass(mapDoc<CoachingClass>(snapshot));
    });
  },

  async createClass(adminId: string, classData: Omit<CoachingClass, 'id' | 'adminId' | 'createdAt'>) {
    return withErrorHandling('Failed to create class.', async () => {
      const existing = await getDocs(query(classesCollection, where('subdomain', '==', classData.subdomain)));
      if (!existing.empty) {
        throw new Error('This class URL is already taken. Please choose a different subdomain.');
      }

      const classRef = await addDoc(classesCollection, {
        ...classData,
        adminId,
        plan: classData.plan ?? 'free',
        isActive: classData.isActive ?? true,
        studentCount: classData.studentCount ?? 0,
        teacherCount: classData.teacherCount ?? 0,
        limits: classData.limits ?? { students: 50, teachers: 5 },
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
      return normalizeClass(mapDoc<CoachingClass>(snapshot));
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
        ...sanitizeFirestoreData(studentData),
        classId,
        joinedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      await updateDoc(doc(classesCollection, classId), {
        studentCount: increment(1),
        updatedAt: serverTimestamp(),
      });
      const snapshot = await getDoc(docRef);
      return normalizeStudent(mapDoc<Student>(snapshot));
    });
  },

  async updateStudent(classId: string, studentId: string, studentData: Partial<Student>) {
    return withErrorHandling('Failed to update student.', async () => {
      await updateDoc(doc(classStudentsCollection(classId), studentId), {
        ...sanitizeFirestoreData(studentData),
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
        ...sanitizeFirestoreData(teacherData),
        classId,
        joinedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      await updateDoc(doc(classesCollection, classId), {
        teacherCount: increment(1),
        updatedAt: serverTimestamp(),
      });
      const snapshot = await getDoc(docRef);
      return normalizeTeacher(mapDoc<Teacher>(snapshot));
    });
  },

  async updateTeacher(classId: string, teacherId: string, teacherData: Partial<Teacher>) {
    return withErrorHandling('Failed to update teacher.', async () => {
      await updateDoc(doc(classTeachersCollection(classId), teacherId), {
        ...sanitizeFirestoreData(teacherData),
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

  async addLecture(classId: string, lectureData: Omit<Lecture, 'id' | 'classId'>) {
    return withErrorHandling('Failed to create lecture.', async () => {
      const docRef = await addDoc(classLecturesCollection(classId), {
        ...sanitizeFirestoreData(lectureData),
        classId,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      const snapshot = await getDoc(docRef);
      return normalizeLecture(mapDoc<Lecture>(snapshot));
    });
  },

  async updateLecture(classId: string, lectureId: string, lectureData: Partial<Lecture>) {
    return withErrorHandling('Failed to update lecture.', async () => {
      await updateDoc(doc(classLecturesCollection(classId), lectureId), {
        ...sanitizeFirestoreData(lectureData),
        updatedAt: serverTimestamp(),
      });
    });
  },

  async deleteLecture(classId: string, lectureId: string) {
    return withErrorHandling('Failed to delete lecture.', async () => {
      await deleteDoc(doc(classLecturesCollection(classId), lectureId));
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
      return normalizeMarks(mapDoc<Marks>(snapshot));
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
        ...sanitizeFirestoreData(feeData),
        classId,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      const snapshot = await getDoc(docRef);
      return normalizeFee(mapDoc<Fee>(snapshot));
    });
  },

  async updateFee(classId: string, feeId: string, feeData: Partial<Fee>) {
    return withErrorHandling('Failed to update fee.', async () => {
      await updateDoc(doc(classFeesCollection(classId), feeId), {
        ...sanitizeFirestoreData(feeData),
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
      return normalizeAuditLog(mapDoc<AuditLog>(snapshot));
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
      return normalizeNotification(mapDoc<NotificationJob>(snapshot));
    });
  },

  subscribeToStudents(classId: string, callback: (students: Student[]) => void, onError?: (error: Error) => void) {
    return onSnapshot(
      query(classStudentsCollection(classId), orderBy('joinedAt', 'desc')),
      (snapshot) => callback(snapshot.docs.map((item) => normalizeStudent(mapDoc<Student>(item)))),
      (error) => onError?.(new ServiceError('Failed to listen to students.', error))
    );
  },

  subscribeToAllUsers(callback: (users: User[]) => void, onError?: (error: Error) => void) {
    return onSnapshot(
      usersCollection,
      (snapshot) => callback(snapshot.docs.map((item) => normalizeUser(mapDoc<User>(item)))),
      (error) => onError?.(new ServiceError('Failed to listen to users.', error))
    );
  },

  subscribeToAllClasses(callback: (classes: CoachingClass[]) => void, onError?: (error: Error) => void) {
    return onSnapshot(
      classesCollection,
      (snapshot) => callback(snapshot.docs.map((item) => normalizeClass(mapDoc<CoachingClass>(item)))),
      (error) => onError?.(new ServiceError('Failed to listen to classes.', error))
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
      (snapshot) => callback(snapshot.docs[0] ? normalizeStudent(mapDoc<Student>(snapshot.docs[0])) : null),
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
      (snapshot) => callback(snapshot.docs[0] ? normalizeStudent(mapDoc<Student>(snapshot.docs[0])) : null),
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
      (snapshot) => callback(snapshot.exists() ? normalizeStudent(mapDoc<Student>(snapshot)) : null),
      (error) => onError?.(new ServiceError('Failed to listen to student profile.', error))
    );
  },

  subscribeToTeachers(classId: string, callback: (teachers: Teacher[]) => void, onError?: (error: Error) => void) {
    return onSnapshot(
      query(classTeachersCollection(classId), orderBy('joinedAt', 'desc')),
      (snapshot) => callback(snapshot.docs.map((item) => normalizeTeacher(mapDoc<Teacher>(item)))),
      (error) => onError?.(new ServiceError('Failed to listen to teachers.', error))
    );
  },

  subscribeToTeacherByEmail(
    classId: string,
    email: string,
    callback: (teacher: Teacher | null) => void,
    onError?: (error: Error) => void
  ) {
    return onSnapshot(
      query(classTeachersCollection(classId), where('email', '==', email)),
      (snapshot) => callback(snapshot.docs[0] ? normalizeTeacher(mapDoc<Teacher>(snapshot.docs[0])) : null),
      (error) => onError?.(new ServiceError('Failed to listen to teacher profile.', error))
    );
  },

  subscribeToLectures(classId: string, callback: (lectures: Lecture[]) => void, onError?: (error: Error) => void) {
    return onSnapshot(
      query(classLecturesCollection(classId), orderBy('date', 'asc')),
      (snapshot) => callback(snapshot.docs.map((item) => normalizeLecture(mapDoc<Lecture>(item)))),
      (error) => onError?.(new ServiceError('Failed to listen to lectures.', error))
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
      (snapshot) => callback(snapshot.docs.map((item) => normalizeLecture(mapDoc<Lecture>(item)))),
      (error) => onError?.(new ServiceError('Failed to listen to lectures.', error))
    );
  },

  subscribeToAttendance(
    classId: string,
    callback: (attendance: Attendance[]) => void,
    onError?: (error: Error) => void
  ) {
    return onSnapshot(
      classAttendanceCollection(classId),
      (snapshot) => callback(snapshot.docs.map((item) => normalizeAttendance(mapDoc<Attendance>(item)))),
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
      (snapshot) => callback(snapshot.docs.map((item) => normalizeAttendance(mapDoc<Attendance>(item)))),
      (error) => onError?.(new ServiceError('Failed to listen to attendance.', error))
    );
  },

  subscribeToMarks(classId: string, callback: (marks: Marks[]) => void, onError?: (error: Error) => void) {
    return onSnapshot(
      query(classMarksCollection(classId), orderBy('date', 'desc')),
      (snapshot) => callback(snapshot.docs.map((item) => normalizeMarks(mapDoc<Marks>(item)))),
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
      (snapshot) => callback(snapshot.docs.map((item) => normalizeMarks(mapDoc<Marks>(item)))),
      (error) => onError?.(new ServiceError('Failed to listen to marks.', error))
    );
  },

  subscribeToFees(classId: string, callback: (fees: Fee[]) => void, onError?: (error: Error) => void) {
    return onSnapshot(
      query(classFeesCollection(classId), orderBy('dueDate', 'asc')),
      (snapshot) => callback(snapshot.docs.map((item) => normalizeFee(mapDoc<Fee>(item)))),
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
      (snapshot) => callback(snapshot.docs.map((item) => normalizeFee(mapDoc<Fee>(item)))),
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

      const validInvite = existing.docs
        .map((item) => normalizeInvite(mapDoc<Invite>(item)))
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
      return normalizeInvite(mapDoc<Invite>(snapshot));
    });
  },

  async getPendingInvitesByEmail(email: string) {
    return withErrorHandling('Failed to load invites.', async () => {
      const snapshot = await getDocs(
        query(invitesCollection, where('email', '==', email), where('status', '==', 'pending'))
      );
      return snapshot.docs
        .map((item) => normalizeInvite(mapDoc<Invite>(item)))
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
