import { useState, useEffect } from 'react';
import { apiClient } from '../api/client';
import { useStore } from '../store';

export default function QAtesting() {
  const { currentUser } = useStore();
  const [projects, setProjects] = useState([]);
  const [selectedProjectId, setSelectedProjectId] = useState('');
  const [activeTab, setActiveTab] = useState('Overview');
  const [recentActivity, setRecentActivity] = useState([]);
  
  const [loadingProjects, setLoadingProjects] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [sidebarRuns, setSidebarRuns] = useState([]);

  useEffect(() => {
    const fetchInitData = async () => {
      try {
        const [projData, dashData] = await Promise.all([
          apiClient('/projects'),
          apiClient('/dashboard').catch(() => ({ dashboard: { recentActivity: [] } }))
        ]);
        setProjects(projData.projects || []);
        
        const allAct = dashData.dashboard?.recentActivity || [];
        setRecentActivity(allAct.filter(a => ['TestCase', 'TestRun', 'Bug'].includes(a.entityType)));
      } catch (err) {
        console.error('Failed to fetch initial QA data', err);
      } finally {
        setLoadingProjects(false);
      }
    };
    fetchInitData();
  }, []);

  useEffect(() => {
    if (selectedProjectId) {
      apiClient(`/test-runs?projectId=${selectedProjectId}`)
        .then(d => setSidebarRuns(d.testRuns || []))
        .catch(() => setSidebarRuns([]));
    } else {
      setSidebarRuns([]);
    }
  }, [selectedProjectId]);

  return (
    <div className="flex flex-col xl:flex-row gap-6 max-w-[1920px] mx-auto pb-12 min-h-screen">
      
      {/* Main Content Area */}
      <div className="flex-1 min-w-0 flex flex-col gap-6">
        
        {/* Top Header / Search */}
        <div className="flex items-center justify-between gap-4 bg-[#0f1422] border border-[#192238] rounded-2xl p-3 px-4 shadow-sm">
          <div className="relative flex-1 max-w-xl">
             <i className="fa-solid fa-magnifying-glass absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 text-sm"></i>
             <input 
               type="text" 
               placeholder="Search test cases, bugs, projects..." 
               value={searchQuery}
               onChange={(e) => setSearchQuery(e.target.value)}
               className="w-full bg-[#161d2f] border border-[#1f2a44] rounded-xl pl-10 pr-10 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-purple-500 transition shadow-inner" 
             />
             <div className="absolute right-4 top-1/2 -translate-y-1/2 flex items-center justify-center bg-[#1f2a44] rounded px-1.5 py-0.5 pointer-events-none">
               <span className="text-[10px] font-bold text-slate-400">⌘ K</span>
             </div>
          </div>
          <div className="flex items-center gap-3">
             <button className="w-9 h-9 flex items-center justify-center bg-[#5922cf] hover:bg-[#682ae6] text-white rounded-xl shadow-lg shadow-purple-900/30 transition">
               <i className="fa-solid fa-plus"></i>
             </button>
             <button className="w-9 h-9 flex items-center justify-center bg-[#161d2f] border border-[#1f2a44] text-slate-400 hover:text-white rounded-xl transition">
               <i className="fa-solid fa-bell"></i>
             </button>
             <div className="w-9 h-9 rounded-xl bg-[#161d2f] border border-[#1f2a44] flex items-center justify-center overflow-hidden">
               <span className="text-xs font-bold text-purple-400">{currentUser?.name?.charAt(0).toUpperCase() || 'U'}</span>
             </div>
          </div>
        </div>

        {/* Hero Section */}
        <div className="relative rounded-2xl p-8 bg-[#0f1422] border border-[#192238] overflow-hidden flex flex-col sm:flex-row justify-between items-start sm:items-center gap-6 shadow-sm">
           <div className="absolute right-0 top-0 bottom-0 w-1/2 opacity-30 pointer-events-none bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-purple-600/30 via-[#0f1422]/10 to-transparent"></div>
           <div className="z-10">
             <div className="flex items-center gap-2 text-[10px] font-bold tracking-wider text-slate-400 mb-2 uppercase">
               <span>QA / Testing</span>
               <span className="text-slate-600">›</span>
               <span className="text-purple-400">{projects.find(p => p.id === selectedProjectId)?.name || 'Select a Project'}</span>
             </div>
             <h1 className="text-3xl font-extrabold text-white tracking-tight mb-2 flex items-center gap-3">
               <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-purple-800 flex items-center justify-center shadow-lg shadow-purple-900/50 shrink-0">
                 <i className="fa-solid fa-bolt text-white text-lg"></i>
               </div>
               QA & Testing
             </h1>
             <p className="text-sm text-slate-400">Ensure quality. Ship with confidence.</p>
           </div>
           <div className="z-10 flex flex-col sm:flex-row items-center gap-3 w-full sm:w-auto">
              <div className="relative w-full sm:w-auto">
                <select 
                  value={selectedProjectId} 
                  onChange={e => setSelectedProjectId(e.target.value)}
                  className="w-full appearance-none bg-[#161d2f] border border-[#1f2a44] rounded-xl pl-4 pr-10 py-2.5 text-sm font-bold text-white focus:outline-none focus:border-purple-500 transition shadow-inner cursor-pointer"
                >
                  <option value="" disabled>Select a Project</option>
                  {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
                <i className="fa-solid fa-chevron-down absolute right-4 top-1/2 -translate-y-1/2 text-[10px] text-slate-500 pointer-events-none"></i>
              </div>
              <button className="w-full sm:w-auto px-5 py-2.5 bg-[#5922cf] hover:bg-[#682ae6] text-white rounded-xl text-sm font-bold shadow-lg shadow-purple-900/30 transition flex items-center justify-center gap-2">
                <i className="fa-solid fa-plus"></i> New
              </button>
           </div>
        </div>

        {/* QA TABS */}
        <div className="flex items-center gap-1.5 p-1 bg-[#0f1422] border border-[#192238] rounded-xl w-full sm:w-auto overflow-x-auto hide-scrollbar self-start shadow-sm">
           {['Overview', 'Test Cases', 'Test Runs', 'Bugs', 'Reports', 'Settings'].map(tab => (
             <button 
               key={tab} 
               onClick={() => setActiveTab(tab)}
               className={`px-4 py-2 rounded-lg text-xs font-bold transition whitespace-nowrap ${activeTab === tab || (activeTab === 'Summary' && tab === 'Overview') ? 'bg-purple-600 text-white shadow-md shadow-purple-900/20' : 'text-slate-400 hover:text-white hover:bg-[#1a2333]'}`}
             >
               {tab}
             </button>
           ))}
        </div>

        {/* Tab Content */}
        {!selectedProjectId ? (
           <div className="flex flex-col items-center justify-center p-20 bg-[#0f1422] border border-dashed border-[#1f2a44] rounded-2xl flex-1 shadow-sm">
             <i className="fa-solid fa-vial-circle-check text-5xl text-slate-600 mb-6 opacity-50"></i>
             <h2 className="text-xl font-bold text-white mb-2">No Project Selected</h2>
             <p className="text-sm text-slate-400 max-w-sm text-center">Select a project from the dropdown above to view QA metrics, test cases, runs, and reported bugs.</p>
           </div>
        ) : (
           <div className="flex-1 flex flex-col gap-6">
             {(activeTab === 'Overview' || activeTab === 'Summary') && <QaSummary projectId={selectedProjectId} />}
             {activeTab === 'Test Cases' && <TestCases projectId={selectedProjectId} currentUser={currentUser} projects={projects} />}
             {activeTab === 'Test Runs' && <TestRuns projectId={selectedProjectId} currentUser={currentUser} projects={projects} />}
             {activeTab === 'Bugs' && <Bugs projectId={selectedProjectId} currentUser={currentUser} projects={projects} />}
             {(activeTab === 'Reports' || activeTab === 'Settings') && (
                <div className="flex flex-col items-center justify-center p-20 bg-[#0f1422] border border-dashed border-[#1f2a44] rounded-2xl shadow-sm">
                  <i className="fa-solid fa-screwdriver-wrench text-5xl text-slate-600 mb-6 opacity-50"></i>
                  <h2 className="text-xl font-bold text-white mb-2">{activeTab} Module</h2>
                  <p className="text-sm text-slate-400 text-center">This section is currently under development.</p>
                </div>
             )}
           </div>
        )}
      </div>

      {/* RIGHT SIDEBAR */}
      <div className="w-full xl:w-[320px] shrink-0 flex flex-col gap-6">
        
        {/* Recent Activity */}
        <div className="bg-[#0f1422] border border-[#192238] rounded-2xl p-5 shadow-sm flex flex-col max-h-[400px]">
          <div className="flex items-center justify-between mb-4 shrink-0">
             <h2 className="text-sm font-bold text-white flex items-center gap-2"><i className="fa-solid fa-clock-rotate-left text-slate-400"></i> Recent Activity</h2>
             <span className="text-[10px] text-slate-500 font-bold uppercase hover:text-white cursor-pointer transition">View All →</span>
          </div>
          <div className="flex-1 overflow-y-auto hide-scrollbar pr-2">
            {recentActivity.length === 0 ? (
               <div className="text-center py-10 text-xs text-slate-500 bg-[#161d2f] rounded-xl border border-[#1f2a44] border-dashed">No recent QA activity.</div>
            ) : (
               <div className="flex flex-col gap-4">
                 {recentActivity.map(act => (
                   <div key={act.id} className="flex gap-3 border-b border-[#1f2a44] pb-4 last:border-0 last:pb-0">
                     <div className="w-8 h-8 rounded-full bg-[#1a2333] border border-[#2d3a5a] flex items-center justify-center shrink-0 overflow-hidden text-purple-400 shadow-inner">
                       {act.user?.avatarUrl ? <img src={act.user.avatarUrl} alt="Avatar" className="w-full h-full object-cover" /> : <span className="text-[10px] font-bold">{act.user?.name?.charAt(0).toUpperCase() || 'U'}</span>}
                     </div>
                     <div className="min-w-0">
                       <p className="text-[11px] text-slate-300 leading-snug">
                         <span className="font-bold text-white">{act.user?.name || 'Someone'}</span> {act.action.toLowerCase()} {act.entityType.toLowerCase()}
                       </p>
                       <p className="text-[11px] font-bold text-purple-400 truncate mt-0.5">{act.metadata?.name || 'Unknown item'}</p>
                       <p className="text-[9px] text-slate-500 mt-1">{new Date(act.createdAt).toLocaleDateString()}</p>
                     </div>
                   </div>
                 ))}
               </div>
            )}
          </div>
        </div>

        {/* Upcoming Test Runs */}
        <div className="bg-[#0f1422] border border-[#192238] rounded-2xl p-5 shadow-sm">
          <div className="flex items-center justify-between mb-5">
             <h2 className="text-sm font-bold text-white flex items-center gap-2"><i className="fa-solid fa-calendar-day text-slate-400"></i> Upcoming Test Runs</h2>
          </div>
          {sidebarRuns.filter(r => r.status === 'Pending').length === 0 ? (
             <div className="text-center py-8 text-xs text-slate-500 bg-[#161d2f] rounded-xl border border-[#1f2a44] border-dashed">No pending test runs scheduled.</div>
          ) : (
             <div className="flex flex-col gap-0 relative ml-2">
               <div className="absolute left-[7px] top-2 bottom-2 w-px bg-[#1f2a44] z-0"></div>
               {sidebarRuns.filter(r => r.status === 'Pending').slice(0, 5).map((run) => (
                 <div key={run.id} className="flex gap-4 relative z-10 mb-5 last:mb-0">
                   <div className="w-4 h-4 rounded-full bg-[#0f1422] border-[3px] border-purple-500 flex shrink-0 mt-0.5 shadow-[0_0_8px_rgba(168,85,247,0.4)]"></div>
                   <div className="min-w-0">
                     <h4 className="text-xs font-bold text-white mb-1 truncate">{run.name}</h4>
                     <div className="flex items-center gap-2">
                       <span className="text-[10px] text-slate-400"><i className="fa-regular fa-clock mr-1"></i>{run.startedAt ? new Date(run.startedAt).toLocaleDateString() : 'Scheduled'}</span>
                       <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-[#1e293f] text-slate-300 border border-[#2d3a5a]">Pending</span>
                     </div>
                   </div>
                 </div>
               ))}
             </div>
          )}
        </div>
        
      </div>
    </div>
  );
}

// ----------------------------------------------------------------------
// QA Summary (Overview Tab)
// ----------------------------------------------------------------------
function QaSummary({ projectId }) {
  const [summary, setSummary] = useState(null);
  const [testRuns, setTestRuns] = useState([]);
  const [bugs, setBugs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchDashboard = async () => {
      try {
        setLoading(true);
        const [sumRes, trRes, bugsRes] = await Promise.all([
          apiClient(`/qa/summary?projectId=${projectId}`),
          apiClient(`/test-runs?projectId=${projectId}`),
          apiClient(`/bugs?projectId=${projectId}`)
        ]);
        setSummary(sumRes.summary);
        setTestRuns(trRes.testRuns || []);
        setBugs(bugsRes.bugs || []);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    if (projectId) fetchDashboard();
  }, [projectId]);

  if (loading) {
    return (
      <div className="flex flex-col gap-6 animate-pulse">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
           {[...Array(5)].map((_, i) => <div key={i} className="h-24 bg-[#0f1422] rounded-2xl border border-[#192238]"></div>)}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
           {[...Array(3)].map((_, i) => <div key={i} className="h-64 bg-[#0f1422] rounded-2xl border border-[#192238]"></div>)}
        </div>
      </div>
    );
  }

  if (!summary) return null;

  // Calculate stats securely avoiding NaN
  const total = summary.totalTestCases || 0;
  const passed = summary.passedResults || 0;
  const failed = summary.failedResults || 0;
  const inProgress = Math.max(0, summary.activeTestCases - passed - failed);
  const notTested = Math.max(0, total - passed - failed - inProgress);

  const passPerc = total > 0 ? Math.round((passed / total) * 100) : 0;
  const failPerc = total > 0 ? Math.round((failed / total) * 100) : 0;
  const progPerc = total > 0 ? Math.round((inProgress / total) * 100) : 0;

  // Bug stats
  const openBugs = bugs.filter(b => b.status === 'Open').length;
  const inProgBugs = bugs.filter(b => b.status === 'In Progress').length;
  const fixedBugs = bugs.filter(b => b.status === 'Resolved').length;
  const closedBugs = bugs.filter(b => b.status === 'Closed' || b.status === 'Done').length;

  return (
    <div className="flex flex-col gap-6">
      
      {/* 5 Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {/* Total Test Cases */}
        <div className="bg-[#0f1422] border border-[#192238] rounded-2xl p-4 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-slate-400">Total Test Cases</span>
            <div className="w-6 h-6 rounded bg-[#1a2333] flex items-center justify-center"><i className="fa-solid fa-list-check text-slate-300 text-[10px]"></i></div>
          </div>
          <div>
            <div className="text-2xl font-extrabold text-white">{total}</div>
            <div className="text-[10px] font-bold text-emerald-400 mt-1 flex items-center gap-1"><i className="fa-solid fa-arrow-trend-up"></i> +12%</div>
          </div>
        </div>
        {/* Passed */}
        <div className="bg-[#0f1422] border border-[#192238] rounded-2xl p-4 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-slate-400">Passed</span>
            <div className="w-6 h-6 rounded bg-emerald-500/10 flex items-center justify-center"><i className="fa-solid fa-check text-emerald-400 text-[10px]"></i></div>
          </div>
          <div>
            <div className="text-2xl font-extrabold text-white">{passed}</div>
            <div className="text-[10px] font-bold text-slate-500 mt-1">{passPerc}% of total</div>
          </div>
        </div>
        {/* Failed */}
        <div className="bg-[#0f1422] border border-[#192238] rounded-2xl p-4 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-slate-400">Failed</span>
            <div className="w-6 h-6 rounded bg-red-500/10 flex items-center justify-center"><i className="fa-solid fa-xmark text-red-400 text-[10px]"></i></div>
          </div>
          <div>
            <div className="text-2xl font-extrabold text-white">{failed}</div>
            <div className="text-[10px] font-bold text-slate-500 mt-1">{failPerc}% of total</div>
          </div>
        </div>
        {/* In Progress */}
        <div className="bg-[#0f1422] border border-[#192238] rounded-2xl p-4 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-slate-400">In Progress</span>
            <div className="w-6 h-6 rounded bg-purple-500/10 flex items-center justify-center"><i className="fa-solid fa-spinner text-purple-400 text-[10px]"></i></div>
          </div>
          <div>
            <div className="text-2xl font-extrabold text-white">{inProgress}</div>
            <div className="text-[10px] font-bold text-slate-500 mt-1">{progPerc}% of total</div>
          </div>
        </div>
        {/* Not Tested */}
        <div className="bg-[#0f1422] border border-[#192238] rounded-2xl p-4 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-slate-400">Not Tested</span>
            <div className="w-6 h-6 rounded bg-slate-500/10 flex items-center justify-center"><i className="fa-solid fa-minus text-slate-400 text-[10px]"></i></div>
          </div>
          <div>
            <div className="text-2xl font-extrabold text-white">{notTested}</div>
            <div className="text-[10px] font-bold text-slate-500 mt-1">{total > 0 ? Math.round((notTested/total)*100) : 0}% of total</div>
          </div>
        </div>
      </div>

      {/* Main Grid: 3 Columns */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* LEFT: Test Case Status (Donut) */}
        <div className="bg-[#0f1422] border border-[#192238] rounded-2xl p-5 shadow-sm flex flex-col">
          <h3 className="text-sm font-bold text-white mb-6">Test Case Status</h3>
          <div className="flex-1 flex items-center justify-center">
            {total === 0 ? (
              <div className="text-center text-xs text-slate-500">No test cases to display.</div>
            ) : (
              <div className="relative w-40 h-40 flex items-center justify-center rounded-full shrink-0 shadow-lg shadow-black/50" 
                style={{ background: `conic-gradient(#10b981 0% ${passPerc}%, #ef4444 ${passPerc}% ${passPerc + failPerc}%, #8b5cf6 ${passPerc + failPerc}% ${passPerc + failPerc + progPerc}%, #334155 ${passPerc + failPerc + progPerc}% 100%)` }}>
                <div className="absolute inset-[15%] bg-[#0f1422] rounded-full flex flex-col items-center justify-center shadow-inner">
                  <span className="text-2xl font-extrabold text-white leading-none">{total}</span>
                  <span className="text-[10px] font-bold text-slate-400 mt-1">Test Cases</span>
                </div>
              </div>
            )}
          </div>
          <div className="mt-6 grid grid-cols-2 gap-3">
             <div className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shadow-[0_0_5px_#10b981]"></span><span className="text-xs font-medium text-slate-300">Passed</span></div>
             <div className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full bg-red-500 shadow-[0_0_5px_#ef4444]"></span><span className="text-xs font-medium text-slate-300">Failed</span></div>
             <div className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full bg-purple-500 shadow-[0_0_5px_#8b5cf6]"></span><span className="text-xs font-medium text-slate-300">In Progress</span></div>
             <div className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full bg-slate-600"></span><span className="text-xs font-medium text-slate-300">Not Tested</span></div>
          </div>
        </div>

        {/* CENTER: Test Runs List */}
        <div className="bg-[#0f1422] border border-[#192238] rounded-2xl p-5 shadow-sm flex flex-col">
          <div className="flex items-center justify-between mb-5">
            <h3 className="text-sm font-bold text-white">Test Runs</h3>
            <span className="text-[10px] font-bold text-purple-400 cursor-pointer hover:text-purple-300 transition">View All</span>
          </div>
          <div className="flex-1 overflow-y-auto hide-scrollbar flex flex-col gap-4">
            {testRuns.length === 0 ? (
              <div className="flex-1 flex items-center justify-center text-xs text-slate-500 border border-dashed border-[#1f2a44] rounded-xl bg-[#161d2f]">No test runs found.</div>
            ) : (
              testRuns.slice(0, 4).map(run => {
                // Visual pseudo-progress logic since we don't have exact pass/total in summary endpoint for each run
                const isCompleted = run.status === 'Completed';
                const isRunning = run.status === 'Running';
                const progressWidth = isCompleted ? '100%' : isRunning ? '60%' : '0%';
                
                return (
                  <div key={run.id} className="bg-[#161d2f] border border-[#1f2a44] rounded-xl p-3 flex flex-col gap-2">
                    <div className="flex items-center justify-between">
                       <div className="flex items-center gap-2 min-w-0">
                         <div className={`w-6 h-6 rounded-lg flex items-center justify-center shrink-0 ${isCompleted ? 'bg-emerald-500/20 text-emerald-400' : isRunning ? 'bg-purple-500/20 text-purple-400' : 'bg-slate-500/20 text-slate-400'}`}>
                           <i className={`fa-solid ${isCompleted ? 'fa-check' : isRunning ? 'fa-play' : 'fa-pause'} text-[10px]`}></i>
                         </div>
                         <span className="text-xs font-bold text-white truncate">{run.name}</span>
                       </div>
                       <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${isCompleted ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : isRunning ? 'bg-purple-500/10 text-purple-400 border border-purple-500/20' : 'bg-[#1e293f] text-slate-400 border border-[#2d3a5a]'}`}>
                         {run.status}
                       </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 flex-1 bg-[#0f1422] rounded-full overflow-hidden border border-[#1f2a44]">
                        <div className={`h-full rounded-full ${isCompleted ? 'bg-emerald-500' : 'bg-purple-500'}`} style={{width: progressWidth}}></div>
                      </div>
                      <span className="text-[10px] font-bold text-slate-400 shrink-0 w-8 text-right">{progressWidth}</span>
                    </div>
                    <div className="flex items-center justify-between mt-1">
                      <span className="text-[9px] text-slate-500 font-medium">{run.startedAt ? new Date(run.startedAt).toLocaleDateString() : 'No date'}</span>
                      <span className="text-[9px] text-slate-500 font-medium">{isCompleted ? 'Finished' : isRunning ? 'In Progress' : 'Pending'}</span>
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </div>

        {/* RIGHT: Bug Summary */}
        <div className="bg-[#0f1422] border border-[#192238] rounded-2xl p-5 shadow-sm flex flex-col">
          <div className="flex items-center justify-between mb-5">
            <h3 className="text-sm font-bold text-white">Bug Summary</h3>
            <span className="text-[10px] font-bold text-purple-400 cursor-pointer hover:text-purple-300 transition">View Bugs</span>
          </div>
          <div className="flex-1 flex flex-col gap-3 justify-center">
            <div className="flex items-center justify-between p-3 bg-[#161d2f] border border-[#1f2a44] rounded-xl hover:border-[#2d3a5a] transition group cursor-pointer">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-red-500/10 flex items-center justify-center border border-red-500/20 group-hover:bg-red-500/20 transition"><i className="fa-solid fa-bug text-red-400 text-xs"></i></div>
                <span className="text-xs font-bold text-slate-300 group-hover:text-white transition">Open</span>
              </div>
              <span className="text-sm font-extrabold text-white">{openBugs}</span>
            </div>
            <div className="flex items-center justify-between p-3 bg-[#161d2f] border border-[#1f2a44] rounded-xl hover:border-[#2d3a5a] transition group cursor-pointer">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-purple-500/10 flex items-center justify-center border border-purple-500/20 group-hover:bg-purple-500/20 transition"><i className="fa-solid fa-spinner text-purple-400 text-xs"></i></div>
                <span className="text-xs font-bold text-slate-300 group-hover:text-white transition">In Progress</span>
              </div>
              <span className="text-sm font-extrabold text-white">{inProgBugs}</span>
            </div>
            <div className="flex items-center justify-between p-3 bg-[#161d2f] border border-[#1f2a44] rounded-xl hover:border-[#2d3a5a] transition group cursor-pointer">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-emerald-500/10 flex items-center justify-center border border-emerald-500/20 group-hover:bg-emerald-500/20 transition"><i className="fa-solid fa-wrench text-emerald-400 text-xs"></i></div>
                <span className="text-xs font-bold text-slate-300 group-hover:text-white transition">Fixed</span>
              </div>
              <span className="text-sm font-extrabold text-white">{fixedBugs}</span>
            </div>
            <div className="flex items-center justify-between p-3 bg-[#161d2f] border border-[#1f2a44] rounded-xl hover:border-[#2d3a5a] transition group cursor-pointer">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-slate-500/10 flex items-center justify-center border border-slate-500/20 group-hover:bg-slate-500/20 transition"><i className="fa-solid fa-check-double text-slate-400 text-xs"></i></div>
                <span className="text-xs font-bold text-slate-300 group-hover:text-white transition">Closed</span>
              </div>
              <span className="text-sm font-extrabold text-white">{closedBugs}</span>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}

// ----------------------------------------------------------------------
// Test Cases Tab (Redesigned Table)
// ----------------------------------------------------------------------
function TestCases({ projectId, currentUser, projects }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterTab, setFilterTab] = useState('All');
  
  // Existing functionality states
  const [showModal, setShowModal] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const defaultForm = { title: '', description: '', module: '', status: 'Active', priority: 'Medium', expectedResult: '' };
  const [newForms, setNewForms] = useState([{ ...defaultForm }]);
  const [editForm, setEditForm] = useState({ ...defaultForm });

  const role = getRole(projectId, projects, currentUser);
  const canEdit = role === 'Admin' || role === 'Editor';
  const canDelete = role === 'Admin';

  const fetchItems = async () => {
    try {
      setLoading(true);
      const data = await apiClient(`/test-cases?projectId=${projectId}`);
      setItems(data.testCases || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (projectId) fetchItems();
  }, [projectId]);

  // Handlers mapping to original logic
  const handleSubmitEdit = async (e) => {
    e.preventDefault();
    try {
      await apiClient(`/test-cases/${editingItem.id}`, { method: 'PATCH', body: editForm });
      setShowModal(false);
      setEditingItem(null);
      fetchItems();
    } catch (err) { alert(err.message || 'Failed to update test case'); }
  };
  const handleBulkSubmit = async (e) => {
    e.preventDefault();
    try {
      await Promise.all(newForms.map(async (f) => {
        if (f.title.trim()) await apiClient('/test-cases', { method: 'POST', body: { ...f, projectId } });
      }));
      setNewForms([{ ...defaultForm }]);
      setShowModal(false);
      fetchItems();
    } catch (err) { alert(err.message || 'Failed to create test cases'); }
  };
  const updateNewForm = (index, field, value) => {
    const updated = [...newForms];
    updated[index][field] = value;
    setNewForms(updated);
  };
  const addRow = () => setNewForms([...newForms, { ...defaultForm, priority: newForms[0]?.priority || 'Medium', status: newForms[0]?.status || 'Active' }]);
  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure?')) return;
    try { await apiClient(`/test-cases/${id}`, { method: 'DELETE' }); fetchItems(); } 
    catch (err) { alert(err.message || 'Failed to delete'); }
  };
  const openEdit = (item) => {
    setEditingItem(item);
    setEditForm({ title: item.title, description: item.description || '', module: item.module || '', status: item.status || 'Active', priority: item.priority || 'Medium', expectedResult: item.expectedResult || '' });
    setShowModal(true);
  };

  if (loading) return <div className="p-20 text-center flex items-center justify-center"><i className="fa-solid fa-circle-notch fa-spin text-3xl text-purple-500"></i></div>;

  return (
    <div className="bg-[#0f1422] border border-[#192238] rounded-2xl flex flex-col shadow-sm overflow-hidden">
      
      {/* Table Header Area */}
      <div className="p-5 border-b border-[#192238]">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
          <h2 className="text-lg font-bold text-white flex items-center gap-2">Test Cases</h2>
          {canEdit && (
             <button onClick={() => { setEditingItem(null); setNewForms([{ ...defaultForm }]); setShowModal(true); }} className="px-4 py-2 bg-[#5922cf] hover:bg-[#682ae6] text-white rounded-xl text-xs font-bold shadow-lg shadow-purple-900/30 transition flex items-center gap-2">
               <i className="fa-solid fa-plus"></i> New Test Case
             </button>
          )}
        </div>
        
        {/* Filter Tabs & Controls */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-4 border-b border-[#1f2a44] w-full md:w-auto">
             {['All', 'Not Tested', 'In Progress', 'Passed', 'Failed'].map(tab => (
               <button 
                 key={tab} 
                 onClick={() => setFilterTab(tab)}
                 className={`pb-2 text-xs font-bold transition-colors border-b-2 ${filterTab === tab ? 'border-purple-500 text-purple-400' : 'border-transparent text-slate-400 hover:text-white'}`}
               >
                 {tab}
               </button>
             ))}
          </div>
          <div className="flex items-center gap-2 w-full md:w-auto">
             <div className="relative flex-1 md:w-48">
               <i className="fa-solid fa-magnifying-glass absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-[10px]"></i>
               <input type="text" placeholder="Search..." className="w-full bg-[#161d2f] border border-[#1f2a44] rounded-lg pl-8 pr-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-purple-500 transition shadow-inner" />
             </div>
             <button className="flex items-center gap-2 bg-[#161d2f] border border-[#1f2a44] rounded-lg px-3 py-1.5 text-xs font-bold text-slate-300 hover:text-white transition">
               <i className="fa-solid fa-filter text-slate-500"></i> Filter
             </button>
             <button className="w-8 h-8 flex items-center justify-center bg-[#161d2f] border border-[#1f2a44] rounded-lg text-slate-400 hover:text-white transition shrink-0">
               <i className="fa-solid fa-ellipsis-vertical text-xs"></i>
             </button>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        {items.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-20">
             <i className="fa-solid fa-list-check text-4xl text-slate-600 mb-4 opacity-50"></i>
             <h3 className="text-base font-bold text-white mb-1">No test cases found</h3>
             <p className="text-xs text-slate-400">Create your first test case to get started.</p>
          </div>
        ) : (
          <table className="w-full text-left text-xs whitespace-nowrap">
            <thead className="bg-[#161d2f]/50 text-slate-400 uppercase font-bold text-[10px] tracking-wider border-b border-[#1f2a44]">
              <tr>
                <th className="py-3 px-4 w-10"><input type="checkbox" className="rounded border-slate-600 bg-[#0f1422] checked:bg-purple-500" disabled /></th>
                <th className="py-3 px-4 w-20">ID</th>
                <th className="py-3 px-4">Title</th>
                <th className="py-3 px-4">Module</th>
                <th className="py-3 px-4">Assigned To</th>
                <th className="py-3 px-4">Priority</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4">Last Run</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1f2a44] text-slate-300 font-medium">
              {items.map(item => (
                <tr key={item.id} className="hover:bg-[#161d2f] transition group">
                  <td className="py-3 px-4"><input type="checkbox" className="rounded border-slate-600 bg-[#0f1422] checked:bg-purple-500 cursor-pointer" /></td>
                  <td className="py-3 px-4 font-mono text-slate-500 text-[10px]">TC-{item.id.substring(0,4).toUpperCase()}</td>
                  <td className="py-3 px-4 font-bold text-white max-w-[200px] truncate">{item.title}</td>
                  <td className="py-3 px-4 text-[10px] text-slate-400">{item.module || '-'}</td>
                  <td className="py-3 px-4">
                     <div className="flex items-center gap-2">
                       <div className="w-5 h-5 rounded-full bg-slate-700 flex items-center justify-center overflow-hidden border border-[#0f1422]">
                         <span className="text-[8px] font-bold text-white">-</span>
                       </div>
                       <span className="text-[10px] text-slate-500">Unassigned</span>
                     </div>
                  </td>
                  <td className="py-3 px-4">
                     <div className="flex items-center gap-1.5">
                       <span className={`w-2 h-2 rounded-full ${item.priority === 'High' ? 'bg-red-500 shadow-[0_0_5px_#ef4444]' : item.priority === 'Medium' ? 'bg-amber-500 shadow-[0_0_5px_#f59e0b]' : 'bg-emerald-500 shadow-[0_0_5px_#10b981]'}`}></span>
                       <span className="text-[10px]">{item.priority}</span>
                     </div>
                  </td>
                  <td className="py-3 px-4">
                     {/* Using API status directly for visual styling as a pill */}
                     <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                       item.status === 'Active' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 
                       item.status === 'Draft' ? 'bg-amber-500/10 text-amber-400 border-amber-500/20' : 
                       'bg-slate-500/10 text-slate-400 border-slate-500/20'
                     }`}>
                       {item.status}
                     </span>
                  </td>
                  <td className="py-3 px-4 text-slate-500">-</td>
                  <td className="py-3 px-4 text-right">
                     <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition">
                       {canEdit && <button onClick={() => openEdit(item)} className="w-6 h-6 rounded flex items-center justify-center hover:bg-[#1a2333] hover:text-white text-slate-400 transition"><i className="fa-solid fa-pen text-[10px]"></i></button>}
                       {canDelete && <button onClick={() => handleDelete(item.id)} className="w-6 h-6 rounded flex items-center justify-center hover:bg-red-500/20 hover:text-red-400 text-slate-400 transition"><i className="fa-solid fa-trash text-[10px]"></i></button>}
                     </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      
      {/* Test Case Modals (Re-using original functionality) */}
      {showModal && (
        <div className="fixed inset-0 flex items-center justify-center z-50 bg-black/60 backdrop-blur-sm p-4 overflow-y-auto">
          <div className={`bg-[#101524] p-6 rounded-2xl border border-[#192238] w-full ${editingItem ? 'max-w-md' : 'max-w-5xl'} shadow-2xl`}>
            <h2 className="text-lg text-white font-bold mb-4">{editingItem ? 'Edit Test Case' : 'New Test Cases'}</h2>
            
            {editingItem ? (
              <form onSubmit={handleSubmitEdit} className="flex flex-col gap-4">
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Title <span className="text-red-500">*</span></label>
                  <input required value={editForm.title} onChange={e => setEditForm({...editForm, title: e.target.value})} className="w-full bg-[#161d2f] border border-[#1f2a44] rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-purple-500 transition shadow-inner" />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Description</label>
                  <textarea value={editForm.description} onChange={e => setEditForm({...editForm, description: e.target.value})} rows="2" className="w-full bg-[#161d2f] border border-[#1f2a44] rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-purple-500 transition shadow-inner" />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Module</label>
                  <input value={editForm.module} onChange={e => setEditForm({...editForm, module: e.target.value})} className="w-full bg-[#161d2f] border border-[#1f2a44] rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-purple-500 transition shadow-inner" />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Expected Result</label>
                  <textarea value={editForm.expectedResult} onChange={e => setEditForm({...editForm, expectedResult: e.target.value})} rows="2" className="w-full bg-[#161d2f] border border-[#1f2a44] rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-purple-500 transition shadow-inner" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Status</label>
                    <select value={editForm.status} onChange={e => setEditForm({...editForm, status: e.target.value})} className="w-full bg-[#161d2f] border border-[#1f2a44] rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-purple-500 transition shadow-inner">
                      <option>Active</option><option>Draft</option><option>Deprecated</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Priority</label>
                    <select value={editForm.priority} onChange={e => setEditForm({...editForm, priority: e.target.value})} className="w-full bg-[#161d2f] border border-[#1f2a44] rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-purple-500 transition shadow-inner">
                      <option>Low</option><option>Medium</option><option>High</option>
                    </select>
                  </div>
                </div>
                <div className="flex justify-end gap-3 mt-4 pt-4 border-t border-[#1f2a44]">
                  <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2 text-slate-400 text-xs font-bold hover:text-white transition">Cancel</button>
                  <button type="submit" className="px-5 py-2 bg-[#5922cf] hover:bg-[#682ae6] text-white rounded-lg text-xs font-bold transition shadow-lg shadow-purple-900/30">Save</button>
                </div>
              </form>
            ) : (
              <form onSubmit={handleBulkSubmit} className="flex flex-col gap-4">
                <div className="overflow-x-auto border border-[#1e293f] rounded-xl">
                  <table className="w-full text-left text-xs text-slate-300">
                    <thead className="bg-[#161d2f] border-b border-[#1e293f] text-[10px] font-bold uppercase text-slate-400">
                      <tr>
                        <th className="px-3 py-2 w-10 text-center">#</th>
                        <th className="px-3 py-2">Title <span className="text-red-500">*</span></th>
                        <th className="px-3 py-2 w-32">Module</th>
                        <th className="px-3 py-2 w-28">Priority</th>
                        <th className="px-3 py-2 w-28">Status</th>
                        <th className="px-3 py-2">Expected Result</th>
                        <th className="px-3 py-2 w-10 text-center"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#1f2a44]">
                      {newForms.map((f, index) => (
                        <tr key={index} className="bg-[#0f1422] hover:bg-[#161d2f] transition">
                          <td className="px-3 py-2 text-center text-slate-500 font-mono text-[10px]">{index + 1}</td>
                          <td className="px-3 py-2"><input required value={f.title} onChange={e => updateNewForm(index, 'title', e.target.value)} placeholder="Title" className="w-full bg-[#161d2f] border border-[#1f2a44] rounded px-2 py-1.5 text-xs text-white focus:outline-none focus:border-purple-500 transition" /></td>
                          <td className="px-3 py-2"><input value={f.module} onChange={e => updateNewForm(index, 'module', e.target.value)} placeholder="Module" className="w-full bg-[#161d2f] border border-[#1f2a44] rounded px-2 py-1.5 text-xs text-white focus:outline-none focus:border-purple-500 transition" /></td>
                          <td className="px-3 py-2">
                            <select value={f.priority} onChange={e => updateNewForm(index, 'priority', e.target.value)} className="w-full bg-[#161d2f] border border-[#1f2a44] rounded px-2 py-1.5 text-xs text-white focus:outline-none focus:border-purple-500 transition">
                              <option>Low</option><option>Medium</option><option>High</option>
                            </select>
                          </td>
                          <td className="px-3 py-2">
                            <select value={f.status} onChange={e => updateNewForm(index, 'status', e.target.value)} className="w-full bg-[#161d2f] border border-[#1f2a44] rounded px-2 py-1.5 text-xs text-white focus:outline-none focus:border-purple-500 transition">
                              <option>Active</option><option>Draft</option><option>Deprecated</option>
                            </select>
                          </td>
                          <td className="px-3 py-2"><input value={f.expectedResult} onChange={e => updateNewForm(index, 'expectedResult', e.target.value)} placeholder="Expected..." className="w-full bg-[#161d2f] border border-[#1f2a44] rounded px-2 py-1.5 text-xs text-white focus:outline-none focus:border-purple-500 transition" /></td>
                          <td className="px-3 py-2 text-center">
                            {newForms.length > 1 && (
                              <button type="button" onClick={() => setNewForms(newForms.filter((_, i) => i !== index))} className="w-6 h-6 rounded flex items-center justify-center text-slate-500 hover:text-red-400 hover:bg-red-500/10 transition" title="Remove row">
                                <i className="fa-solid fa-xmark text-[10px]"></i>
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="flex justify-start">
                  <button type="button" onClick={addRow} className="text-xs text-purple-400 hover:text-purple-300 font-bold flex items-center gap-2 transition">
                    <i className="fa-solid fa-plus"></i> Add Test Case
                  </button>
                </div>
                <div className="flex justify-end gap-3 mt-4 pt-4 border-t border-[#1f2a44]">
                  <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2 text-slate-400 text-xs font-bold hover:text-white transition">Cancel</button>
                  <button type="submit" className="px-5 py-2 bg-[#5922cf] hover:bg-[#682ae6] text-white rounded-lg text-xs font-bold transition shadow-lg shadow-purple-900/30">Create {newForms.length} Test Case{newForms.length !== 1 ? 's' : ''}</button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ----------------------------------------------------------------------
// Test Runs & Bugs tabs are preserved from original implementation with 
// light structural/class changes for visual consistency.
// ----------------------------------------------------------------------

function getRole(projectId, projects, currentUser) {
  const project = projects.find(p => p.id === projectId);
  if (!project || !currentUser) return 'Viewer';
  if (project.owner?.id === currentUser.id) return 'Admin';
  if (project.members && project.members.length > 0) return project.members[0].role;
  return 'Viewer';
}

function TestRuns({ projectId, currentUser, projects }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ name: '', status: 'Pending' });

  const role = getRole(projectId, projects, currentUser);
  const canEdit = role === 'Admin' || role === 'Editor';

  const fetchItems = async () => {
    try {
      setLoading(true);
      const data = await apiClient(`/test-runs?projectId=${projectId}`);
      setItems(data.testRuns || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (projectId) fetchItems();
  }, [projectId]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      await apiClient('/test-runs', { method: 'POST', body: { ...form, projectId } });
      setShowModal(false);
      setForm({ name: '', status: 'Pending' });
      fetchItems();
    } catch (err) {
      alert(err.message || 'Failed to create run');
    }
  };

  const handleStatusChange = async (id, newStatus) => {
    try {
      await apiClient(`/test-runs/${id}`, { method: 'PATCH', body: { status: newStatus } });
      fetchItems();
    } catch (err) {
      alert(err.message || 'Failed to update');
    }
  };

  if (loading) return <div className="p-20 text-center flex items-center justify-center"><i className="fa-solid fa-circle-notch fa-spin text-3xl text-purple-500"></i></div>;

  return (
    <div className="bg-[#0f1422] border border-[#192238] rounded-2xl flex flex-col shadow-sm overflow-hidden p-6 gap-6">
      <div className="flex items-center justify-between border-b border-[#1f2a44] pb-4">
         <h2 className="text-lg font-bold text-white flex items-center gap-2"><i className="fa-solid fa-person-running text-slate-400"></i> Test Runs</h2>
         {canEdit && (
           <button onClick={() => setShowModal(true)} className="px-4 py-2 bg-[#5922cf] hover:bg-[#682ae6] text-white rounded-xl text-xs font-bold shadow-lg shadow-purple-900/30 transition flex items-center gap-2">
             <i className="fa-solid fa-plus"></i> New Test Run
           </button>
         )}
      </div>

      {items.length === 0 ? (
        <div className="flex flex-col items-center justify-center p-20 bg-[#161d2f] border border-[#1f2a44] border-dashed rounded-xl">
           <i className="fa-solid fa-person-running text-4xl text-slate-600 mb-4 opacity-50"></i>
           <h3 className="text-base font-bold text-white mb-1">No test runs yet</h3>
           <p className="text-xs text-slate-400">Create a test run to track execution of your test cases.</p>
        </div>
      ) : (
        <div className="grid gap-6">
          {items.map(item => (
            <div key={item.id} className="bg-[#161d2f] border border-[#1f2a44] rounded-xl p-5 hover:border-[#2d3a5a] transition">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-4 gap-4">
                <div className="font-bold text-base text-white">{item.name}</div>
                <div className="flex items-center gap-3">
                  <select disabled={!canEdit} value={item.status} onChange={e => handleStatusChange(item.id, e.target.value)} className="bg-[#0f1422] border border-[#1f2a44] rounded-lg text-xs font-bold px-3 py-1.5 text-white disabled:opacity-50 focus:outline-none focus:border-purple-500">
                    <option>Pending</option><option>Running</option><option>Completed</option>
                  </select>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-4 text-[10px] text-slate-400 font-medium mb-5 bg-[#0f1422] px-3 py-2 rounded-lg border border-[#1f2a44]">
                <span><i className="fa-solid fa-user text-slate-500 mr-1"></i> {item.executor?.name || 'Unassigned'}</span>
                <span><i className="fa-regular fa-clock text-slate-500 mr-1"></i> Started: {item.startedAt ? new Date(item.startedAt).toLocaleDateString() : 'N/A'}</span>
                <span><i className="fa-solid fa-check text-slate-500 mr-1"></i> Completed: {item.completedAt ? new Date(item.completedAt).toLocaleDateString() : 'N/A'}</span>
              </div>
              
              <TestResults testRunId={item.id} canEdit={canEdit} projectId={projectId} />
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 flex items-center justify-center z-50 bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-[#101524] p-6 rounded-2xl border border-[#192238] w-full max-w-md shadow-2xl">
            <h2 className="text-lg text-white font-bold mb-4">New Test Run</h2>
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Run Name <span className="text-red-500">*</span></label>
                <input required value={form.name} onChange={e => setForm({...form, name: e.target.value})} placeholder="E.g., Release 1.0 Validation" className="w-full bg-[#161d2f] border border-[#1f2a44] rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-purple-500 transition shadow-inner" />
              </div>
              <div className="flex justify-end gap-3 mt-4 pt-4 border-t border-[#1f2a44]">
                <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2 text-slate-400 text-xs font-bold hover:text-white transition">Cancel</button>
                <button type="submit" className="px-5 py-2 bg-[#5922cf] hover:bg-[#682ae6] text-white rounded-lg text-xs font-bold shadow-lg shadow-purple-900/30 transition">Create Run</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

// Nested TestResults
function TestResults({ testRunId, canEdit, projectId }) {
  const [results, setResults] = useState([]);
  const [testCases, setTestCases] = useState([]);
  const [loading, setLoading] = useState(true);

  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ testCaseId: '', status: 'Pending', actualResult: '' });

  const fetchResults = async () => {
    try {
      const data = await apiClient(`/test-results?testRunId=${testRunId}`);
      setResults(data.testResults || []);
    } catch (err) {}
  };

  const fetchTestCases = async () => {
    try {
      const data = await apiClient(`/test-cases?projectId=${projectId}`);
      setTestCases(data.testCases || []);
    } catch (err) {}
  };

  useEffect(() => {
    const init = async () => {
      setLoading(true);
      await fetchResults();
      await fetchTestCases();
      setLoading(false);
    };
    init();
  }, [testRunId, projectId]);

  const handleAdd = async (e) => {
    e.preventDefault();
    try {
      await apiClient('/test-results', { method: 'POST', body: { ...form, testRunId } });
      setShowAdd(false);
      setForm({ testCaseId: '', status: 'Pending', actualResult: '' });
      fetchResults();
    } catch (err) {
      alert(err.message || 'Failed to add result');
    }
  };

  const handleUpdate = async (id, status) => {
    try {
      await apiClient(`/test-results/${id}`, { method: 'PATCH', body: { status } });
      fetchResults();
    } catch (err) {
      alert(err.message || 'Failed to update result');
    }
  };

  if (loading) return <div className="text-[10px] text-slate-500 font-medium">Loading results...</div>;

  return (
    <div className="bg-[#0f1422] p-4 rounded-xl border border-[#1f2a44]">
      <div className="flex justify-between items-center mb-3">
        <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Executed Results</h4>
        {canEdit && (
          <button onClick={() => setShowAdd(!showAdd)} className="text-[9px] font-bold bg-[#1e293f] hover:bg-[#2d3b55] text-white px-2 py-1 rounded transition uppercase">
            {showAdd ? 'Cancel' : '+ Add Result'}
          </button>
        )}
      </div>

      {showAdd && (
        <form onSubmit={handleAdd} className="flex flex-col md:flex-row gap-3 mb-4 bg-[#161d2f] p-3 rounded-lg border border-[#1f2a44]">
          <select required value={form.testCaseId} onChange={e => setForm({...form, testCaseId: e.target.value})} className="flex-1 bg-[#0f1422] text-xs text-white border border-[#1f2a44] rounded px-3 py-1.5 focus:border-purple-500 focus:outline-none">
            <option value="" disabled>Select Test Case</option>
            {testCases.map(tc => <option key={tc.id} value={tc.id}>{tc.title}</option>)}
          </select>
          <select value={form.status} onChange={e => setForm({...form, status: e.target.value})} className="bg-[#0f1422] text-xs text-white border border-[#1f2a44] rounded px-3 py-1.5 focus:border-purple-500 focus:outline-none">
            <option>Pending</option><option>Passed</option><option>Failed</option><option>Blocked</option><option>Skipped</option>
          </select>
          <input value={form.actualResult} onChange={e => setForm({...form, actualResult: e.target.value})} placeholder="Actual Result (opt)" className="flex-1 bg-[#0f1422] text-xs text-white border border-[#1f2a44] rounded px-3 py-1.5 focus:border-purple-500 focus:outline-none" />
          <button type="submit" className="bg-[#5922cf] hover:bg-[#682ae6] text-white text-[10px] font-bold px-4 rounded shadow-lg shadow-purple-900/30 transition">Save</button>
        </form>
      )}

      {results.length === 0 ? (
        <div className="text-[10px] text-slate-500 italic bg-[#161d2f] p-3 rounded-lg border border-dashed border-[#1f2a44] text-center">No results logged for this run.</div>
      ) : (
        <div className="flex flex-col gap-1 border border-[#1f2a44] rounded-lg overflow-hidden bg-[#161d2f]">
          {results.map(r => (
            <div key={r.id} className="flex flex-col sm:flex-row sm:items-center justify-between text-[11px] py-2 px-3 border-b border-[#1f2a44] last:border-0 hover:bg-[#1a2333] transition group gap-2">
              <div className="text-white font-bold truncate max-w-[50%]">{r.testCase?.title || 'Unknown Case'}</div>
              <div className="flex items-center justify-between sm:justify-end gap-3 flex-1">
                <span className="text-slate-400 truncate max-w-[150px]">{r.actualResult || '-'}</span>
                <select disabled={!canEdit} value={r.status} onChange={e => handleUpdate(r.id, e.target.value)} className={`bg-transparent outline-none disabled:opacity-75 font-bold cursor-pointer ${r.status === 'Passed' ? 'text-emerald-400' : r.status === 'Failed' ? 'text-red-400' : r.status === 'Blocked' ? 'text-amber-400' : 'text-slate-400'}`}>
                  <option className="text-slate-900">Pending</option>
                  <option className="text-slate-900">Passed</option>
                  <option className="text-slate-900">Failed</option>
                  <option className="text-slate-900">Blocked</option>
                  <option className="text-slate-900">Skipped</option>
                </select>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Bugs({ projectId, currentUser, projects }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  
  const [form, setForm] = useState({ title: '', description: '', type: 'Bug', severity: 'Medium', status: 'Open', assigneeId: '' });
  
  const [projectMembers, setProjectMembers] = useState([]);

  const role = getRole(projectId, projects, currentUser);
  const canEdit = role === 'Admin' || role === 'Editor';
  const canDelete = role === 'Admin';

  const fetchItems = async () => {
    try {
      setLoading(true);
      const data = await apiClient(`/bugs?projectId=${projectId}`);
      setItems(data.bugs || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (projectId) {
      fetchItems();
      const loadMembers = async () => {
        try {
          const pData = await apiClient(`/projects/${projectId}`);
          let members = pData.project.members || [];
          const owner = pData.project.owner;
          if (!members.some(m => m.user.id === owner.id)) {
             members.push({ user: owner });
          }
          setProjectMembers(members);
        } catch (e) {}
      };
      loadMembers();
    }
  }, [projectId]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const payload = { ...form, assigneeId: form.assigneeId || null };
      if (editingItem) {
        await apiClient(`/bugs/${editingItem.id}`, { method: 'PATCH', body: payload });
      } else {
        await apiClient('/bugs', { method: 'POST', body: { ...payload, projectId } });
      }
      setShowModal(false);
      setEditingItem(null);
      setForm({ title: '', description: '', type: 'Bug', severity: 'Medium', status: 'Open', assigneeId: '' });
      fetchItems();
    } catch (err) {
      alert(err.message || 'Failed to save bug');
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure?')) return;
    try {
      await apiClient(`/bugs/${id}`, { method: 'DELETE' });
      fetchItems();
    } catch (err) {
      alert(err.message || 'Failed to delete');
    }
  };

  const openEdit = (item) => {
    setEditingItem(item);
    setForm({
      title: item.title, description: item.description || '', type: item.type || 'Bug',
      severity: item.severity || 'Medium', status: item.status || 'Open', assigneeId: item.assignee?.id || ''
    });
    setShowModal(true);
  };

  if (loading) return <div className="p-20 text-center flex items-center justify-center"><i className="fa-solid fa-circle-notch fa-spin text-3xl text-purple-500"></i></div>;

  return (
    <div className="bg-[#0f1422] border border-[#192238] rounded-2xl flex flex-col shadow-sm overflow-hidden p-6 gap-6">
      
      <div className="flex items-center justify-between border-b border-[#1f2a44] pb-4">
         <h2 className="text-lg font-bold text-white flex items-center gap-2"><i className="fa-solid fa-bug text-slate-400"></i> Bug Tracking</h2>
         {canEdit && (
           <button onClick={() => { setEditingItem(null); setForm({ title: '', description: '', type: 'Bug', severity: 'Medium', status: 'Open', assigneeId: '' }); setShowModal(true); }} className="px-4 py-2 bg-[#5922cf] hover:bg-[#682ae6] text-white rounded-xl text-xs font-bold shadow-lg shadow-purple-900/30 transition flex items-center gap-2">
             <i className="fa-solid fa-plus"></i> Report Bug
           </button>
         )}
      </div>

      {items.length === 0 ? (
        <div className="flex flex-col items-center justify-center p-20 bg-[#161d2f] border border-[#1f2a44] border-dashed rounded-xl">
           <i className="fa-solid fa-bug-slash text-4xl text-slate-600 mb-4 opacity-50"></i>
           <h3 className="text-base font-bold text-white mb-1">No bugs reported</h3>
           <p className="text-xs text-slate-400">Great job! Keep the quality high.</p>
        </div>
      ) : (
        <div className="grid gap-4">
          {items.map(item => (
            <div key={item.id} className="bg-[#161d2f] border border-[#1f2a44] rounded-xl p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:border-[#2d3a5a] transition group">
              <div className="flex-1 min-w-0">
                <div className="font-bold text-base text-white mb-2 truncate">{item.title}</div>
                <div className="flex flex-wrap items-center gap-2 text-[10px] text-slate-400 font-medium">
                  <span className={`px-2 py-1 rounded font-bold uppercase tracking-wider ${item.severity === 'High' || item.severity === 'Critical' ? 'bg-red-500/10 text-red-400 border border-red-500/20' : 'bg-[#0f1422] border border-[#2d3b55] text-white'}`}>{item.severity}</span>
                  <span className={`px-2 py-1 rounded font-bold uppercase tracking-wider ${item.status === 'Resolved' || item.status === 'Closed' || item.status === 'Done' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'}`}>{item.status}</span>
                  <span className="bg-[#0f1422] border border-[#1f2a44] px-2 py-1 rounded"><i className="fa-solid fa-tag mr-1 text-slate-500"></i> {item.type}</span>
                  {item.assignee && <span className="bg-[#0f1422] border border-[#1f2a44] px-2 py-1 rounded"><i className="fa-solid fa-user mr-1 text-slate-500"></i> Assigned: {item.assignee.name}</span>}
                </div>
              </div>
              <div className="flex items-center gap-2 opacity-100 md:opacity-0 group-hover:opacity-100 transition">
                {canEdit && <button onClick={() => openEdit(item)} className="w-8 h-8 rounded-lg flex items-center justify-center bg-[#0f1422] border border-[#1f2a44] hover:bg-[#1a2333] hover:text-white text-slate-400 transition"><i className="fa-solid fa-pen text-xs"></i></button>}
                {canDelete && <button onClick={() => handleDelete(item.id)} className="w-8 h-8 rounded-lg flex items-center justify-center bg-[#0f1422] border border-[#1f2a44] hover:bg-red-500/20 hover:text-red-400 text-slate-400 transition"><i className="fa-solid fa-trash text-xs"></i></button>}
              </div>
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 flex items-center justify-center z-50 bg-black/60 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="bg-[#101524] p-6 rounded-2xl border border-[#192238] w-full max-w-lg shadow-2xl">
            <h2 className="text-lg text-white font-bold mb-5">{editingItem ? 'Edit Bug' : 'Report Bug'}</h2>
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Bug Title <span className="text-red-500">*</span></label>
                <input required value={form.title} onChange={e => setForm({...form, title: e.target.value})} className="w-full bg-[#161d2f] border border-[#1f2a44] rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-purple-500 transition shadow-inner" />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Description</label>
                <textarea value={form.description} onChange={e => setForm({...form, description: e.target.value})} rows="3" className="w-full bg-[#161d2f] border border-[#1f2a44] rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-purple-500 transition shadow-inner" />
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Type</label>
                  <select value={form.type} onChange={e => setForm({...form, type: e.target.value})} className="w-full bg-[#161d2f] border border-[#1f2a44] rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-purple-500 transition shadow-inner">
                    <option>Bug</option><option>UI Issue</option><option>Performance</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Severity</label>
                  <select value={form.severity} onChange={e => setForm({...form, severity: e.target.value})} className="w-full bg-[#161d2f] border border-[#1f2a44] rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-purple-500 transition shadow-inner">
                    <option>Low</option><option>Medium</option><option>High</option><option>Critical</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Status</label>
                  <select value={form.status} onChange={e => setForm({...form, status: e.target.value})} className="w-full bg-[#161d2f] border border-[#1f2a44] rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-purple-500 transition shadow-inner">
                    <option>Open</option><option>In Progress</option><option>Resolved</option><option>Closed</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Assign To</label>
                  <select value={form.assigneeId} onChange={e => setForm({...form, assigneeId: e.target.value})} className="w-full bg-[#161d2f] border border-[#1f2a44] rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-purple-500 transition shadow-inner">
                    <option value="">Unassigned</option>
                    {projectMembers.map(m => <option key={m.user.id} value={m.user.id}>{m.user.name}</option>)}
                  </select>
                </div>
              </div>

              <div className="flex justify-end gap-3 mt-4 pt-4 border-t border-[#1f2a44]">
                <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2 text-slate-400 text-xs font-bold hover:text-white transition">Cancel</button>
                <button type="submit" className="px-5 py-2 bg-[#5922cf] hover:bg-[#682ae6] text-white rounded-lg text-xs font-bold shadow-lg shadow-purple-900/30 transition">Save Bug</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}