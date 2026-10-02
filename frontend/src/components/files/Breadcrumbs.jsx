import React from 'react';

export default function Breadcrumbs({
  items = [],
  onNavigate,
  onGoUp,
  rootName = 'Root',
  rootIcon = 'fa-folder',
  className = ''
}) {
  const canGoUp = items.length > 0;

  return (
    <div className={`flex items-center gap-1 text-xs text-slate-300 overflow-x-auto hide-scrollbar py-1 ${className}`}>
      {/* Up Button */}
      {canGoUp && (
        <button
          type="button"
          onClick={onGoUp}
          title="Go to parent folder"
          className="w-6 h-6 rounded-md flex items-center justify-center text-slate-400 hover:text-white hover:bg-[#1f2a44] transition shrink-0"
        >
          <i className="fa-solid fa-arrow-up text-[10px]"></i>
        </button>
      )}

      {/* Root crumb */}
      <button
        type="button"
        onClick={() => onNavigate(null, -1)}
        className={`flex items-center gap-1.5 px-2 py-1 rounded-md transition font-semibold shrink-0 ${
          items.length === 0
            ? 'text-white bg-[#192238] shadow-sm'
            : 'text-slate-400 hover:text-white hover:bg-[#161d2f]'
        }`}
      >
        <i className={`fa-solid ${rootIcon} text-[11px] opacity-80`}></i>
        <span className="truncate max-w-[120px]">{rootName}</span>
      </button>

      {/* Path crumbs */}
      {items.map((crumb, idx) => {
        const isLast = idx === items.length - 1;
        return (
          <React.Fragment key={crumb.id || idx}>
            <span className="text-slate-600 shrink-0 text-[10px]">/</span>
            <button
              type="button"
              onClick={() => !isLast && onNavigate(crumb, idx)}
              disabled={isLast}
              className={`flex items-center gap-1 px-2 py-1 rounded-md transition font-semibold shrink-0 ${
                isLast
                  ? 'text-white bg-[#192238] shadow-sm cursor-default'
                  : 'text-slate-400 hover:text-white hover:bg-[#161d2f]'
              }`}
            >
              <span className="truncate max-w-[130px]">{crumb.name}</span>
            </button>
          </React.Fragment>
        );
      })}
    </div>
  );
}
