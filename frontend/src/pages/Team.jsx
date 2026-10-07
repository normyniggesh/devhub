import React, { useState, useEffect, useCallback } from 'react';
import { apiClient } from '../api/client';
import CompactPageHeader from '../components/common/CompactPageHeader';
import MemberSummary from '../components/team/MemberSummary';
import MemberTable from '../components/team/MemberTable';
import MemberDetailsModal from '../components/team/MemberDetailsModal';
import AddMemberModal from '../components/team/AddMemberModal';
import ChangeRoleModal from '../components/team/ChangeRoleModal';
import CreateTeamModal from '../components/team/CreateTeamModal';
import ConfirmDialog from '../components/common/ConfirmDialog';

export default function Team() {
  const [members, setMembers] = useState([]);
  const [summary, setSummary] = useState({
    totalMembers: 0,
    sharedProjects: 0,
    admins: 0,
    pendingInvites: 0
  });
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [feedback, setFeedback] = useState(null);

  // Search & Role Filter
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState('All');

  // Modals state
  const [selectedMember, setSelectedMember] = useState(null);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showChangeRoleModal, setShowChangeRoleModal] = useState(false);
  const [memberToChangeRole, setMemberToChangeRole] = useState(null);

  // Destructive removal confirmation
  const [memberToRemove, setMemberToRemove] = useState(null);
  const [removing, setRemoving] = useState(false);

  const fetchTeamData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await apiClient('/team');
      setMembers(res.members || []);
      setSummary(res.summary || {
        totalMembers: (res.members || []).length,
        sharedProjects: 0,
        admins: (res.members || []).filter(m => m.role === 'Admin').length,
        pendingInvites: 0
      });
      setProjects(res.projects || []);
    } catch (err) {
      console.error('Error fetching team:', err);
      setError(err.message || 'Failed to load team data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTeamData();
  }, [fetchTeamData]);

  // Actions
  const handleViewMember = (member) => {
    setSelectedMember(member);
    setShowDetailsModal(true);
  };

  const handleOpenChangeRole = (member) => {
    setMemberToChangeRole(member);
    setShowChangeRoleModal(true);
  };

  const handleConfirmRemove = async () => {
    if (!memberToRemove) return;
    try {
      setRemoving(true);
      // If member has a shared team, remove from team
      const teamId = memberToRemove.teams?.[0]?.id || memberToRemove.projects?.[0]?.id;
      if (teamId) {
        await apiClient(`/team/${memberToRemove.id}/teams/${teamId}`, {
          method: 'DELETE'
        });
      }
      setMemberToRemove(null);
      await fetchTeamData();
    } catch (err) {
      alert(err.message || 'Failed to remove member');
    } finally {
      setRemoving(false);
    }
  };

  return (
    <div className="flex flex-col gap-5 max-w-[1920px] mx-auto pb-12">
      {/* 4th "Tab Style" Compact Hero Header */}
      <CompactPageHeader
        title="Team"
        subtitle="Manage people and team access."
        actions={
          <>
            {/* Search Input */}
            <div className="relative w-48 sm:w-64">
              <i className="fa-solid fa-magnifying-glass absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-xs"></i>
              <input
                type="text"
                placeholder="Search member, email, project..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-[#161d2f] border border-[#1f2a44] rounded-xl pl-8 pr-7 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-purple-500 transition"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                >
                  <i className="fa-solid fa-xmark text-xs"></i>
                </button>
              )}
            </div>

            {/* Role Filter Dropdown */}
            <select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
              className="bg-[#161d2f] border border-[#1f2a44] rounded-xl px-3 py-2 text-xs font-semibold text-white focus:outline-none focus:border-purple-500 transition cursor-pointer"
            >
              <option value="All">All Roles</option>
              <option value="Admin">Admins</option>
              <option value="Editor">Editors</option>
              <option value="Member">Members</option>
              <option value="Viewer">Viewers</option>
            </select>

            {/* Create Team Button */}
            <button
              type="button"
              onClick={() => setShowCreateModal(true)}
              className="flex items-center gap-2 px-3.5 py-2 bg-[#161d2f] border border-[#1f2a44] hover:border-purple-500 text-slate-300 hover:text-white rounded-xl text-xs font-bold transition shrink-0 active:scale-95"
            >
              <i className="fa-solid fa-users-rectangle text-purple-400 text-xs"></i>
              <span>Create Team</span>
            </button>

            {/* Add Member Button */}
            <button
              type="button"
              onClick={() => setShowAddModal(true)}
              className="flex items-center gap-2 px-3.5 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-bold shadow-lg shadow-purple-900/30 transition shrink-0 active:scale-95"
            >
              <i className="fa-solid fa-user-plus text-xs"></i>
              <span>Add Member</span>
            </button>
          </>
        }
      />

      {/* Compact Summary Row (Real statistics only) */}
      <MemberSummary summary={summary} />

      {/* Main Member Table Area */}
      {error ? (
        <div className="p-6 text-center text-red-400 bg-red-500/10 border border-red-500/20 rounded-2xl text-xs">
          {error}
        </div>
      ) : loading ? (
        <div className="bg-[#0f1422] border border-[#192238] rounded-2xl p-16 flex flex-col items-center justify-center">
          <i className="fa-solid fa-circle-notch fa-spin text-3xl text-purple-500 mb-3"></i>
          <span className="text-xs font-semibold text-slate-400">Loading team members...</span>
        </div>
      ) : (
        <MemberTable
          members={members}
          onViewMember={handleViewMember}
          onChangeRole={handleOpenChangeRole}
          onRemoveMember={(member) => setMemberToRemove(member)}
          searchQuery={searchQuery}
          roleFilter={roleFilter}
        />
      )}

      {/* Member Details Modal */}
      {showDetailsModal && (
        <MemberDetailsModal
          open={showDetailsModal}
          onClose={() => {
            setShowDetailsModal(false);
            setSelectedMember(null);
          }}
          member={selectedMember}
          onChangeRole={(m) => {
            setShowDetailsModal(false);
            handleOpenChangeRole(m);
          }}
        />
      )}

      {/* Add Member Modal */}
      {showAddModal && (
        <AddMemberModal
          open={showAddModal}
          onClose={() => setShowAddModal(false)}
          projects={projects}
          onMemberAdded={fetchTeamData}
        />
      )}

      {/* Change Role Modal */}
      {showChangeRoleModal && (
        <ChangeRoleModal
          open={showChangeRoleModal}
          onClose={() => {
            setShowChangeRoleModal(false);
            setMemberToChangeRole(null);
          }}
          member={memberToChangeRole}
          onRoleUpdated={fetchTeamData}
        />
      )}

      {/* Create Team Modal */}
      {showCreateModal && (
        <CreateTeamModal
          open={showCreateModal}
          onClose={() => setShowCreateModal(false)}
          onTeamCreated={() => {
            setShowCreateModal(false);
            fetchTeamData();
          }}
        />
      )}

      {/* Remove Member ConfirmDialog */}
      {memberToRemove && (
        <ConfirmDialog
          open={Boolean(memberToRemove)}
          onClose={() => setMemberToRemove(null)}
          onConfirm={handleConfirmRemove}
          title="Remove Team Member"
          message={`Are you sure you want to remove ${memberToRemove.name} (${memberToRemove.email}) from project access? Their assigned tasks will be unassigned.`}
          confirmText="Remove Member"
          loading={removing}
          danger={true}
        />
      )}
    </div>
  );
}
