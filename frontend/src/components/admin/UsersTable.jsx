import React, { useState, useMemo } from 'react';
import Avatar from '../common/Avatar';
import UserStatusBadge from '../common/UserStatusBadge';
import LastSeen from '../common/LastSeen';
import ProviderStatus from '../common/ProviderStatus';
import ConfirmDialog from '../common/ConfirmDialog';
import Modal from '../common/Modal';

export default function UsersTable({
  users = [],
  loading = false,
  onUpdateRole,
  onUpdateStatus,
  onViewProjects,
  onViewActivity
}) {
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('All');
  const [statusFilter, setStatusFilter] = useState('All');
  const [verificationFilter, setVerificationFilter] = useState('All');

  // Modal / ConfirmDialog state
  const [selectedUser, setSelectedUser] = useState(null);
  const [viewUserModal, setViewUserModal] = useState(false);
  const [roleChangeModal, setRoleChangeModal] = useState(false);
  const [newRole, setNewRole] = useState('Member');
  const [statusDialog, setStatusDialog] = useState(false);
  const [pendingStatus, setPendingStatus] = useState('Active');
  const [actionLoading, setActionLoading] = useState(false);

  // Filtered users
  const filteredUsers = useMemo(() => {
    return users.filter((u) => {
      const matchesSearch =
        search.trim() === '' ||
        u.name?.toLowerCase().includes(search.toLowerCase()) ||
        u.email?.toLowerCase().includes(search.toLowerCase());

      const matchesRole = roleFilter === 'All' || u.role === roleFilter;
      const matchesStatus = statusFilter === 'All' || (u.status || 'Active') === statusFilter;
      const matchesVerification =
        verificationFilter === 'All' ||
        (verificationFilter === 'Verified' ? Boolean(u.emailVerified) : !u.emailVerified);

      return matchesSearch && matchesRole && matchesStatus && matchesVerification;
    });
  }, [users, search, roleFilter, statusFilter, verificationFilter]);

  const handleOpenRoleModal = (u) => {
    setSelectedUser(u);
    setNewRole(u.role || 'Member');
    setRoleChangeModal(true);
  };

  const handleConfirmRoleChange = async () => {
    if (!selectedUser || !onUpdateRole) return;
    setActionLoading(true);
    try {
      await onUpdateRole(selectedUser.id, newRole);
      setRoleChangeModal(false);
    } catch (err) {
      alert(err.message || 'Failed to update user role');
    } finally {
      setActionLoading(false);
    }
  };

  const handleOpenStatusDialog = (u) => {
    setSelectedUser(u);
    const targetStatus = (u.status || 'Active') === 'Active' ? 'Deactivated' : 'Active';
    setPendingStatus(targetStatus);
    setStatusDialog(true);
  };

  const handleConfirmStatusChange = async () => {
    if (!selectedUser || !onUpdateStatus) return;
    setActionLoading(true);
    try {
      await onUpdateStatus(selectedUser.id, pendingStatus);
      setStatusDialog(false);
    } catch (err) {
      alert(err.message || 'Failed to update user account status');
    } finally {
      setActionLoading(false);
    }
  };

  const handleViewUser = (u) => {
    setSelectedUser(u);
    setViewUserModal(true);
  };

  return (
    <div className="bg-[#121624] border border-[#1e2538] rounded-2xl overflow-hidden shadow-sm">
      {/* Table Header Controls */}
      <div className="p-4 sm:p-5 border-b border-[#1e2538] flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
        {/* Search */}
        <div className="relative flex-1 max-w-md">
          <i className="fa-solid fa-magnifying-glass absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500 text-xs"></i>
          <input
            type="text"
            placeholder="Search users by name or email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-[#090c14] border border-[#232d47] rounded-xl pl-9 pr-4 py-2 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-indigo-500 transition"
          />
        </div>

        {/* Filters */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Role Filter */}
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            className="bg-[#090c14] border border-[#232d47] rounded-xl px-3 py-2 text-xs text-slate-300 focus:outline-none focus:border-indigo-500"
          >
            <option value="All">All Roles</option>
            <option value="Admin">Admin</option>
            <option value="Member">Member</option>
            <option value="Viewer">Viewer</option>
          </select>

          {/* Verification Filter */}
          <select
            value={verificationFilter}
            onChange={(e) => setVerificationFilter(e.target.value)}
            className="bg-[#090c14] border border-[#232d47] rounded-xl px-3 py-2 text-xs text-slate-300 focus:outline-none focus:border-indigo-500"
          >
            <option value="All">All Verification</option>
            <option value="Verified">Verified Only</option>
            <option value="Unverified">Unverified Only</option>
          </select>

          {/* Status Filter */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="bg-[#090c14] border border-[#232d47] rounded-xl px-3 py-2 text-xs text-slate-300 focus:outline-none focus:border-indigo-500"
          >
            <option value="All">All Statuses</option>
            <option value="Active">Active</option>
            <option value="Deactivated">Deactivated</option>
          </select>
        </div>
      </div>

      {/* Table Content */}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="bg-[#0b0e18] border-b border-[#1e2538] text-slate-400 font-semibold uppercase tracking-wider text-[10px]">
              <th className="py-3 px-4">User</th>
              <th className="py-3 px-4">Role</th>
              <th className="py-3 px-4">Account Status</th>
              <th className="py-3 px-4">Email Verified</th>
              <th className="py-3 px-4">Last Active</th>
              <th className="py-3 px-4">Connected Providers</th>
              <th className="py-3 px-4">Joined</th>
              <th className="py-3 px-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#182033]">
            {loading ? (
              <tr>
                <td colSpan={8} className="py-12 text-center text-slate-400">
                  <i className="fa-solid fa-circle-notch fa-spin text-indigo-400 text-lg mb-2 block"></i>
                  Loading users...
                </td>
              </tr>
            ) : filteredUsers.length === 0 ? (
              <tr>
                <td colSpan={8} className="py-10 text-center text-slate-500">
                  No users match the selected filters.
                </td>
              </tr>
            ) : (
              filteredUsers.map((u) => {
                const isDeactivated = u.status === 'Deactivated';
                return (
                  <tr
                    key={u.id}
                    className={`hover:bg-[#151c2e]/60 transition ${
                      isDeactivated ? 'opacity-70 bg-rose-950/10' : ''
                    }`}
                  >
                    {/* User info */}
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2.5">
                        <Avatar user={u} size="sm" />
                        <div className="min-w-0">
                          <p className="font-bold text-white text-xs truncate max-w-[140px] sm:max-w-[180px]">
                            {u.name}
                          </p>
                          <p className="text-[11px] text-slate-400 truncate max-w-[140px] sm:max-w-[180px]">
                            {u.email}
                          </p>
                        </div>
                      </div>
                    </td>

                    {/* Role */}
                    <td className="py-3 px-4">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold ${
                          u.role === 'Admin'
                            ? 'bg-purple-500/10 text-purple-400 border border-purple-500/25'
                            : u.role === 'Member'
                            ? 'bg-blue-500/10 text-blue-400 border border-blue-500/25'
                            : 'bg-slate-700/30 text-slate-400 border border-slate-700/50'
                        }`}
                      >
                        {u.role}
                      </span>
                    </td>

                    {/* Status */}
                    <td className="py-3 px-4">
                      <UserStatusBadge type="status" value={u.status} />
                    </td>

                    {/* Verification */}
                    <td className="py-3 px-4">
                      <UserStatusBadge type="verification" verified={u.emailVerified} />
                    </td>

                    {/* Last active */}
                    <td className="py-3 px-4">
                      <LastSeen lastSeen={u.lastSeen} />
                    </td>

                    {/* Connected Providers */}
                    <td className="py-3 px-4">
                      <ProviderStatus integrations={u.integrations || []} compact={true} />
                    </td>

                    {/* Created Date */}
                    <td className="py-3 px-4 text-slate-400 whitespace-nowrap">
                      {new Date(u.createdAt).toLocaleDateString(undefined, {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric'
                      })}
                    </td>

                    {/* Actions */}
                    <td className="py-3 px-4 text-right whitespace-nowrap">
                      <div className="flex items-center justify-end gap-1.5">
                        {/* View Details */}
                        <button
                          title="View user details"
                          onClick={() => handleViewUser(u)}
                          className="w-7 h-7 rounded-lg bg-[#192238] hover:bg-[#232f4e] text-slate-300 hover:text-white transition flex items-center justify-center text-xs"
                        >
                          <i className="fa-solid fa-eye"></i>
                        </button>

                        {/* Change Role */}
                        <button
                          title="Change user role"
                          onClick={() => handleOpenRoleModal(u)}
                          className="w-7 h-7 rounded-lg bg-[#192238] hover:bg-[#232f4e] text-indigo-400 hover:text-indigo-300 transition flex items-center justify-center text-xs"
                        >
                          <i className="fa-solid fa-user-shield"></i>
                        </button>

                        {/* Activate / Deactivate */}
                        <button
                          title={isDeactivated ? 'Reactivate account' : 'Deactivate account'}
                          onClick={() => handleOpenStatusDialog(u)}
                          className={`w-7 h-7 rounded-lg transition flex items-center justify-center text-xs ${
                            isDeactivated
                              ? 'bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400'
                              : 'bg-rose-500/10 hover:bg-rose-500/20 text-rose-400'
                          }`}
                        >
                          <i className={`fa-solid ${isDeactivated ? 'fa-user-check' : 'fa-user-slash'}`}></i>
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Role Change Modal */}
      <Modal open={roleChangeModal} onClose={() => setRoleChangeModal(false)} className="max-w-sm p-6">
        <div>
          <h3 className="text-base font-bold text-white mb-2">Change User Role</h3>
          <p className="text-xs text-slate-400 mb-4">
            Select the new permission level for <span className="font-semibold text-white">{selectedUser?.name}</span>.
          </p>

          <div className="space-y-2 mb-6">
            {['Admin', 'Member', 'Viewer'].map((r) => (
              <label
                key={r}
                className={`flex items-center justify-between p-3 rounded-xl border cursor-pointer transition ${
                  newRole === r
                    ? 'bg-indigo-600/15 border-indigo-500 text-white'
                    : 'bg-[#090c14] border-[#1e2538] text-slate-300 hover:border-slate-700'
                }`}
              >
                <div className="flex items-center gap-3">
                  <input
                    type="radio"
                    name="userRole"
                    value={r}
                    checked={newRole === r}
                    onChange={(e) => setNewRole(e.target.value)}
                    className="text-indigo-600 focus:ring-0"
                  />
                  <div>
                    <p className="text-xs font-bold">{r}</p>
                    <p className="text-[10px] text-slate-500">
                      {r === 'Admin'
                        ? 'Full platform management and settings'
                        : r === 'Member'
                        ? 'Standard project collaboration'
                        : 'Read-only access to assigned projects'}
                    </p>
                  </div>
                </div>
              </label>
            ))}
          </div>

          <div className="flex justify-end gap-2">
            <button
              type="button"
              disabled={actionLoading}
              onClick={() => setRoleChangeModal(false)}
              className="px-4 py-2 text-xs font-semibold text-slate-400 hover:text-white rounded-lg transition"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={actionLoading}
              onClick={handleConfirmRoleChange}
              className="px-4 py-2 text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition flex items-center gap-1.5"
            >
              {actionLoading && <i className="fa-solid fa-circle-notch fa-spin"></i>}
              <span>Save Role</span>
            </button>
          </div>
        </div>
      </Modal>

      {/* Account Status Confirm Dialog */}
      <ConfirmDialog
        open={statusDialog}
        onClose={() => setStatusDialog(false)}
        onConfirm={handleConfirmStatusChange}
        title={pendingStatus === 'Deactivated' ? 'Deactivate User Account?' : 'Reactivate User Account?'}
        message={
          pendingStatus === 'Deactivated'
            ? `Are you sure you want to deactivate ${selectedUser?.name}? They will be logged out and cannot sign in until reactivated.`
            : `Are you sure you want to reactivate ${selectedUser?.name}? They will regain access to their account and workspace.`
        }
        confirmText={pendingStatus === 'Deactivated' ? 'Deactivate User' : 'Reactivate User'}
        danger={pendingStatus === 'Deactivated'}
        loading={actionLoading}
      />

      {/* User Detail Modal */}
      <Modal open={viewUserModal} onClose={() => setViewUserModal(false)} className="max-w-md p-6">
        {selectedUser && (
          <div>
            <div className="flex items-center gap-3 mb-5">
              <Avatar user={selectedUser} size="md" />
              <div>
                <h3 className="text-base font-bold text-white">{selectedUser.name}</h3>
                <p className="text-xs text-slate-400">{selectedUser.email}</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 mb-5 bg-[#090c14] border border-[#1e2538] rounded-xl p-3 text-xs">
              <div>
                <span className="text-[10px] text-slate-500 uppercase tracking-wider block mb-0.5">Role</span>
                <span className="font-semibold text-white">{selectedUser.role}</span>
              </div>
              <div>
                <span className="text-[10px] text-slate-500 uppercase tracking-wider block mb-0.5">Account Status</span>
                <UserStatusBadge type="status" value={selectedUser.status} />
              </div>
              <div>
                <span className="text-[10px] text-slate-500 uppercase tracking-wider block mb-0.5">Email Verification</span>
                <UserStatusBadge type="verification" verified={selectedUser.emailVerified} />
              </div>
              <div>
                <span className="text-[10px] text-slate-500 uppercase tracking-wider block mb-0.5">Last Active</span>
                <LastSeen lastSeen={selectedUser.lastSeen} />
              </div>
              <div className="col-span-2">
                <span className="text-[10px] text-slate-500 uppercase tracking-wider block mb-0.5">Joined Date</span>
                <span className="font-semibold text-slate-300">
                  {new Date(selectedUser.createdAt).toLocaleString()}
                </span>
              </div>
            </div>

            <div className="mb-6">
              <span className="text-xs font-bold text-slate-300 block mb-2">Connected Providers</span>
              <ProviderStatus integrations={selectedUser.integrations || []} />
            </div>

            <div className="flex justify-between items-center pt-3 border-t border-[#1e2538]">
              <div className="flex gap-2">
                {onViewProjects && (
                  <button
                    type="button"
                    onClick={() => {
                      setViewUserModal(false);
                      onViewProjects(selectedUser);
                    }}
                    className="text-xs text-indigo-400 hover:text-indigo-300 font-semibold"
                  >
                    View Projects
                  </button>
                )}
                {onViewActivity && (
                  <button
                    type="button"
                    onClick={() => {
                      setViewUserModal(false);
                      onViewActivity(selectedUser);
                    }}
                    className="text-xs text-indigo-400 hover:text-indigo-300 font-semibold ml-3"
                  >
                    View Activity
                  </button>
                )}
              </div>
              <button
                type="button"
                onClick={() => setViewUserModal(false)}
                className="px-3.5 py-1.5 bg-[#192238] hover:bg-[#232f4e] text-white text-xs font-semibold rounded-lg transition"
              >
                Close
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
