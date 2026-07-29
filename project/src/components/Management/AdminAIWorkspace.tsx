import React, { useEffect, useMemo, useState } from 'react';
import { BarChart3, Bot, Copy, FileText, Lightbulb, MessageSquare, Sparkles, UserSearch } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { aiService } from '../../services/aiService';
import { firebaseService } from '../../services/firebaseService';
import EmptyState from '../Common/EmptyState';
import FeedbackMessage from '../Common/FeedbackMessage';
import StyledSelect from '../Common/StyledSelect';
import UpgradeCard from '../Common/UpgradeCard';
import { AIUsageLog, Attendance, Marks, Student } from '../../types';
import { AIResponseKind, buildAISections } from '../../utils/aiContent';
import { canAccessFeature, formatPlanName } from '../../utils/plan';
import { requestDashboardTabNavigation } from '../../utils/dashboardNavigation';

const currentMonthKey = new Date().toISOString().slice(0, 7);
const monthlyLimit = Number(import.meta.env.VITE_AI_MONTHLY_TOKEN_LIMIT ?? '200000');

const AISectionCard: React.FC<{ title: string; items: string[] }> = ({ title, items }) => (
  <div className="rounded-2xl border border-slate-200 bg-slate-900/95 p-5 text-white shadow-lg transition-all duration-200 hover:scale-[1.01]">
    <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-200">{title}</h3>
    <div className="mt-3 space-y-3 text-sm leading-7 text-slate-300">
      {items.map((item, index) => (
        <p key={`${title}-${index}`}>{item}</p>
      ))}
    </div>
  </div>
);

const AISkeletonOutput: React.FC = () => (
  <div className="mt-4 space-y-4">
    {[0, 1, 2].map((index) => (
      <div key={index} className="animate-pulse rounded-2xl border border-slate-200 bg-slate-900/95 p-5 shadow-lg">
        <div className="h-4 w-32 rounded bg-slate-700" />
        <div className="mt-4 space-y-3">
          <div className="h-3 w-full rounded bg-slate-700" />
          <div className="h-3 w-11/12 rounded bg-slate-700" />
          <div className="h-3 w-9/12 rounded bg-slate-700" />
        </div>
      </div>
    ))}
  </div>
);

const StructuredAIOutput: React.FC<{ value: string; kind: AIResponseKind; emptyLabel: string; loading?: boolean }> = ({ value, kind, emptyLabel, loading = false }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    if (!value) return;
    await navigator.clipboard.writeText(value);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  };

  if (loading) {
    return <AISkeletonOutput />;
  }

  if (!value) {
    return <div className="rounded-xl bg-gray-50 p-4 text-sm text-gray-700">{emptyLabel}</div>;
  }

  const sections = buildAISections(value, kind);
  return (
    <div className="mt-4 space-y-4">
      <div className="flex justify-end">
        <button
          onClick={() => void handleCopy()}
          className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
        >
          <Copy className="h-4 w-4" />
          <span>{copied ? 'Copied' : 'Copy'}</span>
        </button>
      </div>
      {sections.map((section) => (
        <AISectionCard key={`${kind}-${section.title}`} title={section.title} items={section.items} />
      ))}
    </div>
  );
};

const AdminAIWorkspace: React.FC = () => {
  const { user, currentClass } = useAuth();
  const [students, setStudents] = useState<Student[]>([]);
  const [attendance, setAttendance] = useState<Attendance[]>([]);
  const [marks, setMarks] = useState<Marks[]>([]);
  const [usageLogs, setUsageLogs] = useState<AIUsageLog[]>([]);
  const [selectedStudentId, setSelectedStudentId] = useState('');
  const [chatQuery, setChatQuery] = useState('');
  const [classAnalytics, setClassAnalytics] = useState('');
  const [studentAnalysis, setStudentAnalysis] = useState('');
  const [improvementPlan, setImprovementPlan] = useState('');
  const [chatAnswer, setChatAnswer] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [activeAction, setActiveAction] = useState('');
  const [limiterTick, setLimiterTick] = useState(0);

  useEffect(() => {
    if (!currentClass?.id) return;
    const unsubs = [
      firebaseService.subscribeToStudents(currentClass.id, setStudents, (err) => setError(err.message)),
      firebaseService.subscribeToAttendance(currentClass.id, setAttendance, (err) => setError(err.message)),
      firebaseService.subscribeToMarks(currentClass.id, setMarks, (err) => setError(err.message)),
      firebaseService.subscribeToAIUsageForMonth(currentClass.id, currentMonthKey, setUsageLogs, (err) => setError(err.message)),
    ];
    return () => unsubs.forEach((unsubscribe) => unsubscribe());
  }, [currentClass?.id]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setLimiterTick((value) => value + 1);
    }, 1000);

    return () => window.clearInterval(interval);
  }, []);

  const selectedStudent = useMemo(
    () => students.find((item) => item.id === selectedStudentId) ?? null,
    [selectedStudentId, students]
  );

  const analyticsInput = useMemo(() => {
    const studentAttendance = students.map((student) => {
      const records = attendance.filter((item) => item.studentId === student.id);
      const present = records.filter((item) => item.status === 'present').length;
      return records.length > 0 ? Math.round((present / records.length) * 100) : 0;
    });

    const studentScores = students.map((student) => {
      const studentMarks = marks.filter((item) => item.studentId === student.id);
      const obtained = studentMarks.reduce((sum, item) => sum + item.obtainedMarks, 0);
      const total = studentMarks.reduce((sum, item) => sum + item.totalMarks, 0);
      return total > 0 ? Math.round((obtained / total) * 100) : 0;
    });

    const subjectStats = marks.reduce<Record<string, { obtained: number; total: number }>>((acc, item) => {
      acc[item.subject] = acc[item.subject] ?? { obtained: 0, total: 0 };
      acc[item.subject].obtained += item.obtainedMarks;
      acc[item.subject].total += item.totalMarks;
      return acc;
    }, {});

    const weakSubjects = Object.entries(subjectStats)
      .map(([subject, stats]) => ({
        subject,
        percentage: stats.total > 0 ? Math.round((stats.obtained / stats.total) * 100) : 0,
      }))
      .filter((item) => item.percentage < 50)
      .map((item) => item.subject);

    const topStudents = students
      .map((student, index) => ({ student, percentage: studentScores[index] ?? 0 }))
      .sort((a, b) => b.percentage - a.percentage)
      .slice(0, 5)
      .map((item) => item.student.name);

    const weakStudents = students
      .map((student, index) => ({ student, percentage: studentAttendance[index] ?? 0 }))
      .filter((item) => item.percentage < 50)
      .map((item) => item.student.name);

    const averageAttendance = studentAttendance.length > 0
      ? Math.round(studentAttendance.reduce((sum, value) => sum + value, 0) / studentAttendance.length)
      : 0;
    const averageMarks = studentScores.length > 0
      ? Math.round(studentScores.reduce((sum, value) => sum + value, 0) / studentScores.length)
      : 0;

    return {
      averageAttendance,
      averageMarks,
      weakSubjects,
      topStudents,
      weakStudents,
    };
  }, [attendance, marks, students]);

  const selectedStudentContext = useMemo(() => {
    if (!selectedStudent) return null;

    const studentAttendance = attendance.filter((item) => item.studentId === selectedStudent.id);
    const present = studentAttendance.filter((item) => item.status === 'present').length;
    const attendancePercentage = studentAttendance.length > 0 ? Math.round((present / studentAttendance.length) * 100) : 0;
    const marksSummary = marks
      .filter((item) => item.studentId === selectedStudent.id)
      .map((item) => `${item.subject}: ${item.obtainedMarks}/${item.totalMarks}`);

    return {
      attendancePercentage,
      marksSummary,
    };
  }, [attendance, marks, selectedStudent]);

  const usedTokens = useMemo(
    () => usageLogs.reduce((sum, item) => sum + item.totalTokens, 0),
    [usageLogs]
  );
  const usagePercentage = Math.min(Math.round((usedTokens / Math.max(monthlyLimit, 1)) * 100), 100);
  const aiLimiter = useMemo(() => aiService.getLimiterState(), [limiterTick]);
  const adminChatLimiter = useMemo(() => aiService.getLimiterState('admin_chat'), [limiterTick]);
  const cooldownLabel = aiLimiter.cooldownRemainingMs > 0
    ? `${Math.ceil(aiLimiter.cooldownRemainingMs / 1000)}s cooldown remaining`
    : 'AI ready';
  const planName = currentClass ? formatPlanName(currentClass.plan) : formatPlanName('free');

  const runAction = async (action: string, work: () => Promise<string>, onSuccess: (result: string) => void) => {
    setError('');
    setSuccess('');
    setActiveAction(action);
    try {
      const result = await work();
      onSuccess(result);
      setSuccess('AI response generated successfully.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'AI action failed.');
    } finally {
      setActiveAction('');
    }
  };

  if (user?.role !== 'admin') {
    return <EmptyState title="Admin Only" description="AI tools are available only for admin users to control cost and keep decisions centralized." />;
  }

  if (currentClass && !canAccessFeature('ai', currentClass.plan)) {
    return (
      <UpgradeCard
        title="AI Workspace Locked"
        description={`AI insights, report summaries, and coaching recommendations are available from the ${formatPlanName('standard')} plan onward.`}
        requiredPlan={formatPlanName('standard')}
        currentPlan={planName}
        actionLabel="View Plans"
        onUpgradeClick={() => requestDashboardTabNavigation('pricing')}
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Admin AI Workspace</h1>
          <p className="mt-2 text-gray-600">Manual AI tools only for admins: class analytics, student analysis, improvement plans, report summaries, and admin chat.</p>
          <div className="mt-3 flex flex-wrap gap-2 text-xs">
            <span className="rounded-full bg-amber-100 px-3 py-1 font-medium text-amber-800">{cooldownLabel}</span>
            <span className="rounded-full bg-blue-100 px-3 py-1 font-medium text-blue-800">
              {aiLimiter.remainingCallsThisMinute} / 3 AI calls left this minute
            </span>
            <span className="rounded-full bg-green-100 px-3 py-1 font-medium text-green-800">
              {adminChatLimiter.remainingChatCallsToday} / 10 admin chat prompts left today
            </span>
          </div>
        </div>
        <div className="rounded-2xl border border-blue-100 bg-blue-50 px-5 py-4">
          <div className="text-xs uppercase tracking-wide text-blue-700">Monthly AI Usage</div>
          <div className="mt-1 text-2xl font-bold text-blue-900">{usedTokens} / {monthlyLimit}</div>
          <div className="mt-3 h-2 rounded-full bg-blue-100">
            <div className="h-2 rounded-full bg-gradient-to-r from-blue-600 to-purple-600" style={{ width: `${usagePercentage}%` }} />
          </div>
          <div className="mt-2 text-xs text-blue-700">{usagePercentage}% of monthly token budget used</div>
        </div>
      </div>

      <FeedbackMessage type="error" message={error} />
      <FeedbackMessage type="success" message={success} />

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm"><div className="flex items-center justify-between"><div><div className="text-sm text-gray-600">Attendance</div><div className="mt-2 text-2xl font-bold text-gray-900">{analyticsInput.averageAttendance}%</div></div><BarChart3 className="h-6 w-6 text-blue-600" /></div></div>
        <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm"><div className="flex items-center justify-between"><div><div className="text-sm text-gray-600">Marks</div><div className="mt-2 text-2xl font-bold text-gray-900">{analyticsInput.averageMarks}%</div></div><Sparkles className="h-6 w-6 text-purple-600" /></div></div>
        <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm"><div className="flex items-center justify-between"><div><div className="text-sm text-gray-600">Weak Subjects</div><div className="mt-2 text-2xl font-bold text-gray-900">{analyticsInput.weakSubjects.length}</div></div><Lightbulb className="h-6 w-6 text-orange-600" /></div></div>
        <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm"><div className="flex items-center justify-between"><div><div className="text-sm text-gray-600">AI Calls</div><div className="mt-2 text-2xl font-bold text-gray-900">{usageLogs.length}</div></div><Bot className="h-6 w-6 text-green-600" /></div></div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr,1fr]">
        <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-blue-600" />
            <h2 className="text-lg font-semibold text-gray-900">Class Analytics</h2>
          </div>
          <button
            onClick={() => void runAction('class-analytics', () => aiService.generateClassAnalytics(currentClass!.id, {
              ...analyticsInput,
              totalStudents: students.length,
            }), setClassAnalytics)}
            disabled={activeAction !== '' || !aiLimiter.canCall}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {activeAction === 'class-analytics' ? 'Generating...' : 'Generate Class Analytics'}
          </button>
          <StructuredAIOutput
            value={classAnalytics}
            kind="class_analytics"
            emptyLabel="No AI analytics generated yet."
            loading={activeAction === 'class-analytics'}
          />
        </div>

        <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center gap-2">
            <UserSearch className="h-5 w-5 text-purple-600" />
            <h2 className="text-lg font-semibold text-gray-900">Student Analysis</h2>
          </div>
          <StyledSelect
            value={selectedStudentId}
            onChange={setSelectedStudentId}
            options={[
              { value: '', label: 'Select student' },
              ...students.map((item) => ({ value: item.id, label: `${item.name} (${item.batch})` })),
            ]}
          />
          <button
            onClick={() => {
              if (!selectedStudent || !selectedStudentContext || !currentClass?.id) {
                setError('Select a student first.');
                return;
              }
              void runAction(
                'student-analysis',
                () => aiService.generateStudentAnalysis(currentClass.id, {
                  studentName: selectedStudent.name,
                  attendancePercentage: selectedStudentContext.attendancePercentage,
                  marksSummary: selectedStudentContext.marksSummary,
                  batchName: selectedStudent.batch,
                }),
                setStudentAnalysis
              );
            }}
            disabled={activeAction !== '' || !aiLimiter.canCall}
            className="mt-4 rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white hover:bg-purple-700 disabled:opacity-50"
          >
            {activeAction === 'student-analysis' ? 'Analyzing...' : 'Analyze Student'}
          </button>
          <StructuredAIOutput
            value={studentAnalysis}
            kind="student_analysis"
            emptyLabel="No student analysis generated yet."
            loading={activeAction === 'student-analysis'}
          />
        </div>

        <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center gap-2">
            <Lightbulb className="h-5 w-5 text-orange-600" />
            <h2 className="text-lg font-semibold text-gray-900">Improvement Suggestions</h2>
          </div>
          <button
            onClick={() => void runAction('improvement-plan', () => aiService.generateImprovementPlan(currentClass!.id, {
              scope: selectedStudent && selectedStudentContext ? 'student' : 'class',
              studentName: selectedStudent?.name,
              attendancePercentage: selectedStudentContext?.attendancePercentage,
              context: selectedStudent && selectedStudentContext
                ? `Student: ${selectedStudent.name}\nAttendance: ${selectedStudentContext.attendancePercentage}%\nMarks: ${selectedStudentContext.marksSummary.join(', ')}`
                : `Average attendance: ${analyticsInput.averageAttendance}%\nAverage marks: ${analyticsInput.averageMarks}%\nWeak subjects: ${analyticsInput.weakSubjects.join(', ') || 'None'}`,
            }), setImprovementPlan)}
            disabled={activeAction !== '' || !aiLimiter.canCall}
            className="rounded-lg bg-orange-600 px-4 py-2 text-sm font-medium text-white hover:bg-orange-700 disabled:opacity-50"
          >
            {activeAction === 'improvement-plan' ? 'Generating...' : 'Generate Improvement Plan'}
          </button>
          <StructuredAIOutput
            value={improvementPlan}
            kind="improvement_plan"
            emptyLabel="No improvement plan generated yet."
            loading={activeAction === 'improvement-plan'}
          />
        </div>

        <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center gap-2">
            <MessageSquare className="h-5 w-5 text-green-600" />
            <h2 className="text-lg font-semibold text-gray-900">Admin AI Chat</h2>
          </div>
          <textarea
            value={chatQuery}
            onChange={(event) => setChatQuery(event.target.value)}
            rows={4}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="Which students are weak? Why is attendance low? How to improve results?"
          />
          <button
            onClick={() => {
              if (!chatQuery.trim() || !currentClass?.id) {
                setError('Enter an admin AI question first.');
                return;
              }
              const context = [
                `Average attendance: ${analyticsInput.averageAttendance}%`,
                `Average marks: ${analyticsInput.averageMarks}%`,
                `Weak subjects: ${analyticsInput.weakSubjects.join(', ') || 'None'}`,
                `Weak students: ${analyticsInput.weakStudents.join(', ') || 'None'}`,
              ].join('\n');
              void runAction('admin-chat', () => aiService.askAdminAI(currentClass.id, {
                question: chatQuery,
                context,
                totalStudents: students.length,
                averageAttendance: analyticsInput.averageAttendance,
                averageMarks: analyticsInput.averageMarks,
              }), setChatAnswer);
            }}
            disabled={activeAction !== '' || !adminChatLimiter.canCall}
            className="mt-4 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
          >
            {activeAction === 'admin-chat' ? 'Thinking...' : 'Ask AI'}
          </button>
          <StructuredAIOutput
            value={chatAnswer}
            kind="admin_chat"
            emptyLabel="No AI chat response yet."
            loading={activeAction === 'admin-chat'}
          />
        </div>
      </div>

      <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
        <div className="mb-4 flex items-center gap-2">
          <FileText className="h-5 w-5 text-indigo-600" />
          <h2 className="text-lg font-semibold text-gray-900">Usage Log</h2>
        </div>
        <div className="space-y-3">
          {usageLogs.length === 0 ? (
            <EmptyState title="No AI usage yet" description="AI usage entries will appear here after an admin triggers an AI action." />
          ) : (
            usageLogs.map((item) => (
              <div key={item.id} className="flex items-center justify-between rounded-xl border border-gray-100 p-4 text-sm">
                <div className="font-medium text-gray-900">{item.feature.replace('_', ' ')}</div>
                <div className="text-gray-500">{item.totalTokens} tokens</div>
                <div className="text-gray-400">{new Date(item.createdAt).toLocaleString()}</div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

export default AdminAIWorkspace;
