import React from 'react';
import Avatar from '../common/Avatar';
import { formatDate } from '../../utils/formatting';

export default function ActivityFeed({ activities = [], loading = false, error = null, emptyMessage = "No recent activity.", variant = 'default' }) {
  if (loading) {
    return <div className="text-center py-6 text-xs font-bold text-slate-500 bg-[#161d2f] rounded-xl border border-[#1f2a44] border-dashed">Loading activity...</div>;
  }
  
  if (error) {
    return <div className="text-center py-6 text-xs font-bold text-rose-500 bg-rose-500/10 rounded-xl border border-rose-500/20">{error}</div>;
  }
  
  if (!activities || activities.length === 0) {
    return <div className="text-center py-6 text-xs font-bold text-slate-500 bg-[#161d2f] rounded-xl border border-[#1f2a44] border-dashed">{emptyMessage}</div>;
  }

  if (variant === 'timeline') {
    return (
      <div className="flex flex-col gap-0 relative ml-2">
        <div className="absolute left-[7px] top-2 bottom-2 w-px bg-[#1f2a44] z-0"></div>
        {activities.map((a) => {
          const meta = a.metadata || {};
          const isCompletion = a.action === 'Completed' || a.action === 'Resolved';
          const isCreation = a.action === 'Created';
          return (
            <div key={a.id} className="flex gap-4 relative z-10 mb-4 last:mb-0 group">
              <div className={`w-4 h-4 rounded-full bg-[#0f1422] border-[3px] flex shrink-0 mt-0.5 transition ${isCompletion ? 'border-emerald-500' : isCreation ? 'border-purple-500' : 'border-blue-500'}`}></div>
              <div className="min-w-0">
                <p className="text-xs text-slate-300 leading-snug">
                  <span className="font-bold text-white">{a.user?.name || 'Someone'}</span> 
                  {' '}{a.action?.toLowerCase()} {a.entityType?.toLowerCase() || 'item'}{' '}
                  {(meta.title || meta.name) && <span className="font-bold text-slate-200">"{meta.title || meta.name}"</span>}
                </p>
                <span className="text-[9px] font-bold text-slate-500 mt-0.5 block">{formatDate(a.createdAt, { format: 'datetime' })}</span>
              </div>
            </div>
          )
        })}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {activities.map(act => (
        <div key={act.id} className="flex gap-3 border-b border-[#1f2a44] pb-4 last:border-0 last:pb-0">
          <Avatar user={act.user} />
          <div className="min-w-0 flex-1">
            <p className="text-[11px] text-slate-300 leading-snug">
              <span className="font-bold text-white">{act.user?.name || 'Someone'}</span> {act.action?.toLowerCase() || 'acted on'} {act.entityType?.toLowerCase() || 'item'}
            </p>
            {act.metadata?.title || act.metadata?.name ? (
              <p className="text-[11px] font-bold text-purple-400 truncate mt-0.5">{act.metadata.title || act.metadata.name}</p>
            ) : act.details ? (
              <p className="text-[11px] text-slate-400 truncate mt-0.5">{act.details}</p>
            ) : null}
            <p className="text-[9px] font-bold text-slate-500 mt-1">{formatDate(act.createdAt, { format: 'datetime' })}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
