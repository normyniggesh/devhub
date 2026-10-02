import React from 'react';

/**
 * Compact summary row for the Team page.
 * Displays real stats: Team Members, Shared Projects, Admins, and Pending Invites.
 */
export default function MemberSummary({ summary = {} }) {
  const stats = [
    {
      id: 'members',
      label: 'Team Members',
      value: summary.totalMembers ?? 0,
      icon: 'fa-solid fa-users',
      color: 'text-purple-400',
      bg: 'bg-purple-500/10'
    },
    {
      id: 'projects',
      label: 'Shared Projects',
      value: summary.sharedProjects ?? 0,
      icon: 'fa-solid fa-folder-tree',
      color: 'text-blue-400',
      bg: 'bg-blue-500/10'
    },
    {
      id: 'admins',
      label: 'Admins',
      value: summary.admins ?? 0,
      icon: 'fa-solid fa-shield-halved',
      color: 'text-emerald-400',
      bg: 'bg-emerald-500/10'
    },
    {
      id: 'invites',
      label: 'Pending Invites',
      value: summary.pendingInvites ?? 0,
      icon: 'fa-solid fa-envelope-open-text',
      color: 'text-amber-400',
      bg: 'bg-amber-500/10'
    }
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
      {stats.map((stat) => (
        <div
          key={stat.id}
          className="bg-[#0f1422] border border-[#192238] rounded-xl p-3.5 md:p-4 flex items-center justify-between shadow-sm transition hover:border-[#283552]"
        >
          <div>
            <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">
              {stat.label}
            </div>
            <div className="text-xl md:text-2xl font-black text-white tracking-tight">
              {stat.value}
            </div>
          </div>
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border border-white/5 ${stat.bg}`}>
            <i className={`${stat.icon} ${stat.color} text-base`}></i>
          </div>
        </div>
      ))}
    </div>
  );
}
