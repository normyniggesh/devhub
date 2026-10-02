import React, { useState, useEffect } from 'react';
import Modal from '../common/Modal';
import Avatar from '../common/Avatar';
import { apiClient } from '../../api/client';

export default function MemberDetailsModal({
  open,
  onClose,
  member,
  onChangeRole
}) {
  const [details, setDetails] = useState(null);
  const [recentActivity, setRecentActivity] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (open && member?.id) {
      setLoading(true);
      setError(null);
      apiClient(`/team/${member.id}`)
        .then((res) => {
          setDetails(res.member || null);
          setRecentActivity(res.recentActivity || []);
        })
        .catch((err) => {
          setError(err.message || 'Failed to load member details');
        })
        .finally(() => {
          setLoading(false);
        });
    } else {
      setDetails(null);
      setRecentActivity([]);
    }
  }, [open, member?.id]);

  if (!open) return null;

  const currentData = details || member || {};
  const integrations = currentData.integrations || [];
  const githubInt = integrations.find((i) => i.provider === 'github' && i.status === 'connected');
  const gdriveInt = integrations.find((i) => i.provider === 'google_drive' && i.status === 'connected');
  const dropboxInt = integrations.find((i) => i.provider === 'dropbox' && i.status === 'connected');
  const onedriveInt = integrations.find((i) => i.provider === 'onedrive' && i.status === 'connected');

  return (
    <Modal open={open} onClose={onClose} className="max-w-2xl p-0 overflow-hidden">
      {/* Modal Header */}
      <div className="bg-[#121828] border-b border-[#192238] p-6 relative">
        <button
          type="button"
          onClick={onClose}
          className="absolute top-5 right-5 w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-white hover:bg-[#1f2a44] transition"
        >
          <i className="fa-solid fa-xmark"></i>
        </button>

        <div className="flex items-start gap-4">
          <Avatar user={currentData} size="lg" className="shrink-0 ring-4 ring-purple-500/20" />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2.5 flex-wrap mb-1">
              <h2 className="text-xl font-bold text-white tracking-tight">
                {currentData.name}
              </h2>
              <span className="text-[11px] font-bold px-2 py-0.5 rounded-md bg-purple-500/10 border border-purple-500/20 text-purple-400">
                {currentData.role || 'Member'}
              </span>
              <span className="text-[11px] font-medium text-emerald-400 flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                {currentData.status || 'Active'}
              </span>
            </div>
            <p className="text-xs font-mono text-slate-400 truncate">
              {currentData.email}
            </p>
          </div>
        </div>
      </div>

      {/* Body Content */}
      <div className="p-6 max-h-[70vh] overflow-y-auto divide-y divide-[#192238]/60 flex flex-col gap-5">
        {loading ? (
          <div className="py-12 flex justify-center items-center">
            <i className="fa-solid fa-circle-notch fa-spin text-2xl text-purple-500"></i>
          </div>
        ) : error ? (
          <div className="p-4 text-center text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl text-xs">
            {error}
          </div>
        ) : (
          <>
            {/* Overview Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <div className="bg-[#121828] border border-[#192238] p-3 rounded-xl">
                <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                  Last Active
                </div>
                <div className="text-xs font-bold text-white">
                  {currentData.lastSeen
                    ? new Date(currentData.lastSeen).toLocaleString(undefined, {
                        dateStyle: 'medium',
                        timeStyle: 'short'
                      })
                    : 'Never recorded'}
                </div>
              </div>

              <div className="bg-[#121828] border border-[#192238] p-3 rounded-xl">
                <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                  Joined DevHub
                </div>
                <div className="text-xs font-bold text-white">
                  {currentData.createdAt
                    ? new Date(currentData.createdAt).toLocaleDateString(undefined, {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric'
                      })
                    : 'N/A'}
                </div>
              </div>

              <div className="bg-[#121828] border border-[#192238] p-3 rounded-xl col-span-2 sm:col-span-1">
                <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                  Email Verified
                </div>
                <div className="text-xs font-bold flex items-center gap-1.5 text-white">
                  {currentData.emailVerified ? (
                    <>
                      <i className="fa-solid fa-circle-check text-emerald-400 text-xs"></i>
                      <span>Verified</span>
                    </>
                  ) : (
                    <>
                      <i className="fa-solid fa-circle-xmark text-amber-400 text-xs"></i>
                      <span>Unverified</span>
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Shared Projects Section */}
            <div className="pt-4">
              <h3 className="text-xs font-bold text-white uppercase tracking-wider mb-3 flex items-center gap-2">
                <i className="fa-solid fa-folder-tree text-purple-400"></i>
                Shared Projects ({(currentData.sharedProjects || currentData.projects || []).length})
              </h3>
              {(currentData.sharedProjects || currentData.projects || []).length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {(currentData.sharedProjects || currentData.projects || []).map((p) => (
                    <div
                      key={p.id}
                      className="bg-[#121828] border border-[#192238] hover:border-[#283552] p-3 rounded-xl flex items-center justify-between transition"
                    >
                      <div className="min-w-0 flex-1 pr-2">
                        <div className="font-bold text-xs text-white truncate">
                          {p.name}
                        </div>
                        {p.description && (
                          <div className="text-[11px] text-slate-400 truncate mt-0.5">
                            {p.description}
                          </div>
                        )}
                      </div>
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-purple-500/10 text-purple-300 border border-purple-500/20 shrink-0">
                        {p.role || 'Member'}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-slate-500 italic">No shared projects yet.</p>
              )}
            </div>

            {/* Connected Services (Zero Secrets) */}
            <div className="pt-4">
              <h3 className="text-xs font-bold text-white uppercase tracking-wider mb-3 flex items-center gap-2">
                <i className="fa-solid fa-plug text-purple-400"></i>
                Connected Services
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                {/* GitHub */}
                <div className="bg-[#121828] border border-[#192238] p-3 rounded-xl flex flex-col justify-between">
                  <div className="flex items-center justify-between mb-2">
                    <i className="fa-brands fa-github text-lg text-white"></i>
                    <span
                      className={`text-[9px] font-bold px-1.5 py-0.2 rounded uppercase ${
                        githubInt
                          ? 'bg-emerald-500/10 text-emerald-400'
                          : 'bg-slate-800 text-slate-500'
                      }`}
                    >
                      {githubInt ? 'Active' : 'Off'}
                    </span>
                  </div>
                  <div className="text-xs font-bold text-white">GitHub</div>
                  <div className="text-[10px] text-slate-400 truncate">
                    {githubInt?.accountName || 'Not Connected'}
                  </div>
                </div>

                {/* Google Drive */}
                <div className="bg-[#121828] border border-[#192238] p-3 rounded-xl flex flex-col justify-between">
                  <div className="flex items-center justify-between mb-2">
                    <i className="fa-brands fa-google-drive text-lg text-amber-400"></i>
                    <span
                      className={`text-[9px] font-bold px-1.5 py-0.2 rounded uppercase ${
                        gdriveInt
                          ? 'bg-emerald-500/10 text-emerald-400'
                          : 'bg-slate-800 text-slate-500'
                      }`}
                    >
                      {gdriveInt ? 'Active' : 'Off'}
                    </span>
                  </div>
                  <div className="text-xs font-bold text-white">Google Drive</div>
                  <div className="text-[10px] text-slate-400 truncate">
                    {gdriveInt?.accountName || 'Not Connected'}
                  </div>
                </div>

                {/* Dropbox */}
                <div className="bg-[#121828] border border-[#192238] p-3 rounded-xl flex flex-col justify-between">
                  <div className="flex items-center justify-between mb-2">
                    <i className="fa-brands fa-dropbox text-lg text-blue-400"></i>
                    <span
                      className={`text-[9px] font-bold px-1.5 py-0.2 rounded uppercase ${
                        dropboxInt
                          ? 'bg-emerald-500/10 text-emerald-400'
                          : 'bg-slate-800 text-slate-500'
                      }`}
                    >
                      {dropboxInt ? 'Active' : 'Off'}
                    </span>
                  </div>
                  <div className="text-xs font-bold text-white">Dropbox</div>
                  <div className="text-[10px] text-slate-400 truncate">
                    {dropboxInt?.accountName || 'Not Connected'}
                  </div>
                </div>

                {/* OneDrive */}
                <div className="bg-[#121828] border border-[#192238] p-3 rounded-xl flex flex-col justify-between">
                  <div className="flex items-center justify-between mb-2">
                    <i className="fa-brands fa-microsoft text-lg text-sky-400"></i>
                    <span
                      className={`text-[9px] font-bold px-1.5 py-0.2 rounded uppercase ${
                        onedriveInt
                          ? 'bg-emerald-500/10 text-emerald-400'
                          : 'bg-slate-800 text-slate-500'
                      }`}
                    >
                      {onedriveInt ? 'Active' : 'Off'}
                    </span>
                  </div>
                  <div className="text-xs font-bold text-white">OneDrive</div>
                  <div className="text-[10px] text-slate-400 truncate">
                    {onedriveInt?.accountName || 'Not Connected'}
                  </div>
                </div>
              </div>
            </div>

            {/* Major Recent Activity */}
            <div className="pt-4">
              <h3 className="text-xs font-bold text-white uppercase tracking-wider mb-3 flex items-center gap-2">
                <i className="fa-regular fa-clock text-purple-400"></i>
                Major Recent Activity
              </h3>
              {recentActivity.length > 0 ? (
                <div className="flex flex-col gap-2">
                  {recentActivity.map((act) => (
                    <div
                      key={act.id}
                      className="bg-[#121828] border border-[#192238] p-2.5 rounded-xl flex items-center justify-between text-xs"
                    >
                      <div className="flex items-center gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-purple-400"></span>
                        <span className="text-slate-300 font-medium">
                          {act.action} {act.entityType}
                        </span>
                        {act.metadata?.name && (
                          <span className="text-white font-semibold truncate max-w-[200px]">
                            "{act.metadata.name}"
                          </span>
                        )}
                      </div>
                      <span className="text-[11px] text-slate-500 shrink-0">
                        {new Date(act.createdAt).toLocaleDateString(undefined, {
                          month: 'short',
                          day: 'numeric'
                        })}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-slate-500 italic">No recent activity logged for this member.</p>
              )}
            </div>
          </>
        )}
      </div>

      {/* Modal Footer */}
      <div className="bg-[#121828] border-t border-[#192238] p-4 flex items-center justify-between">
        <span className="text-xs text-slate-500">
          User ID: <span className="font-mono">{member?.id?.slice(0, 8)}...</span>
        </span>
        <div className="flex items-center gap-2.5">
          {onChangeRole && (
            <button
              type="button"
              onClick={() => {
                onClose();
                onChangeRole(member);
              }}
              className="px-3.5 py-1.5 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-xs font-bold transition flex items-center gap-1.5"
            >
              <i className="fa-solid fa-user-shield text-xs"></i>
              <span>Change Role</span>
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 bg-[#192238] hover:bg-[#202b47] text-slate-300 hover:text-white rounded-lg text-xs font-bold transition"
          >
            Close
          </button>
        </div>
      </div>
    </Modal>
  );
}
