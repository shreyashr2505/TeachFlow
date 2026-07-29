import React, { useEffect, useMemo, useState } from 'react';
import { BookOpen, Edit, Plus, Search, Trash2, User } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { firebaseService } from '../../services/firebaseService';
import { Teacher } from '../../types';
import FeedbackMessage from '../Common/FeedbackMessage';
import EmptyState from '../Common/EmptyState';
import { isPositiveNumber, isValidEmail, isValidPhone, validateRequired } from '../../utils/validation';

const subjects = ['Mathematics', 'Physics', 'Chemistry', 'Biology', 'English'];
const defaultBatches = ['Batch A', 'Batch B', 'Batch C'];

const TeacherManagement: React.FC = () => {
  const { currentClass, user } = useAuth();
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedSubject, setSelectedSubject] = useState('all');
  const [showModal, setShowModal] = useState(false);
  const [editingTeacher, setEditingTeacher] = useState<Teacher | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    subjects: [] as string[],
    batches: [] as string[],
    salary: 0,
  });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    if (!currentClass?.id) {
      setTeachers([]);
      return;
    }

    const unsubscribe = firebaseService.subscribeToTeachers(currentClass.id, setTeachers);
    return unsubscribe;
  }, [currentClass?.id]);

  const allBatches = useMemo(() => {
    return Array.from(new Set([...defaultBatches, ...teachers.flatMap((teacher) => teacher.batches ?? [])]));
  }, [teachers]);

  const filteredTeachers = teachers.filter((teacher) => {
    const query = searchTerm.toLowerCase();
    const matchesSearch =
      teacher.name.toLowerCase().includes(query) || teacher.email.toLowerCase().includes(query);
    const matchesSubject = selectedSubject === 'all' || (teacher.subjects ?? []).includes(selectedSubject);
    return matchesSearch && matchesSubject;
  });

  const openAddModal = () => {
    setEditingTeacher(null);
    setFormData({ name: '', email: '', phone: '', subjects: [], batches: [], salary: 0 });
    setShowModal(true);
  };

  const closeModal = () => {
    setEditingTeacher(null);
    setFormData({ name: '', email: '', phone: '', subjects: [], batches: [], salary: 0 });
    setShowModal(false);
  };

  const toggleValue = (key: 'subjects' | 'batches', value: string) => {
    setFormData((prev) => ({
      ...prev,
      [key]: prev[key].includes(value) ? prev[key].filter((item) => item !== value) : [...prev[key], value],
    }));
  };

  const saveTeacher = () => {
    setError('');
    setSuccess('');
    if (!currentClass?.id || !formData.name.trim() || !formData.email.trim()) {
      setError(validateRequired('Teacher name', formData.name) || validateRequired('Teacher email', formData.email));
      return;
    }
    if (!isValidEmail(formData.email)) {
      setError('Please enter a valid teacher email.');
      return;
    }
    if (!isValidPhone(formData.phone)) {
      setError('Please enter a valid phone number.');
      return;
    }
    if (!isPositiveNumber(Number(formData.salary))) {
      setError('Salary cannot be negative.');
      return;
    }
    if (formData.subjects.length === 0 || formData.batches.length === 0) {
      setError('Select at least one subject and one batch.');
      return;
    }

    const nextTeacher: Teacher = editingTeacher
      ? { ...editingTeacher, ...formData, salary: Number(formData.salary) || 0 }
      : {
          id: `teacher-${Date.now()}`,
          ...formData,
          salary: Number(formData.salary) || 0,
          classId: currentClass.id,
          joinedAt: new Date().toISOString(),
        };

    if (editingTeacher) {
      void firebaseService.updateTeacher(currentClass.id, editingTeacher.id, nextTeacher);
      setSuccess('Teacher updated successfully.');
    } else {
      void firebaseService.addTeacher(currentClass.id, {
        name: nextTeacher.name,
        email: nextTeacher.email,
        phone: nextTeacher.phone,
        subjects: nextTeacher.subjects,
        batches: nextTeacher.batches,
        salary: nextTeacher.salary,
      });
      if (nextTeacher.email && user) {
        void firebaseService.createInvite({
          email: nextTeacher.email,
          role: 'teacher',
          classId: currentClass.id,
          invitedBy: user.id,
        });
      }
      setSuccess('Teacher added successfully.');
    }
    closeModal();
  };

  const editTeacher = (teacher: Teacher) => {
    setEditingTeacher(teacher);
    setFormData({
      name: teacher.name,
      email: teacher.email,
      phone: teacher.phone ?? '',
      subjects: teacher.subjects ?? [],
      batches: teacher.batches ?? [],
      salary: teacher.salary ?? 0,
    });
    setShowModal(true);
  };

  const deleteTeacher = (teacherId: string) => {
    if (!window.confirm('Delete this teacher from the class?')) {
      return;
    }
    if (currentClass?.id) {
      void firebaseService.deleteTeacher(currentClass.id, teacherId);
      setSuccess('Teacher deleted successfully.');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Teacher Management</h1>
          <p className="mt-2 text-gray-600">Add subject teachers and assign them to batches inside your class.</p>
        </div>
        <button
          onClick={openAddModal}
          className="inline-flex items-center space-x-2 rounded-lg bg-gradient-to-r from-blue-600 to-purple-600 px-4 py-2 text-white transition hover:from-blue-700 hover:to-purple-700"
        >
          <Plus className="h-5 w-5" />
          <span>Add Teacher</span>
        </button>
      </div>

      <FeedbackMessage type="error" message={error} />
      <FeedbackMessage type="success" message={success} />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
          <div className="text-2xl font-bold text-gray-900">{teachers.length}</div>
          <div className="text-sm text-gray-600">Teachers added</div>
        </div>
        <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
          <div className="text-2xl font-bold text-blue-700">{Array.from(new Set(teachers.flatMap((item) => item.subjects ?? []))).length}</div>
          <div className="text-sm text-gray-600">Subjects covered</div>
        </div>
        <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
          <div className="text-2xl font-bold text-purple-700">{Array.from(new Set(teachers.flatMap((item) => item.batches ?? []))).length}</div>
          <div className="text-sm text-gray-600">Batches assigned</div>
        </div>
      </div>

      <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 md:flex-row">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Search by teacher name or email"
              className="w-full rounded-lg border border-gray-300 py-2 pl-10 pr-4 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <select
            value={selectedSubject}
            onChange={(event) => setSelectedSubject(event.target.value)}
            className="rounded-lg border border-gray-300 px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">All subjects</option>
            {subjects.map((subject) => (
              <option key={subject} value={subject}>
                {subject}
              </option>
            ))}
          </select>
        </div>
      </div>

      {filteredTeachers.length === 0 ? (
        <EmptyState title="No teachers found" description="Add a teacher to start assigning subjects and batches." />
      ) : (
      <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Teacher</th>
                <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Subjects</th>
                <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Batches</th>
                <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Salary</th>
                <th className="px-6 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 bg-white">
              {filteredTeachers.map((teacher) => (
                <tr key={teacher.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4">
                    <div className="flex items-center space-x-3">
                      <div className="rounded-full bg-gradient-to-r from-purple-500 to-blue-500 p-3 text-white">
                        <User className="h-4 w-4" />
                      </div>
                      <div>
                        <div className="font-medium text-gray-900">{teacher.name}</div>
                        <div className="text-sm text-gray-500">{teacher.email}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-700">
                    <div className="flex flex-wrap gap-2">
                      {(teacher.subjects ?? []).map((subject) => (
                        <span key={subject} className="rounded-full bg-green-100 px-2 py-1 text-xs font-medium text-green-700">
                          {subject}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-700">
                    <div className="flex flex-wrap gap-2">
                      {(teacher.batches ?? []).map((batch) => (
                        <span key={batch} className="rounded-full bg-blue-100 px-2 py-1 text-xs font-medium text-blue-700">
                          {batch}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-700">{teacher.salary?.toLocaleString('en-IN')}</td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex justify-end space-x-2">
                      <button onClick={() => editTeacher(teacher)} className="rounded-lg p-2 text-blue-600 transition hover:bg-blue-50">
                        <Edit className="h-4 w-4" />
                      </button>
                      <button onClick={() => deleteTeacher(teacher.id)} className="rounded-lg p-2 text-red-600 transition hover:bg-red-50">
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
      )}

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
          <div className="w-full max-w-3xl rounded-2xl bg-white p-6 shadow-2xl">
            <div className="mb-5 flex items-center justify-between">
              <h2 className="text-xl font-semibold text-gray-900">
                {editingTeacher ? 'Edit Teacher' : 'Add Teacher to Class'}
              </h2>
              <BookOpen className="h-5 w-5 text-purple-600" />
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Teacher Name</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(event) => setFormData((prev) => ({ ...prev, name: event.target.value }))}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Email</label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={(event) => setFormData((prev) => ({ ...prev, email: event.target.value }))}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Phone</label>
                <input
                  type="tel"
                  value={formData.phone}
                  onChange={(event) => setFormData((prev) => ({ ...prev, phone: event.target.value }))}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Salary</label>
                <input
                  type="number"
                  value={formData.salary}
                  onChange={(event) => setFormData((prev) => ({ ...prev, salary: Number(event.target.value) }))}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            <div className="mt-5">
              <label className="mb-2 block text-sm font-medium text-gray-700">Subjects</label>
              <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
                {subjects.map((subject) => (
                  <label key={subject} className="flex items-center space-x-2 rounded-lg border border-gray-200 p-3">
                    <input
                      type="checkbox"
                      checked={formData.subjects.includes(subject)}
                      onChange={() => toggleValue('subjects', subject)}
                    />
                    <span className="text-sm text-gray-700">{subject}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="mt-5">
              <label className="mb-2 block text-sm font-medium text-gray-700">Assigned Batches</label>
              <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
                {allBatches.map((batch) => (
                  <label key={batch} className="flex items-center space-x-2 rounded-lg border border-gray-200 p-3">
                    <input
                      type="checkbox"
                      checked={formData.batches.includes(batch)}
                      onChange={() => toggleValue('batches', batch)}
                    />
                    <span className="text-sm text-gray-700">{batch}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="mt-6 flex justify-end space-x-3">
              <button onClick={closeModal} className="rounded-lg px-4 py-2 text-gray-600 transition hover:bg-gray-100">
                Cancel
              </button>
              <button
                onClick={saveTeacher}
                className="rounded-lg bg-gradient-to-r from-blue-600 to-purple-600 px-4 py-2 text-white transition hover:from-blue-700 hover:to-purple-700"
              >
                {editingTeacher ? 'Update Teacher' : 'Add Teacher'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TeacherManagement;
