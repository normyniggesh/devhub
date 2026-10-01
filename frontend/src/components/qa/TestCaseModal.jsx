import { useState, useEffect } from 'react';
import Modal from '../common/Modal';
import { apiClient } from '../../api/client';

export default function TestCaseModal({
  isOpen,
  onClose,
  projectId,
  editingTest = null,
  projectMembers = [],
  onTestSaved
}) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [module, setModule] = useState('');
  const [expectedResult, setExpectedResult] = useState('');
  const [priority, setPriority] = useState('Medium');
  const [status, setStatus] = useState('Not Tested');
  const [assigneeId, setAssigneeId] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (isOpen) {
      if (editingTest) {
        setTitle(editingTest.title || '');
        setDescription(editingTest.description || '');
        setModule(editingTest.module || '');
        setExpectedResult(editingTest.expectedResult || '');
        setPriority(editingTest.priority || 'Medium');
        setStatus(editingTest.status || 'Not Tested');
        setAssigneeId(editingTest.assigneeId || editingTest.assignee?.id || '');
      } else {
        setTitle('');
        setDescription('');
        setModule('');
        setExpectedResult('');
        setPriority('Medium');
        setStatus('Not Tested');
        setAssigneeId('');
      }
      setError(null);
    }
  }, [isOpen, editingTest]);

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!title.trim()) {
      setError('Test title is required');
      return;
    }

    try {
      setSubmitting(true);
      setError(null);

      const payload = {
        projectId,
        title: title.trim(),
        description: description.trim() || undefined,
        module: module.trim() || undefined,
        expectedResult: expectedResult.trim() || undefined,
        priority,
        status,
        assigneeId: assigneeId || null
      };

      let result;
      if (editingTest) {
        result = await apiClient(`/test-cases/${editingTest.id}`, {
          method: 'PATCH',
          body: payload
        });
      } else {
        result = await apiClient('/test-cases', {
          method: 'POST',
          body: payload
        });
      }

      if (onTestSaved) {
        onTestSaved(result.testCase);
      }
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to save test case');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal open={isOpen} onClose={onClose} className="max-w-lg p-6 bg-[#0f1422] border border-[#1f2a44] rounded-2xl shadow-2xl text-slate-100">
      {/* Header */}
      <div className="flex items-center justify-between pb-3.5 border-b border-slate-700/50 mb-4">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-purple-500/10 border border-purple-500/20 flex items-center justify-center shrink-0">
            <i className="fa-solid fa-vial text-purple-400 text-xs"></i>
          </div>
          <div>
            <h3 className="text-base font-bold text-white leading-tight">
              {editingTest ? 'Edit Test Case' : 'New Test Case'}
            </h3>
            <p className="text-[11px] text-slate-400">
              Define the test specification, expected result, and owner
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-800 transition"
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

        {/* Title */}
        <div>
          <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
            Test Title <span className="text-rose-400">*</span>
          </label>
          <input
            required
            type="text"
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="E.g., Login with valid email & password"
            className="w-full bg-[#161d2f] border border-[#222e48] rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-purple-500 transition"
          />
        </div>

        {/* Module */}
        <div>
          <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
            Module / Feature Area (Optional)
          </label>
          <input
            type="text"
            value={module}
            onChange={e => setModule(e.target.value)}
            placeholder="E.g., Authentication, Billing, Dashboard"
            className="w-full bg-[#161d2f] border border-[#222e48] rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-purple-500 transition"
          />
        </div>

        {/* Description */}
        <div>
          <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
            Description
          </label>
          <textarea
            rows="2"
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="Verify that users can log in with valid credentials..."
            className="w-full bg-[#161d2f] border border-[#222e48] rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-purple-500 transition leading-relaxed"
          />
        </div>

        {/* Expected Result */}
        <div>
          <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
            Expected Result
          </label>
          <textarea
            rows="2"
            value={expectedResult}
            onChange={e => setExpectedResult(e.target.value)}
            placeholder="User successfully reaches Dashboard with active session..."
            className="w-full bg-[#161d2f] border border-[#222e48] rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-purple-500 transition leading-relaxed"
          />
        </div>

        {/* Priority, Status, Assignee Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
              Priority
            </label>
            <select
              value={priority}
              onChange={e => setPriority(e.target.value)}
              className="w-full bg-[#161d2f] border border-[#222e48] rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-purple-500 transition"
            >
              <option value="Low">Low</option>
              <option value="Medium">Medium</option>
              <option value="High">High</option>
            </select>
          </div>

          <div>
            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
              Status
            </label>
            <select
              value={status}
              onChange={e => setStatus(e.target.value)}
              className="w-full bg-[#161d2f] border border-[#222e48] rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-purple-500 transition"
            >
              <option value="Not Tested">Not Tested</option>
              <option value="Passed">Passed</option>
              <option value="Failed">Failed</option>
              <option value="Blocked">Blocked</option>
            </select>
          </div>

          <div>
            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
              Assigned To
            </label>
            <select
              value={assigneeId}
              onChange={e => setAssigneeId(e.target.value)}
              className="w-full bg-[#161d2f] border border-[#222e48] rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-purple-500 transition"
            >
              <option value="">Unassigned</option>
              {projectMembers.map(m => {
                const u = m.user || m;
                return <option key={u.id} value={u.id}>{u.name || u.email}</option>;
              })}
            </select>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-[#1f2a44]">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-[#1b233a] hover:bg-[#253150] text-slate-300 rounded-xl text-xs font-semibold transition"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="px-5 py-2 bg-[#5922cf] hover:bg-[#682ae6] text-white rounded-xl text-xs font-bold transition flex items-center gap-2 shadow-lg shadow-purple-900/30"
          >
            {submitting ? (
              <>
                <i className="fa-solid fa-circle-notch fa-spin text-xs"></i>
                <span>Saving...</span>
              </>
            ) : (
              <>
                <i className="fa-solid fa-check text-xs"></i>
                <span>{editingTest ? 'Update Test' : 'Create Test'}</span>
              </>
            )}
          </button>
        </div>
      </form>
    </Modal>
  );
}
