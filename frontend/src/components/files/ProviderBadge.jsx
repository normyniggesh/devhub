import React from 'react';

export default function ProviderBadge({ provider, size = 'sm', className = '' }) {
  switch (provider) {
    case 'local':
    case 'pc':
      return (
        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg font-bold text-sky-400 bg-sky-500/10 border border-sky-500/25 ${size === 'xs' ? 'text-[10px]' : 'text-xs'} ${className}`}>
          <i className="fa-solid fa-laptop text-[11px]"></i>
          <span>This PC</span>
        </span>
      );
    case 'devhub':
      return (
        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg font-bold text-purple-400 bg-purple-500/10 border border-purple-500/25 ${size === 'xs' ? 'text-[10px]' : 'text-xs'} ${className}`}>
          <i className="fa-solid fa-server text-[11px]"></i>
          <span>DEVHUB S3</span>
        </span>
      );
    case 'gdrive':
    case 'google_drive':
      return (
        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/25 ${size === 'xs' ? 'text-[10px]' : 'text-xs'} ${className}`}>
          <i className="fa-brands fa-google-drive text-[11px]"></i>
          <span>Google Drive</span>
        </span>
      );
    default:
      return (
        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg font-bold text-slate-400 bg-slate-500/10 border border-slate-500/25 ${size === 'xs' ? 'text-[10px]' : 'text-xs'} ${className}`}>
          <i className="fa-solid fa-folder text-[11px]"></i>
          <span>Storage</span>
        </span>
      );
  }
}
