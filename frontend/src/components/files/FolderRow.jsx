import React, { useState } from 'react';

export default function FolderRow({
  folder,
  isSelected = false,
  onToggleSelect,
  onOpenFolder,
  onOpen,
  onDelete,
  onCopy,
  onCut,
  onDropOnFolder,
  canDelete = true,
  provider = 'local'
}) {
  const [isDragOver, setIsDragOver] = useState(false);
  const handleOpen = onOpen || onOpenFolder;

  const handleDragStart = (e) => {
    e.dataTransfer.setData('application/json', JSON.stringify({
      sourceProvider: provider,
      type: 'folder',
      item: folder
    }));
    e.dataTransfer.effectAllowed = 'copyMove';
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    if (onDropOnFolder) {
      onDropOnFolder(e, folder);
    }
  };

  return (
    <div
      draggable
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={`group flex items-center justify-between gap-2 p-2 px-2.5 rounded-xl border transition-all cursor-pointer ${
        isSelected
          ? 'bg-indigo-950/40 border-indigo-500/50 shadow-sm'
          : isDragOver
          ? 'bg-amber-950/40 border-amber-500 ring-2 ring-amber-500/30'
          : 'bg-[#121624]/60 hover:bg-[#161d2f] border-[#1b2236] hover:border-[#24314c]'
      }`}
      onClick={() => handleOpen && handleOpen(folder)}
    >
      <div className="flex items-center gap-2.5 min-w-0 flex-1">
        {/* Checkbox */}
        <input
          type="checkbox"
          checked={isSelected}
          onChange={(e) => {
            e.stopPropagation();
            onToggleSelect(folder.id || folder.name);
          }}
          onClick={(e) => e.stopPropagation()}
          className="w-3.5 h-3.5 rounded border-slate-600 bg-[#0d101a] text-indigo-600 focus:ring-0 cursor-pointer shrink-0"
        />

        {/* Folder Icon */}
        <div className="w-7 h-7 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center shrink-0">
          <i className="fa-solid fa-folder text-amber-400 text-xs"></i>
        </div>

        {/* Name */}
        <div className="min-w-0 flex-1">
          <span className="font-semibold text-xs text-white truncate block group-hover:text-amber-300 transition">
            {folder.name}
          </span>
          {folder.itemCount !== undefined && (
            <span className="text-[10px] text-slate-500">
              {folder.itemCount} item{folder.itemCount !== 1 ? 's' : ''}
            </span>
          )}
        </div>
      </div>

      {/* Quick Action buttons */}
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition shrink-0" onClick={(e) => e.stopPropagation()}>
        {onCopy && (
          <button
            type="button"
            onClick={() => onCopy(folder)}
            title="Copy folder"
            className="w-6 h-6 rounded-md flex items-center justify-center text-slate-400 hover:text-white hover:bg-[#1f2a44] transition"
          >
            <i className="fa-solid fa-copy text-[10px]"></i>
          </button>
        )}

        {onCut && (
          <button
            type="button"
            onClick={() => onCut(folder)}
            title="Move folder"
            className="w-6 h-6 rounded-md flex items-center justify-center text-slate-400 hover:text-amber-300 hover:bg-[#1f2a44] transition"
          >
            <i className="fa-solid fa-scissors text-[10px]"></i>
          </button>
        )}

        {canDelete && onDelete && (
          <button
            type="button"
            onClick={() => onDelete(folder)}
            title="Delete folder"
            className="w-6 h-6 rounded-md flex items-center justify-center text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition"
          >
            <i className="fa-solid fa-trash text-[10px]"></i>
          </button>
        )}
      </div>
    </div>
  );
}
