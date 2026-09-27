import React from 'react';

export default function Tabs({ tabs, activeTab, onChange }) {
  return (
    <div className="flex items-center gap-1 p-1 bg-[#0f1422] border border-[#192238] rounded-xl overflow-x-auto hide-scrollbar shadow-sm w-fit max-w-full">
      {tabs.map(tab => {
        const id = typeof tab === 'string' ? tab : tab.id;
        const label = typeof tab === 'string' ? tab : tab.label;
        const icon = typeof tab === 'string' ? null : tab.icon;
        
        return (
          <button 
            key={id}
            onClick={() => onChange(id)}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition flex items-center gap-2 whitespace-nowrap ${activeTab === id ? 'bg-[#161d2f] text-white shadow-sm border border-[#1f2a44]' : 'text-slate-500 hover:text-slate-300'}`}
          >
            {icon && <i className={`fa-solid ${icon} ${activeTab === id ? 'text-purple-500' : ''}`}></i>}
            {label}
          </button>
        );
      })}
    </div>
  );
}
