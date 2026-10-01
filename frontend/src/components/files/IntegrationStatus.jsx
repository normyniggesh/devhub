export default function IntegrationStatus({ isConnected }) {
  if (isConnected) {
    return (
      <div className="inline-flex items-center gap-1.5 text-emerald-400 font-bold text-xs">
        <span className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_6px_#10b981]"></span>
        <span>Connected</span>
      </div>
    );
  }

  return (
    <div className="inline-flex items-center gap-1.5 text-slate-400 font-medium text-xs">
      <span className="w-2 h-2 rounded-full bg-slate-500"></span>
      <span>Not Connected</span>
    </div>
  );
}
