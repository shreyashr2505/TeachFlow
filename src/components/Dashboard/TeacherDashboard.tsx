import React, { useEffect, useMemo, useState } from 'react';
import { BookOpen, Calendar, CheckCircle, Users } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { firebaseService } from '../../services/firebaseService';
import { Student, Teacher } from '../../types';

const TeacherDashboard: React.FC = () => {
  const { user, currentClass } = useAuth();
  const [teacher, setTeacher] = useState<Teacher | null>(null);
  const [students, setStudents] = useState<Student[]>([]);

  useEffect(() => {
    if (!currentClass?.id || !user?.email) return;
    const unsubs = [
      firebaseService.subscribeToTeacherByEmail(currentClass.id, user.email, setTeacher),
      firebaseService.subscribeToStudents(currentClass.id, setStudents),
    ];
    return () => unsubs.forEach((unsubscribe) => unsubscribe());
  }, [currentClass?.id, user?.email]);

  const myStudents = useMemo(
    () => students.filter((student) => teacher?.batches.includes(student.batch)),
    [students, teacher]
  );

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Teacher Dashboard</h1>
        <p className="mt-2 text-gray-600">
          {teacher ? `${teacher.name}, here is your live class summary.` : 'Your teacher profile will appear once linked.'}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
        {[
          { label: 'My Batches', value: teacher?.batches.length ?? 0, icon: Calendar, color: 'from-blue-500 to-blue-600' },
          { label: 'My Students', value: myStudents.length, icon: Users, color: 'from-green-500 to-green-600' },
          { label: 'Subjects', value: teacher?.subjects.length ?? 0, icon: BookOpen, color: 'from-purple-500 to-purple-600' },
          { label: 'Status', value: teacher ? 'Active' : 'Pending', icon: CheckCircle, color: 'from-orange-500 to-orange-600' },
        ].map((item) => {
          const Icon = item.icon;
          return (
            <div key={item.label} className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">{item.label}</p>
                  <p className="mt-2 text-2xl font-bold text-gray-900">{item.value}</p>
                </div>
                <div className={`rounded-xl bg-gradient-to-r p-3 ${item.color}`}>
                  <Icon className="h-6 w-6 text-white" />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.3fr,1fr]">
        <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-gray-900">Assigned Batches</h2>
          <div className="mt-4 space-y-4">
            {teacher?.batches.map((batch) => (
              <div key={batch} className="rounded-xl border border-gray-100 p-4">
                <div className="font-semibold text-gray-900">{batch}</div>
                <div className="text-sm text-gray-600">
                  {myStudents.filter((student) => student.batch === batch).length} students
                </div>
              </div>
            )) ?? <p className="text-sm text-gray-500">No assignments yet.</p>}
          </div>
        </div>

        <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-gray-900">Subjects</h2>
          <div className="mt-4 flex flex-wrap gap-2">
            {teacher?.subjects.map((subject) => (
              <span key={subject} className="rounded-full bg-blue-100 px-3 py-1 text-sm font-medium text-blue-700">
                {subject}
              </span>
            )) ?? <p className="text-sm text-gray-500">No subjects yet.</p>}
          </div>
        </div>
      </div>
    </div>
  );
};

export default TeacherDashboard;
