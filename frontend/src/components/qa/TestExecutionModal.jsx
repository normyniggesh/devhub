import { useState, useEffect } from 'react';
import Modal from '../common/Modal';
import Avatar from '../common/Avatar';
import { apiClient } from '../../api/client';

export default function TestExecutionModal({
  isOpen,
  onClose,
  testCase,
  currentUser,
  onRunSaved,
  onCreateBugFromRun
}) {
  const [status, setStatus] = useState('Passed');
  const [actualResult, setActualResult] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [savedResult, setSavedResult] = useState(null);

  useEffect(() => {
    if (isOpen && testCase) {
      setStatus('Passed');
      setActualResult(testCase.expectedResult || '');
      setNotes('');
      setError(null);
      setSavedResult(null);
    }
  }, [isOpen, testCase]);

  if (!isOpen || !testCase) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!status) {
      setError('Please select an execution status');
      return;
    }

    try {
      setSubmitting(true);
      setError(null);

      const res = await apiClient(`/test-cases/${testCase.id}/run`, {
        method: 'POST',
        body: {
          status,
          actualResult: actualResult.trim() || undefined,
          notes: notes.trim() || undefined
        }
      });

      if (onRunSaved) {
        onRunSaved(res.testResult, res.testCase);
      }

      if (status === 'Failed') {
        // Keep modal open to offer immediate bug creation
        setSavedResult(res.testResult);
      } else {
        onClose();
      }
    } catch (err) {
      setError(err.message || 'Failed to save test execution run');
    } finally {
      setSubmitting(false);
    }
  };

  const handleLaunchBugCreation = () => {
    if (onCreateBugFromRun) {
      onCreateBugFromRun(testCase, savedResult);
    }
    onClose();
  };

  return (
    <Modal open={isOpen} onClose={onClose} className="max-w-lg p-6 bg-[#0f1422] border border-[#1f2a44] rounded-2xl shadow-2xl text-slate-100">
      {/* Header */}
      <div className="flex items-center justify-between pb-3.5 border-b border-slate-700/50 mb-4">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center shrink-0">
            <i className="fa-solid fa-play text-indigo-400 text-xs"></i>
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-900 dark:text-white leading-tight">Run Test</h3>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 font-mono">TC-{testCase.id.substring(0, 6).toUpperCase()}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200 dark:hover:bg-slate-800 transition"
        >
          <i className="fa-solid fa-xmark text-sm"></i>
        </button>
      </div>

      {/* If Failed Run Just Completed: Prompt to Create Bug */}
      {savedResult && savedResult.status === 'Failed' ? (
        <div className="space-y-4 py-2">
          <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 space-y-2">
            <div className="flex items-center gap-2 font-bold text-sm text-rose-400">
              <i className="fa-solid fa-triangle-exclamation"></i>
              <span>Test Run Marked as FAILED</span>
            </div>
            <p className="text-xs text-rose-300/90 leading-relaxed">
              Execution has been recorded. Would you like to create a linked Bug now with all test details pre-filled?
            </p>
          </div>

          <div className="p-3 bg-slate-900/60 border border-slate-800 rounded-xl space-y-1 text-xs">
            <div className="text-slate-400"><span className="font-semibold text-slate-300">Test:</span> {testCase.title}</div>
            <div className="text-slate-400"><span className="font-semibold text-slate-300">Actual Result:</span> {savedResult.actualResult || 'N/A'}</div>
          </div>

          <div className="flex items-center justify-end gap-2.5 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-400 hover:text-white transition"
            >
              Done (Skip Bug)
            </button>
            <button
              type="button"
              onClick={handleLaunchBugCreation}
              className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-xs font-bold transition flex items-center gap-2 shadow-lg shadow-rose-900/40"
            >
              <i className="fa-solid fa-bug"></i>
              <span>Create Bug</span>
            </button>
          </div>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          {error && (
            <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs">
              {error}
            </div>
          )}

          {/* Test Info (Read-only) */}
          <div className="p-3.5 bg-slate-900/60 dark:bg-[#141b2d] border border-slate-800 rounded-xl space-y-1.5">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Test Case</label>
            <h4 className="text-sm font-bold text-white">{testCase.title}</h4>
            {testCase.description && (
              <p className="text-[11px] text-slate-400 leading-relaxed">{testCase.description}</p>
            )}
          </div>

          {/* Expected Result (Read-only) */}
          <div className="p-3 bg-slate-900/40 border border-slate-800 rounded-xl space-y-1">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Expected Result</span>
            <p className="text-xs text-slate-200">{testCase.expectedResult || 'No expected result specified.'}</p>
          </div>

          {/* Status Selector */}
          <div>
            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">
              Execution Status <span className="text-rose-400">*</span>
            </label>
            <div className="grid grid-cols-3 gap-2.5">
              <button
                type="button"
                onClick={() => setStatus('Passed')}
                className={`py-2 px-3 rounded-xl border text-xs font-bold transition flex items-center justify-center gap-1.5 ${
                  status === 'Passed'
                    ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-400 shadow-md shadow-emerald-950/40'
                    : 'bg-[#161d2f] border-[#222e48] text-slate-400 hover:text-white'
                }`}
              >
                <i className="fa-solid fa-circle-check"></i>
                <span>Passed</span>
              </button>

              <button
                type="button"
                onClick={() => setStatus('Failed')}
                className={`py-2 px-3 rounded-xl border text-xs font-bold transition flex items-center justify-center gap-1.5 ${
                  status === 'Failed'
                    ? 'bg-rose-500/20 border-rose-500/50 text-rose-400 shadow-md shadow-rose-950/40'
                    : 'bg-[#161d2f] border-[#222e48] text-slate-400 hover:text-white'
                }`}
              >
                <i className="fa-solid fa-circle-xmark"></i>
                <span>Failed</span>
              </button>

              <button
                type="button"
                onClick={() => setStatus('Blocked')}
                className={`py-2 px-3 rounded-xl border text-xs font-bold transition flex items-center justify-center gap-1.5 ${
                  status === 'Blocked'
                    ? 'bg-amber-500/20 border-amber-500/50 text-amber-400 shadow-md shadow-amber-950/40'
                    : 'bg-[#161d2f] border-[#222e48] text-slate-400 hover:text-white'
                }`}
              >
                <i className="fa-solid fa-ban"></i>
                <span>Blocked</span>
              </button>
            </div>
          </div>

          {/* Actual Result */}
          <div>
            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
              Actual Result
            </label>
            <textarea
              rows="2"
              value={actualResult}
              onChange={e => setActualResult(e.target.value)}
              placeholder="What actually happened during this test run?"
              className="w-full bg-[#161d2f] border border-[#222e48] rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition"
            />
          </div>

          {/* Optional Notes */}
          <div>
            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
              Notes (Optional)
            </label>
            <input
              type="text"
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Environment details, browser version, commit hash..."
              className="w-full bg-[#161d2f] border border-[#222e48] rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition"
            />
          </div>

          {/* Tester & Date Meta (Automatic) */}
          <div className="flex items-center justify-between pt-2 border-t border-[#1f2a44] text-[11px] text-slate-400">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-slate-500">Tester:</span>
              <div className="flex items-center gap-1.5">
                <Avatar user={currentUser} size="xs" />
                <span className="text-slate-300 font-medium">{currentUser?.name || 'Current User'}</span>
              </div>
            </div>
            <div className="flex items-center gap-1.5 text-slate-400">
              <i className="fa-regular fa-calendar text-[10px]"></i>
              <span>{new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</span>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-2.5 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-slate-200 dark:bg-[#1b233a] hover:bg-slate-300 dark:hover:bg-[#253150] text-slate-700 dark:text-slate-300 rounded-xl text-xs font-semibold transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className={`px-5 py-2 text-white rounded-xl text-xs font-bold transition flex items-center gap-2 shadow-lg ${
                status === 'Passed'
                  ? 'bg-emerald-600 hover:bg-emerald-500 shadow-emerald-950/40'
                  : status === 'Failed'
                  ? 'bg-rose-600 hover:bg-rose-500 shadow-rose-950/40'
                  : 'bg-indigo-600 hover:bg-indigo-500 shadow-indigo-950/40'
              }`}
            >
              {submitting ? (
                <>
                  <i className="fa-solid fa-circle-notch fa-spin text-xs"></i>
                  <span>Saving Run...</span>
                </>
              ) : (
                <>
                  <i className="fa-solid fa-check text-xs"></i>
                  <span>Save Test Run</span>
                </>
              )}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}
