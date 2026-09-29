import React from 'react';
import Avatar from '../common/Avatar';
import { formatDate } from '../../utils/formatting';
import { useStore } from '../../store';

const getActionIcon = (action) => {
  switch (action) {
    case 'Completed':
    case 'Resolved':
      return { icon: 'fa-solid fa-circle-check', color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20' };
    case 'Created':
      return { icon: 'fa-solid fa-plus', color: 'text-purple-400 bg-purple-500/10 border-purple-500/20' };
    case 'Uploaded':
      return { icon: 'fa-solid fa-upload', color: 'text-indigo-400 bg-indigo-500/10 border-indigo-500/20' };
    case 'Deleted':
    case 'Removed':
      return { icon: 'fa-solid fa-trash', color: 'text-rose-400 bg-rose-500/10 border-rose-500/20' };
    case 'Updated':
    case 'Reopened':
      return { icon: 'fa-solid fa-rotate', color: 'text-blue-400 bg-blue-500/10 border-blue-500/20' };
    case 'Connected':
    case 'Imported':
      return { icon: 'fa-solid fa-plug', color: 'text-cyan-400 bg-cyan-500/10 border-cyan-500/20' };
    case 'Merged':
    case 'Deployed':
      return { icon: 'fa-solid fa-rocket', color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20' };
    default:
      return { icon: 'fa-solid fa-bolt', color: 'text-slate-400 bg-slate-500/10 border-slate-500/20' };
  }
};

export default function ActivityFeed({
  activities = [],
  loading = false,
  error = null,
  emptyMessage = "No recent activity recorded.",
  variant = 'default',
  canViewAll = false,
  isViewingAll = false,
  onToggleViewAll = null,
  maxHeight = null
}) {
  const { currentUser } = useStore();
  const isAdmin = canViewAll || currentUser?.role === 'Admin';

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-10 text-xs font-bold text-slate-500 bg-[#161d2f]/50 rounded-xl border border-[#1f2a44] border-dashed">
        <i className="fa-solid fa-circle-notch fa-spin text-purple-400 text-lg mb-2"></i>
        Loading activity feed...
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-6 text-xs font-bold text-rose-500 bg-rose-500/10 rounded-xl border border-rose-500/20">
        <i className="fa-solid fa-triangle-exclamation mr-1"></i> {error}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Admin View All Controls */}
      {isAdmin && onToggleViewAll && (
        <div className="flex items-center justify-between pb-3 mb-2 border-b border-[#1f2a44]">
          <div className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-400">
            <span className="w-1.5 h-1.5 rounded-full bg-purple-400"></span>
            {isViewingAll ? 'Viewing All Activity (Admin Mode)' : 'Viewing Project Activity'}
          </div>
          <button
            onClick={onToggleViewAll}
            className={`text-[10px] font-bold px-2.5 py-1 rounded-md transition flex items-center gap-1.5 border ${
              isViewingAll
                ? 'bg-purple-600 text-white border-purple-500 shadow-sm'
                : 'bg-[#161d2f] text-slate-300 border-[#232d47] hover:text-white hover:bg-[#1a2333]'
            }`}
          >
            <i className={`fa-solid ${isViewingAll ? 'fa-eye' : 'fa-shield-halved'}`}></i>
            {isViewingAll ? 'Show Major Only' : 'View All (Admin)'}
          </button>
        </div>
      )}

      {(!activities || activities.length === 0) ? (
        <div className="flex flex-col items-center justify-center py-12 text-center bg-[#101524]/60 border border-dashed border-[#1f2a44] rounded-xl p-6">
          <i className="fa-solid fa-clock-rotate-left text-2xl text-slate-600 mb-2"></i>
          <p className="text-xs font-semibold text-slate-400 mb-1">{emptyMessage}</p>
          <p className="text-[10px] text-slate-500">Major project updates, task completions, and files will show up here.</p>
        </div>
      ) : variant === 'timeline' ? (
        <div className="flex flex-col gap-0 relative ml-2">
          <div className="absolute left-[7px] top-2 bottom-2 w-px bg-[#1f2a44] z-0"></div>
          {activities.map((a) => {
            const meta = a.metadata || {};
            const { color } = getActionIcon(a.action);
            return (
              <div key={a.id} className="flex gap-4 relative z-10 mb-4 last:mb-0 group">
                <div className={`w-4 h-4 rounded-full bg-[#0f1422] border-2 flex shrink-0 mt-0.5 transition ${color}`}></div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-slate-300 leading-snug">
                    <span className="font-bold text-white">{a.user?.name || 'Someone'}</span>{' '}
                    <span className="text-slate-400">{a.action?.toLowerCase()}</span>{' '}
                    <span className="text-purple-400 font-semibold">{a.entityType?.toLowerCase() || 'item'}</span>{' '}
                    {(meta.title || meta.name) && (
                      <span className="font-bold text-slate-100">"{meta.title || meta.name}"</span>
                    )}
                  </p>
                  <span className="text-[9px] font-bold text-slate-500 mt-0.5 block">
                    {formatDate(a.createdAt, { format: 'datetime' })}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className={`flex flex-col gap-3 ${maxHeight ? `overflow-y-auto pr-1` : ''}`} style={maxHeight ? { maxHeight } : {}}>
          {activities.map((act) => {
            const meta = act.metadata || {};
            const actionStyle = getActionIcon(act.action);
            const title = meta.title || meta.name || act.details;

            return (
              <div
                key={act.id}
                className="flex items-start gap-3 p-2.5 rounded-xl bg-[#111728]/40 hover:bg-[#151c2d] border border-transparent hover:border-[#1f2a44] transition-colors"
              >
                <Avatar user={act.user} size="sm" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-xs font-bold text-white hover:text-purple-400 transition cursor-default">
                      {act.user?.name || 'Someone'}
                    </span>
                    <span className={`text-[9px] font-bold px-1.5 py-0.2 rounded border ${actionStyle.color}`}>
                      {act.action}
                    </span>
                    <span className="text-[10px] text-slate-400">
                      {act.entityType}
                    </span>
                  </div>
                  {title && (
                    <p className="text-xs font-semibold text-slate-200 truncate mt-1">
                      {title}
                    </p>
                  )}
                  <div className="flex items-center gap-2 mt-1 text-[9px] font-semibold text-slate-500">
                    <span>{formatDate(act.createdAt, { format: 'datetime' })}</span>
                    {meta.status && (
                      <>
                        <span>•</span>
                        <span className="text-slate-400">Status: {meta.status}</span>
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
