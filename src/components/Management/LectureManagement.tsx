import React, { useEffect, useMemo, useState } from 'react';
import { Plus, Search, Edit, Trash2, Calendar, Clock, BookOpen, User } from 'lucide-react';
import { Lecture, Teacher } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { firebaseService } from '../../services/firebaseService';

const LectureManagement: React.FC = () => {
  const { currentClass } = useAuth();
  const [lectures, setLectures] = useState<Lecture[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedBatch, setSelectedBatch] = useState('all');
  const [selectedStatus, setSelectedStatus] = useState('all');
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingLecture, setEditingLecture] = useState<Lecture | null>(null);
  const [newLecture, setNewLecture] = useState({
    title: '',
    subject: 'Mathematics',
    batch: 'Batch A',
    teacherId: '',
    teacherName: '',
    date: '',
    time: '',
    duration: 90,
    description: '',
  });

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
      firebaseService.subscribeToTeachers(currentClass.id, setTeachers, (err) => setError(err.message)),
    ];
    return () => unsubs.forEach((unsubscribe) => unsubscribe());
  }, [currentClass?.id]);

  useEffect(() => {
    if (!newLecture.teacherId && teachers[0]) {
      setNewLecture((prev) => ({ ...prev, teacherId: teachers[0].id, teacherName: teachers[0].name }));
    }
  }, [teachers, newLecture.teacherId]);

  const batches = useMemo(
    () => Array.from(new Set(teachers.flatMap((teacher) => teacher.batches ?? []))).length
      ? Array.from(new Set(teachers.flatMap((teacher) => teacher.batches ?? [])))
      : ['Batch A', 'Batch B', 'Batch C'],
    [teachers]
  );

  const filteredLectures = lectures.filter((lecture) => {
    const matchesSearch =
      lecture.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      lecture.subject.toLowerCase().includes(searchTerm.toLowerCase()) ||
      lecture.teacherName.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesBatch = selectedBatch === 'all' || lecture.batch === selectedBatch;
    const matchesStatus = selectedStatus === 'all' || lecture.status === selectedStatus;
    return matchesSearch && matchesBatch && matchesStatus;
  });

  const resetForm = () => {
    setEditingLecture(null);
    setNewLecture({
      title: '',
      subject: 'Mathematics',
      batch: batches[0] ?? 'Batch A',
      teacherId: teachers[0]?.id ?? '',
      teacherName: teachers[0]?.name ?? '',
      date: '',
      time: '',
      duration: 90,
      description: '',
    });
    setShowAddModal(false);
  };

  const handleTeacherChange = (teacherId: string) => {
    const teacher = teachers.find((item) => item.id === teacherId);
    setNewLecture((prev) => ({
      ...prev,
      teacherId,
      teacherName: teacher?.name ?? '',
    }));
  };

  const handleSaveLecture = async () => {
    if (!currentClass?.id) return;
    setError('');
    try {
      if (editingLecture) {
        await firebaseService.updateLecture(currentClass.id, editingLecture.id, {
          ...editingLecture,
          ...newLecture,
        });
      } else {
        await firebaseService.addLecture(currentClass.id, {
          ...newLecture,
          status: 'scheduled',
        });
      }
      resetForm();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save lecture.');
    }
  };

  const handleDeleteLecture = async (lectureId: string) => {
    if (!currentClass?.id || !window.confirm('Are you sure you want to delete this lecture?')) return;
    try {
      await firebaseService.deleteLecture(currentClass.id, lectureId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete lecture.');
    }
  };

  const handleStatusChange = async (lectureId: string, status: Lecture['status']) => {
    if (!currentClass?.id) return;
    try {
      await firebaseService.updateLecture(currentClass.id, lectureId, { status });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update lecture status.');
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'scheduled':
        return 'bg-blue-100 text-blue-800';
      case 'completed':
        return 'bg-green-100 text-green-800';
      case 'cancelled':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  if (isLoading) {
    return <div className="rounded-xl border border-gray-100 bg-white p-8 text-center text-gray-500">Loading lectures...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Lecture Management</h1>
          <p className="text-gray-600 mt-2">Schedule and manage class lectures</p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="flex items-center space-x-2 bg-gradient-to-r from-blue-600 to-purple-600 text-white px-4 py-2 rounded-lg hover:from-blue-700 hover:to-purple-700 transition-all"
        >
          <Plus className="h-5 w-5" />
          <span>Schedule Lecture</span>
        </button>
      </div>

      {error && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-red-700">{error}</div>}

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-1">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-5 w-5" />
              <input
                type="text"
                placeholder="Search lectures..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
          <div className="flex gap-4">
            <select
              value={selectedBatch}
              onChange={(e) => setSelectedBatch(e.target.value)}
              className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">All Batches</option>
              {batches.map((batch) => (
                <option key={batch} value={batch}>{batch}</option>
              ))}
            </select>
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">All Status</option>
              <option value="scheduled">Scheduled</option>
              <option value="completed">Completed</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Lecture Details</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Teacher</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Schedule</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredLectures.map((lecture) => (
                <tr key={lecture.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4">
                    <div className="flex items-center">
                      <div className="h-10 w-10 rounded-lg bg-gradient-to-r from-green-500 to-blue-500 flex items-center justify-center">
                        <BookOpen className="h-5 w-5 text-white" />
                      </div>
                      <div className="ml-4">
                        <div className="text-sm font-medium text-gray-900">{lecture.title}</div>
                        <div className="text-sm text-gray-500">{lecture.subject} • {lecture.batch}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      <div className="h-8 w-8 rounded-full bg-purple-100 flex items-center justify-center">
                        <User className="h-4 w-4 text-purple-600" />
                      </div>
                      <div className="ml-3">
                        <div className="text-sm font-medium text-gray-900">{lecture.teacherName}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center space-x-2">
                      <Calendar className="h-4 w-4 text-gray-400" />
                      <span className="text-sm text-gray-900">{new Date(lecture.date).toLocaleDateString()}</span>
                    </div>
                    <div className="flex items-center space-x-2 mt-1">
                      <Clock className="h-4 w-4 text-gray-400" />
                      <span className="text-sm text-gray-500">{lecture.time} ({lecture.duration}min)</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <select
                      value={lecture.status}
                      onChange={(e) => void handleStatusChange(lecture.id, e.target.value as Lecture['status'])}
                      className={`text-xs font-semibold rounded-full px-2 py-1 border-0 ${getStatusColor(lecture.status)}`}
                    >
                      <option value="scheduled">Scheduled</option>
                      <option value="completed">Completed</option>
                      <option value="cancelled">Cancelled</option>
                    </select>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <div className="flex justify-end space-x-2">
                      <button
                        onClick={() => {
                          setEditingLecture(lecture);
                          setNewLecture({
                            title: lecture.title,
                            subject: lecture.subject,
                            batch: lecture.batch,
                            teacherId: lecture.teacherId,
                            teacherName: lecture.teacherName,
                            date: lecture.date,
                            time: lecture.time,
                            duration: lecture.duration,
                            description: lecture.description || '',
                          });
                          setShowAddModal(true);
                        }}
                        className="text-blue-600 hover:text-blue-900 p-1 hover:bg-blue-50 rounded"
                      >
                        <Edit className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => void handleDeleteLecture(lecture.id)}
                        className="text-red-600 hover:text-red-900 p-1 hover:bg-red-50 rounded"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {showAddModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">{editingLecture ? 'Edit Lecture' : 'Schedule New Lecture'}</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
                <input type="text" value={newLecture.title} onChange={(e) => setNewLecture({ ...newLecture, title: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Subject</label>
                  <input type="text" value={newLecture.subject} onChange={(e) => setNewLecture({ ...newLecture, subject: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Batch</label>
                  <select value={newLecture.batch} onChange={(e) => setNewLecture({ ...newLecture, batch: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500">
                    {batches.map((batch) => <option key={batch} value={batch}>{batch}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Teacher</label>
                <select value={newLecture.teacherId} onChange={(e) => handleTeacherChange(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500">
                  {teachers.map((teacher) => <option key={teacher.id} value={teacher.id}>{teacher.name}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
                  <input type="date" value={newLecture.date} onChange={(e) => setNewLecture({ ...newLecture, date: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Time</label>
                  <input type="time" value={newLecture.time} onChange={(e) => setNewLecture({ ...newLecture, time: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Duration (minutes)</label>
                  <input type="number" value={newLecture.duration} onChange={(e) => setNewLecture({ ...newLecture, duration: Number(e.target.value) })} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" min="30" step="15" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                <textarea value={newLecture.description} onChange={(e) => setNewLecture({ ...newLecture, description: e.target.value })} rows={3} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
            </div>
            <div className="flex justify-end space-x-3 mt-6">
              <button onClick={resetForm} className="px-4 py-2 text-gray-600 hover:text-gray-800 transition-colors">Cancel</button>
              <button onClick={() => void handleSaveLecture()} className="px-4 py-2 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-lg hover:from-blue-700 hover:to-purple-700 transition-all">
                {editingLecture ? 'Update' : 'Schedule'} Lecture
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default LectureManagement;
