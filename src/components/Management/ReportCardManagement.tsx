import React, { useEffect, useMemo, useState } from 'react';
import { Bot, Download, FileText, Sparkles } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { aiService } from '../../services/aiService';
import { firebaseService } from '../../services/firebaseService';
import EmptyState from '../Common/EmptyState';
import FeedbackMessage from '../Common/FeedbackMessage';
import { Attendance, Marks, ReportCard, Student } from '../../types';

const ReportCardManagement: React.FC = () => {
  const { user, currentClass } = useAuth();
  const [students, setStudents] = useState<Student[]>([]);
  const [attendance, setAttendance] = useState<Attendance[]>([]);
  const [marks, setMarks] = useState<Marks[]>([]);
  const [reports, setReports] = useState<ReportCard[]>([]);
  const [selectedStudentId, setSelectedStudentId] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [activeAction, setActiveAction] = useState('');

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
      marks: targetMarks.map((item) => ({
        subject: item.subject,
        examType: item.examType,
        examName: item.examName,
        totalMarks: item.totalMarks,
        obtainedMarks: item.obtainedMarks,
        percentage: item.totalMarks > 0 ? Math.round((item.obtainedMarks / item.totalMarks) * 100) : 0,
      })),
    };
  }, [targetAttendance, targetMarks, targetStudent]);

  const handleGenerateReport = async () => {
    if (!currentClass?.id || !user || user.role !== 'admin' || !targetStudent || !draftReport) return;

    try {
      await firebaseService.createReport({
        studentId: targetStudent.id,
        classId: currentClass.id,
        attendance: draftReport.attendance,
        marks: draftReport.marks,
        aiSummary: 'AI summary will be generated in a later release. The report card is already structured to support it.',
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
        attendancePercentage: report.attendance.percentage,
        marksSummary: report.marks.map((item) => `${item.subject}: ${item.obtainedMarks}/${item.totalMarks}`),
      });
      await firebaseService.updateReport(report.id, {
        aiSummary: summary,
        aiStatus: 'ready',
      });
      setSuccess('AI report summary generated.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate AI report summary.');
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

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Report Cards</h1>
          <p className="mt-2 text-gray-600">Generate and review report cards with attendance, marks, and AI-ready summary fields.</p>
        </div>
        <div className="rounded-2xl border border-gray-100 bg-white px-5 py-4 shadow-sm">
          <div className="text-xs uppercase tracking-wide text-gray-500">Saved reports</div>
          <div className="mt-1 text-2xl font-bold text-gray-900">{visibleReports.length}</div>
        </div>
      </div>

      <FeedbackMessage type="error" message={error} />
      <FeedbackMessage type="success" message={success} />

      {user?.role === 'admin' ? (
        <div className="grid gap-6 xl:grid-cols-[0.9fr,1.1fr]">
          <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-gray-900">Generate Report Card</h2>
            <div className="mt-5 space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Student</label>
                <select
                  value={selectedStudentId}
                  onChange={(event) => setSelectedStudentId(event.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Select student</option>
                  {students.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name} ({item.batch})
                    </option>
                  ))}
                </select>
              </div>

              {targetStudent && draftReport ? (
                <div className="rounded-2xl border border-gray-100 bg-gray-50 p-4">
                  <div className="font-medium text-gray-900">{targetStudent.name}</div>
                  <div className="mt-2 text-sm text-gray-600">Attendance: {draftReport.attendance.percentage}%</div>
                  <div className="mt-1 text-sm text-gray-600">Marks entries: {draftReport.marks.length}</div>
                  <div className="mt-3 flex items-center gap-2 text-sm text-blue-700">
                    <Bot className="h-4 w-4" />
                    <span>AI summary field is already connected for a later model integration.</span>
                  </div>
                </div>
              ) : null}

              <button
                onClick={() => void handleGenerateReport()}
                disabled={!targetStudent || !draftReport}
                className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-blue-600 to-purple-600 px-4 py-3 font-medium text-white hover:from-blue-700 hover:to-purple-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <FileText className="h-4 w-4" />
                <span>Generate Report</span>
              </button>
            </div>
          </div>

          <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-gray-900">Generated Reports</h2>
            <div className="mt-5 space-y-4">
              {visibleReports.length === 0 ? (
                <EmptyState title="No report cards yet" description="Generate the first report card for a student to start the parent-friendly progress flow." />
              ) : (
                visibleReports.map((report) => {
                  const student = students.find((item) => item.id === report.studentId);
                  return (
                    <div key={report.id} className="rounded-2xl border border-gray-100 p-4">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <div className="font-medium text-gray-900">{student?.name ?? 'Student report'}</div>
                          <div className="mt-1 text-sm text-gray-500">Generated on {new Date(report.generatedAt).toLocaleDateString()}</div>
                        </div>
                        <div className="inline-flex items-center gap-1 rounded-full bg-purple-100 px-2.5 py-1 text-xs font-medium text-purple-700">
                          <Sparkles className="h-3.5 w-3.5" />
                          {report.aiStatus.replace('_', ' ')}
                        </div>
                      </div>
                      <div className="mt-3 grid grid-cols-2 gap-4 text-sm text-gray-600">
                        <div>Attendance: {report.attendance.percentage}%</div>
                        <div>Subjects: {report.marks.length}</div>
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
                        <button
                          onClick={() => void handleGenerateAISummary(report)}
                          disabled={activeAction !== ''}
                          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
                        >
                          {activeAction === report.id ? 'Generating AI Summary...' : 'Generate AI Report Summary'}
                        </button>
                      </div>
                      {report.aiSummary ? <p className="mt-3 text-sm text-gray-700">{report.aiSummary}</p> : null}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-gray-900">My Reports</h2>
          <div className="mt-5 space-y-4">
            {visibleReports.length === 0 ? (
              <EmptyState title="No reports available yet" description="Your admin has not generated a report card yet." />
            ) : (
              visibleReports.map((report) => (
                <div key={report.id} className="rounded-2xl border border-gray-100 p-5">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <div className="font-medium text-gray-900">Report Card</div>
                      <div className="mt-1 text-sm text-gray-500">{new Date(report.generatedAt).toLocaleDateString()}</div>
                    </div>
                    <div className="text-sm font-medium text-blue-700">{report.attendance.percentage}% attendance</div>
                  </div>
                  <div className="mt-4 space-y-2 text-sm text-gray-700">
                    {report.marks.map((item) => (
                      <div key={`${report.id}-${item.examName}-${item.subject}`} className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2">
                        <span>{item.subject} - {item.examName}</span>
                        <span>{item.obtainedMarks}/{item.totalMarks} ({item.percentage}%)</span>
                      </div>
                    ))}
                  </div>
                  {targetStudent ? (
                    <button
                      onClick={() => pdfService.downloadReportCard(report, targetStudent, currentClass)}
                      className="mt-4 inline-flex items-center gap-2 rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                    >
                      <Download className="h-4 w-4" />
                      <span>Download PDF</span>
                    </button>
                  ) : null}
                  {report.aiSummary ? <div className="mt-4 rounded-xl border border-blue-100 bg-blue-50 p-4 text-sm text-blue-800">{report.aiSummary}</div> : null}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default ReportCardManagement;
