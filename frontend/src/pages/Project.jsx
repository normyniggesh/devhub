import { useState, useEffect, useMemo, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { apiClient } from '../api/client';
import { useStore } from '../store';
import Modal from '../components/common/Modal';
import { useClickOutside } from '../hooks/useClickOutside';

export default function Project() {
  const { currentUser } = useStore();
  const navigate = useNavigate();
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('All');
  const [sortBy, setSortBy] = useState('Last Updated');
  
  const [showModal, setShowModal] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [modalError, setModalError] = useState(null);
  const [editProjectId, setEditProjectId] = useState(null);
  const [newProject, setNewProject] = useState({ 
    name: '', description: '', category: '', status: 'Active', priority: 'Medium', startDate: '', dueDate: '' 
  });
  
  const [openMenuId, setOpenMenuId] = useState(null);
  const menuRef = useRef(null);

  useClickOutside(menuRef, () => setOpenMenuId(null));

  const fetchProjects = async () => {
    try {
      setLoading(true);
      const data = await apiClient('/projects');
      setProjects(data.projects || []);
      setError(null);
    } catch (err) {
      setError(err.message || 'Unable to load projects.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProjects();
  }, []);

  const handleSave = async (e) => {
    e.preventDefault();
    setModalError(null);
    setIsSubmitting(true);
    
    try {
      const body = {
        name: newProject.name,
        description: newProject.description,
        category: newProject.category,
        status: newProject.status,
        priority: newProject.priority,
        startDate: newProject.startDate ? new Date(newProject.startDate).toISOString() : null,
        dueDate: newProject.dueDate ? new Date(newProject.dueDate).toISOString() : null
      };

      if (editProjectId) {
        await apiClient(`/projects/${editProjectId}`, { method: 'PATCH', body });
      } else {
        await apiClient('/projects', { body });
      }
      
      setNewProject({ name: '', description: '', category: '', status: 'Active', priority: 'Medium', startDate: '', dueDate: '' });
      setEditProjectId(null);
      setShowModal(false);
      fetchProjects();
    } catch (err) {
      setModalError(err.message || 'Failed to save project');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this project?')) return;
    try {
      await apiClient(`/projects/${id}`, { method: 'DELETE' });
      fetchProjects();
    } catch (err) {
      alert(err.message || 'Failed to delete project');
    }
  };

  const openEditModal = (proj) => {
    setEditProjectId(proj.id);
    setNewProject({
      name: proj.name,
      description: proj.description || '',
      category: proj.category || '',
      status: proj.status || 'Active',
      priority: proj.priority || 'Medium',
      startDate: proj.startDate ? proj.startDate.split('T')[0] : '',
      dueDate: proj.dueDate ? proj.dueDate.split('T')[0] : ''
    });
    setOpenMenuId(null);
    setShowModal(true);
  };

  const categories = useMemo(() => {
    const cats = new Set();
    projects.forEach(p => { if (p.category) cats.add(p.category); });
    return ['All', ...Array.from(cats)];
  }, [projects]);

  const filteredProjects = useMemo(() => {
    let result = [...projects];

    if (categoryFilter !== 'All') {
      result = result.filter(p => p.category === categoryFilter);
    }

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter(p => 
        (p.name && p.name.toLowerCase().includes(q)) ||
        (p.description && p.description.toLowerCase().includes(q)) ||
        (p.category && p.category.toLowerCase().includes(q))
      );
    }

    result.sort((a, b) => {
      switch (sortBy) {
        case 'Name': return a.name.localeCompare(b.name);
        case 'Due Date': 
          if (!a.dueDate) return 1;
          if (!b.dueDate) return -1;
          return new Date(a.dueDate) - new Date(b.dueDate);
        case 'Start Date':
          if (!a.startDate) return 1;
          if (!b.startDate) return -1;
          return new Date(a.startDate) - new Date(b.startDate);
        case 'Priority': {
          const pMap = { 'Urgent': 4, 'High': 3, 'Medium': 2, 'Low': 1 };
          return (pMap[b.priority] || 0) - (pMap[a.priority] || 0);
        }
        case 'Last Updated':
        default:
          return new Date(b.updatedAt) - new Date(a.updatedAt);
      }
    });

    return result;
  }, [projects, categoryFilter, searchQuery, sortBy]);

  const stats = useMemo(() => {
    const s = {};
    projects.forEach(p => {
      s[p.status] = (s[p.status] || 0) + 1;
    });
    return s;
  }, [projects]);

  const getProjectMetrics = (proj) => {
    const totalTasks = proj.tasks?.length || 0;
    const doneTasks = proj.tasks?.filter(t => t.status === 'Done').length || 0;
    const openTasks = totalTasks - doneTasks;
    const progress = totalTasks === 0 ? 0 : Math.round((doneTasks / totalTasks) * 100);
    const bugs = proj._count?.bugs || 0;
    
    const isOwner = proj.owner?.id === currentUser?.id;
    const memberRecord = proj.members?.find(m => m.user?.id === currentUser?.id);
    const isAdmin = isOwner || memberRecord?.role === 'Admin';
    const canEdit = isOwner || memberRecord?.role === 'Admin' || memberRecord?.role === 'Editor';

    return { totalTasks, openTasks, progress, bugs, isAdmin, canEdit };
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case 'Active': return 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20';
      case 'Completed': return 'text-blue-400 bg-blue-400/10 border-blue-400/20';
      case 'On Hold': return 'text-amber-400 bg-amber-400/10 border-amber-400/20';
      case 'Archived': return 'text-slate-400 bg-slate-400/10 border-slate-400/20';
      default: return 'text-purple-400 bg-purple-400/10 border-purple-400/20';
    }
  };

  const getPriorityBadge = (priority) => {
    switch (priority) {
      case 'Urgent': return 'text-rose-400 bg-rose-400/10 border-rose-400/20';
      case 'High': return 'text-orange-400 bg-orange-400/10 border-orange-400/20';
      case 'Medium': return 'text-blue-400 bg-blue-400/10 border-blue-400/20';
      case 'Low': return 'text-slate-400 bg-slate-400/10 border-slate-400/20';
      default: return 'text-slate-400 bg-slate-400/10 border-slate-400/20';
    }
  };

  const getCategoryIcon = (category) => {
    const c = (category || '').toLowerCase();
    if (c.includes('web') || c.includes('dev')) return 'fa-solid fa-code';
    if (c.includes('design')) return 'fa-solid fa-pen-nib';
    if (c.includes('college') || c.includes('edu')) return 'fa-solid fa-graduation-cap';
    if (c.includes('personal')) return 'fa-solid fa-user';
    if (c.includes('marketing')) return 'fa-solid fa-bullhorn';
    return 'fa-solid fa-folder';
  };

  const barColors = ['bg-emerald-500', 'bg-blue-500', 'bg-purple-500', 'bg-pink-500', 'bg-amber-500', 'bg-rose-500', 'bg-indigo-500', 'bg-teal-500'];
  const getProjColor = (id) => barColors[(id.charCodeAt(0) + id.charCodeAt(id.length-1)) % barColors.length];

  const [timelineRange, setTimelineRange] = useState('Next 2 Months');
  const getTimelineDates = () => {
    const now = new Date();
    now.setHours(0,0,0,0);
    let end = new Date(now);
    if (timelineRange === 'This Month') {
      end.setMonth(now.getMonth() + 1);
    } else if (timelineRange === 'Next 3 Months') {
      end.setMonth(now.getMonth() + 3);
    } else {
      end.setMonth(now.getMonth() + 2);
    }
    return { start: now, end };
  };

  const renderTimelineBar = (proj) => {
    if (!proj.startDate && !proj.dueDate) return null;
    
    const { start: viewStart, end: viewEnd } = getTimelineDates();
    const viewDuration = viewEnd - viewStart;

    const pStart = proj.startDate ? new Date(proj.startDate) : new Date(proj.dueDate);
    const pEnd = proj.dueDate ? new Date(proj.dueDate) : new Date(proj.startDate);
    
    if (pEnd < viewStart || pStart > viewEnd) return null;

    const clampedStart = new Date(Math.max(pStart, viewStart));
    const clampedEnd = new Date(Math.min(pEnd, viewEnd));

    const leftPct = ((clampedStart - viewStart) / viewDuration) * 100;
    let widthPct = ((clampedEnd - clampedStart) / viewDuration) * 100;
    if (widthPct < 2) widthPct = 2;

    const color = getProjColor(proj.id);
    const glow = color.replace('bg-', 'shadow-').replace('500', '500/40');

    return (
      <div className="flex items-center mb-4 relative h-6 w-full group" key={proj.id}>
        <div className="w-32 md:w-48 shrink-0 flex items-center gap-2 truncate pr-4">
          <span className={`w-2 h-2 rounded-full shrink-0 ${color}`}></span>
          <Link to={`/projects/${proj.id}`} className="text-xs font-semibold text-slate-300 hover:text-white truncate transition">{proj.name}</Link>
        </div>
        <div className="flex-1 relative h-full bg-[#161d2f]/50 rounded-lg overflow-hidden border border-[#1f2a44]">
          <div 
            className={`absolute top-1 bottom-1 rounded-md shadow-md ${color} ${glow} opacity-80 group-hover:opacity-100 transition-opacity`}
            style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
          ></div>
        </div>
      </div>
    );
  };

  const renderTimelineMonths = () => {
    const { start, end } = getTimelineDates();
    const months = [];
    let curr = new Date(start);
    while(curr < end) {
      months.push(new Date(curr));
      curr.setMonth(curr.getMonth() + 1);
    }
    return months.map((m, i) => (
      <div key={i} className="flex-1 text-[10px] font-bold text-slate-500 uppercase tracking-wider pl-2 border-l border-[#1f2a44]">
        {m.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
      </div>
    ));
  };

  return (
    <div className="flex flex-col gap-6 max-w-[1920px] mx-auto pb-12">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 text-[11px] text-slate-400 font-semibold mb-2 tracking-wide uppercase">
          <span>Projects</span>
          <span className="text-slate-600">›</span>
          <span className="text-purple-400">All Projects</span>
        </div>
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-extrabold text-white tracking-tight mb-1">Projects</h1>
            <p className="text-sm text-slate-400">Organize, track and deliver — all your work in one place.</p>
          </div>
          <button onClick={() => {
            setEditProjectId(null);
            setNewProject({ name: '', description: '', category: '', status: 'Active', priority: 'Medium', startDate: '', dueDate: '' });
            setShowModal(true);
          }} className="flex items-center justify-center gap-2 px-4 py-2 bg-[#5922cf] hover:bg-[#682ae6] text-white rounded-xl text-sm font-bold shadow-[0_0_15px_rgba(89,34,207,0.3)] transition">
            <i className="fa-solid fa-plus"></i> New Project
          </button>
        </div>
      </div>

      {/* Filters Bar */}
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 bg-[#0f1422] border border-[#192238] rounded-2xl p-4">
        <div className="flex items-center gap-2 overflow-x-auto pb-2 xl:pb-0 hide-scrollbar">
          {categories.map(cat => {
            const count = cat === 'All' ? projects.length : projects.filter(p => p.category === cat).length;
            const isActive = categoryFilter === cat;
            return (
              <button 
                key={cat}
                onClick={() => setCategoryFilter(cat)}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition whitespace-nowrap border ${isActive ? 'bg-purple-600 border-purple-500 text-white shadow-md shadow-purple-900/20' : 'bg-[#161d2f] border-[#1f2a44] text-slate-400 hover:text-white hover:bg-[#1a2333]'}`}
              >
                {cat} <span className={`px-1.5 py-0.5 rounded-md text-[10px] ${isActive ? 'bg-purple-800 text-purple-100' : 'bg-[#232d45] text-slate-400'}`}>{count}</span>
              </button>
            );
          })}
        </div>
        
        <div className="flex items-center gap-3 w-full xl:w-auto">
          <div className="relative flex-1 xl:w-64">
            <i className="fa-solid fa-magnifying-glass absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-xs"></i>
            <input 
              type="text" 
              placeholder="Search projects..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-[#161d2f] border border-[#1f2a44] rounded-lg pl-8 pr-4 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-purple-500 transition"
            />
          </div>
          <div className="relative shrink-0">
            <select 
              value={sortBy} 
              onChange={(e) => setSortBy(e.target.value)}
              className="appearance-none bg-[#161d2f] border border-[#1f2a44] rounded-lg pl-3 pr-8 py-2 text-xs font-semibold text-white focus:outline-none focus:border-purple-500 transition cursor-pointer"
            >
              <option value="Last Updated">Last Updated</option>
              <option value="Name">Name</option>
              <option value="Due Date">Due Date</option>
              <option value="Start Date">Start Date</option>
              <option value="Priority">Priority</option>
            </select>
            <i className="fa-solid fa-chevron-down absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 text-[10px] pointer-events-none"></i>
          </div>
          <button className="w-8 h-8 flex items-center justify-center bg-[#161d2f] border border-[#1f2a44] rounded-lg text-slate-400 hover:text-white hover:border-purple-500 transition shrink-0">
            <i className="fa-solid fa-grip text-xs"></i>
          </button>
        </div>
      </div>

      {error ? (
        <div className="flex flex-col items-center justify-center p-12 bg-[#0f1422] border border-[#192238] rounded-2xl">
          <i className="fa-solid fa-triangle-exclamation text-4xl text-red-500/80 mb-4"></i>
          <h2 className="text-lg font-bold text-white mb-2">Unable to load projects</h2>
          <p className="text-sm text-slate-400 mb-6 text-center max-w-md">{error}</p>
          <button onClick={fetchProjects} className="px-5 py-2.5 bg-[#5922cf] hover:bg-[#682ae6] text-white rounded-lg text-sm font-semibold transition flex items-center gap-2">
            <i className="fa-solid fa-rotate-right"></i> Please try again
          </button>
        </div>
      ) : loading ? (
        <div className="flex justify-center items-center h-64 text-slate-400">
          <i className="fa-solid fa-circle-notch fa-spin text-3xl text-purple-500"></i>
        </div>
      ) : (
        <div className="flex flex-col xl:flex-row gap-6">
          {/* Main Grid */}
          <div className="flex-1 min-w-0">
            {filteredProjects.length === 0 ? (
               <div className="flex flex-col items-center justify-center p-16 bg-[#0f1422] border border-dashed border-[#232a3f] rounded-2xl">
                 <div className="w-16 h-16 bg-purple-500/10 rounded-full flex items-center justify-center mb-4">
                   <i className="fa-regular fa-folder-open text-2xl text-purple-400"></i>
                 </div>
                 <h2 className="text-lg font-bold text-white mb-2">No projects yet</h2>
                 <p className="text-sm text-slate-400 mb-6 text-center max-w-md">Get started by creating your first project to organize your work, track progress, and hit your goals.</p>
                 <button onClick={() => {
                    setEditProjectId(null);
                    setNewProject({ name: '', description: '', category: '', status: 'Active', priority: 'Medium', startDate: '', dueDate: '' });
                    setShowModal(true);
                 }} className="px-5 py-2.5 bg-[#5922cf] hover:bg-[#682ae6] text-white rounded-lg text-sm font-semibold transition">
                   Create First Project
                 </button>
               </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                {filteredProjects.map(proj => {
                  const metrics = getProjectMetrics(proj);
                  const icon = getCategoryIcon(proj.category);
                  const color = getProjColor(proj.id);
                  const isMenuOpen = openMenuId === proj.id;
                  
                  return (
                    <div key={proj.id} className="group flex flex-col bg-[#0f1422] border border-[#192238] rounded-2xl overflow-hidden hover:border-[#2d3a5a] transition-all duration-300 shadow-sm relative">
                      {/* Card Header Background Area */}
                      <div className="h-24 relative overflow-hidden bg-gradient-to-b from-[#161d2f] to-transparent">
                        <div className="absolute inset-0 opacity-10" style={{ backgroundImage: 'radial-gradient(circle at top right, #5922cf, transparent 60%)' }}></div>
                        <div className="absolute top-4 right-4 z-10" ref={isMenuOpen ? menuRef : null}>
                          <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpenMenuId(isMenuOpen ? null : proj.id); }} className="w-8 h-8 flex items-center justify-center rounded-lg bg-black/40 hover:bg-black/60 text-white backdrop-blur-sm transition">
                            <i className="fa-solid fa-ellipsis-vertical text-xs"></i>
                          </button>
                          {isMenuOpen && (
                            <div className="absolute right-0 mt-2 w-36 bg-[#1f2638] rounded-xl shadow-xl border border-[#2d364f] z-50 overflow-hidden py-1">
                              <Link to={`/projects/${proj.id}`} className="flex items-center gap-2 w-full px-4 py-2 text-xs font-semibold text-white hover:bg-[#2a344a] transition">
                                <i className="fa-solid fa-arrow-up-right-from-square w-3"></i> Open
                              </Link>
                              {metrics.canEdit && (
                                <button onClick={(e) => { e.preventDefault(); openEditModal(proj); }} className="flex items-center gap-2 w-full px-4 py-2 text-xs font-semibold text-slate-300 hover:text-white hover:bg-[#2a344a] transition text-left">
                                  <i className="fa-solid fa-pen w-3"></i> Edit
                                </button>
                              )}
                              {metrics.isAdmin && (
                                <button onClick={(e) => { e.preventDefault(); setOpenMenuId(null); handleDelete(proj.id); }} className="flex items-center gap-2 w-full px-4 py-2 text-xs font-semibold text-red-400 hover:bg-red-500/10 transition text-left mt-1 border-t border-[#2d364f] pt-2">
                                  <i className="fa-solid fa-trash w-3"></i> Delete
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                        <div className="absolute top-4 left-4">
                          <div className={`w-10 h-10 rounded-xl flex items-center justify-center shadow-lg ${color.replace('bg-', 'bg-opacity-20 text-').replace('500', '400')} bg-[#1a2333] border border-[#2d3a5a]`}>
                            <i className={`${icon} text-lg`}></i>
                          </div>
                        </div>
                      </div>

                      {/* Card Content */}
                      <Link to={`/projects/${proj.id}`} className="flex-1 p-5 pt-0 flex flex-col cursor-pointer">
                        <div className="flex items-center gap-2 mb-1.5">
                          <h3 className="text-base font-bold text-white truncate leading-tight group-hover:text-purple-400 transition-colors">{proj.name}</h3>
                          {proj.category && <span className="px-2 py-0.5 rounded-md bg-[#1a2333] border border-[#2d3a5a] text-[9px] font-bold uppercase tracking-wider text-slate-400 shrink-0">{proj.category}</span>}
                        </div>
                        <p className="text-xs text-slate-400 line-clamp-2 min-h-[32px] mb-4">
                          {proj.description || 'No description provided.'}
                        </p>

                        <div className="flex items-center justify-between mb-4">
                           <div className={`px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider border ${getStatusBadge(proj.status)}`}>
                             {proj.status}
                           </div>
                           <div className={`px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider border ${getPriorityBadge(proj.priority)}`}>
                             {proj.priority}
                           </div>
                        </div>

                        {/* Progress */}
                        <div className="mb-4">
                          <div className="flex justify-between items-end mb-1.5">
                            <span className="text-xs font-bold text-white">{metrics.progress}%</span>
                          </div>
                          <div className="h-1.5 w-full bg-[#1a2333] rounded-full overflow-hidden">
                            <div className="h-full bg-purple-500 rounded-full transition-all duration-500" style={{ width: `${metrics.progress}%` }}></div>
                          </div>
                        </div>

                        {/* Metadata row */}
                        <div className="flex items-center gap-4 text-[11px] font-medium text-slate-400 mb-4 bg-[#161d2f] p-2 rounded-lg border border-[#1f2a44]">
                          <div className="flex items-center gap-1.5" title="Total Tasks">
                            <i className="fa-solid fa-list-check"></i> {metrics.totalTasks} tasks
                          </div>
                          <div className="flex items-center gap-1.5" title="Open Tasks">
                            <i className="fa-regular fa-clock"></i> {metrics.openTasks} open
                          </div>
                          <div className="flex items-center gap-1.5" title="Open Bugs">
                            <i className="fa-solid fa-bug"></i> {metrics.bugs} bugs
                          </div>
                        </div>

                        {/* Footer */}
                        <div className="mt-auto flex items-center justify-between border-t border-[#1f2a44] pt-4">
                          <div className="flex -space-x-2">
                            {proj.members?.slice(0, 3).map((m, i) => (
                              <div key={m.user?.id || i} className="w-6 h-6 rounded-full bg-slate-700 border-2 border-[#0f1422] flex items-center justify-center overflow-hidden shrink-0" title={m.user?.name}>
                                {m.user?.avatarUrl ? (
                                  <img src={m.user.avatarUrl} alt={m.user.name} className="w-full h-full object-cover" />
                                ) : (
                                  <span className="text-[9px] font-bold text-white">{m.user?.name?.charAt(0).toUpperCase() || 'U'}</span>
                                )}
                              </div>
                            ))}
                            {proj.members?.length > 3 && (
                              <div className="w-6 h-6 rounded-full bg-[#1a2333] border-2 border-[#0f1422] flex items-center justify-center shrink-0">
                                <span className="text-[9px] font-bold text-slate-300">+{proj.members.length - 3}</span>
                              </div>
                            )}
                            {(!proj.members || proj.members.length === 0) && (
                              <div className="w-6 h-6 rounded-full bg-slate-700 border-2 border-[#0f1422] flex items-center justify-center overflow-hidden shrink-0" title={proj.owner?.name}>
                                <span className="text-[9px] font-bold text-white">{proj.owner?.name?.charAt(0).toUpperCase() || 'U'}</span>
                              </div>
                            )}
                          </div>
                          <div className="text-[10px] font-semibold text-slate-500 flex items-center gap-1.5">
                            <i className="fa-regular fa-calendar text-slate-600"></i>
                            {proj.dueDate ? new Date(proj.dueDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : 'No due date'}
                          </div>
                        </div>
                      </Link>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Right Sidebar */}
          <div className="w-full xl:w-72 flex flex-col gap-6 shrink-0">
            {/* Project Stats Panel */}
            <div className="bg-[#0f1422] border border-[#192238] rounded-2xl p-5">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-sm font-bold text-white flex items-center gap-2">
                  <i className="fa-solid fa-chart-pie text-slate-400"></i> Project Stats
                </h2>
              </div>
              
              {projects.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-6 text-center">
                  <div className="w-24 h-24 rounded-full border-4 border-[#1f2a44] mb-3"></div>
                  <h3 className="text-lg font-bold text-white leading-none">0</h3>
                  <p className="text-[10px] uppercase tracking-wide text-slate-500 font-bold mt-1">Projects</p>
                </div>
              ) : (
                <div className="flex flex-col sm:flex-row xl:flex-col items-center justify-center gap-6">
                  {/* CSS Donut */}
                  <div className="relative w-32 h-32 shrink-0">
                    <svg viewBox="0 0 36 36" className="w-full h-full transform -rotate-90">
                      <path className="text-[#1f2a44]" strokeWidth="4" stroke="currentColor" fill="none"
                        d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
                      
                      {(() => {
                        const total = projects.length;
                        const active = stats['Active'] || 0;
                        const completed = stats['Completed'] || 0;
                        const onHold = stats['On Hold'] || 0;
                        
                        const actPct = (active / total) * 100;
                        const compPct = (completed / total) * 100;
                        const holdPct = (onHold / total) * 100;
                        
                        return (
                          <>
                            {compPct > 0 && <path className="text-blue-500" strokeWidth="4" strokeDasharray={`${compPct}, 100`} strokeLinecap="round" stroke="currentColor" fill="none" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />}
                            {actPct > 0 && <path className="text-emerald-500" strokeWidth="4" strokeDasharray={`${actPct}, 100`} strokeDashoffset={`-${compPct}`} strokeLinecap="round" stroke="currentColor" fill="none" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />}
                            {holdPct > 0 && <path className="text-amber-500" strokeWidth="4" strokeDasharray={`${holdPct}, 100`} strokeDashoffset={`-${compPct + actPct}`} strokeLinecap="round" stroke="currentColor" fill="none" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />}
                            {/* Archived/Other takes remaining implicitly or we just ignore for visuals if small */}
                          </>
                        )
                      })()}
                    </svg>
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                      <span className="text-2xl font-bold text-white leading-none">{projects.length}</span>
                      <span className="text-[9px] font-bold uppercase tracking-wider text-slate-500 mt-1">Projects</span>
                    </div>
                  </div>
                  
                  {/* Legend */}
                  <div className="flex flex-col gap-3 w-full max-w-[150px]">
                    {['Active', 'Completed', 'On Hold', 'Archived'].map(s => {
                      if (!stats[s]) return null;
                      let c = 'bg-emerald-500';
                      if (s === 'Completed') c = 'bg-blue-500';
                      if (s === 'On Hold') c = 'bg-amber-500';
                      if (s === 'Archived') c = 'bg-slate-500';
                      return (
                        <div key={s} className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className={`w-2 h-2 rounded-full ${c}`}></span>
                            <span className="text-xs font-medium text-slate-300">{s}</span>
                          </div>
                          <span className="text-xs font-bold text-white">{stats[s]}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Upcoming Milestones - Real data if present, otherwise safe empty state */}
            <div className="bg-[#0f1422] border border-[#192238] rounded-2xl p-5 flex flex-col flex-1">
              <div className="flex items-center justify-between mb-5">
                <h2 className="text-sm font-bold text-white flex items-center gap-2">
                  <i className="fa-solid fa-flag-checkered text-slate-400"></i> Upcoming Milestones
                </h2>
              </div>
              
              {/* DEVHUB backend doesn't currently eagerly load milestones in /api/projects.
                  Rendering a lightweight empty state directly instead of inventing fake data. */}
              <div className="flex-1 flex flex-col items-center justify-center py-8 text-center bg-[#161d2f] border border-dashed border-[#232a3f] rounded-xl">
                <i className="fa-regular fa-calendar-xmark text-2xl text-slate-500 mb-2"></i>
                <p className="text-xs font-semibold text-slate-300 mb-1">Upcoming</p>
                <p className="text-[10px] text-slate-500">No milestone data available yet.</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Project Timeline */}
      {!loading && !error && projects.length > 0 && (
        <div className="bg-[#0f1422] border border-[#192238] rounded-2xl p-5 overflow-hidden">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2 mb-1">
                <i className="fa-solid fa-bars-staggered text-slate-400"></i> Project Timeline
              </h2>
              <p className="text-xs text-slate-400">A quick view of your project schedules.</p>
            </div>
            <div className="relative shrink-0">
              <select 
                value={timelineRange} 
                onChange={(e) => setTimelineRange(e.target.value)}
                className="appearance-none bg-[#161d2f] border border-[#1f2a44] rounded-lg pl-3 pr-8 py-1.5 text-xs font-semibold text-white focus:outline-none focus:border-purple-500 transition cursor-pointer"
              >
                <option value="This Month">This Month</option>
                <option value="Next 2 Months">Next 2 Months</option>
                <option value="Next 3 Months">Next 3 Months</option>
              </select>
              <i className="fa-solid fa-chevron-down absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 text-[10px] pointer-events-none"></i>
            </div>
          </div>
          
          <div className="overflow-x-auto hide-scrollbar pb-2">
            <div className="min-w-[600px]">
              {/* Timeline Header (Months) */}
              <div className="flex items-end mb-4 ml-[128px] md:ml-[192px] pt-2">
                {renderTimelineMonths()}
              </div>
              
              {/* Timeline Bars */}
              <div className="relative border-t border-[#1f2a44] pt-4">
                {projects.map(p => renderTimelineBar(p))}
                
                {/* Fallback if no projects have dates */}
                {projects.every(p => !p.startDate && !p.dueDate) && (
                  <div className="text-center py-6">
                    <p className="text-xs text-slate-500">No project dates available for timeline.</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Create/Edit Modal */}
      {showModal && (
        <Modal open={showModal} onClose={() => setShowModal(false)} className="max-w-lg my-8 p-6">
          <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg text-white font-bold">{editProjectId ? 'Edit Project' : 'Add Project'}</h2>
              <button onClick={() => setShowModal(false)} className="w-8 h-8 flex items-center justify-center rounded-lg bg-[#1a2333] text-slate-400 hover:text-white transition">
                <i className="fa-solid fa-xmark"></i>
              </button>
            </div>
            {modalError && (
              <div className="bg-red-500/10 border border-red-500/50 text-red-400 px-4 py-3 rounded-lg mb-5 text-sm flex items-start gap-2">
                <i className="fa-solid fa-circle-exclamation mt-1"></i>
                <span>{modalError}</span>
              </div>
            )}
            <form onSubmit={handleSave} className="flex flex-col gap-5">
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1.5 uppercase tracking-wide">Project Name <span className="text-red-500">*</span></label>
                <input required value={newProject.name} onChange={e => setNewProject({...newProject, name: e.target.value})} placeholder="E.g. Website Redesign" className="w-full bg-[#161d2f] border border-[#1f2a44] rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-purple-500 transition shadow-inner" />
              </div>
              
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1.5 uppercase tracking-wide">Description</label>
                <textarea rows="3" value={newProject.description} onChange={e => setNewProject({...newProject, description: e.target.value})} placeholder="Brief overview of the project" className="w-full bg-[#161d2f] border border-[#1f2a44] rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-purple-500 transition shadow-inner resize-none" />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1.5 uppercase tracking-wide">Category</label>
                  <input value={newProject.category} onChange={e => setNewProject({...newProject, category: e.target.value})} placeholder="E.g. Development" className="w-full bg-[#161d2f] border border-[#1f2a44] rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-purple-500 transition shadow-inner" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1.5 uppercase tracking-wide">Priority</label>
                  <select value={newProject.priority} onChange={e => setNewProject({...newProject, priority: e.target.value})} className="w-full bg-[#161d2f] border border-[#1f2a44] rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-purple-500 transition shadow-inner cursor-pointer appearance-none">
                    <option value="Low">Low</option>
                    <option value="Medium">Medium</option>
                    <option value="High">High</option>
                    <option value="Urgent">Urgent</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1.5 uppercase tracking-wide">Status</label>
                  <select value={newProject.status} onChange={e => setNewProject({...newProject, status: e.target.value})} className="w-full bg-[#161d2f] border border-[#1f2a44] rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-purple-500 transition shadow-inner cursor-pointer appearance-none">
                    <option value="Active">Active</option>
                    <option value="On Hold">On Hold</option>
                    <option value="Completed">Completed</option>
                    <option value="Archived">Archived</option>
                  </select>
                </div>
                <div></div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1.5 uppercase tracking-wide">Start Date</label>
                  <input type="date" value={newProject.startDate} onChange={e => setNewProject({...newProject, startDate: e.target.value})} className="w-full bg-[#161d2f] border border-[#1f2a44] rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-purple-500 transition shadow-inner" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1.5 uppercase tracking-wide">Due Date</label>
                  <input type="date" value={newProject.dueDate} onChange={e => setNewProject({...newProject, dueDate: e.target.value})} className="w-full bg-[#161d2f] border border-[#1f2a44] rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-purple-500 transition shadow-inner" />
                </div>
              </div>
              
              <div className="flex justify-end gap-3 mt-4 pt-5 border-t border-[#1f2a44]">
                <button type="button" disabled={isSubmitting} onClick={() => setShowModal(false)} className="px-5 py-2.5 text-slate-300 text-sm font-semibold hover:text-white hover:bg-[#1a2333] rounded-xl transition disabled:opacity-50">Cancel</button>
                <button type="submit" disabled={isSubmitting} className="px-6 py-2.5 bg-[#5922cf] hover:bg-[#682ae6] text-white rounded-xl text-sm font-bold shadow-lg shadow-purple-900/30 transition disabled:opacity-50 flex items-center gap-2">
                  {isSubmitting && <i className="fa-solid fa-spinner fa-spin"></i>}
                  {isSubmitting ? 'Saving...' : (editProjectId ? 'Save Changes' : 'Create Project')}
                </button>
              </div>
            </form>
        </Modal>
      )}
    </div>
  );
}