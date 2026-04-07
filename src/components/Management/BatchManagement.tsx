import React, { useEffect, useMemo, useState } from 'react';
import { BookOpen, Clock3, Edit, Layers3, Plus, Trash2, UserCheck } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { firebaseService } from '../../services/firebaseService';
import { Batch, Teacher } from '../../types';
import EmptyState from '../Common/EmptyState';
import FeedbackMessage from '../Common/FeedbackMessage';

const emptyForm = {
  name: '',
  timing: '',
  teacherId: '',
};

const BatchManagement: React.FC = () => {
  const { currentClass } = useAuth();
  const [batches, setBatches] = useState<Batch[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [editingBatch, setEditingBatch] = useState<Batch | null>(null);
  const [formData, setFormData] = useState(emptyForm);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    if (!currentClass?.id) {
      setBatches([]);
      setTeachers([]);
      return;
    }

    const unsubs = [
      firebaseService.subscribeToBatches(currentClass.id, setBatches, (err) => setError(err.message)),
      firebaseService.subscribeToTeachers(currentClass.id, setTeachers, (err) => setError(err.message)),
    ];

    return () => unsubs.forEach((unsubscribe) => unsubscribe());
  }, [currentClass?.id]);

  const teacherOptions = useMemo(
    () => teachers.map((teacher) => ({ id: teacher.id, name: teacher.name })),
    [teachers]
  );

  const resetModal = () => {
    setEditingBatch(null);
    setFormData(emptyForm);
    setShowModal(false);
  };

  const openCreate = () => {
    setEditingBatch(null);
    setFormData({ ...emptyForm, teacherId: teacherOptions[0]?.id ?? '' });
    setShowModal(true);
  };

  const openEdit = (batch: Batch) => {
    setEditingBatch(batch);
    setFormData({
      name: batch.name,
      timing: batch.timing,
      teacherId: batch.teacherId ?? '',
    });
    setShowModal(true);
  };

  const saveBatch = async () => {
    if (!currentClass?.id) return;
    if (!formData.name.trim() || !formData.timing.trim()) {
      setError('Batch name and timing are required.');
      return;
    }

    setError('');
    setSuccess('');
    const teacher = teachers.find((item) => item.id === formData.teacherId);

    try {
      if (editingBatch) {
        await firebaseService.updateBatch(currentClass.id, editingBatch.id, {
          name: formData.name.trim(),
          timing: formData.timing.trim(),
          teacherId: teacher?.id,
          teacherName: teacher?.name,
          subjects: editingBatch.subjects ?? [],
        });
        setSuccess('Batch updated successfully.');
      } else {
        await firebaseService.addBatch(currentClass.id, {
          name: formData.name.trim(),
          timing: formData.timing.trim(),
          teacherId: teacher?.id,
          teacherName: teacher?.name,
          subjects: [],
        });
        setSuccess('Batch created successfully.');
      }

      resetModal();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save batch.');
    }
  };

  const deleteBatch = async (batchId: string) => {
    if (!currentClass?.id || !window.confirm('Delete this batch?')) {
      return;
    }

    setError('');
    setSuccess('');
    try {
      await firebaseService.deleteBatch(currentClass.id, batchId);
      setSuccess('Batch deleted successfully.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete batch.');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Batch Management</h1>
          <p className="mt-2 text-gray-600">Create structured batches with timing and teacher assignments.</p>
        </div>
        <button
          onClick={openCreate}
          className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-blue-600 to-purple-600 px-4 py-2 text-white transition hover:from-blue-700 hover:to-purple-700"
        >
          <Plus className="h-5 w-5" />
          <span>Create Batch</span>
        </button>
      </div>

      <FeedbackMessage type="error" message={error} />
      <FeedbackMessage type="success" message={success} />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
          <div className="text-2xl font-bold text-gray-900">{batches.length}</div>
          <div className="text-sm text-gray-600">Active batches</div>
        </div>
        <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
          <div className="text-2xl font-bold text-blue-700">{teacherOptions.length}</div>
          <div className="text-sm text-gray-600">Teachers available</div>
        </div>
        <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
          <div className="text-2xl font-bold text-purple-700">{batches.filter((batch) => batch.teacherId).length}</div>
          <div className="text-sm text-gray-600">Teacher-linked batches</div>
        </div>
      </div>

      {batches.length === 0 ? (
        <EmptyState title="No batches yet" description="Create your first batch to organize approvals, lectures, and student assignments." />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Batch</th>
                <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Timing</th>
                <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Teacher</th>
                <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Subjects</th>
                <th className="px-6 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 bg-white">
              {batches.map((batch) => (
                <tr key={batch.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="rounded-full bg-blue-100 p-3 text-blue-700">
                        <Layers3 className="h-4 w-4" />
                      </div>
                      <div>
                        <div className="font-medium text-gray-900">{batch.name}</div>
                        <div className="text-sm text-gray-500">{batch.id}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-700">{batch.timing}</td>
                  <td className="px-6 py-4 text-sm text-gray-700">{batch.teacherName ?? 'Unassigned'}</td>
                  <td className="px-6 py-4 text-sm text-gray-700">{batch.subjects.length > 0 ? batch.subjects.join(', ') : 'No subjects yet'}</td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex justify-end gap-2">
                      <button onClick={() => openEdit(batch)} className="rounded-lg p-2 text-blue-600 transition hover:bg-blue-50">
                        <Edit className="h-4 w-4" />
                      </button>
                      <button onClick={() => void deleteBatch(batch.id)} className="rounded-lg p-2 text-red-600 transition hover:bg-red-50">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
          <div className="w-full max-w-xl rounded-2xl bg-white p-6 shadow-2xl">
            <div className="mb-5 flex items-center justify-between">
              <h2 className="text-xl font-semibold text-gray-900">{editingBatch ? 'Edit Batch' : 'Create Batch'}</h2>
              <BookOpen className="h-5 w-5 text-purple-600" />
            </div>

            <div className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Batch Name</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(event) => setFormData((prev) => ({ ...prev, name: event.target.value }))}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Timing</label>
                <div className="relative">
                  <Clock3 className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                  <input
                    type="text"
                    value={formData.timing}
                    onChange={(event) => setFormData((prev) => ({ ...prev, timing: event.target.value }))}
                    placeholder="5:00 PM - 7:00 PM"
                    className="w-full rounded-lg border border-gray-300 py-2 pl-10 pr-3 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Teacher</label>
                <div className="relative">
                  <UserCheck className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                  <select
                    value={formData.teacherId}
                    onChange={(event) => setFormData((prev) => ({ ...prev, teacherId: event.target.value }))}
                    className="w-full rounded-lg border border-gray-300 py-2 pl-10 pr-3 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">No teacher assigned</option>
                    {teacherOptions.map((teacher) => (
                      <option key={teacher.id} value={teacher.id}>
                        {teacher.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button onClick={resetModal} className="rounded-lg px-4 py-2 text-gray-600 transition hover:bg-gray-100">
                Cancel
              </button>
              <button onClick={() => void saveBatch()} className="rounded-lg bg-gradient-to-r from-blue-600 to-purple-600 px-4 py-2 text-white transition hover:from-blue-700 hover:to-purple-700">
                {editingBatch ? 'Update Batch' : 'Create Batch'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default BatchManagement;
