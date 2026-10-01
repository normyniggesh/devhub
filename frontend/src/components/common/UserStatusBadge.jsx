import React from 'react';

/**
 * Reusable UserStatusBadge component for account status and email verification status.
 */
export default function UserStatusBadge({ type = 'status', value, verified }) {
  if (type === 'verification') {
    const isVerified = verified !== undefined ? verified : Boolean(value);
    if (isVerified) {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-emerald-500/10 border border-emerald-500/25 text-emerald-400">
          <i className="fa-solid fa-circle-check text-[10px]"></i>
          <span>Verified</span>
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-amber-500/10 border border-amber-500/25 text-amber-400">
        <i className="fa-solid fa-clock text-[10px]"></i>
        <span>Unverified</span>
      </span>
    );
  }

  // Account Status (Active | Deactivated)
  const isActive = (value || 'Active') === 'Active';
  if (isActive) {
    return (
      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-emerald-500/10 border border-emerald-500/25 text-emerald-400">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
        <span>Active</span>
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-rose-500/10 border border-rose-500/25 text-rose-400">
      <span className="w-1.5 h-1.5 rounded-full bg-rose-400"></span>
      <span>Deactivated</span>
    </span>
  );
}
