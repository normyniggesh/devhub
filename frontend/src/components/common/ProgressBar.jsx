import React from 'react';

export default function ProgressBar({ value = 0, max = 100, colorClass = "bg-purple-500", showLabel = true, labelStyle = "w-8 text-right shrink-0" }) {
  const safeValue = isNaN(value) ? 0 : value;
  const safeMax = isNaN(max) || max <= 0 ? 100 : max;
  const pct = Math.min(Math.max((safeValue / safeMax) * 100, 0), 100);

  return (
    <div className="flex items-center gap-4 w-full">
      <div className="flex-1">
        <div className="h-1.5 w-full bg-[#161d2f] rounded-full overflow-hidden">
          <div className={`h-full ${colorClass} rounded-full transition-all duration-500`} style={{ width: `${pct}%` }}></div>
        </div>
      </div>
      {showLabel && (
        <span className={`text-xs font-bold text-slate-300 ${labelStyle}`}>
          {Math.round(pct)}%
        </span>
      )}
    </div>
  );
}
