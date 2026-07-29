import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Screen } from '../components/Screen';
import type { AppStackParamList } from '../navigation/AppStack';
import { teachflowData } from '../services/teachflowData';
import { AttendanceRecord, Fee, Lecture, MarksRecord, Student } from '../types/Models';
import { useAuth } from '../store/AuthStore';

type Props = NativeStackScreenProps<AppStackParamList, 'ParentDashboard'>;

export const ParentDashboard = ({ navigation }: Props) => {
  const { currentClass, logout, userProfile } = useAuth();
  const [students, setStudents] = useState<Student[]>([]);
  const [fees, setFees] = useState<Fee[]>([]);
  const [lectures, setLectures] = useState<Lecture[]>([]);
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [marks, setMarks] = useState<MarksRecord[]>([]);

  useEffect(() => {
    if (!currentClass?.id) {
      setStudents([]);
      setFees([]);
      setLectures([]);
      setAttendance([]);
      setMarks([]);
      return;
    }

    const linkedIds = userProfile?.linkedStudentIds ?? (userProfile?.linkedStudentId ? [userProfile.linkedStudentId] : []);
    const unsubscribers = [
      teachflowData.subscribeToStudentsByIds(currentClass.id, linkedIds.filter(Boolean), setStudents),
      teachflowData.subscribeToFees(currentClass.id, setFees),
      teachflowData.subscribeToLectures(currentClass.id, setLectures),
      teachflowData.subscribeToAttendance(currentClass.id, setAttendance),
      teachflowData.subscribeToMarks(currentClass.id, setMarks),
    ];

    return () => unsubscribers.forEach((unsubscribe) => unsubscribe());
  }, [currentClass?.id, userProfile?.linkedStudentId, userProfile?.linkedStudentIds]);

  const child = students[0] ?? null;
  const childFees = fees.filter((fee) => fee.studentId === child?.id);
  const feePending = childFees.reduce((sum, fee) => sum + Math.max(fee.amount - fee.paidAmount, 0), 0);
  const childAttendance = attendance.filter((entry) => entry.studentId === child?.id);
  const childMarks = marks.filter((entry) => entry.studentId === child?.id);
  const childLectures = lectures.filter((lecture) => (child ? (child.batchId ? lecture.batchId === child.batchId : lecture.batch === child.batch) : false));

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.headerRow}>
          <View style={styles.headerText}>
            <Text style={styles.title}>Parent Dashboard</Text>
            <Text style={styles.subtitle}>Read-only access to your linked student only.</Text>
          </View>
          <Pressable onPress={() => void logout()} style={styles.button}>
            <Text style={styles.buttonText}>Logout</Text>
          </Pressable>
        </View>

        {!child ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Student Link Pending</Text>
            <Text style={styles.cardText}>Your parent account does not have a linked student yet.</Text>
          </View>
        ) : (
          <>
            <View style={styles.card}>
              <Text style={styles.cardTitle}>{child.name}</Text>
              <Text style={styles.cardText}>Batch: {child.batch}</Text>
              <Text style={styles.cardText}>Roll No: {child.rollNumber}</Text>
              <Text style={styles.cardText}>Pending Fees: Rs. {feePending.toLocaleString('en-IN')}</Text>
              <View style={styles.actionRow}>
                <Pressable onPress={() => navigation.navigate('LecturesScreen', { initialTab: 'lectures' })} style={styles.inlineButton}>
                  <Text style={styles.inlineButtonText}>Schedule</Text>
                </Pressable>
                <Pressable onPress={() => navigation.navigate('LecturesScreen', { initialTab: 'attendance' })} style={styles.inlineButton}>
                  <Text style={styles.inlineButtonText}>Attendance</Text>
                </Pressable>
                <Pressable onPress={() => navigation.navigate('LecturesScreen', { initialTab: 'marks' })} style={styles.inlineButton}>
                  <Text style={styles.inlineButtonText}>Marks</Text>
                </Pressable>
                <Pressable onPress={() => navigation.navigate('FeesScreen', { initialTab: 'history' })} style={styles.inlineButton}>
                  <Text style={styles.inlineButtonText}>Receipts</Text>
                </Pressable>
                <Pressable onPress={() => navigation.navigate('ModuleEntryScreen', { title: 'Messages', subtitle: 'Parent messaging module entry.', moduleKey: 'messages' })} style={styles.inlineButton}>
                  <Text style={styles.inlineButtonText}>Messages</Text>
                </Pressable>
              </View>
            </View>

            <View style={styles.card}>
              <Text style={styles.cardTitle}>Academic Snapshot</Text>
              <Text style={styles.cardText}>Upcoming Lectures: {childLectures.length}</Text>
              <Text style={styles.cardText}>Attendance Records: {childAttendance.length}</Text>
              <Text style={styles.cardText}>Marks Entries: {childMarks.length}</Text>
            </View>

            <Text style={styles.sectionTitle}>Fee Records</Text>
            {childFees.map((fee) => (
              <View key={fee.id} style={styles.card}>
                <Text style={styles.cardTitle}>{fee.description}</Text>
                <Text style={styles.cardText}>Due Date: {fee.dueDate}</Text>
                <Text style={styles.cardText}>Status: {fee.status}</Text>
                <Text style={styles.cardText}>Paid: Rs. {fee.paidAmount} / Rs. {fee.amount}</Text>
                <Text style={styles.cardText}>Receipts: {fee.paymentHistory?.length ?? 0}</Text>
              </View>
            ))}
          </>
        )}
      </ScrollView>
    </Screen>
  );
};

const styles = StyleSheet.create({
  content: { padding: 16, gap: 12 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, alignItems: 'center' },
  headerText: { flex: 1, gap: 4 },
  title: { fontSize: 26, fontWeight: '700', color: '#111827' },
  subtitle: { fontSize: 14, color: '#6b7280' },
  button: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10, backgroundColor: '#2563eb' },
  buttonText: { color: '#ffffff', fontWeight: '600' },
  actionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  inlineButton: { marginTop: 8, alignSelf: 'flex-start', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, backgroundColor: '#eff6ff' },
  inlineButtonText: { color: '#1d4ed8', fontWeight: '600' },
  sectionTitle: { fontSize: 18, fontWeight: '700', color: '#111827' },
  card: { borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 12, backgroundColor: '#ffffff', padding: 14, gap: 4 },
  cardTitle: { fontSize: 16, fontWeight: '600', color: '#111827' },
  cardText: { fontSize: 13, color: '#4b5563' },
});
