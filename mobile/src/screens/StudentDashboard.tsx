import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Screen } from '../components/Screen';
import { teachflowData } from '../services/teachflowData';
import { AttendanceRecord, Fee, Lecture, MarksRecord, Student } from '../types/Models';
import { useAuth } from '../store/AuthStore';
import type { AppStackParamList } from '../navigation/AppStack';

type Props = NativeStackScreenProps<AppStackParamList, 'StudentDashboard'>;

export const StudentDashboard = ({ navigation }: Props) => {
  const { currentClass, firebaseUser, logout } = useAuth();
  const [students, setStudents] = useState<Student[]>([]);
  const [lectures, setLectures] = useState<Lecture[]>([]);
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [marks, setMarks] = useState<MarksRecord[]>([]);
  const [fees, setFees] = useState<Fee[]>([]);

  useEffect(() => {
    if (!currentClass?.id) return;
    const unsubs = [
      teachflowData.subscribeToStudents(currentClass.id, setStudents),
      teachflowData.subscribeToLectures(currentClass.id, setLectures),
      teachflowData.subscribeToAttendance(currentClass.id, setAttendance),
      teachflowData.subscribeToMarks(currentClass.id, setMarks),
      teachflowData.subscribeToFees(currentClass.id, setFees),
    ];
    return () => unsubs.forEach((unsub) => unsub());
  }, [currentClass?.id]);

  const student = useMemo(() => students.find((item) => item.email.toLowerCase() === (firebaseUser?.email ?? '').toLowerCase()) ?? null, [firebaseUser?.email, students]);
  const myLectures = useMemo(() => lectures.filter((item) => student ? (student.batchId ? item.batchId === student.batchId : item.batch === student.batch) : false).sort((a, b) => new Date(`${a.date}T${a.time}`).getTime() - new Date(`${b.date}T${b.time}`).getTime()), [lectures, student]);
  const myAttendance = useMemo(() => attendance.filter((item) => student ? item.studentId === student.id : false), [attendance, student]);
  const myMarks = useMemo(() => marks.filter((item) => student ? item.studentId === student.id : false), [marks, student]);
  const myFees = useMemo(() => fees.filter((item) => (student ? item.studentId === student.id : false)), [fees, student]);
  const attendancePercent = useMemo(() => myAttendance.length ? Math.round((myAttendance.filter((item) => item.status === 'present').length / myAttendance.length) * 100) : 0, [myAttendance]);
  const marksPercent = useMemo(() => {
    const total = myMarks.reduce((sum, item) => sum + item.totalMarks, 0);
    const obtained = myMarks.reduce((sum, item) => sum + item.obtainedMarks, 0);
    return total ? Math.round((obtained / total) * 100) : 0;
  }, [myMarks]);
  const feePending = useMemo(() => myFees.reduce((sum, item) => sum + Math.max(item.amount - item.paidAmount, 0), 0), [myFees]);

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.headerRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>Student Dashboard</Text>
            <Text style={styles.subtitle}>{student ? `${student.name}, your schedule, attendance, and marks are live below.` : 'Your student record will appear once linked.'}</Text>
          </View>
          <Pressable onPress={() => void logout()} style={styles.secondaryButton}><Text style={styles.secondaryButtonText}>Logout</Text></Pressable>
        </View>

        <View style={styles.grid}>
          <View style={styles.statCard}><Text style={styles.statValue}>{myLectures.length}</Text><Text style={styles.statLabel}>Schedule</Text></View>
          <View style={styles.statCard}><Text style={styles.statValue}>{attendancePercent}%</Text><Text style={styles.statLabel}>Attendance</Text></View>
          <View style={styles.statCard}><Text style={styles.statValue}>{marksPercent}%</Text><Text style={styles.statLabel}>Marks Avg</Text></View>
          <View style={styles.statCard}><Text style={styles.statValue}>{formatCurrency(feePending)}</Text><Text style={styles.statLabel}>Fee Pending</Text></View>
        </View>

        <View style={styles.actions}>
          <Pressable onPress={() => navigation.navigate('LecturesScreen', { initialTab: 'lectures' })} style={styles.primaryButton}><Text style={styles.primaryButtonText}>View Schedule</Text></Pressable>
          <Pressable onPress={() => navigation.navigate('LecturesScreen', { initialTab: 'attendance' })} style={styles.primaryButton}><Text style={styles.primaryButtonText}>View Attendance</Text></Pressable>
          <Pressable onPress={() => navigation.navigate('LecturesScreen', { initialTab: 'marks' })} style={styles.primaryButton}><Text style={styles.primaryButtonText}>View Marks</Text></Pressable>
          <Pressable onPress={() => navigation.navigate('FeesScreen', { initialTab: 'history' })} style={styles.primaryButton}><Text style={styles.primaryButtonText}>View Fees</Text></Pressable>
          <Pressable onPress={() => navigation.navigate('ModuleEntryScreen', { title: 'Messages', subtitle: 'Student messaging module entry.', moduleKey: 'messages' })} style={styles.primaryButton}><Text style={styles.primaryButtonText}>Messages</Text></Pressable>
          <Pressable onPress={() => navigation.navigate('ModuleEntryScreen', { title: 'Reports', subtitle: 'Student report card module entry.', moduleKey: 'reports' })} style={styles.primaryButton}><Text style={styles.primaryButtonText}>Reports</Text></Pressable>
        </View>

        <Text style={styles.sectionTitle}>Upcoming Schedule</Text>
        {myLectures.slice(0, 4).map((lecture) => (
          <View key={lecture.id} style={styles.card}>
            <Text style={styles.cardTitle}>{lecture.subject}</Text>
            <Text style={styles.cardSubtext}>{new Date(lecture.date).toLocaleDateString()} | {lecture.time}</Text>
            <Text style={styles.cardSubtext}>{lecture.branchName ?? currentClass?.name ?? '-'} | {lecture.batchName ?? lecture.batch}</Text>
          </View>
        ))}
        {myLectures.length === 0 ? <View style={styles.emptyCard}><Text style={styles.emptyText}>No lectures scheduled yet.</Text></View> : null}

        <Text style={styles.sectionTitle}>Recent Marks</Text>
        {myMarks.slice(0, 4).map((mark) => (
          <View key={mark.id} style={styles.card}>
            <Text style={styles.cardTitle}>{mark.examName}</Text>
            <Text style={styles.cardSubtext}>{mark.subject} | {mark.obtainedMarks}/{mark.totalMarks}</Text>
          </View>
        ))}
        {myMarks.length === 0 ? <View style={styles.emptyCard}><Text style={styles.emptyText}>No marks available yet.</Text></View> : null}

        <Text style={styles.sectionTitle}>Fee Status</Text>
        {myFees.slice(0, 4).map((fee) => (
          <View key={fee.id} style={styles.card}>
            <Text style={styles.cardTitle}>{fee.description}</Text>
            <Text style={styles.cardSubtext}>{fee.status.toUpperCase()} | Due {new Date(fee.dueDate).toLocaleDateString()}</Text>
            <Text style={styles.cardSubtext}>{formatCurrency(fee.paidAmount)} paid of {formatCurrency(fee.amount)}</Text>
          </View>
        ))}
        {myFees.length === 0 ? <View style={styles.emptyCard}><Text style={styles.emptyText}>No fee records available yet.</Text></View> : null}
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
