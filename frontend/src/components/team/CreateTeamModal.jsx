import React, { useState } from 'react';
import Modal from '../common/Modal';
import { apiClient } from '../../api/client';

export default function CreateTeamModal({
  open,
  onClose,
  onTeamCreated
}) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Please provide a team name.');
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const res = await apiClient('/team/create', {
        method: 'POST',
        body: {
          name: name.trim(),
          description: description.trim() || undefined
        }
      });

      setName('');
      setDescription('');
      onClose();
      if (onTeamCreated) {
        onTeamCreated(res.team);
      }
    } catch (err) {
      setError(err.message || 'Failed to create team');
    } finally {
      setLoading(false);
    }
  };

  if (!open) return null;

  return (
    <Modal open={open} onClose={onClose} className="max-w-md p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-bold text-white tracking-tight flex items-center gap-2">
          <i className="fa-solid fa-users-rectangle text-purple-400"></i>
          <span>Create New Team</span>
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
        <div className="mb-4 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-medium flex items-start gap-2">
          <i className="fa-solid fa-triangle-exclamation text-xs mt-0.5 shrink-0"></i>
          <span>{error}</span>
        </div>
      )}

      {/* 10 GB Storage & Leader Role Info Banner */}
      <div className="mb-4 p-3 rounded-xl bg-[#161d2f] border border-[#1f2a44] text-xs text-slate-300 flex items-start gap-2.5">
        <i className="fa-solid fa-cloud-arrow-up text-purple-400 text-sm mt-0.5 shrink-0"></i>
        <div className="space-y-0.5">
          <div className="font-semibold text-white">10 GB Team Storage Included</div>
          <p className="text-[11px] text-slate-400">
            You will become the <strong className="text-purple-300">Team Leader</strong>. This team will automatically receive an isolated 10 GB DEVHUB Cloud storage pool.
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div>
          <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
            Team Name <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            required
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Core Engineering, Product Design"
            className="w-full bg-[#161d2f] border border-[#1f2a44] rounded-xl px-4 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-purple-500 transition"
          />
        </div>

        <div>
          <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
            Description <span className="text-slate-500 font-normal">(Optional)</span>
          </label>
          <textarea
            rows="3"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Briefly describe the team's mission or scope..."
            className="w-full bg-[#161d2f] border border-[#1f2a44] rounded-xl px-4 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-purple-500 transition resize-none"
          />
        </div>

        <div className="flex items-center justify-end gap-3 mt-2">
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="px-4 py-2 text-xs font-semibold text-slate-400 hover:text-white transition disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={loading || !name.trim()}
            className="flex items-center gap-2 px-5 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-bold shadow-lg shadow-purple-900/30 transition disabled:opacity-50 active:scale-95"
          >
            {loading && <i className="fa-solid fa-spinner fa-spin text-xs"></i>}
            <span>{loading ? 'Creating Team...' : 'Create Team'}</span>
          </button>
        </div>
      </form>
    </Modal>
  );
}
