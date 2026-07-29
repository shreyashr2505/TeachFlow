import React, { useEffect, useMemo, useState } from 'react';
import { FlatList, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import { teachflowService } from '../services/teachflow';
import { useLiveCollection } from '../hooks/useLiveCollection';
import {
  Batch,
  Fee,
  Lecture,
  Marks,
  Student,
  Teacher,
  Message,
  PaymentRecord,
  CoachingClass,
  ReportCard,
  AnalyticsSnapshot,
  AIUsageLog,
  User,
} from '../types';
import { CrudCollectionScreen } from './CrudCollectionScreen';
import { Body, Button, Card, EmptyBox, Input, PressCard, Row, Screen, ScrollContent, SectionTitle, SpaceBetween, Title } from '../components/ui';
import { colors } from '../theme';

const parseNumberFields = (payload: Record<string, string>, keys: string[]) => {
  const next = { ...payload };
  keys.forEach((key) => {
    const parsed = Number(next[key]);
    next[key] = Number.isFinite(parsed) ? String(parsed) : '0';
  });
  return next;
};

const studentFields = [
  { key: 'name', label: 'Name' },
  { key: 'email', label: 'Email', keyboardType: 'email-address' as const },
  { key: 'phone', label: 'Phone', keyboardType: 'phone-pad' as const },
  { key: 'batch', label: 'Batch' },
  { key: 'rollNumber', label: 'Roll Number' },
  { key: 'feeStatus', label: 'Fee Status' },
  { key: 'totalFees', label: 'Total Fees', keyboardType: 'numeric' as const },
  { key: 'paidFees', label: 'Paid Fees', keyboardType: 'numeric' as const },
];

const teacherFields = [
  { key: 'name', label: 'Name' },
  { key: 'email', label: 'Email', keyboardType: 'email-address' as const },
  { key: 'phone', label: 'Phone', keyboardType: 'phone-pad' as const },
  { key: 'subjects', label: 'Subjects (comma separated)' },
  { key: 'batches', label: 'Batches (comma separated)' },
  { key: 'salary', label: 'Salary', keyboardType: 'numeric' as const },
];

const batchFields = [
  { key: 'name', label: 'Batch Name' },
  { key: 'timing', label: 'Timing' },
  { key: 'teacherName', label: 'Teacher' },
  { key: 'subjects', label: 'Subjects (comma separated)' },
];

const lectureFields = [
  { key: 'title', label: 'Title' },
  { key: 'subject', label: 'Subject' },
  { key: 'batch', label: 'Batch' },
  { key: 'teacherName', label: 'Teacher' },
  { key: 'date', label: 'Date' },
  { key: 'time', label: 'Time' },
  { key: 'grade', label: 'Grade' },
  { key: 'board', label: 'Board' },
  { key: 'lecMode', label: 'Mode' },
  { key: 'roomNumber', label: 'Room Number' },
  { key: 'description', label: 'Description', multiline: true },
];

const marksFields = [
  { key: 'studentName', label: 'Student' },
  { key: 'subject', label: 'Subject' },
  { key: 'examType', label: 'Exam Type' },
  { key: 'examName', label: 'Exam Name' },
  { key: 'totalMarks', label: 'Total Marks', keyboardType: 'numeric' as const },
  { key: 'obtainedMarks', label: 'Obtained Marks', keyboardType: 'numeric' as const },
  { key: 'date', label: 'Date' },
  { key: 'batch', label: 'Batch' },
];

const feeFields = [
  { key: 'studentName', label: 'Student' },
  { key: 'amount', label: 'Amount', keyboardType: 'numeric' as const },
  { key: 'dueDate', label: 'Due Date' },
  { key: 'status', label: 'Status' },
  { key: 'paidAmount', label: 'Paid Amount', keyboardType: 'numeric' as const },
  { key: 'description', label: 'Description' },
];

const stringifyArray = (value: string) => value.split(',').map((item) => item.trim()).filter(Boolean);

const SummaryLine = ({ label, value }: { label: string; value: string | number }) => (
  <Body style={{ color: colors.text, marginBottom: 4 }}>
    <Body style={{ color: colors.textMuted }}>{label}:</Body> {value}
  </Body>
);

export const StudentsModule = () => {
  const { currentClass } = useAuth();
  const [items, setItems] = useState<Student[]>([]);
  const dataState = useLiveCollection<Student>(['students', currentClass?.id], (next, onError) =>
    teachflowService.subscribeToStudents(currentClass?.id ?? '', (data) => next(data as Student[]), onError)
  );

  useEffect(() => setItems(dataState.data), [dataState.data]);

  const save = async (id: string | null, payload: Record<string, string>) => {
    if (!currentClass?.id) return;
    const next = {
      ...payload,
      totalFees: Number(payload.totalFees || 0),
      paidFees: Number(payload.paidFees || 0),
      subjects: stringifyArray(payload.subjects ?? ''),
      batches: stringifyArray(payload.batches ?? ''),
    };
    if (id) {
      await teachflowService.updateClassDoc(currentClass.id, 'students', id, next);
    } else {
      await teachflowService.createClassDoc<Student>(currentClass.id, 'students', next as Omit<Student, 'id'>);
    }
  };

  return (
    <CrudCollectionScreen<Student>
      title="Students"
      subtitle="Add, edit, and delete student records from your class workspace."
      data={items}
      isOffline={dataState.isOffline}
      fields={studentFields}
      initialValue={{ name: '', email: '', phone: '', batch: 'Batch A', rollNumber: '', feeStatus: 'due', totalFees: '0', paidFees: '0' }}
      renderSummary={(item) => (
        <>
          <SectionTitle>{item.name}</SectionTitle>
          <View style={{ height: 8 }} />
          <SummaryLine label="Batch" value={item.batch} />
          <SummaryLine label="Roll" value={item.rollNumber} />
          <SummaryLine label="Fee Status" value={item.feeStatus} />
        </>
      )}
      onCreate={(payload) => save(null, payload)}
      onUpdate={(id, payload) => save(id, payload)}
      onDelete={async (id) => {
        if (!currentClass?.id) return;
        await teachflowService.deleteClassDoc(currentClass.id, 'students', id);
      }}
      onRefresh={() => undefined}
      emptyTitle="No students yet"
      emptyDescription="Create your first student profile to start tracking attendance, marks, and fees."
    />
  );
};

export const TeachersModule = () => {
  const { currentClass } = useAuth();
  const [items, setItems] = useState<Teacher[]>([]);
  const dataState = useLiveCollection<Teacher>(['teachers', currentClass?.id], (next, onError) =>
    teachflowService.subscribeToTeachers(currentClass?.id ?? '', (data) => next(data as Teacher[]), onError)
  );
  useEffect(() => setItems(dataState.data), [dataState.data]);

  const save = async (id: string | null, payload: Record<string, string>) => {
    if (!currentClass?.id) return;
    const next = {
      ...payload,
      subjects: stringifyArray(payload.subjects ?? ''),
      batches: stringifyArray(payload.batches ?? ''),
      salary: Number(payload.salary || 0),
    };
    if (id) await teachflowService.updateClassDoc(currentClass.id, 'teachers', id, next);
    else await teachflowService.createClassDoc<Teacher>(currentClass.id, 'teachers', next as Omit<Teacher, 'id'>);
  };

  return (
    <CrudCollectionScreen<Teacher>
      title="Teachers"
      subtitle="Assign teachers, batches, and subject lists."
      data={items}
      isOffline={dataState.isOffline}
      fields={teacherFields}
      initialValue={{ name: '', email: '', phone: '', subjects: '', batches: '', salary: '0' }}
      renderSummary={(item) => (
        <>
          <SectionTitle>{item.name}</SectionTitle>
          <View style={{ height: 8 }} />
          <SummaryLine label="Subjects" value={item.subjects.join(', ') || '-'} />
          <SummaryLine label="Batches" value={item.batches.join(', ') || '-'} />
        </>
      )}
      onCreate={(payload) => save(null, payload)}
      onUpdate={(id, payload) => save(id, payload)}
      onDelete={async (id) => currentClass?.id && teachflowService.deleteClassDoc(currentClass.id, 'teachers', id)}
      emptyTitle="No teachers yet"
      emptyDescription="Add a teacher to assign lectures, batches, and student support."
    />
  );
};

export const BatchesModule = () => {
  const { currentClass } = useAuth();
  const [items, setItems] = useState<Batch[]>([]);
  const dataState = useLiveCollection<Batch>(['batches', currentClass?.id], (next, onError) =>
    teachflowService.subscribeToBatches(currentClass?.id ?? '', (data) => next(data as Batch[]), onError)
  );
  useEffect(() => setItems(dataState.data), [dataState.data]);

  const save = async (id: string | null, payload: Record<string, string>) => {
    if (!currentClass?.id) return;
    const next = { ...payload, subjects: stringifyArray(payload.subjects ?? '') };
    if (id) await teachflowService.updateClassDoc(currentClass.id, 'batches', id, next);
    else await teachflowService.createClassDoc<Batch>(currentClass.id, 'batches', next as Omit<Batch, 'id'>);
  };

  return (
    <CrudCollectionScreen<Batch>
      title="Batches"
      subtitle="Organize students into batches and keep schedules tight."
      data={items}
      isOffline={dataState.isOffline}
      fields={batchFields}
      initialValue={{ name: '', timing: '', teacherName: '', subjects: '' }}
      renderSummary={(item) => (
        <>
          <SectionTitle>{item.name}</SectionTitle>
          <View style={{ height: 8 }} />
          <SummaryLine label="Timing" value={item.timing} />
          <SummaryLine label="Teacher" value={item.teacherName ?? '-'} />
          <SummaryLine label="Subjects" value={item.subjects.join(', ') || '-'} />
        </>
      )}
      onCreate={(payload) => save(null, payload)}
      onUpdate={(id, payload) => save(id, payload)}
      onDelete={async (id) => currentClass?.id && teachflowService.deleteClassDoc(currentClass.id, 'batches', id)}
      emptyTitle="No batches yet"
      emptyDescription="Create a batch to group students and lectures."
    />
  );
};

export const LecturesModule = () => {
  const { currentClass } = useAuth();
  const [items, setItems] = useState<Lecture[]>([]);
  const dataState = useLiveCollection<Lecture>(['lectures', currentClass?.id], (next, onError) =>
    teachflowService.subscribeToLectures(currentClass?.id ?? '', (data) => next(data as Lecture[]), onError)
  );
  useEffect(() => setItems(dataState.data), [dataState.data]);

  const save = async (id: string | null, payload: Record<string, string>) => {
    if (!currentClass?.id) return;
    const next = { ...payload, duration: 60 };
    if (id) await teachflowService.updateClassDoc(currentClass.id, 'lectures', id, next);
    else await teachflowService.createClassDoc<Lecture>(currentClass.id, 'lectures', next as Omit<Lecture, 'id'>);
  };

  return (
    <CrudCollectionScreen<Lecture>
      title="Lectures"
      subtitle="Schedule classes, codes, timing, and lecture metadata."
      data={items}
      isOffline={dataState.isOffline}
      fields={lectureFields}
      initialValue={{ title: '', subject: '', batch: '', teacherName: '', date: '', time: '', grade: '10', board: 'CB', lecMode: 'OFFLINE', roomNumber: '', description: '' }}
      renderSummary={(item) => (
        <>
          <SectionTitle>{item.title}</SectionTitle>
          <View style={{ height: 8 }} />
          <SummaryLine label="Subject" value={item.subject} />
          <SummaryLine label="Batch" value={item.batch} />
          <SummaryLine label="Teacher" value={item.teacherName} />
        </>
      )}
      onCreate={(payload) => save(null, payload)}
      onUpdate={(id, payload) => save(id, payload)}
      onDelete={async (id) => currentClass?.id && teachflowService.deleteClassDoc(currentClass.id, 'lectures', id)}
      emptyTitle="No lectures yet"
      emptyDescription="Create lecture cards with the same batch and branch metadata used on web."
    />
  );
};

export const MarksModule = () => {
  const { currentClass } = useAuth();
  const [items, setItems] = useState<Marks[]>([]);
  const dataState = useLiveCollection<Marks>(['marks', currentClass?.id], (next, onError) =>
    teachflowService.subscribeToMarks(currentClass?.id ?? '', (data) => next(data as Marks[]), onError)
  );
  useEffect(() => setItems(dataState.data), [dataState.data]);

  const save = async (id: string | null, payload: Record<string, string>) => {
    if (!currentClass?.id) return;
    const next = { ...payload, totalMarks: Number(payload.totalMarks || 0), obtainedMarks: Number(payload.obtainedMarks || 0), teacherId: currentClass.adminId };
    if (id) await teachflowService.updateClassDoc(currentClass.id, 'marks', id, next);
    else await teachflowService.createClassDoc<Marks>(currentClass.id, 'marks', next as Omit<Marks, 'id'>);
  };

  return (
    <CrudCollectionScreen<Marks>
      title="Marks"
      subtitle="Publish exam results and track performance."
      data={items}
      isOffline={dataState.isOffline}
      fields={marksFields}
      initialValue={{ studentName: '', subject: '', examType: '', examName: '', totalMarks: '0', obtainedMarks: '0', date: '', batch: '' }}
      renderSummary={(item) => (
        <>
          <SectionTitle>{item.studentName}</SectionTitle>
          <View style={{ height: 8 }} />
          <SummaryLine label="Exam" value={item.examName} />
          <SummaryLine label="Subject" value={item.subject} />
          <SummaryLine label="Score" value={`${item.obtainedMarks}/${item.totalMarks}`} />
        </>
      )}
      onCreate={(payload) => save(null, payload)}
      onUpdate={(id, payload) => save(id, payload)}
      onDelete={async (id) => currentClass?.id && teachflowService.deleteClassDoc(currentClass.id, 'marks', id)}
      emptyTitle="No marks yet"
      emptyDescription="Add marks after an assessment to keep student analytics current."
    />
  );
};

export const FeesModule = () => {
  const { currentClass } = useAuth();
  const [items, setItems] = useState<Fee[]>([]);
  const dataState = useLiveCollection<Fee>(['fees', currentClass?.id], (next, onError) =>
    teachflowService.subscribeToFees(currentClass?.id ?? '', (data) => next(data as Fee[]), onError)
  );
  useEffect(() => setItems(dataState.data), [dataState.data]);

  const save = async (id: string | null, payload: Record<string, string>) => {
    if (!currentClass?.id) return;
    const next = { ...payload, amount: Number(payload.amount || 0), paidAmount: Number(payload.paidAmount || 0) };
    if (id) await teachflowService.updateClassDoc(currentClass.id, 'fees', id, next);
    else await teachflowService.createClassDoc<Fee>(currentClass.id, 'fees', next as Omit<Fee, 'id'>);
  };

  return (
    <CrudCollectionScreen<Fee>
      title="Fees"
      subtitle="Track dues, partial payments, and fee descriptions."
      data={items}
      isOffline={dataState.isOffline}
      fields={feeFields}
      initialValue={{ studentName: '', amount: '0', dueDate: '', status: 'due', paidAmount: '0', description: '' }}
      renderSummary={(item) => (
        <>
          <SectionTitle>{item.studentName}</SectionTitle>
          <View style={{ height: 8 }} />
          <SummaryLine label="Status" value={item.status} />
          <SummaryLine label="Amount" value={item.amount} />
          <SummaryLine label="Paid" value={item.paidAmount} />
        </>
      )}
      onCreate={(payload) => save(null, payload)}
      onUpdate={(id, payload) => save(id, payload)}
      onDelete={async (id) => currentClass?.id && teachflowService.deleteClassDoc(currentClass.id, 'fees', id)}
      emptyTitle="No fee records yet"
      emptyDescription="Add a fee card to manage dues and payment progress."
    />
  );
};

export const AttendanceModule = () => {
  const { currentClass } = useAuth();
  const [records, setRecords] = useState<any[]>([]);
  const [lectureId, setLectureId] = useState('');
  const [studentId, setStudentId] = useState('');
  const [studentName, setStudentName] = useState('');
  const [status, setStatus] = useState<'present' | 'absent'>('present');
  const [lectureTitle, setLectureTitle] = useState('');
  const [batch, setBatch] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));

  useEffect(() => {
    if (!currentClass?.id) return;
    const unsub = teachflowService.subscribeToAttendance(currentClass.id, (data) => setRecords(data as any[]));
    return unsub;
  }, [currentClass?.id]);

  const save = async () => {
    if (!currentClass?.id || !lectureId || !studentId) return;
    await teachflowService.createClassDoc(currentClass.id, 'attendance', {
      lectureId,
      studentId,
      studentName,
      classId: currentClass.id,
      lectureTitle,
      batch,
      date,
      status,
      markedAt: new Date().toISOString(),
      markedBy: currentClass.adminId,
    } as any);
  };

  return (
    <Screen>
      <ScrollContent>
        <Title>Attendance</Title>
        <Body style={{ marginTop: 8 }}>Create attendance records from your lecture workflow.</Body>
        <Card style={{ marginTop: 16, marginBottom: 16 }}>
          <SectionTitle>Mark Attendance</SectionTitle>
          <View style={{ height: 12 }} />
          <Input value={lectureId} onChangeText={setLectureId} placeholder="Lecture ID" placeholderTextColor="#6b7280" style={{ marginBottom: 10 }} />
          <Input value={studentId} onChangeText={setStudentId} placeholder="Student ID" placeholderTextColor="#6b7280" style={{ marginBottom: 10 }} />
          <Input value={studentName} onChangeText={setStudentName} placeholder="Student Name" placeholderTextColor="#6b7280" style={{ marginBottom: 10 }} />
          <Input value={lectureTitle} onChangeText={setLectureTitle} placeholder="Lecture Title" placeholderTextColor="#6b7280" style={{ marginBottom: 10 }} />
          <Input value={batch} onChangeText={setBatch} placeholder="Batch" placeholderTextColor="#6b7280" style={{ marginBottom: 10 }} />
          <Input value={date} onChangeText={setDate} placeholder="YYYY-MM-DD" placeholderTextColor="#6b7280" style={{ marginBottom: 10 }} />
          <Input value={status} onChangeText={(value) => setStatus(value === 'absent' ? 'absent' : 'present')} placeholder="present / absent" placeholderTextColor="#6b7280" style={{ marginBottom: 12 }} />
          <Button variant="primary" label="Save Attendance" onPress={() => void save()} />
        </Card>

        <FlatList
          data={records}
          scrollEnabled={false}
          keyExtractor={(item, index) => String(item.id ?? index)}
          ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
          ListEmptyComponent={<EmptyBox><Body>No attendance records yet.</Body></EmptyBox>}
          renderItem={({ item }) => (
            <Card>
              <SectionTitle>{item.studentName ?? item.studentId}</SectionTitle>
              <Body style={{ marginTop: 6 }}>{item.lectureTitle ?? item.lectureId}</Body>
              <Body style={{ marginTop: 6 }}>{item.status}</Body>
            </Card>
          )}
        />
      </ScrollContent>
    </Screen>
  );
};

export const MessagesModule = () => {
  const { user, currentClass } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [compose, setCompose] = useState({ toUserId: '', subject: '', message: '' });
  const [recipients, setRecipients] = useState<User[]>([]);

  useEffect(() => {
    if (!currentClass?.id || !user) return;
    const unsubscribe =
      user.role === 'admin'
        ? teachflowService.subscribeToMessagesForClass(currentClass.id, setMessages)
        : user.role === 'teacher'
          ? teachflowService.subscribeToMessagesSentByUser(currentClass.id, user.id, setMessages)
          : teachflowService.subscribeToMessagesForUser(currentClass.id, user.id, setMessages);
    const usersUnsub = teachflowService.subscribeToClassUsers(currentClass.id, setRecipients);
    return () => {
      unsubscribe();
      usersUnsub();
    };
  }, [currentClass?.id, user?.id, user?.role]);

  const filteredRecipients = useMemo(() => recipients.filter((item) => item.id !== user?.id), [recipients, user?.id]);

  return (
    <Screen>
      <ScrollContent>
        <Title>Messages</Title>
        <Body style={{ marginTop: 8 }}>Send and review role-aware class conversations.</Body>

        <Card style={{ marginTop: 16, marginBottom: 16 }}>
          <SectionTitle>Compose</SectionTitle>
          <View style={{ height: 12 }} />
          <Body style={{ marginBottom: 6 }}>Recipient ID</Body>
          <Input value={compose.toUserId} onChangeText={(value) => setCompose((prev) => ({ ...prev, toUserId: value }))} placeholder="Type user id" placeholderTextColor="#6b7280" />
          <View style={{ height: 10 }} />
          <Body style={{ marginBottom: 6 }}>Subject</Body>
          <Input value={compose.subject} onChangeText={(value) => setCompose((prev) => ({ ...prev, subject: value }))} placeholder="Subject" placeholderTextColor="#6b7280" />
          <View style={{ height: 10 }} />
          <Body style={{ marginBottom: 6 }}>Message</Body>
          <Input
            value={compose.message}
            onChangeText={(value) => setCompose((prev) => ({ ...prev, message: value }))}
            placeholder="Write a message..."
            placeholderTextColor="#6b7280"
            multiline
            style={{ minHeight: 96, textAlignVertical: 'top' }}
          />
          <View style={{ height: 12 }} />
          <Button
            variant="primary"
            label="Send"
            onPress={async () => {
              if (!currentClass?.id || !user) return;
              await teachflowService.createMessage({
                classId: currentClass.id,
                fromUserId: user.id,
                fromUserName: user.name,
                fromRole: user.role,
                toUserId: compose.toUserId,
                subject: compose.subject,
                message: compose.message,
              });
              setCompose({ toUserId: '', subject: '', message: '' });
            }}
          />
          {filteredRecipients.length > 0 ? (
            <View style={{ marginTop: 12 }}>
              <Body>Known user ids: {filteredRecipients.slice(0, 4).map((item) => item.id).join(', ')}</Body>
            </View>
          ) : null}
        </Card>

        <FlatList
          data={messages}
          keyExtractor={(item) => item.id}
          scrollEnabled={false}
          ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
          ListEmptyComponent={<EmptyBox><Body>No messages yet.</Body></EmptyBox>}
          renderItem={({ item }) => (
            <Card>
              <SpaceBetween style={{ alignItems: 'flex-start' }}>
                <View style={{ flex: 1, paddingRight: 12 }}>
                  <SectionTitle>{item.subject || 'General message'}</SectionTitle>
                  <Body style={{ marginTop: 6 }}>{item.message}</Body>
                  <Body style={{ marginTop: 8 }}>From {item.fromUserName}</Body>
                </View>
                <Feather name={item.status === 'read' ? 'check-circle' : 'mail'} size={18} color={item.status === 'read' ? '#86efac' : '#93c5fd'} />
              </SpaceBetween>
            </Card>
          )}
        />
      </ScrollContent>
    </Screen>
  );
};

export const SettingsModule = () => {
  const { currentClass, refreshUserData } = useAuth();
  const [allowSelfRegistration, setAllowSelfRegistration] = useState(currentClass?.settings.allowSelfRegistration ?? true);
  const [requireApproval, setRequireApproval] = useState(currentClass?.settings.requireApproval ?? false);

  useEffect(() => {
    setAllowSelfRegistration(currentClass?.settings.allowSelfRegistration ?? true);
    setRequireApproval(currentClass?.settings.requireApproval ?? false);
  }, [currentClass?.id, currentClass?.settings.allowSelfRegistration, currentClass?.settings.requireApproval]);

  return (
    <Screen>
      <ScrollContent>
        <Title>Settings</Title>
        <Body style={{ marginTop: 8 }}>Control signup flow and approval rules for the current workspace.</Body>
        <Card style={{ marginTop: 16 }}>
          <SectionTitle>Registration & Access</SectionTitle>
          <View style={{ height: 12 }} />
          <Body>Allow self registration: {allowSelfRegistration ? 'On' : 'Off'}</Body>
          <Button
            variant="secondary"
            label={allowSelfRegistration ? 'Disable' : 'Enable'}
            onPress={() => setAllowSelfRegistration((value) => !value)}
          />
          <View style={{ height: 10 }} />
          <Body>Require approval: {requireApproval ? 'On' : 'Off'}</Body>
          <Button variant="secondary" label={requireApproval ? 'Disable' : 'Enable'} onPress={() => setRequireApproval((value) => !value)} />
          <View style={{ height: 14 }} />
          <Button
            variant="primary"
            label="Save Settings"
            onPress={async () => {
              if (!currentClass?.id) return;
              await teachflowService.updateClassSettings(currentClass.id, { ...currentClass.settings, allowSelfRegistration, requireApproval });
              await refreshUserData();
            }}
          />
        </Card>
      </ScrollContent>
    </Screen>
  );
};

export const BranchesModule = () => {
  const { classes, currentClass, createClass, switchClass } = useAuth();
  const [name, setName] = useState('');
  const [subdomain, setSubdomain] = useState('');
  const [description, setDescription] = useState('');

  return (
    <Screen>
      <ScrollContent>
        <Title>Branches</Title>
        <Body style={{ marginTop: 8 }}>Create or switch between class workspaces.</Body>
        <FlatList
          data={classes}
          scrollEnabled={false}
          keyExtractor={(item) => item.id}
          ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
          renderItem={({ item }) => (
            <PressCard onPress={() => void switchClass(item.id)}>
              <Card>
                <SpaceBetween>
                  <View style={{ flex: 1 }}>
                    <SectionTitle>{item.name}</SectionTitle>
                    <Body style={{ marginTop: 6 }}>{item.subdomain}</Body>
                  </View>
                  {item.id === currentClass?.id ? <Feather name="check-circle" size={20} color="#86efac" /> : <Feather name="corner-up-right" size={20} color="#93c5fd" />}
                </SpaceBetween>
              </Card>
            </PressCard>
          )}
        />
        <Card style={{ marginTop: 16 }}>
          <SectionTitle>Create Branch</SectionTitle>
          <View style={{ height: 12 }} />
          <Input value={name} onChangeText={setName} placeholder="Branch name" placeholderTextColor="#6b7280" />
          <View style={{ height: 10 }} />
          <Input value={subdomain} onChangeText={setSubdomain} placeholder="Slug" placeholderTextColor="#6b7280" />
          <View style={{ height: 10 }} />
          <Input value={description} onChangeText={setDescription} placeholder="Description" placeholderTextColor="#6b7280" multiline style={{ minHeight: 96, textAlignVertical: 'top' }} />
          <View style={{ height: 12 }} />
          <Button
            variant="primary"
            label="Create Branch"
            onPress={async () => {
              await createClass({
                name,
                description,
                subdomain,
                plan: currentClass?.plan ?? 'free',
                limits: currentClass?.limits ?? { students: 45, teachers: 5, batches: 3, branches: 1 },
                settings: { allowSelfRegistration: true, requireApproval: false, aiEnabled: currentClass?.settings.aiEnabled },
                isActive: true,
              });
              setName('');
              setSubdomain('');
              setDescription('');
            }}
          />
        </Card>
      </ScrollContent>
    </Screen>
  );
};

export const ApprovalsModule = () => {
  const { currentClass } = useAuth();
  const [users, setUsers] = useState<User[]>([]);

  useEffect(() => {
    if (!currentClass?.id) return;
    const unsub = teachflowService.subscribeToClassUsers(currentClass.id, (data) => setUsers(data));
    return unsub;
  }, [currentClass?.id]);

  const pending = users.filter((item) => item.approved === false);

  return (
    <Screen>
      <ScrollContent>
        <Title>Approvals</Title>
        <Body style={{ marginTop: 8 }}>Review pending users and move them into the right class role.</Body>
        {pending.length === 0 ? (
          <EmptyBox style={{ marginTop: 16 }}>
            <Body>No pending users right now.</Body>
          </EmptyBox>
        ) : (
          pending.map((item) => (
            <Card key={item.id} style={{ marginTop: 12 }}>
              <SectionTitle>{item.name}</SectionTitle>
              <Body style={{ marginTop: 6 }}>{item.email}</Body>
              <Body style={{ marginTop: 6 }}>Role: {item.role}</Body>
              <View style={{ height: 12 }} />
              <Row style={{ gap: 10 }}>
                <Button
                  variant="primary"
                  label="Approve"
                  onPress={async () => {
                    if (!currentClass?.id) return;
                    await teachflowService.approvePendingUser({
                      userId: item.id,
                      classId: currentClass.id,
                      role: item.role,
                      batchName: 'Batch A',
                    });
                  }}
                />
                <Button
                  variant="secondary"
                  label="Reject"
                  onPress={async () => {
                    if (!currentClass?.id) return;
                    await teachflowService.rejectUser(item.id, currentClass.id);
                  }}
                />
              </Row>
            </Card>
          ))
        )}
      </ScrollContent>
    </Screen>
  );
};

export const ReportsModule = () => {
  const { currentClass } = useAuth();
  const [reports, setReports] = useState<ReportCard[]>([]);

  useEffect(() => {
    if (!currentClass?.id) return;
    const unsub = teachflowService.subscribeToClassReports(currentClass.id, (data) => setReports(data as ReportCard[]));
    return unsub;
  }, [currentClass?.id]);

  return (
    <Screen>
      <ScrollContent>
        <Title>Reports</Title>
        <Body style={{ marginTop: 8 }}>Saved report cards and AI-ready student summaries.</Body>
        <FlatList
          data={reports}
          scrollEnabled={false}
          keyExtractor={(item) => item.id}
          ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
          ListEmptyComponent={<EmptyBox style={{ marginTop: 16 }}><Body>No reports yet.</Body></EmptyBox>}
          renderItem={({ item }) => (
            <Card>
              <SectionTitle>{item.studentId}</SectionTitle>
              <Body style={{ marginTop: 6 }}>Attendance {item.attendance.percentage}%</Body>
              <Body style={{ marginTop: 6 }}>AI {item.aiStatus}</Body>
            </Card>
          )}
        />
      </ScrollContent>
    </Screen>
  );
};

export const AnalyticsModule = () => {
  const { currentClass } = useAuth();
  const [snapshots, setSnapshots] = useState<AnalyticsSnapshot[]>([]);
  useEffect(() => {
    if (!currentClass?.id) return;
    const unsub = teachflowService.subscribeToAnalyticsSnapshots(currentClass.id, (data) => setSnapshots(data as AnalyticsSnapshot[]));
    return unsub;
  }, [currentClass?.id]);

  return (
    <Screen>
      <ScrollContent>
        <Title>Analytics</Title>
        <Body style={{ marginTop: 8 }}>Class summaries and performance snapshots.</Body>
        {snapshots.length === 0 ? (
          <EmptyBox style={{ marginTop: 16 }}>
            <Body>No analytics snapshots yet.</Body>
          </EmptyBox>
        ) : (
          snapshots.map((item) => (
            <Card key={item.id} style={{ marginTop: 12 }}>
              <SectionTitle>{item.periodLabel}</SectionTitle>
              <Body style={{ marginTop: 6 }}>Attendance {item.attendancePercentage}%</Body>
              <Body style={{ marginTop: 6 }}>Pass {item.passPercentage}%</Body>
            </Card>
          ))
        )}
      </ScrollContent>
    </Screen>
  );
};

export const AiModule = () => {
  const { currentClass, user } = useAuth();
  const [usage, setUsage] = useState<AIUsageLog[]>([]);
  const monthKey = new Date().toISOString().slice(0, 7);

  useEffect(() => {
    if (!currentClass?.id) return;
    const unsub = teachflowService.subscribeToAIUsageForMonth(currentClass.id, monthKey, (data) => setUsage(data));
    return unsub;
  }, [currentClass?.id, monthKey]);

  return (
    <Screen>
      <ScrollContent>
        <Title>AI Insights</Title>
        <Body style={{ marginTop: 8 }}>Track AI usage and generate coaching-ready summaries from the same Firestore records as web.</Body>
        <Card style={{ marginTop: 16 }}>
          <SectionTitle>Monthly usage</SectionTitle>
          <Body style={{ marginTop: 8 }}>{usage.length} requests this month</Body>
          <View style={{ height: 12 }} />
          <Button
            variant="primary"
            label="Log AI Request"
            onPress={async () => {
              if (!currentClass?.id || !user) return;
              await teachflowService.createAIUsageLog({
                classId: currentClass.id,
                feature: 'admin_chat',
                promptTokens: 120,
                completionTokens: 220,
                totalTokens: 340,
                monthKey,
              });
            }}
          />
        </Card>
        <FlatList
          data={usage}
          scrollEnabled={false}
          keyExtractor={(item) => item.id}
          ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
          ListEmptyComponent={<EmptyBox style={{ marginTop: 16 }}><Body>No AI usage yet.</Body></EmptyBox>}
          renderItem={({ item }) => (
            <Card>
              <SectionTitle>{item.feature}</SectionTitle>
              <Body style={{ marginTop: 6 }}>{item.totalTokens} tokens</Body>
            </Card>
          )}
        />
      </ScrollContent>
    </Screen>
  );
};

export const SuperAdminModule = () => {
  const [classes, setClasses] = useState<CoachingClass[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [growth, setGrowth] = useState<GrowthEvent[]>([]);

  useEffect(() => {
    const unsubA = teachflowService.subscribeToAllClasses(setClasses);
    const unsubB = teachflowService.subscribeToAllUsers(setUsers);
    const unsubC = teachflowService.subscribeToPayments(setPayments);
    const unsubD = teachflowService.subscribeToGrowthEvents(setGrowth);
    return () => {
      unsubA();
      unsubB();
      unsubC();
      unsubD();
    };
  }, []);

  return (
    <Screen>
      <ScrollContent>
        <Title>Platform</Title>
        <Body style={{ marginTop: 8 }}>Global control center for TeachFlow operators.</Body>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 16 }}>
          <Card style={{ flex: 1, minWidth: '48%' }}><SectionTitle>Classes</SectionTitle><Body style={{ marginTop: 8 }}>{classes.length}</Body></Card>
          <Card style={{ flex: 1, minWidth: '48%' }}><SectionTitle>Users</SectionTitle><Body style={{ marginTop: 8 }}>{users.length}</Body></Card>
          <Card style={{ flex: 1, minWidth: '48%' }}><SectionTitle>Payments</SectionTitle><Body style={{ marginTop: 8 }}>{payments.length}</Body></Card>
          <Card style={{ flex: 1, minWidth: '48%' }}><SectionTitle>Growth</SectionTitle><Body style={{ marginTop: 8 }}>{growth.length}</Body></Card>
        </View>

        <SectionTitle style={{ marginTop: 18 }}>Class Control</SectionTitle>
        <FlatList
          data={classes}
          scrollEnabled={false}
          keyExtractor={(item) => item.id}
          ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
          ListEmptyComponent={<EmptyBox style={{ marginTop: 12 }}><Body>No classes available.</Body></EmptyBox>}
          renderItem={({ item }) => (
            <Card style={{ marginTop: 12 }}>
              <SectionTitle>{item.name}</SectionTitle>
              <Body style={{ marginTop: 6 }}>Plan {item.plan} · {item.isActive ? 'Active' : 'Inactive'}</Body>
              <View style={{ height: 12 }} />
              <Row style={{ gap: 10 }}>
                <Button variant="secondary" label={item.isActive ? 'Suspend' : 'Activate'} onPress={async () => teachflowService.setClassActiveState(item.id, !item.isActive)} />
                <Button variant="secondary" label="+7 Days" onPress={async () => teachflowService.extendClassPlan(item.id, 7)} />
                <Button variant="secondary" label="Delete" onPress={async () => teachflowService.deleteClass(item.id)} />
              </Row>
            </Card>
          )}
        />

        <SectionTitle style={{ marginTop: 18 }}>User Control</SectionTitle>
        <FlatList
          data={users}
          scrollEnabled={false}
          keyExtractor={(item) => item.id}
          ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
          ListEmptyComponent={<EmptyBox style={{ marginTop: 12 }}><Body>No users available.</Body></EmptyBox>}
          renderItem={({ item }) => (
            <Card style={{ marginTop: 12 }}>
              <SectionTitle>{item.name}</SectionTitle>
              <Body style={{ marginTop: 6 }}>{item.email}</Body>
              <Body style={{ marginTop: 6 }}>Role {item.role} · {item.approved ? 'Enabled' : 'Disabled'}</Body>
              <View style={{ height: 12 }} />
              <Row style={{ gap: 10 }}>
                <Button variant="secondary" label={item.approved ? 'Disable' : 'Approve'} onPress={async () => teachflowService.updateUserAdminState(item.id, { approved: !item.approved })} />
                <Button variant="secondary" label="Delete" onPress={async () => teachflowService.deleteUser(item.id)} />
              </Row>
            </Card>
          )}
        />
      </ScrollContent>
    </Screen>
  );
};
