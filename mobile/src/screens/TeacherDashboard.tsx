import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Screen } from '../components/Screen';
import { teachflowData } from '../services/teachflowData';
import { AttendanceRecord, Fee, Lecture, MarksRecord, Student, Teacher } from '../types/Models';
import { useAuth } from '../store/AuthStore';
import type { AppStackParamList } from '../navigation/AppStack';

type Props = NativeStackScreenProps<AppStackParamList, 'TeacherDashboard'>;

export const TeacherDashboard = ({ navigation }: Props) => {
  const { currentClass, firebaseUser, logout } = useAuth();
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [lectures, setLectures] = useState<Lecture[]>([]);
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [marks, setMarks] = useState<MarksRecord[]>([]);
  const [fees, setFees] = useState<Fee[]>([]);

  useEffect(() => {
    if (!currentClass?.id) return;
    const unsubs = [
      teachflowData.subscribeToTeachers(currentClass.id, setTeachers),
      teachflowData.subscribeToStudents(currentClass.id, setStudents),
      teachflowData.subscribeToLectures(currentClass.id, setLectures),
      teachflowData.subscribeToAttendance(currentClass.id, setAttendance),
      teachflowData.subscribeToMarks(currentClass.id, setMarks),
      teachflowData.subscribeToFees(currentClass.id, setFees),
    ];
    return () => unsubs.forEach((unsub) => unsub());
  }, [currentClass?.id]);

  const teacher = useMemo(() => teachers.find((item) => item.email.toLowerCase() === (firebaseUser?.email ?? '').toLowerCase()) ?? null, [firebaseUser?.email, teachers]);
  const myLectures = useMemo(() => lectures.filter((item) => teacher ? item.teacherId === teacher.id || item.teacherName === teacher.name : false).sort((a, b) => new Date(`${a.date}T${a.time}`).getTime() - new Date(`${b.date}T${b.time}`).getTime()), [lectures, teacher]);
  const myLectureIds = useMemo(() => myLectures.map((item) => item.id), [myLectures]);
  const myStudents = useMemo(() => students.filter((student) => teacher ? (teacher.batchIds ?? []).includes(student.batchId ?? '') || (teacher.batches ?? []).includes(student.batch) : false), [students, teacher]);
  const myAttendance = useMemo(() => attendance.filter((item) => myLectureIds.includes(item.lectureId)), [attendance, myLectureIds]);
  const myMarks = useMemo(() => marks.filter((item) => teacher ? item.teacherId === teacher.id : false), [marks, teacher]);
  const feePending = useMemo(() => fees.filter((fee) => myStudents.some((student) => student.id === fee.studentId)).reduce((sum, fee) => sum + Math.max(fee.amount - fee.paidAmount, 0), 0), [fees, myStudents]);

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.headerRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>Teacher Dashboard</Text>
            <Text style={styles.subtitle}>{teacher ? `${teacher.name}, manage your daily schedule, attendance, and marks.` : 'Your teacher record will appear once linked.'}</Text>
          </View>
          <Pressable onPress={() => void logout()} style={styles.secondaryButton}><Text style={styles.secondaryButtonText}>Logout</Text></Pressable>
        </View>

        <View style={styles.grid}>
          <View style={styles.statCard}><Text style={styles.statValue}>{myLectures.length}</Text><Text style={styles.statLabel}>My Lectures</Text></View>
          <View style={styles.statCard}><Text style={styles.statValue}>{myStudents.length}</Text><Text style={styles.statLabel}>My Students</Text></View>
          <View style={styles.statCard}><Text style={styles.statValue}>{myAttendance.length}</Text><Text style={styles.statLabel}>Attendance Records</Text></View>
          <View style={styles.statCard}><Text style={styles.statValue}>{myMarks.length}</Text><Text style={styles.statLabel}>Marks Entries</Text></View>
          <View style={styles.statCard}><Text style={styles.statValue}>{formatCurrency(feePending)}</Text><Text style={styles.statLabel}>Batch Fee Due</Text></View>
        </View>

        <View style={styles.actions}>
          <Pressable onPress={() => navigation.navigate('LecturesScreen', { initialTab: 'lectures' })} style={styles.primaryButton}><Text style={styles.primaryButtonText}>My Lectures</Text></Pressable>
          <Pressable onPress={() => navigation.navigate('LecturesScreen', { initialTab: 'attendance' })} style={styles.primaryButton}><Text style={styles.primaryButtonText}>Mark Attendance</Text></Pressable>
          <Pressable onPress={() => navigation.navigate('LecturesScreen', { initialTab: 'marks' })} style={styles.primaryButton}><Text style={styles.primaryButtonText}>Enter Marks</Text></Pressable>
          <Pressable onPress={() => navigation.navigate('FeesScreen', { initialTab: 'history' })} style={styles.primaryButton}><Text style={styles.primaryButtonText}>Fee Status</Text></Pressable>
          <Pressable onPress={() => navigation.navigate('StudentsScreen')} style={styles.primaryButton}><Text style={styles.primaryButtonText}>Students</Text></Pressable>
          <Pressable onPress={() => navigation.navigate('BatchesScreen')} style={styles.primaryButton}><Text style={styles.primaryButtonText}>Batches</Text></Pressable>
          <Pressable onPress={() => navigation.navigate('ModuleEntryScreen', { title: 'Messages', subtitle: 'Teacher messaging module entry.', moduleKey: 'messages' })} style={styles.primaryButton}><Text style={styles.primaryButtonText}>Messages</Text></Pressable>
          <Pressable onPress={() => navigation.navigate('ModuleEntryScreen', { title: 'Reports', subtitle: 'Teacher report card module entry.', moduleKey: 'reports' })} style={styles.primaryButton}><Text style={styles.primaryButtonText}>Reports</Text></Pressable>
        </View>

        <Text style={styles.sectionTitle}>Upcoming Lectures</Text>
        {myLectures.slice(0, 5).map((lecture) => (
          <View key={lecture.id} style={styles.card}>
            <Text style={styles.cardTitle}>{lecture.subject}</Text>
            <Text style={styles.cardSubtext}>{lecture.batchName ?? lecture.batch} | {lecture.time}</Text>
            <Text style={styles.cardSubtext}>{new Date(lecture.date).toLocaleDateString()} | {lecture.branchName ?? currentClass?.name ?? '-'}</Text>
          </View>
        ))}
        {myLectures.length === 0 ? <View style={styles.emptyCard}><Text style={styles.emptyText}>No lectures assigned yet.</Text></View> : null}

        <Text style={styles.sectionTitle}>My Students</Text>
        {myStudents.slice(0, 5).map((student) => (
          <View key={student.id} style={styles.card}>
            <Text style={styles.cardTitle}>{student.name}</Text>
            <Text style={styles.cardSubtext}>{student.batch} | Roll {student.rollNumber}</Text>
            <Text style={styles.cardSubtext}>Fees: {formatCurrency(student.paidFees)} / {formatCurrency(student.totalFees)}</Text>
          </View>
        ))}
        {myStudents.length === 0 ? <View style={styles.emptyCard}><Text style={styles.emptyText}>No students mapped to your batches yet.</Text></View> : null}
      </ScrollView>
    </Screen>
  );
};

const formatCurrency = (amount: number) => `Rs. ${Math.max(0, amount).toLocaleString('en-IN')}`;

const styles = StyleSheet.create({
  content: { padding: 16, gap: 14 },
  headerRow: { flexDirection: 'row', gap: 12, alignItems: 'flex-start', justifyContent: 'space-between' },
  title: { fontSize: 26, fontWeight: '700', color: '#111827' },
  subtitle: { fontSize: 14, color: '#6b7280', marginTop: 4 },
  secondaryButton: { backgroundColor: '#e5e7eb', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10 },
  secondaryButtonText: { fontWeight: '600', color: '#111827' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  statCard: { width: '48%', borderRadius: 12, backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#e5e7eb', padding: 14 },
  statValue: { fontSize: 22, fontWeight: '700', color: '#111827' },
  statLabel: { marginTop: 4, fontSize: 13, color: '#6b7280' },
  actions: { gap: 10 },
  primaryButton: { backgroundColor: '#2563eb', borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
  primaryButtonText: { color: '#ffffff', fontWeight: '600' },
  sectionTitle: { fontSize: 18, fontWeight: '700', color: '#111827' },
  card: { borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 12, backgroundColor: '#ffffff', padding: 14, gap: 4 },
  cardTitle: { fontSize: 16, fontWeight: '600', color: '#111827' },
  cardSubtext: { fontSize: 13, color: '#6b7280' },
  emptyCard: { borderRadius: 12, padding: 14, backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#e5e7eb' },
  emptyText: { fontSize: 14, color: '#6b7280' },
});
