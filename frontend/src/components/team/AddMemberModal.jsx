import React, { useState } from 'react';
import Modal from '../common/Modal';
import { apiClient } from '../../api/client';

export default function AddMemberModal({
  open,
  onClose,
  projects = [],
  onMemberAdded
}) {
  const [email, setEmail] = useState('');
  const [projectId, setProjectId] = useState(projects[0]?.id || '');
  const [role, setRole] = useState('Member');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email.trim()) {
      setError('Please provide a valid user email.');
      return;
    }
    if (!projectId) {
      setError('Please select a project to assign this member to.');
      return;
    }

    try {
      setLoading(true);
      setError(null);
      await apiClient('/team/add', {
        method: 'POST',
        body: {
          email: email.trim(),
          projectId,
          role
        }
      });

      setEmail('');
      onClose();
      if (onMemberAdded) onMemberAdded();
    } catch (err) {
      setError(err.message || 'Failed to add team member');
    } finally {
      setLoading(false);
    }
  };

  if (!open) return null;

  return (
    <Modal open={open} onClose={onClose} className="max-w-md p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-bold text-white tracking-tight flex items-center gap-2">
          <i className="fa-solid fa-user-plus text-purple-400"></i>
          <span>Add Team Member</span>
        </h2>
        <button
          type="button"
          onClick={onClose}
          className="text-slate-400 hover:text-white"
        >
          <i className="fa-solid fa-xmark"></i>
        </button>
      </div>

      {error && (
        <div className="mb-4 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-medium">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div>
          <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
            Member Email <span className="text-red-500">*</span>
          </label>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="colleague@example.com"
            className="w-full bg-[#161d2f] border border-[#1f2a44] rounded-xl px-4 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-purple-500 transition"
          />
        </div>

        <div>
          <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
            Assign to Project <span className="text-red-500">*</span>
          </label>
          <select
            required
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
            className="w-full bg-[#161d2f] border border-[#1f2a44] rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:border-purple-500 transition"
          >
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
            Project Role <span className="text-red-500">*</span>
          </label>
          <select
            value={role}
            onChange={(e) => setRole(e.target.value)}
            className="w-full bg-[#161d2f] border border-[#1f2a44] rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:border-purple-500 transition"
          >
            <option value="Admin">Admin (Full access & member management)</option>
            <option value="Editor">Editor (Create, edit tasks and files)</option>
            <option value="Member">Member (Standard team collaborator)</option>
            <option value="Viewer">Viewer (Read-only access)</option>
          </select>
        </div>

        <div className="flex items-center justify-end gap-3 mt-3 pt-4 border-t border-[#192238]">
          <button
            type="button"
            disabled={loading}
            onClick={onClose}
            className="px-4 py-2 text-slate-300 text-xs font-bold hover:text-white hover:bg-[#1a2333] rounded-lg transition disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={loading}
            className="px-5 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-xs font-bold shadow-lg shadow-purple-900/30 transition disabled:opacity-50 flex items-center gap-2"
          >
            {loading && <i className="fa-solid fa-circle-notch fa-spin"></i>}
            <span>Add Member</span>
          </button>
        </div>
      </form>
    </Modal>
  );
}
