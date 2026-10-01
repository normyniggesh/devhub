import React from 'react';

const PROVIDER_ICONS = {
  google_drive: { icon: 'fa-brands fa-google-drive', color: 'text-amber-400', label: 'Google Drive' },
  dropbox: { icon: 'fa-brands fa-dropbox', color: 'text-blue-400', label: 'Dropbox' },
  onedrive: { icon: 'fa-solid fa-cloud', color: 'text-sky-400', label: 'OneDrive' },
  github: { icon: 'fa-brands fa-github', color: 'text-slate-200', label: 'GitHub' }
};

/**
 * Reusable ProviderStatus badge list
 * Renders connected cloud accounts and GitHub integrations without exposing secrets
 */
export default function ProviderStatus({ integrations = [], compact = false }) {
  const connectedMap = {};
  integrations.forEach((item) => {
    if (item.status === 'connected') {
      connectedMap[item.provider] = item.accountName || 'Connected';
    }
  });

  const providers = ['google_drive', 'dropbox', 'onedrive', 'github'];

  if (compact) {
    const connectedCount = Object.keys(connectedMap).length;
    if (connectedCount === 0) {
      return <span className="text-xs text-slate-500">None</span>;
    }
    return (
      <div className="flex items-center gap-1.5 flex-wrap">
        {providers.map((p) => {
          if (!connectedMap[p]) return null;
          const conf = PROVIDER_ICONS[p];
          return (
            <span
              key={p}
              title={`${conf.label}: ${connectedMap[p]}`}
              className="w-6 h-6 rounded-md bg-[#192238] border border-[#232f4e] flex items-center justify-center text-xs"
            >
              <i className={`${conf.icon} ${conf.color}`}></i>
            </span>
          );
        })}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {providers.map((p) => {
        const conf = PROVIDER_ICONS[p];
        const isConnected = Boolean(connectedMap[p]);
        const account = connectedMap[p];

        return (
          <span
            key={p}
            title={isConnected ? `${conf.label}: ${account}` : `${conf.label}: Not connected`}
            className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs font-medium border ${
              isConnected
                ? 'bg-[#151c2f] border-indigo-500/30 text-slate-200'
                : 'bg-[#0f1422]/50 border-slate-800/60 text-slate-500'
            }`}
          >
            <i className={`${conf.icon} ${isConnected ? conf.color : 'text-slate-600'} text-xs`}></i>
            <span className="text-[11px] truncate max-w-[100px]">
              {isConnected ? account : conf.label}
            </span>
            {isConnected && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0"></span>}
          </span>
        );
      })}
    </div>
  );
}
