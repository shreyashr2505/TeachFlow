import React, { useEffect, useMemo, useState } from 'react';
import { Bot, Copy, Download, FileText, Sparkles, TrendingDown, TrendingUp } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { aiService } from '../../services/aiService';
import { firebaseService } from '../../services/firebaseService';
import { pdfService } from '../../services/pdfService';
import EmptyState from '../Common/EmptyState';
import FeedbackMessage from '../Common/FeedbackMessage';
import StyledSelect from '../Common/StyledSelect';
import UpgradeCard from '../Common/UpgradeCard';
import { Attendance, Marks, ReportCard, Student } from '../../types';
import { canAccessFeature, formatPlanName } from '../../utils/plan';
import { requestDashboardTabNavigation } from '../../utils/dashboardNavigation';

type ExamGroup = {
  key: string;
  name: string;
  examType: string;
  date: string;
  averagePercentage: number;
  subjects: Array<{
    subject: string;
    obtainedMarks: number;
    totalMarks: number;
    percentage: number;
  }>;
};

const REPORT_AI_LIMITS = {
  free: 5,
  standard: 50,
  pro: 200,
} as const;

const formatExamDate = (value: string) =>
  value
    ? new Date(value).toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      })
    : 'Date not available';

const getExamKey = (item: { examName: string; examType: string; date?: string; examDate?: string }) =>
  `${item.examName}__${item.examType}__${item.examDate ?? item.date ?? ''}`;

const buildExamGroups = (
  items: Array<{
    subject: string;
    examType: string;
    examName: string;
    examDate?: string;
    date?: string;
    totalMarks: number;
    obtainedMarks: number;
    percentage?: number;
  }>
): ExamGroup[] =>
  Array.from(
    items.reduce((map, item) => {
      const date = item.examDate ?? item.date ?? '';
      const key = getExamKey({ examName: item.examName, examType: item.examType, examDate: date });
      const subjectEntry = {
        subject: item.subject,
        obtainedMarks: item.obtainedMarks,
        totalMarks: item.totalMarks,
        percentage: item.percentage ?? (item.totalMarks > 0 ? Math.round((item.obtainedMarks / item.totalMarks) * 100) : 0),
      };

      const existing = map.get(key);
      if (existing) {
        existing.subjects.push(subjectEntry);
      } else {
        map.set(key, {
          key,
          name: item.examName,
          examType: item.examType,
          date,
          averagePercentage: 0,
          subjects: [subjectEntry],
        });
      }

      return map;
    }, new Map<string, ExamGroup>())
  )
    .map(([, group]) => ({
      ...group,
      averagePercentage: group.subjects.length
        ? Math.round(group.subjects.reduce((sum, subject) => sum + subject.percentage, 0) / group.subjects.length)
        : 0,
    }))
    .sort((left, right) => {
      const leftTime = left.date ? new Date(left.date).getTime() : 0;
      const rightTime = right.date ? new Date(right.date).getTime() : 0;
      return leftTime - rightTime || left.name.localeCompare(right.name);
    });

const getImprovementData = (groups: ExamGroup[]) => {
  if (groups.length < 2) {
    return null;
  }

  const first = groups[0];
  const last = groups[groups.length - 1];
  if (first.averagePercentage <= 0) {
    return null;
  }

  const value = ((last.averagePercentage - first.averagePercentage) / first.averagePercentage) * 100;
  return {
    value,
    label: `${value >= 0 ? '+' : ''}${Math.round(value)}% ${value >= 0 ? 'Improvement' : 'Decline'}`,
  };
};

const AIReportSummary: React.FC<{ value: string }> = ({ value }) => {
  const [copied, setCopied] = useState(false);
  const paragraphs = value
    .split(/\n+/)
    .map((item) => item.trim())
    .filter(Boolean);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="mt-4">
      <div className="mb-3 flex justify-end">
        <button
          onClick={() => void handleCopy()}
          className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
        >
          <Copy className="h-4 w-4" />
          <span>{copied ? 'Copied' : 'Copy'}</span>
        </button>
      </div>
      <div data-no-tilt="true" className="rounded-2xl border border-slate-200 bg-slate-900/95 p-5 text-white shadow-lg">
        <div className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-300">AI Summary</div>
        <div className="mt-4 space-y-3 text-[15px] leading-7 text-slate-100">
          {(paragraphs.length ? paragraphs : [value]).map((paragraph, index) => (
            <p key={index} className="max-w-none break-words text-slate-200">
              {paragraph}
            </p>
          ))}
        </div>
      </div>
    </div>
  );
};

const PerformanceGraph: React.FC<{ groups: ExamGroup[] }> = ({ groups }) => {
  if (groups.length === 0) {
    return null;
  }

  const width = 640;
  const height = 240;
  const padding = 28;
  const innerWidth = width - padding * 2;
  const innerHeight = height - padding * 2;
  const points = groups.map((group, index) => {
    const x = groups.length === 1 ? width / 2 : padding + (index / (groups.length - 1)) * innerWidth;
    const y = padding + ((100 - group.averagePercentage) / 100) * innerHeight;
    return { ...group, x, y };
  });
  const path = points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`).join(' ');

  return (
    <div data-no-tilt="true" className="rounded-2xl border border-gray-100 bg-white p-5">
      <div>
        <h3 className="text-sm font-semibold text-gray-900">Performance Comparison</h3>
        <p className="mt-1 text-sm text-gray-500">Average percentage across the selected exams.</p>
      </div>
      <div className="mt-4 overflow-x-auto">
        <svg viewBox={`0 0 ${width} ${height}`} className="min-w-[640px]">
          {[0, 25, 50, 75, 100].map((tick) => {
            const y = padding + ((100 - tick) / 100) * innerHeight;
            return (
              <g key={tick}>
                <line x1={padding} y1={y} x2={width - padding} y2={y} stroke="#E5E7EB" strokeDasharray="4 4" />
                <text x={6} y={y + 4} fontSize="12" fill="#6B7280">
                  {tick}
                </text>
              </g>
            );
          })}
          <path d={path} fill="none" stroke="#4F46E5" strokeWidth="3" strokeLinecap="round" />
          {points.map((point) => (
            <g key={point.key}>
              <circle cx={point.x} cy={point.y} r="5" fill="#4F46E5" />
              <text x={point.x} y={height - 10} textAnchor="middle" fontSize="12" fill="#6B7280">
                {point.name}
              </text>
              <text x={point.x} y={point.y - 12} textAnchor="middle" fontSize="12" fill="#111827">
                {point.averagePercentage}%
              </text>
            </g>
          ))}
        </svg>
      </div>
    </div>
  );
};

const ExamTables: React.FC<{ groups: ExamGroup[] }> = ({ groups }) => (
  <div className="space-y-4">
    {groups.map((group) => (
      <div key={group.key} data-no-tilt="true" className="rounded-2xl border border-gray-100 bg-white p-5">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="text-base font-semibold text-gray-900">{group.name}</div>
            <div className="mt-1 text-sm text-gray-500">
              {group.examType} · {formatExamDate(group.date)}
            </div>
          </div>
          <div className="text-sm font-medium text-indigo-700">{group.averagePercentage}% average</div>
        </div>
        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Subject</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Marks</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Percentage</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 bg-white">
              {group.subjects.map((subject) => (
                <tr key={`${group.key}-${subject.subject}`}>
                  <td className="px-4 py-3 text-sm font-medium text-gray-900">{subject.subject}</td>
                  <td className="px-4 py-3 text-sm text-gray-700">
                    {subject.obtainedMarks}/{subject.totalMarks}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-700">{subject.percentage}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    ))}
  </div>
);

const ReportCardPanel: React.FC<{
  report: ReportCard;
  student?: Student | null;
  currentClass: NonNullable<ReturnType<typeof useAuth>['currentClass']>;
  aiReportsLocked: boolean;
  aiLimitReached: boolean;
  activeAction: string;
  onGenerateAI?: (report: ReportCard) => void;
}> = ({ report, student, currentClass, aiReportsLocked, aiLimitReached, activeAction, onGenerateAI }) => {
  const reportExamGroups = useMemo(() => buildExamGroups(report.marks), [report.marks]);
  const reportImprovement = useMemo(() => getImprovementData(reportExamGroups), [reportExamGroups]);

  return (
    <div data-no-tilt="true" className="rounded-2xl border border-gray-100 p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="font-medium text-gray-900">{student?.name ?? 'Student report'}</div>
          <div className="mt-1 text-sm text-gray-500">Generated on {new Date(report.generatedAt).toLocaleDateString('en-IN')}</div>
        </div>
        <div className="inline-flex items-center gap-1 rounded-full bg-purple-100 px-2.5 py-1 text-xs font-medium text-purple-700">
          <Sparkles className="h-3.5 w-3.5" />
          {report.aiStatus.replace('_', ' ')}
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-4 text-sm text-gray-600">
        <div>Attendance: {report.attendance.percentage}%</div>
        <div>Exams: {reportExamGroups.length}</div>
      </div>

      {reportImprovement ? (
        <div
          className={`mt-4 inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm font-medium ${
            reportImprovement.value >= 0 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
          }`}
        >
          {reportImprovement.value >= 0 ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
          <span>{reportImprovement.label}</span>
        </div>
      ) : null}

      <div className="mt-4 space-y-4">
        <PerformanceGraph groups={reportExamGroups} />
        <ExamTables groups={reportExamGroups} />
      </div>

      <div className="mt-4 flex flex-wrap gap-3">
        {student ? (
          <button
            onClick={() => pdfService.downloadReportCard(report, student, currentClass)}
            className="inline-flex items-center gap-2 rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            <Download className="h-4 w-4" />
            <span>Download PDF</span>
          </button>
        ) : null}
        {onGenerateAI ? (
          <button
            onClick={() => onGenerateAI(report)}
            disabled={activeAction !== '' || aiReportsLocked || aiLimitReached}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {activeAction === report.id ? 'Generating AI Summary...' : 'Generate AI Report Summary'}
          </button>
        ) : null}
      </div>

      {report.aiSummary ? (
        <AIReportSummary value={report.aiSummary} />
      ) : (
        <div className="mt-4">
          <EmptyState
            title="AI insights not generated yet"
            description={
              aiReportsLocked
                ? `Upgrade to ${formatPlanName('standard')} to unlock AI-written report insights for this student.`
                : 'Click "Generate AI Report Summary" to create the parent-friendly summary for this report.'
            }
          />
        </div>
      )}
    </div>
  );
};

const ReportCardManagement: React.FC = () => {
  const { user, currentClass } = useAuth();
  const [students, setStudents] = useState<Student[]>([]);
  const [attendance, setAttendance] = useState<Attendance[]>([]);
  const [marks, setMarks] = useState<Marks[]>([]);
  const [reports, setReports] = useState<ReportCard[]>([]);
  const [selectedStudentId, setSelectedStudentId] = useState('');
  const [selectedExamKeys, setSelectedExamKeys] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [activeAction, setActiveAction] = useState('');
  const [showAILimitModal, setShowAILimitModal] = useState(false);

  const aiReportsLocked = currentClass ? !canAccessFeature('ai', currentClass.plan) : false;
  const aiUsageLimit = currentClass ? REPORT_AI_LIMITS[currentClass.plan] : REPORT_AI_LIMITS.free;
  const aiUsageUsed = currentClass?.settings.aiUsage?.used ?? 0;
  const aiLimitReached = aiUsageUsed >= aiUsageLimit;

  useEffect(() => {
    if (!currentClass?.id) return;

    if (user?.role === 'admin') {
      const unsubs = [
        firebaseService.subscribeToStudents(currentClass.id, setStudents, (err) => setError(err.message)),
        firebaseService.subscribeToAttendance(currentClass.id, setAttendance, (err) => setError(err.message)),
        firebaseService.subscribeToMarks(currentClass.id, setMarks, (err) => setError(err.message)),
        firebaseService.subscribeToClassReports(currentClass.id, setReports, (err) => setError(err.message)),
      ];
      return () => unsubs.forEach((unsubscribe) => unsubscribe());
    }

    const unsubscribeStudents = firebaseService.subscribeToStudents(currentClass.id, setStudents, (err) => setError(err.message));
    return unsubscribeStudents;
  }, [currentClass?.id, user?.role]);

  const targetStudent = useMemo(() => {
    if (user?.role === 'student') {
      return students.find((item) => item.id === user.id) ?? null;
    }
    if (user?.role === 'parent') {
      const linkedIds = user.linkedStudentIds ?? (user.linkedStudentId ? [user.linkedStudentId] : []);
      return students.find((item) => linkedIds.includes(item.id)) ?? null;
    }
    return students.find((item) => item.id === selectedStudentId) ?? null;
  }, [selectedStudentId, students, user]);

  useEffect(() => {
    if (!currentClass?.id || !targetStudent?.id || user?.role === 'admin') return;
    const unsubscribe = firebaseService.subscribeToReportsByStudent(currentClass.id, targetStudent.id, setReports, (err) => setError(err.message));
    return unsubscribe;
  }, [currentClass?.id, targetStudent?.id, user?.role]);

  const targetAttendance = useMemo(() => attendance.filter((item) => item.studentId === targetStudent?.id), [attendance, targetStudent?.id]);
  const targetMarks = useMemo(() => marks.filter((item) => item.studentId === targetStudent?.id), [marks, targetStudent?.id]);
  const examOptions = useMemo(
    () =>
      buildExamGroups(targetMarks).map((group) => ({
        value: group.key,
        label: `${group.name} · ${group.examType} · ${formatExamDate(group.date)}`,
      })),
    [targetMarks]
  );

  useEffect(() => {
    setSelectedExamKeys(examOptions.map((option) => option.value));
  }, [selectedStudentId, examOptions]);

  const selectedTargetMarks = useMemo(() => {
    if (selectedExamKeys.length === 0) {
      return [];
    }

    const allowedKeys = new Set(selectedExamKeys);
    return targetMarks.filter((item) => allowedKeys.has(getExamKey(item)));
  }, [selectedExamKeys, targetMarks]);

  const draftReport = useMemo(() => {
    if (!targetStudent) return null;

    const totalAttendance = targetAttendance.length;
    const presentAttendance = targetAttendance.filter((item) => item.status === 'present').length;

    return {
      attendance: {
        total: totalAttendance,
        present: presentAttendance,
        absent: Math.max(totalAttendance - presentAttendance, 0),
        percentage: totalAttendance > 0 ? Math.round((presentAttendance / totalAttendance) * 100) : 0,
      },
      marks: selectedTargetMarks.map((item) => ({
        subject: item.subject,
        examType: item.examType,
        examName: item.examName,
        examDate: item.date,
        totalMarks: item.totalMarks,
        obtainedMarks: item.obtainedMarks,
        percentage: item.totalMarks > 0 ? Math.round((item.obtainedMarks / item.totalMarks) * 100) : 0,
      })),
    };
  }, [selectedTargetMarks, targetAttendance, targetStudent]);

  const selectedDraftExamGroups = useMemo(() => buildExamGroups(draftReport?.marks ?? []), [draftReport]);
  const draftImprovement = useMemo(() => getImprovementData(selectedDraftExamGroups), [selectedDraftExamGroups]);
  const allExamsSelected = examOptions.length > 0 && selectedExamKeys.length === examOptions.length;

  const handleGenerateReport = async () => {
    if (!currentClass?.id || !user || user.role !== 'admin' || !targetStudent || !draftReport) return;
    if (draftReport.marks.length === 0) {
      setError('Select at least one exam to generate the report card.');
      return;
    }

    try {
      await firebaseService.createReport({
        studentId: targetStudent.id,
        classId: currentClass.id,
        attendance: draftReport.attendance,
        marks: draftReport.marks,
        aiStatus: 'not_requested',
        generatedBy: user.id,
      });
      setSuccess('Report card generated successfully.');
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate report card.');
    }
  };

  const handleGenerateAISummary = async (report: ReportCard) => {
    if (!currentClass?.id || !user || user.role !== 'admin') return;
    if (aiReportsLocked || aiLimitReached) {
      setError('Upgrade required to use AI report summaries.');
      if (aiLimitReached) {
        setShowAILimitModal(true);
      }
      return;
    }

    const student = students.find((item) => item.id === report.studentId);
    if (!student) {
      setError('Student not found for this report.');
      return;
    }

    setActiveAction(report.id);
    setError('');
    setSuccess('');
    try {
      const summary = await aiService.generateReportCardSummary(currentClass.id, {
        studentName: student.name,
        className: currentClass.name,
        batchName: student.batch,
        term: new Date(report.generatedAt).toLocaleDateString('en-IN', {
          month: 'long',
          year: 'numeric',
        }),
        attendancePercentage: report.attendance.percentage,
        marks: report.marks,
      });
      await firebaseService.updateReport(report.id, {
        aiSummary: summary,
        aiStatus: 'ready',
      });
      setSuccess('AI report summary generated.');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to generate AI report summary.';
      if (message.includes('AI limit reached')) {
        setShowAILimitModal(true);
      }
      setError(message);
    } finally {
      setActiveAction('');
    }
  };

  const visibleReports = useMemo(() => {
    if (user?.role === 'admin') {
      return selectedStudentId ? reports.filter((item) => item.studentId === selectedStudentId) : reports;
    }
    return reports;
  }, [reports, selectedStudentId, user?.role]);

  if (!currentClass) {
    return null;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Report Cards</h1>
          <p className="mt-2 text-gray-600">Generate exam-wise report cards with graphs, improvement tracking, and AI-ready parent summaries.</p>
        </div>
        <div data-no-tilt="true" className="rounded-2xl border border-gray-100 bg-white px-5 py-4 shadow-sm">
          <div className="text-xs uppercase tracking-wide text-gray-500">Saved reports</div>
          <div className="mt-1 text-2xl font-bold text-gray-900">{visibleReports.length}</div>
        </div>
      </div>

      <FeedbackMessage type="error" message={error} />
      <FeedbackMessage type="success" message={success} />

      {showAILimitModal ? (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 px-4 py-6">
          <div data-no-tilt="true" className="my-auto flex w-full max-w-md max-h-[calc(100vh-3rem)] flex-col overflow-hidden rounded-2xl border border-gray-100 bg-white p-6 shadow-2xl">
            <div className="flex-1 overflow-y-auto pr-2">
              <div className="text-lg font-semibold text-gray-900">AI Report Limit Reached</div>
              <p className="mt-2 text-sm leading-6 text-gray-600">
                You have used {aiUsageUsed} of {aiUsageLimit} AI report summaries on the {formatPlanName(currentClass.plan)} plan.
                Upgrade to continue generating new summaries.
              </p>
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => setShowAILimitModal(false)}
                className="rounded-lg px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-800"
              >
                Close
              </button>
              <button
                onClick={() => {
                  setShowAILimitModal(false);
                  requestDashboardTabNavigation('pricing');
                }}
                className="rounded-lg bg-gradient-to-r from-blue-600 to-purple-600 px-4 py-2 text-sm font-medium text-white hover:from-blue-700 hover:to-purple-700"
              >
                Upgrade Plan
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {user?.role === 'admin' ? (
        <div className="flex flex-col gap-6">
          <div data-no-tilt="true" className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-gray-900">Generate Report Card</h2>
            <div className="mt-5 space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Student</label>
                <StyledSelect
                  searchable
                  searchPlaceholder="Search student"
                  value={selectedStudentId}
                  onChange={setSelectedStudentId}
                  options={[
                    { value: '', label: 'Select student' },
                    ...students.map((item) => ({ value: item.id, label: `${item.name} (${item.batch})` })),
                  ]}
                />
              </div>

              {targetStudent && draftReport ? (
                <div data-no-tilt="true" className="rounded-2xl border border-gray-100 bg-gray-50 p-4">
                  <div className="font-medium text-gray-900">{targetStudent.name}</div>
                  <div className="mt-2 text-sm text-gray-600">Attendance: {draftReport.attendance.percentage}%</div>
                  <div className="mt-1 text-sm text-gray-600">Selected exams: {selectedDraftExamGroups.length}</div>
                  <div className="mt-1 text-sm text-gray-600">Marks entries: {draftReport.marks.length}</div>
                  <div className="mt-3 flex items-center gap-2 text-sm text-blue-700">
                    <Bot className="h-4 w-4" />
                    <span>{aiUsageUsed} / {aiUsageLimit} AI reports used</span>
                  </div>
                </div>
              ) : null}

              {examOptions.length > 0 ? (
                <div data-no-tilt="true" className="rounded-2xl border border-gray-100 bg-gray-50 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm font-semibold text-gray-900">Select Exams</div>
                    <button
                      type="button"
                      onClick={() => setSelectedExamKeys(allExamsSelected ? [] : examOptions.map((option) => option.value))}
                      className="text-sm font-medium text-blue-700 hover:text-blue-800"
                    >
                      {allExamsSelected ? 'Clear All' : 'Select All'}
                    </button>
                  </div>
                  <div className="mt-3 space-y-2">
                    {examOptions.map((option) => (
                      <label key={option.value} className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white px-3 py-3 text-sm text-gray-700">
                        <input
                          type="checkbox"
                          checked={selectedExamKeys.includes(option.value)}
                          onChange={(event) =>
                            setSelectedExamKeys((current) =>
                              event.target.checked ? [...current, option.value] : current.filter((value) => value !== option.value)
                            )
                          }
                          className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        />
                        <span>{option.label}</span>
                      </label>
                    ))}
                  </div>
                </div>
              ) : null}

              {selectedDraftExamGroups.length > 0 ? (
                <div className="space-y-4">
                  {draftImprovement ? (
                    <div data-no-tilt="true" className="rounded-2xl border border-gray-100 bg-white p-4">
                      <div className="flex items-center gap-3">
                        {draftImprovement.value >= 0 ? (
                          <TrendingUp className="h-5 w-5 text-green-600" />
                        ) : (
                          <TrendingDown className="h-5 w-5 text-red-600" />
                        )}
                        <div>
                          <div className={`text-base font-semibold ${draftImprovement.value >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                            {draftImprovement.label}
                          </div>
                          <div className="text-sm text-gray-500">Based on the first selected exam versus the latest selected exam.</div>
                        </div>
                      </div>
                    </div>
                  ) : null}
                  <PerformanceGraph groups={selectedDraftExamGroups} />
                  <ExamTables groups={selectedDraftExamGroups} />
                </div>
              ) : null}

              <button
                onClick={() => void handleGenerateReport()}
                disabled={!targetStudent || !draftReport || draftReport.marks.length === 0}
                className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-blue-600 to-purple-600 px-4 py-3 font-medium text-white hover:from-blue-700 hover:to-purple-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <FileText className="h-4 w-4" />
                <span>Generate Report</span>
              </button>
            </div>
          </div>

          <div data-no-tilt="true" className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-gray-900">Generated Reports</h2>
            <div className="mt-5 space-y-4">
              {aiReportsLocked ? (
                <UpgradeCard
                  title="AI Reports Locked"
                  description={`AI-generated report summaries are available from the ${formatPlanName('standard')} plan onward. Basic report generation and PDF downloads still work.`}
                  requiredPlan={formatPlanName('standard')}
                  currentPlan={formatPlanName(currentClass.plan)}
                  actionLabel="View Plans"
                  onUpgradeClick={() => requestDashboardTabNavigation('pricing')}
                />
              ) : null}
              {!aiReportsLocked && aiLimitReached ? (
                <UpgradeCard
                  title="AI Report Limit Reached"
                  description={`You have already used ${aiUsageUsed} of ${aiUsageLimit} AI report summaries this month. Upgrade to continue generating new AI summaries.`}
                  requiredPlan={formatPlanName('pro')}
                  currentPlan={formatPlanName(currentClass.plan)}
                  actionLabel="Upgrade Plan"
                  onUpgradeClick={() => requestDashboardTabNavigation('pricing')}
                />
              ) : null}
              {visibleReports.length === 0 ? (
                <EmptyState title="No report cards yet" description="Generate the first report card for a student to start the parent-friendly progress flow." />
              ) : (
                visibleReports.map((report) => {
                  const student = students.find((item) => item.id === report.studentId) ?? null;
                  return (
                    <ReportCardPanel
                      key={report.id}
                      report={report}
                      student={student}
                      currentClass={currentClass}
                      aiReportsLocked={aiReportsLocked}
                      aiLimitReached={aiLimitReached}
                      activeAction={activeAction}
                      onGenerateAI={(value) => void handleGenerateAISummary(value)}
                    />
                  );
                })
              )}
            </div>
          </div>
        </div>
      ) : (
        <div data-no-tilt="true" className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-gray-900">My Reports</h2>
          <div className="mt-5 space-y-4">
            {visibleReports.length === 0 ? (
              <EmptyState title="No reports available yet" description="Your admin has not generated a report card yet." />
            ) : (
              visibleReports.map((report) => (
                <ReportCardPanel
                  key={report.id}
                  report={report}
                  student={targetStudent}
                  currentClass={currentClass}
                  aiReportsLocked={aiReportsLocked}
                  aiLimitReached={aiLimitReached}
                  activeAction={activeAction}
                />
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default ReportCardManagement;
