import React from 'react';

export default function EmptyState({ icon, title, description, actionText, onAction, border = 'dashed', className = '' }) {
  return (
    <div className={`flex flex-col items-center justify-center p-12 bg-[#0f1422] border ${border === 'dashed' ? 'border-dashed' : ''} border-[#1f2a44] rounded-2xl min-h-[300px] ${className}`}>
      <i className={`fa-solid ${icon} text-5xl text-slate-600 mb-5`}></i>
      <h2 className="text-xl font-bold text-white mb-2">{title}</h2>
      {description && <p className="text-sm text-slate-400 mb-6 text-center max-w-md">{description}</p>}
      {actionText && onAction && (
        <button onClick={onAction} className="px-6 py-2.5 bg-[#5922cf] hover:bg-[#682ae6] text-white rounded-xl text-sm font-bold transition shadow-lg shadow-purple-900/30">
          {actionText}
        </button>
      )}
    </div>
  );
}
