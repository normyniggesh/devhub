import React from 'react';
import FolderRow from './FolderRow';
import FileRow from './FileRow';

export default function FileList({
  folders = [],
  files = [],
  selectedIds = new Set(),
  onToggleSelect,
  onOpenFolder,
  onOpenFile,
  onDownloadFile,
  onDeleteFolder,
  onDeleteFile,
  onDropOnFolder,
  onDragStart,
  loading = false,
  error = null,
  searchQuery = '',
  emptyMessage = 'This folder is empty',
  readOnly = false
}) {
  const hasItems = folders.length > 0 || files.length > 0;

  if (loading) {
    return (
      <div className="flex-1 min-h-0 flex flex-col items-center justify-center py-16 text-slate-400 gap-2">
        <i className="fa-solid fa-circle-notch fa-spin text-xl text-indigo-400"></i>
        <span className="text-xs">Loading items...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex-1 min-h-0 flex flex-col items-center justify-center p-6 text-center gap-2">
        <i className="fa-solid fa-triangle-exclamation text-amber-400 text-2xl"></i>
        <span className="text-xs font-semibold text-rose-300 max-w-xs">{error}</span>
      </div>
    );
  }

  if (!hasItems) {
    return (
      <div className="flex-1 min-h-0 flex flex-col items-center justify-center p-8 text-center text-slate-500 gap-2">
        <i className="fa-regular fa-folder-open text-3xl text-slate-600"></i>
        <span className="text-xs font-medium text-slate-400">
          {searchQuery ? `No files match "${searchQuery}"` : emptyMessage}
        </span>
      </div>
    );
  }

  return (
    <div className="flex-1 min-h-0 overflow-y-auto pr-1 flex flex-col gap-1 custom-scrollbar">
      {/* Folders */}
      {folders.map(folder => (
        <FolderRow
          key={folder.id}
          folder={folder}
          isSelected={selectedIds.has(folder.id)}
          onToggleSelect={() => onToggleSelect(folder.id)}
          onOpen={() => onOpenFolder(folder)}
          onDelete={onDeleteFolder ? () => onDeleteFolder(folder) : null}
          onDropOnFolder={onDropOnFolder}
          onDragStart={onDragStart}
        />
      ))}

      {/* Files */}
      {files.map(file => (
        <FileRow
          key={file.id}
          file={file}
          isSelected={selectedIds.has(file.id)}
          onToggleSelect={() => onToggleSelect(file.id)}
          onOpen={() => onOpenFile(file)}
          onDownload={() => onDownloadFile(file)}
          onDelete={onDeleteFile ? () => onDeleteFile(file) : null}
          onDragStart={onDragStart}
          readOnly={readOnly}
        />
      ))}
    </div>
  );
}
