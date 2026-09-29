/**
 * Shared color utilities for status and priority badges across DEVHUB.
 * Single source of truth — do not duplicate these in page components.
 */

/**
 * Returns a Tailwind bg-color class for a status dot/indicator.
 * Used by Tasks, PullRequests, Deployments, Calendar, ProjectDetail, etc.
 */
export const getStatusDotColor = (status) => {
  switch (status) {
    case 'To Do':
    case 'Open':
    case 'Draft':
      return 'bg-slate-400';
    case 'In Progress':
    case 'Active':
    case 'Building':
      return 'bg-blue-500';
    case 'In Review':
    case 'Review':
      return 'bg-purple-500';
    case 'Done':
    case 'Completed':
    case 'Resolved':
    case 'Closed':
    case 'Merged':
    case 'Deployed':
    case 'Success':
      return 'bg-emerald-500';
    case 'Blocked':
    case 'Failed':
    case 'Rejected':
      return 'bg-rose-500';
    case 'Skipped':
    case 'On Hold':
      return 'bg-amber-500';
    default:
      return 'bg-slate-500';
  }
};

/**
 * Returns Tailwind text/bg/border classes for a status badge.
 * Used by PullRequests, Deployments status badges.
 */
export const getStatusBadgeColor = (status) => {
  switch (status) {
    case 'Open':
    case 'Success':
    case 'Deployed':
      return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
    case 'Merged':
      return 'bg-purple-500/10 text-purple-400 border-purple-500/20';
    case 'Closed':
    case 'Failed':
    case 'Rejected':
    case 'Rollback':
      return 'bg-red-500/10 text-red-400 border-red-500/20';
    case 'In Review':
    case 'Building':
    case 'Pending':
      return 'bg-amber-500/10 text-amber-400 border-amber-500/20';
    default:
      return 'bg-slate-500/10 text-slate-400 border-slate-500/20';
  }
};

/**
 * Returns Tailwind text/bg/border classes for a priority badge.
 */
export const getPriorityColor = (priority) => {
  switch (priority) {
    case 'Low':
      return 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20';
    case 'Medium':
      return 'text-amber-400 bg-amber-400/10 border-amber-400/20';
    case 'High':
      return 'text-red-400 bg-red-400/10 border-red-400/20';
    case 'Urgent':
    case 'Critical':
      return 'text-rose-500 bg-rose-500/10 border-rose-500/20 shadow-[0_0_8px_rgba(244,63,94,0.4)]';
    default:
      return 'text-slate-400 bg-slate-400/10 border-slate-400/20';
  }
};
