import React, { useEffect, useMemo, useState } from 'react';
import { Award, CheckCircle, DollarSign, Download, Mail, Phone, User } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { firebaseService } from '../../services/firebaseService';
import EmptyState from '../Common/EmptyState';
import StyledSelect from '../Common/StyledSelect';
import { pdfService } from '../../services/pdfService';
import { Attendance, Fee, Marks, Student, Teacher } from '../../types';

interface ParentDashboardProps {
  initialTab?: 'overview' | 'attendance' | 'marks' | 'fees';
}

const ParentDashboard: React.FC<ParentDashboardProps> = ({ initialTab = 'overview' }) => {
  const { user, currentClass } = useAuth();
  const [activeTab, setActiveTab] = useState(initialTab);
  const [children, setChildren] = useState<Student[]>([]);
  const [selectedChildId, setSelectedChildId] = useState('');
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [attendance, setAttendance] = useState<Attendance[]>([]);
  const [marks, setMarks] = useState<Marks[]>([]);
  const [fees, setFees] = useState<Fee[]>([]);

  useEffect(() => setActiveTab(initialTab), [initialTab]);

  useEffect(() => {
    if (!currentClass?.id) return;
    const linkedIds = user?.linkedStudentIds ?? (user?.linkedStudentId ? [user.linkedStudentId] : []);
    return firebaseService.subscribeToStudentsByIds(currentClass.id, linkedIds, setChildren);
  }, [currentClass?.id, user?.linkedStudentId, user?.linkedStudentIds]);

  useEffect(() => {
    if (!selectedChildId && children[0]) {
      setSelectedChildId(children[0].id);
    }
    if (children.length > 0 && !children.some((child) => child.id === selectedChildId)) {
      setSelectedChildId(children[0].id);
    }
  }, [children, selectedChildId]);

  useEffect(() => {
    if (!currentClass?.id || activeTab !== 'overview') {
      setTeachers([]);
      return;
    }
    return firebaseService.subscribeToTeachers(currentClass.id, setTeachers);
  }, [activeTab, currentClass?.id]);

  const child = useMemo(
    () => children.find((item) => item.id === selectedChildId) ?? children[0] ?? null,
    [children, selectedChildId]
  );

  useEffect(() => {
    if (!currentClass?.id || !child?.id) {
      setAttendance([]);
      setMarks([]);
      setFees([]);
      return;
    }

    const unsubs = [
      firebaseService.subscribeToAttendanceByStudent(currentClass.id, child.id, setAttendance),
      firebaseService.subscribeToMarksByStudent(currentClass.id, child.id, setMarks),
      firebaseService.subscribeToFeesByStudent(currentClass.id, child.id, setFees),
    ];
    return () => unsubs.forEach((unsubscribe) => unsubscribe());
  }, [child?.id, currentClass?.id]);

  const childTeachers = useMemo(
    () => teachers.filter((teacher) => (child?.batchId ? (teacher.batchIds ?? []).includes(child.batchId) : (teacher.batches ?? []).includes(child?.batch ?? ''))),
    [child?.batch, child?.batchId, teachers]
  );
  const childAttendance = useMemo(
    () => attendance.filter((item) => item.studentId === child?.id).sort((a, b) => new Date(b.date ?? b.markedAt).getTime() - new Date(a.date ?? a.markedAt).getTime()),
    [attendance, child?.id]
  );
  const childMarks = useMemo(
    () => marks.filter((item) => item.studentId === child?.id).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()),
    [marks, child?.id]
  );
  const childFees = useMemo(
    () => fees.filter((item) => item.studentId === child?.id).sort((a, b) => new Date(b.dueDate).getTime() - new Date(a.dueDate).getTime()),
    [fees, child?.id]
  );

  const pendingFees = Math.max((child?.totalFees ?? 0) - (child?.paidFees ?? 0), 0);
  const attendancePercentage = useMemo(() => {
    if (childAttendance.length === 0) return 0;
    const present = childAttendance.filter((item) => item.status === 'present').length;
    return Math.round((present / childAttendance.length) * 100);
  }, [childAttendance]);
  const marksAverage = useMemo(() => {
    if (childMarks.length === 0) return 0;
    const totalObtained = childMarks.reduce((sum, item) => sum + item.obtainedMarks, 0);
    const totalMarks = childMarks.reduce((sum, item) => sum + item.totalMarks, 0);
    return totalMarks > 0 ? Math.round((totalObtained / totalMarks) * 100) : 0;
  }, [childMarks]);

  const renderContent = () => {
    if (!child) {
      return <EmptyState title="No linked child found" description="This parent account does not have any linked student IDs yet." />;
    }

    switch (activeTab) {
      case 'attendance':
        return childAttendance.length === 0 ? (
          <EmptyState title="No attendance records yet" description="Attendance will appear here once lectures are marked." />
        ) : (
          <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between gap-4">
              <h2 className="text-lg font-semibold text-gray-900">Attendance Records</h2>
              <button onClick={() => pdfService.downloadAttendanceReport(child, childAttendance, currentClass)} className="inline-flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50">
                <Download className="h-4 w-4" />
                <span>Download Attendance</span>
              </button>
            </div>
            <div className="mt-4 space-y-3">
              {childAttendance.map((item) => (
                <div key={item.id} className="flex items-center justify-between rounded-xl border border-gray-100 p-4">
                  <div>
                    <div className="font-medium text-gray-900">{item.lectureTitle ?? 'Lecture'}</div>
                    <div className="mt-1 text-sm text-gray-600">{item.batch}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm text-gray-500">{new Date(item.date ?? item.markedAt).toLocaleDateString()}</div>
                    <span className={`mt-2 inline-flex rounded-full px-3 py-1 text-xs font-semibold ${item.status === 'present' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>{item.status}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      case 'marks':
        return childMarks.length === 0 ? (
          <EmptyState title="No marks records yet" description="Published exam results will appear here." />
        ) : (
          <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between gap-4">
              <h2 className="text-lg font-semibold text-gray-900">Marks Records</h2>
              <button onClick={() => pdfService.downloadStudentReport(child, childMarks, currentClass)} className="inline-flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50">
                <Download className="h-4 w-4" />
                <span>Download Marks</span>
              </button>
            </div>
            <div className="mt-4 space-y-3">
              {childMarks.map((mark) => (
                <div key={mark.id} className="flex items-center justify-between rounded-xl border border-gray-100 p-4">
                  <div>
                    <div className="font-medium text-gray-900">{mark.examName}</div>
                    <div className="mt-1 text-sm text-gray-600">{mark.subject} • {mark.examType}</div>
                  </div>
                  <div className="text-right">
                    <div className="font-semibold text-gray-900">{mark.obtainedMarks}/{mark.totalMarks}</div>
                    <div className="mt-1 text-sm text-blue-700">{Math.round((mark.obtainedMarks / mark.totalMarks) * 100)}%</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      case 'fees':
        return (
          <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between gap-4">
              <h2 className="text-lg font-semibold text-gray-900">Fee Overview</h2>
              <button onClick={() => pdfService.downloadFeeSummary(child, childFees, currentClass)} className="inline-flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50">
                <Download className="h-4 w-4" />
                <span>Download Fee Report</span>
              </button>
            </div>
            <div className="mt-4 space-y-2 text-sm text-gray-700">
              <div><span className="font-medium text-gray-900">Total Fees:</span> {child.totalFees}</div>
              <div><span className="font-medium text-gray-900">Paid Fees:</span> {child.paidFees}</div>
              <div><span className="font-medium text-gray-900">Pending Fees:</span> {pendingFees}</div>
            </div>
            {childFees.length > 0 ? (
              <div className="mt-6 space-y-3">
                {childFees.map((fee) => (
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
          <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.2fr,1fr]">
            <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
              <h2 className="text-lg font-semibold text-gray-900">Child Information</h2>
              <div className="mt-4 space-y-3 text-sm text-gray-700">
                <div><span className="font-medium text-gray-900">Name:</span> {child.name}</div>
                <div><span className="font-medium text-gray-900">Batch:</span> {child.batch}</div>
                <div><span className="font-medium text-gray-900">Roll Number:</span> {child.rollNumber}</div>
                <div><span className="font-medium text-gray-900">Student Email:</span> {child.email}</div>
                <div><span className="font-medium text-gray-900">Attendance:</span> {attendancePercentage}%</div>
                <div><span className="font-medium text-gray-900">Marks Average:</span> {marksAverage}%</div>
              </div>
            </div>
            <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
              <h2 className="text-lg font-semibold text-gray-900">Teacher Contacts</h2>
              <div className="mt-4 space-y-4">
                {childTeachers.length === 0 ? (
                  <p className="text-sm text-gray-500">No teacher contacts available yet.</p>
                ) : (
                  childTeachers.map((teacher) => (
                    <div key={teacher.id} className="rounded-xl border border-gray-100 p-4">
                      <div className="font-semibold text-gray-900">{teacher.name}</div>
                      <div className="mt-2 flex items-center gap-2 text-sm text-gray-600">
                        <Mail className="h-4 w-4" />
                        <span>{teacher.email}</span>
                      </div>
                      <div className="mt-1 flex items-center gap-2 text-sm text-gray-600">
                        <Phone className="h-4 w-4" />
                        <span>{teacher.phone}</span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        );
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Parent Dashboard</h1>
          <p className="mt-2 text-gray-600">{child ? `Track ${child.name}'s class progress.` : 'No linked child found yet.'}</p>
        </div>
        {children.length > 1 ? (
          <StyledSelect
            value={child?.id ?? ''}
            options={children.map((item) => ({ value: item.id, label: item.name }))}
            onChange={setSelectedChildId}
            buttonClassName="min-w-[180px]"
          />
        ) : null}
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-4">
        {[
          { label: 'Child', value: child?.name ?? '-', icon: User, color: 'from-blue-500 to-blue-600' },
          { label: 'Attendance', value: `${attendancePercentage}%`, icon: CheckCircle, color: 'from-green-500 to-green-600' },
          { label: 'Marks Avg', value: `${marksAverage}%`, icon: Award, color: 'from-purple-500 to-purple-600' },
          { label: 'Pending Fees', value: pendingFees, icon: DollarSign, color: 'from-orange-500 to-orange-600' },
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
            { id: 'attendance', label: 'Attendance' },
            { id: 'marks', label: 'Marks' },
            { id: 'fees', label: 'Fees' },
          ].map((tab) => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id as typeof activeTab)} className={`rounded-xl px-4 py-2 transition ${activeTab === tab.id ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-100'}`}>
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {renderContent()}
    </div>
  );
};

export default ParentDashboard;
