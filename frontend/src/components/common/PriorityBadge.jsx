import React from 'react';

export default function PriorityBadge({ priority }) {
  const getColors = (p) => {
    switch (p) {
      case 'Low': 
        return 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20 dot-bg-emerald-400';
      case 'Medium': 
        return 'text-amber-400 bg-amber-400/10 border-amber-400/20 dot-bg-amber-400';
      case 'High': 
        return 'text-red-400 bg-red-400/10 border-red-400/20 dot-bg-red-400';
      case 'Urgent': 
      case 'Critical':
        return 'text-rose-500 bg-rose-500/10 border-rose-500/20 shadow-[0_0_8px_rgba(244,63,94,0.4)] dot-bg-rose-500';
      default: 
        return 'text-slate-400 bg-slate-400/10 border-slate-400/20 dot-bg-slate-400';
    }
  };

  const colors = getColors(priority);
  const containerClasses = colors.split(' ').filter(c => !c.startsWith('dot-')).join(' ');
  
  return (
    <span className={`px-2 py-1 rounded border text-[10px] font-bold inline-block ${containerClasses}`}>
      {priority || 'None'}
    </span>
  );
}
