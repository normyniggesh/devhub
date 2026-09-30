export default function DriveFolderRow({ folder, onOpenFolder }) {
  const formattedDate = folder.lastModified
    ? new Date(folder.lastModified).toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      })
    : '—';

  return (
    <tr
      onClick={() => onOpenFolder(folder)}
      className="border-b border-[#182136] hover:bg-[#161d2f]/70 cursor-pointer transition group"
    >
      <td className="py-2.5 px-4">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center shrink-0">
            <i className="fa-solid fa-folder text-amber-400 text-sm"></i>
          </div>
          <div className="min-w-0">
            <span className="text-xs font-semibold text-white group-hover:text-amber-400 transition truncate block">
              {folder.name}
            </span>
          </div>
        </div>
      </td>
      <td className="py-2.5 px-4 text-xs text-slate-400 font-mono">
        —
      </td>
      <td className="py-2.5 px-4 text-xs text-slate-400">
        {formattedDate}
      </td>
      <td className="py-2.5 px-4 text-right">
        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-400 group-hover:text-amber-400 transition">
          <span>Open</span>
          <i className="fa-solid fa-chevron-right text-[10px]"></i>
        </span>
      </td>
    </tr>
  );
}
