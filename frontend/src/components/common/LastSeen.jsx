import React from 'react';

/**
 * Reusable LastSeen component.
 * Displays "Active now" with a green pulse dot if active in the last 10 minutes,
 * or friendly relative time otherwise.
 */
export default function LastSeen({ lastSeen, className = '' }) {
  if (!lastSeen) {
    return (
      <span className={`inline-flex items-center gap-1.5 text-xs text-slate-500 ${className}`}>
        <span className="w-2 h-2 rounded-full bg-slate-600 shrink-0"></span>
        <span>Never active</span>
      </span>
    );
  }

  const date = new Date(lastSeen);
  const now = Date.now();
  const diffMs = now - date.getTime();
  const diffMins = Math.floor(diffMs / (60 * 1000));
  const diffHours = Math.floor(diffMs / (60 * 60 * 1000));
  const diffDays = Math.floor(diffMs / (24 * 60 * 60 * 1000));

  // If within the last 10 minutes -> Active now
  if (diffMins < 10) {
    return (
      <span className={`inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-400 ${className}`}>
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
          <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
        </span>
        <span>Active now</span>
      </span>
    );
  }

  let text = '';
  if (diffMins < 60) {
    text = `${diffMins}m ago`;
  } else if (diffHours < 24) {
    text = `${diffHours}h ago`;
  } else if (diffDays === 1) {
    text = 'Yesterday';
  } else if (diffDays < 7) {
    text = `${diffDays}d ago`;
  } else {
    text = date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }

  return (
    <span className={`inline-flex items-center gap-1.5 text-xs text-slate-400 ${className}`}>
      <span className="w-2 h-2 rounded-full bg-slate-600 shrink-0"></span>
      <span>{text}</span>
    </span>
  );
}
