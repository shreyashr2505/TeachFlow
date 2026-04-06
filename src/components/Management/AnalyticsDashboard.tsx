import React, { useEffect, useMemo, useState } from 'react';
import { BarChart3, Bot, Save, TrendingDown, TrendingUp, Users } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { firebaseService } from '../../services/firebaseService';
import EmptyState from '../Common/EmptyState';
import FeedbackMessage from '../Common/FeedbackMessage';
import { AnalyticsSnapshot, Attendance, Marks, Student } from '../../types';

const AnalyticsDashboard: React.FC = () => {
  const { user, currentClass } = useAuth();
  const [students, setStudents] = useState<Student[]>([]);
  const [attendance, setAttendance] = useState<Attendance[]>([]);
  const [marks, setMarks] = useState<Marks[]>([]);
  const [snapshots, setSnapshots] = useState<AnalyticsSnapshot[]>([]);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    if (!currentClass?.id) return;
    const unsubs = [
      firebaseService.subscribeToStudents(currentClass.id, setStudents, (err) => setError(err.message)),
      firebaseService.subscribeToAttendance(currentClass.id, setAttendance, (err) => setError(err.message)),
      firebaseService.subscribeToMarks(currentClass.id, setMarks, (err) => setError(err.message)),
      firebaseService.subscribeToAnalyticsSnapshots(currentClass.id, setSnapshots, (err) => setError(err.message)),
    ];
    return () => unsubs.forEach((unsubscribe) => unsubscribe());
  }, [currentClass?.id]);

  const computedAnalytics = useMemo(() => {
    const studentAttendance = students.map((student) => {
      const studentRecords = attendance.filter((item) => item.studentId === student.id);
      const present = studentRecords.filter((item) => item.status === 'present').length;
      const percentage = studentRecords.length > 0 ? Math.round((present / studentRecords.length) * 100) : 0;
      return { student, percentage };
    });

    const studentScores = students.map((student) => {
      const studentMarks = marks.filter((item) => item.studentId === student.id);
      const obtained = studentMarks.reduce((sum, item) => sum + item.obtainedMarks, 0);
      const total = studentMarks.reduce((sum, item) => sum + item.totalMarks, 0);
      const percentage = total > 0 ? Math.round((obtained / total) * 100) : 0;
      return { student, percentage };
    });

    const attendancePercentage = studentAttendance.length > 0 ? Math.round(studentAttendance.reduce((sum, item) => sum + item.percentage, 0) / studentAttendance.length) : 0;
    const passPercentage = studentScores.length > 0 ? Math.round((studentScores.filter((item) => item.percentage >= 35).length / studentScores.length) * 100) : 0;
    const weakStudents = studentAttendance.filter((item) => item.percentage < 50).map((item) => item.student.name);
    const topStudents = [...studentScores].sort((a, b) => b.percentage - a.percentage).slice(0, 5).map((item) => item.student.name);

    return {
      attendancePercentage,
      passPercentage,
      weakStudents,
      topStudents,
      attendanceAlert: weakStudents.length > 0 ? `${weakStudents.length} students below 50% attendance` : 'Attendance looks healthy',
    };
  }, [attendance, marks, students]);

  const saveSnapshot = async () => {
    if (!currentClass?.id || !user) return;
    try {
      await firebaseService.createAnalyticsSnapshot({
        classId: currentClass.id,
        periodLabel: new Date().toLocaleDateString(),
        attendancePercentage: computedAnalytics.attendancePercentage,
        passPercentage: computedAnalytics.passPercentage,
        topStudents: computedAnalytics.topStudents,
        weakStudents: computedAnalytics.weakStudents,
        aiSummary: 'AI-generated analytics insights will be added later. This snapshot is already ready for that integration.',
        aiStatus: 'not_requested',
      });
      setSuccess('Analytics snapshot saved.');
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save analytics snapshot.');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Analytics Dashboard</h1>
          <p className="mt-2 text-gray-600">Give admins a clear performance and attendance view, with AI-ready insight storage for later.</p>
        </div>
        <button onClick={() => void saveSnapshot()} className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-blue-600 to-purple-600 px-4 py-3 font-medium text-white hover:from-blue-700 hover:to-purple-700">
          <Save className="h-4 w-4" />
          <span>Save Snapshot</span>
        </button>
      </div>

      <FeedbackMessage type="error" message={error} />
      <FeedbackMessage type="success" message={success} />

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm"><div className="flex items-center justify-between"><div><div className="text-sm text-gray-600">Pass Ratio</div><div className="mt-2 text-2xl font-bold text-gray-900">{computedAnalytics.passPercentage}%</div></div><TrendingUp className="h-6 w-6 text-green-600" /></div></div>
        <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm"><div className="flex items-center justify-between"><div><div className="text-sm text-gray-600">Attendance %</div><div className="mt-2 text-2xl font-bold text-gray-900">{computedAnalytics.attendancePercentage}%</div></div><BarChart3 className="h-6 w-6 text-blue-600" /></div></div>
        <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm"><div className="flex items-center justify-between"><div><div className="text-sm text-gray-600">Top Students</div><div className="mt-2 text-2xl font-bold text-gray-900">{computedAnalytics.topStudents.length}</div></div><Users className="h-6 w-6 text-purple-600" /></div></div>
        <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm"><div className="flex items-center justify-between"><div><div className="text-sm text-gray-600">Weak Students</div><div className="mt-2 text-2xl font-bold text-gray-900">{computedAnalytics.weakStudents.length}</div></div><TrendingDown className="h-6 w-6 text-orange-600" /></div></div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.1fr,0.9fr]">
        <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-gray-900">Live Insights</h2>
          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <div className="rounded-2xl border border-orange-100 bg-orange-50 p-5"><div className="font-medium text-orange-900">Attendance Alert</div><div className="mt-2 text-sm text-orange-700">{computedAnalytics.attendanceAlert}</div></div>
            <div className="rounded-2xl border border-green-100 bg-green-50 p-5"><div className="font-medium text-green-900">Top Students</div><div className="mt-2 text-sm text-green-700">{computedAnalytics.topStudents.length > 0 ? computedAnalytics.topStudents.join(', ') : 'No student score data yet'}</div></div>
          </div>

          <div className="mt-6 rounded-2xl border border-blue-100 bg-blue-50 p-5">
            <div className="flex items-center gap-2 font-medium text-blue-900">
              <Bot className="h-4 w-4" />
              <span>AI Analytics Ready</span>
            </div>
            <p className="mt-2 text-sm text-blue-700">This dashboard already stores `aiSummary` and `aiStatus`, so later we can connect a model without changing your analytics schema again.</p>
          </div>
        </div>

        <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-gray-900">Saved Snapshots</h2>
          <div className="mt-5 space-y-4">
            {snapshots.length === 0 ? (
              <EmptyState title="No snapshots yet" description="Save a snapshot to keep historical admin insights." />
            ) : (
              snapshots.map((item) => (
                <div key={item.id} className="rounded-2xl border border-gray-100 p-4">
                  <div className="font-medium text-gray-900">{item.periodLabel}</div>
                  <div className="mt-2 grid grid-cols-2 gap-3 text-sm text-gray-600">
                    <div>Pass: {item.passPercentage}%</div>
                    <div>Attendance: {item.attendancePercentage}%</div>
                    <div>Top: {item.topStudents.length}</div>
                    <div>Weak: {item.weakStudents.length}</div>
                  </div>
                  {item.aiSummary ? <p className="mt-3 text-sm text-gray-700">{item.aiSummary}</p> : null}
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default AnalyticsDashboard;
