import React, { useState } from 'react';
import { School, Building, Globe, Settings, ArrowRight } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import FeedbackMessage from '../Common/FeedbackMessage';
import { sanitizeSubdomain, validateRequired } from '../../utils/validation';

const ClassSetup: React.FC = () => {
  const { createClass, isLoading } = useAuth();
  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    subdomain: '',
    allowSelfRegistration: true,
    requireApproval: false
  });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? (e.target as HTMLInputElement).checked : value
    }));
    
    // Auto-generate subdomain from class name
    if (name === 'name') {
      const subdomain = sanitizeSubdomain(value);
      setFormData(prev => ({ ...prev, subdomain }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    const nameError = validateRequired('Class name', formData.name);
    const subdomainError = validateRequired('Subdomain', formData.subdomain);
    if (nameError || subdomainError) {
      setError(nameError || subdomainError);
      return;
    }
    if (sanitizeSubdomain(formData.subdomain) !== formData.subdomain) {
      setError('Subdomain can only contain lowercase letters, numbers, and hyphens.');
      return;
    }

    try {
      const success = await createClass({
        name: formData.name,
        description: formData.description,
        subdomain: formData.subdomain,
        settings: {
          allowSelfRegistration: formData.allowSelfRegistration,
          requireApproval: formData.requireApproval
        }
      });

      if (!success) {
        setError('Failed to create class. Please try again.');
      } else {
        setSuccess('Class created successfully.');
      }
    } catch (err) {
      setError('An error occurred. Please try again.');
    }
  };

  const nextStep = () => {
    if (step === 1 && (!formData.name.trim() || !formData.subdomain.trim())) {
      setError('Please fill in all required fields');
      return;
    }
    setError('');
    setStep(step + 1);
  };

  const prevStep = () => {
    setError('');
    setStep(step - 1);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 flex items-center justify-center py-12 px-4">
      <div className="max-w-2xl w-full">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="flex justify-center mb-4">
            <div className="bg-gradient-to-r from-blue-600 to-purple-600 p-4 rounded-2xl">
              <School className="h-12 w-12 text-white" />
            </div>
          </div>
          <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
            Setup Your Coaching Class
          </h1>
          <p className="text-gray-600 mt-2">Create and configure your coaching institute</p>
        </div>

        {/* Progress Steps */}
        <div className="flex justify-center mb-8">
          <div className="flex items-center space-x-4">
            <div className={`flex items-center justify-center w-10 h-10 rounded-full ${
              step >= 1 ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-500'
            }`}>
              1
            </div>
            <div className={`w-16 h-1 ${step >= 2 ? 'bg-blue-600' : 'bg-gray-200'}`}></div>
            <div className={`flex items-center justify-center w-10 h-10 rounded-full ${
              step >= 2 ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-500'
            }`}>
              2
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-xl p-8">
          <form onSubmit={handleSubmit}>
            {step === 1 && (
              <div className="space-y-6">
                <div className="text-center mb-6">
                  <Building className="h-12 w-12 text-blue-600 mx-auto mb-3" />
                  <h2 className="text-xl font-semibold text-gray-900">Basic Information</h2>
                  <p className="text-gray-600">Tell us about your coaching institute</p>
                </div>

                <div>
                  <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-2">
                    Class Name *
                  </label>
                  <input
                    type="text"
                    id="name"
                    name="name"
                    value={formData.name}
                    onChange={handleInputChange}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="e.g., Excellence Academy"
                    required
                  />
                </div>

                <div>
                  <label htmlFor="description" className="block text-sm font-medium text-gray-700 mb-2">
                    Description
                  </label>
                  <textarea
                    id="description"
                    name="description"
                    value={formData.description}
                    onChange={handleInputChange}
                    rows={3}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Brief description of your coaching institute"
                  />
                </div>

                <div>
                  <label htmlFor="subdomain" className="block text-sm font-medium text-gray-700 mb-2">
                    Subdomain *
                  </label>
                  <div className="flex items-center">
                    <span className="bg-gray-100 px-3 py-3 border border-r-0 border-gray-300 rounded-l-lg text-gray-600">
                      teachflow.com/
                    </span>
                    <input
                      type="text"
                      id="subdomain"
                      name="subdomain"
                      value={formData.subdomain}
                      onChange={handleInputChange}
                      className="flex-1 px-4 py-3 border border-gray-300 rounded-r-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="your-class-name"
                      required
                    />
                  </div>
                  <p className="text-xs text-gray-500 mt-1">This will be your unique class URL</p>
                </div>

                <button
                  type="button"
                  onClick={nextStep}
                  className="w-full flex items-center justify-center space-x-2 bg-gradient-to-r from-blue-600 to-purple-600 text-white py-3 px-4 rounded-lg hover:from-blue-700 hover:to-purple-700 transition-all"
                >
                  <span>Continue</span>
                  <ArrowRight className="h-5 w-5" />
                </button>
              </div>
            )}

            {step === 2 && (
              <div className="space-y-6">
                <div className="text-center mb-6">
                  <Settings className="h-12 w-12 text-blue-600 mx-auto mb-3" />
                  <h2 className="text-xl font-semibold text-gray-900">Class Settings</h2>
                  <p className="text-gray-600">Configure how your class operates</p>
                </div>

                <div className="space-y-4">
                  <div className="flex items-center justify-between p-4 border border-gray-200 rounded-lg">
                    <div>
                      <h3 className="font-medium text-gray-900">Allow Self Registration</h3>
                      <p className="text-sm text-gray-600">Let students and teachers register themselves</p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        name="allowSelfRegistration"
                        checked={formData.allowSelfRegistration}
                        onChange={handleInputChange}
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                    </label>
                  </div>

                  <div className="flex items-center justify-between p-4 border border-gray-200 rounded-lg">
                    <div>
                      <h3 className="font-medium text-gray-900">Require Admin Approval</h3>
                      <p className="text-sm text-gray-600">New registrations need admin approval</p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        name="requireApproval"
                        checked={formData.requireApproval}
                        onChange={handleInputChange}
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                    </label>
                  </div>
                </div>

                {error && (
                  <FeedbackMessage type="error" message={error} />
                )}
                <FeedbackMessage type="success" message={success} />

                <div className="flex space-x-4">
                  <button
                    type="button"
                    onClick={prevStep}
                    className="flex-1 py-3 px-4 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    Back
                  </button>
                  <button
                    type="submit"
                    disabled={isLoading}
                    className="flex-1 bg-gradient-to-r from-blue-600 to-purple-600 text-white py-3 px-4 rounded-lg hover:from-blue-700 hover:to-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                  >
                    {isLoading ? 'Creating...' : 'Create Class'}
                  </button>
                </div>
              </div>
            )}
          </form>
        </div>
      </div>
    </div>
  );
};

export default ClassSetup;
