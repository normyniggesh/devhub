import React, { useState } from 'react';
import Modal from '../common/Modal';
import { apiClient } from '../../api/client';

export default function ChangeRoleModal({
  open,
  onClose,
  member,
  onRoleUpdated
}) {
  const [role, setRole] = useState(member?.role || 'Member');
  const [selectedProjectId, setSelectedProjectId] = useState(
    member?.projects?.[0]?.id || ''
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  if (!open || !member) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      setLoading(true);
      setError(null);

      await apiClient(`/team/${member.id}/role`, {
        method: 'PATCH',
        body: {
          role,
          projectId: selectedProjectId || undefined
        }
      });

      onClose();
      if (onRoleUpdated) onRoleUpdated();
    } catch (err) {
      setError(err.message || 'Failed to update member role');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} className="max-w-md p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-bold text-white tracking-tight flex items-center gap-2">
          <i className="fa-solid fa-user-shield text-purple-400"></i>
          <span>Change Member Role</span>
        </h2>
        <button
          type="button"
          onClick={onClose}
          className="text-slate-400 hover:text-white"
        >
          <i className="fa-solid fa-xmark"></i>
        </button>
      </div>

      <div className="mb-4 p-3 rounded-xl bg-[#121828] border border-[#192238] flex items-center gap-3">
        <div className="w-8 h-8 rounded-full bg-purple-500/20 text-purple-300 font-bold flex items-center justify-center text-xs">
          {member.name?.[0] || 'U'}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-xs font-bold text-white truncate">{member.name}</div>
          <div className="text-[11px] text-slate-400 truncate">{member.email}</div>
        </div>
      </div>

      {error && (
        <div className="mb-4 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-medium">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        {member.projects && member.projects.length > 0 && (
          <div>
            <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
              Project Context
            </label>
            <select
              value={selectedProjectId}
              onChange={(e) => setSelectedProjectId(e.target.value)}
              className="w-full bg-[#161d2f] border border-[#1f2a44] rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:border-purple-500 transition"
            >
              {member.projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} (Current: {p.role})
                </option>
              ))}
            </select>
          </div>
        )}

        <div>
          <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
            New Role <span className="text-red-500">*</span>
          </label>
          <select
            value={role}
            onChange={(e) => setRole(e.target.value)}
            className="w-full bg-[#161d2f] border border-[#1f2a44] rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:border-purple-500 transition"
          >
            <option value="Admin">Admin (Full administrative & project privileges)</option>
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
            <span>Update Role</span>
          </button>
        </div>
      </form>
    </Modal>
  );
}
