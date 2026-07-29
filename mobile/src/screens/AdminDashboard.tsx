import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Screen } from '../components/Screen';
import { teachflowData } from '../services/teachflowData';
import { Batch, Fee, Student, Teacher } from '../types/Models';
import { useAuth } from '../store/AuthStore';
import { AppStackParamList } from '../navigation/AppStack';

type Props = NativeStackScreenProps<AppStackParamList, 'AdminDashboard'>;

export const AdminDashboard = ({ navigation }: Props) => {
  const { currentClass, logout } = useAuth();
  const [students, setStudents] = useState<Student[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [fees, setFees] = useState<Fee[]>([]);

  useEffect(() => {
    if (!currentClass?.id) {
      setStudents([]);
      setTeachers([]);
      setBatches([]);
      setFees([]);
      return;
    }

    const unsubscribers = [
      teachflowData.subscribeToStudents(currentClass.id, setStudents),
      teachflowData.subscribeToTeachers(currentClass.id, setTeachers),
      teachflowData.subscribeToBatches(currentClass.id, setBatches),
      teachflowData.subscribeToFees(currentClass.id, setFees),
    ];

    return () => unsubscribers.forEach((unsubscribe) => unsubscribe());
  }, [currentClass?.id]);

  const feeSummary = useMemo(() => {
    const collected = fees.reduce((sum, fee) => sum + fee.paidAmount, 0);
    const total = fees.reduce((sum, fee) => sum + fee.amount, 0);
    return {
      collected,
      pending: Math.max(total - collected, 0),
      total,
    };
  }, [fees]);

  const quickActions: Array<{ label: string; description: string; onPress: () => void }> = [
    { label: 'Students', description: 'Student management', onPress: () => navigation.navigate('StudentsScreen') },
    { label: 'Teachers', description: 'Teacher management', onPress: () => navigation.navigate('TeachersScreen') },
    { label: 'Batches', description: 'Batch management', onPress: () => navigation.navigate('BatchesScreen') },
    { label: 'Lectures', description: 'Lecture scheduling', onPress: () => navigation.navigate('LecturesScreen', { initialTab: 'lectures' }) },
    { label: 'Attendance', description: 'Lecture attendance', onPress: () => navigation.navigate('LecturesScreen', { initialTab: 'attendance' }) },
    { label: 'Marks', description: 'Marks entry', onPress: () => navigation.navigate('LecturesScreen', { initialTab: 'marks' }) },
    { label: 'Fees', description: 'Fee management', onPress: () => navigation.navigate('FeesScreen', { initialTab: 'fees' }) },
    { label: 'Billing', description: 'Subscription billing', onPress: () => navigation.navigate('FeesScreen', { initialTab: 'billing' }) },
    { label: 'Parent Linking', description: 'Parent mapping', onPress: () => navigation.navigate('ParentLinkingScreen') },
    { label: 'Messages', description: 'Messaging center', onPress: () => navigation.navigate('ModuleEntryScreen', { title: 'Messages', subtitle: 'Class communication module entry for admins.', moduleKey: 'messages' }) },
    { label: 'Reports', description: 'Report cards', onPress: () => navigation.navigate('ModuleEntryScreen', { title: 'Reports', subtitle: 'Report card and summary module entry for admins.', moduleKey: 'reports' }) },
    { label: 'Analytics', description: 'Analytics dashboard', onPress: () => navigation.navigate('ModuleEntryScreen', { title: 'Analytics', subtitle: 'Class analytics module entry for admins.', moduleKey: 'analytics' }) },
    { label: 'AI Insights', description: 'AI workspace', onPress: () => navigation.navigate('ModuleEntryScreen', { title: 'AI Insights', subtitle: 'Admin AI tools and insights entry.', moduleKey: 'ai' }) },
    { label: 'Branches', description: 'Branch management', onPress: () => navigation.navigate('ModuleEntryScreen', { title: 'Branches', subtitle: 'Branch and multi-class management entry.', moduleKey: 'branches' }) },
    { label: 'Approvals', description: 'User approvals', onPress: () => navigation.navigate('ModuleEntryScreen', { title: 'Approvals', subtitle: 'Pending user approvals entry.', moduleKey: 'approvals' }) },
    { label: 'Settings', description: 'Workspace settings', onPress: () => navigation.navigate('ModuleEntryScreen', { title: 'Settings', subtitle: 'Class settings and access control entry.', moduleKey: 'settings' }) },
  ];

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.headerRow}>
          <View style={styles.headerText}>
            <Text style={styles.eyebrow}>Admin Workspace</Text>
            <Text style={styles.title}>{currentClass?.name ?? 'TeachFlow Admin'}</Text>
            <Text style={styles.subtitle}>Manage the same academics data used in the web admin dashboard.</Text>
          </View>
          <Pressable onPress={() => void logout()} style={({ pressed }) => [styles.secondaryButton, pressed ? styles.pressed : null]}>
            <Text style={styles.secondaryButtonText}>Logout</Text>
          </Pressable>
        </View>

        <View style={styles.cardGrid}>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{students.length}</Text>
            <Text style={styles.statLabel}>Total Students</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{teachers.length}</Text>
            <Text style={styles.statLabel}>Total Teachers</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{batches.length}</Text>
            <Text style={styles.statLabel}>Total Batches</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>Rs. {feeSummary.collected}</Text>
            <Text style={styles.statLabel}>Collected Fees</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>Rs. {feeSummary.pending}</Text>
            <Text style={styles.statLabel}>Pending Fees</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>Rs. {feeSummary.total}</Text>
            <Text style={styles.statLabel}>Fee Total</Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Quick Actions</Text>
          <View style={styles.actionGrid}>
            {quickActions.map((action) => (
              <Pressable key={action.label} onPress={action.onPress} style={({ pressed }) => [styles.actionCard, pressed ? styles.pressed : null]}>
                <Text style={styles.actionTitle}>{action.label}</Text>
                <Text style={styles.actionDescription}>{action.description}</Text>
              </Pressable>
            ))}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Batch Snapshot</Text>
          {batches.length === 0 ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyText}>Create batches to organize students and teacher assignments.</Text>
            </View>
          ) : (
            batches.map((batch) => {
              const studentCount = students.filter((student) => (student.batchId ? student.batchId === batch.id : student.batch === batch.name)).length;
              return (
                <View key={batch.id} style={styles.rowCard}>
                  <View>
                    <Text style={styles.rowTitle}>{batch.name}</Text>
                    <Text style={styles.rowSubtext}>{batch.timing}</Text>
                  </View>
                  <View style={styles.alignEnd}>
                    <Text style={styles.rowTitle}>{studentCount} students</Text>
                    <Text style={styles.rowSubtext}>{batch.teacherName ?? 'No teacher assigned'}</Text>
                  </View>
                </View>
              );
            })
          )}
        </View>
      </ScrollView>
    </Screen>
  );
};

const styles = StyleSheet.create({
  content: {
    padding: 16,
    gap: 16,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
    alignItems: 'flex-start',
  },
  headerText: {
    flex: 1,
    gap: 4,
  },
  eyebrow: {
    fontSize: 12,
    fontWeight: '700',
    color: '#2563eb',
    textTransform: 'uppercase',
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#111827',
  },
  subtitle: {
    fontSize: 14,
    color: '#4b5563',
  },
  secondaryButton: {
    minHeight: 42,
    paddingHorizontal: 16,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#e5e7eb',
  },
  secondaryButtonText: {
    color: '#111827',
    fontWeight: '600',
  },
  cardGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  statCard: {
    width: '48%',
    borderRadius: 12,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    padding: 14,
    gap: 6,
  },
  statValue: {
    fontSize: 22,
    fontWeight: '700',
    color: '#111827',
  },
  statLabel: {
    fontSize: 13,
    color: '#6b7280',
  },
  section: {
    gap: 10,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
  },
  actionGrid: {
    gap: 10,
  },
  actionCard: {
    borderRadius: 12,
    padding: 14,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#dbeafe',
  },
  actionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1d4ed8',
  },
  actionDescription: {
    fontSize: 13,
    color: '#4b5563',
    marginTop: 4,
  },
  emptyCard: {
    borderRadius: 12,
    padding: 14,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  emptyText: {
    fontSize: 14,
    color: '#6b7280',
  },
  rowCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderRadius: 12,
    padding: 14,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  rowTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#111827',
  },
  rowSubtext: {
    fontSize: 13,
    color: '#6b7280',
    marginTop: 2,
  },
  alignEnd: {
    alignItems: 'flex-end',
  },
  pressed: {
    opacity: 0.9,
  },
});
