import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Screen } from '../components/Screen';
import { teachflowData } from '../services/teachflowData';
import type { AppStackParamList } from '../navigation/AppStack';
import { AttendanceRecord, Batch, Lecture, MarksRecord, Student, Teacher } from '../types/Models';
import { useAuth } from '../store/AuthStore';
import { buildBatchCode, buildLectureCode } from '../utils/teaching';

type Props = NativeStackScreenProps<AppStackParamList, 'LecturesScreen'>;
type TeachingTab = 'lectures' | 'attendance' | 'marks';

const emptyLectureForm = {
  title: '',
  subject: '',
  teacherId: '',
  batchId: '',
  grade: '10',
  board: 'CB',
  roomNumber: '',
  lecMode: 'OFFLINE' as 'ONLINE' | 'OFFLINE',
  date: '',
  time: '',
  duration: '60',
  description: '',
};

const emptyMarksForm = {
  studentId: '',
  subject: '',
  examType: 'Exam',
  examName: '',
  totalMarks: '100',
  obtainedMarks: '0',
  date: '',
};

const toStamp = (lecture: Pick<Lecture, 'date' | 'time'>) => new Date(`${lecture.date}T${lecture.time}`).getTime();
const formatSchedule = (lecture: Pick<Lecture, 'date' | 'time'>) => {
  const stamp = new Date(`${lecture.date}T${lecture.time}`);
  return Number.isNaN(stamp.getTime())
    ? `${lecture.date} ${lecture.time}`
    : `${stamp.toLocaleDateString()} | ${stamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
};
const findTeacher = (teachers: Teacher[], email: string | null) => teachers.find((item) => item.email.toLowerCase() === (email ?? '').toLowerCase()) ?? null;
const findStudent = (students: Student[], email: string | null) => students.find((item) => item.email.toLowerCase() === (email ?? '').toLowerCase()) ?? null;
const attendanceSummary = (items: AttendanceRecord[]) => {
  const total = items.length;
  const present = items.filter((item) => item.status === 'present').length;
  return { total, present, absent: total - present, percentage: total ? Math.round((present / total) * 100) : 0 };
};
const marksSummary = (items: MarksRecord[]) => {
  const total = items.reduce((sum, item) => sum + item.totalMarks, 0);
  const obtained = items.reduce((sum, item) => sum + item.obtainedMarks, 0);
  return {
    entries: items.length,
    average: total ? Math.round((obtained / total) * 100) : 0,
    best: items.reduce((best, item) => Math.max(best, item.totalMarks ? Math.round((item.obtainedMarks / item.totalMarks) * 100) : 0), 0),
  };
};

export const LecturesScreen = ({ navigation, route }: Props) => {
  const { currentClass, firebaseUser, userProfile } = useAuth();
  const [activeTab, setActiveTab] = useState<TeachingTab>(route.params?.initialTab ?? 'lectures');
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [lectures, setLectures] = useState<Lecture[]>([]);
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [marks, setMarks] = useState<MarksRecord[]>([]);
  const [search, setSearch] = useState('');
  const [batchFilter, setBatchFilter] = useState('all');
  const [teacherFilter, setTeacherFilter] = useState('all');
  const [selectedLectureId, setSelectedLectureId] = useState('');
  const [lectureForm, setLectureForm] = useState(emptyLectureForm);
  const [marksForm, setMarksForm] = useState(emptyMarksForm);
  const [attendanceDraft, setAttendanceDraft] = useState<Record<string, 'present' | 'absent'>>({});
  const [editingLecture, setEditingLecture] = useState<Lecture | null>(null);
  const [editingMark, setEditingMark] = useState<MarksRecord | null>(null);
  const [showLectureModal, setShowLectureModal] = useState(false);
  const [showMarksModal, setShowMarksModal] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => setActiveTab(route.params?.initialTab ?? 'lectures'), [route.params?.initialTab]);

  useEffect(() => {
    if (!currentClass?.id) {
      setTeachers([]);
      setStudents([]);
      setBatches([]);
      setLectures([]);
      setAttendance([]);
      setMarks([]);
      return;
    }
    const unsubs = [
      teachflowData.subscribeToTeachers(currentClass.id, setTeachers),
      teachflowData.subscribeToStudents(currentClass.id, setStudents),
      teachflowData.subscribeToBatches(currentClass.id, setBatches),
      teachflowData.subscribeToLectures(currentClass.id, setLectures),
      teachflowData.subscribeToAttendance(currentClass.id, setAttendance),
      teachflowData.subscribeToMarks(currentClass.id, setMarks),
    ];
    return () => unsubs.forEach((unsub) => unsub());
  }, [currentClass?.id]);

  const matchedTeacher = useMemo(() => findTeacher(teachers, firebaseUser?.email ?? null), [firebaseUser?.email, teachers]);
  const matchedStudent = useMemo(() => findStudent(students, firebaseUser?.email ?? null), [firebaseUser?.email, students]);
  const linkedStudentIds = useMemo(() => {
    const ids = userProfile?.linkedStudentIds ?? [];
    return userProfile?.linkedStudentId ? Array.from(new Set([...ids, userProfile.linkedStudentId])) : ids;
  }, [userProfile?.linkedStudentId, userProfile?.linkedStudentIds]);
  const selectedLecture = useMemo(() => lectures.find((item) => item.id === selectedLectureId) ?? null, [lectures, selectedLectureId]);
  const canEdit = userProfile?.role === 'admin' || userProfile?.role === 'teacher';

  useEffect(() => {
    if (!selectedLectureId && lectures[0]) {
      setSelectedLectureId(lectures[0].id);
    }
  }, [lectures, selectedLectureId]);

  useEffect(() => {
    if (!selectedLecture) {
      setAttendanceDraft({});
      return;
    }
    const lectureStudents = students.filter((student) => selectedLecture.batchId ? student.batchId === selectedLecture.batchId : student.batch === selectedLecture.batch);
    const next = Object.fromEntries(
      lectureStudents.map((student) => {
        const existing = attendance.find((record) => record.lectureId === selectedLecture.id && record.studentId === student.id);
        return [student.id, existing?.status ?? 'present'];
      })
    ) as Record<string, 'present' | 'absent'>;
    setAttendanceDraft(next);
  }, [attendance, selectedLecture, students]);

  const visibleLectures = useMemo(() => {
    let list = lectures;
    if (userProfile?.role === 'teacher' && matchedTeacher) {
      list = list.filter((item) => item.teacherId === matchedTeacher.id || item.teacherName === matchedTeacher.name);
    } else if (userProfile?.role === 'student' && matchedStudent) {
      list = list.filter((item) => matchedStudent.batchId ? item.batchId === matchedStudent.batchId : item.batch === matchedStudent.batch);
    }
    return list
      .filter((item) => {
        const matchesSearch = [item.subject, item.teacherName, item.batch, item.branchName ?? '', item.title].join(' ').toLowerCase().includes(search.toLowerCase());
        const matchesBatch = batchFilter === 'all' || item.batchId === batchFilter || item.batch === batchFilter;
        const matchesTeacher = teacherFilter === 'all' || item.teacherId === teacherFilter;
        return matchesSearch && matchesBatch && matchesTeacher;
      })
      .sort((left, right) => toStamp(left) - toStamp(right));
  }, [batchFilter, lectures, matchedStudent, matchedTeacher, search, teacherFilter, userProfile?.role]);

  const lectureStudents = useMemo(() => {
    if (!selectedLecture) return [];
    return students.filter((student) => selectedLecture.batchId ? student.batchId === selectedLecture.batchId : student.batch === selectedLecture.batch);
  }, [selectedLecture, students]);

  const mergedAttendance = useMemo(() => {
    if (!selectedLecture || !currentClass?.id || !firebaseUser?.uid) return [];
    return lectureStudents.map((student) => ({
      id: `${selectedLecture.id}-${student.id}`,
      lectureId: selectedLecture.id,
      studentId: student.id,
      studentName: student.name,
      lectureTitle: selectedLecture.title,
      batch: selectedLecture.batch,
      date: selectedLecture.date,
      status: attendanceDraft[student.id] ?? 'present',
      markedAt: new Date().toISOString(),
      markedBy: firebaseUser.uid,
      classId: currentClass.id,
    } satisfies AttendanceRecord));
  }, [attendanceDraft, currentClass?.id, firebaseUser?.uid, lectureStudents, selectedLecture]);

  const visibleAttendance = useMemo(() => {
    if (userProfile?.role === 'student' && matchedStudent) return attendance.filter((item) => item.studentId === matchedStudent.id);
    if (userProfile?.role === 'parent') return attendance.filter((item) => linkedStudentIds.includes(item.studentId));
    if (userProfile?.role === 'teacher' && matchedTeacher) {
      const myLectureIds = lectures.filter((item) => item.teacherId === matchedTeacher.id || item.teacherName === matchedTeacher.name).map((item) => item.id);
      return attendance.filter((item) => myLectureIds.includes(item.lectureId));
    }
    return attendance;
  }, [attendance, lectures, linkedStudentIds, matchedStudent, matchedTeacher, userProfile?.role]);

  const visibleMarks = useMemo(() => {
    if (userProfile?.role === 'student' && matchedStudent) return marks.filter((item) => item.studentId === matchedStudent.id);
    if (userProfile?.role === 'parent') return marks.filter((item) => linkedStudentIds.includes(item.studentId));
    if (userProfile?.role === 'teacher' && matchedTeacher) return marks.filter((item) => item.teacherId === matchedTeacher.id);
    return marks;
  }, [linkedStudentIds, marks, matchedStudent, matchedTeacher, userProfile?.role]);

  const canMarkAttendance = selectedLecture ? userProfile?.role === 'admin' || (() => {
    const start = new Date(`${selectedLecture.date}T${selectedLecture.time}`);
    const end = new Date(start.getTime() + selectedLecture.duration * 60 * 1000);
    const now = new Date();
    return !Number.isNaN(start.getTime()) && now >= start && now <= end;
  })() : false;

  const openLectureModal = (lecture?: Lecture) => {
    setEditingLecture(lecture ?? null);
    setLectureForm(lecture ? {
      title: lecture.title,
      subject: lecture.subject,
      teacherId: lecture.teacherId,
      batchId: lecture.batchId ?? batches.find((item) => item.name === lecture.batch)?.id ?? '',
      grade: lecture.grade ?? '10',
      board: lecture.board ?? 'CB',
      roomNumber: lecture.roomNumber ?? '',
      lecMode: lecture.lecMode ?? 'OFFLINE',
      date: lecture.date,
      time: lecture.time,
      duration: String(lecture.duration),
      description: lecture.description ?? '',
    } : {
      ...emptyLectureForm,
      teacherId: teachers[0]?.id ?? '',
      batchId: batches[0]?.id ?? '',
      date: new Date().toISOString().slice(0, 10),
      time: '10:00',
    });
    setError(null);
    setShowLectureModal(true);
  };

  const openMarksModal = (mark?: MarksRecord) => {
    setEditingMark(mark ?? null);
    setMarksForm(mark ? {
      studentId: mark.studentId,
      subject: mark.subject,
      examType: mark.examType,
      examName: mark.examName,
      totalMarks: String(mark.totalMarks),
      obtainedMarks: String(mark.obtainedMarks),
      date: mark.date,
    } : {
      ...emptyMarksForm,
      studentId: lectureStudents[0]?.id ?? students[0]?.id ?? '',
      subject: selectedLecture?.subject ?? '',
      date: selectedLecture?.date ?? new Date().toISOString().slice(0, 10),
    });
    setError(null);
    setShowMarksModal(true);
  };

  const saveLecture = async () => {
    if (!currentClass?.id) return;
    const teacher = teachers.find((item) => item.id === lectureForm.teacherId);
    const batch = batches.find((item) => item.id === lectureForm.batchId);
    if (!lectureForm.subject.trim() || !teacher || !batch || !lectureForm.date || !lectureForm.time) {
      setError('Subject, teacher, batch, date, and time are required.');
      return;
    }

    setSaving(true);
    setError(null);
    const duration = Math.max(Number(lectureForm.duration) || 60, 15);
    const payload: Omit<Lecture, 'id' | 'classId'> = {
      title: lectureForm.title.trim() || `${lectureForm.subject.trim()} Lecture`,
      subject: lectureForm.subject.trim(),
      teacherId: teacher.id,
      teacherName: teacher.name,
      batch: batch.name,
      batchName: batch.name,
      batchId: batch.id,
      grade: lectureForm.grade.trim() || undefined,
      board: lectureForm.board.trim() || undefined,
      branchId: currentClass.id,
      branchName: currentClass.name,
      roomNumber: lectureForm.roomNumber.trim() || undefined,
      lecMode: lectureForm.lecMode,
      date: lectureForm.date,
      time: lectureForm.time,
      duration,
      durationHours: duration / 60,
      lectureCode: buildLectureCode({ grade: lectureForm.grade, board: lectureForm.board, subject: lectureForm.subject }),
      batchCode: buildBatchCode({ date: lectureForm.date, lecMode: lectureForm.lecMode, branchName: currentClass.name, grade: lectureForm.grade, board: lectureForm.board, batchName: batch.name }),
      status: editingLecture?.status ?? 'scheduled',
      description: lectureForm.description.trim() || undefined,
    };

    try {
      if (editingLecture) await teachflowData.updateLecture(currentClass.id, editingLecture.id, payload);
      else {
        const created = await teachflowData.addLecture(currentClass.id, payload);
        setSelectedLectureId(created.id);
      }
      setShowLectureModal(false);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Failed to save lecture.');
    } finally {
      setSaving(false);
    }
  };

  const saveAttendance = async () => {
    if (!currentClass?.id || !selectedLecture || !canMarkAttendance) {
      setError('Attendance can only be marked during the lecture time window unless you are an admin.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await teachflowData.saveAttendanceBatch(currentClass.id, mergedAttendance);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Failed to save attendance.');
    } finally {
      setSaving(false);
    }
  };

  const saveMarks = async () => {
    if (!currentClass?.id) return;
    const student = students.find((item) => item.id === marksForm.studentId);
    const teacher = matchedTeacher ?? teachers.find((item) => item.id === selectedLecture?.teacherId) ?? teachers[0];
    const totalMarks = Number(marksForm.totalMarks) || 0;
    const obtainedMarks = Number(marksForm.obtainedMarks) || 0;
    if (!student || !teacher || !marksForm.subject.trim() || !marksForm.examName.trim() || !marksForm.date) {
      setError('Student, subject, exam name, teacher, and date are required.');
      return;
    }
    if (totalMarks <= 0 || obtainedMarks < 0 || obtainedMarks > totalMarks) {
      setError('Marks obtained must be between 0 and total marks.');
      return;
    }

    setSaving(true);
    setError(null);
    const payload: Omit<MarksRecord, 'id' | 'classId'> = {
      studentId: student.id,
      studentName: student.name,
      subject: marksForm.subject.trim(),
      examType: marksForm.examType.trim() || 'Exam',
      examName: marksForm.examName.trim(),
      totalMarks,
      obtainedMarks,
      date: marksForm.date,
      teacherId: teacher.id,
      batch: student.batch,
    };

    try {
      if (editingMark) await teachflowData.updateMarks(currentClass.id, editingMark.id, payload);
      else await teachflowData.addMarks(currentClass.id, payload);
      setShowMarksModal(false);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Failed to save marks.');
    } finally {
      setSaving(false);
    }
  };

  const deleteLecture = (lecture: Lecture) => {
    if (!currentClass?.id) return;
    Alert.alert('Delete lecture', `Delete ${lecture.title}?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => void teachflowData.deleteLecture(currentClass.id, lecture.id) },
    ]);
  };

  const deleteMark = (mark: MarksRecord) => {
    if (!currentClass?.id) return;
    Alert.alert('Delete marks', `Delete ${mark.examName} for ${mark.studentName}?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => void teachflowData.deleteMarks(currentClass.id, mark.id) },
    ]);
  };

  const tabs: TeachingTab[] = ['lectures', 'attendance', 'marks'];
  const batchChips = [{ value: 'all', label: 'All' }, ...batches.map((item) => ({ value: item.id, label: item.name }))];
  const teacherChips = [{ value: 'all', label: 'All' }, ...teachers.map((item) => ({ value: item.id, label: item.name }))];
  const lectureStats = attendanceSummary(mergedAttendance);
  const markStats = marksSummary(visibleMarks);
  const lectureCode = buildLectureCode({ grade: lectureForm.grade || 'NA', board: lectureForm.board || 'NA', subject: lectureForm.subject || 'Subject' });
  const batchCode = buildBatchCode({ date: lectureForm.date || new Date().toISOString(), lecMode: lectureForm.lecMode, branchName: currentClass?.name || 'BR', grade: lectureForm.grade || 'NA', board: lectureForm.board || 'NA', batchName: batches.find((item) => item.id === lectureForm.batchId)?.name || 'BATCH' });

  const renderChips = (items: Array<{ value: string; label: string }>, selected: string, onSelect: (value: string) => void) => (
    <View style={styles.wrapRow}>
      {items.map((item) => (
        <Pressable key={item.value} onPress={() => onSelect(item.value)} style={[styles.chip, selected === item.value ? styles.chipActive : null]}>
          <Text style={selected === item.value ? styles.chipTextActive : styles.chipText}>{item.label}</Text>
        </Pressable>
      ))}
    </View>
  );

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.headerRow}>
          <View style={styles.headerText}>
            <Text style={styles.title}>Lectures</Text>
            <Text style={styles.subtitle}>Schedule lectures, mark attendance, and manage marks with web-parity collections.</Text>
          </View>
          {canEdit ? (
            <Pressable onPress={() => (activeTab === 'marks' ? openMarksModal() : openLectureModal())} style={styles.primaryButton}>
              <Text style={styles.primaryButtonText}>{activeTab === 'marks' ? 'Add Marks' : 'Create Lecture'}</Text>
            </Pressable>
          ) : null}
        </View>

        <View style={styles.tabRow}>
          {tabs.map((tab) => (
            <Pressable key={tab} onPress={() => { setActiveTab(tab); navigation.setParams({ initialTab: tab }); }} style={[styles.tab, activeTab === tab ? styles.tabActive : null]}>
              <Text style={activeTab === tab ? styles.tabTextActive : styles.tabText}>{tab === 'lectures' ? 'Lectures' : tab === 'attendance' ? 'Attendance' : 'Marks'}</Text>
            </Pressable>
          ))}
        </View>
        {error ? <Text style={styles.error}>{error}</Text> : null}

        {activeTab === 'lectures' ? (
          <>
            <TextInput placeholder="Search lectures" value={search} onChangeText={setSearch} style={styles.input} />
            <Text style={styles.label}>Batch</Text>
            {renderChips(batchChips, batchFilter, setBatchFilter)}
            <Text style={styles.label}>Teacher</Text>
            {renderChips(teacherChips, teacherFilter, setTeacherFilter)}
            {visibleLectures.length === 0 ? <View style={styles.emptyCard}><Text style={styles.emptyText}>No lectures found.</Text></View> : null}
            {visibleLectures.map((lecture) => (
              <View key={lecture.id} style={styles.card}>
                <View style={styles.cardHeader}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.cardTitle}>{lecture.subject}</Text>
                    <Text style={styles.cardSubtitle}>{formatSchedule(lecture)}</Text>
                  </View>
                  <Text style={styles.badge}>{lecture.batchName ?? lecture.batch}</Text>
                </View>
                <Text style={styles.smallText}>Branch: {lecture.branchName ?? currentClass?.name ?? '-'}</Text>
                <Text style={styles.smallText}>Teacher: {lecture.teacherName}</Text>
                <Text style={styles.smallText}>Lecture Code: {lecture.lectureCode}</Text>
                <Text style={styles.smallText}>Batch Code: {lecture.batchCode}</Text>
                <View style={styles.actionRow}>
                  <Pressable onPress={() => { setSelectedLectureId(lecture.id); setActiveTab('attendance'); }} style={styles.inlineButton}><Text style={styles.inlineText}>Attendance</Text></Pressable>
                  <Pressable onPress={() => { setSelectedLectureId(lecture.id); setActiveTab('marks'); }} style={styles.inlineButton}><Text style={styles.inlineText}>Marks</Text></Pressable>
                  {canEdit ? <Pressable onPress={() => openLectureModal(lecture)} style={styles.inlineButton}><Text style={styles.inlineText}>Edit</Text></Pressable> : null}
                  {canEdit ? <Pressable onPress={() => deleteLecture(lecture)} style={styles.inlineDanger}><Text style={styles.inlineDangerText}>Delete</Text></Pressable> : null}
                </View>
              </View>
            ))}
          </>
        ) : null}

        {activeTab === 'attendance' ? (
          <>
            <Text style={styles.sectionTitle}>Select Lecture</Text>
            {visibleLectures.map((lecture) => (
              <Pressable key={lecture.id} onPress={() => setSelectedLectureId(lecture.id)} style={[styles.card, selectedLectureId === lecture.id ? styles.cardSelected : null]}>
                <Text style={styles.cardTitle}>{lecture.subject}</Text>
                <Text style={styles.cardSubtitle}>{formatSchedule(lecture)}</Text>
                <Text style={styles.smallText}>{lecture.batchName ?? lecture.batch} | {lecture.teacherName}</Text>
              </Pressable>
            ))}
            {selectedLecture ? (
              <>
                <View style={styles.summaryGrid}>
                  <View style={styles.summaryCard}><Text style={styles.summaryValue}>{lectureStats.total}</Text><Text style={styles.summaryLabel}>Students</Text></View>
                  <View style={styles.summaryCard}><Text style={styles.summaryValue}>{lectureStats.present}</Text><Text style={styles.summaryLabel}>Present</Text></View>
                  <View style={styles.summaryCard}><Text style={styles.summaryValue}>{lectureStats.absent}</Text><Text style={styles.summaryLabel}>Absent</Text></View>
                  <View style={styles.summaryCard}><Text style={styles.summaryValue}>{lectureStats.percentage}%</Text><Text style={styles.summaryLabel}>Attendance</Text></View>
                </View>
                {!canMarkAttendance && canEdit ? <Text style={styles.warning}>Attendance can only be marked during the lecture time window unless you are an admin.</Text> : null}
                {(canEdit ? lectureStudents : visibleAttendance.filter((item) => item.lectureId === selectedLecture.id)).map((item) => {
                  const student = 'name' in item ? item : students.find((entry) => entry.id === item.studentId);
                  const studentId = 'name' in item ? item.id : item.studentId;
                  const studentName = 'name' in item ? item.name : item.studentName;
                  const rollNumber = 'name' in item ? item.rollNumber : '';
                  const status = 'name' in item ? attendanceDraft[item.id] ?? 'present' : item.status;
                  return (
                    <View key={studentId} style={styles.card}>
                      <View style={styles.cardHeader}>
                        <View>
                          <Text style={styles.cardTitle}>{studentName}</Text>
                          <Text style={styles.cardSubtitle}>{rollNumber ? `Roll: ${rollNumber}` : status}</Text>
                        </View>
                        <Text style={styles.badge}>{status}</Text>
                      </View>
                      {'name' in item ? (
                        <View style={styles.actionRow}>
                          <Pressable onPress={() => setAttendanceDraft((prev) => ({ ...prev, [item.id]: 'present' }))} style={styles.inlineButton}><Text style={styles.inlineText}>Present</Text></Pressable>
                          <Pressable onPress={() => setAttendanceDraft((prev) => ({ ...prev, [item.id]: 'absent' }))} style={styles.inlineDanger}><Text style={styles.inlineDangerText}>Absent</Text></Pressable>
                        </View>
                      ) : null}
                      {'name' in item && !student ? null : null}
                    </View>
                  );
                })}
                {canEdit ? <Pressable onPress={() => void saveAttendance()} style={[styles.primaryButton, saving ? styles.disabled : null]}><Text style={styles.primaryButtonText}>{saving ? 'Saving...' : 'Save Attendance'}</Text></Pressable> : null}
              </>
            ) : null}
          </>
        ) : null}

        {activeTab === 'marks' ? (
          <>
            <View style={styles.summaryGrid}>
              <View style={styles.summaryCard}><Text style={styles.summaryValue}>{markStats.entries}</Text><Text style={styles.summaryLabel}>Entries</Text></View>
              <View style={styles.summaryCard}><Text style={styles.summaryValue}>{markStats.average}%</Text><Text style={styles.summaryLabel}>Average</Text></View>
              <View style={styles.summaryCard}><Text style={styles.summaryValue}>{markStats.best}%</Text><Text style={styles.summaryLabel}>Best</Text></View>
            </View>
            {visibleMarks.length === 0 ? <View style={styles.emptyCard}><Text style={styles.emptyText}>No marks records yet.</Text></View> : null}
            {visibleMarks.map((mark) => {
              const percentage = mark.totalMarks ? Math.round((mark.obtainedMarks / mark.totalMarks) * 100) : 0;
              return (
                <View key={mark.id} style={styles.card}>
                  <View style={styles.cardHeader}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.cardTitle}>{mark.studentName}</Text>
                      <Text style={styles.cardSubtitle}>{mark.examName} | {mark.subject}</Text>
                    </View>
                    <Text style={styles.badge}>{percentage}%</Text>
                  </View>
                  <Text style={styles.smallText}>Score: {mark.obtainedMarks}/{mark.totalMarks}</Text>
                  <Text style={styles.smallText}>Exam Type: {mark.examType}</Text>
                  <View style={styles.actionRow}>
                    {canEdit ? <Pressable onPress={() => openMarksModal(mark)} style={styles.inlineButton}><Text style={styles.inlineText}>Edit</Text></Pressable> : null}
                    {canEdit ? <Pressable onPress={() => deleteMark(mark)} style={styles.inlineDanger}><Text style={styles.inlineDangerText}>Delete</Text></Pressable> : null}
                  </View>
                </View>
              );
            })}
          </>
        ) : null}
      </ScrollView>

      <Modal transparent visible={showLectureModal} animationType="slide" onRequestClose={() => setShowLectureModal(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <ScrollView contentContainerStyle={styles.modalContent}>
              <Text style={styles.sectionTitle}>{editingLecture ? 'Edit Lecture' : 'Create Lecture'}</Text>
              <TextInput placeholder="Title (optional)" value={lectureForm.title} onChangeText={(value) => setLectureForm((prev) => ({ ...prev, title: value }))} style={styles.input} />
              <TextInput placeholder="Subject" value={lectureForm.subject} onChangeText={(value) => setLectureForm((prev) => ({ ...prev, subject: value }))} style={styles.input} />
              <Text style={styles.label}>Teacher</Text>
              {renderChips(teachers.map((item) => ({ value: item.id, label: item.name })), lectureForm.teacherId, (value) => setLectureForm((prev) => ({ ...prev, teacherId: value })))}
              <Text style={styles.label}>Batch</Text>
              {renderChips(batches.map((item) => ({ value: item.id, label: item.name })), lectureForm.batchId, (value) => setLectureForm((prev) => ({ ...prev, batchId: value })))}
              <View style={styles.doubleRow}>
                <TextInput placeholder="Grade" value={lectureForm.grade} onChangeText={(value) => setLectureForm((prev) => ({ ...prev, grade: value }))} style={[styles.input, styles.half]} />
                <TextInput placeholder="Board" value={lectureForm.board} onChangeText={(value) => setLectureForm((prev) => ({ ...prev, board: value }))} style={[styles.input, styles.half]} />
              </View>
              <View style={styles.doubleRow}>
                <TextInput placeholder="Room Number" value={lectureForm.roomNumber} onChangeText={(value) => setLectureForm((prev) => ({ ...prev, roomNumber: value }))} style={[styles.input, styles.half]} />
                <TextInput placeholder="Duration" value={lectureForm.duration} onChangeText={(value) => setLectureForm((prev) => ({ ...prev, duration: value }))} style={[styles.input, styles.half]} keyboardType="numeric" />
              </View>
              {renderChips([{ value: 'OFFLINE', label: 'Offline' }, { value: 'ONLINE', label: 'Online' }], lectureForm.lecMode, (value) => setLectureForm((prev) => ({ ...prev, lecMode: value as 'ONLINE' | 'OFFLINE' })))}
              <View style={styles.doubleRow}>
                <TextInput placeholder="Date" value={lectureForm.date} onChangeText={(value) => setLectureForm((prev) => ({ ...prev, date: value }))} style={[styles.input, styles.half]} />
                <TextInput placeholder="Time" value={lectureForm.time} onChangeText={(value) => setLectureForm((prev) => ({ ...prev, time: value }))} style={[styles.input, styles.half]} />
              </View>
              <TextInput placeholder="Description" value={lectureForm.description} onChangeText={(value) => setLectureForm((prev) => ({ ...prev, description: value }))} style={[styles.input, styles.textArea]} multiline />
              <View style={styles.infoCard}>
                <Text style={styles.smallText}>Lecture: {lectureCode}</Text>
                <Text style={styles.smallText}>Batch: {batchCode}</Text>
                <Text style={styles.smallText}>Branch ID: {currentClass?.id ?? '-'}</Text>
              </View>
              <View style={styles.actionRow}>
                <Pressable onPress={() => setShowLectureModal(false)} style={styles.inlineButton}><Text style={styles.inlineText}>Cancel</Text></Pressable>
                <Pressable onPress={() => void saveLecture()} style={styles.primaryButton}><Text style={styles.primaryButtonText}>{saving ? 'Saving...' : editingLecture ? 'Update Lecture' : 'Create Lecture'}</Text></Pressable>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal transparent visible={showMarksModal} animationType="slide" onRequestClose={() => setShowMarksModal(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <ScrollView contentContainerStyle={styles.modalContent}>
              <Text style={styles.sectionTitle}>{editingMark ? 'Edit Marks' : 'Add Marks'}</Text>
              <Text style={styles.label}>Student</Text>
              {renderChips((selectedLecture ? lectureStudents : students).map((item) => ({ value: item.id, label: item.name })), marksForm.studentId, (value) => setMarksForm((prev) => ({ ...prev, studentId: value })))}
              <TextInput placeholder="Subject" value={marksForm.subject} onChangeText={(value) => setMarksForm((prev) => ({ ...prev, subject: value }))} style={styles.input} />
              <TextInput placeholder="Exam Name" value={marksForm.examName} onChangeText={(value) => setMarksForm((prev) => ({ ...prev, examName: value }))} style={styles.input} />
              <TextInput placeholder="Exam Type" value={marksForm.examType} onChangeText={(value) => setMarksForm((prev) => ({ ...prev, examType: value }))} style={styles.input} />
              <View style={styles.doubleRow}>
                <TextInput placeholder="Total Marks" value={marksForm.totalMarks} onChangeText={(value) => setMarksForm((prev) => ({ ...prev, totalMarks: value }))} style={[styles.input, styles.half]} keyboardType="numeric" />
                <TextInput placeholder="Marks Obtained" value={marksForm.obtainedMarks} onChangeText={(value) => setMarksForm((prev) => ({ ...prev, obtainedMarks: value }))} style={[styles.input, styles.half]} keyboardType="numeric" />
              </View>
              <TextInput placeholder="Date" value={marksForm.date} onChangeText={(value) => setMarksForm((prev) => ({ ...prev, date: value }))} style={styles.input} />
              <View style={styles.actionRow}>
                <Pressable onPress={() => setShowMarksModal(false)} style={styles.inlineButton}><Text style={styles.inlineText}>Cancel</Text></Pressable>
                <Pressable onPress={() => void saveMarks()} style={styles.primaryButton}><Text style={styles.primaryButtonText}>{saving ? 'Saving...' : editingMark ? 'Update Marks' : 'Save Marks'}</Text></Pressable>
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
  sectionTitle: { fontSize: 18, fontWeight: '700', color: '#111827' },
  label: { fontSize: 14, fontWeight: '600', color: '#111827' },
  input: { borderWidth: 1, borderColor: '#d1d5db', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, backgroundColor: '#ffffff' },
  textArea: { minHeight: 88, textAlignVertical: 'top' },
  primaryButton: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10, backgroundColor: '#2563eb' },
  primaryButtonText: { color: '#ffffff', fontWeight: '600' },
  tabRow: { flexDirection: 'row', gap: 8 },
  tab: { flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 10, backgroundColor: '#e5e7eb' },
  tabActive: { backgroundColor: '#dbeafe' },
  tabText: { fontWeight: '600', color: '#374151' },
  tabTextActive: { fontWeight: '700', color: '#1d4ed8' },
  card: { borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 12, backgroundColor: '#ffffff', padding: 14, gap: 6 },
  cardSelected: { borderColor: '#2563eb', backgroundColor: '#eff6ff' },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  cardTitle: { fontSize: 16, fontWeight: '600', color: '#111827' },
  cardSubtitle: { fontSize: 13, color: '#6b7280', marginTop: 2 },
  badge: { alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, backgroundColor: '#dbeafe', color: '#1d4ed8', fontWeight: '600', overflow: 'hidden' },
  smallText: { fontSize: 13, color: '#4b5563' },
  actionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  inlineButton: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, backgroundColor: '#e5e7eb' },
  inlineText: { fontWeight: '600', color: '#111827' },
  inlineDanger: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, backgroundColor: '#fee2e2' },
  inlineDangerText: { color: '#b91c1c', fontWeight: '600' },
  wrapRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, backgroundColor: '#e5e7eb' },
  chipActive: { backgroundColor: '#dbeafe' },
  chipText: { color: '#374151' },
  chipTextActive: { color: '#1d4ed8', fontWeight: '600' },
  summaryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  summaryCard: { width: '48%', borderRadius: 12, backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#e5e7eb', padding: 14 },
  summaryValue: { fontSize: 22, fontWeight: '700', color: '#111827' },
  summaryLabel: { marginTop: 4, fontSize: 12, color: '#6b7280', textTransform: 'uppercase' },
  emptyCard: { borderRadius: 12, padding: 14, backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#e5e7eb' },
  emptyText: { fontSize: 14, color: '#6b7280' },
  warning: { color: '#b45309', fontSize: 13, backgroundColor: '#fef3c7', padding: 12, borderRadius: 10 },
  infoCard: { borderWidth: 1, borderColor: '#dbeafe', borderRadius: 12, backgroundColor: '#eff6ff', padding: 14, gap: 6 },
  modalBackdrop: { flex: 1, justifyContent: 'center', backgroundColor: 'rgba(17, 24, 39, 0.45)', padding: 16 },
  modalCard: { maxHeight: '90%', borderRadius: 16, backgroundColor: '#f9fafb', overflow: 'hidden' },
  modalContent: { padding: 16, gap: 12 },
  doubleRow: { flexDirection: 'row', gap: 10 },
  half: { flex: 1 },
  error: { color: '#dc2626', fontSize: 14 },
  disabled: { opacity: 0.7 },
});
