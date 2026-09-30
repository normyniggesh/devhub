import { useState, useEffect } from 'react';
import { apiClient } from '../api/client';
import { Link, useNavigate } from 'react-router-dom';
import { useStore } from '../store';
import StatCard from '../components/common/StatCard';
import ProgressBar from '../components/common/ProgressBar';
import LoadingState from '../components/common/LoadingState';
import ErrorState from '../components/common/ErrorState';
import ActivityFeed from '../components/activity/ActivityFeed';

export default function Dashboard() {
  const { currentUser } = useStore();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [categoryFilter, setCategoryFilter] = useState('All');
  const [isViewingAll, setIsViewingAll] = useState(false);
  const [allActivity, setAllActivity] = useState(null);
  const [activityLoading, setActivityLoading] = useState(false);

  const handleToggleViewAll = async () => {
    if (!isViewingAll) {
      if (!allActivity) {
        setActivityLoading(true);
        try {
          const res = await apiClient('/activity?all=true&limit=30');
          setAllActivity(res.activity || []);
        } catch (e) {
          console.error('Failed to fetch all activity:', e);
        } finally {
          setActivityLoading(false);
        }
      }
      setIsViewingAll(true);
    } else {
      setIsViewingAll(false);
    }
  };

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const dashRes = await apiClient('/dashboard');
      if (dashRes.dashboard) setData(dashRes.dashboard);
      
      // Keep calendar fetching separate so it doesn't fail the whole dashboard if only calendar fails
      try {
        const calRes = await apiClient(`/calendar/events?start=${new Date().toISOString()}`);
        if (calRes.events) {
          const now = new Date();
          const upcoming = calRes.events.filter(e => new Date(e.endDateTime || e.startDateTime) >= now);
          setEvents(upcoming.slice(0, 5));
        }
      } catch (calErr) {
        console.error('Failed to fetch calendar events', calErr);
      }
    } catch (err) {
      console.error('Failed to fetch dashboard data', err);
      setError(err.message || 'Unable to load dashboard data.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  if (loading) {
    return <LoadingState message="Loading dashboard..." />;
  }

  if (error) {
    return <ErrorState error={error} onRetry={fetchData} message="Unable to load dashboard data" />;
  }

  const dashboardData = data || {};

  const totalTasks = dashboardData.totalTasks || 0;
  const dueToday = dashboardData.dueToday || 0;
  const inProgressTasks = dashboardData.inProgressTasks || 0;
  const completedTasks = dashboardData.completedTasks || 0;
  const toDoTasks = dashboardData.toDoTasks || 0;
  const projectOverview = Array.isArray(dashboardData.projectOverview) ? dashboardData.projectOverview : [];
  const qaData = dashboardData.qaStatus || {};
  const qaStatus = {
    Passed: qaData.Passed || 0,
    Failed: qaData.Failed || 0,
    Blocked: qaData.Blocked || 0,
    Skipped: qaData.Skipped || 0,
    OpenBugs: qaData.OpenBugs || 0
  };
  const recentActivity = Array.isArray(dashboardData.recentActivity) ? dashboardData.recentActivity : [];

  // Extract unique categories
  const categories = ['All', ...new Set(projectOverview.map(p => p.category).filter(Boolean))];
  const filteredProjects = categoryFilter === 'All' ? projectOverview : projectOverview.filter(p => p.category === categoryFilter);

  // SVG Ring Chart calculations
  const totalTasksCount = totalTasks;
  const donePct = totalTasksCount > 0 ? (completedTasks / totalTasksCount) * 100 : 0;
  const inProgPct = totalTasksCount > 0 ? (inProgressTasks / totalTasksCount) * 100 : 0;
  // to do pct is remainder

  const totalQa = qaStatus.Passed + qaStatus.Failed + qaStatus.Blocked + qaStatus.Skipped + qaStatus.OpenBugs;
  const qaPassedPct = totalQa > 0 ? (qaStatus.Passed / totalQa) * 100 : 0;
  const qaFailedPct = totalQa > 0 ? (qaStatus.Failed / totalQa) * 100 : 0;


  const getTypeColor = (type) => {
    if (type?.includes('Project')) return 'bg-purple-500';
    if (type?.includes('Task')) return 'bg-blue-500';
    switch (type) {
      case 'Project': return 'bg-purple-500';
      case 'Task': return 'bg-blue-500';
      case 'College': return 'bg-emerald-500';
      case 'Meeting': return 'bg-amber-500';
      case 'Personal': return 'bg-slate-400';
      case 'Milestone': return 'bg-pink-500';
      default: return 'bg-purple-500';
    }
  };

  return (
    <div className="space-y-6">
      {/* Hero Section */}
      <div className="relative bg-gradient-to-r from-[#111624] to-[#0a0d14] rounded-2xl p-8 border border-[#192238] overflow-hidden -mt-4">
        {/* Subtle background graphic */}
        <div className="absolute right-0 top-0 bottom-0 opacity-10 pointer-events-none w-1/2" style={{ background: 'radial-gradient(circle at 100% 50%, #5243d4 0%, transparent 60%)' }}></div>
        <div className="relative z-10">
          <h1 className="text-3xl md:text-4xl font-extrabold text-white tracking-tight mb-2 flex items-center gap-3">
            Good afternoon, {currentUser?.name?.split(' ')[0] || 'there'} <span className="animate-wave inline-block origin-bottom-right">👋</span>
          </h1>
          <p className="text-slate-400 text-sm md:text-base max-w-xl">
            Let's make progress today.
          </p>
        </div>
        <div className="absolute top-8 right-8 hidden md:block text-right">
          <p className="text-sm italic text-slate-400 font-serif leading-relaxed text-opacity-80">
            "Discipline today,<br/>Big results tomorrow."
          </p>
        </div>
      </div>

      {/* 4 Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon="fa-square-check" label="Total Tasks" value={totalTasks} colorClass="text-purple-400" bgClass="bg-purple-500/10 border border-purple-500/20" />
        <StatCard icon="fa-calendar-xmark" label="Due Today" value={dueToday} colorClass="text-rose-400" bgClass="bg-rose-500/10 border border-rose-500/20" />
        <StatCard icon="fa-spinner" label="In Progress" value={inProgressTasks} colorClass="text-blue-400" bgClass="bg-blue-500/10 border border-blue-500/20" />
        <StatCard icon="fa-circle-check" label="Completed" value={completedTasks} colorClass="text-emerald-400" bgClass="bg-emerald-500/10 border border-emerald-500/20" />
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Project Overview (Takes 2 columns on desktop) */}
        <div className="lg:col-span-2 bg-[#0f1422] border border-[#192238] rounded-2xl p-5 flex flex-col">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <i className="fa-regular fa-folder text-slate-400"></i> Project Overview
              </h2>
              <p className="text-[11px] text-slate-400 mt-1">Track progress across all your projects.</p>
            </div>
            <div className="flex items-center gap-3">
              {categories.length > 1 && (
                <div className="flex bg-[#161d2f] rounded-lg p-1">
                  {categories.map(cat => (
                    <button 
                      key={cat}
                      onClick={() => setCategoryFilter(cat)}
                      className={`text-[10px] font-semibold px-2.5 py-1 rounded-md transition ${categoryFilter === cat ? 'bg-purple-600 text-white' : 'text-slate-400 hover:text-slate-200'}`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
              )}
              <Link to="/projects" className="text-xs font-semibold text-slate-300 hover:text-white flex items-center gap-1 bg-[#1a2333] hover:bg-[#253046] px-3 py-1.5 rounded-lg border border-[#2d3a5a] transition">
                View All <i className="fa-solid fa-arrow-right text-[10px]"></i>
              </Link>
            </div>
          </div>

          <div className="flex-1 flex flex-col gap-4">
            {filteredProjects.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full py-8 text-center border border-dashed border-[#1f2a44] rounded-xl bg-[#0c101a]">
                <p className="text-sm font-semibold text-slate-300 mb-1">No projects yet</p>
                <p className="text-xs text-slate-500 mb-4">Create your first project to get started.</p>
                <Link to="/projects" className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white text-xs font-semibold rounded-lg transition">Create Project</Link>
              </div>
            ) : (
              filteredProjects.map(p => (
                <div key={p.id} className="group flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-3 -mx-3 rounded-xl hover:bg-[#151c2d] transition border border-transparent hover:border-[#1f2a44]">
                  <div className="flex items-start sm:items-center gap-3 w-full sm:w-1/3 min-w-0">
                    <div className="w-10 h-10 rounded-lg bg-[#1a2333] border border-[#2d3a5a] flex items-center justify-center shrink-0">
                      <i className="fa-regular fa-folder text-purple-400"></i>
                    </div>
                    <div className="min-w-0">
                      <h3 className="text-sm font-bold text-white truncate cursor-pointer hover:text-purple-400 transition" onClick={() => navigate(`/projects`)}>{p.name}</h3>
                      <p className="text-[10px] text-slate-400 mt-0.5 truncate">{p.category || 'General'} &middot; {p.status}</p>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-4 w-full sm:w-1/2">
                    <ProgressBar value={p.progress} max={100} colorClass="bg-purple-500" />
                  </div>

                  <div className="w-full sm:w-1/6 text-left sm:text-right shrink-0">
                    <span className="text-[10px] font-semibold text-slate-400 bg-[#161d2f] px-2 py-1 rounded">
                      Due {p.dueDate ? new Date(p.dueDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : 'None'}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Calendar Panel */}
        <div className="bg-[#0f1422] border border-[#192238] rounded-2xl p-5 flex flex-col">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <i className="fa-regular fa-calendar text-slate-400"></i> Calendar
            </h2>
            <Link to="/calendar" className="text-xs font-semibold text-slate-300 hover:text-white flex items-center gap-1 bg-[#1a2333] hover:bg-[#253046] px-3 py-1.5 rounded-lg border border-[#2d3a5a] transition">
              View All <i className="fa-solid fa-arrow-right text-[10px]"></i>
            </Link>
          </div>

          <div className="mb-4">
            <h3 className="text-sm font-bold text-white">{new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</h3>
            {/* Simple week representation (visual only) */}
            <div className="flex justify-between items-center mt-3 text-[10px] font-semibold text-slate-500 uppercase tracking-wide">
              {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(day => (
                <div key={day} className="text-center">{day}</div>
              ))}
            </div>
            <div className="flex justify-between items-center mt-1 pb-4 border-b border-[#1f2a44]">
               {/* Faking a week view visually just to match the vibe. Not functional. */}
               {Array.from({length: 7}).map((_, i) => {
                 const d = new Date();
                 d.setDate(d.getDate() - d.getDay() + 1 + i);
                 const isToday = d.getDate() === new Date().getDate();
                 return (
                   <div key={i} className={`text-xs font-bold w-6 h-6 flex items-center justify-center rounded-full ${isToday ? 'bg-purple-600 text-white' : 'text-slate-300'}`}>
                     {d.getDate()}
                   </div>
                 );
               })}
            </div>
          </div>

          <div className="flex-1 flex flex-col gap-3 overflow-y-auto pr-1">
            {events.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full py-6 text-center">
                <p className="text-xs text-slate-500">No upcoming events</p>
              </div>
            ) : (
              events.map(e => {
                const date = new Date(e.startDateTime || e.endDateTime);
                return (
                  <div key={e.id} className="flex gap-3 p-2 hover:bg-[#151c2d] rounded-xl transition cursor-pointer group" onClick={() => {
                    if (e.derived) {
                      if (e.sourceType === 'project') navigate(`/projects`);
                      else if (e.sourceType === 'task') navigate(`/tasks`);
                    } else {
                      navigate(`/calendar`);
                    }
                  }}>
                    <div className="flex flex-col items-center min-w-[40px] shrink-0 mt-0.5">
                      <span className="text-[10px] font-bold text-slate-400 uppercase leading-none mb-1">{date.toLocaleDateString('en-US', { weekday: 'short' })}</span>
                      <span className="text-sm font-bold text-white leading-none">{date.getDate()}</span>
                    </div>
                    <div className="flex-1 min-w-0 border-l-2 border-transparent group-hover:border-purple-500 pl-3 transition-colors">
                      <div className="flex items-center gap-1.5 mb-1">
                        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${getTypeColor(e.type)}`}></span>
                        <h4 className="text-xs font-bold text-white truncate">{e.title}</h4>
                      </div>
                      <p className="text-[10px] text-slate-500">
                        {e.allDay ? 'All Day' : date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                      </p>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* Lower Content Grid */}
      {(() => {
        const hasTasks = totalTasks > 0;
        const hasQa = totalQa > 0 || qaStatus.OpenBugs > 0;
        
        let activityColSpan = 'lg:col-span-3';
        if (hasTasks && hasQa) {
          activityColSpan = 'lg:col-span-1';
        } else if (hasTasks || hasQa) {
          activityColSpan = 'lg:col-span-2';
        }

        return (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Task Breakdown — only shown when it has useful content */}
            {hasTasks && (
              <div className="bg-[#0f1422] border border-[#192238] rounded-2xl p-5 flex flex-col justify-between h-[270px]">
                <div className="flex items-center gap-2 mb-2 shrink-0">
                  <i className="fa-regular fa-rectangle-list text-slate-400"></i>
                  <h2 className="text-base font-bold text-white">Task Breakdown</h2>
                </div>
                <div className="flex items-center justify-center gap-6 my-auto">
                  <div className="relative w-28 h-28 sm:w-32 sm:h-32 shrink-0">
                    <svg viewBox="0 0 36 36" className="w-full h-full transform -rotate-90">
                      <path className="text-[#1a2333]" strokeWidth="3.5" stroke="currentColor" fill="none"
                        d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
                      <path className="text-emerald-500" strokeWidth="3.5" strokeDasharray={`${donePct}, 100`} strokeLinecap="round" stroke="currentColor" fill="none"
                        d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
                      <path className="text-blue-500" strokeWidth="3.5" strokeDasharray={`${inProgPct}, 100`} strokeDashoffset={`-${donePct}`} strokeLinecap="round" stroke="currentColor" fill="none"
                        d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
                      <path className="text-purple-500" strokeWidth="3.5" strokeDasharray={`${100 - donePct - inProgPct}, 100`} strokeDashoffset={`-${donePct + inProgPct}`} strokeLinecap="round" stroke="currentColor" fill="none"
                        d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
                    </svg>
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                      <span className="text-2xl font-bold text-white leading-none">{totalTasks}</span>
                      <span className="text-[9px] text-slate-400 font-medium tracking-wide uppercase mt-1">Tasks</span>
                    </div>
                  </div>
                  <div className="flex flex-col gap-2.5">
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shrink-0"></span>
                      <span className="text-xs text-slate-300 w-16">Completed</span>
                      <span className="text-xs font-bold text-white">{completedTasks}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-blue-500 shrink-0"></span>
                      <span className="text-xs text-slate-300 w-16">In Progress</span>
                      <span className="text-xs font-bold text-white">{inProgressTasks}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-purple-500 shrink-0"></span>
                      <span className="text-xs text-slate-300 w-16">To Do</span>
                      <span className="text-xs font-bold text-white">{toDoTasks}</span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* QA Status — only shown when it has useful content */}
            {hasQa && (
              <div className="bg-[#0f1422] border border-[#192238] rounded-2xl p-5 flex flex-col justify-between h-[270px]">
                <div className="flex items-center justify-between mb-2 shrink-0">
                  <div className="flex items-center gap-2">
                    <i className="fa-solid fa-flask text-slate-400"></i>
                    <h2 className="text-base font-bold text-white">QA Status</h2>
                  </div>
                  <Link to="/qa" className="text-[10px] font-semibold text-slate-400 hover:text-white transition flex items-center gap-1">
                    View All <i className="fa-solid fa-arrow-right"></i>
                  </Link>
                </div>
                <div className="flex items-center justify-center gap-6 my-auto">
                  <div className="relative w-28 h-28 sm:w-32 sm:h-32 shrink-0">
                    <svg viewBox="0 0 36 36" className="w-full h-full transform -rotate-90">
                      <path className="text-[#1a2333]" strokeWidth="3.5" stroke="currentColor" fill="none"
                        d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
                      <path className="text-emerald-500" strokeWidth="3.5" strokeDasharray={`${qaPassedPct}, 100`} strokeLinecap="round" stroke="currentColor" fill="none"
                        d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
                      <path className="text-rose-500" strokeWidth="3.5" strokeDasharray={`${qaFailedPct}, 100`} strokeDashoffset={`-${qaPassedPct}`} strokeLinecap="round" stroke="currentColor" fill="none"
                        d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
                      <path className="text-amber-500" strokeWidth="3.5" strokeDasharray={`${100 - qaPassedPct - qaFailedPct}, 100`} strokeDashoffset={`-${qaPassedPct + qaFailedPct}`} strokeLinecap="round" stroke="currentColor" fill="none"
                        d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
                    </svg>
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                      <span className="text-2xl font-bold text-white leading-none">{totalQa}</span>
                      <span className="text-[9px] text-slate-400 font-medium tracking-wide uppercase mt-1">Tests</span>
                    </div>
                  </div>
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0"></span>
                      <span className="text-[11px] text-slate-300 w-16">Passed</span>
                      <span className="text-[11px] font-bold text-white">{qaStatus.Passed}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-rose-500 shrink-0"></span>
                      <span className="text-[11px] text-slate-300 w-16">Failed</span>
                      <span className="text-[11px] font-bold text-white">{qaStatus.Failed}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-amber-500 shrink-0"></span>
                      <span className="text-[11px] text-slate-300 w-16">Testing</span>
                      <span className="text-[11px] font-bold text-white">{qaStatus.Blocked + qaStatus.Skipped}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-red-600 shrink-0"></span>
                      <span className="text-[11px] text-slate-300 w-16">Open Bugs</span>
                      <span className="text-[11px] font-bold text-white">{qaStatus.OpenBugs}</span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Recent Activity — matches height of Task/QA on desktop */}
            <div className={`${activityColSpan} bg-[#0f1422] border border-[#192238] rounded-2xl p-5 flex flex-col h-[270px]`}>
              <div className="flex items-center justify-between mb-3 shrink-0">
                <div className="flex items-center gap-2">
                  <i className="fa-regular fa-clock text-slate-400"></i>
                  <h2 className="text-base font-bold text-white">Recent Activity</h2>
                </div>
                <Link to="/activity" className="text-[10px] font-semibold text-slate-400 hover:text-white transition flex items-center gap-1">
                  View All <i className="fa-solid fa-arrow-right"></i>
                </Link>
              </div>
              
              <div className="flex-1 min-h-0 flex flex-col">
                <ActivityFeed
                  activities={isViewingAll ? (allActivity || []) : recentActivity}
                  loading={activityLoading}
                  canViewAll={currentUser?.role === 'Admin'}
                  isViewingAll={isViewingAll}
                  onToggleViewAll={currentUser?.role === 'Admin' ? handleToggleViewAll : null}
                />
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}