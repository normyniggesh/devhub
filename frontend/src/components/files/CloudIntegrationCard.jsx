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
    <div className="flex flex-col justify-between h-full bg-[#0f1422] border border-[#192238] hover:border-[#283552] rounded-2xl p-5 transition-all duration-200 shadow-sm">
      {/* Top Section */}
      <div>
        {/* Header: Provider Icon & Name & Description */}
        <div className="flex items-start gap-3.5 mb-3.5">
          <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 border border-white/5 ${iconBg || 'bg-[#161d2f]'}`}>
            <i className={`${icon} text-xl ${iconColor || 'text-white'}`}></i>
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-bold text-white tracking-tight">{name}</h3>
            <p className="text-xs text-slate-400 mt-1 leading-relaxed line-clamp-2 min-h-[32px]">
              {description}
            </p>
          </div>
        </div>

        {/* Status Row */}
        <div className="pt-3 border-t border-[#192238] flex items-center justify-between gap-2 flex-wrap min-h-[28px]">
          <div className="flex items-center gap-1.5 shrink-0">
            <IntegrationStatus isConnected={isConnected} />
          </div>

          {isConnected && accountName && (
            <span
              className="text-[11px] font-mono text-slate-300 bg-[#161d2f] border border-[#1f2a44] px-2 py-0.5 rounded-lg truncate max-w-[130px] sm:max-w-[160px]"
              title={accountName}
            >
              {accountName}
            </span>
          )}
        </div>
      </div>

      {/* Bottom Action Row (Pinned to bottom) */}
      <div className="mt-5 pt-3.5 border-t border-[#192238] flex items-center gap-2">
        {isConnected ? (
          <>
            <button
              type="button"
              onClick={onOpen}
              className="flex-1 py-2 px-3 bg-[#5922cf] hover:bg-[#682ae6] text-white rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 shadow-md shadow-purple-900/20 active:scale-95"
            >
              <i className="fa-solid fa-folder-open text-xs"></i>
              <span>Open</span>
            </button>
            <button
              type="button"
              onClick={onDisconnect}
              title="Disconnect account"
              className="py-2 px-3 text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 rounded-xl border border-[#1f2a44] hover:border-rose-500/30 transition flex items-center justify-center text-xs"
            >
              <i className="fa-solid fa-power-off"></i>
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={onConnect}
            disabled={connecting}
            className="cloud-connect-btn w-full py-2 px-4 bg-[#161d2f] hover:bg-[#1e273f] text-slate-200 hover:text-white rounded-xl text-xs font-bold transition border border-[#1f2a44] hover:border-[#2d3a5a] flex items-center justify-center gap-2 disabled:opacity-50 shadow-inner"
          >
            {connecting ? (
              <>
                <i className="fa-solid fa-circle-notch fa-spin text-xs text-purple-400"></i>
                <span>Connecting...</span>
              </>
            ) : (
              <>
                <i className="fa-solid fa-plug text-[11px] text-purple-400"></i>
                <span>Connect</span>
              </>
            )}
          </button>
        )}
      </div>
    </div>
  );
}
