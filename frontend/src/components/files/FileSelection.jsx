import React from 'react';

export default function FileSelection({
  selectedCount = 0,
  totalCount = 0,
  onSelectAll,
  onClearSelection,
  onCopySelected,
  onCutSelected,
  onDeleteSelected,
  onDownloadSelected,
  canDelete = true
}) {
  if (selectedCount === 0) return null;

  return (
    <div className="flex items-center justify-between gap-2 px-3 py-1.5 bg-purple-950/40 border border-purple-500/30 rounded-xl text-xs text-purple-200 animate-fade-in flex-wrap shrink-0">
      <div className="flex items-center gap-2 font-semibold">
        <span className="w-2 h-2 rounded-full bg-purple-400 animate-pulse"></span>
        <span>
          {selectedCount} item{selectedCount > 1 ? 's' : ''} selected
        </span>
      </div>

      <div className="flex items-center gap-1.5 flex-wrap">
        {onSelectAll && selectedCount < totalCount && (
          <button
            type="button"
            onClick={onSelectAll}
            className="px-2 py-0.5 rounded text-[11px] font-bold text-slate-300 hover:text-white hover:bg-purple-900/40 transition"
          >
            Select All
          </button>
        )}

        {onClearSelection && (
          <button
            type="button"
            onClick={onClearSelection}
            className="px-2 py-0.5 rounded text-[11px] font-bold text-slate-300 hover:text-white hover:bg-purple-900/40 transition"
          >
            Clear
          </button>
        )}

        <div className="h-3 w-px bg-purple-500/30 mx-1"></div>

        {onCopySelected && (
          <button
            type="button"
            title="Copy selected"
            onClick={onCopySelected}
            className="px-2 py-0.5 bg-purple-600 hover:bg-purple-500 text-white rounded text-[11px] font-bold transition flex items-center gap-1 shadow-sm active:scale-95"
          >
            <i className="fa-solid fa-copy text-[10px]"></i>
            <span>Copy</span>
          </button>
        )}

        {onCutSelected && (
          <button
            type="button"
            title="Move / Cut selected"
            onClick={onCutSelected}
            className="px-2 py-0.5 bg-[#1f283e] hover:bg-[#2b3754] text-slate-200 rounded text-[11px] font-bold transition flex items-center gap-1 active:scale-95"
          >
            <i className="fa-solid fa-scissors text-[10px]"></i>
            <span>Move</span>
          </button>
        )}

        {onDownloadSelected && (
          <button
            type="button"
            title="Download selected"
            onClick={onDownloadSelected}
            className="px-2 py-0.5 bg-[#1f283e] hover:bg-[#2b3754] text-slate-200 rounded text-[11px] font-bold transition flex items-center gap-1 active:scale-95"
          >
            <i className="fa-solid fa-download text-[10px]"></i>
            <span>Download</span>
          </button>
        )}

        {canDelete && onDeleteSelected && (
          <button
            type="button"
            title="Delete selected"
            onClick={onDeleteSelected}
            className="px-2 py-0.5 bg-rose-600/30 hover:bg-rose-600/50 text-rose-200 rounded text-[11px] font-bold transition flex items-center gap-1 active:scale-95"
          >
            <i className="fa-solid fa-trash text-[10px]"></i>
            <span>Delete</span>
          </button>
        )}
      </div>
    </div>
  );
}
