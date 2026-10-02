import React from 'react';

export default function FileToolbar({
  searchQuery,
  onSearchChange,
  sortConfig,
  onSortChange,
  onCreateFolder,
  onUploadFile,
  onPaste,
  canPaste = false,
  pasteCount = 0,
  onRefresh,
  selectedCount = 0,
  totalCount = 0,
  onSelectAll,
  onClearSelection,
  onCopySelected,
  onCutSelected,
  onDeleteSelected,
  onDownloadSelected,
  canCreateFolder = true,
  canUpload = true,
  canDelete = true,
  className = ''
}) {
  return (
    <div className={`flex flex-col gap-2.5 ${className}`}>
      {/* Search and Sort row */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        {/* Search */}
        <div className="relative flex-1 min-w-[140px]">
          <i className="fa-solid fa-magnifying-glass absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-xs"></i>
          <input
            type="text"
            placeholder="Search files & folders..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="w-full bg-[#121624] border border-[#1e2538] focus:border-indigo-500 rounded-xl pl-8 pr-7 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none transition shadow-inner"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => onSearchChange('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
            >
              <i className="fa-solid fa-xmark text-[10px]"></i>
            </button>
          )}
        </div>

        {/* Sort selector */}
        <div className="flex items-center gap-1.5 shrink-0">
          <select
            value={`${sortConfig.key}_${sortConfig.direction}`}
            onChange={(e) => {
              const [key, direction] = e.target.value.split('_');
              onSortChange({ key, direction });
            }}
            className="bg-[#121624] border border-[#1e2538] text-slate-300 text-[11px] rounded-xl px-2.5 py-1.5 font-medium focus:outline-none focus:border-indigo-500 cursor-pointer"
          >
            <option value="name_asc">Name (A-Z)</option>
            <option value="name_desc">Name (Z-A)</option>
            <option value="date_desc">Newest First</option>
            <option value="date_asc">Oldest First</option>
            <option value="size_desc">Size (Largest)</option>
            <option value="size_asc">Size (Smallest)</option>
          </select>

          {/* Refresh */}
          {onRefresh && (
            <button
              type="button"
              onClick={onRefresh}
              title="Refresh"
              className="w-7 h-7 rounded-xl bg-[#121624] hover:bg-[#1a2336] text-slate-400 hover:text-white border border-[#1e2538] flex items-center justify-center transition shrink-0"
            >
              <i className="fa-solid fa-arrow-rotate-right text-[10px]"></i>
            </button>
          )}
        </div>
      </div>

      {/* Action buttons row */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-1.5 flex-wrap">
          {/* New Folder */}
          {canCreateFolder && onCreateFolder && (
            <button
              type="button"
              onClick={onCreateFolder}
              className="px-2.5 py-1.5 bg-[#161d2f] hover:bg-[#1f2a44] text-slate-200 hover:text-white rounded-xl text-[11px] font-bold transition flex items-center gap-1.5 border border-[#1f2a44] shadow-sm"
            >
              <i className="fa-solid fa-folder-plus text-amber-400 text-[10px]"></i>
              <span>New Folder</span>
            </button>
          )}

          {/* Upload File */}
          {canUpload && onUploadFile && (
            <button
              type="button"
              onClick={onUploadFile}
              className="px-2.5 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-[11px] font-bold transition flex items-center gap-1.5 shadow-sm shadow-indigo-950/40"
            >
              <i className="fa-solid fa-cloud-arrow-up text-[10px]"></i>
              <span>Upload</span>
            </button>
          )}

          {/* Paste button (Enabled when clipboard has items) */}
          {onPaste && (
            <button
              type="button"
              onClick={onPaste}
              disabled={!canPaste}
              title={canPaste ? `Paste ${pasteCount} item(s) here` : 'Clipboard is empty'}
              className={`px-2.5 py-1.5 rounded-xl text-[11px] font-bold transition flex items-center gap-1.5 border ${
                canPaste
                  ? 'bg-emerald-600 hover:bg-emerald-500 text-white border-emerald-500 shadow-md shadow-emerald-950/40'
                  : 'bg-[#121624] text-slate-500 border-[#1e2538] cursor-not-allowed opacity-50'
              }`}
            >
              <i className="fa-solid fa-paste text-[10px]"></i>
              <span>Paste {canPaste && pasteCount > 0 ? `(${pasteCount})` : ''}</span>
            </button>
          )}
        </div>

        {/* Select All toggle if totalCount > 0 */}
        {totalCount > 0 && onSelectAll && onClearSelection && (
          <div className="flex items-center gap-1 text-[11px] text-slate-400 ml-auto">
            {selectedCount > 0 ? (
              <button
                type="button"
                onClick={onClearSelection}
                className="text-slate-400 hover:text-white text-[10px] underline"
              >
                Clear ({selectedCount})
              </button>
            ) : (
              <button
                type="button"
                onClick={onSelectAll}
                className="text-slate-400 hover:text-white text-[10px] underline"
              >
                Select All
              </button>
            )}
          </div>
        )}
      </div>

      {/* Multi-selection banner when items are selected */}
      {selectedCount > 0 && (
        <div className="flex items-center justify-between gap-2 p-2 bg-indigo-950/40 border border-indigo-500/30 rounded-xl text-xs text-indigo-200">
          <div className="flex items-center gap-2">
            <span className="w-5 h-5 rounded-md bg-indigo-500/20 text-indigo-300 flex items-center justify-center font-bold text-[10px]">
              {selectedCount}
            </span>
            <span className="font-semibold text-[11px]">
              {selectedCount} item{selectedCount !== 1 ? 's' : ''} selected
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            {onCopySelected && (
              <button
                type="button"
                onClick={onCopySelected}
                className="px-2 py-1 bg-indigo-600/30 hover:bg-indigo-600/50 text-indigo-200 rounded-lg text-[10px] font-bold transition flex items-center gap-1"
                title="Copy selected items to clipboard"
              >
                <i className="fa-solid fa-copy text-[9px]"></i>
                <span>Copy</span>
              </button>
            )}

            {onCutSelected && (
              <button
                type="button"
                onClick={onCutSelected}
                className="px-2 py-1 bg-amber-600/30 hover:bg-amber-600/50 text-amber-200 rounded-lg text-[10px] font-bold transition flex items-center gap-1"
                title="Move/cut selected items to clipboard"
              >
                <i className="fa-solid fa-scissors text-[9px]"></i>
                <span>Move</span>
              </button>
            )}

            {onDownloadSelected && (
              <button
                type="button"
                onClick={onDownloadSelected}
                className="px-2 py-1 bg-emerald-600/30 hover:bg-emerald-600/50 text-emerald-200 rounded-lg text-[10px] font-bold transition flex items-center gap-1"
                title="Download selected"
              >
                <i className="fa-solid fa-download text-[9px]"></i>
                <span>Download</span>
              </button>
            )}

            {canDelete && onDeleteSelected && (
              <button
                type="button"
                onClick={onDeleteSelected}
                className="px-2 py-1 bg-rose-600/30 hover:bg-rose-600/50 text-rose-200 rounded-lg text-[10px] font-bold transition flex items-center gap-1"
                title="Delete selected"
              >
                <i className="fa-solid fa-trash text-[9px]"></i>
                <span>Delete</span>
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
