import { formatSize } from '../../utils/formatting';

function getFileIconInfo(mimeType, fileName = '') {
  const ext = fileName.split('.').pop()?.toLowerCase();

  if (mimeType?.includes('pdf') || ext === 'pdf') {
    return { icon: 'fa-solid fa-file-pdf', color: 'text-rose-400', bg: 'bg-rose-500/10 border-rose-500/20' };
  }
  if (mimeType?.includes('spreadsheet') || mimeType?.includes('excel') || ['xls', 'xlsx', 'csv'].includes(ext)) {
    return { icon: 'fa-solid fa-file-excel', color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/20' };
  }
  if (mimeType?.includes('document') || mimeType?.includes('word') || ['doc', 'docx'].includes(ext)) {
    return { icon: 'fa-solid fa-file-word', color: 'text-blue-400', bg: 'bg-blue-500/10 border-blue-500/20' };
  }
  if (mimeType?.includes('presentation') || mimeType?.includes('powerpoint') || ['ppt', 'pptx'].includes(ext)) {
    return { icon: 'fa-solid fa-file-powerpoint', color: 'text-amber-400', bg: 'bg-amber-500/10 border-amber-500/20' };
  }
  if (mimeType?.startsWith('image/') || ['jpg', 'jpeg', 'png', 'gif', 'svg', 'webp'].includes(ext)) {
    return { icon: 'fa-solid fa-file-image', color: 'text-purple-400', bg: 'bg-purple-500/10 border-purple-500/20' };
  }
  if (mimeType?.startsWith('video/') || ['mp4', 'mov', 'webm', 'mkv'].includes(ext)) {
    return { icon: 'fa-solid fa-file-video', color: 'text-sky-400', bg: 'bg-sky-500/10 border-sky-500/20' };
  }
  if (mimeType?.includes('zip') || mimeType?.includes('tar') || ['zip', 'rar', '7z', 'gz'].includes(ext)) {
    return { icon: 'fa-solid fa-file-zipper', color: 'text-yellow-400', bg: 'bg-yellow-500/10 border-yellow-500/20' };
  }
  if (mimeType?.includes('javascript') || mimeType?.includes('json') || ['js', 'jsx', 'ts', 'tsx', 'html', 'css', 'py'].includes(ext)) {
    return { icon: 'fa-solid fa-file-code', color: 'text-teal-400', bg: 'bg-teal-500/10 border-teal-500/20' };
  }

  return { icon: 'fa-solid fa-file', color: 'text-slate-400', bg: 'bg-slate-500/10 border-slate-500/20' };
}

export default function DriveFileRow({
  file,
  onImport,
  onDownload,
  importing = false
}) {
  const iconInfo = getFileIconInfo(file.mimeType, file.name);

  const formattedDate = file.lastModified
    ? new Date(file.lastModified).toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      })
    : '—';

  return (
    <tr className="border-b border-[#182136] hover:bg-[#161d2f]/50 transition group">
      <td className="py-2.5 px-4">
        <div className="flex items-center gap-3">
          <div className={`w-8 h-8 rounded-lg border flex items-center justify-center shrink-0 ${iconInfo.bg}`}>
            <i className={`${iconInfo.icon} ${iconInfo.color} text-sm`}></i>
          </div>
          <div className="min-w-0 max-w-xs sm:max-w-sm">
            <span className="text-xs font-medium text-white truncate block" title={file.name}>
              {file.name}
            </span>
          </div>
        </div>
      </td>
      <td className="py-2.5 px-4 text-xs text-slate-400 font-mono">
        {file.size > 0 ? formatSize(file.size) : '—'}
      </td>
      <td className="py-2.5 px-4 text-xs text-slate-400">
        {formattedDate}
      </td>
      <td className="py-2.5 px-4 text-right">
        <div className="flex items-center justify-end gap-1.5">
          {/* Preview / View Link */}
          {file.webViewLink && (
            <a
              href={file.webViewLink}
              target="_blank"
              rel="noopener noreferrer"
              title="Open in Google Drive"
              className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-700/30 rounded-lg transition"
            >
              <i className="fa-solid fa-arrow-up-right-from-square text-xs"></i>
            </a>
          )}

          {/* Download */}
          <button
            type="button"
            onClick={() => onDownload(file)}
            title="Download file to computer"
            className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-700/30 rounded-lg transition"
          >
            <i className="fa-solid fa-download text-xs"></i>
          </button>

          {/* Import to DEVHUB */}
          <button
            type="button"
            onClick={() => onImport(file)}
            disabled={importing}
            className="py-1 px-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-lg text-xs font-medium transition flex items-center gap-1 shadow-sm"
          >
            {importing ? (
              <>
                <i className="fa-solid fa-circle-notch fa-spin text-[10px]"></i>
                <span>Importing...</span>
              </>
            ) : (
              <>
                <i className="fa-solid fa-cloud-arrow-down text-[10px]"></i>
                <span>Import</span>
              </>
            )}
          </button>
        </div>
      </td>
    </tr>
  );
}
