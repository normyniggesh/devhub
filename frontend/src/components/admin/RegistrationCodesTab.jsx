import React, { useState, useEffect } from 'react';
import { apiClient } from '../../api/client';
import LoadingState from '../common/LoadingState';
import EmptyState from '../common/EmptyState';

export default function RegistrationCodesTab() {
  const [codes, setCodes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [showModal, setShowModal] = useState(false);
  const [newName, setNewName] = useState('');
  const [newCode, setNewCode] = useState('');
  const [creating, setCreating] = useState(false);

  const fetchCodes = async () => {
    try {
      setLoading(true);
      const res = await apiClient('/admin/codes');
      if (res.codes) setCodes(res.codes);
    } catch (err) {
      setError('Failed to fetch registration codes');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCodes();
  }, []);

  const handleToggle = async (id, currentStatus) => {
    try {
      const res = await apiClient(`/admin/codes/${id}`, {
        method: 'PATCH',
        body: { isActive: !currentStatus }
      });
      if (res.code) {
        setCodes(codes.map(c => c.id === id ? res.code : c));
      }
    } catch (err) {
      alert('Failed to toggle code status');
    }
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    if (newCode.length < 6) {
      return alert('Code must be at least 6 characters long');
    }
    setCreating(true);
    try {
      const res = await apiClient('/admin/codes', {
        method: 'POST',
        body: { name: newName, code: newCode }
      });
      if (res.code) {
        setCodes([res.code, ...codes]);
        setShowModal(false);
        setNewName('');
        setNewCode('');
      }
    } catch (err) {
      alert(err.message || 'Failed to create code');
    } finally {
      setCreating(false);
    }
  };

  if (loading) return <LoadingState message="Loading Registration Codes..." />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-bold text-white">Registration Access Codes</h2>
          <p className="text-xs text-slate-400">
            Manage access codes required for user registration.
          </p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-semibold transition flex items-center gap-2 shadow-sm"
        >
          <i className="fa-solid fa-plus text-xs"></i>
          <span>Create Code</span>
        </button>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/40 text-red-300 text-xs px-4 py-3 rounded-xl">
          {error}
        </div>
      )}

      {codes.length === 0 ? (
        <EmptyState icon="fa-key" title="No Access Codes" description="Create a code to allow new user registrations." />
      ) : (
        <div className="bg-[#121624] border border-[#1e2538] rounded-2xl overflow-hidden shadow-sm">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-[#0b0e18] border-b border-[#1e2538] text-slate-400 font-semibold uppercase tracking-wider text-[10px]">
                <th className="py-3 px-4">Name</th>
                <th className="py-3 px-4">Code Hint</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4">Registered Users</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#182033]">
              {codes.map(c => (
                <tr key={c.id} className="hover:bg-[#151c2e]/60 transition">
                  <td className="py-3 px-4 font-bold text-white">{c.name}</td>
                  <td className="py-3 px-4 font-mono text-slate-300">{c.hint}</td>
                  <td className="py-3 px-4">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                      c.isActive 
                        ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-400' 
                        : 'bg-rose-500/10 border border-rose-500/20 text-rose-400'
                    }`}>
                      {c.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-slate-300 font-semibold">
                    {c._count?.users || 0}
                  </td>
                  <td className="py-3 px-4 text-right">
                    <button
                      onClick={() => handleToggle(c.id, c.isActive)}
                      className="px-2.5 py-1.5 rounded-lg bg-[#192238] hover:bg-[#232f4e] text-indigo-400 hover:text-white transition text-xs font-semibold"
                    >
                      {c.isActive ? 'Deactivate' : 'Activate'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-[#121624] border border-[#1e2538] rounded-2xl p-6 w-full max-w-md shadow-2xl relative">
            <button
              onClick={() => setShowModal(false)}
              className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-lg bg-[#192238] hover:bg-[#232f4e] text-slate-400 hover:text-white transition-colors"
            >
              <i className="fa-solid fa-times"></i>
            </button>
            <h3 className="text-lg font-bold text-white mb-1">Create Access Code</h3>
            <p className="text-xs text-slate-400 mb-6">Create a new registration code to allow user signups.</p>
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">Code Name</label>
                <input
                  type="text"
                  required
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="e.g. Beta Testers"
                  className="w-full bg-[#090c14] border border-[#232a3e] rounded-xl px-4 py-2 text-sm text-white focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">Access Code</label>
                <input
                  type="text"
                  required
                  value={newCode}
                  onChange={(e) => setNewCode(e.target.value)}
                  placeholder="e.g. BETA2026"
                  className="w-full bg-[#090c14] border border-[#232a3e] rounded-xl px-4 py-2 text-sm text-white focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 font-mono"
                />
              </div>
              <div className="pt-2 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 bg-transparent hover:bg-[#192238] text-slate-300 hover:text-white rounded-xl text-xs font-semibold transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-semibold transition disabled:opacity-50"
                >
                  {creating ? 'Creating...' : 'Create Code'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
