import React, { useEffect, useMemo, useState } from 'react';
import { BookOpen, Calendar, Clock, Edit, Plus, Search, Trash2, User } from 'lucide-react';
import { Batch, Lecture, Teacher } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { firebaseService } from '../../services/firebaseService';

const LectureManagement: React.FC = () => {
  const { currentClass } = useAuth();
  const [lectures, setLectures] = useState<Lecture[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [batchesData, setBatchesData] = useState<Batch[]>([]);
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
    batchId: '',
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
      firebaseService.subscribeToBatches(currentClass.id, setBatchesData, (err) => setError(err.message)),
    ];
    return () => unsubs.forEach((unsubscribe) => unsubscribe());
  }, [currentClass?.id]);

  const batches = useMemo(() => {
    if (batchesData.length > 0) {
      return batchesData;
    }

    const names = Array.from(new Set(teachers.flatMap((teacher) => teacher.batches ?? [])));
    const fallback = names.length > 0 ? names : ['Batch A', 'Batch B', 'Batch C'];
    return fallback.map((name) => ({
      id: name,
      name,
      timing: 'TBD',
      teacherId: undefined,
      teacherName: undefined,
      subjects: [],
      classId: currentClass?.id ?? '',
      createdAt: new Date().toISOString(),
    }));
  }, [batchesData, currentClass?.id, teachers]);

  useEffect(() => {
    if (!newLecture.teacherId && teachers[0]) {
      setNewLecture((prev) => ({ ...prev, teacherId: teachers[0].id, teacherName: teachers[0].name }));
    }
  }, [teachers, newLecture.teacherId]);

  useEffect(() => {
    if (!newLecture.batchId && batches[0]) {
      setNewLecture((prev) => ({ ...prev, batchId: batches[0].id, batch: batches[0].name }));
    }
  }, [batches, newLecture.batchId]);

  const filteredLectures = lectures.filter((lecture) => {
    const query = searchTerm.toLowerCase();
    const matchesSearch =
      lecture.title.toLowerCase().includes(query) ||
      lecture.subject.toLowerCase().includes(query) ||
      lecture.teacherName.toLowerCase().includes(query);
    const matchesBatch =
      selectedBatch === 'all' || lecture.batchId === selectedBatch || lecture.batch === selectedBatch;
    const matchesStatus = selectedStatus === 'all' || lecture.status === selectedStatus;
    return matchesSearch && matchesBatch && matchesStatus;
  });

  const resetForm = () => {
    setEditingLecture(null);
    setNewLecture({
      title: '',
      subject: 'Mathematics',
      batch: batches[0]?.name ?? 'Batch A',
      batchId: batches[0]?.id ?? '',
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

  const handleBatchChange = (batchId: string) => {
    const batch = batches.find((item) => item.id === batchId);
    setNewLecture((prev) => ({
      ...prev,
      batchId,
      batch: batch?.name ?? prev.batch,
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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Lecture Management</h1>
          <p className="mt-2 text-gray-600">Schedule and manage class lectures by batch.</p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="flex items-center space-x-2 rounded-lg bg-gradient-to-r from-blue-600 to-purple-600 px-4 py-2 text-white transition-all hover:from-blue-700 hover:to-purple-700"
        >
          <Plus className="h-5 w-5" />
          <span>Schedule Lecture</span>
        </button>
      </div>

      {error ? <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-red-700">{error}</div> : null}

      <div className="rounded-xl border border-gray-100 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 md:flex-row">
          <div className="flex-1">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Search lectures..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full rounded-lg border border-gray-300 py-2 pl-10 pr-4 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
          <div className="flex gap-4">
            <select
              value={selectedBatch}
              onChange={(e) => setSelectedBatch(e.target.value)}
              className="rounded-lg border border-gray-300 px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">All Batches</option>
              {batches.map((batch) => (
                <option key={batch.id} value={batch.id}>
                  {batch.name}
                </option>
              ))}
            </select>
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              className="rounded-lg border border-gray-300 px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">All Status</option>
              <option value="scheduled">Scheduled</option>
              <option value="completed">Completed</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Lecture Details</th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Teacher</th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Schedule</th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Status</th>
                <th className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 bg-white">
              {filteredLectures.map((lecture) => (
                <tr key={lecture.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4">
                    <div className="flex items-center">
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-r from-green-500 to-blue-500">
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
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-purple-100">
                        <User className="h-4 w-4 text-purple-600" />
                      </div>
                      <div className="ml-3 text-sm font-medium text-gray-900">{lecture.teacherName}</div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center space-x-2">
                      <Calendar className="h-4 w-4 text-gray-400" />
                      <span className="text-sm text-gray-900">{new Date(lecture.date).toLocaleDateString()}</span>
                    </div>
                    <div className="mt-1 flex items-center space-x-2">
                      <Clock className="h-4 w-4 text-gray-400" />
                      <span className="text-sm text-gray-500">{lecture.time} ({lecture.duration}min)</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <select
                      value={lecture.status}
                      onChange={(e) => void handleStatusChange(lecture.id, e.target.value as Lecture['status'])}
                      className={`rounded-full border-0 px-2 py-1 text-xs font-semibold ${getStatusColor(lecture.status)}`}
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
                            batchId: lecture.batchId ?? batches.find((item) => item.name === lecture.batch)?.id ?? '',
                            teacherId: lecture.teacherId,
                            teacherName: lecture.teacherName,
                            date: lecture.date,
                            time: lecture.time,
                            duration: lecture.duration,
                            description: lecture.description || '',
                          });
                          setShowAddModal(true);
                        }}
                        className="rounded p-1 text-blue-600 hover:bg-blue-50 hover:text-blue-900"
                      >
                        <Edit className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => void handleDeleteLecture(lecture.id)}
                        className="rounded p-1 text-red-600 hover:bg-red-50 hover:text-red-900"
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

      {showAddModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl bg-white p-6">
            <h2 className="mb-4 text-lg font-semibold text-gray-900">{editingLecture ? 'Edit Lecture' : 'Schedule New Lecture'}</h2>
            <div className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Title</label>
                <input type="text" value={newLecture.title} onChange={(e) => setNewLecture({ ...newLecture, title: e.target.value })} className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Subject</label>
                  <input type="text" value={newLecture.subject} onChange={(e) => setNewLecture({ ...newLecture, subject: e.target.value })} className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Batch</label>
                  <select value={newLecture.batchId} onChange={(e) => handleBatchChange(e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500">
                    {batches.map((batch) => (
                      <option key={batch.id} value={batch.id}>
                        {batch.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Teacher</label>
                <select value={newLecture.teacherId} onChange={(e) => handleTeacherChange(e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500">
                  {teachers.map((teacher) => (
                    <option key={teacher.id} value={teacher.id}>
                      {teacher.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Date</label>
                  <input type="date" value={newLecture.date} onChange={(e) => setNewLecture({ ...newLecture, date: e.target.value })} className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Time</label>
                  <input type="time" value={newLecture.time} onChange={(e) => setNewLecture({ ...newLecture, time: e.target.value })} className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Duration (minutes)</label>
                  <input type="number" value={newLecture.duration} onChange={(e) => setNewLecture({ ...newLecture, duration: Number(e.target.value) })} className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" min="30" step="15" />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Description</label>
                <textarea value={newLecture.description} onChange={(e) => setNewLecture({ ...newLecture, description: e.target.value })} rows={3} className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
            </div>
            <div className="mt-6 flex justify-end space-x-3">
              <button onClick={resetForm} className="px-4 py-2 text-gray-600 transition-colors hover:text-gray-800">Cancel</button>
              <button onClick={() => void handleSaveLecture()} className="rounded-lg bg-gradient-to-r from-blue-600 to-purple-600 px-4 py-2 text-white transition-all hover:from-blue-700 hover:to-purple-700">
                {editingLecture ? 'Update' : 'Schedule'} Lecture
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default LectureManagement;
