import React, { useState, useMemo } from 'react';
import Avatar from '../common/Avatar';

function formatRelativeTime(dateString) {
  if (!dateString) return 'Never';
  const now = new Date();
  const date = new Date(dateString);
  const diffMs = now - date;
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffMin < 5) return 'Active now';
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHour < 24) return 'Today';
  if (diffDay === 1) return 'Yesterday';
  if (diffDay < 7) return `${diffDay} days ago`;
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export default function MemberTable({
  members = [],
  onViewMember,
  onChangeRole,
  onRemoveMember,
  searchQuery = '',
  roleFilter = 'All'
}) {
  const [sortField, setSortField] = useState('name');
  const [sortDirection, setSortDirection] = useState('asc'); // 'asc' | 'desc'
  const [menuOpenId, setMenuOpenId] = useState(null);

  // Handle Sort
  const handleSort = (field) => {
    if (sortField === field) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  // Filter and Sort members
  const filteredMembers = useMemo(() => {
    let result = [...members];

    if (searchQuery && searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter(m => 
        m.name?.toLowerCase().includes(q) ||
        m.email?.toLowerCase().includes(q) ||
        m.projects?.some(p => p.name?.toLowerCase().includes(q))
      );
    }

    if (roleFilter && roleFilter !== 'All') {
      result = result.filter(m => m.role?.toLowerCase() === roleFilter.toLowerCase());
    }

    result.sort((a, b) => {
      let valA = a[sortField];
      let valB = b[sortField];

      if (sortField === 'projects') {
        valA = a.projectsCount || 0;
        valB = b.projectsCount || 0;
      } else if (sortField === 'lastSeen') {
        valA = new Date(a.lastSeen || 0).getTime();
        valB = new Date(b.lastSeen || 0).getTime();
      } else if (typeof valA === 'string') {
        valA = valA.toLowerCase();
        valB = (valB || '').toLowerCase();
      }

      if (valA < valB) return sortDirection === 'asc' ? -1 : 1;
      if (valA > valB) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });

    return result;
  }, [members, searchQuery, roleFilter, sortField, sortDirection]);

  const getRoleBadge = (role) => {
    switch (role) {
      case 'Admin':
      case 'Leader':
      case 'Owner':
        return 'bg-purple-500/10 text-purple-400 border-purple-500/20';
      case 'Editor':
        return 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20';
      case 'Member':
        return 'bg-blue-500/10 text-blue-400 border-blue-500/20';
      default:
        return 'bg-slate-500/10 text-slate-400 border-slate-500/20';
    }
  };

  return (
    <div className="bg-[#0f1422] border border-[#192238] rounded-2xl shadow-sm overflow-hidden transition-all">
      {/* Table Container */}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="bg-[#121828] border-b border-[#192238] text-[11px] font-bold text-slate-400 uppercase tracking-wider">
              <th
                onClick={() => handleSort('name')}
                className="py-3.5 px-4 cursor-pointer hover:text-white transition select-none"
              >
                <div className="flex items-center gap-1.5">
                  <span>Member</span>
                  {sortField === 'name' && (
                    <i className={`fa-solid fa-arrow-${sortDirection === 'asc' ? 'up' : 'down'} text-[10px]`}></i>
                  )}
                </div>
              </th>
              <th className="py-3.5 px-4 hidden md:table-cell">Email</th>
              <th
                onClick={() => handleSort('role')}
                className="py-3.5 px-4 cursor-pointer hover:text-white transition select-none"
              >
                <div className="flex items-center gap-1.5">
                  <span>Role</span>
                  {sortField === 'role' && (
                    <i className={`fa-solid fa-arrow-${sortDirection === 'asc' ? 'up' : 'down'} text-[10px]`}></i>
                  )}
                </div>
              </th>
              <th
                onClick={() => handleSort('projects')}
                className="py-3.5 px-4 cursor-pointer hover:text-white transition select-none"
              >
                <div className="flex items-center gap-1.5">
                  <span>Teams</span>
                  {sortField === 'projects' && (
                    <i className={`fa-solid fa-arrow-${sortDirection === 'asc' ? 'up' : 'down'} text-[10px]`}></i>
                  )}
                </div>
              </th>
              <th className="py-3.5 px-4 hidden lg:table-cell">GitHub</th>
              <th
                onClick={() => handleSort('lastSeen')}
                className="py-3.5 px-4 cursor-pointer hover:text-white transition select-none hidden sm:table-cell"
              >
                <div className="flex items-center gap-1.5">
                  <span>Last Active</span>
                  {sortField === 'lastSeen' && (
                    <i className={`fa-solid fa-arrow-${sortDirection === 'asc' ? 'up' : 'down'} text-[10px]`}></i>
                  )}
                </div>
              </th>
              <th className="py-3.5 px-4 hidden sm:table-cell">Status</th>
              <th className="py-3.5 px-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#192238]/60 text-slate-300">
            {filteredMembers.length > 0 ? (
              filteredMembers.map((member) => {
                const isMenuOpen = menuOpenId === member.id;
                return (
                  <tr
                    key={member.id}
                    className="hover:bg-[#161d2f]/70 transition-colors group cursor-pointer"
                    onClick={() => onViewMember && onViewMember(member)}
                  >
                    {/* Member (Avatar + Name) */}
                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-3 min-w-0">
                        <Avatar
                          user={member}
                          size="sm"
                          className="shrink-0 group-hover:scale-105 transition-transform"
                        />
                        <div className="min-w-0">
                          <div className="font-bold text-white tracking-tight truncate flex items-center gap-2">
                            <span>{member.name}</span>
                            {member.isCurrentUser && (
                              <span className="text-[10px] bg-purple-500/20 text-purple-300 px-1.5 py-0.2 rounded font-normal">
                                You
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-slate-400 truncate md:hidden">
                            {member.email}
                          </div>
                        </div>
                      </div>
                    </td>

                    {/* Email */}
                    <td className="py-3.5 px-4 hidden md:table-cell font-mono text-[11px] text-slate-300">
                      {member.email}
                    </td>

                    {/* Role */}
                    <td className="py-3.5 px-4">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold border ${getRoleBadge(
                          member.role
                        )}`}
                      >
                        {member.role || 'Member'}
                      </span>
                    </td>

                    {/* Teams */}
                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-1.5">
                        <span className="font-semibold text-white">
                          {member.teamsCount || member.projectsCount || 0}
                        </span>
                        <span className="text-slate-500">
                          {(member.teamsCount || member.projectsCount) === 1 ? 'team' : 'teams'}
                        </span>
                      </div>
                    </td>

                    {/* GitHub */}
                    <td className="py-3.5 px-4 hidden lg:table-cell">
                      {member.githubConnected ? (
                        <span className="inline-flex items-center gap-1.5 text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-md font-semibold text-[11px]">
                          <i className="fa-brands fa-github text-xs"></i>
                          <span>Connected</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 text-slate-500 text-[11px]">
                          <i className="fa-brands fa-github text-xs opacity-40"></i>
                          <span>Not Connected</span>
                        </span>
                      )}
                    </td>

                    {/* Last Active */}
                    <td className="py-3.5 px-4 hidden sm:table-cell text-slate-400 text-[11px]">
                      {formatRelativeTime(member.lastSeen)}
                    </td>

                    {/* Status */}
                    <td className="py-3.5 px-4 hidden sm:table-cell">
                      <div className="flex items-center gap-1.5">
                        <span
                          className={`w-2 h-2 rounded-full ${
                            member.status === 'Active'
                              ? 'bg-emerald-400'
                              : 'bg-slate-500'
                          }`}
                        ></span>
                        <span className="text-[11px] font-medium text-slate-300">
                          {member.status || 'Active'}
                        </span>
                      </div>
                    </td>

                    {/* Actions */}
                    <td
                      className="py-3.5 px-4 text-right"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => onViewMember && onViewMember(member)}
                          title="View member profile & activity"
                          className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-white hover:bg-[#1f2a44] transition"
                        >
                          <i className="fa-solid fa-eye text-xs"></i>
                        </button>

                        {onChangeRole && (
                          <button
                            type="button"
                            onClick={() => onChangeRole(member)}
                            title="Change role"
                            className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-purple-400 hover:bg-[#1f2a44] transition"
                          >
                            <i className="fa-solid fa-user-shield text-xs"></i>
                          </button>
                        )}

                        {onRemoveMember && !member.isCurrentUser && (
                          <button
                            type="button"
                            onClick={() => onRemoveMember(member)}
                            title="Remove member"
                            className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition"
                          >
                            <i className="fa-solid fa-trash-can text-xs"></i>
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <td colSpan="8" className="py-12 text-center text-slate-400">
                  <div className="flex flex-col items-center justify-center">
                    <i className="fa-solid fa-user-group text-3xl text-slate-600 mb-3"></i>
                    <p className="text-sm font-semibold text-slate-300 mb-1">
                      No team members found
                    </p>
                    <p className="text-xs text-slate-500">
                      {searchQuery
                        ? 'Try adjusting your search query or role filter.'
                        : 'Add members to collaborate across your projects.'}
                    </p>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
