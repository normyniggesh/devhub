import { useState, useEffect } from 'react';
import Modal from '../common/Modal';
import { apiClient } from '../../api/client';

export default function BugModal({
  isOpen,
  onClose,
  projectId,
  initialData = null,
  editingBug = null,
  projectMembers = [],
  testCases = [],
  onBugSaved
}) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState('Bug');
  const [severity, setSeverity] = useState('High');
  const [status, setStatus] = useState('Open');
  const [assigneeId, setAssigneeId] = useState('');
  const [testCaseId, setTestCaseId] = useState('');
  const [testResultId, setTestResultId] = useState('');
  const [expectedResult, setExpectedResult] = useState('');
  const [actualResult, setActualResult] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (isOpen) {
      if (editingBug) {
        setTitle(editingBug.title || '');
        setDescription(editingBug.description || '');
        setType(editingBug.type || 'Bug');
        setSeverity(editingBug.severity || 'Medium');
        setStatus(editingBug.status || 'Open');
        setAssigneeId(editingBug.assigneeId || editingBug.assignee?.id || '');
        setTestCaseId(editingBug.testCaseId || '');
        setTestResultId(editingBug.testResultId || '');
        setExpectedResult(editingBug.expectedResult || '');
        setActualResult(editingBug.actualResult || '');
      } else if (initialData) {
        // Pre-filled from a failed test run
        setTitle(initialData.title || `[Bug] ${initialData.testCaseTitle || 'Test Failure'}`);
        setDescription(initialData.description || `Test failed during execution on ${new Date().toLocaleDateString()}.\n\nExpected: ${initialData.expectedResult || 'N/A'}\nActual: ${initialData.actualResult || 'N/A'}`);
        setType('Bug');
        setSeverity('High');
        setStatus('Open');
        setAssigneeId(initialData.assigneeId || '');
        setTestCaseId(initialData.testCaseId || '');
        setTestResultId(initialData.testResultId || '');
        setExpectedResult(initialData.expectedResult || '');
        setActualResult(initialData.actualResult || '');
      } else {
        // Standalone new bug
        setTitle('');
        setDescription('');
        setType('Bug');
        setSeverity('Medium');
        setStatus('Open');
        setAssigneeId('');
        setTestCaseId('');
        setTestResultId('');
        setExpectedResult('');
        setActualResult('');
      }
      setError(null);
    }
  }, [isOpen, editingBug, initialData]);

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!title.trim()) {
      setError('Bug Title is required');
      return;
    }

    try {
      setSubmitting(true);
      setError(null);

      const payload = {
        projectId,
        title: title.trim(),
        description: description.trim() || undefined,
        type,
        severity,
        status,
        assigneeId: assigneeId || null,
        testCaseId: testCaseId || null,
        testResultId: testResultId || null,
        expectedResult: expectedResult.trim() || null,
        actualResult: actualResult.trim() || null
      };

      let result;
      if (editingBug) {
        result = await apiClient(`/bugs/${editingBug.id}`, {
          method: 'PATCH',
          body: payload
        });
      } else {
        result = await apiClient('/bugs', {
          method: 'POST',
          body: payload
        });
      }

      if (onBugSaved) {
        onBugSaved(result.bug);
      }
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to save bug');
    } finally {
      setSubmitting(false);
    }
  };

  const linkedTestTitle = initialData?.testCaseTitle || testCases.find(t => t.id === testCaseId)?.title;

  return (
    <Modal open={isOpen} onClose={onClose} className="max-w-xl p-6 bg-[#0f1422] border border-[#1f2a44] rounded-2xl shadow-2xl text-slate-100">
      {/* Header */}
      <div className="flex items-center justify-between pb-3.5 border-b border-slate-700/50 mb-4">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-rose-500/10 border border-rose-500/20 flex items-center justify-center shrink-0">
            <i className="fa-solid fa-bug text-rose-400 text-xs"></i>
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-900 dark:text-white leading-tight">
              {editingBug ? 'Edit Bug / Issue' : initialData ? 'Create Bug from Failed Test' : 'Report New Bug'}
            </h3>
            {linkedTestTitle && (
              <p className="text-[11px] text-purple-400 font-medium truncate max-w-sm">
                Linked to Test: {linkedTestTitle}
              </p>
            )}
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

      <form onSubmit={handleSubmit} className="space-y-4 text-xs">
        {error && (
          <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs">
            {error}
          </div>
        )}

        {/* Linked Test Banner if pre-filled */}
        {linkedTestTitle && (
          <div className="p-3 bg-purple-500/10 border border-purple-500/20 rounded-xl flex items-center justify-between text-xs text-purple-300">
            <div className="flex items-center gap-2">
              <i className="fa-solid fa-link text-purple-400"></i>
              <span>Related Test: <strong>{linkedTestTitle}</strong></span>
            </div>
            <span className="text-[10px] font-mono uppercase bg-purple-900/40 px-2 py-0.5 rounded border border-purple-700/30">
              Linked QA item
            </span>
          </div>
        )}

        {/* Bug Title */}
        <div>
          <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
            Bug Title <span className="text-rose-400">*</span>
          </label>
          <input
            required
            type="text"
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="E.g., Login fails with valid password on Chrome"
            className="w-full bg-[#161d2f] border border-[#222e48] rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-rose-500 transition"
          />
        </div>

        {/* Expected vs Actual Result Preview if linked */}
        {(expectedResult || actualResult) && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 bg-slate-950/60 border border-slate-800/80 rounded-xl">
            <div>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Expected Result</span>
              <p className="text-[11px] text-emerald-400 bg-emerald-500/10 p-2 rounded-lg border border-emerald-500/20">
                {expectedResult || 'None'}
              </p>
            </div>
            <div>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Actual Result</span>
              <p className="text-[11px] text-rose-400 bg-rose-500/10 p-2 rounded-lg border border-rose-500/20">
                {actualResult || 'None'}
              </p>
            </div>
          </div>
        )}

        {/* Description / Steps to reproduce */}
        <div>
          <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
            Description & Steps to Reproduce
          </label>
          <textarea
            rows="3"
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="Explain what steps caused the bug..."
            className="w-full bg-[#161d2f] border border-[#222e48] rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-rose-500 transition leading-relaxed"
          />
        </div>

        {/* Priority & Status */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <div>
            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
              Severity / Priority
            </label>
            <select
              value={severity}
              onChange={e => setSeverity(e.target.value)}
              className="w-full bg-[#161d2f] border border-[#222e48] rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-rose-500 transition"
            >
              <option value="Low">Low</option>
              <option value="Medium">Medium</option>
              <option value="High">High</option>
              <option value="Critical">Critical</option>
            </select>
          </div>

          <div>
            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
              Status
            </label>
            <select
              value={status}
              onChange={e => setStatus(e.target.value)}
              className="w-full bg-[#161d2f] border border-[#222e48] rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-rose-500 transition"
            >
              <option value="Open">Open</option>
              <option value="In Progress">In Progress</option>
              <option value="Resolved">Resolved</option>
              <option value="Closed">Closed</option>
            </select>
          </div>

          <div className="col-span-2 sm:col-span-1">
            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
              Assigned To
            </label>
            <select
              value={assigneeId}
              onChange={e => setAssigneeId(e.target.value)}
              className="w-full bg-[#161d2f] border border-[#222e48] rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-rose-500 transition"
            >
              <option value="">Unassigned</option>
              {projectMembers.map(m => {
                const u = m.user || m;
                return <option key={u.id} value={u.id}>{u.name || u.email}</option>;
              })}
            </select>
          </div>
        </div>

        {/* Optional Link to Test if not pre-filled */}
        {!linkedTestTitle && testCases.length > 0 && (
          <div>
            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
              Link to Existing Test Case (Optional)
            </label>
            <select
              value={testCaseId}
              onChange={e => setTestCaseId(e.target.value)}
              className="w-full bg-[#161d2f] border border-[#222e48] rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-purple-500 transition"
            >
              <option value="">None (Standalone Bug)</option>
              {testCases.map(t => (
                <option key={t.id} value={t.id}>{t.title}</option>
              ))}
            </select>
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-[#1f2a44]">
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
            className="px-5 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-xs font-bold transition flex items-center gap-2 shadow-lg shadow-rose-900/40"
          >
            {submitting ? (
              <>
                <i className="fa-solid fa-circle-notch fa-spin text-xs"></i>
                <span>Saving...</span>
              </>
            ) : (
              <>
                <i className="fa-solid fa-bug text-xs"></i>
                <span>{editingBug ? 'Update Bug' : 'Save Bug'}</span>
              </>
            )}
          </button>
        </div>
      </form>
    </Modal>
  );
}
