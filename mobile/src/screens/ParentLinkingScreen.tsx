import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Screen } from '../components/Screen';
import { teachflowData } from '../services/teachflowData';
import { AppUser, Student } from '../types/Models';
import { useAuth } from '../store/AuthStore';

export const ParentLinkingScreen = () => {
  const { currentClass } = useAuth();
  const [students, setStudents] = useState<Student[]>([]);
  const [classUsers, setClassUsers] = useState<AppUser[]>([]);
  const [selectedStudentId, setSelectedStudentId] = useState('');
  const [parentEmail, setParentEmail] = useState('');
  const [parentPhone, setParentPhone] = useState('');
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    if (!currentClass?.id) {
      setStudents([]);
      setClassUsers([]);
      return;
    }

    const unsubscribers = [
      teachflowData.subscribeToStudents(currentClass.id, setStudents),
      teachflowData.subscribeToClassUsers(currentClass.id, setClassUsers),
    ];

    return () => unsubscribers.forEach((unsubscribe) => unsubscribe());
  }, [currentClass?.id]);

  const parentUsers = useMemo(() => classUsers.filter((user) => user.role === 'parent'), [classUsers]);

  const saveLink = async () => {
    if (!currentClass?.id || !selectedStudentId || !parentEmail.trim()) {
      setStatus('Select a student and parent email first.');
      return;
    }

    try {
      await teachflowData.linkParentToStudent({
        classId: currentClass.id,
        studentId: selectedStudentId,
        parentEmail: parentEmail.trim(),
        parentPhone: parentPhone.trim() || undefined,
      });
      setStatus('Parent linked successfully.');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Failed to link parent.');
    }
  };

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>Parent Linking</Text>
        <Text style={styles.subtitle}>Link student and parent accounts so parents only see their linked child with read-only access.</Text>

        <Text style={styles.label}>Select Student</Text>
        <View style={styles.wrapRow}>
          {students.map((student) => (
            <Pressable key={student.id} onPress={() => setSelectedStudentId(student.id)} style={[styles.selectChip, selectedStudentId === student.id ? styles.selectChipActive : null]}>
              <Text style={selectedStudentId === student.id ? styles.selectTextActive : styles.selectText}>{student.name}</Text>
            </Pressable>
          ))}
        </View>

        <Text style={styles.label}>Existing Parents</Text>
        <View style={styles.wrapRow}>
          {parentUsers.map((parent) => (
            <Pressable key={parent.id} onPress={() => setParentEmail(parent.email)} style={styles.selectChip}>
              <Text style={styles.selectText}>{parent.name}</Text>
            </Pressable>
          ))}
        </View>

        <TextInput placeholder="Parent Email" value={parentEmail} onChangeText={setParentEmail} style={styles.input} autoCapitalize="none" />
        <TextInput placeholder="Parent Phone" value={parentPhone} onChangeText={setParentPhone} style={styles.input} />
        {status ? <Text style={styles.status}>{status}</Text> : null}

        <Pressable onPress={() => void saveLink()} style={styles.primaryButton}>
          <Text style={styles.primaryButtonText}>Link Parent</Text>
        </Pressable>

        <Text style={styles.sectionTitle}>Current Links</Text>
        {students.map((student) => (
          <View key={student.id} style={styles.card}>
            <Text style={styles.cardTitle}>{student.name}</Text>
            <Text style={styles.cardText}>Parent Email: {student.parentEmail ?? 'Not linked'}</Text>
            <Text style={styles.cardText}>Parent Phone: {student.parentPhone ?? 'N/A'}</Text>
          </View>
        ))}
      </ScrollView>
    </Screen>
  );
};

const styles = StyleSheet.create({
  content: { padding: 16, gap: 12 },
  title: { fontSize: 26, fontWeight: '700', color: '#111827' },
  subtitle: { fontSize: 14, color: '#6b7280' },
  label: { fontSize: 14, fontWeight: '600', color: '#111827' },
  sectionTitle: { fontSize: 18, fontWeight: '700', color: '#111827', marginTop: 8 },
  wrapRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  selectChip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, backgroundColor: '#e5e7eb' },
  selectChipActive: { backgroundColor: '#dbeafe' },
  selectText: { color: '#374151' },
  selectTextActive: { color: '#1d4ed8', fontWeight: '600' },
  input: { borderWidth: 1, borderColor: '#d1d5db', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, backgroundColor: '#ffffff' },
  primaryButton: { paddingHorizontal: 14, paddingVertical: 12, borderRadius: 10, backgroundColor: '#2563eb', alignItems: 'center' },
  primaryButtonText: { color: '#ffffff', fontWeight: '600' },
  status: { color: '#1d4ed8', fontSize: 14 },
  card: { borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 12, backgroundColor: '#ffffff', padding: 14, gap: 4 },
  cardTitle: { fontSize: 15, fontWeight: '600', color: '#111827' },
  cardText: { fontSize: 13, color: '#4b5563' },
});
