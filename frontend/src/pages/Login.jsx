import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useStore } from '../store';
import EmailVerificationBox from '../components/auth/EmailVerificationBox';

const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [unverifiedEmail, setUnverifiedEmail] = useState(null);
  const [showVerification, setShowVerification] = useState(false);
  const [loading, setLoading] = useState(false);
  
  const login = useStore((state) => state.login);
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setUnverifiedEmail(null);
    setLoading(true);
    
    try {
      await login(email, password);
      navigate('/');
    } catch (err) {
      const isUnverified = err.data?.requiresVerification || err.message?.toLowerCase().includes('verify your email');
      if (isUnverified) {
        setUnverifiedEmail(err.data?.email || email.toLowerCase().trim());
        setError('Please verify your email before signing in.');
      } else {
        setError(err.message || 'Login failed');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-900 px-4 py-12">
      <div className="max-w-md w-full bg-[#121624] border border-[#1e2538] rounded-2xl shadow-2xl overflow-hidden">
        <div className="px-8 py-10">
          {showVerification ? (
            <EmailVerificationBox
              email={unverifiedEmail || email.toLowerCase().trim()}
              onVerified={() => navigate('/')}
              onBack={() => setShowVerification(false)}
            />
          ) : (
            <>
              <div className="text-center mb-8">
                <div className="w-12 h-12 rounded-xl devhub-logo-box bg-gradient-to-tr from-purple-600 to-indigo-500 flex items-center justify-center text-white shadow-lg shadow-indigo-600/30 mx-auto mb-3">
                  <i className="fa-solid fa-bolt text-lg"></i>
                </div>
                <h2 className="text-2xl font-bold text-white mb-1">Welcome Back</h2>
                <p className="text-xs text-slate-400">Sign in to your DEVHUB workspace</p>
              </div>
              
              {error && (
                <div className="bg-red-500/10 border border-red-500/40 text-red-300 text-xs px-4 py-3 rounded-xl mb-5 space-y-2">
                  <div className="flex items-start space-x-2">
                    <i className="fa-solid fa-circle-exclamation mt-0.5 shrink-0 text-red-400"></i>
                    <span>{error}</span>
                  </div>
                  {unverifiedEmail && (
                    <div className="pt-2 border-t border-red-500/20 flex justify-end">
                      <button
                        type="button"
                        onClick={() => setShowVerification(true)}
                        className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs px-3 py-1.5 rounded-lg transition shadow flex items-center space-x-1.5"
                      >
                        <i className="fa-solid fa-envelope-circle-check text-[11px]"></i>
                        <span>Enter Verification Code</span>
                      </button>
                    </div>
                  )}
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
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

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-semibold py-3 rounded-xl transition shadow-lg shadow-indigo-600/20 disabled:opacity-50 disabled:cursor-not-allowed mt-2 flex items-center justify-center space-x-2 text-sm"
                >
                  {loading ? (
                    <>
                      <i className="fa-solid fa-circle-notch fa-spin text-sm"></i>
                      <span>Signing in...</span>
                    </>
                  ) : (
                    <span>Sign In</span>
                  )}
                </button>
              </form>

              <p className="mt-6 text-center text-xs text-slate-400">
                Don't have an account?{' '}
                <Link to="/register" className="text-indigo-400 hover:text-indigo-300 font-semibold">
                  Create one now
                </Link>
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default Login;
