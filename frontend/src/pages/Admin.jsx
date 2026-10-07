import React, { useState, useEffect, useCallback } from 'react';
import { useStore } from '../store';
import { apiClient } from '../api/client';
import AdminStatCard from '../components/common/AdminStatCard';
import UsersTable from '../components/admin/UsersTable';
import ProviderStatus from '../components/common/ProviderStatus';
import ActivityFeed from '../components/activity/ActivityFeed';
import LoadingState from '../components/common/LoadingState';
import EmptyState from '../components/common/EmptyState';
import ConfirmDialog from '../components/common/ConfirmDialog';
import Modal from '../components/common/Modal';
import Avatar from '../components/common/Avatar';
import { formatSize } from '../utils/formatting';

export default function Admin() {
  const { currentUser } = useStore();
  const [activeTab, setActiveTab] = useState('overview'); // 'overview' | 'users' | 'projects' | 'integrations' | 'activity'
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Admin Data states
  const [stats, setStats] = useState({
    totalUsers: 0,
    verifiedUsers: 0,
    unverifiedUsers: 0,
    activeRecently: 0,
    currentlyActive: 0,
    totalProjects: 0,
    totalTasks: 0,
    connectedCloud: 0,
    connectedGithub: 0
  });
  const [users, setUsers] = useState([]);
  const [teams, setTeams] = useState([]);
  const [projects, setProjects] = useState([]);
  const [cloudConnections, setCloudConnections] = useState([]);
  const [activity, setActivity] = useState([]);

  // Project member management modal states
  const [selectedProject, setSelectedProject] = useState(null);
  const [manageMembersModal, setManageMembersModal] = useState(false);
  const [addMemberUserId, setAddMemberUserId] = useState('');
  const [addMemberRole, setAddMemberRole] = useState('Member');
  const [memberActionLoading, setMemberActionLoading] = useState(false);
  const [removeMemberDialog, setRemoveMemberDialog] = useState(false);
  const [memberToRemove, setMemberToRemove] = useState(null);

  // Storage Quota states (User & Team Foundation)
  const [storageData, setStorageData] = useState({ personalAllocations: [], teamAllocations: [], poolStatus: null });
  const [storageLoading, setStorageLoading] = useState(false);
  const [quotaModalOpen, setQuotaModalOpen] = useState(false);
  const [quotaForm, setQuotaForm] = useState({ type: 'user', targetId: '', targetName: '', allocatedGB: 5, currentUsedGB: 0 });
  const [quotaError, setQuotaError] = useState('');
  const [quotaSubmitting, setQuotaSubmitting] = useState(false);

  // Fetch all admin data
  const loadAdminData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [ovRes, usRes, prRes, ccRes, acRes, tmRes] = await Promise.all([
        apiClient('/admin/overview').catch(() => ({ stats: {} })),
        apiClient('/admin/users').catch(() => ({ users: [] })),
        apiClient('/admin/projects').catch(() => ({ projects: [] })),
        apiClient('/admin/cloud-connections').catch(() => ({ connections: [] })),
        apiClient('/admin/activity').catch(() => ({ activity: [] })),
        apiClient('/admin/teams').catch(() => ({ teams: [] }))
      ]);

      if (ovRes.stats) setStats(ovRes.stats);
      if (usRes.users) setUsers(usRes.users);
      if (prRes.projects) setProjects(prRes.projects);
      if (ccRes.connections) setCloudConnections(ccRes.connections);
      if (acRes.activity) setActivity(acRes.activity);
      if (tmRes.teams) setTeams(tmRes.teams);
    } catch (err) {
      console.error('Failed to load admin data:', err);
      setError(err.message || 'Failed to load administration data');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadStorageQuotas = useCallback(async () => {
    try {
      setStorageLoading(true);
      const res = await apiClient('/admin/quotas');
      setStorageData({
        personalAllocations: res.personalAllocations || [],
        teamAllocations: res.teamAllocations || [],
        poolStatus: res.poolStatus || null
      });
    } catch (err) {
      console.error('Failed to load storage quotas:', err);
    } finally {
      setStorageLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAdminData();
    loadStorageQuotas();
  }, [loadAdminData, loadStorageQuotas]);

  // User Actions
  const handleUpdateRole = async (userId, newRole) => {
    const res = await apiClient(`/admin/users/${userId}/role`, {
      method: 'PATCH',
      body: { role: newRole }
    });
    setUsers((prev) =>
      prev.map((u) => (u.id === userId ? { ...u, role: newRole } : u))
    );
    // Reload activity
    apiClient('/admin/activity').then((r) => r.activity && setActivity(r.activity));
    return res;
  };

  const handleUpdateStatus = async (userId, newStatus) => {
    const res = await apiClient(`/admin/users/${userId}/status`, {
      method: 'PATCH',
      body: { status: newStatus }
    });
    setUsers((prev) =>
      prev.map((u) => (u.id === userId ? { ...u, status: newStatus } : u))
    );
    // Reload activity & overview
    apiClient('/admin/activity').then((r) => r.activity && setActivity(r.activity));
    return res;
  };

  const handleOpenSetQuota = (target = null, type = 'user') => {
    setQuotaError('');
    if (target) {
      if (type === 'user') {
        const allocGB = target.storage?.allocatedGB ?? (target.allocatedBytes ? Number(BigInt(target.allocatedBytes) / (1024n * 1024n * 1024n)) : 5);
        const usedGB = target.storage?.usedGB ?? (target.usedBytes ? Number((Number(BigInt(target.usedBytes)) / (1024 * 1024 * 1024)).toFixed(3)) : 0);
        setQuotaForm({
          type: 'user',
          targetId: target.id || target.userId,
          targetName: target.name || target.email || target.user?.name || target.user?.email || 'User',
          allocatedGB: Number(allocGB) || 5,
          currentUsedGB: Number(usedGB) || 0
        });
      } else {
        const allocGB = target.storage?.allocatedGB ?? (target.allocatedBytes ? Number(BigInt(target.allocatedBytes) / (1024n * 1024n * 1024n)) : 10);
        const usedGB = target.storage?.usedGB ?? (target.usedBytes ? Number((Number(BigInt(target.usedBytes)) / (1024 * 1024 * 1024)).toFixed(3)) : 0);
        setQuotaForm({
          type: 'team',
          targetId: target.id || target.teamId,
          targetName: target.name || target.team?.name || 'Team',
          allocatedGB: Number(allocGB) || 10,
          currentUsedGB: Number(usedGB) || 0
        });
      }
    } else {
      if (type === 'team') {
        const firstTeam = teams[0];
        setQuotaForm({
          type: 'team',
          targetId: firstTeam?.id || '',
          targetName: firstTeam?.name || 'Team',
          allocatedGB: firstTeam?.storage?.allocatedGB || 10,
          currentUsedGB: Number(firstTeam?.storage?.usedGB || 0)
        });
      } else {
        const firstUser = users[0];
        setQuotaForm({
          type: 'user',
          targetId: firstUser?.id || '',
          targetName: firstUser?.name || firstUser?.email || 'User',
          allocatedGB: firstUser?.storage?.allocatedGB || 5,
          currentUsedGB: Number(firstUser?.storage?.usedGB || 0)
        });
      }
    }
    setQuotaModalOpen(true);
  };

  const handleSaveQuota = async (e) => {
    e.preventDefault();
    if (!quotaForm.targetId) return;

    const newAllocGB = Number(quotaForm.allocatedGB);
    const curUsedGB = Number(quotaForm.currentUsedGB || 0);

    if (isNaN(newAllocGB) || newAllocGB <= 0) {
      setQuotaError('Allocated storage must be a positive number.');
      return;
    }

    if (newAllocGB < curUsedGB) {
      setQuotaError(`Allocation cannot be lower than current usage (${curUsedGB} GB).`);
      return;
    }

    try {
      setQuotaSubmitting(true);
      setQuotaError('');
      if (quotaForm.type === 'team') {
        await apiClient('/admin/quotas/team', {
          method: 'POST',
          body: {
            teamId: quotaForm.targetId,
            allocatedGB: newAllocGB
          }
        });
      } else {
        await apiClient('/admin/quotas/user', {
          method: 'POST',
          body: {
            userId: quotaForm.targetId,
            allocatedGB: newAllocGB
          }
        });
      }
      await Promise.all([loadStorageQuotas(), loadAdminData()]);
      setQuotaModalOpen(false);
    } catch (err) {
      setQuotaError(err.message || 'Failed to save storage quota');
    } finally {
      setQuotaSubmitting(false);
    }
  };

  // Project Actions
  const handleOpenManageMembers = (project) => {
    setSelectedProject(project);
    setAddMemberUserId('');
    setAddMemberRole('Member');
    setManageMembersModal(true);
  };

  const handleAddMember = async (e) => {
    e.preventDefault();
    if (!selectedProject || !addMemberUserId) return;
    setMemberActionLoading(true);
    try {
      const res = await apiClient(`/admin/projects/${selectedProject.id}/members`, {
        method: 'POST',
        body: { userId: addMemberUserId, role: addMemberRole }
      });

      // Update local project members
      setProjects((prev) =>
        prev.map((p) => {
          if (p.id !== selectedProject.id) return p;
          const existing = p.members.filter((m) => m.userId !== addMemberUserId);
          return {
            ...p,
            members: [...existing, res.member]
          };
        })
      );

      // Update selected project modal state
      setSelectedProject((prev) => {
        const existing = prev.members.filter((m) => m.userId !== addMemberUserId);
        return { ...prev, members: [...existing, res.member] };
      });

      setAddMemberUserId('');
    } catch (err) {
      alert(err.message || 'Failed to add member to project');
    } finally {
      setMemberActionLoading(false);
    }
  };

  const handlePromptRemoveMember = (member) => {
    setMemberToRemove(member);
    setRemoveMemberDialog(true);
  };

  const handleConfirmRemoveMember = async () => {
    if (!selectedProject || !memberToRemove) return;
    setMemberActionLoading(true);
    try {
      await apiClient(`/admin/projects/${selectedProject.id}/members/${memberToRemove.userId}`, {
        method: 'DELETE'
      });

      // Update local state
      setProjects((prev) =>
        prev.map((p) => {
          if (p.id !== selectedProject.id) return p;
          return {
            ...p,
            members: p.members.filter((m) => m.userId !== memberToRemove.userId)
          };
        })
      );

      setSelectedProject((prev) => ({
        ...prev,
        members: prev.members.filter((m) => m.userId !== memberToRemove.userId)
      }));

      setRemoveMemberDialog(false);
      setMemberToRemove(null);
    } catch (err) {
      alert(err.message || 'Failed to remove member from project');
    } finally {
      setMemberActionLoading(false);
    }
  };

  const handleUpdateProjectMemberRole = async (memberUserId, newRole) => {
    if (!selectedProject) return;
    try {
      const res = await apiClient(`/admin/projects/${selectedProject.id}/members/${memberUserId}`, {
        method: 'PATCH',
        body: { role: newRole }
      });

      setProjects((prev) =>
        prev.map((p) => {
          if (p.id !== selectedProject.id) return p;
          return {
            ...p,
            members: p.members.map((m) => (m.userId === memberUserId ? { ...m, role: newRole } : m))
          };
        })
      );

      setSelectedProject((prev) => ({
        ...prev,
        members: prev.members.map((m) => (m.userId === memberUserId ? { ...m, role: newRole } : m))
      }));
    } catch (err) {
      alert(err.message || 'Failed to update member role');
    }
  };

  if (loading) {
    return <LoadingState message="Loading DEVHUB Administration Panel..." />;
  }

  return (
    <div className="space-y-5 max-w-7xl mx-auto">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-[#1e2538]">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
              <i className="fa-solid fa-shield-halved text-base"></i>
            </div>
            <h1 className="text-2xl font-extrabold text-white tracking-tight">Admin Panel</h1>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Platform governance, user verification, cloud monitoring, and team management
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={loadAdminData}
            title="Refresh Admin Data"
            className="px-3.5 py-2 bg-[#121624] hover:bg-[#1a2136] text-slate-300 hover:text-white border border-[#232d47] rounded-xl text-xs font-semibold transition flex items-center gap-2"
          >
            <i className="fa-solid fa-rotate-right text-xs"></i>
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/40 text-red-300 text-xs px-4 py-3 rounded-xl flex items-center gap-2">
          <i className="fa-solid fa-circle-exclamation text-red-400"></i>
          <span>{error}</span>
        </div>
      )}

      {/* Navigation Tabs */}
      <div className="flex items-center gap-1 overflow-x-auto pb-1 border-b border-[#1e2538] scrollbar-none">
        {[
          { id: 'overview', label: 'Admin Overview', icon: 'fa-chart-pie' },
          { id: 'users', label: `Users (${users.length})`, icon: 'fa-users' },
          { id: 'teams', label: `Teams (${teams.length})`, icon: 'fa-people-group' },
          { id: 'projects', label: `Projects (${projects.length})`, icon: 'fa-folder-tree' },
          { id: 'storage', label: 'Storage Quotas', icon: 'fa-hard-drive' },
          { id: 'integrations', label: `Cloud & GitHub (${cloudConnections.length})`, icon: 'fa-cloud' },
          { id: 'activity', label: 'Platform Activity', icon: 'fa-clock-rotate-left' }
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2.5 rounded-xl text-xs font-bold transition flex items-center gap-2 whitespace-nowrap ${
              activeTab === tab.id
                ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20'
                : 'text-slate-400 hover:text-white hover:bg-[#121624]'
            }`}
          >
            <i className={`fa-solid ${tab.icon} text-xs`}></i>
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      {/* TAB 1: OVERVIEW */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          {/* Summary Stat Cards Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            <AdminStatCard
              icon="fa-users"
              label="Registered Users"
              value={stats.totalUsers}
              subtext="Total platform accounts"
              colorClass="text-indigo-400"
              bgClass="bg-indigo-500/10 border-indigo-500/20"
            />
            <AdminStatCard
              icon="fa-user-check"
              label="Verified Users"
              value={stats.verifiedUsers}
              subtext="Passed email verification"
              colorClass="text-emerald-400"
              bgClass="bg-emerald-500/10 border-emerald-500/20"
            />
            <AdminStatCard
              icon="fa-user-clock"
              label="Unverified Users"
              value={stats.unverifiedUsers}
              subtext="Pending email code"
              colorClass="text-amber-400"
              bgClass="bg-amber-500/10 border-amber-500/20"
            />
            <AdminStatCard
              icon="fa-signal"
              label="Currently Active"
              value={stats.currentlyActive}
              subtext="Active in last 10 minutes"
              colorClass="text-cyan-400"
              bgClass="bg-cyan-500/10 border-cyan-500/20"
            />
            <AdminStatCard
              icon="fa-clock"
              label="Active Recently"
              value={stats.activeRecently}
              subtext="Active in last 24 hours"
              colorClass="text-blue-400"
              bgClass="bg-blue-500/10 border-blue-500/20"
            />
            <AdminStatCard
              icon="fa-folder-open"
              label="Total Projects"
              value={stats.totalProjects}
              subtext="Managed workspaces"
              colorClass="text-purple-400"
              bgClass="bg-purple-500/10 border-purple-500/20"
            />
            <AdminStatCard
              icon="fa-list-check"
              label="Total Tasks"
              value={stats.totalTasks}
              subtext="Across all projects"
              colorClass="text-teal-400"
              bgClass="bg-teal-500/10 border-teal-500/20"
            />
            <AdminStatCard
              icon="fa-cloud-arrow-up"
              label="Connected Cloud Accounts"
              value={stats.connectedCloud}
              subtext="Drive, Dropbox, OneDrive"
              colorClass="text-sky-400"
              bgClass="bg-sky-500/10 border-sky-500/20"
            />
          </div>

          {/* Quick Management Section */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Recent Users preview */}
            <div className="lg:col-span-2 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-bold text-white uppercase tracking-wider">
                  User Management Quick View
                </h2>
                <button
                  onClick={() => setActiveTab('users')}
                  className="text-xs text-indigo-400 hover:text-indigo-300 font-semibold"
                >
                  View All Users &rarr;
                </button>
              </div>
              <UsersTable
                users={users.slice(0, 5)}
                loading={false}
                onUpdateRole={handleUpdateRole}
                onUpdateStatus={handleUpdateStatus}
                onViewProjects={() => setActiveTab('projects')}
                onViewActivity={() => setActiveTab('activity')}
                onEditStorage={(u) => handleOpenSetQuota(u, 'user')}
              />
            </div>

            {/* Platform Recent Activity Feed */}
            <div className="bg-[#121624] border border-[#1e2538] rounded-2xl p-5 flex flex-col h-[520px]">
              <div className="flex items-center justify-between pb-3 border-b border-[#1e2538] mb-3">
                <h2 className="text-xs font-bold text-white uppercase tracking-wider">
                  Recent Major Activity
                </h2>
                <button
                  onClick={() => setActiveTab('activity')}
                  className="text-[11px] text-indigo-400 hover:text-indigo-300 font-semibold"
                >
                  Full Log
                </button>
              </div>
              <div className="flex-1 overflow-y-auto pr-1">
                <ActivityFeed
                  activities={activity.slice(0, 15)}
                  loading={false}
                  emptyMessage="No platform events logged yet."
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: USERS */}
      {activeTab === 'users' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold text-white">Registered Users</h2>
              <p className="text-xs text-slate-400">
                Manage roles, inspect active presence, activate/deactivate accounts, and monitor verification status.
              </p>
            </div>
          </div>

          <UsersTable
            users={users}
            loading={false}
            onUpdateRole={handleUpdateRole}
            onUpdateStatus={handleUpdateStatus}
            onViewProjects={() => setActiveTab('projects')}
            onViewActivity={() => setActiveTab('activity')}
            onEditStorage={(u) => handleOpenSetQuota(u, 'user')}
          />
        </div>
      )}

      {/* TAB: TEAMS */}
      {activeTab === 'teams' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold text-white">Teams & Storage Allocation</h2>
              <p className="text-xs text-slate-400">
                Manage DEVHUB team workspaces, leaders, members, and authoritative cloud storage allocations.
              </p>
            </div>
            <button
              type="button"
              onClick={() => handleOpenSetQuota(null, 'team')}
              className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-semibold transition flex items-center gap-2 shadow-sm"
            >
              <i className="fa-solid fa-hard-drive text-xs"></i>
              <span>Set Team Quota</span>
            </button>
          </div>

          <div className="bg-[#121624] border border-[#1e2538] rounded-2xl overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-[#0b0e18] border-b border-[#1e2538] text-slate-400 font-semibold uppercase tracking-wider text-[10px]">
                    <th className="py-3 px-4">Team</th>
                    <th className="py-3 px-4">Leader</th>
                    <th className="py-3 px-4">Members</th>
                    <th className="py-3 px-4">Used Storage</th>
                    <th className="py-3 px-4">Allocated</th>
                    <th className="py-3 px-4">Remaining</th>
                    <th className="py-3 px-4">Usage %</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#182033]">
                  {teams.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-12 text-center text-slate-500">
                        No teams registered yet.
                      </td>
                    </tr>
                  ) : (
                    teams.map((t) => {
                      return (
                        <tr key={t.id} className="hover:bg-[#151c2e]/60 transition">
                          <td className="py-3 px-4">
                            <div>
                              <p className="font-bold text-white text-xs">{t.name}</p>
                              {t.description && (
                                <p className="text-[11px] text-slate-400 truncate max-w-xs">{t.description}</p>
                              )}
                            </div>
                          </td>
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-2">
                              <Avatar user={t.leader} size="xs" />
                              <div className="min-w-0">
                                <p className="text-white font-medium text-xs truncate">{t.leader?.name || 'Leader'}</p>
                                <p className="text-[10px] text-slate-400 truncate">{t.leader?.email}</p>
                              </div>
                            </div>
                          </td>
                          <td className="py-3 px-4">
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-[#192238] text-slate-300 border border-[#232d47]">
                              <i className="fa-solid fa-users text-[10px] text-indigo-400"></i>
                              {t.memberCount ?? (t.members?.length || 0)} members
                            </span>
                          </td>
                          <td className="py-3 px-4 font-semibold text-slate-200">
                            {t.storage?.usedGB || '0.000'} GB
                          </td>
                          <td className="py-3 px-4 font-semibold text-purple-400">
                            {t.storage?.allocatedGB || 10} GB
                          </td>
                          <td className="py-3 px-4 font-semibold text-emerald-400">
                            {t.storage?.remainingGB || '10.000'} GB
                          </td>
                          <td className="py-3 px-4">
                            <div className="w-28 space-y-1">
                              <div className="flex justify-between text-[10px] text-slate-400 font-medium">
                                <span>{(t.storage?.percentage || 0).toFixed(1)}%</span>
                              </div>
                              <div className="w-full bg-[#192238] rounded-full h-1.5 overflow-hidden">
                                <div
                                  className={`h-full rounded-full transition-all duration-300 ${
                                    (t.storage?.percentage || 0) > 90
                                      ? 'bg-rose-500'
                                      : (t.storage?.percentage || 0) > 75
                                      ? 'bg-amber-500'
                                      : 'bg-purple-500'
                                  }`}
                                  style={{ width: `${Math.min(100, Math.max(1, t.storage?.percentage || 0))}%` }}
                                />
                              </div>
                            </div>
                          </td>
                          <td className="py-3 px-4 text-right whitespace-nowrap">
                            <button
                              type="button"
                              title="Edit team storage quota"
                              onClick={() => handleOpenSetQuota(t, 'team')}
                              className="px-2.5 py-1.5 rounded-lg bg-[#192238] hover:bg-[#232f4e] text-purple-400 hover:text-white transition flex items-center gap-1.5 text-xs font-semibold ml-auto"
                            >
                              <i className="fa-solid fa-hard-drive text-[10px]"></i>
                              <span>Edit Storage</span>
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: PROJECTS & TEAMS */}
      {activeTab === 'projects' && (
        <div className="space-y-4">
          <div>
            <h2 className="text-base font-bold text-white">Projects & Teams</h2>
            <p className="text-xs text-slate-400">
              Inspect all projects, project owners, active collaborators, and manage team memberships.
            </p>
          </div>

          {projects.length === 0 ? (
            <EmptyState
              icon="fa-folder-open"
              title="No Projects Found"
              description="No projects have been created on DEVHUB yet."
            />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {projects.map((proj) => (
                <div
                  key={proj.id}
                  className="bg-[#121624] border border-[#1e2538] hover:border-[#2d3a54] rounded-2xl p-5 shadow-sm transition flex flex-col justify-between"
                >
                  <div>
                    {/* Project Header */}
                    <div className="flex items-start justify-between gap-2 mb-3">
                      <div>
                        <h3 className="text-sm font-bold text-white truncate">{proj.name}</h3>
                        <p className="text-xs text-slate-400 line-clamp-2 mt-0.5">
                          {proj.description || 'No description provided'}
                        </p>
                      </div>
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-500/10 border border-indigo-500/20 text-indigo-400">
                        {proj.status || 'Active'}
                      </span>
                    </div>

                    {/* Owner Info */}
                    <div className="flex items-center gap-2 p-2.5 rounded-xl bg-[#090c14] border border-[#1e2538] mb-4 text-xs">
                      <Avatar user={proj.owner} size="sm" />
                      <div className="min-w-0">
                        <span className="text-[10px] uppercase font-bold text-slate-500 block">Owner</span>
                        <p className="text-white font-semibold truncate">{proj.owner?.name}</p>
                        <p className="text-[11px] text-slate-400 truncate">{proj.owner?.email}</p>
                      </div>
                    </div>

                    {/* Counts */}
                    <div className="grid grid-cols-3 gap-2 text-center text-xs py-2 border-y border-[#182033] mb-4">
                      <div>
                        <span className="text-[10px] text-slate-500 block uppercase">Members</span>
                        <span className="font-bold text-white">{(proj.members || []).length}</span>
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-500 block uppercase">Tasks</span>
                        <span className="font-bold text-white">{proj._count?.tasks ?? 0}</span>
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-500 block uppercase">Files</span>
                        <span className="font-bold text-white">{proj._count?.files ?? 0}</span>
                      </div>
                    </div>

                    {/* Member Avatars */}
                    <div className="mb-4">
                      <span className="text-[10px] uppercase font-bold text-slate-500 block mb-1.5">
                        Team Members
                      </span>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {(proj.members || []).slice(0, 6).map((m) => (
                          <div
                            key={m.id}
                            title={`${m.user?.name} (${m.role})`}
                            className="relative group cursor-pointer"
                          >
                            <Avatar user={m.user} size="sm" />
                          </div>
                        ))}
                        {(proj.members || []).length > 6 && (
                          <span className="text-xs text-slate-400 font-bold ml-1">
                            +{proj.members.length - 6} more
                          </span>
                        )}
                        {(proj.members || []).length === 0 && (
                          <span className="text-xs text-slate-500">No additional members</span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="pt-3 border-t border-[#1e2538] flex items-center justify-between">
                    <span className="text-[11px] text-slate-500">
                      Created {new Date(proj.createdAt).toLocaleDateString()}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleOpenManageMembers(proj)}
                      className="px-3 py-1.5 bg-[#192238] hover:bg-indigo-600 text-white rounded-lg text-xs font-semibold transition flex items-center gap-1.5"
                    >
                      <i className="fa-solid fa-user-plus text-[11px]"></i>
                      <span>Manage Team</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 4: CLOUD CONNECTIONS */}
      {activeTab === 'integrations' && (
        <div className="space-y-4">
          <div>
            <h2 className="text-base font-bold text-white">Connected Cloud & GitHub Accounts</h2>
            <p className="text-xs text-slate-400">
              Overview of connected storage and code providers. Sensitive OAuth tokens, refresh tokens, and passwords are never exposed.
            </p>
          </div>

          <div className="bg-[#121624] border border-[#1e2538] rounded-2xl overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-[#0b0e18] border-b border-[#1e2538] text-slate-400 font-semibold uppercase tracking-wider text-[10px]">
                    <th className="py-3 px-4">User</th>
                    <th className="py-3 px-4">Provider</th>
                    <th className="py-3 px-4">Connection Status</th>
                    <th className="py-3 px-4">Connected Account Identifier</th>
                    <th className="py-3 px-4">Connected / Updated</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#182033]">
                  {cloudConnections.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-12 text-center text-slate-500">
                        No active cloud or GitHub connections recorded.
                      </td>
                    </tr>
                  ) : (
                    cloudConnections.map((conn) => {
                      const isConnected = conn.status === 'connected';
                      const providerLabels = {
                        google_drive: { name: 'Google Drive', icon: 'fa-brands fa-google-drive', color: 'text-amber-400' },
                        dropbox: { name: 'Dropbox', icon: 'fa-brands fa-dropbox', color: 'text-blue-400' },
                        onedrive: { name: 'OneDrive', icon: 'fa-solid fa-cloud', color: 'text-sky-400' },
                        github: { name: 'GitHub', icon: 'fa-brands fa-github', color: 'text-slate-200' }
                      };
                      const conf = providerLabels[conn.provider] || {
                        name: conn.provider,
                        icon: 'fa-solid fa-plug',
                        color: 'text-indigo-400'
                      };

                      return (
                        <tr key={conn.id} className="hover:bg-[#151c2e]/60 transition">
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-2.5">
                              <Avatar user={conn.user} size="sm" />
                              <div>
                                <p className="font-bold text-white text-xs">{conn.user?.name}</p>
                                <p className="text-[11px] text-slate-400">{conn.user?.email}</p>
                              </div>
                            </div>
                          </td>
                          <td className="py-3 px-4">
                            <span className="inline-flex items-center gap-2 font-semibold text-slate-200">
                              <i className={`${conf.icon} ${conf.color} text-sm`}></i>
                              <span>{conf.name}</span>
                            </span>
                          </td>
                          <td className="py-3 px-4">
                            <span
                              className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-bold ${
                                isConnected
                                  ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/25'
                                  : 'bg-slate-700/20 text-slate-400 border border-slate-700/40'
                              }`}
                            >
                              <span
                                className={`w-1.5 h-1.5 rounded-full ${
                                  isConnected ? 'bg-emerald-400' : 'bg-slate-500'
                                }`}
                              ></span>
                              <span>{isConnected ? 'Connected' : 'Disconnected'}</span>
                            </span>
                          </td>
                          <td className="py-3 px-4">
                            <span className="font-mono text-indigo-300 bg-indigo-950/40 border border-indigo-800/30 px-2 py-0.5 rounded text-xs">
                              {conn.accountName || 'Unknown Account'}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-slate-400 whitespace-nowrap">
                            {new Date(conn.updatedAt || conn.createdAt).toLocaleString()}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 5: ACTIVITY FEED */}
      {activeTab === 'activity' && (
        <div className="space-y-4">
          <div>
            <h2 className="text-base font-bold text-white">Platform Activity Log</h2>
            <p className="text-xs text-slate-400">
              Audit trails of user registrations, role changes, project lifecycle events, and cloud connections.
            </p>
          </div>

          <div className="bg-[#121624] border border-[#1e2538] rounded-2xl p-6 shadow-sm">
            <ActivityFeed activities={activity} loading={false} />
          </div>
        </div>
      )}

      {/* Manage Project Members Modal */}
      <Modal
        open={manageMembersModal}
        onClose={() => setManageMembersModal(false)}
        className="max-w-lg p-6"
      >
        {selectedProject && (
          <div>
            <div className="flex items-start justify-between mb-4 pb-3 border-b border-[#1e2538]">
              <div>
                <h3 className="text-base font-bold text-white">Project Team: {selectedProject.name}</h3>
                <p className="text-xs text-slate-400">Add or remove members and update collaboration roles.</p>
              </div>
            </div>

            {/* Add Member Form */}
            <form onSubmit={handleAddMember} className="bg-[#090c14] border border-[#1e2538] rounded-xl p-3 mb-5 space-y-3">
              <span className="text-[11px] font-bold uppercase text-slate-400 block tracking-wider">
                Add New Member
              </span>
              <div className="flex flex-col sm:flex-row gap-2">
                <select
                  required
                  value={addMemberUserId}
                  onChange={(e) => setAddMemberUserId(e.target.value)}
                  className="bg-[#121624] border border-[#232d47] rounded-lg px-3 py-2 text-xs text-white flex-1 focus:outline-none focus:border-indigo-500"
                >
                  <option value="">Select a user to add...</option>
                  {users
                    .filter((u) => u.id !== selectedProject.ownerId)
                    .map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name} ({u.email})
                      </option>
                    ))}
                </select>

                <select
                  value={addMemberRole}
                  onChange={(e) => setAddMemberRole(e.target.value)}
                  className="bg-[#121624] border border-[#232d47] rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
                >
                  <option value="Admin">Admin</option>
                  <option value="Member">Member</option>
                  <option value="Viewer">Viewer</option>
                </select>

                <button
                  type="submit"
                  disabled={memberActionLoading || !addMemberUserId}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs rounded-lg transition disabled:opacity-50"
                >
                  {memberActionLoading ? <i className="fa-solid fa-circle-notch fa-spin"></i> : 'Add Member'}
                </button>
              </div>
            </form>

            {/* Current Members List */}
            <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
              <span className="text-[11px] font-bold uppercase text-slate-400 block tracking-wider mb-2">
                Current Members ({(selectedProject.members || []).length})
              </span>

              {/* Owner Row */}
              <div className="flex items-center justify-between p-2.5 rounded-xl bg-[#121624] border border-[#1e2538]">
                <div className="flex items-center gap-2.5">
                  <Avatar user={selectedProject.owner} size="sm" />
                  <div>
                    <p className="text-xs font-bold text-white">{selectedProject.owner?.name}</p>
                    <p className="text-[11px] text-slate-400">{selectedProject.owner?.email}</p>
                  </div>
                </div>
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-purple-500/10 text-purple-400 border border-purple-500/25">
                  Owner
                </span>
              </div>

              {/* Collaborator Rows */}
              {(selectedProject.members || []).map((m) => (
                <div
                  key={m.id}
                  className="flex items-center justify-between p-2.5 rounded-xl bg-[#121624] border border-[#1e2538]"
                >
                  <div className="flex items-center gap-2.5">
                    <Avatar user={m.user} size="sm" />
                    <div>
                      <p className="text-xs font-bold text-white">{m.user?.name}</p>
                      <p className="text-[11px] text-slate-400">{m.user?.email}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <select
                      value={m.role}
                      onChange={(e) => handleUpdateProjectMemberRole(m.userId, e.target.value)}
                      className="bg-[#090c14] border border-[#232d47] rounded-lg px-2 py-1 text-xs text-white focus:outline-none"
                    >
                      <option value="Admin">Admin</option>
                      <option value="Member">Member</option>
                      <option value="Viewer">Viewer</option>
                    </select>

                    <button
                      type="button"
                      title="Remove member from project"
                      onClick={() => handlePromptRemoveMember(m)}
                      className="w-7 h-7 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 flex items-center justify-center transition"
                    >
                      <i className="fa-solid fa-trash text-xs"></i>
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex justify-end pt-4 mt-4 border-t border-[#1e2538]">
              <button
                type="button"
                onClick={() => setManageMembersModal(false)}
                className="px-4 py-2 bg-[#192238] hover:bg-[#232f4e] text-white text-xs font-semibold rounded-lg transition"
              >
                Done
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* TAB: STORAGE QUOTAS */}
      {activeTab === 'storage' && (
        <div className="space-y-6">
          {/* Global System Storage Pool Card */}
          <div className="bg-[#121624] border border-[#1e2538] rounded-2xl p-5 shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-5">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
                  <i className="fa-solid fa-server text-lg"></i>
                </div>
                <div>
                  <h3 className="text-base font-bold text-white tracking-tight">
                    DEVHUB Global Cloud Storage Pool (5 TB)
                  </h3>
                  <p className="text-xs text-slate-400">
                    High-performance physical cloud storage managed by DEVHUB with quota allocations and safety buffers.
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => handleOpenSetQuota()}
                className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-semibold transition flex items-center gap-2 shrink-0 shadow-sm"
              >
                <i className="fa-solid fa-plus text-xs"></i>
                <span>Configure Storage Quota</span>
              </button>
            </div>

            {/* 6 Required Physical & Logical Metrics Cards */}
            {storageData.poolStatus && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3">
                  {/* 1. Global Physical Capacity */}
                  <div className="bg-[#0f1422] border border-[#192238] rounded-xl p-3.5">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                      Physical Capacity
                    </span>
                    <div className="text-base font-black text-white">
                      {storageData.poolStatus.physicalCapacityFormatted || '5 TB'}
                    </div>
                    <span className="text-[10px] text-slate-500">
                      {storageData.poolStatus.physicalCapacityGB || 5120} GB total
                    </span>
                  </div>

                  {/* 2. Actual Physical Usage */}
                  <div className="bg-[#0f1422] border border-[#192238] rounded-xl p-3.5">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                      Actual Usage
                    </span>
                    <div className="text-base font-black text-amber-400">
                      {storageData.poolStatus.actualUsedGB || '0.00'} GB
                    </div>
                    <span className="text-[10px] text-slate-500">
                      {(storageData.poolStatus.poolPercentage || 0).toFixed(2)}% used
                    </span>
                  </div>

                  {/* 3. Remaining Physical Capacity */}
                  <div className="bg-[#0f1422] border border-[#192238] rounded-xl p-3.5">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                      Remaining Physical
                    </span>
                    <div className="text-base font-black text-emerald-400">
                      {storageData.poolStatus.actualRemainingGB || '5120.00'} GB
                    </div>
                    <span className="text-[10px] text-slate-500">
                      Available to store
                    </span>
                  </div>

                  {/* 4. Safety Buffer */}
                  <div className="bg-[#0f1422] border border-[#192238] rounded-xl p-3.5">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                      Safety Buffer
                    </span>
                    <div className="text-base font-black text-rose-400">
                      {storageData.poolStatus.safetyBufferGB || 50} GB
                    </div>
                    <span className="text-[10px] text-slate-500">
                      Protected threshold
                    </span>
                  </div>

                  {/* 5. Logical Personal Allocations */}
                  <div className="bg-[#0f1422] border border-[#192238] rounded-xl p-3.5">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                      Personal Quotas
                    </span>
                    <div className="text-base font-black text-indigo-400">
                      {storageData.poolStatus.totalLogicalPersonalGB || '0.00'} GB
                    </div>
                    <span className="text-[10px] text-slate-500">
                      {storageData.personalAllocations.length} user allocations
                    </span>
                  </div>

                  {/* 6. Logical Team Allocations */}
                  <div className="bg-[#0f1422] border border-[#192238] rounded-xl p-3.5">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                      Team Quotas
                    </span>
                    <div className="text-base font-black text-purple-400">
                      {storageData.poolStatus.totalLogicalTeamGB || '0.00'} GB
                    </div>
                    <span className="text-[10px] text-slate-500">
                      {storageData.teamAllocations.length} team allocations
                    </span>
                  </div>
                </div>

                {/* Physical Usage Progress Bar */}
                <div className="space-y-1.5 pt-2 border-t border-[#1e2538]">
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-slate-300 font-medium">
                      Physical Pool Usage: <strong className="text-white">{storageData.poolStatus.actualUsedGB || '0.00'} GB</strong> / {storageData.poolStatus.physicalCapacityFormatted || '5 TB'}
                    </span>
                    <span className="text-slate-400 text-xs">
                      Safety Limit: {Number(storageData.poolStatus.physicalCapacityGB || 5120) - Number(storageData.poolStatus.safetyBufferGB || 50)} GB
                    </span>
                  </div>
                  <div className="w-full bg-[#192238] rounded-full h-2 overflow-hidden">
                    <div
                      className="h-full bg-emerald-500 rounded-full transition-all duration-500"
                      style={{ width: `${Math.min(100, Math.max(1, storageData.poolStatus.poolPercentage || 0))}%` }}
                    ></div>
                  </div>
                  <div className="text-[11px] text-slate-500 flex justify-between">
                    <span>Total Logical Allocated: {storageData.poolStatus.allocatedGB || '0.00'} GB ({storageData.poolStatus.allocatedPercentage || 0}% of physical pool)</span>
                    <span>System Status: {storageData.poolStatus.isPhysicalPoolExhausted ? 'Exhausted' : 'Healthy'}</span>
                  </div>
                </div>

                {/* Logical & Membership Highlights */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-3 border-t border-[#1e2538] text-xs">
                  <div className="p-3 rounded-xl bg-[#090c14] border border-[#192238] flex items-center justify-between">
                    <span className="text-slate-400">Total Logical Allocated:</span>
                    <strong className="text-white font-bold">{storageData.poolStatus.allocatedGB || '0.00'} GB</strong>
                  </div>
                  <div className="p-3 rounded-xl bg-[#090c14] border border-[#192238] flex items-center justify-between">
                    <span className="text-slate-400">Total Registered Users:</span>
                    <strong className="text-indigo-400 font-bold">{storageData.poolStatus.userCount ?? users.length}</strong>
                  </div>
                  <div className="p-3 rounded-xl bg-[#090c14] border border-[#192238] flex items-center justify-between">
                    <span className="text-slate-400">Total Managed Teams:</span>
                    <strong className="text-purple-400 font-bold">{storageData.poolStatus.teamCount ?? teams.length}</strong>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Top Storage Consumers (Users & Teams) */}
          {storageData.poolStatus && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Highest-Usage Users */}
              <div className="bg-[#121624] border border-[#1e2538] rounded-2xl p-4 shadow-sm">
                <div className="flex items-center justify-between pb-3 border-b border-[#1e2538] mb-3">
                  <h4 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
                    <i className="fa-solid fa-fire text-amber-400"></i>
                    <span>Top Storage Consumers — Users</span>
                  </h4>
                  <span className="text-[11px] text-slate-400">Top 5 by actual used bytes</span>
                </div>
                {(storageData.poolStatus.highestUsageUsers || []).length === 0 ? (
                  <p className="text-xs text-slate-500 py-4 text-center">No user storage usage recorded yet.</p>
                ) : (
                  <div className="space-y-2.5">
                    {storageData.poolStatus.highestUsageUsers.map((u) => (
                      <div
                        key={u.userId}
                        className="p-2.5 rounded-xl bg-[#090c14] border border-[#192238] flex items-center justify-between gap-3 text-xs"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between mb-1">
                            <span className="font-bold text-white truncate">{u.name}</span>
                            <span className="text-[11px] text-slate-400">
                              <strong className="text-amber-400">{u.usedGB} GB</strong> / {u.allocatedGB} GB ({u.percentage.toFixed(1)}%)
                            </span>
                          </div>
                          <div className="w-full bg-[#192238] rounded-full h-1.5 overflow-hidden">
                            <div
                              className="h-full bg-amber-500 rounded-full"
                              style={{ width: `${Math.min(100, Math.max(1, u.percentage))}%` }}
                            />
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleOpenSetQuota(u, 'user')}
                          className="px-2 py-1 bg-[#192238] hover:bg-[#232f4e] text-indigo-400 hover:text-white rounded-lg text-[11px] font-semibold transition shrink-0"
                        >
                          Edit Quota
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Highest-Usage Teams */}
              <div className="bg-[#121624] border border-[#1e2538] rounded-2xl p-4 shadow-sm">
                <div className="flex items-center justify-between pb-3 border-b border-[#1e2538] mb-3">
                  <h4 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
                    <i className="fa-solid fa-people-group text-purple-400"></i>
                    <span>Top Storage Consumers — Teams</span>
                  </h4>
                  <span className="text-[11px] text-slate-400">Top 5 by actual used bytes</span>
                </div>
                {(storageData.poolStatus.highestUsageTeams || []).length === 0 ? (
                  <p className="text-xs text-slate-500 py-4 text-center">No team storage usage recorded yet.</p>
                ) : (
                  <div className="space-y-2.5">
                    {storageData.poolStatus.highestUsageTeams.map((t) => (
                      <div
                        key={t.teamId}
                        className="p-2.5 rounded-xl bg-[#090c14] border border-[#192238] flex items-center justify-between gap-3 text-xs"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between mb-1">
                            <div>
                              <span className="font-bold text-white truncate mr-2">{t.name}</span>
                              <span className="text-[10px] text-slate-500">({t.leaderName})</span>
                            </div>
                            <span className="text-[11px] text-slate-400">
                              <strong className="text-purple-400">{t.usedGB} GB</strong> / {t.allocatedGB} GB ({t.percentage.toFixed(1)}%)
                            </span>
                          </div>
                          <div className="w-full bg-[#192238] rounded-full h-1.5 overflow-hidden">
                            <div
                              className="h-full bg-purple-500 rounded-full"
                              style={{ width: `${Math.min(100, Math.max(1, t.percentage))}%` }}
                            />
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleOpenSetQuota(t, 'team')}
                          className="px-2 py-1 bg-[#192238] hover:bg-[#232f4e] text-purple-400 hover:text-white rounded-lg text-[11px] font-semibold transition shrink-0"
                        >
                          Edit Quota
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Personal Allocations Table */}
          <div className="bg-[#121624] border border-[#1e2538] rounded-2xl overflow-hidden shadow-sm">
            <div className="p-4 border-b border-[#1e2538] flex items-center justify-between">
              <h4 className="text-sm font-bold text-white tracking-tight flex items-center gap-2">
                <i className="fa-solid fa-user text-indigo-400"></i>
                <span>Personal Storage Allocations</span>
              </h4>
              <span className="text-xs text-slate-400">
                {storageData.personalAllocations.length} allocations
              </span>
            </div>

            {storageLoading ? (
              <div className="p-8 text-center text-slate-400 text-xs">
                <i className="fa-solid fa-circle-notch fa-spin text-indigo-500 text-lg mb-2"></i>
                <p>Loading personal storage allocations...</p>
              </div>
            ) : storageData.personalAllocations.length === 0 ? (
              <div className="p-8 text-center text-slate-400 text-xs">
                <p className="font-semibold text-slate-300">No personal allocations configured yet.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-[#1e2538] text-[11px] font-bold text-slate-400 uppercase tracking-wider bg-[#0f1320]/60">
                      <th className="py-3 px-4">User</th>
                      <th className="py-3 px-4">Role</th>
                      <th className="py-3 px-4">Allocated</th>
                      <th className="py-3 px-4">Used</th>
                      <th className="py-3 px-4">Remaining</th>
                      <th className="py-3 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#1e2538] text-xs">
                    {storageData.personalAllocations.map((alloc) => {
                      const allocGB = Number(BigInt(alloc.allocatedBytes) / (1024n * 1024n * 1024n));
                      const usedGB = (Number(BigInt(alloc.usedBytes)) / (1024 * 1024 * 1024)).toFixed(2);
                      const remGB = Math.max(0, allocGB - Number(usedGB)).toFixed(2);
                      return (
                        <tr key={alloc.id} className="hover:bg-[#161c2e]/50 transition">
                          <td className="py-3.5 px-4 font-semibold text-white">
                            {alloc.user?.name || alloc.user?.email || 'User'}
                            <span className="block text-[10px] text-slate-400 font-normal">{alloc.user?.email}</span>
                          </td>
                          <td className="py-3.5 px-4 text-slate-300">
                            {alloc.user?.role || 'User'}
                          </td>
                          <td className="py-3.5 px-4 font-medium text-slate-200">
                            {allocGB} GB
                          </td>
                          <td className="py-3.5 px-4 font-medium text-slate-200">
                            {usedGB} GB
                          </td>
                          <td className="py-3.5 px-4 font-medium text-emerald-400">
                            {remGB} GB
                          </td>
                          <td className="py-3.5 px-4 text-right">
                            <button
                              type="button"
                              onClick={() => handleOpenSetQuota(alloc, 'user')}
                              className="px-2.5 py-1 bg-[#192238] hover:bg-[#222e4c] text-indigo-300 hover:text-white rounded-lg text-xs font-medium transition"
                            >
                              Edit Quota
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Team Allocations Table */}
          <div className="bg-[#121624] border border-[#1e2538] rounded-2xl overflow-hidden shadow-sm">
            <div className="p-4 border-b border-[#1e2538] flex items-center justify-between">
              <h4 className="text-sm font-bold text-white tracking-tight flex items-center gap-2">
                <i className="fa-solid fa-users text-purple-400"></i>
                <span>Team Storage Allocations</span>
              </h4>
              <span className="text-xs text-slate-400">
                {storageData.teamAllocations.length} allocations
              </span>
            </div>

            {storageData.teamAllocations.length === 0 ? (
              <div className="p-8 text-center text-slate-400 text-xs">
                <p className="font-semibold text-slate-300">No team allocations configured yet.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-[#1e2538] text-[11px] font-bold text-slate-400 uppercase tracking-wider bg-[#0f1320]/60">
                      <th className="py-3 px-4">Team</th>
                      <th className="py-3 px-4">Allocated</th>
                      <th className="py-3 px-4">Used</th>
                      <th className="py-3 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#1e2538] text-xs">
                    {storageData.teamAllocations.map((alloc) => {
                      const allocGB = Number(BigInt(alloc.allocatedBytes) / (1024n * 1024n * 1024n));
                      const usedGB = (Number(BigInt(alloc.usedBytes)) / (1024 * 1024 * 1024)).toFixed(2);
                      return (
                        <tr key={alloc.id} className="hover:bg-[#161c2e]/50 transition">
                          <td className="py-3.5 px-4 font-semibold text-white">
                            {alloc.team?.name || 'Unnamed Team'}
                          </td>
                          <td className="py-3.5 px-4 font-medium text-slate-200">
                            {allocGB} GB
                          </td>
                          <td className="py-3.5 px-4 font-medium text-slate-200">
                            {usedGB} GB
                          </td>
                          <td className="py-3.5 px-4 text-right">
                            <button
                              type="button"
                              onClick={() => handleOpenSetQuota(alloc, 'team')}
                              className="px-2.5 py-1 bg-[#192238] hover:bg-[#222e4c] text-indigo-300 hover:text-white rounded-lg text-xs font-medium transition"
                            >
                              Edit Quota
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Set/Edit Quota Modal */}
      <Modal
        open={quotaModalOpen}
        onClose={() => setQuotaModalOpen(false)}
        title={`Configure ${quotaForm.type === 'team' ? 'Team' : 'User'} Storage Quota`}
      >
        <form onSubmit={handleSaveQuota} className="space-y-4">
          {quotaError && (
            <div className="bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs px-3.5 py-2.5 rounded-xl flex items-center gap-2">
              <i className="fa-solid fa-circle-exclamation text-rose-400"></i>
              <span>{quotaError}</span>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
              Target {quotaForm.type === 'team' ? 'Team' : 'User'}
            </label>
            {quotaForm.type === 'team' ? (
              <div className="bg-[#121624] border border-[#232d47] rounded-xl px-3 py-2 text-xs text-white flex items-center justify-between">
                <span className="font-semibold">{quotaForm.targetName || 'Team'}</span>
                <span className="text-[10px] text-purple-400 font-bold uppercase tracking-wider">Team Workspace</span>
              </div>
            ) : (
              <div className="bg-[#121624] border border-[#232d47] rounded-xl px-3 py-2 text-xs text-white flex items-center justify-between">
                <span className="font-semibold">{quotaForm.targetName || 'User'}</span>
                <span className="text-[10px] text-indigo-400 font-bold uppercase tracking-wider">Personal Storage</span>
              </div>
            )}
          </div>

          {/* Current Usage Indicator */}
          <div className="p-3 bg-[#090c14] border border-[#1e2538] rounded-xl flex items-center justify-between text-xs">
            <span className="text-slate-400">Current Storage Used:</span>
            <span className="font-bold text-amber-400">
              {quotaForm.currentUsedGB ? `${quotaForm.currentUsedGB} GB` : '0.000 GB'}
            </span>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
              New Allocated Storage (in GB)
            </label>
            <input
              type="number"
              step="any"
              min="0.1"
              max="5000"
              value={quotaForm.allocatedGB}
              onChange={(e) => {
                setQuotaError('');
                setQuotaForm(prev => ({ ...prev, allocatedGB: e.target.value }));
              }}
              className={`w-full bg-[#121624] border rounded-xl px-3 py-2 text-xs text-white focus:outline-none transition ${
                Number(quotaForm.allocatedGB) < Number(quotaForm.currentUsedGB)
                  ? 'border-rose-500/80 focus:border-rose-500'
                  : 'border-[#232d47] focus:border-indigo-500'
              }`}
              required
            />

            {/* Validation Message */}
            {Number(quotaForm.allocatedGB) < Number(quotaForm.currentUsedGB) && (
              <p className="text-xs text-rose-400 flex items-center gap-1.5 mt-1.5 font-medium">
                <i className="fa-solid fa-triangle-exclamation"></i>
                <span>Allocation cannot be lower than current usage ({quotaForm.currentUsedGB} GB).</span>
              </p>
            )}

            {/* Presets */}
            <div className="flex gap-2 mt-2 flex-wrap">
              {[5, 10, 20, 50, 100, 500].map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => {
                    setQuotaError('');
                    setQuotaForm(prev => ({ ...prev, allocatedGB: preset }));
                  }}
                  className={`px-2.5 py-1 rounded-lg text-[10px] font-bold border transition ${
                    Number(quotaForm.allocatedGB) === preset
                      ? 'bg-indigo-600 text-white border-indigo-500'
                      : 'bg-[#192238] text-slate-300 border-[#232d47] hover:border-slate-500'
                  }`}
                >
                  {preset} GB
                </button>
              ))}
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-[#1e2538]">
            <button
              type="button"
              onClick={() => setQuotaModalOpen(false)}
              className="px-3.5 py-2 bg-[#192238] hover:bg-[#232f4e] text-slate-300 text-xs font-semibold rounded-xl transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={
                quotaSubmitting ||
                Number(quotaForm.allocatedGB) < Number(quotaForm.currentUsedGB) ||
                Number(quotaForm.allocatedGB) <= 0
              }
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-xl transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {quotaSubmitting ? 'Saving...' : 'Save Allocation'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Remove Member Confirm Dialog */}
      <ConfirmDialog
        open={removeMemberDialog}
        onClose={() => setRemoveMemberDialog(false)}
        onConfirm={handleConfirmRemoveMember}
        title="Remove Member from Project?"
        message={`Are you sure you want to remove ${memberToRemove?.user?.name} from ${selectedProject?.name}?`}
        confirmText="Remove Member"
        danger={true}
        loading={memberActionLoading}
      />
    </div>
  );
}
