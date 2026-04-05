import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  BarChart3,
  BookOpen,
  Calendar,
  DollarSign,
  FileText,
  GraduationCap,
  TrendingUp,
  UserCheck,
  Users,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { firebaseService } from '../../services/firebaseService';
import { Student, Teacher } from '../../types';

interface AdminDashboardProps {
  onNavigate: (tab: string) => void;
}

const AdminDashboard: React.FC<AdminDashboardProps> = ({ onNavigate }) => {
  const { currentClass } = useAuth();
  const [students, setStudents] = useState<Student[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);

  useEffect(() => {
    if (!currentClass?.id) return;
    const unsubscribeStudents = firebaseService.subscribeToStudents(currentClass.id, setStudents);
    const unsubscribeTeachers = firebaseService.subscribeToTeachers(currentClass.id, setTeachers);
    return () => {
      unsubscribeStudents();
      unsubscribeTeachers();
    };
  }, [currentClass?.id]);

  const batchCounts = useMemo(
    () =>
      students.reduce<Record<string, number>>((acc, student) => {
        acc[student.batch] = (acc[student.batch] || 0) + 1;
        return acc;
      }, {}),
    [students]
  );

  const pendingFees = students.reduce((sum, student) => sum + Math.max(student.totalFees - student.paidFees, 0), 0);
  const collectedFees = students.reduce((sum, student) => sum + student.paidFees, 0);

  const stats = [
    { title: 'Students', value: students.length, icon: GraduationCap, color: 'from-blue-500 to-blue-600', trend: `${Object.keys(batchCounts).length} batches` },
    { title: 'Teachers', value: teachers.length, icon: Users, color: 'from-purple-500 to-purple-600', trend: `${teachers.reduce((sum, teacher) => sum + teacher.subjects.length, 0)} subjects` },
    { title: 'Pending Fees', value: pendingFees.toLocaleString('en-IN'), icon: AlertCircle, color: 'from-orange-500 to-orange-600', trend: 'From student billing' },
    { title: 'Collected Fees', value: collectedFees.toLocaleString('en-IN'), icon: DollarSign, color: 'from-teal-500 to-teal-600', trend: 'Realtime from records' },
    { title: 'Batches', value: Object.keys(batchCounts).length, icon: BookOpen, color: 'from-green-500 to-green-600', trend: 'Active class groups' },
    { title: 'Attendance', value: 'Live', icon: TrendingUp, color: 'from-indigo-500 to-indigo-600', trend: 'Ready for Firebase expansion' },
  ];

  const quickActions = [
    { id: 'students', title: 'Add Student', description: 'Create student profiles in this class', icon: GraduationCap },
    { id: 'teachers', title: 'Add Teacher', description: 'Assign teachers to batches', icon: UserCheck },
    { id: 'lectures', title: 'Schedule Lecture', description: 'Plan class sessions', icon: BookOpen },
    { id: 'attendance', title: 'Attendance', description: 'Track lecture attendance', icon: Calendar },
    { id: 'marks', title: 'Marks', description: 'Enter performance data', icon: FileText },
    { id: 'fees', title: 'Fees', description: 'Manage billing status', icon: DollarSign },
  ];

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-sm font-medium text-blue-600">Admin Workspace</p>
          <h1 className="text-3xl font-bold text-gray-900">{currentClass?.name ?? 'Your Coaching Class'}</h1>
          <p className="mt-2 max-w-2xl text-gray-600">Your active class now runs on Firebase Auth and Firestore.</p>
        </div>
        {currentClass && (
          <div className="rounded-2xl border border-blue-100 bg-blue-50 px-5 py-4">
            <div className="text-xs uppercase tracking-wide text-blue-700">Class URL</div>
            <div className="mt-1 font-semibold text-blue-900">teachflow.com/class/{currentClass.subdomain}</div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
        {stats.map((stat) => {
          const Icon = stat.icon;
          return (
            <div key={stat.title} className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">{stat.title}</p>
                  <p className="mt-2 text-2xl font-bold text-gray-900">{stat.value}</p>
                  <p className="mt-2 text-sm text-gray-500">{stat.trend}</p>
                </div>
                <div className={`rounded-xl bg-gradient-to-r p-3 ${stat.color}`}>
                  <Icon className="h-6 w-6 text-white" />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.5fr,1fr]">
        <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
          <div className="mb-5 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900">Quick Actions</h2>
            <BarChart3 className="h-5 w-5 text-gray-400" />
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {quickActions.map((action) => {
              const Icon = action.icon;
              return (
                <button
                  key={action.id}
                  onClick={() => onNavigate(action.id)}
                  className="rounded-2xl border border-gray-200 p-5 text-left transition hover:border-blue-300 hover:bg-blue-50"
                >
                  <div className="mb-3 inline-flex rounded-xl bg-blue-100 p-3 text-blue-700">
                    <Icon className="h-5 w-5" />
                  </div>
                  <h3 className="font-semibold text-gray-900">{action.title}</h3>
                  <p className="mt-1 text-sm text-gray-600">{action.description}</p>
                </button>
              );
            })}
          </div>
        </div>

        <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-gray-900">Batch Snapshot</h2>
          <div className="mt-5 space-y-4">
            {Object.entries(batchCounts).map(([batch, count]) => (
              <div key={batch}>
                <div className="mb-2 flex items-center justify-between text-sm text-gray-600">
                  <span>{batch}</span>
                  <span>{count} students</span>
                </div>
                <div className="h-2 rounded-full bg-gray-100">
                  <div
                    className="h-2 rounded-full bg-gradient-to-r from-blue-500 to-purple-500"
                    style={{ width: `${Math.max((count / Math.max(students.length, 1)) * 100, 15)}%` }}
                  />
                </div>
              </div>
            ))}
            {students.length === 0 && <p className="text-sm text-gray-500">Add students to populate your class.</p>}
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminDashboard;
