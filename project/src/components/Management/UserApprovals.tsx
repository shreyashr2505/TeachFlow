import React, { useEffect, useMemo, useState } from 'react';
import { Check, Link2, ShieldAlert, UserRoundCheck, X } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { firebaseService } from '../../services/firebaseService';
import { Batch, Student, User } from '../../types';
import FeedbackMessage from '../Common/FeedbackMessage';
import StyledSelect from '../Common/StyledSelect';

const UserApprovals: React.FC = () => {
  const { currentClass } = useAuth();
  const [pendingUsers, setPendingUsers] = useState<User[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [role, setRole] = useState<User['role']>('student');
  const [selectedBatchId, setSelectedBatchId] = useState('');
  const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>([]);

  useEffect(() => {
    if (!currentClass?.id) return;
    void loadPendingUsers();
    const unsubs = [
      firebaseService.subscribeToBatches(currentClass.id, setBatches, (err) => setError(err.message)),
      firebaseService.subscribeToStudents(currentClass.id, setStudents, (err) => setError(err.message)),
    ];
    return () => unsubs.forEach((unsubscribe) => unsubscribe());
  }, [currentClass?.id]);

  const loadPendingUsers = async () => {
    if (!currentClass?.id) return;
    setIsLoading(true);
    try {
      const users = await firebaseService.getPendingApprovals(currentClass.id);
      setPendingUsers(users);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load pending users.');
    } finally {
      setIsLoading(false);
    }
  };

  const selectedBatch = useMemo(
    () => batches.find((batch) => batch.id === selectedBatchId) ?? null,
    [batches, selectedBatchId]
  );

  const openApproveModal = (user: User) => {
    setSelectedUser(user);
    setRole(user.role);
    setSelectedBatchId(batches[0]?.id ?? '');
    setSelectedStudentIds(user.linkedStudentIds ?? (user.linkedStudentId ? [user.linkedStudentId] : []));
    setError('');
    setSuccess('');
  };

  const closeApproveModal = () => {
    setSelectedUser(null);
    setRole('student');
    setSelectedBatchId('');
    setSelectedStudentIds([]);
  };

  const handleApprove = async () => {
    if (!currentClass?.id || !selectedUser) return;
    if ((role === 'student' || role === 'teacher') && !selectedBatch) {
      setError('Select a batch before approving this user.');
      return;
    }
    if (role === 'parent' && selectedStudentIds.length === 0) {
      setError('Select at least one linked student for this parent.');
      return;
    }

    try {
      await firebaseService.approvePendingUser({
        userId: selectedUser.id,
        classId: currentClass.id,
        role,
        batchId: role === 'student' || role === 'teacher' ? selectedBatch?.id : undefined,
        batchName: role === 'student' || role === 'teacher' ? selectedBatch?.name : undefined,
        linkedStudentIds: role === 'parent' ? selectedStudentIds : undefined,
      });
      setPendingUsers((prev) => prev.filter((user) => user.id !== selectedUser.id));
      setSuccess(`${selectedUser.name} approved successfully.`);
      closeApproveModal();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to approve user.');
    }
  };

  const handleReject = async (userId: string) => {
    if (!currentClass?.id || !window.confirm('Are you sure you want to reject this user?')) return;
    try {
      await firebaseService.rejectUser(userId, currentClass.id);
      setPendingUsers((prev) => prev.filter((u) => u.id !== userId));
      setSuccess('User rejected successfully.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reject user.');
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-56 animate-pulse rounded bg-gray-200" />
        <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
          <div className="space-y-4">
            {[1, 2, 3].map((item) => (
              <div key={item} className="h-14 animate-pulse rounded-xl bg-gray-100" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">User Approvals</h2>
          <p className="mt-1 text-sm text-gray-500">Approve users with the right role, batch, and student linking in one flow.</p>
        </div>
      </div>

      <FeedbackMessage type="error" message={error} />
      <FeedbackMessage type="success" message={success} />

      {pendingUsers.length === 0 ? (
        <div className="rounded-2xl border border-gray-100 bg-white p-12 text-center shadow-sm">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-green-100">
            <ShieldAlert className="h-6 w-6 text-green-600" />
          </div>
          <h3 className="text-lg font-medium text-gray-900">No Pending Approvals</h3>
          <p className="mt-2 text-gray-500">You're all caught up. No new signups are waiting for review.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-4 text-left text-xs font-medium uppercase tracking-wider text-gray-500">User</th>
                <th className="px-6 py-4 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Requested Role</th>
                <th className="px-6 py-4 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Signup Date</th>
                <th className="px-6 py-4 text-right text-xs font-medium uppercase tracking-wider text-gray-500">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 bg-white">
              {pendingUsers.map((user) => (
                <tr key={user.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4">
                    <div className="flex items-center">
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-100 text-blue-700">
                        {user.name.charAt(0).toUpperCase()}
                      </div>
                      <div className="ml-4">
                        <div className="font-medium text-gray-900">{user.name}</div>
                        <div className="text-sm text-gray-500">{user.email}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className="inline-flex rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium capitalize text-gray-800">
                      {user.role.replace('_', ' ')}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500">{new Date(user.createdAt).toLocaleDateString()}</td>
                  <td className="px-6 py-4 text-right text-sm font-medium">
                    <div className="flex justify-end gap-2">
                      <button onClick={() => void handleReject(user.id)} className="inline-flex items-center gap-1 rounded-lg border border-red-200 bg-white px-3 py-1.5 text-red-700 transition hover:bg-red-50">
                        <X className="h-4 w-4" /> Reject
                      </button>
                      <button onClick={() => openApproveModal(user)} className="inline-flex items-center gap-1 rounded-lg bg-green-600 px-3 py-1.5 text-white transition hover:bg-green-700">
                        <Check className="h-4 w-4" /> Approve
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {selectedUser ? (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 px-4 py-6">
          <div className="my-auto flex w-full max-w-2xl max-h-[calc(100vh-3rem)] flex-col overflow-hidden rounded-2xl bg-white p-6 shadow-2xl">
            <div className="mb-5 flex items-center justify-between">
              <div>
                <h3 className="text-xl font-semibold text-gray-900">Approve {selectedUser.name}</h3>
                <p className="mt-1 text-sm text-gray-500">{selectedUser.email}</p>
              </div>
              <UserRoundCheck className="h-5 w-5 text-green-600" />
            </div>

            <div className="flex-1 overflow-y-auto pr-2">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Role</label>
                <StyledSelect value={role} onChange={(value) => setRole(value as User['role'])} options={[{ value: 'student', label: 'Student' }, { value: 'teacher', label: 'Teacher' }, { value: 'parent', label: 'Parent' }]} />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Class</label>
                <input value={currentClass?.name ?? ''} readOnly className="w-full rounded-lg border border-gray-300 bg-gray-50 px-3 py-2 text-gray-600" />
              </div>

              {(role === 'student' || role === 'teacher') ? (
                <div className="md:col-span-2">
                  <label className="mb-1 block text-sm font-medium text-gray-700">Batch</label>
                  <StyledSelect value={selectedBatchId} onChange={setSelectedBatchId} options={[{ value: '', label: 'Select batch' }, ...batches.map((batch) => ({ value: batch.id, label: `${batch.name} (${batch.timing})` }))]} />
                </div>
              ) : null}

              {role === 'parent' ? (
                <div className="md:col-span-2">
                  <label className="mb-2 block text-sm font-medium text-gray-700">Linked Students</label>
                  <div className="rounded-xl border border-gray-200 p-3">
                    <div className="mb-3 flex items-center gap-2 text-sm text-gray-500">
                      <Link2 className="h-4 w-4 text-gray-400" />
                      <span>Select one or more students for this parent account.</span>
                    </div>
                    <div className="space-y-2">
                      {students.map((student) => (
                        <label key={student.id} className="flex items-center gap-3 rounded-lg border border-gray-100 px-3 py-2 hover:bg-gray-50">
                          <input
                            type="checkbox"
                            checked={selectedStudentIds.includes(student.id)}
                            onChange={() => toggleStudentLink(student.id)}
                          />
                          <span className="text-sm text-gray-700">
                            {student.name} ({student.batch})
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>
                </div>
              ) : null}
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button onClick={closeApproveModal} className="rounded-lg px-4 py-2 text-gray-600 transition hover:bg-gray-100">
                Cancel
              </button>
              <button onClick={() => void handleApprove()} className="rounded-lg bg-green-600 px-4 py-2 text-white transition hover:bg-green-700">
                Confirm Approval
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default UserApprovals;
  const toggleStudentLink = (studentId: string) => {
    setSelectedStudentIds((prev) =>
      prev.includes(studentId) ? prev.filter((id) => id !== studentId) : [...prev, studentId]
    );
  };
