export default function Team() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-white tracking-tight">Team</h1>
        <p className="text-xs text-slate-400 mt-0.5">Manage your team members and roles.</p>
      </div>

      <div className="flex flex-col items-center justify-center p-12 bg-[#101524] border border-dashed border-[#232a3f] rounded-2xl">
        <i className="fa-solid fa-users text-4xl text-slate-500 mb-4"></i>
        <h2 className="text-lg font-bold text-white mb-2">No team members yet</h2>
        <p className="text-sm text-slate-400 mb-6 text-center max-w-md">Invite people to collaborate on your projects and tasks. Your team space will appear here.</p>
        <button className="px-5 py-2.5 bg-[#5922cf] hover:bg-[#682ae6] text-white rounded-lg text-sm font-semibold transition opacity-50 cursor-not-allowed">
          Invite Member (Coming Soon)
        </button>
      </div>
    </div>
  );
}
