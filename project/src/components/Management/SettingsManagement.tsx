import React, { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { firebaseService } from '../../services/firebaseService';
import { ShieldCheck, UserPlus, Settings as SettingsIcon } from 'lucide-react';

const SettingsManagement: React.FC = () => {
  const { currentClass, refreshUserData } = useAuth();
  
  const [requireApproval, setRequireApproval] = useState(
    currentClass?.settings?.requireApproval ?? true
  );
  const [allowSelfRegistration, setAllowSelfRegistration] = useState(
    currentClass?.settings?.allowSelfRegistration ?? true
  );
  
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState('');

  const renderToggle = (checked: boolean, onToggle: () => void, onLabel: string, offLabel: string) => (
    <div className="flex shrink-0 items-center gap-3">
      <span
        className={`min-w-[28px] text-right text-[11px] font-semibold tracking-[0.24em] ${
          checked ? 'text-blue-500' : 'text-slate-400'
        }`}
      >
        {checked ? onLabel : offLabel}
      </span>
      <button
        type="button"
        onClick={onToggle}
        aria-pressed={checked}
        aria-label={`${checked ? offLabel : onLabel} ${checked ? 'disabled' : 'enabled'}`}
        className={`relative inline-flex h-7 w-14 shrink-0 items-center rounded-full border p-0.5 transition-colors duration-200 ${
          checked
            ? 'border-blue-400 bg-gradient-to-r from-blue-600 to-purple-600'
            : 'border-slate-600 bg-slate-600'
        }`}
      >
        <span
          className={`h-6 w-6 rounded-full bg-white shadow-[0_8px_18px_rgba(15,23,42,0.26)] transition-transform duration-200 ${
            checked ? 'translate-x-7' : 'translate-x-0'
          }`}
        />
      </button>
    </div>
  );

  useEffect(() => {
    setRequireApproval(currentClass?.settings?.requireApproval ?? true);
    setAllowSelfRegistration(currentClass?.settings?.allowSelfRegistration ?? true);
  }, [currentClass?.id, currentClass?.settings?.allowSelfRegistration, currentClass?.settings?.requireApproval]);

  const handleSave = async () => {
    if (!currentClass?.id) return;
    setIsSaving(true);
    setSaveMessage('');
    try {
      await firebaseService.updateClassSettings(currentClass.id, {
        allowSelfRegistration,
        requireApproval,
      });
      setSaveMessage('Settings updated successfully!');
      setTimeout(() => setSaveMessage(''), 3000);
      await refreshUserData(); // Refresh local auth context to reflect new settings
    } catch (error: unknown) {
      console.error('Failed to update settings', error);
      setSaveMessage(error instanceof Error ? error.message : 'Failed to update settings.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Class Settings</h2>
          <p className="mt-1 text-sm text-gray-500">
            Manage your classroom workspace security and access preferences.
          </p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr,300px]">
        <div className="space-y-6">
          <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
            <div className="mb-6 flex items-center gap-2">
              <SettingsIcon className="h-5 w-5 text-gray-400" />
              <h3 className="text-lg font-medium text-gray-900">Registration & Access</h3>
            </div>

            <div className="space-y-6">
              <div className="flex items-start justify-between gap-4 rounded-xl border border-gray-100 p-4 transition-colors hover:bg-gray-50">
                <div className="flex gap-4">
                  <div className="mt-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-100">
                    <UserPlus className="h-5 w-5 text-blue-600" />
                  </div>
                  <div>
                    <span className="block font-medium text-gray-900">Allow Self Registration</span>
                    <span className="block text-sm text-gray-500 mt-1">
                      Determine if users can sign up using the public `/{currentClass?.subdomain}/signup` link. If disabled, users must be explicitly invited.
                    </span>
                  </div>
                </div>
                {renderToggle(allowSelfRegistration, () => setAllowSelfRegistration((prev) => !prev), 'ON', 'OFF')}
              </div>

              <div className={`flex items-start justify-between gap-4 rounded-xl border border-gray-100 p-4 transition-colors ${!allowSelfRegistration ? 'opacity-50' : 'hover:bg-gray-50'}`}>
                <div className="flex gap-4">
                  <div className="mt-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-orange-100">
                    <ShieldCheck className="h-5 w-5 text-orange-600" />
                  </div>
                  <div>
                    <span className="block font-medium text-gray-900">Require Approval for New Signups</span>
                    <span className="block text-sm text-gray-500 mt-1">
                      When users sign up, their account will be set to Pending. Admin approval will be required from the User Approvals tab before they can enter the dashboard.
                    </span>
                  </div>
                </div>
                {renderToggle(requireApproval, () => allowSelfRegistration && setRequireApproval((prev) => !prev), 'ON', 'OFF')}
              </div>
            </div>

            <div className="mt-8 border-t border-gray-100 pt-6 flex items-center justify-between">
              <div className="text-sm font-medium text-green-600">
                {saveMessage}
              </div>
              <button
                onClick={handleSave}
                disabled={isSaving}
                className="rounded-lg bg-blue-600 px-6 py-2.5 text-sm font-medium text-white transition hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50"
              >
                {isSaving ? 'Saving...' : 'Save Settings'}
              </button>
            </div>

          </div>
        </div>

        <div className="space-y-6">
          <div className="rounded-2xl border border-blue-100 bg-blue-50 p-6 shadow-sm">
            <h4 className="font-semibold text-blue-900">Need Help?</h4>
            <p className="mt-2 text-sm text-blue-700">
              For a private coaching class, it is highly recommended to keep "Require Approval" toggled <strong>ON</strong> so you can manually verify new student and teacher accounts.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SettingsManagement;
