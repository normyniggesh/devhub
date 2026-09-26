import { useState, useEffect } from 'react';
import { apiClient } from '../api/client';
import { Link } from 'react-router-dom';

export default function Dashboard() {
  const [data, setData] = useState({
    totalProjects: 0,
    openTasks: 0,
    completedTasks: 0,
    qaPassed: 0,
    recentActivity: []
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchDashboard = async () => {
      try {
        const res = await apiClient('/dashboard');
        if (res.dashboard) {
          setData(res.dashboard);
        }
      } catch (err) {
        console.error('Failed to fetch dashboard', err);
      } finally {
        setLoading(false);
      }
    };
    fetchDashboard();
  }, []);

  if (loading) {
    return <div className="p-12 text-center text-slate-400">Loading dashboard...</div>;
  }

  const { totalProjects, openTasks, completedTasks, qaPassed, recentActivity } = data;

  const getActivityIcon = (action) => {
    if (action.includes('CREATE')) return 'fa-solid fa-plus text-emerald-400 bg-emerald-400/10 border-emerald-400/20';
    if (action.includes('UPDATE')) return 'fa-solid fa-pen text-blue-400 bg-blue-400/10 border-blue-400/20';
    if (action.includes('DELETE')) return 'fa-solid fa-trash text-red-400 bg-red-400/10 border-red-400/20';
    if (action.includes('LOGIN')) return 'fa-solid fa-right-to-bracket text-purple-400 bg-purple-400/10 border-purple-400/20';
    return 'fa-solid fa-bolt text-amber-400 bg-amber-400/10 border-amber-400/20';
  };

  return (
    <>
      {/*  Top Bar & Search  */}
      <div className="hero-banner px-4 md:px-8 pt-4 md:pt-6 pb-6 border-b border-[#161b2b] -mx-4 md:-mx-8 -mt-4 md:-mt-8 mb-6">
        <div className="flex items-end justify-between mt-1">
          <div>
            <h1 className="text-3xl font-extrabold text-white flex items-center gap-2">
              Welcome to DevHub <span>👋</span>
            </h1>
            <p className="text-sm text-slate-400 mt-1">Let's make progress today.</p>
          </div>
        </div>
      </div>

      {/*  Dashboard Body  */}
      <div className="space-y-6">
        {/*  BEGIN: StatCardsRow  */}
        <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4" data-purpose="stat-metrics">
          <div className="bg-[#121623] border border-[#1b2234] rounded-2xl p-4 flex items-center space-x-4">
            <div className="w-12 h-12 rounded-xl bg-purple-950/40 border border-purple-500/20 text-purple-400 flex items-center justify-center text-lg">
              <i className="fa-regular fa-clipboard-check"></i>
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-400">Total Projects</p>
              <div className="flex items-baseline space-x-2 mt-0.5">
                <span className="text-2xl font-bold text-white tracking-tight">{totalProjects}</span>
              </div>
            </div>
          </div>
          <div className="bg-[#121623] border border-[#1b2234] rounded-2xl p-4 flex items-center space-x-4">
            <div className="w-12 h-12 rounded-xl bg-blue-950/40 border border-blue-500/20 text-blue-400 flex items-center justify-center text-lg">
              <i className="fa-solid fa-rotate"></i>
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-400">Open Tasks</p>
              <div className="flex items-baseline space-x-2 mt-0.5">
                <span className="text-2xl font-bold text-white tracking-tight">{openTasks}</span>
              </div>
            </div>
          </div>
          <div className="bg-[#121623] border border-[#1b2234] rounded-2xl p-4 flex items-center space-x-4">
            <div className="w-12 h-12 rounded-xl bg-emerald-950/30 border border-emerald-500/20 text-emerald-400 flex items-center justify-center text-lg">
              <i className="fa-regular fa-circle-check"></i>
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-400">Completed Tasks</p>
              <div className="flex items-baseline space-x-2 mt-0.5">
                <span className="text-2xl font-bold text-white tracking-tight">{completedTasks}</span>
              </div>
            </div>
          </div>
          <div className="bg-[#121623] border border-[#1b2234] rounded-2xl p-4 flex items-center space-x-4">
            <div className="w-12 h-12 rounded-xl bg-amber-950/30 border border-amber-500/20 text-amber-400 flex items-center justify-center text-lg">
              <i className="fa-solid fa-flask"></i>
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-400">QA Pass Rate</p>
              <div className="flex items-baseline space-x-2 mt-0.5">
                <span className="text-2xl font-bold text-white tracking-tight">{qaPassed}%</span>
              </div>
            </div>
          </div>
        </section>

        {/*  BEGIN: MidSection (Recent Activity)  */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <section className="lg:col-span-3 bg-[#121623] border border-[#1b2234] rounded-2xl p-6 flex flex-col justify-between" data-purpose="recent-activity">
            <div>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-[#1a2133]">
                <div>
                  <div className="flex items-center space-x-2.5">
                    <i className="fa-solid fa-bolt text-slate-400"></i>
                    <h3 className="text-white font-bold text-base">Recent Activity</h3>
                  </div>
                </div>
              </div>
              <div className="divide-y divide-[#171d2c] mt-2">
                {recentActivity.length > 0 ? (
                  recentActivity.map(log => {
                    const iconClasses = getActivityIcon(log.action);
                    return (
                      <div key={log.id} className="py-4 flex items-center justify-between">
                        <div className="flex items-center space-x-4 w-full">
                          <div className={`w-10 h-10 rounded-xl border flex items-center justify-center shrink-0 ${iconClasses}`}></div>
                          <div className="flex-1">
                            <h4 className="text-sm font-semibold text-white">
                              {log.action} <span className="text-slate-400 font-normal">on</span> {log.entityType}
                            </h4>
                            <p className="text-xs text-slate-500 mt-1 truncate max-w-xl">
                              {log.metadata ? JSON.stringify(log.metadata) : `Entity ID: ${log.entityId}`}
                            </p>
                          </div>
                          <div className="text-xs font-medium text-slate-500 shrink-0">
                            {new Date(log.createdAt).toLocaleString()}
                          </div>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="flex flex-col items-center justify-center py-10 px-4">
                    <div className="w-12 h-12 rounded-xl bg-[#1b2234] flex items-center justify-center mb-3">
                      <i className="fa-solid fa-bolt-slash text-xl text-slate-500"></i>
                    </div>
                    <h4 className="text-white font-semibold text-sm mb-1">No recent activity</h4>
                    <p className="text-xs text-slate-400 mb-4 text-center">Your actions across the workspace will be logged here.</p>
                  </div>
                )}
              </div>
            </div>
          </section>
        </div>
      </div>
    </>
  );
}