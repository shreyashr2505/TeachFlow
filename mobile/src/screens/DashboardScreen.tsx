import React, { useEffect, useMemo, useState } from 'react';
import { FlatList, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import { teachflowService } from '../services/teachflow';
import { Batch, Fee, Lecture, Marks, Student, Teacher } from '../types';
import { getFeatureTabs } from '../utils/features';
import { canAccessFeature } from '../utils/plan';
import { Body, Card, ChipRow, EmptyBox, MetricLabel, MetricValue, Pill, PillText, PressCard, Row, Screen, ScrollContent, SectionTitle, SpaceBetween, Tiny, Title } from '../components/ui';
import { colors, radius, spacing } from '../theme';

type DashboardStat = {
  label: string;
  value: string | number;
  tone?: 'accent' | 'success' | 'warning' | 'danger';
  icon: keyof typeof Feather.glyphMap;
};

const StatCard = ({ stat }: { stat: DashboardStat }) => (
  <Card style={{ flex: 1, minWidth: '48%' }}>
    <SpaceBetween style={{ alignItems: 'flex-start' }}>
      <View style={{ flex: 1 }}>
        <MetricLabel>{stat.label}</MetricLabel>
        <MetricValue style={{ marginTop: 10 }}>{stat.value}</MetricValue>
      </View>
      <View
        style={{
          padding: 12,
          borderRadius: radius.md,
          backgroundColor:
            stat.tone === 'success'
              ? 'rgba(34,197,94,0.15)'
              : stat.tone === 'warning'
                ? 'rgba(245,158,11,0.15)'
                : stat.tone === 'danger'
                  ? 'rgba(239,68,68,0.15)'
                  : 'rgba(59,130,246,0.15)',
        }}
      >
        <Feather
          name={stat.icon}
          size={18}
          color={
            stat.tone === 'success'
              ? '#86efac'
              : stat.tone === 'warning'
                ? '#fcd34d'
                : stat.tone === 'danger'
                  ? '#fca5a5'
                  : '#93c5fd'
          }
        />
      </View>
    </SpaceBetween>
  </Card>
);

const QuickAction = ({ label, icon, onPress }: { label: string; icon: keyof typeof Feather.glyphMap; onPress: () => void }) => (
  <PressCard onPress={onPress}>
    <View
      style={{
        width: 110,
        padding: 14,
        borderRadius: 18,
        backgroundColor: colors.surface,
        borderWidth: 1,
        borderColor: colors.border,
      }}
    >
      <View style={{ width: 40, height: 40, borderRadius: 14, backgroundColor: 'rgba(59,130,246,0.14)', alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
        <Feather name={icon} size={18} color="#93c5fd" />
      </View>
      <Body style={{ color: colors.text, fontWeight: '700' }}>{label}</Body>
    </View>
  </PressCard>
);

export const DashboardScreen: React.FC<{ onNavigate: (feature: string) => void }> = ({ onNavigate }) => {
  const { user, currentClass, planSettings } = useAuth();
  const [students, setStudents] = useState<Student[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [lectures, setLectures] = useState<Lecture[]>([]);
  const [marks, setMarks] = useState<Marks[]>([]);
  const [fees, setFees] = useState<Fee[]>([]);

  useEffect(() => {
    if (!currentClass?.id) return;
    const unsubStudents = teachflowService.subscribeToStudents(currentClass.id, (data) => setStudents(data as Student[]));
    const unsubTeachers = teachflowService.subscribeToTeachers(currentClass.id, (data) => setTeachers(data as Teacher[]));
    const unsubBatches = teachflowService.subscribeToBatches(currentClass.id, (data) => setBatches(data as Batch[]));
    const unsubLectures = teachflowService.subscribeToLectures(currentClass.id, (data) => setLectures(data as Lecture[]));
    const unsubMarks = teachflowService.subscribeToMarks(currentClass.id, (data) => setMarks(data as Marks[]));
    const unsubFees = teachflowService.subscribeToFees(currentClass.id, (data) => setFees(data as Fee[]));
    return () => {
      unsubStudents();
      unsubTeachers();
      unsubBatches();
      unsubLectures();
      unsubMarks();
      unsubFees();
    };
  }, [currentClass?.id]);

  const myStudent = useMemo(() => students.find((item) => item.id === user?.id) ?? null, [students, user?.id]);
  const linkedStudents = useMemo(() => {
    const ids = user?.linkedStudentIds ?? (user?.linkedStudentId ? [user.linkedStudentId] : []);
    return students.filter((item) => ids.includes(item.id));
  }, [students, user?.linkedStudentId, user?.linkedStudentIds]);
  const teacherRecord = useMemo(() => teachers.find((item) => item.id === user?.id) ?? null, [teachers, user?.id]);
  const pendingFees = Math.max((myStudent?.totalFees ?? 0) - (myStudent?.paidFees ?? 0), 0);

  const stats: DashboardStat[] =
    user?.role === 'super_admin'
      ? [
          { label: 'Classes', value: 0, icon: 'home', tone: 'accent' },
          { label: 'Users', value: 0, icon: 'users', tone: 'success' },
          { label: 'Payments', value: 0, icon: 'credit-card', tone: 'warning' },
          { label: 'Growth', value: 0, icon: 'trending-up', tone: 'danger' },
        ]
      : user?.role === 'teacher'
        ? [
            { label: 'My Batches', value: teacherRecord?.batches.length ?? 0, icon: 'calendar', tone: 'accent' },
            { label: 'My Students', value: students.filter((item) => (teacherRecord?.batchIds ?? []).includes(item.batchId ?? '') || (teacherRecord?.batches ?? []).includes(item.batch)).length, icon: 'users', tone: 'success' },
            { label: 'Lectures', value: lectures.length, icon: 'book-open', tone: 'warning' },
            { label: 'Subjects', value: teacherRecord?.subjects.length ?? 0, icon: 'book', tone: 'danger' },
          ]
        : user?.role === 'student'
          ? [
              { label: 'Batch', value: myStudent?.batch ?? '-', icon: 'layers', tone: 'accent' },
              { label: 'Fee Status', value: myStudent?.feeStatus ?? '-', icon: 'dollar-sign', tone: 'warning' },
              { label: 'Paid Fees', value: myStudent?.paidFees ?? 0, icon: 'check-circle', tone: 'success' },
              { label: 'Pending', value: pendingFees, icon: 'alert-circle', tone: 'danger' },
            ]
          : user?.role === 'parent'
            ? [
                { label: 'Children', value: linkedStudents.length, icon: 'users', tone: 'accent' },
                { label: 'Attendance', value: `${0}%`, icon: 'check-circle', tone: 'success' },
                { label: 'Marks Avg', value: `${0}%`, icon: 'bar-chart-2', tone: 'warning' },
                { label: 'Pending Fees', value: pendingFees, icon: 'dollar-sign', tone: 'danger' },
              ]
            : [
                { label: 'Students', value: students.length, icon: 'users', tone: 'accent' },
                { label: 'Teachers', value: teachers.length, icon: 'user-check', tone: 'success' },
                { label: 'Batches', value: batches.length, icon: 'layers', tone: 'warning' },
                { label: 'Lectures', value: lectures.length, icon: 'calendar', tone: 'danger' },
              ];

  const tabs = getFeatureTabs(user?.role ?? null, currentClass?.plan, (feature) => {
    if (!currentClass) return true;
    return canAccessFeature(feature, currentClass.plan, planSettings);
  });

  const quickActions = useMemo(
    () =>
      tabs
        .filter((item) => item.id !== 'dashboard')
        .slice(0, 6)
        .map((item) => ({
          id: item.id,
          label: item.shortLabel,
          icon:
            item.id === 'students'
              ? 'users'
              : item.id === 'teachers'
                ? 'user-check'
                : item.id === 'batches'
                  ? 'layers'
                  : item.id === 'lectures'
                    ? 'calendar'
                    : item.id === 'attendance'
                      ? 'check-circle'
                      : item.id === 'marks'
                        ? 'bar-chart-2'
                        : item.id === 'fees'
                          ? 'credit-card'
                          : item.id === 'messages'
                            ? 'message-circle'
                            : item.id === 'reports'
                              ? 'file-text'
                              : item.id === 'analytics'
                                ? 'pie-chart'
                                : item.id === 'ai'
                                  ? 'cpu'
                                  : item.id === 'branches'
                                    ? 'home'
                                    : 'settings',
        })),
    [tabs]
  );

  const recentLectures = lectures.slice(0, 3);

  return (
    <Screen>
      <ScrollContent>
        <HeroCard style={{ marginBottom: spacing.md }}>
          <Pill tone="accent">
            <PillText tone="accent">{user?.role?.replace('_', ' ')}</PillText>
          </Pill>
          <Title style={{ marginTop: 14 }}>{currentClass?.name ?? 'TeachFlow'}</Title>
          <Body style={{ marginTop: 8 }}>
            {user?.name ? `Welcome back, ${user.name}.` : 'A premium mobile workspace for your coaching operations.'}
          </Body>
          {currentClass ? <Tiny style={{ marginTop: 10, color: '#93c5fd' }}>{currentClass.subdomain}</Tiny> : null}
        </HeroCard>

        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: spacing.md }}>
          {stats.map((stat) => (
            <StatCard key={stat.label} stat={stat} />
          ))}
        </View>

        <Card style={{ marginBottom: spacing.md }}>
          <SpaceBetween style={{ marginBottom: 14 }}>
            <SectionTitle>Quick Actions</SectionTitle>
            <Feather name="arrow-right" size={18} color={colors.textMuted} />
          </SpaceBetween>
          <FlatList
            data={quickActions}
            keyExtractor={(item) => item.id}
            horizontal
            showsHorizontalScrollIndicator={false}
            ItemSeparatorComponent={() => <View style={{ width: 12 }} />}
            renderItem={({ item }) => <QuickAction label={item.label} icon={item.icon as keyof typeof Feather.glyphMap} onPress={() => onNavigate(item.id)} />}
          />
        </Card>

        {user?.role === 'student' || user?.role === 'parent' ? (
          <Card style={{ marginBottom: spacing.md }}>
            <SectionTitle>Performance Snapshot</SectionTitle>
            <View style={{ height: 12 }} />
            <ChipRow>
              <Pill tone="success">
                <PillText tone="success">Attendance {0}%</PillText>
              </Pill>
              <Pill tone="warning">
                <PillText tone="warning">Marks {0}%</PillText>
              </Pill>
              <Pill tone="danger">
                <PillText tone="danger">Pending Fees {pendingFees}</PillText>
              </Pill>
            </ChipRow>
          </Card>
        ) : null}

        <Card style={{ marginBottom: spacing.md }}>
          <SpaceBetween style={{ marginBottom: 14 }}>
            <SectionTitle>Upcoming Lectures</SectionTitle>
            <Body>{recentLectures.length} items</Body>
          </SpaceBetween>
          {recentLectures.length === 0 ? (
            <EmptyBox>
              <Body>No lectures yet.</Body>
            </EmptyBox>
          ) : (
            recentLectures.map((lecture) => (
              <View key={lecture.id} style={{ paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border }}>
                <SpaceBetween style={{ alignItems: 'flex-start' }}>
                  <View style={{ flex: 1, paddingRight: 12 }}>
                    <Body style={{ color: colors.text, fontWeight: '700' }}>{lecture.title}</Body>
                    <Body style={{ marginTop: 4 }}>
                      {lecture.subject} {lecture.teacherName ? `· ${lecture.teacherName}` : ''}
                    </Body>
                    <Tiny style={{ marginTop: 6 }}>{lecture.batchName ?? lecture.batch}</Tiny>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Tiny>{new Date(lecture.date).toLocaleDateString()}</Tiny>
                    <Tiny>{lecture.time}</Tiny>
                  </View>
                </SpaceBetween>
              </View>
            ))
          )}
        </Card>

        {user?.role === 'admin' ? (
          <Card>
            <SectionTitle>Class Health</SectionTitle>
            <View style={{ height: 10 }} />
            <Body>Students {students.length} · Teachers {teachers.length} · Fees records {fees.length} · Marks {marks.length}</Body>
          </Card>
        ) : null}
      </ScrollContent>
    </Screen>
  );
};
