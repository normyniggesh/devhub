import React from 'react';

export default function StatusBadge({ status, dot = true }) {
  const getColors = (s) => {
    switch (s) {
      case 'To Do': 
      case 'Open':
        return 'text-slate-300 bg-[#0f1422] border-[#1f2a44] dot-slate-400';
      case 'In Progress': 
      case 'Active':
        return 'text-blue-300 bg-[#0f1422] border-[#1f2a44] dot-blue-500';
      case 'In Review': 
        return 'text-purple-300 bg-[#0f1422] border-[#1f2a44] dot-purple-500';
      case 'Done': 
      case 'Completed':
      case 'Resolved':
      case 'Closed':
        return 'text-emerald-300 bg-[#0f1422] border-[#1f2a44] dot-emerald-500';
      case 'Blocked':
      case 'Failed':
        return 'text-rose-300 bg-[#0f1422] border-[#1f2a44] dot-rose-500';
      case 'Skipped':
        return 'text-amber-300 bg-[#0f1422] border-[#1f2a44] dot-amber-500';
      case 'Passed':
        return 'text-emerald-300 bg-[#0f1422] border-[#1f2a44] dot-emerald-500';
      default: 
        return 'text-slate-300 bg-[#0f1422] border-[#1f2a44] dot-slate-500';
    }
  };

  const colors = getColors(status);
  const bgBorderText = colors.split(' ').slice(0, 3).join(' ');
  const dotColor = colors.split(' ').find(c => c.startsWith('dot-'))?.replace('dot-', 'bg-');

  return (
    <span className={`px-2 py-1 rounded border text-[10px] font-bold flex items-center gap-1.5 w-fit ${bgBorderText}`}>
      {dot && <span className={`w-1.5 h-1.5 rounded-full ${dotColor}`}></span>}
      {status || 'Unknown'}
    </span>
  );
}
