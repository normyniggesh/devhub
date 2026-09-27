import React from 'react';

export default function StatCard({ icon, label, value, colorClass = "text-purple-400", bgClass = "bg-purple-400/10" }) {
  return (
    <div className="bg-[#0f1422] border border-[#192238] rounded-2xl p-5 shadow-sm flex items-center gap-4 transition hover:border-[#2d3a5a]">
      <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${bgClass}`}>
        <i className={`fa-solid ${icon} text-xl ${colorClass}`}></i>
      </div>
      <div>
        <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">{label}</p>
        <p className="text-2xl font-extrabold text-white">{value}</p>
      </div>
    </div>
  );
}
