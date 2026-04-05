import React, { useEffect, useMemo, useState } from 'react';
import { BarChart3, Building2, CreditCard, ShieldCheck, Users } from 'lucide-react';
import { firebaseService } from '../../services/firebaseService';
import { CoachingClass, User } from '../../types';

const planColors: Record<CoachingClass['plan'], string> = {
  free: 'bg-gray-100 text-gray-700',
  standard: 'bg-blue-100 text-blue-700',
  pro: 'bg-emerald-100 text-emerald-700',
};

const SuperAdminDashboard: React.FC = () => {
  const [classes, setClasses] = useState<CoachingClass[]>([]);
  const [users, setUsers] = useState<User[]>([]);

  useEffect(() => {
    const unsubs = [
      firebaseService.subscribeToAllClasses(setClasses),
      firebaseService.subscribeToAllUsers(setUsers),
    ];

    return () => unsubs.forEach((unsubscribe) => unsubscribe());
  }, []);

  const admins = useMemo(() => users.filter((user) => user.role === 'admin'), [users]);
  const activeSubscriptions = useMemo(() => classes.filter((item) => item.isActive).length, [classes]);
  const totalRevenue = useMemo(
    () =>
      classes.reduce((sum, item) => {
        if (item.plan === 'pro') return sum + 2999;
        if (item.plan === 'standard') return sum + 999;
        return sum;
      }, 0),
    [classes]
  );

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-sm font-medium text-blue-600">Platform Control</p>
          <h1 className="text-3xl font-bold text-gray-900">Super Admin Dashboard</h1>
          <p className="mt-2 max-w-2xl text-gray-600">
            Monitor customers, plans, platform usage, and subscription health across TeachFlow.
          </p>
        </div>
        <div className="rounded-2xl border border-blue-100 bg-blue-50 px-5 py-4">
          <div className="text-xs uppercase tracking-wide text-blue-700">Platform Revenue</div>
          <div className="mt-1 font-semibold text-blue-900">INR {totalRevenue.toLocaleString('en-IN')} / month</div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-4">
        {[
          { label: 'Total Classes', value: classes.length, icon: Building2, color: 'from-blue-500 to-blue-600' },
          { label: 'Total Users', value: users.length, icon: Users, color: 'from-purple-500 to-purple-600' },
          { label: 'Active Subscriptions', value: activeSubscriptions, icon: CreditCard, color: 'from-emerald-500 to-emerald-600' },
          { label: 'Platform Admins', value: admins.length, icon: ShieldCheck, color: 'from-orange-500 to-orange-600' },
        ].map((item) => {
          const Icon = item.icon;
          return (
            <div key={item.label} className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-medium text-gray-600">{item.label}</div>
                  <div className="mt-2 text-2xl font-bold text-gray-900">{item.value}</div>
                </div>
                <div className={`rounded-xl bg-gradient-to-r p-3 ${item.color}`}>
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
            <h2 className="text-lg font-semibold text-gray-900">All Customers</h2>
            <BarChart3 className="h-5 w-5 text-gray-400" />
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Class</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Admin</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Plan</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Students</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 bg-white">
                {classes.map((coachingClass) => {
                  const admin = admins.find((user) => user.id === coachingClass.adminId);
                  return (
                    <tr key={coachingClass.id} className="hover:bg-gray-50">
                      <td className="px-4 py-4">
                        <div className="font-medium text-gray-900">{coachingClass.name}</div>
                        <div className="text-sm text-gray-500">/{coachingClass.subdomain}</div>
                      </td>
                      <td className="px-4 py-4 text-sm text-gray-700">{admin?.email ?? 'Unassigned'}</td>
                      <td className="px-4 py-4">
                        <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${planColors[coachingClass.plan]}`}>
                          {coachingClass.plan}
                        </span>
                      </td>
                      <td className="px-4 py-4 text-sm text-gray-700">{coachingClass.studentCount ?? 0}</td>
                      <td className="px-4 py-4">
                        <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${coachingClass.isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                          {coachingClass.isActive ? 'Active' : 'Suspended'}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-gray-900">Plan Breakdown</h2>
          <div className="mt-5 space-y-4">
            {(['free', 'standard', 'pro'] as const).map((plan) => (
              <div key={plan}>
                <div className="mb-2 flex items-center justify-between text-sm text-gray-600">
                  <span className="capitalize">{plan}</span>
                  <span>{classes.filter((item) => item.plan === plan).length} classes</span>
                </div>
                <div className="h-2 rounded-full bg-gray-100">
                  <div
                    className="h-2 rounded-full bg-gradient-to-r from-blue-500 to-purple-500"
                    style={{
                      width: `${Math.max((classes.filter((item) => item.plan === plan).length / Math.max(classes.length, 1)) * 100, 8)}%`,
                    }}
                  />
                </div>
              </div>
            ))}
            {classes.length === 0 ? <p className="text-sm text-gray-500">No customer classes created yet.</p> : null}
          </div>
        </div>
      </div>
    </div>
  );
};

export default SuperAdminDashboard;
