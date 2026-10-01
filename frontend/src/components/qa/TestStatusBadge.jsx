export default function TestStatusBadge({ status, className = '' }) {
  const normalized = (status || 'Not Tested').trim();

  switch (normalized) {
    case 'Passed':
      return (
        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/25 ${className}`}>
          <i className="fa-solid fa-circle-check text-xs"></i>
          <span>Passed</span>
        </span>
      );
    case 'Failed':
      return (
        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-bold bg-rose-500/10 text-rose-400 border border-rose-500/25 ${className}`}>
          <i className="fa-solid fa-circle-xmark text-xs"></i>
          <span>Failed</span>
        </span>
      );
    case 'Blocked':
      return (
        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-bold bg-amber-500/10 text-amber-400 border border-amber-500/25 ${className}`}>
          <i className="fa-solid fa-ban text-xs"></i>
          <span>Blocked</span>
        </span>
      );
    case 'In Progress':
    case 'Running':
      return (
        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-bold bg-purple-500/10 text-purple-400 border border-purple-500/25 ${className}`}>
          <i className="fa-solid fa-spinner fa-spin text-xs"></i>
          <span>In Progress</span>
        </span>
      );
    case 'Not Tested':
    case 'Draft':
    default:
      return (
        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-bold bg-slate-500/10 text-slate-400 border border-slate-500/25 ${className}`}>
          <i className="fa-regular fa-circle-question text-xs"></i>
          <span>Not Tested</span>
        </span>
      );
  }
}
