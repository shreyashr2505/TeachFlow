import React, { useEffect, useMemo, useState } from 'react';
import { Search, Calendar, CheckCircle, XCircle, Users, BookOpen } from 'lucide-react';
import { Attendance, Lecture, Student } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { firebaseService } from '../../services/firebaseService';
import FeedbackMessage from '../Common/FeedbackMessage';
import EmptyState from '../Common/EmptyState';

const AttendanceManagement: React.FC = () => {
  const { currentClass, user } = useAuth();
  const [selectedLecture, setSelectedLecture] = useState('');
  const [attendanceData, setAttendanceData] = useState<Attendance[]>([]);
  const [lectures, setLectures] = useState<Lecture[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    if (!currentClass?.id) return;
    setIsLoading(true);
    const unsubs = [
      firebaseService.subscribeToLectures(
        currentClass.id,
        (data) => {
          setLectures(data);
          setIsLoading(false);
        },
        (err) => {
          setError(err.message);
          setIsLoading(false);
        }
      ),
      firebaseService.subscribeToStudents(currentClass.id, setStudents, (err) => setError(err.message)),
      firebaseService.subscribeToAttendance(currentClass.id, setAttendanceData, (err) => setError(err.message)),
    ];
    return () => unsubs.forEach((unsubscribe) => unsubscribe());
  }, [currentClass?.id]);

  const selectedLectureData = lectures.find((lecture) => lecture.id === selectedLecture);
  const studentsToShow = useMemo(
    () =>
      students.filter(
        (student) =>
          student.batch === selectedLectureData?.batch &&
          student.name.toLowerCase().includes(searchTerm.toLowerCase())
      ),
    [students, selectedLectureData?.batch, searchTerm]
  );

  const mergedAttendance = useMemo(
    () =>
      studentsToShow.map((student) => {
        const existing = attendanceData.find(
          (attendance) => attendance.lectureId === selectedLecture && attendance.studentId === student.id
        );
        return (
          existing ?? {
            id: `${selectedLecture}-${student.id}`,
            lectureId: selectedLecture,
            studentId: student.id,
            studentName: student.name,
            classId: currentClass?.id,
            lectureTitle: selectedLectureData?.title,
            batch: student.batch,
            date: selectedLectureData?.date,
            status: 'present' as const,
            markedAt: new Date().toISOString(),
            markedBy: user?.id ?? 'unknown',
          }
        );
      }),
    [studentsToShow, attendanceData, selectedLecture, currentClass?.id, selectedLectureData?.title, selectedLectureData?.date, user?.id]
  );

  const monthlySummary = useMemo(() => {
    const currentMonth = new Date().toISOString().slice(0, 7);
    const thisMonth = attendanceData.filter((item) => (item.date ?? item.markedAt).slice(0, 7) === currentMonth);
    const present = thisMonth.filter((item) => item.status === 'present').length;
    const percentage = thisMonth.length > 0 ? Math.round((present / thisMonth.length) * 100) : 0;
    return { total: thisMonth.length, present, percentage };
  }, [attendanceData]);

  const canMarkAttendance = useMemo(() => {
    if (!selectedLectureData) return false;
    if (user?.role === 'admin') return true;

    const start = new Date(`${selectedLectureData.date}T${selectedLectureData.time}`);
    const end = new Date(start.getTime() + selectedLectureData.duration * 60 * 1000);
    const now = new Date();

    return now >= start && now <= end;
  }, [selectedLectureData, user?.role]);

  const handleAttendanceChange = (studentId: string, status: 'present' | 'absent') => {
    if (!canMarkAttendance) return;

    setAttendanceData((prev) => {
      const existing = prev.find((item) => item.lectureId === selectedLecture && item.studentId === studentId);
      if (existing) {
        return prev.map((item) =>
          item.lectureId === selectedLecture && item.studentId === studentId
            ? { ...item, status, markedAt: new Date().toISOString() }
            : item
        );
      }
      const student = students.find((item) => item.id === studentId);
      if (!student) return prev;
      return [
        ...prev,
        {
          id: `${selectedLecture}-${studentId}`,
          lectureId: selectedLecture,
          studentId,
          studentName: student.name,
          classId: currentClass?.id,
          lectureTitle: selectedLectureData?.title,
          batch: student.batch,
          date: selectedLectureData?.date,
          status,
          markedAt: new Date().toISOString(),
          markedBy: user?.id ?? 'unknown',
        },
      ];
    });
  };

  const handleSaveAttendance = async () => {
    if (!currentClass?.id || !selectedLecture || !user) return;
    if (!canMarkAttendance) {
      setError('Attendance can only be marked during the lecture time unless you are an admin.');
      return;
    }
    try {
      await firebaseService.saveAttendanceBatch(currentClass.id, mergedAttendance);
      await firebaseService.createAuditLog(currentClass.id, {
        actorId: user.id,
        actorName: user.name,
        action: 'saved attendance',
        entityType: 'attendance',
        entityId: selectedLecture,
        metadata: { lectureTitle: selectedLectureData?.title ?? '', total: mergedAttendance.length },
      });
      setSuccess('Attendance saved successfully.');
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save attendance.');
    }
  };

  const stats = {
    total: mergedAttendance.length,
    present: mergedAttendance.filter((item) => item.status === 'present').length,
    absent: mergedAttendance.filter((item) => item.status === 'absent').length,
    percentage:
      mergedAttendance.length > 0
        ? Math.round((mergedAttendance.filter((item) => item.status === 'present').length / mergedAttendance.length) * 100)
        : 0,
  };

  if (isLoading) {
    return <div className="rounded-xl border border-gray-100 bg-white p-8 text-center text-gray-500">Loading attendance...</div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Attendance Management</h1>
        <p className="text-gray-600 mt-2">Track lecture attendance with monthly summaries and batch-wise records.</p>
      </div>

      <FeedbackMessage type="error" message={error} />
      <FeedbackMessage type="success" message={success} />

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6"><div className="text-sm font-medium text-gray-600">Monthly Records</div><div className="mt-2 text-2xl font-bold text-gray-900">{monthlySummary.total}</div></div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6"><div className="text-sm font-medium text-gray-600">Monthly Present</div><div className="mt-2 text-2xl font-bold text-green-700">{monthlySummary.present}</div></div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6"><div className="text-sm font-medium text-gray-600">Monthly %</div><div className="mt-2 text-2xl font-bold text-blue-700">{monthlySummary.percentage}%</div></div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6"><div className="text-sm font-medium text-gray-600">Lectures</div><div className="mt-2 text-2xl font-bold text-purple-700">{lectures.length}</div></div>
      </div>

      {lectures.length === 0 ? (
        <EmptyState title="No lectures available" description="Schedule lectures first, then you can mark attendance per lecture." />
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Select Lecture</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {lectures.map((lecture) => (
              <div
                key={lecture.id}
                onClick={() => setSelectedLecture(lecture.id)}
                className={`p-4 border rounded-lg cursor-pointer transition-all ${
                  selectedLecture === lecture.id ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                }`}
              >
                <div className="flex items-center space-x-3">
                  <div className="p-2 bg-blue-100 rounded-lg">
                    <BookOpen className="h-5 w-5 text-blue-600" />
                  </div>
                  <div className="flex-1">
                    <h3 className="font-medium text-gray-900">{lecture.title}</h3>
                    <p className="text-sm text-gray-600">{lecture.subject} • {lecture.batch}</p>
                    <p className="text-xs text-gray-500">{new Date(lecture.date).toLocaleDateString()} at {lecture.time}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {selectedLecture && selectedLectureData ? (
        <>
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
            <div className="flex justify-between items-start mb-4">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">{selectedLectureData.title}</h2>
                <p className="text-gray-600">{selectedLectureData.subject} • {selectedLectureData.batch} • {selectedLectureData.teacherName}</p>
              </div>
              <div className="flex space-x-4">
                <div className="text-center"><div className="text-2xl font-bold text-green-600">{stats.present}</div><div className="text-sm text-gray-600">Present</div></div>
                <div className="text-center"><div className="text-2xl font-bold text-red-600">{stats.absent}</div><div className="text-sm text-gray-600">Absent</div></div>
                <div className="text-center"><div className="text-2xl font-bold text-blue-600">{stats.percentage}%</div><div className="text-sm text-gray-600">Attendance</div></div>
              </div>
            </div>
            <div className="flex justify-between items-center">
              <div className="relative flex-1 max-w-md">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-5 w-5" />
                <input type="text" placeholder="Search students..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <button
                onClick={() => void handleSaveAttendance()}
                disabled={!canMarkAttendance}
                className="ml-4 bg-gradient-to-r from-blue-600 to-purple-600 text-white px-6 py-2 rounded-lg hover:from-blue-700 hover:to-purple-700 transition-all disabled:cursor-not-allowed disabled:opacity-50"
              >
                Save Attendance
              </button>
            </div>
            {!canMarkAttendance ? (
              <p className="mt-3 text-sm text-amber-600">
                Teachers can mark attendance only during the scheduled lecture window. Admins can override this restriction.
              </p>
            ) : null}
          </div>

          {studentsToShow.length === 0 ? (
            <EmptyState title="No students in this lecture batch" description="Add students to this batch to start taking attendance." />
          ) : (
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-200"><h3 className="text-lg font-semibold text-gray-900">Student Attendance</h3></div>
              <div className="divide-y divide-gray-200">
                {studentsToShow.map((student) => {
                  const attendance = mergedAttendance.find((item) => item.studentId === student.id);
                  return (
                    <div key={student.id} className="px-6 py-4 flex items-center justify-between hover:bg-gray-50">
                      <div className="flex items-center space-x-4">
                        <div className="h-10 w-10 rounded-full bg-gradient-to-r from-blue-500 to-purple-500 flex items-center justify-center"><Users className="h-5 w-5 text-white" /></div>
                        <div><h4 className="font-medium text-gray-900">{student.name}</h4><p className="text-sm text-gray-600">Roll No: {student.rollNumber}</p></div>
                      </div>
                      <div className="flex items-center space-x-3">
                        <button
                          onClick={() => handleAttendanceChange(student.id, 'present')}
                          disabled={!canMarkAttendance}
                          className={`flex items-center space-x-2 px-4 py-2 rounded-lg transition-all disabled:cursor-not-allowed disabled:opacity-60 ${attendance?.status === 'present' ? 'bg-green-100 text-green-800 border-2 border-green-300' : 'bg-gray-100 text-gray-600 hover:bg-green-50 hover:text-green-700'}`}
                        ><CheckCircle className="h-4 w-4" /><span>Present</span></button>
                        <button
                          onClick={() => handleAttendanceChange(student.id, 'absent')}
                          disabled={!canMarkAttendance}
                          className={`flex items-center space-x-2 px-4 py-2 rounded-lg transition-all disabled:cursor-not-allowed disabled:opacity-60 ${attendance?.status === 'absent' ? 'bg-red-100 text-red-800 border-2 border-red-300' : 'bg-gray-100 text-gray-600 hover:bg-red-50 hover:text-red-700'}`}
                        ><XCircle className="h-4 w-4" /><span>Absent</span></button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </>
      ) : lectures.length > 0 ? (
        <EmptyState title="Select a lecture" description="Choose a lecture to mark attendance and review attendance percentages." />
      ) : null}
    </div>
  );
};

export default AttendanceManagement;
