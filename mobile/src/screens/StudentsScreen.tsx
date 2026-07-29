import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Screen } from '../components/Screen';
import { teachflowData } from '../services/teachflowData';
import { Batch, Student } from '../types/Models';
import { useAuth } from '../store/AuthStore';

const emptyForm = {
  name: '',
  email: '',
  phone: '',
  batch: 'Batch A',
  grade: '10',
  board: 'CBSE',
  parentEmail: '',
  parentPhone: '',
  rollNumber: '',
  totalFees: '0',
  paidFees: '0',
};

export const StudentsScreen = () => {
  const { currentClass, firebaseUser } = useAuth();
  const [students, setStudents] = useState<Student[]>([]);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [editingStudent, setEditingStudent] = useState<Student | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [search, setSearch] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!currentClass?.id) {
      setStudents([]);
      setBatches([]);
      return;
    }

    const unsubscribers = [
      teachflowData.subscribeToStudents(currentClass.id, setStudents),
      teachflowData.subscribeToBatches(currentClass.id, setBatches),
    ];

    return () => unsubscribers.forEach((unsubscribe) => unsubscribe());
  }, [currentClass?.id]);

  const filteredStudents = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) {
      return students;
    }

    return students.filter((student) =>
      [student.name, student.email, student.rollNumber, student.batch, student.parentEmail ?? '']
        .join(' ')
        .toLowerCase()
        .includes(query)
    );
  }, [search, students]);

  const openCreate = () => {
    setEditingStudent(null);
    setForm(emptyForm);
    setError(null);
    setShowForm(true);
  };

  const openEdit = (student: Student) => {
    setEditingStudent(student);
    setForm({
      name: student.name,
      email: student.email,
      phone: student.phone ?? '',
      batch: student.batch,
      grade: student.grade ?? '10',
      board: student.board ?? 'CBSE',
      parentEmail: student.parentEmail ?? '',
      parentPhone: student.parentPhone ?? '',
      rollNumber: student.rollNumber,
      totalFees: String(student.totalFees),
      paidFees: String(student.paidFees),
    });
    setError(null);
    setShowForm(true);
  };

  const resetForm = () => {
    setShowForm(false);
    setEditingStudent(null);
    setForm(emptyForm);
    setError(null);
  };

  const saveStudent = async () => {
    if (!currentClass?.id || !firebaseUser) {
      return;
    }

    if (!form.name.trim() || !form.email.trim() || !form.rollNumber.trim()) {
      setError('Name, email, and roll number are required.');
      return;
    }

    const totalFees = Number(form.totalFees) || 0;
    const paidFees = Number(form.paidFees) || 0;
    if (paidFees > totalFees) {
      setError('Paid fees cannot be greater than total fees.');
      return;
    }

    const selectedBatch = batches.find((batch) => batch.name === form.batch) ?? null;
    const feeStatus: Student['feeStatus'] = paidFees <= 0 ? 'due' : paidFees >= totalFees && totalFees > 0 ? 'paid' : 'partial';

    setSaving(true);
    setError(null);
    try {
      if (editingStudent) {
        await teachflowData.updateStudent(currentClass.id, editingStudent.id, {
          name: form.name.trim(),
          email: form.email.trim(),
          phone: form.phone.trim() || undefined,
          batch: form.batch,
          batchId: selectedBatch?.id,
          grade: form.grade.trim() || undefined,
          board: form.board.trim() || undefined,
          parentEmail: form.parentEmail.trim() || undefined,
          parentPhone: form.parentPhone.trim() || undefined,
          rollNumber: form.rollNumber.trim(),
          totalFees,
          paidFees,
          feeStatus,
        });
      } else {
        await teachflowData.addStudent(currentClass.id, {
          name: form.name.trim(),
          email: form.email.trim(),
          phone: form.phone.trim() || undefined,
          batch: form.batch,
          batchId: selectedBatch?.id,
          grade: form.grade.trim() || undefined,
          board: form.board.trim() || undefined,
          parentEmail: form.parentEmail.trim() || undefined,
          parentPhone: form.parentPhone.trim() || undefined,
          rollNumber: form.rollNumber.trim(),
          totalFees,
          paidFees,
          feeStatus,
        });

        await teachflowData.createInvite({
          email: form.email.trim(),
          role: 'student',
          classId: currentClass.id,
          invitedBy: firebaseUser.uid,
        });

        if (form.parentEmail.trim()) {
          await teachflowData.createInvite({
            email: form.parentEmail.trim(),
            role: 'parent',
            classId: currentClass.id,
            invitedBy: firebaseUser.uid,
          });
        }
      }

      resetForm();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Failed to save student.');
    } finally {
      setSaving(false);
    }
  };

  const deleteStudent = (student: Student) => {
    if (!currentClass?.id) {
      return;
    }

    Alert.alert('Delete student', `Remove ${student.name} from this class?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          void teachflowData.deleteStudent(currentClass.id, student.id);
        },
      },
    ]);
  };

  const reassignBatch = async (student: Student) => {
    if (!currentClass?.id || batches.length === 0) {
      return;
    }

    const currentIndex = Math.max(batches.findIndex((batch) => batch.id === student.batchId || batch.name === student.batch), 0);
    const nextBatch = batches[(currentIndex + 1) % batches.length];
    await teachflowData.updateStudentBatch(currentClass.id, student.id, { id: nextBatch.id, name: nextBatch.name });
  };

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.headerRow}>
          <View style={styles.headerText}>
            <Text style={styles.title}>Students</Text>
            <Text style={styles.subtitle}>List, add, edit, view, assign batch, and store parent details.</Text>
          </View>
          <Pressable onPress={openCreate} style={({ pressed }) => [styles.primaryButton, pressed ? styles.pressed : null]}>
            <Text style={styles.primaryButtonText}>Add Student</Text>
          </Pressable>
        </View>

        <TextInput placeholder="Search students" value={search} onChangeText={setSearch} style={styles.input} />
        {error ? <Text style={styles.error}>{error}</Text> : null}

        {filteredStudents.map((student) => (
          <Pressable key={student.id} onPress={() => setSelectedStudent(student)} style={({ pressed }) => [styles.card, pressed ? styles.pressed : null]}>
            <View style={styles.cardHeader}>
              <View>
                <Text style={styles.cardTitle}>{student.name}</Text>
                <Text style={styles.cardSubtitle}>{student.email}</Text>
              </View>
              <Text style={styles.badge}>{student.batch}</Text>
            </View>
            <Text style={styles.smallText}>Roll No: {student.rollNumber}</Text>
            <Text style={styles.smallText}>Parent: {student.parentEmail ?? 'Not linked'}</Text>
            <Text style={styles.smallText}>Fees: Rs. {student.paidFees} / Rs. {student.totalFees}</Text>

            <View style={styles.actionRow}>
              <Pressable onPress={() => openEdit(student)} style={styles.inlineButton}>
                <Text style={styles.inlineButtonText}>Edit</Text>
              </Pressable>
              <Pressable onPress={() => void reassignBatch(student)} style={styles.inlineButton}>
                <Text style={styles.inlineButtonText}>Assign Batch</Text>
              </Pressable>
              <Pressable onPress={() => deleteStudent(student)} style={styles.inlineButtonDanger}>
                <Text style={styles.inlineButtonDangerText}>Delete</Text>
              </Pressable>
            </View>
          </Pressable>
        ))}

        {selectedStudent ? (
          <View style={styles.detailCard}>
            <Text style={styles.sectionTitle}>Student View</Text>
            <Text style={styles.smallText}>Name: {selectedStudent.name}</Text>
            <Text style={styles.smallText}>Email: {selectedStudent.email}</Text>
            <Text style={styles.smallText}>Phone: {selectedStudent.phone ?? 'N/A'}</Text>
            <Text style={styles.smallText}>Grade / Board: {selectedStudent.grade ?? 'N/A'} / {selectedStudent.board ?? 'N/A'}</Text>
            <Text style={styles.smallText}>Batch: {selectedStudent.batch}</Text>
            <Text style={styles.smallText}>Parent Email: {selectedStudent.parentEmail ?? 'Not linked'}</Text>
            <Text style={styles.smallText}>Parent Phone: {selectedStudent.parentPhone ?? 'N/A'}</Text>
            <Pressable onPress={() => setSelectedStudent(null)} style={styles.inlineButton}>
              <Text style={styles.inlineButtonText}>Close</Text>
            </Pressable>
          </View>
        ) : null}
      </ScrollView>

      <Modal transparent visible={showForm} animationType="slide" onRequestClose={resetForm}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <ScrollView contentContainerStyle={styles.modalContent}>
              <Text style={styles.sectionTitle}>{editingStudent ? 'Edit Student' : 'Add Student'}</Text>
              <TextInput placeholder="Name" value={form.name} onChangeText={(value) => setForm((prev) => ({ ...prev, name: value }))} style={styles.input} />
              <TextInput placeholder="Email" value={form.email} onChangeText={(value) => setForm((prev) => ({ ...prev, email: value }))} style={styles.input} autoCapitalize="none" />
              <TextInput placeholder="Phone" value={form.phone} onChangeText={(value) => setForm((prev) => ({ ...prev, phone: value }))} style={styles.input} />
              <TextInput placeholder="Roll Number" value={form.rollNumber} onChangeText={(value) => setForm((prev) => ({ ...prev, rollNumber: value }))} style={styles.input} />
              <TextInput placeholder="Batch Name" value={form.batch} onChangeText={(value) => setForm((prev) => ({ ...prev, batch: value }))} style={styles.input} />
              <TextInput placeholder="Grade" value={form.grade} onChangeText={(value) => setForm((prev) => ({ ...prev, grade: value }))} style={styles.input} />
              <TextInput placeholder="Board" value={form.board} onChangeText={(value) => setForm((prev) => ({ ...prev, board: value }))} style={styles.input} />
              <TextInput placeholder="Parent Email" value={form.parentEmail} onChangeText={(value) => setForm((prev) => ({ ...prev, parentEmail: value }))} style={styles.input} autoCapitalize="none" />
              <TextInput placeholder="Parent Phone" value={form.parentPhone} onChangeText={(value) => setForm((prev) => ({ ...prev, parentPhone: value }))} style={styles.input} />
              <TextInput placeholder="Total Fees" value={form.totalFees} onChangeText={(value) => setForm((prev) => ({ ...prev, totalFees: value }))} style={styles.input} keyboardType="numeric" />
              <TextInput placeholder="Paid Fees" value={form.paidFees} onChangeText={(value) => setForm((prev) => ({ ...prev, paidFees: value }))} style={styles.input} keyboardType="numeric" />
              {error ? <Text style={styles.error}>{error}</Text> : null}
              <View style={styles.actionRow}>
                <Pressable onPress={resetForm} style={styles.inlineButton}>
                  <Text style={styles.inlineButtonText}>Cancel</Text>
                </Pressable>
                <Pressable disabled={saving} onPress={() => void saveStudent()} style={({ pressed }) => [styles.primaryButton, pressed ? styles.pressed : null]}>
                  <Text style={styles.primaryButtonText}>{saving ? 'Saving...' : editingStudent ? 'Update' : 'Create'}</Text>
                </Pressable>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </Screen>
  );
};

const styles = StyleSheet.create({
  content: { padding: 16, gap: 12 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, alignItems: 'center' },
  headerText: { flex: 1, gap: 4 },
  title: { fontSize: 26, fontWeight: '700', color: '#111827' },
  subtitle: { fontSize: 14, color: '#6b7280' },
  input: { borderWidth: 1, borderColor: '#d1d5db', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, backgroundColor: '#ffffff' },
  card: { borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 12, backgroundColor: '#ffffff', padding: 14, gap: 6 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  cardTitle: { fontSize: 16, fontWeight: '600', color: '#111827' },
  cardSubtitle: { fontSize: 13, color: '#6b7280' },
  badge: { alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, backgroundColor: '#dbeafe', color: '#1d4ed8', fontWeight: '600', overflow: 'hidden' },
  smallText: { fontSize: 13, color: '#4b5563' },
  actionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 6 },
  inlineButton: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, backgroundColor: '#e5e7eb' },
  inlineButtonText: { fontWeight: '600', color: '#111827' },
  inlineButtonDanger: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, backgroundColor: '#fee2e2' },
  inlineButtonDangerText: { color: '#b91c1c', fontWeight: '600' },
  primaryButton: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10, backgroundColor: '#2563eb' },
  primaryButtonText: { color: '#ffffff', fontWeight: '600' },
  pressed: { opacity: 0.9 },
  detailCard: { borderWidth: 1, borderColor: '#bfdbfe', borderRadius: 12, backgroundColor: '#eff6ff', padding: 14, gap: 6 },
  sectionTitle: { fontSize: 18, fontWeight: '700', color: '#111827' },
  error: { color: '#dc2626', fontSize: 14 },
  modalBackdrop: { flex: 1, justifyContent: 'center', backgroundColor: 'rgba(17, 24, 39, 0.45)', padding: 16 },
  modalCard: { maxHeight: '90%', borderRadius: 16, backgroundColor: '#f9fafb', overflow: 'hidden' },
  modalContent: { padding: 16, gap: 12 },
});
