import React, { useEffect, useState } from 'react';
import { Eye, EyeOff, Mail, Lock, User, UserCheck } from 'lucide-react';
import { sendPasswordResetEmail } from 'firebase/auth';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import FeedbackMessage from '../Common/FeedbackMessage';
import { auth } from '../../services/firebase';
import { isValidEmail, validatePassword, validateRequired } from '../../utils/validation';

interface AuthFormProps {
  tenantSlug?: string;
  initialMode?: 'login' | 'signup';
}

const AuthForm: React.FC<AuthFormProps> = ({ tenantSlug, initialMode = 'login' }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const [isLogin, setIsLogin] = useState(initialMode === 'login');
  const [showPassword, setShowPassword] = useState(false);
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    name: '',
    role: 'student' as 'admin' | 'teacher' | 'student' | 'parent'
  });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isResettingPassword, setIsResettingPassword] = useState(false);
  const { login, signup } = useAuth();

  useEffect(() => {
    setIsLogin(!location.pathname.includes('signup'));
  }, [location.pathname]);

  useEffect(() => {
    if (tenantSlug && !isLogin && formData.role === 'admin') {
      setFormData((prev) => ({ ...prev, role: 'student' }));
    }
  }, [tenantSlug, isLogin, formData.role]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    const nameError = !isLogin ? validateRequired('Full name', formData.name) : '';
    const emailError = isValidEmail(formData.email) ? '' : 'Please enter a valid email address.';
    const passwordError = validatePassword(formData.password);

    if (nameError || emailError || passwordError) {
      setError(nameError || emailError || passwordError);
      return;
    }

    setIsSubmitting(true);
    try {
      if (isLogin) {
        await login(formData.email, formData.password, tenantSlug);
      } else {
        await signup(formData.email, formData.password, formData.name, formData.role, tenantSlug);
        setSuccess('Account created successfully. Your workspace access will load automatically.');
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'An error occurred. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
  };

  const handleModeToggle = () => {
    const nextMode = isLogin ? 'signup' : 'login';
    navigate(tenantSlug ? `/${tenantSlug}/${nextMode}` : `/${nextMode}`);
  };

  const handleForgotPassword = async () => {
    setError('');
    setSuccess('');

    const email = formData.email.trim();
    if (!email) {
      setError('Please enter your email');
      return;
    }

    if (!isValidEmail(email)) {
      setError('Please enter a valid email address.');
      return;
    }

    setIsResettingPassword(true);
    try {
      await sendPasswordResetEmail(auth, email);
      setSuccess('Password reset link sent');
    } catch (err) {
      const code = (err as { code?: string }).code;
      if (code === 'auth/user-not-found' || code === 'auth/invalid-email') {
        setError('Please enter a valid registered email address.');
      } else {
        setError('Unable to send reset link. Please try again.');
      }
    } finally {
      setIsResettingPassword(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-6">
        <div className="flex flex-col items-center gap-0 text-center">
          <div className="flex justify-center items-center mb-[-16px] mt-[-10px] h-[120px] overflow-hidden">
            <img
              src="/assets/logo.png"
              alt="TeachFlow"
              draggable={false}
              className="block w-64 h-auto object-cover object-top leading-none"
              style={{
                maxHeight: '150%',
                clipPath: 'inset(0 15% 0 0)',
              }}
            />
          </div>
          <h2 className="mt-0 mb-0 text-3xl font-bold leading-none bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
            TeachFlow
          </h2>
          <p className="mt-1 text-sm text-gray-600">
            {tenantSlug
              ? `${isLogin ? 'Sign in to continue to' : 'Create your account for'} ${tenantSlug}`
              : isLogin
                ? 'Sign in to your account'
                : 'Create your account'}
          </p>
        </div>

        <div className="bg-white rounded-2xl shadow-xl p-8">
          <form className="space-y-6" onSubmit={handleSubmit}>
            {!isLogin && (
              <div>
                <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-2">
                  Full Name
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <User className="h-5 w-5 text-gray-400" />
                  </div>
                  <input
                    id="name"
                    name="name"
                    type="text"
                    required={!isLogin}
                    value={formData.name}
                    onChange={handleInputChange}
                    className="block w-full pl-10 pr-3 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="Enter your full name"
                  />
                </div>
              </div>
            )}

            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">
                Email Address
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Mail className="h-5 w-5 text-gray-400" />
                </div>
                <input
                  id="email"
                  name="email"
                  type="email"
                  required
                  value={formData.email}
                  onChange={handleInputChange}
                  className="block w-full pl-10 pr-3 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="Enter your email"
                />
              </div>
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-2">
                Password
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Lock className="h-5 w-5 text-gray-400" />
                </div>
                <input
                  id="password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={formData.password}
                  onChange={handleInputChange}
                  className="block w-full pl-10 pr-12 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="Enter your password"
                />
                <button
                  type="button"
                  className="absolute inset-y-0 right-0 pr-3 flex items-center"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? (
                    <EyeOff className="h-5 w-5 text-gray-400" />
                  ) : (
                    <Eye className="h-5 w-5 text-gray-400" />
                  )}
                </button>
              </div>
              {isLogin ? (
                <div className="mt-2 text-right">
                  <button
                    type="button"
                    onClick={() => void handleForgotPassword()}
                    disabled={isResettingPassword}
                    className="text-sm font-medium text-blue-600 transition hover:text-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isResettingPassword ? 'Sending reset link...' : 'Forgot Password?'}
                  </button>
                </div>
              ) : null}
            </div>

            {!isLogin && (
              <div>
                <label htmlFor="role" className="block text-sm font-medium text-gray-700 mb-2">
                  Role
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <UserCheck className="h-5 w-5 text-gray-400" />
                  </div>
                  <select
                    id="role"
                    name="role"
                    value={formData.role}
                    onChange={handleInputChange}
                    className="block w-full pl-10 pr-3 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    <option value="student">Student</option>
                    <option value="teacher">Teacher</option>
                    <option value="parent">Parent</option>
                    {!tenantSlug ? <option value="admin">Admin</option> : null}
                  </select>
                </div>
                {tenantSlug ? (
                  <p className="mt-2 text-xs text-gray-500">
                    Class signup links are for students, teachers, and parents. Admins should use the main TeachFlow login.
                  </p>
                ) : null}
              </div>
            )}

            <FeedbackMessage type="error" message={error} />
            <FeedbackMessage type="success" message={success} />

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full flex justify-center py-3 px-4 border border-transparent rounded-lg shadow-sm text-sm font-medium text-white bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
            >
              {isSubmitting ? 'Please wait...' : (isLogin ? 'Sign In' : 'Sign Up')}
            </button>
          </form>

          <div className="mt-6">
            <div className="text-center">
              <button
                type="button"
                onClick={handleModeToggle}
                className="text-blue-600 hover:text-blue-500 font-medium"
              >
                {isLogin ? "Don't have an account? Sign up" : 'Already have an account? Sign in'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AuthForm;
