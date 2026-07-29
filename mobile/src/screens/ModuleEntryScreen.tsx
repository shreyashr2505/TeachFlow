import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Screen } from '../components/Screen';
import type { AppStackParamList } from '../navigation/AppStack';
import { paymentService } from '../services/paymentService';
import { teachflowData } from '../services/teachflowData';
import type {
  AppUser,
  AttendanceRecord,
  Batch,
  BillingSettings,
  CoachingClass,
  Fee,
  GrowthEvent,
  Lecture,
  MarksRecord,
  MessageRecord,
  PaymentRecord,
  PricingSettings,
  Student,
  Teacher,
  UserRole,
} from '../types/Models';
import { useAuth } from '../store/AuthStore';

type Props = NativeStackScreenProps<AppStackParamList, 'ModuleEntryScreen'>;

type ReportSummary = {
  studentId: string;
  studentName: string;
  batch: string;
  attendancePercent: number;
  marksPercent: number;
  feePending: number;
  lecturesCount: number;
};

const formatCurrency = (amount: number) => `Rs. ${Math.max(0, amount).toLocaleString('en-IN')}`;
const formatDate = (value?: string | null) => (value ? new Date(value).toLocaleDateString('en-IN') : 'Not set');
const formatDateTime = (value?: string | null) => (value ? new Date(value).toLocaleString('en-IN') : 'Not set');
const safeNumber = (value: string, fallback: number) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};
const roleLabel = (role?: UserRole) => (role ? role.replace('_', ' ').replace(/\b\w/g, (char) => char.toUpperCase()) : 'User');

const InputField = ({
  label,
  value,
  onChangeText,
  placeholder,
  multiline,
  keyboardType,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  multiline?: boolean;
  keyboardType?: 'default' | 'numeric';
}) => (
  <View style={styles.field}>
    <Text style={styles.fieldLabel}>{label}</Text>
    <TextInput
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor="#9ca3af"
      multiline={multiline}
      keyboardType={keyboardType}
      style={[styles.input, multiline ? styles.inputMultiline : null]}
    />
  </View>
);

export const ModuleEntryScreen = ({ route }: Props) => {
  const { title, subtitle, moduleKey } = route.params;
  const { currentClass, firebaseUser, userProfile, refreshAuthData } = useAuth();

  const [students, setStudents] = useState<Student[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [lectures, setLectures] = useState<Lecture[]>([]);
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [marks, setMarks] = useState<MarksRecord[]>([]);
  const [fees, setFees] = useState<Fee[]>([]);
  const [classUsers, setClassUsers] = useState<AppUser[]>([]);
  const [messages, setMessages] = useState<MessageRecord[]>([]);

  const [classes, setClasses] = useState<CoachingClass[]>([]);
  const [users, setUsers] = useState<AppUser[]>([]);
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [growthEvents, setGrowthEvents] = useState<GrowthEvent[]>([]);

  const [pricing, setPricing] = useState<PricingSettings>({
    id: 'pricing',
    currency: 'INR',
    standardMonthlyPrice: 399,
    proMonthlyPrice: 999,
  });
  const [billingSettings, setBillingSettings] = useState<BillingSettings>({
    standardSubscriptionPlanId: '',
    proSubscriptionPlanId: '',
    companyName: '',
    companyAddress: '',
    gstNumber: '',
  });
  const [settingsDraft, setSettingsDraft] = useState({
    allowSelfRegistration: currentClass?.settings.allowSelfRegistration ?? true,
    requireApproval: currentClass?.settings.requireApproval ?? false,
  });
  const [compose, setCompose] = useState({ toUserId: '', subject: '', message: '' });
  const [busyKey, setBusyKey] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    setSettingsDraft({
      allowSelfRegistration: currentClass?.settings.allowSelfRegistration ?? true,
      requireApproval: currentClass?.settings.requireApproval ?? false,
    });
  }, [currentClass?.settings.allowSelfRegistration, currentClass?.settings.requireApproval]);

  useEffect(() => {
    if (!currentClass?.id) {
      setStudents([]);
      setTeachers([]);
      setBatches([]);
      setLectures([]);
      setAttendance([]);
      setMarks([]);
      setFees([]);
      setClassUsers([]);
      setMessages([]);
      return;
    }

    const unsubs = [
      teachflowData.subscribeToStudents(currentClass.id, setStudents),
      teachflowData.subscribeToTeachers(currentClass.id, setTeachers),
      teachflowData.subscribeToBatches(currentClass.id, setBatches),
      teachflowData.subscribeToLectures(currentClass.id, setLectures),
      teachflowData.subscribeToAttendance(currentClass.id, setAttendance),
      teachflowData.subscribeToMarks(currentClass.id, setMarks),
      teachflowData.subscribeToFees(currentClass.id, setFees),
      teachflowData.subscribeToClassUsers(currentClass.id, setClassUsers),
    ];

    const messagesUnsub =
      moduleKey === 'messages' && userProfile
        ? userProfile.role === 'admin'
          ? teachflowData.subscribeToMessagesForClass(currentClass.id, setMessages, (nextError) => setError(nextError.message))
          : userProfile.role === 'teacher'
            ? teachflowData.subscribeToMessagesSentByUser(currentClass.id, userProfile.uid, setMessages, (nextError) => setError(nextError.message))
            : teachflowData.subscribeToMessagesForUser(currentClass.id, userProfile.uid, setMessages, (nextError) => setError(nextError.message))
        : null;

    return () => {
      unsubs.forEach((unsubscribe) => unsubscribe());
      messagesUnsub?.();
    };
  }, [currentClass?.id, moduleKey, userProfile]);

  useEffect(() => {
    if (!userProfile) {
      setClasses([]);
      setUsers([]);
      setPayments([]);
      setGrowthEvents([]);
      return;
    }

    if (moduleKey === 'branches' && userProfile.role === 'admin') {
      void teachflowData
        .getClassesByAdmin(userProfile.uid)
        .then(setClasses)
        .catch((nextError: unknown) => setError(nextError instanceof Error ? nextError.message : 'Failed to load branches.'));
    }

    if (['overview', 'classes', 'payments', 'pricing', 'growth', 'users', 'settings'].includes(moduleKey) && userProfile.role === 'super_admin') {
      const unsubs = [
        teachflowData.subscribeToAllClasses(setClasses, (nextError) => setError(nextError.message)),
        teachflowData.subscribeToAllUsers(setUsers, (nextError) => setError(nextError.message)),
        teachflowData.subscribeToPayments(setPayments, (nextError) => setError(nextError.message)),
        teachflowData.subscribeToGrowthEvents(setGrowthEvents, (nextError) => setError(nextError.message)),
      ];

      if (moduleKey === 'pricing') {
        void teachflowData
          .getPricingSettings()
          .then(setPricing)
          .catch((nextError: unknown) => setError(nextError instanceof Error ? nextError.message : 'Failed to load pricing settings.'));
      }

      if (moduleKey === 'settings') {
        void teachflowData
          .getBillingSettings()
          .then(setBillingSettings)
          .catch((nextError: unknown) => setError(nextError instanceof Error ? nextError.message : 'Failed to load billing settings.'));
      }

      return () => unsubs.forEach((unsubscribe) => unsubscribe());
    }
  }, [moduleKey, userProfile]);

  const currentStudent = useMemo(
    () => students.find((item) => item.email.toLowerCase() === (firebaseUser?.email ?? '').toLowerCase()) ?? null,
    [firebaseUser?.email, students]
  );

  const visibleStudentIds = useMemo(() => {
    if (userProfile?.role === 'student') {
      return currentStudent ? [currentStudent.id] : [];
    }

    if (userProfile?.role === 'parent') {
      return Array.from(new Set([...(userProfile.linkedStudentIds ?? []), ...(userProfile.linkedStudentId ? [userProfile.linkedStudentId] : [])]));
    }

    return students.map((item) => item.id);
  }, [currentStudent, students, userProfile]);

  const reportSummaries = useMemo<ReportSummary[]>(() => {
    const allowed = new Set(visibleStudentIds);
    return students
      .filter((student) => allowed.size === 0 || allowed.has(student.id))
      .map((student) => {
        const studentAttendance = attendance.filter((item) => item.studentId === student.id);
        const studentMarks = marks.filter((item) => item.studentId === student.id);
        const studentFees = fees.filter((item) => item.studentId === student.id);
        const studentLectures = lectures.filter((lecture) =>
          student.batchId ? lecture.batchId === student.batchId : lecture.batch === student.batch
        );
        const attendancePercent = studentAttendance.length
          ? Math.round((studentAttendance.filter((item) => item.status === 'present').length / studentAttendance.length) * 100)
          : 0;
        const totalMarks = studentMarks.reduce((sum, item) => sum + item.totalMarks, 0);
        const obtainedMarks = studentMarks.reduce((sum, item) => sum + item.obtainedMarks, 0);
        const marksPercent = totalMarks ? Math.round((obtainedMarks / totalMarks) * 100) : 0;

        return {
          studentId: student.id,
          studentName: student.name,
          batch: student.batch,
          attendancePercent,
          marksPercent,
          feePending: studentFees.reduce((sum, item) => sum + Math.max(item.amount - item.paidAmount, 0), 0),
          lecturesCount: studentLectures.length,
        };
      })
      .sort((left, right) => left.studentName.localeCompare(right.studentName));
  }, [attendance, fees, lectures, marks, students, visibleStudentIds]);

  const analyticsSummary = useMemo(() => {
    const totalStudents = reportSummaries.length;
    const avgAttendance = totalStudents ? Math.round(reportSummaries.reduce((sum, item) => sum + item.attendancePercent, 0) / totalStudents) : 0;
    const avgMarks = totalStudents ? Math.round(reportSummaries.reduce((sum, item) => sum + item.marksPercent, 0) / totalStudents) : 0;
    const pendingFees = reportSummaries.reduce((sum, item) => sum + item.feePending, 0);
    const upcomingLectures = lectures.filter((lecture) => new Date(`${lecture.date}T${lecture.time}`).getTime() >= Date.now()).length;
    return {
      totalStudents,
      avgAttendance,
      avgMarks,
      pendingFees,
      upcomingLectures,
      needsAttention: reportSummaries.filter((item) => item.attendancePercent < 75 || item.marksPercent < 45 || item.feePending > 0),
      topPerformers: [...reportSummaries].sort((left, right) => right.marksPercent - left.marksPercent).slice(0, 5),
    };
  }, [lectures, reportSummaries]);

  const recipientOptions = useMemo(() => classUsers.filter((item) => item.id !== userProfile?.uid), [classUsers, userProfile?.uid]);
  const pendingApprovals = useMemo(() => classUsers.filter((item) => item.approved === false), [classUsers]);
  const revenueMetrics = useMemo(() => paymentService.getRevenueMetrics(payments), [payments]);
  const failedPayments = useMemo(() => payments.filter((payment) => ['failed', 'expired', 'cancelled', 'retry_requested'].includes(payment.status)), [payments]);

  const handleAction = async (task: () => Promise<void>, key: string, successMessage: string) => {
    setBusyKey(key);
    setError('');
    setSuccess('');
    try {
      await task();
      setSuccess(successMessage);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Action failed.');
    } finally {
      setBusyKey('');
    }
  };

  const handleSaveClassSettings = async () => {
    if (!currentClass?.id) return;
    await handleAction(
      async () => {
        await teachflowData.updateClassSettings(currentClass.id, settingsDraft);
        await refreshAuthData();
      },
      'save-settings',
      'Class settings updated.'
    );
  };

  const handleSendMessage = async () => {
    if (!currentClass?.id || !userProfile || !compose.toUserId.trim() || !compose.message.trim()) return;

    await handleAction(
      async () => {
        const target = recipientOptions.find((item) => item.id === compose.toUserId.trim());
        await teachflowData.createMessage({
          classId: currentClass.id,
          fromUserId: userProfile.uid,
          fromUserName: userProfile.name,
          fromRole: userProfile.role,
          toUserId: compose.toUserId.trim(),
          toRole: target?.role,
          subject: compose.subject.trim(),
          message: compose.message.trim(),
        });
        setCompose({ toUserId: '', subject: '', message: '' });
      },
      'send-message',
      'Message sent.'
    );
  };

  const handleApproveUser = async (user: AppUser) => {
    if (!currentClass?.id) return;
    const firstBatch = batches[0];
    await handleAction(
      async () => {
        await teachflowData.approvePendingUser({
          userId: user.id,
          classId: currentClass.id,
          role: user.role,
          batchId: user.role === 'student' || user.role === 'teacher' ? firstBatch?.id : undefined,
          batchName: user.role === 'student' || user.role === 'teacher' ? firstBatch?.name ?? 'Batch A' : undefined,
          linkedStudentIds: user.role === 'parent' ? visibleStudentIds : undefined,
        });
      },
      `approve:${user.id}`,
      `${user.name} approved.`
    );
  };

  const renderMessages = () => (
    <>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Compose</Text>
        <InputField label="Recipient ID" value={compose.toUserId} onChangeText={(value) => setCompose((prev) => ({ ...prev, toUserId: value }))} placeholder="Enter user id" />
        <InputField label="Subject" value={compose.subject} onChangeText={(value) => setCompose((prev) => ({ ...prev, subject: value }))} placeholder="General update" />
        <InputField
          label="Message"
          value={compose.message}
          onChangeText={(value) => setCompose((prev) => ({ ...prev, message: value }))}
          placeholder="Write your message"
          multiline
        />
        <Pressable onPress={() => void handleSendMessage()} style={styles.primaryButton}>
          <Text style={styles.primaryButtonText}>{busyKey === 'send-message' ? 'Sending...' : 'Send Message'}</Text>
        </Pressable>
        {recipientOptions.length > 0 ? (
          <View style={styles.chipWrap}>
            {recipientOptions.slice(0, 12).map((user) => (
              <Pressable key={user.id} onPress={() => setCompose((prev) => ({ ...prev, toUserId: user.id }))} style={styles.chip}>
                <Text style={styles.chipText}>{user.name} ({roleLabel(user.role)})</Text>
              </Pressable>
            ))}
          </View>
        ) : null}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Conversation List</Text>
        {messages.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyText}>No messages yet.</Text>
          </View>
        ) : (
          messages.map((message) => (
            <View key={message.id} style={styles.card}>
              <Text style={styles.cardTitle}>{message.subject || 'General message'}</Text>
              <Text style={styles.cardText}>{message.message}</Text>
              <Text style={styles.metaText}>
                From {message.fromUserName} to {message.toUserId} • {message.status.toUpperCase()} • {formatDateTime(message.createdAt)}
              </Text>
            </View>
          ))
        )}
      </View>
    </>
  );

  const renderReports = () => (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Report Summary</Text>
      {reportSummaries.length === 0 ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyText}>No student report data available yet.</Text>
        </View>
      ) : (
        reportSummaries.map((report) => (
          <View key={report.studentId} style={styles.card}>
            <Text style={styles.cardTitle}>{report.studentName}</Text>
            <Text style={styles.cardText}>Batch: {report.batch}</Text>
            <Text style={styles.cardText}>Attendance: {report.attendancePercent}%</Text>
            <Text style={styles.cardText}>Marks: {report.marksPercent}%</Text>
            <Text style={styles.cardText}>Pending Fees: {formatCurrency(report.feePending)}</Text>
            <Text style={styles.metaText}>Lectures tracked: {report.lecturesCount}</Text>
          </View>
        ))
      )}
    </View>
  );

  const renderAnalytics = () => (
    <>
      <View style={styles.grid}>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{analyticsSummary.totalStudents}</Text>
          <Text style={styles.statLabel}>Students</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{analyticsSummary.avgAttendance}%</Text>
          <Text style={styles.statLabel}>Avg Attendance</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{analyticsSummary.avgMarks}%</Text>
          <Text style={styles.statLabel}>Avg Marks</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{formatCurrency(analyticsSummary.pendingFees)}</Text>
          <Text style={styles.statLabel}>Pending Fees</Text>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Top Performers</Text>
        {analyticsSummary.topPerformers.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyText}>No performance records yet.</Text>
          </View>
        ) : (
          analyticsSummary.topPerformers.map((student) => (
            <View key={student.studentId} style={styles.card}>
              <Text style={styles.cardTitle}>{student.studentName}</Text>
              <Text style={styles.cardText}>Marks: {student.marksPercent}%</Text>
              <Text style={styles.metaText}>Attendance: {student.attendancePercent}%</Text>
            </View>
          ))
        )}
      </View>
    </>
  );

  const renderAiInsights = () => (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Attention List</Text>
      {analyticsSummary.needsAttention.length === 0 ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyText}>No at-risk students right now.</Text>
        </View>
      ) : (
        analyticsSummary.needsAttention.map((student) => (
          <View key={student.studentId} style={styles.card}>
            <Text style={styles.cardTitle}>{student.studentName}</Text>
            <Text style={styles.cardText}>Attendance: {student.attendancePercent}%</Text>
            <Text style={styles.cardText}>Marks: {student.marksPercent}%</Text>
            <Text style={styles.cardText}>Pending Fees: {formatCurrency(student.feePending)}</Text>
          </View>
        ))
      )}
    </View>
  );

  const renderBranches = () => (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Class Branches</Text>
      {(classes.length === 0 ? (currentClass ? [currentClass] : []) : classes).map((item) => (
        <View key={item.id} style={styles.card}>
          <Text style={styles.cardTitle}>{item.name}</Text>
          <Text style={styles.cardText}>Plan: {item.plan.toUpperCase()}</Text>
          <Text style={styles.cardText}>Subdomain: {item.subdomain || 'Not set'}</Text>
          <Text style={styles.metaText}>Expiry: {formatDate(item.planExpiry)}</Text>
        </View>
      ))}
    </View>
  );

  const renderApprovals = () => (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Pending Approvals</Text>
      {pendingApprovals.length === 0 ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyText}>No pending users right now.</Text>
        </View>
      ) : (
        pendingApprovals.map((user) => (
          <View key={user.id} style={styles.card}>
            <Text style={styles.cardTitle}>{user.name}</Text>
            <Text style={styles.cardText}>{user.email}</Text>
            <Text style={styles.metaText}>Requested role: {roleLabel(user.role)}</Text>
            <View style={styles.inlineActions}>
              <Pressable onPress={() => void handleApproveUser(user)} style={styles.primaryInlineButton}>
                <Text style={styles.primaryInlineButtonText}>{busyKey === `approve:${user.id}` ? 'Approving...' : 'Approve'}</Text>
              </Pressable>
              <Pressable
                onPress={() =>
                  void handleAction(() => teachflowData.rejectUser(user.id, currentClass!.id), `reject:${user.id}`, `${user.name} rejected.`)
                }
                style={styles.secondaryInlineButton}
              >
                <Text style={styles.secondaryInlineButtonText}>{busyKey === `reject:${user.id}` ? 'Rejecting...' : 'Reject'}</Text>
              </Pressable>
            </View>
          </View>
        ))
      )}
    </View>
  );

  const renderClassSettings = () => (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>Registration & Access</Text>
      <View style={styles.inlineRow}>
        <Text style={styles.cardText}>Allow self registration</Text>
        <Pressable
          onPress={() => setSettingsDraft((prev) => ({ ...prev, allowSelfRegistration: !prev.allowSelfRegistration }))}
          style={styles.chip}
        >
          <Text style={styles.chipText}>{settingsDraft.allowSelfRegistration ? 'ON' : 'OFF'}</Text>
        </Pressable>
      </View>
      <View style={styles.inlineRow}>
        <Text style={styles.cardText}>Require approval</Text>
        <Pressable onPress={() => setSettingsDraft((prev) => ({ ...prev, requireApproval: !prev.requireApproval }))} style={styles.chip}>
          <Text style={styles.chipText}>{settingsDraft.requireApproval ? 'ON' : 'OFF'}</Text>
        </Pressable>
      </View>
      <Pressable onPress={() => void handleSaveClassSettings()} style={styles.primaryButton}>
        <Text style={styles.primaryButtonText}>{busyKey === 'save-settings' ? 'Saving...' : 'Save Settings'}</Text>
      </Pressable>
    </View>
  );

  const renderOverview = () => (
    <>
      <View style={styles.grid}>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{classes.length}</Text>
          <Text style={styles.statLabel}>Classes</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{users.length}</Text>
          <Text style={styles.statLabel}>Users</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{revenueMetrics.paidCount}</Text>
          <Text style={styles.statLabel}>Paid</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{formatCurrency(revenueMetrics.revenue / 100)}</Text>
          <Text style={styles.statLabel}>Revenue</Text>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Recent Growth</Text>
        {growthEvents.slice(0, 8).map((event) => (
          <View key={event.id} style={styles.card}>
            <Text style={styles.cardTitle}>{event.label}</Text>
            <Text style={styles.cardText}>{event.type}</Text>
            <Text style={styles.metaText}>{formatDateTime(event.createdAt)}</Text>
          </View>
        ))}
        {growthEvents.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyText}>No growth events recorded yet.</Text>
          </View>
        ) : null}
      </View>
    </>
  );

  const renderClasses = () => (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Platform Classes</Text>
      {classes.map((item) => (
        <View key={item.id} style={styles.card}>
          <Text style={styles.cardTitle}>{item.name}</Text>
          <Text style={styles.cardText}>Plan: {item.plan.toUpperCase()}</Text>
          <Text style={styles.cardText}>Status: {item.isActive ? 'Active' : 'Inactive'}</Text>
          <Text style={styles.metaText}>Plan Expiry: {formatDate(item.planExpiry)}</Text>
          <View style={styles.inlineActions}>
            <Pressable
              onPress={() =>
                void handleAction(() => teachflowData.setClassActiveState(item.id, !item.isActive), `class:${item.id}:state`, `${item.name} updated.`)
              }
              style={styles.secondaryInlineButton}
            >
              <Text style={styles.secondaryInlineButtonText}>{item.isActive ? 'Suspend' : 'Activate'}</Text>
            </Pressable>
            <Pressable
              onPress={() =>
                void handleAction(() => teachflowData.extendClassPlan(item.id, 7), `class:${item.id}:extend`, `${item.name} extended by 7 days.`)
              }
              style={styles.primaryInlineButton}
            >
              <Text style={styles.primaryInlineButtonText}>+7 Days</Text>
            </Pressable>
          </View>
        </View>
      ))}
      {classes.length === 0 ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyText}>No classes available.</Text>
        </View>
      ) : null}
    </View>
  );

  const renderUsers = () => (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Platform Users</Text>
      {users.map((user) => (
        <View key={user.id} style={styles.card}>
          <Text style={styles.cardTitle}>{user.name}</Text>
          <Text style={styles.cardText}>{user.email}</Text>
          <Text style={styles.metaText}>
            {roleLabel(user.role)} • {user.approved ? 'Approved' : 'Pending'}
          </Text>
          <View style={styles.inlineActions}>
            <Pressable
              onPress={() =>
                void handleAction(
                  () => teachflowData.updateUserAdminState(user.id, { approved: !user.approved }),
                  `user:${user.id}:approve`,
                  `${user.name} updated.`
                )
              }
              style={styles.secondaryInlineButton}
            >
              <Text style={styles.secondaryInlineButtonText}>{user.approved ? 'Disable' : 'Approve'}</Text>
            </Pressable>
          </View>
        </View>
      ))}
      {users.length === 0 ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyText}>No users found.</Text>
        </View>
      ) : null}
    </View>
  );

  const renderPayments = () => (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Payment Control</Text>
      {payments.map((payment) => (
        <View key={payment.id} style={styles.card}>
          <Text style={styles.cardTitle}>{payment.orderId}</Text>
          <Text style={styles.cardText}>
            {payment.plan.toUpperCase()} • {payment.status.toUpperCase()}
          </Text>
          <Text style={styles.cardText}>{formatCurrency(payment.amount / 100)}</Text>
          <Text style={styles.metaText}>{formatDateTime(payment.createdAt)}</Text>
          {['failed', 'expired', 'cancelled', 'retry_requested'].includes(payment.status) ? (
            <Pressable
              onPress={() =>
                void handleAction(() => paymentService.managePayment(payment.id, 'retry').then(() => undefined), `retry:${payment.id}`, `Retry requested for ${payment.orderId}.`)
              }
              style={styles.primaryInlineButton}
            >
              <Text style={styles.primaryInlineButtonText}>{busyKey === `retry:${payment.id}` ? 'Retrying...' : 'Retry Payment'}</Text>
            </Pressable>
          ) : null}
        </View>
      ))}
      {payments.length === 0 ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyText}>No payments recorded yet.</Text>
        </View>
      ) : null}
    </View>
  );

  const renderGrowth = () => (
    <>
      <View style={styles.grid}>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{growthEvents.length}</Text>
          <Text style={styles.statLabel}>Events</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{failedPayments.length}</Text>
          <Text style={styles.statLabel}>Failures</Text>
        </View>
      </View>
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Growth Timeline</Text>
        {growthEvents.map((event) => (
          <View key={event.id} style={styles.card}>
            <Text style={styles.cardTitle}>{event.label}</Text>
            <Text style={styles.cardText}>{event.type}</Text>
            {event.amount != null ? <Text style={styles.cardText}>Amount: {formatCurrency(event.amount)}</Text> : null}
            <Text style={styles.metaText}>{formatDateTime(event.createdAt)}</Text>
          </View>
        ))}
        {growthEvents.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyText}>No growth events yet.</Text>
          </View>
        ) : null}
      </View>
    </>
  );

  const renderPricing = () => (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>Pricing Settings</Text>
      <InputField label="Currency" value={pricing.currency} onChangeText={(value) => setPricing((prev) => ({ ...prev, currency: value.toUpperCase() }))} placeholder="INR" />
      <InputField
        label="Standard Monthly Price"
        value={String(pricing.standardMonthlyPrice)}
        onChangeText={(value) => setPricing((prev) => ({ ...prev, standardMonthlyPrice: safeNumber(value, prev.standardMonthlyPrice) }))}
        placeholder="399"
        keyboardType="numeric"
      />
      <InputField
        label="Pro Monthly Price"
        value={String(pricing.proMonthlyPrice)}
        onChangeText={(value) => setPricing((prev) => ({ ...prev, proMonthlyPrice: safeNumber(value, prev.proMonthlyPrice) }))}
        placeholder="999"
        keyboardType="numeric"
      />
      <Pressable
        onPress={() =>
          void handleAction(
            () => teachflowData.updatePricingSettings(pricing).then(() => undefined),
            'save-pricing',
            'Pricing updated.'
          )
        }
        style={styles.primaryButton}
      >
        <Text style={styles.primaryButtonText}>{busyKey === 'save-pricing' ? 'Saving...' : 'Save Pricing'}</Text>
      </Pressable>
    </View>
  );

  const renderBillingSettings = () => (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>Billing Settings</Text>
      <InputField
        label="Standard Subscription Plan ID"
        value={billingSettings.standardSubscriptionPlanId}
        onChangeText={(value) => setBillingSettings((prev) => ({ ...prev, standardSubscriptionPlanId: value }))}
        placeholder="plan_standard"
      />
      <InputField
        label="Pro Subscription Plan ID"
        value={billingSettings.proSubscriptionPlanId}
        onChangeText={(value) => setBillingSettings((prev) => ({ ...prev, proSubscriptionPlanId: value }))}
        placeholder="plan_pro"
      />
      <InputField label="Company Name" value={billingSettings.companyName} onChangeText={(value) => setBillingSettings((prev) => ({ ...prev, companyName: value }))} placeholder="TeachFlow Pvt Ltd" />
      <InputField
        label="Company Address"
        value={billingSettings.companyAddress}
        onChangeText={(value) => setBillingSettings((prev) => ({ ...prev, companyAddress: value }))}
        placeholder="Address"
        multiline
      />
      <InputField label="GST Number" value={billingSettings.gstNumber} onChangeText={(value) => setBillingSettings((prev) => ({ ...prev, gstNumber: value }))} placeholder="GSTIN" />
      <Pressable
        onPress={() =>
          void handleAction(
            () => teachflowData.updateBillingSettings(billingSettings).then(() => undefined),
            'save-billing',
            'Billing settings updated.'
          )
        }
        style={styles.primaryButton}
      >
        <Text style={styles.primaryButtonText}>{busyKey === 'save-billing' ? 'Saving...' : 'Save Billing Settings'}</Text>
      </Pressable>
    </View>
  );

  const renderModuleBody = () => {
    if (!userProfile) {
      return (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyText}>Profile not loaded yet.</Text>
        </View>
      );
    }

    switch (moduleKey) {
      case 'messages':
        return renderMessages();
      case 'reports':
        return renderReports();
      case 'analytics':
        return renderAnalytics();
      case 'ai':
        return renderAiInsights();
      case 'branches':
        return renderBranches();
      case 'approvals':
        return renderApprovals();
      case 'settings':
        return userProfile.role === 'super_admin' ? renderBillingSettings() : renderClassSettings();
      case 'overview':
        return renderOverview();
      case 'classes':
        return renderClasses();
      case 'users':
        return renderUsers();
      case 'payments':
        return renderPayments();
      case 'growth':
        return renderGrowth();
      case 'pricing':
        return renderPricing();
      default:
        return (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyText}>This dashboard page is now wired, but this module does not need extra content yet.</Text>
          </View>
        );
    }
  };

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.subtitle}>{subtitle}</Text>
        {currentClass ? <Text style={styles.contextText}>Workspace: {currentClass.name}</Text> : null}

        {error ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}
        {success ? (
          <View style={styles.successBox}>
            <Text style={styles.successText}>{success}</Text>
          </View>
        ) : null}

        {renderModuleBody()}
      </ScrollView>
    </Screen>
  );
};

const styles = StyleSheet.create({
  content: { padding: 16, gap: 14 },
  title: { fontSize: 28, fontWeight: '700', color: '#111827' },
  subtitle: { fontSize: 14, color: '#6b7280' },
  contextText: { fontSize: 13, color: '#2563eb', fontWeight: '600' },
  section: { gap: 10 },
  sectionTitle: { fontSize: 18, fontWeight: '700', color: '#111827' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  statCard: { width: '48%', borderRadius: 12, backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#e5e7eb', padding: 14, gap: 6 },
  statValue: { fontSize: 22, fontWeight: '700', color: '#111827' },
  statLabel: { fontSize: 12, color: '#6b7280', textTransform: 'uppercase' },
  card: { borderRadius: 12, borderWidth: 1, borderColor: '#e5e7eb', backgroundColor: '#ffffff', padding: 14, gap: 8 },
  cardTitle: { fontSize: 16, fontWeight: '700', color: '#111827' },
  cardText: { fontSize: 14, color: '#4b5563' },
  metaText: { fontSize: 12, color: '#6b7280' },
  emptyCard: { borderRadius: 12, borderWidth: 1, borderColor: '#e5e7eb', backgroundColor: '#ffffff', padding: 14 },
  emptyText: { fontSize: 14, color: '#6b7280' },
  field: { gap: 6 },
  fieldLabel: { fontSize: 13, fontWeight: '600', color: '#374151' },
  input: { borderWidth: 1, borderColor: '#d1d5db', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, color: '#111827', backgroundColor: '#ffffff' },
  inputMultiline: { minHeight: 96, textAlignVertical: 'top' },
  primaryButton: { marginTop: 4, borderRadius: 10, backgroundColor: '#2563eb', paddingVertical: 12, alignItems: 'center' },
  primaryButtonText: { color: '#ffffff', fontWeight: '700' },
  inlineActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  primaryInlineButton: { borderRadius: 10, backgroundColor: '#2563eb', paddingHorizontal: 12, paddingVertical: 9 },
  primaryInlineButtonText: { color: '#ffffff', fontWeight: '700' },
  secondaryInlineButton: { borderRadius: 10, backgroundColor: '#eff6ff', paddingHorizontal: 12, paddingVertical: 9 },
  secondaryInlineButtonText: { color: '#1d4ed8', fontWeight: '700' },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 6 },
  chip: { borderRadius: 999, backgroundColor: '#f3f4f6', paddingHorizontal: 12, paddingVertical: 8 },
  chipText: { fontSize: 12, color: '#374151', fontWeight: '600' },
  inlineRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  errorBox: { borderRadius: 10, backgroundColor: '#fee2e2', padding: 12 },
  errorText: { color: '#b91c1c', fontWeight: '600' },
  successBox: { borderRadius: 10, backgroundColor: '#dcfce7', padding: 12 },
  successText: { color: '#166534', fontWeight: '600' },
});
