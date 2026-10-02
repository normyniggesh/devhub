import React, { useState, useEffect } from 'react';
import Modal from '../common/Modal';
import Avatar from '../common/Avatar';
import TestHistory from './TestHistory';

/**
 * TestResultModal: Direct test execution and result entry dialog.
 * Enforces the core QA rules:
 *   - PASSED: Description is OPTIONAL.
 *   - FAILED: Description is REQUIRED.
 *   - BLOCKED: Description is REQUIRED.
 *   - NOT TESTED: Description is OPTIONAL.
 */
export default function TestResultModal({
  open,
  onClose,
  testCase,
  currentUser,
  onSaveResult,
  onCreateBug
}) {
  const [status, setStatus] = useState('Passed');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [savedResult, setSavedResult] = useState(null);
  const [showHistory, setShowHistory] = useState(false);

  useEffect(() => {
    if (open && testCase) {
      // Initialize with test case's current status or default to Passed
      setStatus(testCase.status && testCase.status !== 'Not Tested' ? testCase.status : 'Passed');
      setDescription(testCase.actualResult || '');
      setError('');
      setSavedResult(null);
      setShowHistory(false);
    }
  }, [open, testCase]);

  if (!open || !testCase) return null;

  const isFailed = status === 'Failed';
  const isBlocked = status === 'Blocked';
  const isDescriptionRequired = isFailed || isBlocked;
  const isSaveDisabled = isDescriptionRequired && !description.trim();

  const handleSave = async (e) => {
    e.preventDefault();
    if (isDescriptionRequired && !description.trim()) {
      setError(`Description / Result is required when marking a test as ${status}.`);
      return;
    }

    setError('');
    setSubmitting(true);

    try {
      const res = await onSaveResult(testCase.id, {
        status,
        description: description.trim()
      });

      // If Failed or Blocked, keep modal to offer [Create Bug]
      if (status === 'Failed' || status === 'Blocked') {
        setSavedResult(res.testResult || { id: 'temp', status, actualResult: description });
      } else {
        onClose();
      }
    } catch (err) {
      setError(err.message || 'Failed to save test result');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCreateBugNow = () => {
    if (onCreateBug) {
      onCreateBug(testCase, savedResult);
    }
    onClose();
  };

  return (
    <Modal open={open} onClose={onClose} className="max-w-lg p-6 bg-[#0f1422] border border-[#1e2538] rounded-2xl shadow-2xl text-slate-100">
      {/* Header */}
      <div className="flex items-center justify-between pb-3.5 border-b border-[#1e2538] mb-4">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center shrink-0">
            <i className="fa-solid fa-flask-vial text-indigo-400 text-xs"></i>
          </div>
          <div>
            <h3 className="text-base font-bold text-white leading-tight">Test Result & Status</h3>
            <p className="text-[11px] text-slate-400 font-mono">TC-{testCase.id.substring(0, 6).toUpperCase()}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-white hover:bg-[#1a2336] transition"
        >
          <i className="fa-solid fa-xmark text-sm"></i>
        </button>
      </div>

      {/* Post-Failure / Post-Blocked Bug Creation Prompt */}
      {savedResult && (savedResult.status === 'Failed' || savedResult.status === 'Blocked') ? (
        <div className="space-y-4 py-2">
          <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 space-y-2">
            <div className="flex items-center gap-2 font-bold text-sm text-rose-400">
              <i className="fa-solid fa-triangle-exclamation"></i>
              <span>Test Recorded as {savedResult.status.toUpperCase()}</span>
            </div>
            <p className="text-xs text-rose-200/90 leading-relaxed">
              The test result has been saved. Would you like to create a linked Bug report pre-filled with this test failure?
            </p>
          </div>

          <div className="p-3 bg-[#090c14] border border-[#1e2538] rounded-xl space-y-1 text-xs">
            <div className="text-slate-400"><span className="font-semibold text-slate-300">Test:</span> {testCase.title}</div>
            <div className="text-slate-400"><span className="font-semibold text-slate-300">Result:</span> {savedResult.actualResult || description || 'N/A'}</div>
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
              onClick={handleCreateBugNow}
              className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-xs font-bold transition flex items-center gap-2 shadow-lg shadow-rose-900/40"
            >
              <i className="fa-solid fa-bug"></i>
              <span>Create Bug</span>
            </button>
          </div>
        </div>
      ) : (
        <form onSubmit={handleSave} className="space-y-4 text-xs">
          {error && (
            <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
              <i className="fa-solid fa-circle-exclamation text-rose-400 shrink-0"></i>
              <span>{error}</span>
            </div>
          )}

          {/* Test Info */}
          <div className="p-3.5 bg-[#090c14] border border-[#1e2538] rounded-xl space-y-1">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Test Case</label>
            <h4 className="text-sm font-bold text-white">{testCase.title}</h4>
            {testCase.description && (
              <p className="text-[11px] text-slate-400 leading-relaxed">{testCase.description}</p>
            )}
          </div>

          {/* Expected Result */}
          {testCase.expectedResult && (
            <div className="p-3 bg-[#090c14] border border-[#1e2538] rounded-xl space-y-1">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Expected Result</span>
              <p className="text-xs text-slate-200">{testCase.expectedResult}</p>
            </div>
          )}

          {/* Status Buttons */}
          <div>
            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">
              Status <span className="text-rose-400">*</span>
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {/* Not Tested */}
              <button
                type="button"
                onClick={() => setStatus('Not Tested')}
                className={`py-2 px-2.5 rounded-xl border text-xs font-bold transition flex items-center justify-center gap-1.5 ${
                  status === 'Not Tested'
                    ? 'bg-slate-700/40 border-slate-400 text-white shadow-sm'
                    : 'bg-[#121624] border-[#1e2538] text-slate-400 hover:text-white'
                }`}
              >
                <i className="fa-regular fa-circle-question"></i>
                <span>Not Tested</span>
              </button>

              {/* Passed */}
              <button
                type="button"
                onClick={() => setStatus('Passed')}
                className={`py-2 px-2.5 rounded-xl border text-xs font-bold transition flex items-center justify-center gap-1.5 ${
                  status === 'Passed'
                    ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-400 shadow-sm'
                    : 'bg-[#121624] border-[#1e2538] text-slate-400 hover:text-white'
                }`}
              >
                <i className="fa-solid fa-circle-check"></i>
                <span>Passed</span>
              </button>

              {/* Failed */}
              <button
                type="button"
                onClick={() => setStatus('Failed')}
                className={`py-2 px-2.5 rounded-xl border text-xs font-bold transition flex items-center justify-center gap-1.5 ${
                  status === 'Failed'
                    ? 'bg-rose-500/20 border-rose-500/50 text-rose-400 shadow-sm'
                    : 'bg-[#121624] border-[#1e2538] text-slate-400 hover:text-white'
                }`}
              >
                <i className="fa-solid fa-circle-xmark"></i>
                <span>Failed</span>
              </button>

              {/* Blocked */}
              <button
                type="button"
                onClick={() => setStatus('Blocked')}
                className={`py-2 px-2.5 rounded-xl border text-xs font-bold transition flex items-center justify-center gap-1.5 ${
                  status === 'Blocked'
                    ? 'bg-amber-500/20 border-amber-500/50 text-amber-400 shadow-sm'
                    : 'bg-[#121624] border-[#1e2538] text-slate-400 hover:text-white'
                }`}
              >
                <i className="fa-solid fa-ban"></i>
                <span>Blocked</span>
              </button>
            </div>
          </div>

          {/* Description / Result Textarea */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                Description / Result{' '}
                {isDescriptionRequired ? (
                  <span className="text-rose-400 font-bold">* (Required for {status})</span>
                ) : (
                  <span className="text-slate-500 font-normal">(Optional)</span>
                )}
              </label>
            </div>
            <textarea
              rows="3"
              required={isDescriptionRequired}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={
                isFailed
                  ? 'Describe what failed (e.g. Login button returns a 500 error after entering valid credentials)...'
                  : isBlocked
                  ? 'Describe what is blocking this test (e.g. Test environment database is unreachable)...'
                  : 'Optional notes or observations...'
              }
              className={`w-full bg-[#090c14] border rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none transition ${
                isDescriptionRequired && !description.trim()
                  ? 'border-rose-500/40 focus:border-rose-500'
                  : 'border-[#1e2538] focus:border-indigo-500'
              }`}
            />
            {isDescriptionRequired && !description.trim() && (
              <p className="text-[10px] text-rose-400 mt-1">
                You must enter a description before saving a {status} test.
              </p>
            )}
          </div>

          {/* Tester info */}
          <div className="flex items-center justify-between pt-2 border-t border-[#1e2538] text-[11px] text-slate-400">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-slate-500">Tester:</span>
              <div className="flex items-center gap-1.5">
                <Avatar user={testCase.tester || currentUser} size="xs" />
                <span className="text-slate-300 font-medium">
                  {testCase.tester?.name || currentUser?.name || 'Tester'}
                </span>
              </div>
            </div>

            {/* Toggle History */}
            {(testCase.results || []).length > 0 && (
              <button
                type="button"
                onClick={() => setShowHistory(!showHistory)}
                className="text-[11px] text-indigo-400 hover:text-indigo-300 font-semibold flex items-center gap-1"
              >
                <i className="fa-solid fa-clock-rotate-left text-[10px]"></i>
                <span>{showHistory ? 'Hide History' : `History (${(testCase.results || []).length})`}</span>
              </button>
            )}
          </div>

          {/* Embedded History View */}
          {showHistory && (
            <div className="pt-2 border-t border-[#1e2538] max-h-48 overflow-y-auto pr-1">
              <span className="text-[10px] font-bold uppercase text-slate-400 block mb-2">Previous Results</span>
              <TestHistory
                results={testCase.results || []}
                testCase={testCase}
                onCreateBugFromRun={onCreateBug}
              />
            </div>
          )}

          {/* Buttons */}
          <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-[#1e2538]">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-[#121624] hover:bg-[#1a2336] text-slate-300 rounded-xl text-xs font-semibold transition border border-[#1e2538]"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || isSaveDisabled}
              className={`px-5 py-2 text-white rounded-xl text-xs font-bold transition flex items-center gap-2 shadow-lg disabled:opacity-50 disabled:cursor-not-allowed ${
                status === 'Passed'
                  ? 'bg-emerald-600 hover:bg-emerald-500 shadow-emerald-950/40'
                  : status === 'Failed'
                  ? 'bg-rose-600 hover:bg-rose-500 shadow-rose-950/40'
                  : status === 'Blocked'
                  ? 'bg-amber-600 hover:bg-amber-500 shadow-amber-950/40'
                  : 'bg-indigo-600 hover:bg-indigo-500 shadow-indigo-950/40'
              }`}
            >
              {submitting ? (
                <>
                  <i className="fa-solid fa-circle-notch fa-spin text-xs"></i>
                  <span>Saving...</span>
                </>
              ) : (
                <>
                  <i className="fa-solid fa-check text-xs"></i>
                  <span>Save Result</span>
                </>
              )}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}
