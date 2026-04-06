import React, { useMemo, useState } from 'react';
import { Building2, CheckCircle2, Copy, Link, Plus, School } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import FeedbackMessage from '../Common/FeedbackMessage';
import { sanitizeSubdomain, validateRequired } from '../../utils/validation';

const BranchManagement: React.FC = () => {
  const { classes, currentClass, createClass, switchClass } = useAuth();
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    subdomain: '',
    allowSelfRegistration: true,
    requireApproval: true,
  });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [copiedBranchId, setCopiedBranchId] = useState<string | null>(null);

  const sortedClasses = useMemo(
    () => [...classes].sort((a, b) => (a.id === currentClass?.id ? -1 : b.id === currentClass?.id ? 1 : a.name.localeCompare(b.name))),
    [classes, currentClass?.id]
  );

  const handleCreateBranch = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setSuccess('');

    const nameError = validateRequired('Branch name', formData.name);
    const subdomainError = validateRequired('Branch slug', formData.subdomain);
    if (nameError || subdomainError) {
      setError(nameError || subdomainError);
      return;
    }

    const sanitizedSlug = sanitizeSubdomain(formData.subdomain);
    if (sanitizedSlug !== formData.subdomain) {
      setError('Branch slug can only contain lowercase letters, numbers, and hyphens.');
      return;
    }

    setIsSubmitting(true);
    try {
      const created = await createClass({
        name: formData.name,
        description: formData.description,
        subdomain: sanitizedSlug,
        settings: {
          allowSelfRegistration: formData.allowSelfRegistration,
          requireApproval: formData.requireApproval,
        },
      });

      if (!created) {
        setError('Failed to create branch. Please try again.');
        return;
      }

      setFormData({
        name: '',
        description: '',
        subdomain: '',
        allowSelfRegistration: true,
        requireApproval: true,
      });
      setSuccess('New branch created successfully.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create branch.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const copyLink = async (classSlug: string, branchId: string) => {
    await navigator.clipboard.writeText(`${window.location.origin}/${classSlug}/login`);
    setCopiedBranchId(branchId);
    window.setTimeout(() => setCopiedBranchId(null), 2000);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Branch Management</h1>
          <p className="mt-2 text-gray-600">Create and manage multiple class branches inside the same TeachFlow SaaS account.</p>
        </div>
        <div className="rounded-2xl border border-blue-100 bg-blue-50 px-5 py-4">
          <div className="text-xs uppercase tracking-wide text-blue-700">Total branches</div>
          <div className="mt-1 text-2xl font-bold text-blue-900">{classes.length}</div>
        </div>
      </div>

      <FeedbackMessage type="error" message={error} />
      <FeedbackMessage type="success" message={success} />

      <div className="grid gap-6 xl:grid-cols-[1.1fr,0.9fr]">
        <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
          <div className="mb-5 flex items-center gap-3">
            <div className="rounded-xl bg-blue-100 p-3 text-blue-700">
              <Building2 className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Your Branches</h2>
              <p className="text-sm text-gray-500">Switch between branches or share direct tenant login links.</p>
            </div>
          </div>

          <div className="space-y-4">
            {sortedClasses.map((item) => (
              <div key={item.id} className={`rounded-2xl border p-5 ${item.id === currentClass?.id ? 'border-blue-200 bg-blue-50' : 'border-gray-100 bg-white'}`}>
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-gray-900">{item.name}</h3>
                      {item.id === currentClass?.id ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2.5 py-1 text-xs font-medium text-blue-700">
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          Active
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-1 text-sm text-gray-600">{item.description || 'No description added yet.'}</p>
                    <div className="mt-3 flex flex-wrap gap-3 text-xs text-gray-500">
                      <span>{window.location.origin}/{item.subdomain}</span>
                      <span>{item.settings.requireApproval ? 'Approval required' : 'Auto approved'}</span>
                      <span>{item.settings.allowSelfRegistration ? 'Public signup on' : 'Invite only'}</span>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-3">
                    <button
                      onClick={() => {
                        void switchClass(item.id);
                        navigate(`/${item.subdomain}`);
                      }}
                      className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                    >
                      Switch
                    </button>
                    <button
                      onClick={() => void copyLink(item.subdomain, item.id)}
                      className="inline-flex items-center gap-2 rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
                    >
                      <Copy className="h-4 w-4" />
                      <span>{copiedBranchId === item.id ? 'Copied' : 'Copy Login Link'}</span>
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
          <div className="mb-5 flex items-center gap-3">
            <div className="rounded-xl bg-purple-100 p-3 text-purple-700">
              <Plus className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Create New Branch</h2>
              <p className="text-sm text-gray-500">Add Airoli, Vashi, Nerul, or any other branch under the same account.</p>
            </div>
          </div>

          <form className="space-y-4" onSubmit={handleCreateBranch}>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Branch name</label>
              <input
                type="text"
                value={formData.name}
                onChange={(event) => {
                  const name = event.target.value;
                  setFormData((prev) => ({ ...prev, name, subdomain: sanitizeSubdomain(name) }));
                }}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Airoli Branch"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Branch slug</label>
              <div className="flex items-center overflow-hidden rounded-lg border border-gray-300">
                <span className="bg-gray-50 px-3 py-2 text-sm text-gray-500">{window.location.origin}/</span>
                <input
                  type="text"
                  value={formData.subdomain}
                  onChange={(event) => setFormData((prev) => ({ ...prev, subdomain: sanitizeSubdomain(event.target.value) }))}
                  className="flex-1 px-3 py-2 focus:outline-none"
                  placeholder="airoli"
                />
              </div>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Description</label>
              <textarea
                value={formData.description}
                onChange={(event) => setFormData((prev) => ({ ...prev, description: event.target.value }))}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                rows={3}
                placeholder="Weekend science coaching branch"
              />
            </div>

            <label className="flex items-center justify-between rounded-xl border border-gray-100 p-4">
              <div>
                <div className="font-medium text-gray-900">Allow self registration</div>
                <div className="text-sm text-gray-500">Turn this on if students and teachers can register from the public branch link.</div>
              </div>
              <input
                type="checkbox"
                checked={formData.allowSelfRegistration}
                onChange={(event) => setFormData((prev) => ({ ...prev, allowSelfRegistration: event.target.checked }))}
                className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
            </label>

            <label className="flex items-center justify-between rounded-xl border border-gray-100 p-4">
              <div>
                <div className="font-medium text-gray-900">Require approval</div>
                <div className="text-sm text-gray-500">New signups will stay pending until the branch admin approves them.</div>
              </div>
              <input
                type="checkbox"
                checked={formData.requireApproval}
                onChange={(event) => setFormData((prev) => ({ ...prev, requireApproval: event.target.checked }))}
                className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
            </label>

            <button
              type="submit"
              disabled={isSubmitting}
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-blue-600 to-purple-600 px-4 py-3 font-medium text-white hover:from-blue-700 hover:to-purple-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <School className="h-4 w-4" />
              <span>{isSubmitting ? 'Creating branch...' : 'Create Branch'}</span>
            </button>
          </form>

          <div className="mt-6 rounded-2xl border border-orange-100 bg-orange-50 p-4 text-sm text-orange-700">
            <div className="flex items-center gap-2 font-medium">
              <Link className="h-4 w-4" />
              <span>Multi-branch flow</span>
            </div>
            <p className="mt-2">Users with access to multiple branches can switch branches from the header after login, and they will now get a branch chooser when signing in from the main login.</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default BranchManagement;
