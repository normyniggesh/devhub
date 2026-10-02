import React from 'react';

export default function FileToolbar({
  searchQuery,
  onSearchChange,
  sortConfig,
  onSortChange,
  onCreateFolder,
  onUploadFile,
  uploadLabel = 'Upload',
  onPaste,
  canPaste = false,
  pasteCount = 0,
  onRefresh,
  selectedCount = 0,
  onCopySelected,
  onCutSelected,
  canCreateFolder = true,
  canUpload = true,
  className = ''
}) {
  return (
    <div className={`flex items-center justify-between gap-1.5 flex-wrap w-full py-1 text-xs ${className}`}>
      {/* Primary Action Buttons */}
      <div className="flex items-center gap-1.5 flex-wrap">
        {/* + Folder */}
        {canCreateFolder && onCreateFolder && (
          <button
            type="button"
            onClick={onCreateFolder}
            className="px-2.5 py-1 bg-[#141b2d] hover:bg-[#1f2a44] text-slate-200 hover:text-white rounded-lg text-[11px] font-bold transition flex items-center gap-1.5 border border-[#1f2a44] shadow-sm active:scale-95"
            title="Create new folder"
          >
            <i className="fa-solid fa-folder-plus text-amber-400 text-[10px]"></i>
            <span>+ Folder</span>
          </button>
        )}

        {/* Upload / Add Location */}
        {canUpload && onUploadFile && (
          <button
            type="button"
            onClick={onUploadFile}
            className="px-2.5 py-1 bg-[#141b2d] hover:bg-[#1f2a44] text-slate-200 hover:text-white rounded-lg text-[11px] font-bold transition flex items-center gap-1.5 border border-[#1f2a44] shadow-sm active:scale-95"
            title={uploadLabel}
          >
            <i className="fa-solid fa-cloud-arrow-up text-sky-400 text-[10px]"></i>
            <span>{uploadLabel}</span>
          </button>
        )}

        {/* Copy (active when items selected) */}
        {selectedCount > 0 && onCopySelected && (
          <button
            type="button"
            onClick={onCopySelected}
            className="px-2.5 py-1 bg-purple-600/30 hover:bg-purple-600/50 text-purple-200 border border-purple-500/40 rounded-lg text-[11px] font-bold transition flex items-center gap-1.5 shadow-sm active:scale-95"
            title="Copy selected items"
          >
            <i className="fa-solid fa-copy text-[10px]"></i>
            <span>Copy ({selectedCount})</span>
          </button>
        )}

        {/* Move (active when items selected) */}
        {selectedCount > 0 && onCutSelected && (
          <button
            type="button"
            onClick={onCutSelected}
            className="px-2.5 py-1 bg-[#141b2d] hover:bg-[#1f2a44] text-slate-300 border border-[#1f2a44] rounded-lg text-[11px] font-bold transition flex items-center gap-1.5 shadow-sm active:scale-95"
            title="Move selected items"
          >
            <i className="fa-solid fa-scissors text-[10px]"></i>
            <span>Move</span>
          </button>
        )}

        {/* Paste (active when clipboard has items) */}
        {canPaste && onPaste && (
          <button
            type="button"
            onClick={onPaste}
            className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-[11px] font-bold transition flex items-center gap-1.5 shadow-lg shadow-emerald-950/40 active:scale-95 animate-fade-in"
            title="Paste items into current directory"
          >
            <i className="fa-solid fa-paste text-[10px]"></i>
            <span>Paste ({pasteCount})</span>
          </button>
        )}
      </div>

      {/* Search & Sort Controls */}
      <div className="flex items-center gap-1.5 shrink-0 ml-auto">
        {/* Compact Search */}
        <div className="relative">
          <input
            type="text"
            placeholder="Search..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="w-24 sm:w-28 focus:w-36 bg-[#121624] border border-[#1e2538] focus:border-indigo-500 rounded-lg pl-6 pr-5 py-1 text-[11px] text-white placeholder-slate-500 focus:outline-none transition-all shadow-inner"
          />
          <i className="fa-solid fa-magnifying-glass absolute left-2 top-1/2 -translate-y-1/2 text-slate-500 text-[10px]"></i>
          {searchQuery && (
            <button
              type="button"
              onClick={() => onSearchChange('')}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
            >
              <i className="fa-solid fa-xmark text-[9px]"></i>
            </button>
          )}
        </div>

        {/* Sort */}
        <select
          value={`${sortConfig.key}_${sortConfig.direction}`}
          onChange={(e) => {
            const [key, direction] = e.target.value.split('_');
            onSortChange({ key, direction });
          }}
          className="bg-[#121624] border border-[#1e2538] text-slate-300 text-[11px] rounded-lg px-2 py-1 font-medium focus:outline-none focus:border-indigo-500 cursor-pointer"
          title="Sort files"
        >
          <option value="name_asc">Name (A-Z)</option>
          <option value="name_desc">Name (Z-A)</option>
          <option value="date_desc">Newest</option>
          <option value="date_asc">Oldest</option>
          <option value="size_desc">Largest</option>
          <option value="size_asc">Smallest</option>
        </select>

        {/* Refresh */}
        {onRefresh && (
          <button
            type="button"
            onClick={onRefresh}
            title="Refresh list"
            className="w-6 h-6 rounded-lg bg-[#121624] hover:bg-[#1a2336] text-slate-400 hover:text-white border border-[#1e2538] flex items-center justify-center transition shrink-0"
          >
            <i className="fa-solid fa-rotate-right text-[10px]"></i>
          </button>
        )}
      </div>
    </div>
  );
}
