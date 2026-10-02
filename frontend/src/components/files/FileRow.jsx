import React from 'react';
import { formatSize } from '../../utils/formatting';

export default function FileRow({
  file,
  isSelected = false,
  onToggleSelect,
  onPreview,
  onDownload,
  onCopy,
  onCut,
  onDelete,
  canDelete = true,
  provider = 'local'
}) {
  const isGoogleDoc = file.mimeType === 'application/vnd.google-apps.document';
  const isGoogleSheet = file.mimeType === 'application/vnd.google-apps.spreadsheet';
  const isGoogleSlide = file.mimeType === 'application/vnd.google-apps.presentation';
  const isGoogleApp = isGoogleDoc || isGoogleSheet || isGoogleSlide;

  const getFileIcon = () => {
    if (isGoogleDoc) return { icon: 'fa-file-lines', color: 'text-blue-400', bg: 'bg-blue-500/10 border-blue-500/20' };
    if (isGoogleSheet) return { icon: 'fa-file-excel', color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/20' };
    if (isGoogleSlide) return { icon: 'fa-file-powerpoint', color: 'text-amber-400', bg: 'bg-amber-500/10 border-amber-500/20' };

    const type = (file.mimeType || file.type || '').toLowerCase();
    const name = (file.name || '').toLowerCase();

    if (type.startsWith('image/') || /\.(png|jpg|jpeg|gif|webp|svg)$/.test(name)) {
      return { icon: 'fa-file-image', color: 'text-purple-400', bg: 'bg-purple-500/10 border-purple-500/20' };
    }
    if (type === 'application/pdf' || name.endsWith('.pdf')) {
      return { icon: 'fa-file-pdf', color: 'text-rose-400', bg: 'bg-rose-500/10 border-rose-500/20' };
    }
    if (/\.(zip|tar|gz|rar|7z)$/.test(name)) {
      return { icon: 'fa-file-zipper', color: 'text-amber-400', bg: 'bg-amber-500/10 border-amber-500/20' };
    }
    if (/\.(js|jsx|ts|tsx|json|html|css|py|sql|sh|md)$/.test(name)) {
      return { icon: 'fa-file-code', color: 'text-sky-400', bg: 'bg-sky-500/10 border-sky-500/20' };
    }
    return { icon: 'fa-file', color: 'text-slate-400', bg: 'bg-slate-500/10 border-slate-500/20' };
  };

  const fileIconInfo = getFileIcon();

  const handleDragStart = (e) => {
    e.dataTransfer.setData('application/json', JSON.stringify({
      sourceProvider: provider,
      type: 'file',
      item: file
    }));
    e.dataTransfer.effectAllowed = 'copyMove';
  };

  const formattedDate = file.lastModified || file.updatedAt || file.createdAt
    ? new Date(file.lastModified || file.updatedAt || file.createdAt).toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric'
      })
    : '';

  return (
    <div
      draggable
      onDragStart={handleDragStart}
      className={`group flex items-center justify-between gap-2 p-2 px-2.5 rounded-xl border transition-all cursor-pointer ${
        isSelected
          ? 'bg-indigo-950/40 border-indigo-500/50 shadow-sm'
          : 'bg-[#121624]/60 hover:bg-[#161d2f] border-[#1b2236] hover:border-[#24314c]'
      }`}
      onClick={() => onPreview && onPreview(file)}
    >
      <div className="flex items-center gap-2.5 min-w-0 flex-1">
        {/* Checkbox */}
        <input
          type="checkbox"
          checked={isSelected}
          onChange={(e) => {
            e.stopPropagation();
            onToggleSelect(file.id || file.name);
          }}
          onClick={(e) => e.stopPropagation()}
          className="w-3.5 h-3.5 rounded border-slate-600 bg-[#0d101a] text-indigo-600 focus:ring-0 cursor-pointer shrink-0"
        />

        {/* File Type Icon */}
        <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 border ${fileIconInfo.bg}`}>
          <i className={`fa-solid ${fileIconInfo.icon} ${fileIconInfo.color} text-xs`}></i>
        </div>

        {/* Name and Meta */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="font-semibold text-xs text-white truncate block group-hover:text-indigo-300 transition">
              {file.name}
            </span>
            {isGoogleApp && (
              <span className="text-[9px] font-bold text-sky-400 bg-sky-500/10 px-1 py-0.2 rounded shrink-0">
                {isGoogleDoc ? 'DOC' : isGoogleSheet ? 'SHEET' : 'SLIDE'}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 text-[10px] text-slate-500">
            {file.size > 0 && <span>{formatSize(file.size)}</span>}
            {formattedDate && <span>• {formattedDate}</span>}
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition shrink-0" onClick={(e) => e.stopPropagation()}>
        {/* Open in Google Docs if applicable */}
        {isGoogleApp && file.webViewLink && (
          <a
            href={file.webViewLink}
            target="_blank"
            rel="noopener noreferrer"
            title="Open in Google"
            className="w-6 h-6 rounded-md flex items-center justify-center text-sky-400 hover:text-white hover:bg-sky-500/20 transition"
          >
            <i className="fa-solid fa-arrow-up-right-from-square text-[10px]"></i>
          </a>
        )}

        {/* Preview */}
        {onPreview && (
          <button
            type="button"
            onClick={() => onPreview(file)}
            title="Preview file"
            className="w-6 h-6 rounded-md flex items-center justify-center text-slate-400 hover:text-white hover:bg-[#1f2a44] transition"
          >
            <i className="fa-solid fa-eye text-[10px]"></i>
          </button>
        )}

        {/* Download */}
        {onDownload && (
          <button
            type="button"
            onClick={() => onDownload(file)}
            title="Download file"
            className="w-6 h-6 rounded-md flex items-center justify-center text-slate-400 hover:text-white hover:bg-[#1f2a44] transition"
          >
            <i className="fa-solid fa-download text-[10px]"></i>
          </button>
        )}

        {/* Copy */}
        {onCopy && (
          <button
            type="button"
            onClick={() => onCopy(file)}
            title="Copy file"
            className="w-6 h-6 rounded-md flex items-center justify-center text-slate-400 hover:text-white hover:bg-[#1f2a44] transition"
          >
            <i className="fa-solid fa-copy text-[10px]"></i>
          </button>
        )}

        {/* Move / Cut */}
        {onCut && (
          <button
            type="button"
            onClick={() => onCut(file)}
            title="Move file"
            className="w-6 h-6 rounded-md flex items-center justify-center text-slate-400 hover:text-amber-300 hover:bg-[#1f2a44] transition"
          >
            <i className="fa-solid fa-scissors text-[10px]"></i>
          </button>
        )}

        {/* Delete */}
        {canDelete && onDelete && (
          <button
            type="button"
            onClick={() => onDelete(file)}
            title="Delete file"
            className="w-6 h-6 rounded-md flex items-center justify-center text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition"
          >
            <i className="fa-solid fa-trash text-[10px]"></i>
          </button>
        )}
      </div>
    </div>
  );
}
