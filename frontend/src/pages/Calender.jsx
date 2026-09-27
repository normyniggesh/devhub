import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiClient } from '../api/client';
import { useStore } from '../store';

export default function Calender() {
  const navigate = useNavigate();
  const { currentUser } = useStore();
  
  const [currentDate, setCurrentDate] = useState(new Date());
  const [events, setEvents] = useState([]);
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  // Filters
  const [selectedProjectFilter, setSelectedProjectFilter] = useState('');
  const [selectedTypeFilter, setSelectedTypeFilter] = useState('');

  // Modal
  const [showModal, setShowModal] = useState(false);
  const [editingEvent, setEditingEvent] = useState(null);
  
  const defaultForm = {
    title: '', description: '', type: 'Meeting',
    startDateTime: '', endDateTime: '', allDay: false,
    projectId: '', taskId: '', location: ''
  };
  const [form, setForm] = useState(defaultForm);
  const [projectTasks, setProjectTasks] = useState([]);

  // Tabs
  const [activeTab, setActiveTab] = useState('Month');

  useEffect(() => {
    const fetchProjects = async () => {
      try {
        const data = await apiClient('/projects');
        setProjects(data.projects || []);
      } catch (err) {}
    };
    fetchProjects();
  }, []);

  const fetchEvents = async () => {
    setLoading(true);
    setError(false);
    try {
      const year = currentDate.getFullYear();
      const month = currentDate.getMonth();
      const start = new Date(year, month, 1).toISOString();
      // fetch up to next week to ensure upcoming events are somewhat populated 
      // but the prompt says: "Calendar should request events based on the currently visible month/date range"
      const end = new Date(year, month + 1, 0, 23, 59, 59).toISOString();
      
      const data = await apiClient(`/calendar/events?start=${start}&end=${end}`);
      setEvents(data.events || []);
    } catch (err) {
      console.error(err);
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEvents();
  }, [currentDate]);

  useEffect(() => {
    if (form.projectId) {
      const fetchTasks = async () => {
        try {
          const data = await apiClient(`/tasks?projectId=${form.projectId}`);
          setProjectTasks(data.tasks || []);
        } catch (err) {}
      };
      fetchTasks();
    } else {
      setProjectTasks([]);
      setForm(prev => ({...prev, taskId: ''}));
    }
  }, [form.projectId]);

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const monthName = currentDate.toLocaleString('default', { month: 'long' });

  const getDaysArray = () => {
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const firstDayOfMonth = new Date(year, month, 1).getDay();
    
    const days = [];
    for (let i = 0; i < firstDayOfMonth; i++) {
      days.push(null);
    }
    for (let i = 1; i <= daysInMonth; i++) {
      days.push(new Date(year, month, i));
    }
    while (days.length % 7 !== 0) {
      days.push(null);
    }
    return days;
  };

  const days = getDaysArray();

  const handlePrevMonth = () => setCurrentDate(new Date(year, month - 1, 1));
  const handleNextMonth = () => setCurrentDate(new Date(year, month + 1, 1));
  const handleToday = () => setCurrentDate(new Date());

  const getRole = (projectId) => {
    const project = projects.find(p => p.id === projectId);
    if (!project || !currentUser) return 'Viewer';
    if (project.owner?.id === currentUser.id) return 'Admin';
    if (project.members && project.members.length > 0) return project.members[0].role;
    return 'Viewer';
  };

  const canEdit = (event) => {
    if (!event.projectId) return event.creatorId === currentUser?.id;
    const role = getRole(event.projectId);
    return role === 'Admin' || role === 'Editor';
  };

  const canDelete = (event) => {
    if (!event.projectId) return event.creatorId === currentUser?.id;
    const role = getRole(event.projectId);
    return role === 'Admin' || role === 'Owner';
  };

  const toLocalISOString = (d) => {
    if (!d || isNaN(d)) return '';
    const pad = (n) => (n < 10 ? '0' + n : n);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };

  const openAdd = (date = null) => {
    setEditingEvent(null);
    let startDate = new Date();
    if (date) {
      startDate = new Date(date);
      startDate.setHours(9, 0, 0, 0);
    } else {
      startDate.setMinutes(0, 0, 0);
    }
    
    const endDate = new Date(startDate);
    endDate.setHours(startDate.getHours() + 1);

    setForm({
      ...defaultForm,
      startDateTime: toLocalISOString(startDate),
      endDateTime: toLocalISOString(endDate)
    });
    setShowModal(true);
  };

  const openEdit = (event) => {
    if (event.derived || event.readOnly) {
      // Prompt: Do not open the normal edit modal for derived records.
      // Derived Project -> navigate to project. Derived Task -> navigate to task/project
      if (event.sourceType === 'project') navigate(`/projects`);
      if (event.sourceType === 'task') navigate(`/tasks`);
      return;
    }
    setEditingEvent(event);
    setForm({
      title: event.title, description: event.description || '', type: event.type || 'Meeting',
      startDateTime: toLocalISOString(new Date(event.startDateTime)),
      endDateTime: toLocalISOString(new Date(event.endDateTime)),
      allDay: event.allDay || false,
      projectId: event.projectId || '', taskId: event.taskId || '', location: event.location || ''
    });
    setShowModal(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const payload = {
        title: form.title,
        description: form.description,
        type: form.type,
        startDateTime: new Date(form.startDateTime).toISOString(),
        endDateTime: new Date(form.endDateTime).toISOString(),
        allDay: form.allDay,
        projectId: form.projectId || null,
        taskId: form.taskId || null,
        location: form.location
      };

      if (editingEvent) {
        await apiClient(`/calendar/events/${editingEvent.id}`, { method: 'PATCH', body: payload });
      } else {
        await apiClient('/calendar/events', { method: 'POST', body: payload });
      }
      setShowModal(false);
      fetchEvents();
    } catch (err) {
      alert(err.message || 'Failed to save event');
    }
  };

  const handleDelete = async () => {
    if (!editingEvent || !window.confirm('Are you sure you want to delete this event?')) return;
    try {
      await apiClient(`/calendar/events/${editingEvent.id}`, { method: 'DELETE' });
      setShowModal(false);
      fetchEvents();
    } catch (err) {
      alert(err.message || 'Failed to delete event');
    }
  };

  const getTypeColor = (type) => {
    if (!type) return 'bg-purple-500 text-purple-400';
    if (type.includes('Project')) return 'bg-purple-500 text-purple-400';
    if (type.includes('Task')) return 'bg-blue-500 text-blue-400';
    switch (type) {
      case 'Meeting': return 'bg-amber-500 text-amber-400';
      case 'Personal': return 'bg-slate-400 text-slate-400';
      case 'Milestone': return 'bg-pink-500 text-pink-400';
      case 'Deadline': return 'bg-rose-500 text-rose-400';
      default: return 'bg-emerald-500 text-emerald-400';
    }
  };

  const formatEventTime = (isoString, allDay) => {
    if (allDay) return 'All Day';
    const d = new Date(isoString);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  // Filter events logically
  const displayedEvents = events.filter(e => {
    if (selectedProjectFilter && e.projectId !== selectedProjectFilter) return false;
    if (selectedTypeFilter) {
      // Event type filtering logic based on exact match or broad category
      if (selectedTypeFilter === 'Project' && !e.type?.includes('Project')) return false;
      else if (selectedTypeFilter === 'Task' && !e.type?.includes('Task')) return false;
      else if (selectedTypeFilter !== 'Project' && selectedTypeFilter !== 'Task' && e.type !== selectedTypeFilter) return false;
    }
    return true;
  });

  const now = new Date();
  
  // Today's events
  const todaysEvents = displayedEvents.filter(e => {
    const d = new Date(e.startDateTime);
    return d.getDate() === now.getDate() && d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  });

  // Upcoming events
  const upcomingEvents = displayedEvents.filter(e => {
    const d = new Date(e.startDateTime);
    return d > now;
  }).slice(0, 5);

  const eventTypes = ['Meeting', 'Deadline', 'Milestone', 'Personal'];

  return (
    <div className="flex flex-col xl:flex-row gap-6 max-w-[1920px] mx-auto pb-12 min-h-screen">
      
      {/* Main Content Area */}
      <div className="flex-1 min-w-0 flex flex-col gap-6">
        
        {/* Header / Top Bar */}
        <div className="relative rounded-2xl p-6 bg-[#0f1422] border border-[#192238] overflow-hidden flex flex-col sm:flex-row justify-between items-start sm:items-center gap-6 shadow-sm">
           <div className="absolute right-0 top-0 bottom-0 w-1/2 opacity-30 pointer-events-none bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-purple-600/30 via-[#0f1422]/10 to-transparent"></div>
           <div className="z-10">
             <div className="flex items-center gap-2 text-[10px] font-bold tracking-wider text-slate-400 mb-2 uppercase">
               <span>Calendar</span>
               <span className="text-slate-600">›</span>
               <span className="text-purple-400">{monthName} {year}</span>
             </div>
             <h1 className="text-3xl font-extrabold text-white tracking-tight flex items-center gap-3">
               <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-purple-800 flex items-center justify-center shadow-lg shadow-purple-900/50 shrink-0">
                 <i className="fa-regular fa-calendar text-white text-lg"></i>
               </div>
               {monthName} {year}
             </h1>
           </div>
           
           <div className="z-10 flex flex-col sm:flex-row items-center gap-3 w-full sm:w-auto">
              <div className="flex bg-[#161d2f] border border-[#1f2a44] rounded-xl p-1 shadow-inner">
                 <button onClick={handlePrevMonth} className="px-3 py-1.5 text-slate-400 hover:text-white hover:bg-[#1a2333] rounded-lg transition"><i className="fa-solid fa-chevron-left text-xs"></i></button>
                 <button onClick={handleToday} className="px-4 py-1.5 text-xs font-bold text-white hover:bg-[#1a2333] rounded-lg transition">Today</button>
                 <button onClick={handleNextMonth} className="px-3 py-1.5 text-slate-400 hover:text-white hover:bg-[#1a2333] rounded-lg transition"><i className="fa-solid fa-chevron-right text-xs"></i></button>
              </div>
              <button onClick={() => openAdd(null)} className="w-full sm:w-auto px-5 py-2.5 bg-[#5922cf] hover:bg-[#682ae6] text-white rounded-xl text-sm font-bold shadow-lg shadow-purple-900/30 transition flex items-center justify-center gap-2">
                <i className="fa-solid fa-plus"></i> Add Event
              </button>
           </div>
        </div>

        {/* Filters & Tabs */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
           <div className="flex items-center gap-1.5 p-1 bg-[#0f1422] border border-[#192238] rounded-xl overflow-x-auto hide-scrollbar shadow-sm">
             {['Month', 'Week', 'Day', 'Agenda'].map(tab => (
               <button 
                 key={tab} 
                 onClick={() => tab === 'Month' && setActiveTab(tab)}
                 className={`px-4 py-2 rounded-lg text-xs font-bold transition whitespace-nowrap ${activeTab === tab ? 'bg-purple-600 text-white shadow-md shadow-purple-900/20' : 'text-slate-400 cursor-not-allowed opacity-50'}`}
                 title={tab !== 'Month' ? 'Coming soon in future MVP phases' : ''}
               >
                 {tab}
               </button>
             ))}
           </div>
           <div className="flex items-center gap-3">
             <select value={selectedProjectFilter} onChange={e => setSelectedProjectFilter(e.target.value)} className="appearance-none bg-[#0f1422] border border-[#192238] rounded-xl px-4 py-2 text-xs font-bold text-slate-300 focus:outline-none focus:border-purple-500 transition shadow-sm cursor-pointer min-w-[140px]">
               <option value="">All Projects</option>
               {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
             </select>
             <select value={selectedTypeFilter} onChange={e => setSelectedTypeFilter(e.target.value)} className="appearance-none bg-[#0f1422] border border-[#192238] rounded-xl px-4 py-2 text-xs font-bold text-slate-300 focus:outline-none focus:border-purple-500 transition shadow-sm cursor-pointer min-w-[140px]">
               <option value="">All Event Types</option>
               <option value="Project">Project derived</option>
               <option value="Task">Task derived</option>
               {eventTypes.map(t => <option key={t} value={t}>{t}</option>)}
             </select>
           </div>
        </div>

        {/* Main Calendar Grid */}
        <div className="bg-[#0f1422] border border-[#192238] rounded-2xl overflow-hidden shadow-sm flex flex-col flex-1">
          <div className="grid grid-cols-7 border-b border-[#192238] bg-[#161d2f]/50 text-center text-[10px] font-bold text-slate-400 uppercase tracking-wider py-3">
            <div>Sun</div><div>Mon</div><div>Tue</div><div>Wed</div><div>Thu</div><div>Fri</div><div>Sat</div>
          </div>
          
          <div className="grid grid-cols-7 divide-x divide-y divide-[#1f2a44] bg-[#0f1422] flex-1 overflow-x-auto min-w-[700px]">
            {loading ? (
               <div className="col-span-7 flex flex-col items-center justify-center p-20 min-h-[500px]">
                 <i className="fa-solid fa-circle-notch fa-spin text-3xl text-purple-500 mb-4"></i>
                 <span className="text-sm font-bold text-slate-400">Loading calendar events...</span>
               </div>
            ) : error ? (
               <div className="col-span-7 flex flex-col items-center justify-center p-20 min-h-[500px]">
                 <i className="fa-solid fa-circle-exclamation text-4xl text-rose-500 mb-4"></i>
                 <h3 className="text-base font-bold text-white mb-2">Unable to load calendar events.</h3>
                 <button onClick={fetchEvents} className="px-4 py-2 bg-[#161d2f] hover:bg-[#1a2333] border border-[#1f2a44] rounded-lg text-xs font-bold text-white transition">Retry</button>
               </div>
            ) : days.map((dateObj, i) => {
              if (!dateObj) {
                return <div key={i} className="min-h-[120px] p-2 bg-[#0a0d16]"></div>;
              }
              const isToday = new Date().toDateString() === dateObj.toDateString();
              
              const dayEvents = displayedEvents.filter(e => {
                const eventStart = new Date(e.startDateTime);
                return eventStart.toDateString() === dateObj.toDateString();
              });

              return (
                <div key={i} onClick={() => openAdd(dateObj)} className={`min-h-[120px] p-1.5 sm:p-2 group hover:bg-[#161d2f] transition cursor-pointer relative flex flex-col ${isToday ? 'bg-[#1a1c2e] ring-1 ring-inset ring-purple-600/30' : ''}`}>
                  <div className="flex items-center justify-between mb-1">
                    {isToday ? (
                      <span className="w-6 h-6 rounded bg-purple-600 text-white flex items-center justify-center text-xs font-bold shadow-md">{dateObj.getDate()}</span>
                    ) : (
                      <span className="w-6 h-6 flex items-center justify-center text-xs font-bold text-slate-400 group-hover:text-white transition">{dateObj.getDate()}</span>
                    )}
                  </div>
                  
                  <div className="flex flex-col gap-1 flex-1 overflow-y-auto hide-scrollbar pb-1">
                    {dayEvents.length === 0 && <div className="hidden group-hover:block text-[9px] text-slate-600 italic text-center mt-2">Click to add</div>}
                    {dayEvents.map(e => {
                      const colorClass = getTypeColor(e.type);
                      const isDerivedProject = e.sourceType === 'project';
                      const isDerivedTask = e.sourceType === 'task';
                      
                      return (
                        <div 
                          key={e.id} 
                          onClick={(ev) => { 
                            ev.stopPropagation(); 
                            openEdit(e); 
                          }}
                          className={`px-1.5 py-1 rounded truncate flex flex-col gap-0.5 hover:brightness-110 transition border cursor-pointer ${
                            isDerivedProject 
                              ? 'bg-purple-500/20 border-purple-500/30 text-purple-100 shadow-sm' 
                              : isDerivedTask
                              ? 'bg-blue-500/10 border-blue-500/20 text-blue-100 text-[10px]'
                              : 'bg-[#1a2333] border-[#2d3a5a] text-slate-200'
                          }`}
                        >
                          <div className="flex items-center gap-1.5">
                             {!isDerivedProject && !isDerivedTask && <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${colorClass.split(' ')[0]}`}></span>}
                             <span className={`font-bold truncate ${isDerivedTask ? 'text-[9px]' : 'text-[10px]'}`}>{e.title}</span>
                          </div>
                          {!e.allDay && <span className="text-[8px] text-slate-400 font-medium ml-3">{formatEventTime(e.startDateTime, e.allDay)}</span>}
                        </div>
                      )
                    })}
                  </div>
                </div>
              );
            })}
          </div>
          
          {/* Legend */}
          <div className="bg-[#161d2f]/30 border-t border-[#192238] p-3 flex flex-wrap items-center justify-center gap-4 text-[10px] font-bold text-slate-400">
             {eventTypes.map(type => (
               <div key={type} className="flex items-center gap-1.5">
                 <span className={`w-2 h-2 rounded-full ${getTypeColor(type).split(' ')[0]}`}></span>
                 {type}
               </div>
             ))}
             <div className="flex items-center gap-1.5 ml-4">
                 <span className="px-1.5 py-0.5 rounded bg-purple-500/20 border border-purple-500/30 text-purple-400 text-[9px]">Project Event</span>
             </div>
             <div className="flex items-center gap-1.5">
                 <span className="px-1.5 py-0.5 rounded bg-blue-500/10 border border-blue-500/20 text-blue-400 text-[9px]">Task Event</span>
             </div>
          </div>
        </div>
      </div>

      {/* Right Sidebar */}
      <div className="w-full xl:w-[320px] shrink-0 flex flex-col gap-6">
        
        {/* Today Panel */}
        <div className="bg-[#0f1422] border border-[#192238] rounded-2xl p-5 shadow-sm">
          <div className="flex items-center justify-between mb-4">
             <h2 className="text-sm font-bold text-white flex items-center gap-2"><i className="fa-regular fa-star text-amber-400"></i> Today</h2>
             <span className="text-[10px] font-bold text-slate-500 bg-[#161d2f] px-2 py-0.5 rounded border border-[#1f2a44]">{now.toLocaleDateString()}</span>
          </div>
          {todaysEvents.length === 0 ? (
             <div className="text-center py-6 text-xs text-slate-500 bg-[#161d2f] rounded-xl border border-[#1f2a44] border-dashed">No events today.</div>
          ) : (
             <div className="flex flex-col gap-3">
               {todaysEvents.map(e => (
                 <div key={e.id} onClick={() => openEdit(e)} className="flex items-start gap-3 p-3 bg-[#161d2f] border border-[#1f2a44] hover:border-[#2d3a5a] rounded-xl cursor-pointer transition group">
                   <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 border ${getTypeColor(e.type).replace('text-', 'border-').replace('bg-', 'bg-opacity-10 bg-')}`}>
                     <i className={`fa-solid ${e.sourceType === 'project' ? 'fa-diagram-project' : e.sourceType === 'task' ? 'fa-list-check' : 'fa-calendar-day'} ${getTypeColor(e.type).split(' ')[1]}`}></i>
                   </div>
                   <div className="min-w-0 flex-1">
                     <h4 className="text-xs font-bold text-white truncate group-hover:text-purple-400 transition">{e.title}</h4>
                     <p className="text-[10px] text-slate-400 mt-0.5">{formatEventTime(e.startDateTime, e.allDay)}</p>
                   </div>
                 </div>
               ))}
             </div>
          )}
        </div>

        {/* Upcoming Events */}
        <div className="bg-[#0f1422] border border-[#192238] rounded-2xl p-5 shadow-sm flex flex-col max-h-[500px]">
          <div className="flex items-center justify-between mb-5">
             <h2 className="text-sm font-bold text-white flex items-center gap-2"><i className="fa-solid fa-clock-rotate-left text-slate-400"></i> Upcoming Events</h2>
          </div>
          
          <div className="flex-1 overflow-y-auto hide-scrollbar pr-1">
            {upcomingEvents.length === 0 ? (
               <div className="text-center py-8 text-xs text-slate-500 bg-[#161d2f] rounded-xl border border-[#1f2a44] border-dashed">No upcoming events scheduled.</div>
            ) : (
               <div className="flex flex-col gap-0 relative ml-2">
                 <div className="absolute left-[7px] top-2 bottom-2 w-px bg-[#1f2a44] z-0"></div>
                 {upcomingEvents.map((e) => (
                   <div key={e.id} onClick={() => openEdit(e)} className="flex gap-4 relative z-10 mb-5 last:mb-0 cursor-pointer group">
                     <div className={`w-4 h-4 rounded-full bg-[#0f1422] border-[3px] flex shrink-0 mt-0.5 transition ${getTypeColor(e.type).replace('text-', 'border-').split(' ')[0]}`}></div>
                     <div className="min-w-0 bg-[#161d2f] border border-[#1f2a44] group-hover:border-[#2d3a5a] rounded-xl p-3 flex-1 transition shadow-sm">
                       <h4 className="text-xs font-bold text-white mb-1 truncate">{e.title}</h4>
                       <div className="flex items-center gap-2 mb-1.5">
                         <span className="text-[10px] font-bold text-slate-400"><i className="fa-regular fa-calendar mr-1"></i>{new Date(e.startDateTime).toLocaleDateString()}</span>
                         {!e.allDay && <span className="text-[10px] text-slate-500"><i className="fa-regular fa-clock mr-1"></i>{formatEventTime(e.startDateTime, e.allDay)}</span>}
                       </div>
                       <div className="flex gap-2">
                         <span className="px-1.5 py-0.5 rounded bg-[#0f1422] border border-[#1f2a44] text-[9px] font-bold text-slate-400 truncate max-w-[100px]">{e.project ? e.project.name : 'Personal'}</span>
                         <span className={`px-1.5 py-0.5 rounded border text-[9px] font-bold ${getTypeColor(e.type).replace('bg-', 'bg-').replace('500', '500/10').replace('text-', 'text-').replace('400', '400').split(' ').join(' border-').replace('border-text-', 'border-')}`}>{e.type || 'Event'}</span>
                       </div>
                     </div>
                   </div>
                 ))}
               </div>
            )}
          </div>
        </div>

      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 flex items-center justify-center z-50 bg-black/60 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="bg-[#101524] p-6 rounded-2xl border border-[#192238] w-full max-w-lg shadow-2xl">
            <h2 className="text-lg text-white font-bold mb-5 flex items-center gap-2">
              <i className={`fa-solid ${editingEvent ? 'fa-pen' : 'fa-calendar-plus'} text-purple-500`}></i> 
              {editingEvent ? 'Edit Event' : 'Add Event'}
            </h2>
            
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Event Title <span className="text-red-500">*</span></label>
                <input required value={form.title} onChange={e => setForm({...form, title: e.target.value})} placeholder="e.g., Q3 Planning Session" className="w-full bg-[#161d2f] border border-[#1f2a44] rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-purple-500 transition shadow-inner" />
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Type</label>
                  <select value={form.type} onChange={e => setForm({...form, type: e.target.value})} className="w-full bg-[#161d2f] border border-[#1f2a44] rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-purple-500 transition shadow-inner">
                    {eventTypes.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                   <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Location</label>
                   <input value={form.location} onChange={e => setForm({...form, location: e.target.value})} placeholder="Zoom, Office, etc." className="w-full bg-[#161d2f] border border-[#1f2a44] rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-purple-500 transition shadow-inner" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Project (Optional)</label>
                  <select value={form.projectId} onChange={e => setForm({...form, projectId: e.target.value})} disabled={editingEvent && form.projectId !== '' && form.projectId !== null} className="w-full bg-[#161d2f] border border-[#1f2a44] rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-purple-500 transition shadow-inner disabled:opacity-50">
                    <option value="">Personal Event</option>
                    {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>
                {form.projectId && (
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Task (Optional)</label>
                    <select value={form.taskId} onChange={e => setForm({...form, taskId: e.target.value})} className="w-full bg-[#161d2f] border border-[#1f2a44] rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-purple-500 transition shadow-inner">
                      <option value="">None</option>
                      {projectTasks.map(t => <option key={t.id} value={t.id}>{t.title}</option>)}
                    </select>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4 p-4 bg-[#161d2f] border border-[#1f2a44] rounded-xl relative">
                <div className="absolute -top-2 left-4 px-1 bg-[#101524] text-[9px] font-bold text-slate-400 uppercase tracking-wider">Date & Time</div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Start <span className="text-red-500">*</span></label>
                  <input required type={form.allDay ? 'date' : 'datetime-local'} value={form.allDay ? form.startDateTime.split('T')[0] : form.startDateTime} onChange={e => setForm({...form, startDateTime: form.allDay ? `${e.target.value}T00:00` : e.target.value})} className="w-full bg-[#0f1422] border border-[#1f2a44] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-purple-500 transition shadow-inner" />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">End <span className="text-red-500">*</span></label>
                  <input required type={form.allDay ? 'date' : 'datetime-local'} value={form.allDay ? form.endDateTime.split('T')[0] : form.endDateTime} onChange={e => setForm({...form, endDateTime: form.allDay ? `${e.target.value}T23:59` : e.target.value})} className="w-full bg-[#0f1422] border border-[#1f2a44] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-purple-500 transition shadow-inner" />
                </div>
                <div className="col-span-2 flex items-center gap-2 mt-1">
                  <input type="checkbox" id="allDay" checked={form.allDay} onChange={e => setForm({...form, allDay: e.target.checked})} className="rounded bg-[#0f1422] border-[#1e293f] text-purple-600 focus:ring-purple-500 w-4 h-4" />
                  <label htmlFor="allDay" className="text-xs font-bold text-slate-300 cursor-pointer">All-day event</label>
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Description</label>
                <textarea value={form.description} onChange={e => setForm({...form, description: e.target.value})} placeholder="Add event details, meeting links, agendas..." rows="3" className="w-full bg-[#161d2f] border border-[#1f2a44] rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-purple-500 transition shadow-inner" />
              </div>

              <div className="flex justify-between items-center mt-2 pt-4 border-t border-[#1f2a44]">
                <div>
                  {editingEvent && canDelete(editingEvent) && (
                    <button type="button" onClick={handleDelete} className="text-red-400 hover:text-red-300 hover:bg-red-500/10 text-xs font-bold px-3 py-2 rounded-lg transition flex items-center gap-2">
                       <i className="fa-solid fa-trash"></i> Delete
                    </button>
                  )}
                </div>
                <div className="flex gap-3">
                  <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2 text-slate-400 text-xs font-bold hover:text-white transition">Cancel</button>
                  {(!editingEvent || canEdit(editingEvent)) && (
                    <button type="submit" className="px-5 py-2 bg-[#5922cf] hover:bg-[#682ae6] text-white rounded-lg text-xs font-bold shadow-lg shadow-purple-900/30 transition">Save Event</button>
                  )}
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}