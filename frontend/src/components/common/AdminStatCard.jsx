import React from 'react';

/**
 * Reusable AdminStatCard for Admin Overview metrics
 */
export default function AdminStatCard({
  icon = 'fa-chart-simple',
  label,
  value,
  subtext,
  colorClass = 'text-indigo-400',
  bgClass = 'bg-indigo-500/10 border-indigo-500/20'
}) {
  return (
    <div className="bg-[#121624] border border-[#1e2538] hover:border-[#2d3a54] rounded-2xl p-5 shadow-sm transition-all duration-200">
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">{label}</p>
          <p className="text-2xl font-extrabold text-white tracking-tight">{value ?? 0}</p>
          {subtext && <p className="text-[11px] text-slate-500 font-medium">{subtext}</p>}
        </div>
        <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 border ${bgClass}`}>
          <i className={`fa-solid ${icon} text-lg ${colorClass}`}></i>
        </div>
      </div>
    </div>
  );
}
