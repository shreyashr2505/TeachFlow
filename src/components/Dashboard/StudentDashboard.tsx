import React, { useEffect, useMemo, useState } from 'react';
import { Award, Calendar, CheckCircle, Download, DollarSign, User } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { firebaseService } from '../../services/firebaseService';
import EmptyState from '../Common/EmptyState';
import { Attendance, Fee, Lecture, Marks, Student } from '../../types';
import { pdfService } from '../../services/pdfService';

interface StudentDashboardProps {
  initialTab?: 'overview' | 'schedule' | 'attendance' | 'marks' | 'fees';
}

const StudentDashboard: React.FC<StudentDashboardProps> = ({ initialTab = 'overview' }) => {
  const { user, currentClass } = useAuth();
  const [activeTab, setActiveTab] = useState(initialTab);
  const [student, setStudent] = useState<Student | null>(null);
  const [lectures, setLectures] = useState<Lecture[]>([]);
  const [attendance, setAttendance] = useState<Attendance[]>([]);
  const [marks, setMarks] = useState<Marks[]>([]);
  const [fees, setFees] = useState<Fee[]>([]);

  useEffect(() => setActiveTab(initialTab), [initialTab]);

  useEffect(() => {
    if (!currentClass?.id) return;

    if (user?.linkedStudentId) {
      return firebaseService.subscribeToStudentById(currentClass.id, user.linkedStudentId, setStudent);
    }

    if (user?.email) {
      return firebaseService.subscribeToStudentByEmail(currentClass.id, user.email, setStudent);
    }
  }, [currentClass?.id, user?.email, user?.linkedStudentId]);

  useEffect(() => {
    if (!currentClass?.id || !student?.batch) {
      setLectures([]);
      return;
    }

    return firebaseService.subscribeToLecturesByBatch(currentClass.id, student.batch, setLectures);
  }, [currentClass?.id, student?.batch]);

  useEffect(() => {
    if (!currentClass?.id || !student?.id) {
      setAttendance([]);
      setMarks([]);
      setFees([]);
      return;
    }

    const unsubs = [
      firebaseService.subscribeToAttendanceByStudent(currentClass.id, student.id, setAttendance),
      firebaseService.subscribeToMarksByStudent(currentClass.id, student.id, setMarks),
      firebaseService.subscribeToFeesByStudent(currentClass.id, student.id, setFees),
    ];

    return () => unsubs.forEach((unsubscribe) => unsubscribe());
  }, [currentClass?.id, student?.id]);

  const pendingFees = Math.max((student?.totalFees ?? 0) - (student?.paidFees ?? 0), 0);
  const studentLectures = useMemo(
    () =>
      lectures
        .filter((lecture) => lecture.batch === student?.batch)
        .sort((a, b) => new Date(`${a.date}T${a.time}`).getTime() - new Date(`${b.date}T${b.time}`).getTime()),
    [lectures, student?.batch]
  );
  const studentAttendance = useMemo(
    () =>
      attendance
        .filter((item) => item.studentId === student?.id)
        .sort((a, b) => new Date(b.date ?? b.markedAt).getTime() - new Date(a.date ?? a.markedAt).getTime()),
    [attendance, student?.id]
  );
  const studentMarks = useMemo(
    () =>
      marks
        .filter((item) => item.studentId === student?.id)
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()),
    [marks, student?.id]
  );
  const attendanceSummary = useMemo(() => {
    const total = studentAttendance.length;
    const present = studentAttendance.filter((item) => item.status === 'present').length;
    const absent = total - present;
    const percentage = total > 0 ? Math.round((present / total) * 100) : 0;
    return { total, present, absent, percentage };
  }, [studentAttendance]);
  const marksAverage = useMemo(() => {
    if (studentMarks.length === 0) return 0;
    const totalObtained = studentMarks.reduce((sum, item) => sum + item.obtainedMarks, 0);
    const totalMarks = studentMarks.reduce((sum, item) => sum + item.totalMarks, 0);
    return totalMarks > 0 ? Math.round((totalObtained / totalMarks) * 100) : 0;
  }, [studentMarks]);
  const studentFees = useMemo(
    () =>
      fees
        .filter((fee) => fee.studentId === student?.id)
        .sort((a, b) => new Date(b.dueDate).getTime() - new Date(a.dueDate).getTime()),
    [fees, student?.id]
  );

  const renderContent = () => {
    switch (activeTab) {
      case 'schedule':
        return studentLectures.length === 0 ? (
          <EmptyState title="No lectures scheduled" description="Your batch schedule will appear here once lectures are added." />
        ) : (
          <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-gray-900">Lecture Schedule</h2>
            <div className="mt-4 space-y-4">
              {studentLectures.map((lecture) => (
                <div key={lecture.id} className="rounded-xl border border-gray-100 p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="font-semibold text-gray-900">{lecture.title}</div>
                      <div className="mt-1 text-sm text-gray-600">{lecture.subject} • {lecture.teacherName}</div>
                      <div className="mt-1 text-sm text-gray-500">{lecture.batch}</div>
                    </div>
                    <div className="text-right text-sm text-gray-600">
                      <div>{new Date(lecture.date).toLocaleDateString()}</div>
                      <div>{lecture.time}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      case 'attendance':
        return studentAttendance.length === 0 ? (
          <EmptyState title="No attendance records yet" description="Attendance will appear here after your teacher marks it for a lecture." />
        ) : (
          <div className="space-y-6">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
              <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm"><div className="text-sm text-gray-600">Records</div><div className="mt-2 text-2xl font-bold text-gray-900">{attendanceSummary.total}</div></div>
              <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm"><div className="text-sm text-gray-600">Present</div><div className="mt-2 text-2xl font-bold text-green-700">{attendanceSummary.present}</div></div>
              <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm"><div className="text-sm text-gray-600">Absent</div><div className="mt-2 text-2xl font-bold text-red-700">{attendanceSummary.absent}</div></div>
              <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm"><div className="text-sm text-gray-600">Attendance %</div><div className="mt-2 text-2xl font-bold text-blue-700">{attendanceSummary.percentage}%</div></div>
            </div>
            <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
              <div className="flex items-center justify-between gap-4">
                <h2 className="text-lg font-semibold text-gray-900">Attendance History</h2>
                {student ? (
                  <button
                    onClick={() => pdfService.downloadAttendanceReport(student, studentAttendance, currentClass)}
                    className="inline-flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                  >
                    <Download className="h-4 w-4" />
                    <span>Download Attendance</span>
                  </button>
                ) : null}
              </div>
              <div className="mt-4 space-y-3">
                {studentAttendance.map((item) => (
                  <div key={item.id} className="flex items-center justify-between rounded-xl border border-gray-100 p-4">
                    <div>
                      <div className="font-medium text-gray-900">{item.lectureTitle ?? 'Lecture'}</div>
                      <div className="mt-1 text-sm text-gray-600">{item.batch}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm text-gray-500">{new Date(item.date ?? item.markedAt).toLocaleDateString()}</div>
                      <span className={`mt-2 inline-flex rounded-full px-3 py-1 text-xs font-semibold ${item.status === 'present' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                        {item.status === 'present' ? 'Present' : 'Absent'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        );
      case 'marks':
        return studentMarks.length === 0 ? (
          <EmptyState title="No marks available" description="Exam results will appear here once teachers publish them." />
        ) : (
          <div className="space-y-6">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm"><div className="text-sm text-gray-600">Results</div><div className="mt-2 text-2xl font-bold text-gray-900">{studentMarks.length}</div></div>
              <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm"><div className="text-sm text-gray-600">Average</div><div className="mt-2 text-2xl font-bold text-blue-700">{marksAverage}%</div></div>
              <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm"><div className="text-sm text-gray-600">Best Score</div><div className="mt-2 text-2xl font-bold text-green-700">{Math.max(...studentMarks.map((item) => Math.round((item.obtainedMarks / item.totalMarks) * 100)), 0)}%</div></div>
            </div>
            <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
              <div className="flex items-center justify-between gap-4">
                <h2 className="text-lg font-semibold text-gray-900">Marks History</h2>
                {student ? (
                  <button
                    onClick={() => pdfService.downloadStudentReport(student, studentMarks, currentClass)}
                    className="inline-flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                  >
                    <Download className="h-4 w-4" />
                    <span>Download Marks</span>
                  </button>
                ) : null}
              </div>
              <div className="mt-4 space-y-3">
                {studentMarks.map((mark) => {
                  const percentage = Math.round((mark.obtainedMarks / mark.totalMarks) * 100);
                  return (
                    <div key={mark.id} className="flex items-center justify-between rounded-xl border border-gray-100 p-4">
                      <div>
                        <div className="font-medium text-gray-900">{mark.examName}</div>
                        <div className="mt-1 text-sm text-gray-600">{mark.subject} • {mark.examType}</div>
                      </div>
                      <div className="text-right">
                        <div className="font-semibold text-gray-900">{mark.obtainedMarks}/{mark.totalMarks}</div>
                        <div className="mt-1 text-sm text-blue-700">{percentage}%</div>
                        <div className="mt-1 text-xs text-gray-500">{new Date(mark.date).toLocaleDateString()}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        );
      case 'fees':
        return (
          <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between gap-4">
              <h2 className="text-lg font-semibold text-gray-900">Fee Status</h2>
              {student ? (
                <button
                  onClick={() => pdfService.downloadFeeSummary(student, studentFees, currentClass)}
                  className="inline-flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                >
                  <Download className="h-4 w-4" />
                  <span>Download Fee Report</span>
                </button>
              ) : null}
            </div>
            <div className="mt-4 space-y-2 text-sm text-gray-700">
              <div><span className="font-medium text-gray-900">Total Fees:</span> {student?.totalFees ?? 0}</div>
              <div><span className="font-medium text-gray-900">Paid Fees:</span> {student?.paidFees ?? 0}</div>
              <div><span className="font-medium text-gray-900">Pending:</span> {pendingFees}</div>
            </div>
            {studentFees.length > 0 ? (
              <div className="mt-6 space-y-3">
                {studentFees.map((fee) => (
                  <div key={fee.id} className="rounded-xl border border-gray-100 p-4">
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <div className="font-medium text-gray-900">{fee.description}</div>
                        <div className="mt-1 text-sm text-gray-600">Due: {new Date(fee.dueDate).toLocaleDateString()}</div>
                      </div>
                      <div className="text-right text-sm text-gray-700">
                        <div>INR {fee.paidAmount} / {fee.amount}</div>
                        <div className="mt-1 capitalize">{fee.status}</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        );
      default:
        return (
          <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.4fr,1fr]">
            <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
              <h2 className="text-lg font-semibold text-gray-900">Profile</h2>
              <div className="mt-4 space-y-3 text-sm text-gray-700">
                <div><span className="font-medium text-gray-900">Name:</span> {student?.name}</div>
                <div><span className="font-medium text-gray-900">Batch:</span> {student?.batch}</div>
                <div><span className="font-medium text-gray-900">Roll Number:</span> {student?.rollNumber}</div>
                <div><span className="font-medium text-gray-900">Parent Email:</span> {student?.parentEmail}</div>
              </div>
            </div>
            <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
              <h2 className="text-lg font-semibold text-gray-900">Performance Snapshot</h2>
              <div className="mt-4 space-y-3 text-sm text-gray-700">
                <div><span className="font-medium text-gray-900">Scheduled Lectures:</span> {studentLectures.length}</div>
                <div><span className="font-medium text-gray-900">Attendance Percentage:</span> {attendanceSummary.percentage}%</div>
                <div><span className="font-medium text-gray-900">Marks Average:</span> {marksAverage}%</div>
              </div>
            </div>
          </div>
        );
    }
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Student Dashboard</h1>
        <p className="mt-2 text-gray-600">{student ? `Welcome back, ${student.name}.` : 'Your student record is not linked yet.'}</p>
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-4">
        {[
          { label: 'Batch', value: student?.batch ?? '-', icon: User, color: 'from-blue-500 to-blue-600' },
          { label: 'Fee Status', value: student?.feeStatus ?? '-', icon: DollarSign, color: 'from-orange-500 to-orange-600' },
          { label: 'Paid Fees', value: student?.paidFees ?? 0, icon: CheckCircle, color: 'from-green-500 to-green-600' },
          { label: 'Pending Fees', value: pendingFees, icon: Award, color: 'from-purple-500 to-purple-600' },
        ].map((item) => {
          const Icon = item.icon;
          return (
            <div key={item.label} className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-medium text-gray-600">{item.label}</div>
                  <div className="mt-2 text-2xl font-bold text-gray-900">{item.value}</div>
                </div>
                <div className={`rounded-xl bg-gradient-to-r p-3 ${item.color}`}>
                  <Icon className="h-6 w-6 text-white" />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="rounded-2xl border border-gray-100 bg-white p-2 shadow-sm">
        <div className="flex flex-wrap gap-2">
          {[
            { id: 'overview', label: 'Overview' },
            { id: 'schedule', label: 'Schedule' },
            { id: 'attendance', label: 'Attendance' },
            { id: 'marks', label: 'Marks' },
            { id: 'fees', label: 'Fees' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as typeof activeTab)}
              className={`inline-flex items-center space-x-2 rounded-xl px-4 py-2 transition ${
                activeTab === tab.id ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              <Calendar className="h-4 w-4" />
              <span>{tab.label}</span>
            </button>
          ))}
        </div>
      </div>

      {renderContent()}
    </div>
  );
};

export default StudentDashboard;
