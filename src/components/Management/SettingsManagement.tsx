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
    } catch (error: any) {
      console.error('Failed to update settings', error);
      setSaveMessage(error.message || 'Failed to update settings.');
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
              <label className="flex cursor-pointer items-start justify-between rounded-xl border border-gray-100 p-4 transition-colors hover:bg-gray-50">
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
                <div className="relative mt-2 ml-4 cursor-pointer">
                  <input
                    type="checkbox"
                    className="sr-only"
                    checked={allowSelfRegistration}
                    onChange={(e) => setAllowSelfRegistration(e.target.checked)}
                  />
                  <div className={`block h-7 w-12 rounded-full transition-colors ${allowSelfRegistration ? 'bg-blue-600' : 'bg-gray-300'}`}></div>
                  <div className={`absolute left-1 top-1 h-5 w-5 rounded-full bg-white transition-transform ${allowSelfRegistration ? 'translate-x-5' : ''}`}></div>
                </div>
              </label>

              <label className={`flex cursor-pointer items-start justify-between rounded-xl border border-gray-100 p-4 transition-colors ${!allowSelfRegistration ? 'opacity-50 cursor-not-allowed' : 'hover:bg-gray-50'}`}>
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
                <div className="relative mt-2 ml-4">
                  <input
                    type="checkbox"
                    className="sr-only"
                    checked={requireApproval}
                    disabled={!allowSelfRegistration}
                    onChange={(e) => setRequireApproval(e.target.checked)}
                  />
                  <div className={`block h-7 w-12 rounded-full transition-colors ${requireApproval ? 'bg-orange-500' : 'bg-gray-300'}`}></div>
                  <div className={`absolute left-1 top-1 h-5 w-5 rounded-full bg-white transition-transform ${requireApproval ? 'translate-x-5' : ''}`}></div>
                </div>
              </label>
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
