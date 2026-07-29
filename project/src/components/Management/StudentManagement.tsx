import React, { useEffect, useMemo, useState } from 'react';
import { Edit, GraduationCap, Plus, Search, Trash2, User } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { firebaseService } from '../../services/firebaseService';
import { Batch, Student, Teacher } from '../../types';
import FeedbackMessage from '../Common/FeedbackMessage';
import EmptyState from '../Common/EmptyState';
import StyledSelect from '../Common/StyledSelect';
import UpgradeCard from '../Common/UpgradeCard';
import { formatPlanName, getPlanLimits } from '../../utils/plan';
import { requestDashboardTabNavigation } from '../../utils/dashboardNavigation';
import { isPositiveNumber, isValidEmail, isValidPhone, validateRequired } from '../../utils/validation';

const emptyStudentForm = {
  name: '',
  email: '',
  phone: '',
  batch: 'Batch A',
  grade: '10',
  board: 'CB',
  parentEmail: '',
  parentPhone: '',
  rollNumber: '',
  totalFees: 0,
  paidFees: 0,
};

const StudentManagement: React.FC = () => {
  const { currentClass, user } = useAuth();
  const [students, setStudents] = useState<Student[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [batchesData, setBatchesData] = useState<Batch[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedBatch, setSelectedBatch] = useState('all');
  const [selectedGrade, setSelectedGrade] = useState('all');
  const [showModal, setShowModal] = useState(false);
  const [editingStudent, setEditingStudent] = useState<Student | null>(null);
  const [formData, setFormData] = useState(emptyStudentForm);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    if (!currentClass?.id) {
      setStudents([]);
      return;
    }

    const unsubs = [
      firebaseService.subscribeToStudents(currentClass.id, setStudents),
      firebaseService.subscribeToTeachers(currentClass.id, setTeachers),
      firebaseService.subscribeToBatches(currentClass.id, setBatchesData),
    ];
    return () => unsubs.forEach((unsubscribe) => unsubscribe());
  }, [currentClass?.id]);

  const teacher = useMemo(() => teachers.find((item) => item.email === user?.email), [teachers, user?.email]);
  const canManageStudents = user?.role === 'admin';

  const visibleStudents = useMemo(() => {
    if (user?.role !== 'teacher' || !teacher) return students;
    return students.filter((student) => teacher.batches.includes(student.batch));
  }, [students, teacher, user?.role]);
  const studentLimit = currentClass ? (currentClass.limits?.students ?? getPlanLimits(currentClass.plan).students) : 0;
  const hasReachedStudentLimit = currentClass ? visibleStudents.length >= studentLimit : false;

  const batches = useMemo(() => {
    const found = Array.from(new Set([
      ...batchesData.map((batch) => batch.name),
      ...visibleStudents.map((student) => student.batch),
    ]));
    return found.length > 0 ? found : ['Batch A', 'Batch B', 'Batch C'];
  }, [batchesData, visibleStudents]);

  const batchOptions = useMemo(
    () => batchesData.length > 0
      ? batchesData
      : batches.map((batch) => ({ id: batch, name: batch, timing: 'TBD', subjects: [], classId: currentClass?.id ?? '', createdAt: new Date().toISOString() })),
    [batches, batchesData, currentClass?.id]
  );

  const filteredStudents = visibleStudents.filter((student) => {
    const query = searchTerm.toLowerCase();
    const matchesSearch =
      student.name.toLowerCase().includes(query) ||
      student.email.toLowerCase().includes(query) ||
      student.rollNumber.toLowerCase().includes(query) ||
      (student.grade ?? '').toLowerCase().includes(query) ||
      (student.board ?? '').toLowerCase().includes(query);
    const matchesBatch = selectedBatch === 'all' || student.batch === selectedBatch;
    const matchesGrade = selectedGrade === 'all' || student.grade === selectedGrade;
    return matchesSearch && matchesBatch && matchesGrade;
  });

  const gradeOptions = useMemo(() => {
    const unique = Array.from(new Set(students.map((student) => student.grade).filter((grade): grade is string => Boolean(grade))));
    return unique.length > 0 ? unique : ['10', '11', '12'];
  }, [students]);

  const openAddModal = () => {
    if (hasReachedStudentLimit && currentClass) {
      setError(`${formatPlanName(currentClass.plan)} plan student limit reached. Upgrade to add more students.`);
      return;
    }
    setEditingStudent(null);
    setFormData(emptyStudentForm);
    setShowModal(true);
  };

  const closeModal = () => {
    setEditingStudent(null);
    setFormData(emptyStudentForm);
    setShowModal(false);
  };

  const saveStudent = () => {
    setError('');
    setSuccess('');
    if (!currentClass?.id || !formData.name.trim() || !formData.email.trim() || !formData.rollNumber.trim()) {
      setError(validateRequired('Student name', formData.name) || validateRequired('Student email', formData.email) || validateRequired('Roll number', formData.rollNumber));
      return;
    }
    if (!isValidEmail(formData.email) || (formData.parentEmail && !isValidEmail(formData.parentEmail))) {
      setError('Please enter valid student and parent email addresses.');
      return;
    }
    if (!isValidPhone(formData.phone) || !isValidPhone(formData.parentPhone)) {
      setError('Please enter a valid phone number.');
      return;
    }
    if (!isPositiveNumber(Number(formData.totalFees)) || !isPositiveNumber(Number(formData.paidFees))) {
      setError('Fees cannot be negative.');
      return;
    }
    if (Number(formData.paidFees) > Number(formData.totalFees)) {
      setError('Paid fees cannot be greater than total fees.');
      return;
    }

    const totalFees = Number(formData.totalFees) || 0;
    const paidFees = Number(formData.paidFees) || 0;
    const feeStatus: Student['feeStatus'] =
      paidFees <= 0 ? 'due' : paidFees >= totalFees && totalFees > 0 ? 'paid' : 'partial';

    const nextStudent: Student = editingStudent
      ? {
          ...editingStudent,
          ...formData,
          totalFees,
          paidFees,
          feeStatus,
        }
      : {
          id: `student-${Date.now()}`,
          ...formData,
          classId: currentClass.id,
          joinedAt: new Date().toISOString(),
          totalFees,
          paidFees,
          feeStatus,
        };

    if (editingStudent) {
      void firebaseService.updateStudent(currentClass.id, editingStudent.id, {
        ...nextStudent,
        batchId: batchOptions.find((item) => item.name === nextStudent.batch)?.id,
      });
      setSuccess('Student updated successfully.');
    } else {
      void firebaseService.addStudent(currentClass.id, {
        name: nextStudent.name,
        email: nextStudent.email,
        phone: nextStudent.phone,
        grade: nextStudent.grade,
        board: nextStudent.board,
        batch: nextStudent.batch,
        batchId: batchOptions.find((item) => item.name === nextStudent.batch)?.id,
        parentEmail: nextStudent.parentEmail,
        parentPhone: nextStudent.parentPhone,
        rollNumber: nextStudent.rollNumber,
        totalFees: nextStudent.totalFees,
        paidFees: nextStudent.paidFees,
        feeStatus: nextStudent.feeStatus,
      });

      if (nextStudent.email && user) {
        void firebaseService.createInvite({
          email: nextStudent.email,
          role: 'student',
          classId: currentClass.id,
          invitedBy: user.id,
          studentId: nextStudent.id,
        });
      }
      if (nextStudent.parentEmail && user) {
        void firebaseService.createInvite({
          email: nextStudent.parentEmail,
          role: 'parent',
          classId: currentClass.id,
          invitedBy: user.id,
          studentId: nextStudent.id,
        });
      }
      setSuccess('Student added successfully.');
    }
    closeModal();
  };

  const editStudent = (student: Student) => {
    setEditingStudent(student);
    setFormData({
      name: student.name,
      email: student.email,
      phone: student.phone ?? '',
      batch: student.batch,
      grade: student.grade ?? '10',
      board: student.board ?? 'CB',
      parentEmail: student.parentEmail ?? '',
      parentPhone: student.parentPhone ?? '',
      rollNumber: student.rollNumber,
      totalFees: student.totalFees,
      paidFees: student.paidFees,
    });
    setShowModal(true);
  };

  const deleteStudent = (studentId: string) => {
    if (!window.confirm('Delete this student from the class?')) {
      return;
    }
    if (currentClass?.id) {
      void firebaseService.deleteStudent(currentClass.id, studentId);
      setSuccess('Student deleted successfully.');
    }
  };
  const handleBatchChange = async (studentId: string, batchId: string) => {
    if (!currentClass?.id) return;
    const batch = batchOptions.find((item) => item.id === batchId);
    if (!batch) return;

    setError('');
    setSuccess('');
    try {
      await firebaseService.updateStudentBatch(currentClass.id, studentId, { id: batch.id, name: batch.name });
      setSuccess('Student batch updated successfully.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update student batch.');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Student Management</h1>
          <p className="mt-2 text-gray-600">
            Add and manage students inside {currentClass?.name ?? 'your coaching class'}.
          </p>
        </div>
        {canManageStudents ? (
          <button
            onClick={openAddModal}
            disabled={hasReachedStudentLimit}
            className="inline-flex items-center space-x-2 rounded-lg bg-gradient-to-r from-blue-600 to-purple-600 px-4 py-2 text-white transition-all hover:from-blue-700 hover:to-purple-700"
          >
            <Plus className="h-5 w-5" />
            <span>Add Student</span>
          </button>
        ) : null}
      </div>

      <FeedbackMessage type="error" message={error} />
      <FeedbackMessage type="success" message={success} />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
          <div className="text-2xl font-bold text-gray-900">{visibleStudents.length}</div>
          <div className="text-sm text-gray-600">Total students</div>
        </div>
        <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
          <div className="text-2xl font-bold text-blue-700">{batches.length}</div>
          <div className="text-sm text-gray-600">Active batches</div>
        </div>
        <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
          <div className="text-2xl font-bold text-orange-600">
            {Number.isFinite(studentLimit) ? `${visibleStudents.length} / ${studentLimit}` : `${visibleStudents.length} / Unlimited`}
          </div>
          <div className="text-sm text-gray-600">Student limit</div>
        </div>
      </div>

      {hasReachedStudentLimit && currentClass ? (
        <UpgradeCard
          title="Student Limit Reached"
          description="This class has reached its current student limit. Upgrade to continue adding more students without deleting any existing data."
          requiredPlan={currentClass.plan === 'free' ? formatPlanName('standard') : formatPlanName('pro')}
          currentPlan={formatPlanName(currentClass.plan)}
          actionLabel="View Plans"
          onUpgradeClick={() => requestDashboardTabNavigation('pricing')}
        />
      ) : null}

      <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 md:flex-row">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Search by name, email, or roll number"
              className="w-full rounded-lg border border-gray-300 py-2 pl-10 pr-4 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <StyledSelect value={selectedBatch} onChange={setSelectedBatch} options={[{ value: 'all', label: 'All batches' }, ...batches.map((batch) => ({ value: batch, label: batch }))]} />
          <StyledSelect value={selectedGrade} onChange={setSelectedGrade} options={[{ value: 'all', label: 'All grades' }, ...gradeOptions.map((grade) => ({ value: grade, label: grade }))]} />
        </div>
      </div>

      {filteredStudents.length === 0 ? (
        <EmptyState title="No students found" description="Add your first student or adjust the filters to see class records." />
      ) : (
      <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Student</th>
                <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Batch</th>
                <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Parent</th>
                <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Fees</th>
                <th className="px-6 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 bg-white">
              {filteredStudents.map((student) => (
                <tr key={student.id} className="transition-all duration-200 hover:scale-[1.01] hover:bg-gray-50">
                  <td className="px-6 py-4">
                    <div className="flex items-center space-x-3">
                      <div className="rounded-full bg-gradient-to-r from-blue-500 to-purple-500 p-3 text-white">
                        <User className="h-4 w-4" />
                      </div>
                      <div>
                        <div className="font-medium text-gray-900">{student.name}</div>
                        <div className="text-sm text-gray-500">
                          {student.email} | Roll No. {student.rollNumber}
                        </div>
                        <div className="mt-1 text-xs text-gray-500">
                          Grade {student.grade || 'N/A'} - {student.board || 'N/A'}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-700">
                    {canManageStudents ? (
                      <StyledSelect value={student.batchId ?? batchOptions.find((item) => item.name === student.batch)?.id ?? student.batch} onChange={(value) => void handleBatchChange(student.id, value)} options={batchOptions.map((batch) => ({ value: batch.id, label: batch.name }))} />
                    ) : (
                      student.batch
                    )}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-700">
                    <div>{student.parentEmail || 'Not linked'}</div>
                    <div className="text-gray-500">{student.parentPhone || 'No phone'}</div>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-700">
                    <div>{student.paidFees} / {student.totalFees}</div>
                    <span
                      className={`mt-1 inline-flex rounded-full px-2 py-1 text-xs font-medium ${
                        student.feeStatus === 'paid'
                          ? 'bg-green-100 text-green-700'
                          : student.feeStatus === 'partial'
                            ? 'bg-yellow-100 text-yellow-700'
                            : 'bg-red-100 text-red-700'
                      }`}
                    >
                      {student.feeStatus}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex justify-end space-x-2">
                      {canManageStudents ? (
                        <>
                          <button
                            onClick={() => editStudent(student)}
                            className="rounded-lg p-2 text-blue-600 transition hover:bg-blue-50"
                          >
                            <Edit className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => deleteStudent(student.id)}
                            className="rounded-lg p-2 text-red-600 transition hover:bg-red-50"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      )}

      {showModal && canManageStudents && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 px-4 py-6">
          <div className="my-auto flex w-full max-w-2xl max-h-[calc(100vh-3rem)] flex-col overflow-hidden rounded-2xl bg-white p-6 shadow-2xl">
            <div className="mb-5 flex items-center justify-between">
              <h2 className="text-xl font-semibold text-gray-900">
                {editingStudent ? 'Edit Student' : 'Add Student to Class'}
              </h2>
              <GraduationCap className="h-5 w-5 text-blue-600" />
            </div>

            <div className="flex-1 overflow-y-auto pr-2">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {[
                { key: 'name', label: 'Student Name', type: 'text' },
                { key: 'email', label: 'Student Email', type: 'email' },
                { key: 'phone', label: 'Phone', type: 'tel' },
                { key: 'rollNumber', label: 'Roll Number', type: 'text' },
                { key: 'parentEmail', label: 'Parent Email', type: 'email' },
                { key: 'parentPhone', label: 'Parent Phone', type: 'tel' },
                { key: 'grade', label: 'Grade', type: 'text' },
                { key: 'board', label: 'Board', type: 'text' },
              ].map((field) => (
                <div key={field.key}>
                  <label className="mb-1 block text-sm font-medium text-gray-700">{field.label}</label>
                  <input
                    type={field.type}
                    value={formData[field.key as keyof typeof formData] as string | number}
                    onChange={(event) =>
                      setFormData((prev) => ({
                        ...prev,
                        [field.key]: event.target.value,
                      }))
                    }
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              ))}
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Batch</label>
                <StyledSelect value={formData.batch} onChange={(value) => setFormData((prev) => ({ ...prev, batch: value }))} options={batchOptions.map((batch) => ({ value: batch.name, label: batch.name }))} />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Total Fees</label>
                <input
                  type="number"
                  value={formData.totalFees}
                  onChange={(event) => setFormData((prev) => ({ ...prev, totalFees: Number(event.target.value) }))}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Paid Fees</label>
                <input
                  type="number"
                  value={formData.paidFees}
                  onChange={(event) => setFormData((prev) => ({ ...prev, paidFees: Number(event.target.value) }))}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              </div>
            </div>

            <div className="mt-6 flex justify-end space-x-3">
              <button onClick={closeModal} className="rounded-lg px-4 py-2 text-gray-600 transition hover:bg-gray-100">
                Cancel
              </button>
              <button
                onClick={saveStudent}
                className="rounded-lg bg-gradient-to-r from-blue-600 to-purple-600 px-4 py-2 text-white transition hover:from-blue-700 hover:to-purple-700"
              >
                {editingStudent ? 'Update Student' : 'Add Student'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default StudentManagement;
