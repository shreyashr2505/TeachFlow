import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Screen } from '../components/Screen';
import { teachflowData } from '../services/teachflowData';
import { Batch, Student, Teacher } from '../types/Models';
import { useAuth } from '../store/AuthStore';

const emptyForm = {
  name: '',
  timing: '',
  teacherId: '',
};

export const BatchesScreen = () => {
  const { currentClass } = useAuth();
  const [batches, setBatches] = useState<Batch[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [editingBatch, setEditingBatch] = useState<Batch | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [selectedBatchId, setSelectedBatchId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!currentClass?.id) {
      setBatches([]);
      setTeachers([]);
      setStudents([]);
      return;
    }

    const unsubscribers = [
      teachflowData.subscribeToBatches(currentClass.id, setBatches),
      teachflowData.subscribeToTeachers(currentClass.id, setTeachers),
      teachflowData.subscribeToStudents(currentClass.id, setStudents),
    ];

    return () => unsubscribers.forEach((unsubscribe) => unsubscribe());
  }, [currentClass?.id]);

  const selectedBatch = useMemo(() => batches.find((batch) => batch.id === selectedBatchId) ?? null, [batches, selectedBatchId]);

  const openCreate = () => {
    setEditingBatch(null);
    setForm({ ...emptyForm, teacherId: teachers[0]?.id ?? '' });
    setShowForm(true);
    setError(null);
  };

  const openEdit = (batch: Batch) => {
    setEditingBatch(batch);
    setForm({
      name: batch.name,
      timing: batch.timing,
      teacherId: batch.teacherId ?? '',
    });
    setShowForm(true);
    setError(null);
  };

  const closeForm = () => {
    setShowForm(false);
    setEditingBatch(null);
    setForm(emptyForm);
    setError(null);
  };

  const saveBatch = async () => {
    if (!currentClass?.id || !form.name.trim() || !form.timing.trim()) {
      setError('Batch name and timing are required.');
      return;
    }

    const teacher = teachers.find((item) => item.id === form.teacherId) ?? null;
    try {
      if (editingBatch) {
        await teachflowData.updateBatch(currentClass.id, editingBatch.id, {
          name: form.name.trim(),
          timing: form.timing.trim(),
          teacherId: teacher?.id,
          teacherName: teacher?.name,
          subjects: editingBatch.subjects ?? [],
        });
      } else {
        await teachflowData.addBatch(currentClass.id, {
          name: form.name.trim(),
          timing: form.timing.trim(),
          teacherId: teacher?.id,
          teacherName: teacher?.name,
          subjects: teacher?.subjects ?? [],
        });
      }
      closeForm();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Failed to save batch.');
    }
  };

  const deleteBatch = (batch: Batch) => {
    if (!currentClass?.id) return;
    Alert.alert('Delete batch', `Delete ${batch.name}?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => void teachflowData.deleteBatch(currentClass.id, batch.id) },
    ]);
  };

  const assignStudentsToBatch = async (batch: Batch) => {
    if (!currentClass?.id) return;
    const unassignedStudents = students.filter((student) => student.batchId !== batch.id);
    if (unassignedStudents.length === 0) return;
    await teachflowData.updateStudentBatch(currentClass.id, unassignedStudents[0].id, { id: batch.id, name: batch.name });
  };

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.headerRow}>
          <View style={styles.headerText}>
            <Text style={styles.title}>Batches</Text>
            <Text style={styles.subtitle}>Create batches, assign teachers, and move students into them.</Text>
          </View>
          <Pressable onPress={openCreate} style={({ pressed }) => [styles.primaryButton, pressed ? styles.pressed : null]}>
            <Text style={styles.primaryButtonText}>Create Batch</Text>
          </Pressable>
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        {batches.map((batch) => {
          const batchStudents = students.filter((student) => (student.batchId ? student.batchId === batch.id : student.batch === batch.name));
          return (
            <Pressable key={batch.id} onPress={() => setSelectedBatchId(batch.id)} style={({ pressed }) => [styles.card, pressed ? styles.pressed : null]}>
              <View style={styles.cardHeader}>
                <View>
                  <Text style={styles.cardTitle}>{batch.name}</Text>
                  <Text style={styles.cardSubtitle}>{batch.timing}</Text>
                </View>
                <Text style={styles.badge}>{batchStudents.length} students</Text>
              </View>
              <Text style={styles.smallText}>Teacher: {batch.teacherName ?? 'Unassigned'}</Text>
              <Text style={styles.smallText}>Subjects: {batch.subjects.length > 0 ? batch.subjects.join(', ') : 'No subjects'}</Text>
              <View style={styles.actionRow}>
                <Pressable onPress={() => openEdit(batch)} style={styles.inlineButton}>
                  <Text style={styles.inlineButtonText}>Edit</Text>
                </Pressable>
                <Pressable onPress={() => void assignStudentsToBatch(batch)} style={styles.inlineButton}>
                  <Text style={styles.inlineButtonText}>Assign Student</Text>
                </Pressable>
                <Pressable onPress={() => deleteBatch(batch)} style={styles.inlineButtonDanger}>
                  <Text style={styles.inlineButtonDangerText}>Delete</Text>
                </Pressable>
              </View>
            </Pressable>
          );
        })}

        {selectedBatch ? (
          <View style={styles.detailCard}>
            <Text style={styles.sectionTitle}>Batch Detail</Text>
            <Text style={styles.smallText}>Timing: {selectedBatch.timing}</Text>
            <Text style={styles.smallText}>Teacher: {selectedBatch.teacherName ?? 'Unassigned'}</Text>
            <Text style={styles.smallText}>Students:</Text>
            {students
              .filter((student) => (student.batchId ? student.batchId === selectedBatch.id : student.batch === selectedBatch.name))
              .map((student) => (
                <Text key={student.id} style={styles.smallText}>- {student.name}</Text>
              ))}
          </View>
        ) : null}
      </ScrollView>

      <Modal transparent visible={showForm} animationType="slide" onRequestClose={closeForm}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <ScrollView contentContainerStyle={styles.modalContent}>
              <Text style={styles.sectionTitle}>{editingBatch ? 'Edit Batch' : 'Create Batch'}</Text>
              <TextInput placeholder="Batch Name" value={form.name} onChangeText={(value) => setForm((prev) => ({ ...prev, name: value }))} style={styles.input} />
              <TextInput placeholder="Timing" value={form.timing} onChangeText={(value) => setForm((prev) => ({ ...prev, timing: value }))} style={styles.input} />
              <Text style={styles.label}>Teacher</Text>
              <View style={styles.wrapRow}>
                {teachers.map((teacher) => (
                  <Pressable key={teacher.id} onPress={() => setForm((prev) => ({ ...prev, teacherId: teacher.id }))} style={[styles.selectChip, form.teacherId === teacher.id ? styles.selectChipActive : null]}>
                    <Text style={form.teacherId === teacher.id ? styles.selectTextActive : styles.selectText}>{teacher.name}</Text>
                  </Pressable>
                ))}
              </View>
              {error ? <Text style={styles.error}>{error}</Text> : null}
              <View style={styles.actionRow}>
                <Pressable onPress={closeForm} style={styles.inlineButton}>
                  <Text style={styles.inlineButtonText}>Cancel</Text>
                </Pressable>
                <Pressable onPress={() => void saveBatch()} style={styles.primaryButton}>
                  <Text style={styles.primaryButtonText}>{editingBatch ? 'Update' : 'Create'}</Text>
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
  primaryButton: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10, backgroundColor: '#2563eb' },
  primaryButtonText: { color: '#ffffff', fontWeight: '600' },
  pressed: { opacity: 0.9 },
  card: { borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 12, backgroundColor: '#ffffff', padding: 14, gap: 6 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  cardTitle: { fontSize: 16, fontWeight: '600', color: '#111827' },
  cardSubtitle: { fontSize: 13, color: '#6b7280' },
  badge: { alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, backgroundColor: '#dcfce7', color: '#15803d', fontWeight: '600', overflow: 'hidden' },
  smallText: { fontSize: 13, color: '#4b5563' },
  actionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  inlineButton: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, backgroundColor: '#e5e7eb' },
  inlineButtonText: { fontWeight: '600', color: '#111827' },
  inlineButtonDanger: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, backgroundColor: '#fee2e2' },
  inlineButtonDangerText: { color: '#b91c1c', fontWeight: '600' },
  detailCard: { borderWidth: 1, borderColor: '#dbeafe', borderRadius: 12, backgroundColor: '#eff6ff', padding: 14, gap: 6 },
  sectionTitle: { fontSize: 18, fontWeight: '700', color: '#111827' },
  error: { color: '#dc2626', fontSize: 14 },
  modalBackdrop: { flex: 1, justifyContent: 'center', backgroundColor: 'rgba(17, 24, 39, 0.45)', padding: 16 },
  modalCard: { maxHeight: '90%', borderRadius: 16, backgroundColor: '#f9fafb', overflow: 'hidden' },
  modalContent: { padding: 16, gap: 12 },
  input: { borderWidth: 1, borderColor: '#d1d5db', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, backgroundColor: '#ffffff' },
  label: { fontSize: 14, fontWeight: '600', color: '#111827' },
  wrapRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  selectChip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, backgroundColor: '#e5e7eb' },
  selectChipActive: { backgroundColor: '#dbeafe' },
  selectText: { color: '#374151' },
  selectTextActive: { color: '#1d4ed8', fontWeight: '600' },
});
