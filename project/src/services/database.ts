import {
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  getDocs,
  getDoc,
  query,
  where,
  onSnapshot,
  Timestamp,
  type WhereFilterOp
} from 'firebase/firestore';
import { db } from './firebase';
import { 
  User, 
  CoachingClass, 
  Student, 
  Teacher, 
  Lecture, 
  Attendance, 
  Marks, 
  Fee 
} from '../types';

// Collection names
const COLLECTIONS = {
  USERS: 'users',
  CLASSES: 'classes',
  STUDENTS: 'students',
  TEACHERS: 'teachers',
  LECTURES: 'lectures',
  ATTENDANCE: 'attendance',
  MARKS: 'marks',
  FEES: 'fees'
};

// Generic CRUD operations
export class DatabaseService {
  // Create
  static async create<T>(collectionName: string, data: Omit<T, 'id'>): Promise<string> {
    try {
      const docRef = await addDoc(collection(db, collectionName), {
        ...data,
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now()
      });
      return docRef.id;
    } catch (error) {
      console.error('Error creating document:', error);
      throw error;
    }
  }

  // Read all with optional filters
  static async getAll<T>(
    collectionName: string, 
    filters?: { field: string; operator: WhereFilterOp; value: unknown }[]
  ): Promise<T[]> {
    try {
      let q = query(collection(db, collectionName));
      
      if (filters) {
        filters.forEach(filter => {
          q = query(q, where(filter.field, filter.operator, filter.value));
        });
      }

      const querySnapshot = await getDocs(q);
      return querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as T[];
    } catch (error) {
      console.error('Error getting documents:', error);
      throw error;
    }
  }

  // Read single document
  static async getById<T>(collectionName: string, id: string): Promise<T | null> {
    try {
      const docRef = doc(db, collectionName, id);
      const docSnap = await getDoc(docRef);
      
      if (docSnap.exists()) {
        return {
          id: docSnap.id,
          ...docSnap.data()
        } as T;
      }
      return null;
    } catch (error) {
      console.error('Error getting document:', error);
      throw error;
    }
  }

  // Update
  static async update<T>(
    collectionName: string, 
    id: string, 
    data: Partial<T>
  ): Promise<void> {
    try {
      const docRef = doc(db, collectionName, id);
      await updateDoc(docRef, {
        ...data,
        updatedAt: Timestamp.now()
      });
    } catch (error) {
      console.error('Error updating document:', error);
      throw error;
    }
  }

  // Delete
  static async delete(collectionName: string, id: string): Promise<void> {
    try {
      const docRef = doc(db, collectionName, id);
      await deleteDoc(docRef);
    } catch (error) {
      console.error('Error deleting document:', error);
      throw error;
    }
  }

  // Real-time listener
  static subscribeToCollection<T>(
    collectionName: string,
    callback: (data: T[]) => void,
    filters?: { field: string; operator: WhereFilterOp; value: unknown }[]
  ) {
    let q = query(collection(db, collectionName));
    
    if (filters) {
      filters.forEach(filter => {
        q = query(q, where(filter.field, filter.operator, filter.value));
      });
    }

    return onSnapshot(q, (querySnapshot) => {
      const data = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as T[];
      callback(data);
    });
  }
}

// Specific service classes for each entity
export class UserService {
  static async createUser(userData: Omit<User, 'id'>): Promise<string> {
    return DatabaseService.create<User>(COLLECTIONS.USERS, userData);
  }

  static async getUserByEmail(email: string): Promise<User | null> {
    const users = await DatabaseService.getAll<User>(COLLECTIONS.USERS, [
      { field: 'email', operator: '==', value: email }
    ]);
    return users.length > 0 ? users[0] : null;
  }

  static async updateUser(id: string, userData: Partial<User>): Promise<void> {
    return DatabaseService.update<User>(COLLECTIONS.USERS, id, userData);
  }

  static async deleteUser(id: string): Promise<void> {
    return DatabaseService.delete(COLLECTIONS.USERS, id);
  }

  static async getUsersByClass(classId: string): Promise<User[]> {
    return DatabaseService.getAll<User>(COLLECTIONS.USERS, [
      { field: 'classId', operator: '==', value: classId }
    ]);
  }
}

export class ClassService {
  static async createClass(classData: Omit<CoachingClass, 'id'>): Promise<string> {
    return DatabaseService.create<CoachingClass>(COLLECTIONS.CLASSES, classData);
  }

  static async getClassById(id: string): Promise<CoachingClass | null> {
    return DatabaseService.getById<CoachingClass>(COLLECTIONS.CLASSES, id);
  }

  static async updateClass(id: string, classData: Partial<CoachingClass>): Promise<void> {
    return DatabaseService.update<CoachingClass>(COLLECTIONS.CLASSES, id, classData);
  }

  static async deleteClass(id: string): Promise<void> {
    return DatabaseService.delete(COLLECTIONS.CLASSES, id);
  }

  static async getClassesByAdmin(adminId: string): Promise<CoachingClass[]> {
    return DatabaseService.getAll<CoachingClass>(COLLECTIONS.CLASSES, [
      { field: 'adminId', operator: '==', value: adminId }
    ]);
  }
}

export class StudentService {
  static async createStudent(studentData: Omit<Student, 'id'>): Promise<string> {
    return DatabaseService.create<Student>(COLLECTIONS.STUDENTS, studentData);
  }

  static async getStudentsByClass(classId: string): Promise<Student[]> {
    return DatabaseService.getAll<Student>(COLLECTIONS.STUDENTS, [
      { field: 'classId', operator: '==', value: classId }
    ]);
  }

  static async getStudentsByBatch(classId: string, batch: string): Promise<Student[]> {
    return DatabaseService.getAll<Student>(COLLECTIONS.STUDENTS, [
      { field: 'classId', operator: '==', value: classId },
      { field: 'batch', operator: '==', value: batch }
    ]);
  }

  static async updateStudent(id: string, studentData: Partial<Student>): Promise<void> {
    return DatabaseService.update<Student>(COLLECTIONS.STUDENTS, id, studentData);
  }

  static async deleteStudent(id: string): Promise<void> {
    return DatabaseService.delete(COLLECTIONS.STUDENTS, id);
  }

  static subscribeToStudents(classId: string, callback: (students: Student[]) => void) {
    return DatabaseService.subscribeToCollection<Student>(
      COLLECTIONS.STUDENTS,
      callback,
      [{ field: 'classId', operator: '==', value: classId }]
    );
  }
}

export class TeacherService {
  static async createTeacher(teacherData: Omit<Teacher, 'id'>): Promise<string> {
    return DatabaseService.create<Teacher>(COLLECTIONS.TEACHERS, teacherData);
  }

  static async getTeachersByClass(classId: string): Promise<Teacher[]> {
    return DatabaseService.getAll<Teacher>(COLLECTIONS.TEACHERS, [
      { field: 'classId', operator: '==', value: classId }
    ]);
  }

  static async updateTeacher(id: string, teacherData: Partial<Teacher>): Promise<void> {
    return DatabaseService.update<Teacher>(COLLECTIONS.TEACHERS, id, teacherData);
  }

  static async deleteTeacher(id: string): Promise<void> {
    return DatabaseService.delete(COLLECTIONS.TEACHERS, id);
  }

  static subscribeToTeachers(classId: string, callback: (teachers: Teacher[]) => void) {
    return DatabaseService.subscribeToCollection<Teacher>(
      COLLECTIONS.TEACHERS,
      callback,
      [{ field: 'classId', operator: '==', value: classId }]
    );
  }
}

export class LectureService {
  static async createLecture(lectureData: Omit<Lecture, 'id'>): Promise<string> {
    return DatabaseService.create<Lecture>(COLLECTIONS.LECTURES, lectureData);
  }

  static async getLecturesByClass(classId: string): Promise<Lecture[]> {
    return DatabaseService.getAll<Lecture>(COLLECTIONS.LECTURES, [
      { field: 'classId', operator: '==', value: classId }
    ]);
  }

  static async getLecturesByTeacher(teacherId: string): Promise<Lecture[]> {
    return DatabaseService.getAll<Lecture>(COLLECTIONS.LECTURES, [
      { field: 'teacherId', operator: '==', value: teacherId }
    ]);
  }

  static async updateLecture(id: string, lectureData: Partial<Lecture>): Promise<void> {
    return DatabaseService.update<Lecture>(COLLECTIONS.LECTURES, id, lectureData);
  }

  static async deleteLecture(id: string): Promise<void> {
    return DatabaseService.delete(COLLECTIONS.LECTURES, id);
  }

  static subscribeToLectures(classId: string, callback: (lectures: Lecture[]) => void) {
    return DatabaseService.subscribeToCollection<Lecture>(
      COLLECTIONS.LECTURES,
      callback,
      [{ field: 'classId', operator: '==', value: classId }]
    );
  }
}

export class AttendanceService {
  static async markAttendance(attendanceData: Omit<Attendance, 'id'>): Promise<string> {
    return DatabaseService.create<Attendance>(COLLECTIONS.ATTENDANCE, attendanceData);
  }

  static async getAttendanceByLecture(lectureId: string): Promise<Attendance[]> {
    return DatabaseService.getAll<Attendance>(COLLECTIONS.ATTENDANCE, [
      { field: 'lectureId', operator: '==', value: lectureId }
    ]);
  }

  static async getAttendanceByStudent(studentId: string): Promise<Attendance[]> {
    return DatabaseService.getAll<Attendance>(COLLECTIONS.ATTENDANCE, [
      { field: 'studentId', operator: '==', value: studentId }
    ]);
  }

  static async updateAttendance(id: string, attendanceData: Partial<Attendance>): Promise<void> {
    return DatabaseService.update<Attendance>(COLLECTIONS.ATTENDANCE, id, attendanceData);
  }

  static async deleteAttendance(id: string): Promise<void> {
    return DatabaseService.delete(COLLECTIONS.ATTENDANCE, id);
  }
}

export class MarksService {
  static async addMarks(marksData: Omit<Marks, 'id'>): Promise<string> {
    return DatabaseService.create<Marks>(COLLECTIONS.MARKS, marksData);
  }

  static async getMarksByClass(classId: string): Promise<Marks[]> {
    return DatabaseService.getAll<Marks>(COLLECTIONS.MARKS, [
      { field: 'classId', operator: '==', value: classId }
    ]);
  }

  static async getMarksByStudent(studentId: string): Promise<Marks[]> {
    return DatabaseService.getAll<Marks>(COLLECTIONS.MARKS, [
      { field: 'studentId', operator: '==', value: studentId }
    ]);
  }

  static async updateMarks(id: string, marksData: Partial<Marks>): Promise<void> {
    return DatabaseService.update<Marks>(COLLECTIONS.MARKS, id, marksData);
  }

  static async deleteMarks(id: string): Promise<void> {
    return DatabaseService.delete(COLLECTIONS.MARKS, id);
  }
}

export class FeeService {
  static async createFee(feeData: Omit<Fee, 'id'>): Promise<string> {
    return DatabaseService.create<Fee>(COLLECTIONS.FEES, feeData);
  }

  static async getFeesByClass(classId: string): Promise<Fee[]> {
    return DatabaseService.getAll<Fee>(COLLECTIONS.FEES, [
      { field: 'classId', operator: '==', value: classId }
    ]);
  }

  static async getFeesByStudent(studentId: string): Promise<Fee[]> {
    return DatabaseService.getAll<Fee>(COLLECTIONS.FEES, [
      { field: 'studentId', operator: '==', value: studentId }
    ]);
  }

  static async updateFee(id: string, feeData: Partial<Fee>): Promise<void> {
    return DatabaseService.update<Fee>(COLLECTIONS.FEES, id, feeData);
  }

  static async deleteFee(id: string): Promise<void> {
    return DatabaseService.delete(COLLECTIONS.FEES, id);
  }

  static subscribeToFees(classId: string, callback: (fees: Fee[]) => void) {
    return DatabaseService.subscribeToCollection<Fee>(
      COLLECTIONS.FEES,
      callback,
      [{ field: 'classId', operator: '==', value: classId }]
    );
  }
}
