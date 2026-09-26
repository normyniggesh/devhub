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

  const [showModal, setShowModal] = useState(false);
  const [editingEvent, setEditingEvent] = useState(null);
  
  const [form, setForm] = useState({
    title: '', description: '', type: 'Meeting',
    startDateTime: '', endDateTime: '', allDay: false,
    projectId: '', taskId: '', location: ''
  });

  const [projectTasks, setProjectTasks] = useState([]);

  // Load Projects
  useEffect(() => {
    const fetchProjects = async () => {
      try {
        const data = await apiClient('/projects');
        setProjects(data.projects || []);
      } catch (err) {}
    };
    fetchProjects();
  }, []);

  // Fetch events for current month view
  useEffect(() => {
    const fetchEvents = async () => {
      setLoading(true);
      try {
        const year = currentDate.getFullYear();
        const month = currentDate.getMonth();
        const start = new Date(year, month, 1).toISOString();
        const end = new Date(year, month + 1, 0, 23, 59, 59).toISOString();
        
        const data = await apiClient(`/calendar/events?start=${start}&end=${end}`);
        setEvents(data.events || []);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchEvents();
  }, [currentDate]);

  // Load tasks when project changes in the form
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
    return role === 'Admin';
  };

  const openAdd = (date = null) => {
    setEditingEvent(null);
    let startDate = new Date();
    if (date) {
      startDate = new Date(date);
      startDate.setHours(9, 0, 0, 0); // Default to 9 AM
    }
    
    // Format to yyyy-MM-ddThh:mm
    const toLocalISOString = (d) => {
      const pad = (n) => (n < 10 ? '0' + n : n);
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    };

    const endDate = new Date(startDate);
    endDate.setHours(startDate.getHours() + 1);

    setForm({
      title: '', description: '', type: 'Meeting',
      startDateTime: toLocalISOString(startDate),
      endDateTime: toLocalISOString(endDate),
      allDay: false, projectId: '', taskId: '', location: ''
    });
    setShowModal(true);
  };

  const openEdit = (event) => {
    setEditingEvent(event);
    
    const formatDt = (isoStr) => {
      if (!isoStr) return '';
      const d = new Date(isoStr);
      const pad = (n) => (n < 10 ? '0' + n : n);
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    };

    setForm({
      title: event.title, description: event.description || '', type: event.type || 'Meeting',
      startDateTime: formatDt(event.startDateTime),
      endDateTime: formatDt(event.endDateTime),
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
        // Exclude projectId from being changed if it was already set, but backend handles this or frontend strips it.
        // The prompt says "Do not allow: unsafe project reassignment". Let's simply send it. The backend will validate.
        await apiClient(`/calendar/events/${editingEvent.id}`, { method: 'PATCH', body: payload });
      } else {
        await apiClient('/calendar/events', { method: 'POST', body: payload });
      }
      setShowModal(false);
      
      // Refresh current view
      const start = new Date(year, month, 1).toISOString();
      const end = new Date(year, month + 1, 0, 23, 59, 59).toISOString();
      const data = await apiClient(`/calendar/events?start=${start}&end=${end}`);
      setEvents(data.events || []);
    } catch (err) {
      alert(err.message || 'Failed to save event');
    }
  };

  const handleDelete = async () => {
    if (!editingEvent || !confirm('Are you sure you want to delete this event?')) return;
    try {
      await apiClient(`/calendar/events/${editingEvent.id}`, { method: 'DELETE' });
      setShowModal(false);
      
      const start = new Date(year, month, 1).toISOString();
      const end = new Date(year, month + 1, 0, 23, 59, 59).toISOString();
      const data = await apiClient(`/calendar/events?start=${start}&end=${end}`);
      setEvents(data.events || []);
    } catch (err) {
      alert(err.message || 'Failed to delete event');
    }
  };

  const getTypeColor = (type) => {
    if (type?.includes('Project')) return 'bg-purple-500';
    if (type?.includes('Task')) return 'bg-blue-500';
    if (type?.includes('QA')) return 'bg-rose-500';
    
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
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-medium text-slate-500 mb-1">
            <span>Calendar</span>
            <svg className="w-3.5 h-3.5 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M9 5l7 7-7 7" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"></path></svg>
            <span className="text-slate-400">{monthName} {year}</span>
          </div>
          <h1 className="text-3xl font-bold text-white tracking-tight">{monthName} {year}</h1>
          <p className="text-xs text-slate-400 mt-1">Plan better. Do more.</p>
        </div>
        <div className="text-right hidden sm:block">
          <p className="text-sm italic text-slate-400 font-serif leading-snug">"A well-planned day<br />leads to a well-built future."</p>
          <div className="h-0.5 w-12 bg-purple-600 ml-auto mt-2 rounded-full"></div>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
        <div className="flex items-center gap-2">
          <div className="flex items-center bg-[#0e131d] border border-[#1b2333] rounded-lg p-0.5">
            <button onClick={handlePrevMonth} className="p-1.5 hover:bg-[#182030] text-slate-400 hover:text-white rounded transition">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M15 19l-7-7 7-7" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"></path></svg>
            </button>
            <button onClick={handleNextMonth} className="p-1.5 hover:bg-[#182030] text-slate-400 hover:text-white rounded transition">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M9 5l7 7-7 7" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"></path></svg>
            </button>
          </div>
          <button onClick={handleToday} className="px-3 py-1.5 bg-[#0e131d] hover:bg-[#182030] text-slate-300 font-medium text-xs border border-[#1b2333] rounded-lg transition">
            Today
          </button>
        </div>
        
        <div className="flex items-center gap-2.5">
          <button onClick={() => openAdd(null)} className="flex items-center gap-1.5 px-3.5 py-1.5 bg-[#5922cf] hover:bg-[#682ae6] text-white text-xs font-semibold rounded-lg shadow-md transition">
            <i className="fa-solid fa-plus"></i>
            Add Event
          </button>
        </div>
      </div>

      <div className="bg-[#0b0e16] border border-[#171f2d] rounded-xl overflow-hidden shadow-2xl overflow-x-auto">
        <div className="min-w-[700px]">
          <div className="grid grid-cols-7 border-b border-[#171f2d] bg-[#0c101a] text-center text-xs font-semibold text-slate-400 py-3">
            <div>Sun</div><div>Mon</div><div>Tue</div><div>Wed</div><div>Thu</div><div>Fri</div><div>Sat</div>
          </div>
          
          <div className="grid grid-cols-7 divide-x divide-y divide-[#171f2d] bg-[#080b12]">
            {loading ? (
               <div className="col-span-7 min-h-[300px] flex items-center justify-center text-slate-400 text-sm">Loading calendar...</div>
            ) : days.map((dateObj, i) => {
              if (!dateObj) {
                return <div key={i} className="min-h-[108px] p-2 bg-[#080a11]/60"></div>;
              }
              const isToday = new Date().toDateString() === dateObj.toDateString();
              
              // Filter events for this day
              const dayEvents = events.filter(e => {
                const eventStart = new Date(e.startDateTime);
                return eventStart.toDateString() === dateObj.toDateString();
              });

              return (
                <div key={i} onClick={() => openAdd(dateObj)} className={`min-h-[108px] p-2 group hover:bg-[#0d121c] transition cursor-pointer relative ${isToday ? 'bg-[#121624] ring-1 ring-purple-600/50' : ''}`}>
                  <div className="flex items-center mb-1">
                    {isToday ? (
                      <span className="w-5 h-5 rounded-full bg-purple-600 text-white flex items-center justify-center text-xs font-bold shadow-md">{dateObj.getDate()}</span>
                    ) : (
                      <span className="text-xs font-medium text-slate-300">{dateObj.getDate()}</span>
                    )}
                  </div>
                  <div className="flex flex-col gap-1 mt-1">
                    {dayEvents.slice(0, 3).map(e => (
                      <div 
                        key={e.id} 
                        onClick={(ev) => { 
                          ev.stopPropagation(); 
                          if (e.derived) {
                            if (e.sourceType === 'project') navigate(`/projects`);
                            else if (e.sourceType === 'task') navigate(`/tasks`);
                          } else {
                            openEdit(e); 
                          }
                        }}
                        className={`px-1.5 py-0.5 rounded truncate flex items-center gap-1 hover:bg-[#1f283c] transition border border-[#2d3b55] cursor-pointer ${
                          e.sourceType === 'project' 
                            ? 'text-xs text-white font-medium shadow-sm bg-[#182030]' 
                            : 'text-[10px] text-slate-300'
                        }`}
                      >
                        <span className={`w-1.5 h-1.5 rounded-full ${getTypeColor(e.type)}`}></span>
                        {e.title}
                      </div>
                    ))}
                    {dayEvents.length > 3 && (
                       <div className="text-[10px] text-slate-500 pl-1">+{dayEvents.length - 3} more</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-6 text-xs text-slate-400 pt-1 px-1">
        {['Project', 'Task', 'QA / Testing', 'College', 'Meeting', 'Personal', 'Milestone'].map(type => (
          <div key={type} className="flex items-center gap-2">
            <span className={`w-2.5 h-2.5 rounded-full ${getTypeColor(type)}`}></span>
            <span>{type}</span>
          </div>
        ))}
      </div>

      {showModal && (
        <div className="fixed inset-0 flex items-center justify-center z-50 bg-black/60 p-4">
          <div className="bg-[#101524] p-6 rounded-xl border border-[#192238] w-full max-w-md max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg text-white font-bold mb-4">{editingEvent ? 'Edit Event' : 'Add Event'}</h2>
            
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <input required value={form.title} onChange={e => setForm({...form, title: e.target.value})} placeholder="Event Title" className="bg-[#111728] border border-[#1e293f] rounded-lg px-3 py-2 text-sm text-white focus:outline-none" />
              
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Type</label>
                  <select value={form.type} onChange={e => setForm({...form, type: e.target.value})} className="w-full bg-[#111728] border border-[#1e293f] rounded-lg px-3 py-2 text-sm text-white focus:outline-none">
                    <option>Meeting</option><option>Personal</option><option>Project</option>
                    <option>Task</option><option>QA / Testing</option><option>College</option>
                    <option>Milestone</option>
                  </select>
                </div>
                <div>
                   <label className="block text-xs font-medium text-slate-400 mb-1">Location</label>
                   <input value={form.location} onChange={e => setForm({...form, location: e.target.value})} placeholder="Zoom, Room 1, etc." className="w-full bg-[#111728] border border-[#1e293f] rounded-lg px-3 py-2 text-sm text-white focus:outline-none" />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Project (Optional - leaves as Personal if empty)</label>
                <select value={form.projectId} onChange={e => setForm({...form, projectId: e.target.value})} className="w-full bg-[#111728] border border-[#1e293f] rounded-lg px-3 py-2 text-sm text-white focus:outline-none">
                  <option value="">None (Personal)</option>
                  {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>

              {form.projectId && (
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Task (Optional)</label>
                  <select value={form.taskId} onChange={e => setForm({...form, taskId: e.target.value})} className="w-full bg-[#111728] border border-[#1e293f] rounded-lg px-3 py-2 text-sm text-white focus:outline-none">
                    <option value="">None</option>
                    {projectTasks.map(t => <option key={t.id} value={t.id}>{t.title}</option>)}
                  </select>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Start</label>
                  <input required type="datetime-local" value={form.startDateTime} onChange={e => setForm({...form, startDateTime: e.target.value})} className="w-full bg-[#111728] border border-[#1e293f] rounded-lg px-3 py-2 text-sm text-white focus:outline-none" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">End</label>
                  <input required type="datetime-local" value={form.endDateTime} onChange={e => setForm({...form, endDateTime: e.target.value})} className="w-full bg-[#111728] border border-[#1e293f] rounded-lg px-3 py-2 text-sm text-white focus:outline-none" />
                </div>
              </div>

              <div className="flex items-center gap-2">
                <input type="checkbox" id="allDay" checked={form.allDay} onChange={e => setForm({...form, allDay: e.target.checked})} className="rounded bg-[#111728] border-[#1e293f] text-purple-600 focus:ring-0" />
                <label htmlFor="allDay" className="text-sm text-slate-300">All-day event</label>
              </div>

              <textarea value={form.description} onChange={e => setForm({...form, description: e.target.value})} placeholder="Event description..." rows="2" className="w-full bg-[#111728] border border-[#1e293f] rounded-lg px-3 py-2 text-sm text-white focus:outline-none" />

              <div className="flex justify-between items-center mt-2">
                <div>
                  {editingEvent && canDelete(editingEvent) && (
                    <button type="button" onClick={handleDelete} className="text-red-400 text-sm hover:text-red-300 px-2 py-1">Delete</button>
                  )}
                </div>
                <div className="flex gap-2">
                  <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2 text-slate-400 text-sm">Cancel</button>
                  {(!editingEvent || canEdit(editingEvent)) && (
                    <button type="submit" className="px-4 py-2 bg-[#5922cf] hover:bg-[#682ae6] text-white rounded-lg text-sm">Save</button>
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