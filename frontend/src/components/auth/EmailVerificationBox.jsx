import React, { useState, useEffect } from 'react';
import { useStore } from '../../store';

/**
 * Reusable Email Verification Component
 * Used in Register, Login (for unverified accounts), or standalone verification modal.
 */
export default function EmailVerificationBox({ email, onVerified, onBack }) {
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [resending, setResending] = useState(false);
  const [cooldown, setCooldown] = useState(60);

  const verifyEmail = useStore((state) => state.verifyEmail);
  const resendCode = useStore((state) => state.resendCode);

  // Cooldown countdown timer
  useEffect(() => {
    if (cooldown <= 0) return;
    const interval = setInterval(() => {
      setCooldown((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(interval);
  }, [cooldown]);

  const handleVerify = async (e) => {
    e.preventDefault();
    if (!code || code.trim().length !== 6) {
      setError('Please enter a valid 6-digit verification code');
      return;
    }

    setError('');
    setSuccessMsg('');
    setVerifying(true);

    try {
      const res = await verifyEmail(email, code.trim());
      setSuccessMsg(res.message || 'Email verified successfully! Signing in...');
      setTimeout(() => {
        if (onVerified) onVerified(res.user);
      }, 1000);
    } catch (err) {
      setError(err.message || 'Verification failed. Please check your code.');
    } finally {
      setVerifying(false);
    }
  };

  const handleResend = async () => {
    if (cooldown > 0 || resending) return;
    setError('');
    setSuccessMsg('');
    setResending(true);

    try {
      const res = await resendCode(email);
      setSuccessMsg(res.message || 'New 6-digit verification code sent to your email.');
      setCooldown(60);
      setCode('');
    } catch (err) {
      setError(err.message || 'Failed to resend verification code');
    } finally {
      setResending(false);
    }
  };

  return (
    <div className="w-full">
      <div className="text-center mb-6">
        <div className="w-14 h-14 bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 rounded-2xl mx-auto flex items-center justify-center mb-4 text-2xl shadow-inner">
          <i className="fa-regular fa-envelope-open"></i>
        </div>
        <h2 className="text-2xl font-bold text-white mb-2">Check Your Email</h2>
        <p className="text-sm text-slate-400">
          We have sent a 6-digit verification code to
        </p>
        <p className="text-sm font-semibold text-indigo-300 mt-1 break-all bg-indigo-950/40 border border-indigo-800/30 px-3 py-1 rounded-lg inline-block">
          {email}
        </p>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/40 text-red-300 text-xs px-4 py-3 rounded-xl mb-5 flex items-start space-x-2">
          <i className="fa-solid fa-circle-exclamation mt-0.5 shrink-0 text-red-400"></i>
          <span>{error}</span>
        </div>
      )}

      {successMsg && (
        <div className="bg-emerald-500/10 border border-emerald-500/40 text-emerald-300 text-xs px-4 py-3 rounded-xl mb-5 flex items-start space-x-2">
          <i className="fa-solid fa-circle-check mt-0.5 shrink-0 text-emerald-400"></i>
          <span>{successMsg}</span>
        </div>
      )}

      <form onSubmit={handleVerify} className="space-y-5">
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2 text-center">
            Enter 6-Digit Code
          </label>
          <div className="relative">
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={6}
              autoFocus
              required
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              className="w-full text-center text-3xl font-mono tracking-[0.5em] font-bold py-3.5 px-4 bg-[#090c14] border border-[#2b3553] text-white rounded-xl focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all placeholder:text-slate-600 placeholder:tracking-normal placeholder:font-sans placeholder:text-sm"
              placeholder="••••••"
            />
          </div>
          <div className="flex items-center justify-between text-[11px] text-slate-500 mt-2 px-1">
            <span>Valid for 10 minutes</span>
            <span>Max 5 attempts</span>
          </div>
        </div>

        <button
          type="submit"
          disabled={verifying || code.length !== 6}
          className="w-full bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-semibold py-3 rounded-xl transition shadow-lg shadow-indigo-600/20 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-2"
        >
          {verifying ? (
            <>
              <i className="fa-solid fa-circle-notch fa-spin text-sm"></i>
              <span>Verifying Code...</span>
            </>
          ) : (
            <>
              <i className="fa-solid fa-shield-check text-sm"></i>
              <span>Verify & Continue</span>
            </>
          )}
        </button>
      </form>

      <div className="mt-6 pt-5 border-t border-slate-800/80 flex flex-col items-center space-y-3">
        <button
          type="button"
          disabled={cooldown > 0 || resending}
          onClick={handleResend}
          className="text-xs text-indigo-400 hover:text-indigo-300 font-medium transition disabled:text-slate-500 disabled:cursor-not-allowed"
        >
          {resending ? (
            'Sending new code...'
          ) : cooldown > 0 ? (
            `Resend code in ${cooldown}s`
          ) : (
            "Didn't receive a code? Resend Code"
          )}
        </button>

        {onBack && (
          <button
            type="button"
            onClick={onBack}
            className="text-xs text-slate-500 hover:text-slate-300 transition flex items-center space-x-1"
          >
            <i className="fa-solid fa-arrow-left text-[10px]"></i>
            <span>Use a different email</span>
          </button>
        )}
      </div>
    </div>
  );
}
