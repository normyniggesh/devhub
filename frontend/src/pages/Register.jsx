import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useStore } from '../store';

const Register = () => {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [registrationCode, setRegistrationCode] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  
  const register = useStore((state) => state.register);
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    
    if (password !== confirmPassword) {
      return setError('Passwords do not match');
    }
    if (password.length < 6) {
      return setError('Password must be at least 6 characters');
    }
    if (!registrationCode) {
      return setError('Registration Access Code is required');
    }

    setLoading(true);
    
    try {
      const res = await register(name, email, password, registrationCode);
      setSuccess('Account created successfully! You can now sign in.');
      setTimeout(() => navigate('/login'), 2000);
    } catch (err) {
      setError(err.message || 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-900 px-4 py-12">
      <div className="max-w-md w-full bg-[#121624] border border-[#1e2538] rounded-2xl shadow-2xl overflow-hidden">
        <div className="px-8 py-10">
              <div className="text-center mb-8">
                <div className="w-12 h-12 rounded-xl devhub-logo-box bg-gradient-to-tr from-purple-600 to-indigo-500 flex items-center justify-center text-white shadow-lg shadow-indigo-600/30 mx-auto mb-3">
                  <i className="fa-solid fa-bolt text-lg"></i>
                </div>
                <h2 className="text-2xl font-bold text-white mb-1">Create Account</h2>
                <p className="text-xs text-slate-400">Join DEVHUB and collaborate on projects</p>
              </div>
              
              {error && (
                <div className="bg-red-500/10 border border-red-500/40 text-red-300 text-xs px-4 py-3 rounded-xl mb-5 flex items-start space-x-2">
                  <i className="fa-solid fa-circle-exclamation mt-0.5 shrink-0 text-red-400"></i>
                  <span>{error}</span>
                </div>
              )}
              {success && (
                <div className="bg-green-500/10 border border-green-500/40 text-green-300 text-xs px-4 py-3 rounded-xl mb-5 flex items-start space-x-2">
                  <i className="fa-solid fa-check-circle mt-0.5 shrink-0 text-green-400"></i>
                  <span>{success}</span>
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                    Full Name
                  </label>
                  <input
                    type="text"
                    required
                    className="w-full px-4 py-2.5 bg-[#090c14] border border-[#232a3e] rounded-xl text-white text-sm focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors placeholder:text-slate-600"
                    placeholder="Jane Doe"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </div>
                
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                    Email Address
                  </label>
                  <input
                    type="email"
                    required
                    className="w-full px-4 py-2.5 bg-[#090c14] border border-[#232a3e] rounded-xl text-white text-sm focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors placeholder:text-slate-600"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>
                
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                    Password
                  </label>
                  <input
                    type="password"
                    required
                    className="w-full px-4 py-2.5 bg-[#090c14] border border-[#232a3e] rounded-xl text-white text-sm focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors placeholder:text-slate-600"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </div>
                
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                    Confirm Password
                  </label>
                  <input
                    type="password"
                    required
                    className="w-full px-4 py-2.5 bg-[#090c14] border border-[#232a3e] rounded-xl text-white text-sm focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors placeholder:text-slate-600"
                    placeholder="••••••••"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                    Registration Access Code
                  </label>
                  <input
                    type="text"
                    required
                    className="w-full px-4 py-2.5 bg-[#090c14] border border-[#232a3e] rounded-xl text-white text-sm focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors placeholder:text-slate-600 font-mono"
                    placeholder="Enter access code"
                    value={registrationCode}
                    onChange={(e) => setRegistrationCode(e.target.value)}
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-semibold py-3 rounded-xl transition-all shadow-lg shadow-indigo-600/20 disabled:opacity-50 disabled:cursor-not-allowed mt-2 flex items-center justify-center space-x-2 text-sm"
                >
                  {loading ? (
                    <>
                      <i className="fa-solid fa-circle-notch fa-spin text-sm"></i>
                      <span>Creating Account...</span>
                    </>
                  ) : (
                    <span>Create Account</span>
                  )}
                </button>
              </form>

              <p className="mt-6 text-center text-xs text-slate-400">
                Already have an account?{' '}
                <Link to="/login" className="text-indigo-400 hover:text-indigo-300 font-semibold">
                  Sign in
                </Link>
              </p>
        </div>
      </div>
    </div>
  );
};

export default Register;
