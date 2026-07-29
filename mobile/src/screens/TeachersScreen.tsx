import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Screen } from '../components/Screen';
import { teachflowData } from '../services/teachflowData';
import { Batch, Teacher } from '../types/Models';
import { useAuth } from '../store/AuthStore';

const subjectOptions = ['Mathematics', 'Physics', 'Chemistry', 'Biology', 'English'];

const emptyForm = {
  name: '',
  email: '',
  phone: '',
  salaryType: 'fixed' as 'hourly' | 'fixed',
  hourlyRate: '0',
  fixedSalary: '0',
  subjects: [] as string[],
  batches: [] as string[],
};

export const TeachersScreen = () => {
  const { currentClass, firebaseUser } = useAuth();
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [editingTeacher, setEditingTeacher] = useState<Teacher | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [showForm, setShowForm] = useState(false);
  const [search, setSearch] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!currentClass?.id) {
      setTeachers([]);
      setBatches([]);
      return;
    }

    const unsubscribers = [
      teachflowData.subscribeToTeachers(currentClass.id, setTeachers),
      teachflowData.subscribeToBatches(currentClass.id, setBatches),
    ];

    return () => unsubscribers.forEach((unsubscribe) => unsubscribe());
  }, [currentClass?.id]);

  const batchOptions = useMemo(
    () => Array.from(new Set([...batches.map((batch) => batch.name), ...teachers.flatMap((teacher) => teacher.batches)])),
    [batches, teachers]
  );

  const filteredTeachers = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return teachers;
    return teachers.filter((teacher) => [teacher.name, teacher.email, ...(teacher.subjects ?? [])].join(' ').toLowerCase().includes(query));
  }, [search, teachers]);

  const toggleSelection = (key: 'subjects' | 'batches', value: string) => {
    setForm((prev) => ({
      ...prev,
      [key]: prev[key].includes(value) ? prev[key].filter((entry) => entry !== value) : [...prev[key], value],
    }));
  };

  const openCreate = () => {
    setEditingTeacher(null);
    setForm(emptyForm);
    setShowForm(true);
    setError(null);
  };

  const openEdit = (teacher: Teacher) => {
    setEditingTeacher(teacher);
    setForm({
      name: teacher.name,
      email: teacher.email,
      phone: teacher.phone ?? '',
      salaryType: teacher.salaryType ?? 'fixed',
      hourlyRate: String(teacher.hourlyRate ?? teacher.salary ?? 0),
      fixedSalary: String(teacher.fixedSalary ?? teacher.salary ?? 0),
      subjects: teacher.subjects ?? [],
      batches: teacher.batches ?? [],
    });
    setShowForm(true);
    setError(null);
  };

  const closeForm = () => {
    setShowForm(false);
    setEditingTeacher(null);
    setForm(emptyForm);
    setError(null);
  };

  const saveTeacher = async () => {
    if (!currentClass?.id || !firebaseUser) return;
    if (!form.name.trim() || !form.email.trim()) {
      setError('Teacher name and email are required.');
      return;
    }
    if (form.subjects.length === 0 || form.batches.length === 0) {
      setError('Select at least one subject and one batch.');
      return;
    }

    const salaryType = form.salaryType;
    const hourlyRate = Number(form.hourlyRate) || 0;
    const fixedSalary = Number(form.fixedSalary) || 0;
    const salary = salaryType === 'hourly' ? hourlyRate : fixedSalary;
    const selectedBatchIds = batches.filter((batch) => form.batches.includes(batch.name)).map((batch) => batch.id);

    try {
      if (editingTeacher) {
        await teachflowData.updateTeacher(currentClass.id, editingTeacher.id, {
          name: form.name.trim(),
          email: form.email.trim(),
          phone: form.phone.trim() || undefined,
          subjects: form.subjects,
          batches: form.batches,
          batchIds: selectedBatchIds,
          salary,
          salaryType,
          hourlyRate,
          fixedSalary,
        });
      } else {
        await teachflowData.addTeacher(currentClass.id, {
          name: form.name.trim(),
          email: form.email.trim(),
          phone: form.phone.trim() || undefined,
          subjects: form.subjects,
          batches: form.batches,
          batchIds: selectedBatchIds,
          salary,
          salaryType,
          hourlyRate,
          fixedSalary,
        });
        await teachflowData.createInvite({
          email: form.email.trim(),
          role: 'teacher',
          classId: currentClass.id,
          invitedBy: firebaseUser.uid,
        });
      }
      closeForm();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Failed to save teacher.');
    }
  };

  const deleteTeacher = (teacher: Teacher) => {
    if (!currentClass?.id) return;
    Alert.alert('Delete teacher', `Remove ${teacher.name} from this class?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => void teachflowData.deleteTeacher(currentClass.id, teacher.id) },
    ]);
  };

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.headerRow}>
          <View style={styles.headerText}>
            <Text style={styles.title}>Teachers</Text>
            <Text style={styles.subtitle}>List, add, edit, assign subjects, batches, and salary model.</Text>
          </View>
          <Pressable onPress={openCreate} style={({ pressed }) => [styles.primaryButton, pressed ? styles.pressed : null]}>
            <Text style={styles.primaryButtonText}>Add Teacher</Text>
          </Pressable>
        </View>

        <TextInput placeholder="Search teachers" value={search} onChangeText={setSearch} style={styles.input} />
        {error ? <Text style={styles.error}>{error}</Text> : null}

        {filteredTeachers.map((teacher) => (
          <View key={teacher.id} style={styles.card}>
            <View style={styles.cardHeader}>
              <View>
                <Text style={styles.cardTitle}>{teacher.name}</Text>
                <Text style={styles.cardSubtitle}>{teacher.email}</Text>
              </View>
              <Text style={styles.badge}>{teacher.salaryType ?? 'fixed'}</Text>
            </View>
            <Text style={styles.smallText}>Subjects: {(teacher.subjects ?? []).join(', ') || 'None'}</Text>
            <Text style={styles.smallText}>Batches: {(teacher.batches ?? []).join(', ') || 'None'}</Text>
            <Text style={styles.smallText}>Salary: Rs. {teacher.salary ?? 0}</Text>
            <View style={styles.actionRow}>
              <Pressable onPress={() => openEdit(teacher)} style={styles.inlineButton}>
                <Text style={styles.inlineButtonText}>Edit</Text>
              </Pressable>
              <Pressable onPress={() => deleteTeacher(teacher)} style={styles.inlineButtonDanger}>
                <Text style={styles.inlineButtonDangerText}>Delete</Text>
              </Pressable>
            </View>
          </View>
        ))}
      </ScrollView>

      <Modal transparent visible={showForm} animationType="slide" onRequestClose={closeForm}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <ScrollView contentContainerStyle={styles.modalContent}>
              <Text style={styles.sectionTitle}>{editingTeacher ? 'Edit Teacher' : 'Add Teacher'}</Text>
              <TextInput placeholder="Name" value={form.name} onChangeText={(value) => setForm((prev) => ({ ...prev, name: value }))} style={styles.input} />
              <TextInput placeholder="Email" value={form.email} onChangeText={(value) => setForm((prev) => ({ ...prev, email: value }))} style={styles.input} autoCapitalize="none" />
              <TextInput placeholder="Phone" value={form.phone} onChangeText={(value) => setForm((prev) => ({ ...prev, phone: value }))} style={styles.input} />

              <View style={styles.toggleRow}>
                <Pressable onPress={() => setForm((prev) => ({ ...prev, salaryType: 'fixed' }))} style={[styles.toggleChip, form.salaryType === 'fixed' ? styles.toggleChipActive : null]}>
                  <Text style={form.salaryType === 'fixed' ? styles.toggleTextActive : styles.toggleText}>Fixed</Text>
                </Pressable>
                <Pressable onPress={() => setForm((prev) => ({ ...prev, salaryType: 'hourly' }))} style={[styles.toggleChip, form.salaryType === 'hourly' ? styles.toggleChipActive : null]}>
                  <Text style={form.salaryType === 'hourly' ? styles.toggleTextActive : styles.toggleText}>Hourly</Text>
                </Pressable>
              </View>

              {form.salaryType === 'hourly' ? (
                <TextInput placeholder="Hourly Rate" value={form.hourlyRate} onChangeText={(value) => setForm((prev) => ({ ...prev, hourlyRate: value }))} style={styles.input} keyboardType="numeric" />
              ) : (
                <TextInput placeholder="Fixed Salary" value={form.fixedSalary} onChangeText={(value) => setForm((prev) => ({ ...prev, fixedSalary: value }))} style={styles.input} keyboardType="numeric" />
              )}

              <Text style={styles.label}>Subjects</Text>
              <View style={styles.wrapRow}>
                {subjectOptions.map((subject) => (
                  <Pressable key={subject} onPress={() => toggleSelection('subjects', subject)} style={[styles.selectChip, form.subjects.includes(subject) ? styles.selectChipActive : null]}>
                    <Text style={form.subjects.includes(subject) ? styles.selectTextActive : styles.selectText}>{subject}</Text>
                  </Pressable>
                ))}
              </View>

              <Text style={styles.label}>Batches</Text>
              <View style={styles.wrapRow}>
                {batchOptions.map((batchName) => (
                  <Pressable key={batchName} onPress={() => toggleSelection('batches', batchName)} style={[styles.selectChip, form.batches.includes(batchName) ? styles.selectChipActive : null]}>
                    <Text style={form.batches.includes(batchName) ? styles.selectTextActive : styles.selectText}>{batchName}</Text>
                  </Pressable>
                ))}
              </View>

              {error ? <Text style={styles.error}>{error}</Text> : null}
              <View style={styles.actionRow}>
                <Pressable onPress={closeForm} style={styles.inlineButton}>
                  <Text style={styles.inlineButtonText}>Cancel</Text>
                </Pressable>
                <Pressable onPress={() => void saveTeacher()} style={styles.primaryButton}>
                  <Text style={styles.primaryButtonText}>{editingTeacher ? 'Update' : 'Create'}</Text>
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
  badge: { alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, backgroundColor: '#ede9fe', color: '#6d28d9', fontWeight: '600', overflow: 'hidden' },
  smallText: { fontSize: 13, color: '#4b5563' },
  actionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  inlineButton: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, backgroundColor: '#e5e7eb' },
  inlineButtonText: { fontWeight: '600', color: '#111827' },
  inlineButtonDanger: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, backgroundColor: '#fee2e2' },
  inlineButtonDangerText: { color: '#b91c1c', fontWeight: '600' },
  primaryButton: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10, backgroundColor: '#2563eb' },
  primaryButtonText: { color: '#ffffff', fontWeight: '600' },
  pressed: { opacity: 0.9 },
  error: { color: '#dc2626', fontSize: 14 },
  modalBackdrop: { flex: 1, justifyContent: 'center', backgroundColor: 'rgba(17, 24, 39, 0.45)', padding: 16 },
  modalCard: { maxHeight: '90%', borderRadius: 16, backgroundColor: '#f9fafb', overflow: 'hidden' },
  modalContent: { padding: 16, gap: 12 },
  sectionTitle: { fontSize: 18, fontWeight: '700', color: '#111827' },
  label: { fontSize: 14, fontWeight: '600', color: '#111827' },
  wrapRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  selectChip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, backgroundColor: '#e5e7eb' },
  selectChipActive: { backgroundColor: '#dbeafe' },
  selectText: { color: '#374151' },
  selectTextActive: { color: '#1d4ed8', fontWeight: '600' },
  toggleRow: { flexDirection: 'row', gap: 8 },
  toggleChip: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 10, backgroundColor: '#e5e7eb' },
  toggleChipActive: { backgroundColor: '#dbeafe' },
  toggleText: { color: '#374151', fontWeight: '600' },
  toggleTextActive: { color: '#1d4ed8', fontWeight: '700' },
});
