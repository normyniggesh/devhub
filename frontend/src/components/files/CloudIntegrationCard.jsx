import IntegrationStatus from './IntegrationStatus';

export default function CloudIntegrationCard({
  providerId,
  name,
  description,
  icon,
  iconBg,
  iconColor,
  isConnected,
  accountName,
  onConnect,
  onOpen,
  onDisconnect,
  connecting = false
}) {
  return (
    <div className="flex flex-col justify-between h-full bg-[#101524] border border-[#1e293b] rounded-xl p-5 hover:border-slate-700/80 transition-all duration-200 shadow-sm">
      {/* Top Details */}
      <div>
        {/* Header: Provider Icon & Name & Description */}
        <div className="flex items-start gap-3.5 mb-3">
          <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 border border-white/5 ${iconBg || 'bg-[#161f36]'}`}>
            <i className={`${icon} text-xl ${iconColor || 'text-white'}`}></i>
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-semibold text-white tracking-tight">{name}</h3>
            <p className="text-xs text-slate-400 mt-1 leading-relaxed line-clamp-2">{description}</p>
          </div>
        </div>

        {/* Status Section */}
        <div className="pt-3.5 mt-3.5 border-t border-[#1a233a] flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <IntegrationStatus isConnected={isConnected} />
          </div>
          {isConnected && accountName && (
            <span
              className="text-[11px] text-slate-300 font-mono truncate max-w-[150px] bg-[#161d2f] px-2 py-0.5 rounded border border-[#222e48]"
              title={accountName}
            >
              {accountName}
            </span>
          )}
        </div>
      </div>

      {/* Bottom Buttons: Aligned at bottom */}
      <div className="mt-5 pt-3 border-t border-[#1a233a] flex items-center gap-2">
        {isConnected ? (
          <>
            <button
              type="button"
              onClick={onOpen}
              className="flex-1 py-2 px-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold transition flex items-center justify-center gap-1.5 shadow-sm"
            >
              <i className="fa-solid fa-folder-open text-xs"></i>
              <span>Open</span>
            </button>
            <button
              type="button"
              onClick={onDisconnect}
              title="Disconnect account"
              className="py-2 px-2.5 text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg border border-transparent hover:border-rose-500/20 transition flex items-center justify-center"
            >
              <i className="fa-solid fa-power-off text-xs"></i>
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={onConnect}
            disabled={connecting}
            className="cloud-connect-btn w-full py-2 px-3 bg-[#182238] hover:bg-[#202c48] text-slate-200 hover:text-white rounded-lg text-xs font-semibold transition border border-[#2b395c] flex items-center justify-center gap-1.5 disabled:opacity-50 shadow-sm"
          >
            {connecting ? (
              <>
                <i className="fa-solid fa-circle-notch fa-spin text-xs"></i>
                <span>Connecting...</span>
              </>
            ) : (
              <>
                <i className="fa-solid fa-arrow-up-right-from-square text-[10px]"></i>
                <span>Connect</span>
              </>
            )}
          </button>
        )}
      </div>
    </div>
  );
}
