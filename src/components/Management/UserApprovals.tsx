import React, { useEffect, useState } from 'react';
import { Check, X, ShieldAlert } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { firebaseService } from '../../services/firebaseService';
import { User } from '../../types';

const UserApprovals: React.FC = () => {
  const { currentClass } = useAuth();
  const [pendingUsers, setPendingUsers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadPendingUsers();
  }, [currentClass?.id]);

  const loadPendingUsers = async () => {
    if (!currentClass?.id) return;
    setIsLoading(true);
    try {
      const users = await firebaseService.getPendingApprovals(currentClass.id);
      setPendingUsers(users);
    } catch (error) {
      console.error('Failed to load pending users', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleApprove = async (userId: string) => {
    try {
      await firebaseService.approveUser(userId);
      setPendingUsers((prev) => prev.filter((u) => u.id !== userId));
    } catch (error) {
      console.error('Approval failed', error);
      alert('Failed to approve user. See console for details.');
    }
  };

  const handleReject = async (userId: string) => {
    if (!currentClass?.id || !window.confirm('Are you sure you want to reject this user?')) return;
    try {
      await firebaseService.rejectUser(userId, currentClass.id);
      setPendingUsers((prev) => prev.filter((u) => u.id !== userId));
    } catch (error) {
      console.error('Rejection failed', error);
      alert('Failed to reject user. See console for details.');
    }
  };

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">User Approvals</h2>
          <p className="mt-1 text-sm text-gray-500">
            Review and approve new users who signed up for your class.
          </p>
        </div>
      </div>

      {pendingUsers.length === 0 ? (
        <div className="rounded-2xl border border-gray-100 bg-white p-12 text-center shadow-sm">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-green-100 mb-4">
            <ShieldAlert className="h-6 w-6 text-green-600" />
          </div>
          <h3 className="text-lg font-medium text-gray-900">No Pending Approvals</h3>
          <p className="mt-2 text-gray-500">You're all caught up! There are no new signups waiting for approval.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th scope="col" className="px-6 py-4 text-left text-xs font-medium tracking-wider text-gray-500 uppercase">
                  User
                </th>
                <th scope="col" className="px-6 py-4 text-left text-xs font-medium tracking-wider text-gray-500 uppercase">
                  Requested Role
                </th>
                <th scope="col" className="px-6 py-4 text-left text-xs font-medium tracking-wider text-gray-500 uppercase">
                  Signup Date
                </th>
                <th scope="col" className="px-6 py-4 text-right text-xs font-medium tracking-wider text-gray-500 uppercase">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 bg-white">
              {pendingUsers.map((user) => (
                <tr key={user.id} className="transition hover:bg-gray-50">
                  <td className="whitespace-nowrap px-6 py-4">
                    <div className="flex items-center">
                      <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-blue-100 text-blue-700">
                        {user.name.charAt(0).toUpperCase()}
                      </div>
                      <div className="ml-4">
                        <div className="font-medium text-gray-900">{user.name}</div>
                        <div className="text-sm text-gray-500">{user.email}</div>
                      </div>
                    </div>
                  </td>
                  <td className="whitespace-nowrap px-6 py-4 content-center">
                    <span className="inline-flex rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-800 capitalize">
                      {user.role}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-500 content-center">
                    {new Date(user.createdAt).toLocaleDateString()}
                  </td>
                  <td className="whitespace-nowrap px-6 py-4 text-right text-sm font-medium content-center">
                    <div className="flex justify-end gap-2">
                      <button
                        onClick={() => handleReject(user.id)}
                        className="inline-flex items-center gap-1 rounded-lg border border-red-200 bg-white px-3 py-1.5 text-red-700 hover:bg-red-50 transition"
                      >
                        <X className="h-4 w-4" /> Reject
                      </button>
                      <button
                        onClick={() => handleApprove(user.id)}
                        className="inline-flex items-center gap-1 rounded-lg bg-green-600 px-3 py-1.5 text-white hover:bg-green-700 transition"
                      >
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
    </div>
  );
};

export default UserApprovals;
