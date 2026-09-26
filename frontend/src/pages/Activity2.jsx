import { useState, useEffect } from 'react';
import { apiClient } from '../api/client';
import { Link } from 'react-router-dom';

export default function Activity2() {
  const [data, setData] = useState({
    todayTasks: [],
    overdueTasks: [],
    todayEvents: [],
    upcomingDeadlines: [],
    qaItems: { openBugs: [] }
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchMyDay = async () => {
      try {
        const res = await apiClient('/my-day');
        if (res.myDay) {
          setData(res.myDay);
        }
      } catch (err) {
        console.error('Failed to fetch my day data', err);
      } finally {
        setLoading(false);
      }
    };
    fetchMyDay();
  }, []);

  if (loading) {
    return <div className="p-12 text-center text-slate-400 text-sm">Loading your day...</div>;
  }

  const { todayTasks, overdueTasks, todayEvents, upcomingDeadlines, qaItems } = data;
  const openBugs = qaItems?.openBugs || [];

  return (
    <div className="space-y-6">
      <section className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-[#121624] via-[#151a2d] to-[#1e1735] border border-[#1e2538] p-7 flex items-center justify-between min-h-[140px]" data-purpose="page-hero-header">
        <div className="space-y-1.5 z-10">
          <div className="flex items-center gap-1.5 text-xs text-slate-400">
            <span>Workspace</span>
            <i className="fa-solid fa-chevron-right text-[10px]"></i>
            <span className="text-slate-300 font-medium">My Day</span>
          </div>
          <h1 className="text-2xl font-bold text-white tracking-tight">My Day</h1>
          <p className="text-xs text-slate-400">Focus on what matters most today.</p>
        </div>
        <div className="relative hidden md:flex items-center h-full z-10 pr-4">
          <div className="text-right">
            <p className="text-xs italic font-medium text-slate-300 tracking-wide max-w-xs">
              "Focus on the step in front of you, not the whole staircase."
            </p>
            <div className="w-12 h-1 bg-purple-600 rounded-full ml-auto mt-2"></div>
          </div>
        </div>
        <div className="absolute -right-10 -bottom-10 w-64 h-64 bg-purple-600/10 rounded-full blur-3xl pointer-events-none"></div>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* Left Column: Tasks & Bugs */}
        <div className="space-y-6">
          {/* Overdue Tasks */}
          <div className="bg-[#111420] border border-red-500/20 rounded-xl p-5 relative overflow-hidden">
            <div className="absolute top-0 left-0 w-1 h-full bg-red-500/50"></div>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2 text-white font-semibold text-sm">
                <i className="fa-solid fa-triangle-exclamation text-red-400"></i>
                <span>Overdue Tasks</span>
              </div>
            </div>
            {overdueTasks.length > 0 ? (
              <div className="divide-y divide-[#181e2e]/60">
                {overdueTasks.map(task => (
                  <div key={task.id} className="py-3">
                    <div className="flex items-center justify-between">
                      <div className="font-medium text-slate-200 text-sm truncate">{task.title}</div>
                      <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-red-500/10 text-red-400 border border-red-500/20 whitespace-nowrap">Overdue</span>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-slate-400 mt-1">
                      {task.project && <span>{task.project.name}</span>}
                      <span>Due: {new Date(task.dueDate).toLocaleDateString()}</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-xs text-slate-500 py-4 italic">No overdue tasks. Great job!</div>
            )}
          </div>

          {/* Today Tasks */}
          <div className="bg-[#111420] border border-[#1a2031] rounded-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2 text-white font-semibold text-sm">
                <i className="fa-solid fa-list-check text-blue-400"></i>
                <span>Today's Tasks</span>
              </div>
            </div>
            {todayTasks.length > 0 ? (
              <div className="divide-y divide-[#181e2e]/60">
                {todayTasks.map(task => (
                  <div key={task.id} className="py-3">
                    <div className="flex items-center justify-between">
                      <div className="font-medium text-slate-200 text-sm truncate">{task.title}</div>
                      <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-[#1a2031] text-slate-300 border border-[#2a334d] whitespace-nowrap">{task.status}</span>
                    </div>
                    <div className="flex items-center gap-3 text-[10px] text-slate-400 mt-1">
                      {task.project && <span>{task.project.name}</span>}
                      <span className={`px-1.5 py-0.5 rounded font-bold ${task.priority === 'High' || task.priority === 'Critical' ? 'bg-red-400/10 text-red-400' : 'bg-slate-800 text-slate-300'}`}>{task.priority}</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-xs text-slate-500 py-4 italic">No tasks scheduled for today.</div>
            )}
          </div>

          {/* QA Items (Bugs) */}
          <div className="bg-[#111420] border border-[#1a2031] rounded-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2 text-white font-semibold text-sm">
                <i className="fa-solid fa-bug text-amber-400"></i>
                <span>Your Open Bugs</span>
              </div>
            </div>
            {openBugs.length > 0 ? (
              <div className="divide-y divide-[#181e2e]/60">
                {openBugs.map(bug => (
                  <div key={bug.id} className="py-3">
                    <div className="flex items-center justify-between">
                      <div className="font-medium text-slate-200 text-sm truncate">{bug.title}</div>
                      <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20 whitespace-nowrap">{bug.status}</span>
                    </div>
                    <div className="flex items-center gap-3 text-[10px] text-slate-400 mt-1">
                      {bug.project && <span>{bug.project.name}</span>}
                      <span className={`px-1.5 py-0.5 rounded font-bold ${bug.severity === 'Critical' ? 'bg-red-400/10 text-red-400' : 'bg-slate-800 text-slate-300'}`}>{bug.severity}</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-xs text-slate-500 py-4 italic">No bugs assigned to you.</div>
            )}
          </div>
        </div>

        {/* Right Column: Events & Deadlines */}
        <div className="space-y-6">
          
          {/* Today Events */}
          <div className="bg-[#111420] border border-[#1a2031] rounded-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2 text-white font-semibold text-sm">
                <i className="fa-regular fa-calendar text-purple-400"></i>
                <span>Today's Events</span>
              </div>
              <Link to="/calendar" className="text-[10px] font-medium text-indigo-400 hover:text-indigo-300">View Calendar</Link>
            </div>
            {todayEvents.length > 0 ? (
              <div className="divide-y divide-[#181e2e]/60">
                {todayEvents.map(ev => {
                  const startTime = new Date(ev.startDateTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                  const endTime = new Date(ev.endDateTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                  return (
                    <div key={ev.id} className="py-3">
                      <div className="flex items-center justify-between">
                        <div className="font-medium text-slate-200 text-sm truncate">{ev.title}</div>
                        <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-[#1a2031] text-purple-300 border border-purple-500/20 whitespace-nowrap">{ev.type}</span>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-slate-400 mt-1">
                        <span><i className="fa-regular fa-clock mr-1"></i> {ev.allDay ? 'All Day' : `${startTime} - ${endTime}`}</span>
                        {ev.location && <span><i className="fa-solid fa-location-dot mr-1"></i> {ev.location}</span>}
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : (
              <div className="text-xs text-slate-500 py-4 italic">No events scheduled for today.</div>
            )}
          </div>

          {/* Upcoming Deadlines */}
          <div className="bg-[#111420] border border-[#1a2031] rounded-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2 text-white font-semibold text-sm">
                <i className="fa-solid fa-timeline text-emerald-400"></i>
                <span>Upcoming Deadlines (Next 7 Days)</span>
              </div>
            </div>
            {upcomingDeadlines.length > 0 ? (
              <div className="relative border-l border-[#2a334d] ml-2 pl-4 py-2 space-y-6">
                {upcomingDeadlines.map((item, idx) => (
                  <div key={`${item.type}-${item.id}-${idx}`} className="relative">
                    <div className="absolute -left-[21px] top-1 w-2.5 h-2.5 rounded-full bg-emerald-500 ring-4 ring-[#111420]"></div>
                    <div className="flex items-center justify-between">
                      <div className="font-medium text-slate-200 text-sm">{item.title}</div>
                      <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">{item.type}</span>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-slate-400 mt-1">
                      {item.projectName && <span>{item.projectName}</span>}
                      <span className="text-emerald-400/70 font-semibold">{new Date(item.date).toLocaleDateString()}</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-xs text-slate-500 py-4 italic">No upcoming deadlines in the next 7 days.</div>
            )}
          </div>

        </div>
      </div>
    </div>
  );
}