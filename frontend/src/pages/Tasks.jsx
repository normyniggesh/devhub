import { useState, useEffect } from 'react';
import { apiClient } from '../api/client';
import { useStore } from '../store';
import Tabs from '../components/common/Tabs';
import LoadingState from '../components/common/LoadingState';
import ErrorState from '../components/common/ErrorState';
import EmptyState from '../components/common/EmptyState';
import ActivityFeed from '../components/activity/ActivityFeed';
import Modal from '../components/common/Modal';
import { getStatusDotColor, getPriorityColor } from '../utils/colors';

export default function Tasks() {
  const { currentUser } = useStore();
  const [tasks, setTasks] = useState([]);
  const [projects, setProjects] = useState([]);
  const [activity, setActivity] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  const [activeView, setActiveView] = useState('Kanban'); // Kanban, List, Calendar, Timeline
  const [activeMyTasksTab, setActiveMyTasksTab] = useState('Assigned to Me');

  // Filters
  const [filterProjectId, setFilterProjectId] = useState('');
  const [filterAssigneeId, setFilterAssigneeId] = useState('');
  const [filterPriority, setFilterPriority] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  // Calendar State for Calendar View
  const [calendarDate, setCalendarDate] = useState(new Date());

  // Modals
  const [showModal, setShowModal] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [modalError, setModalError] = useState(null);
  const [selectedProjectId, setSelectedProjectId] = useState('');
  const [projectMembers, setProjectMembers] = useState([]);

  const defaultTask = { 
    title: '', 
    description: '',
    status: 'To Do', 
    priority: 'Medium',
    assigneeId: '',
    startDate: '',
    dueDate: ''
  };
  const [newTasks, setNewTasks] = useState([{ ...defaultTask }]);

  const [editingTask, setEditingTask] = useState(null);
  const [showEditModal, setShowEditModal] = useState(false);

  // Fetch Data
  const fetchTasks = async () => {
    try {
      const data = await apiClient('/tasks'); // Fetch all to allow local filtering
      setTasks(data.tasks || []);
      setError(null);
    } catch (err) {
      setError(err.message || 'Unable to load tasks.');
    }
  };

  const fetchProjects = async () => {
    try {
      const data = await apiClient('/projects');
      setProjects(data.projects || []);
    } catch (err) {}
  };

  const fetchActivity = async () => {
    try {
      const data = await apiClient('/activity');
      if (data.activity) {
        setActivity(data.activity.filter(a => a.entityType === 'Task'));
      }
    } catch (err) {}
  };

  const fetchData = async () => {
    setLoading(true);
    await Promise.all([fetchTasks(), fetchProjects(), fetchActivity()]);
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Update members when project selected in modal
  useEffect(() => {
    const projectId = showEditModal && editingTask ? editingTask.projectId : (showModal ? selectedProjectId : null);
    if (projectId) {
      const fetchMembers = async () => {
        try {
          const data = await apiClient(`/projects/${projectId}`);
          let members = data.project.members || [];
          const owner = data.project.owner;
          const hasOwner = members.some(m => m.user.id === owner.id);
          if (!hasOwner) {
            members = [...members, { user: owner }];
          }
          setProjectMembers(members);
        } catch (err) {
          setProjectMembers([]);
        }
      };
      fetchMembers();
    } else {
      setProjectMembers([]);
    }
  }, [selectedProjectId, showEditModal, showModal, editingTask]);

  // Derived Tasks
  const filteredTasks = tasks.filter(t => {
    if (filterProjectId && t.projectId !== filterProjectId) return false;
    if (filterAssigneeId && t.assigneeId !== filterAssigneeId) return false;
    if (filterPriority && t.priority !== filterPriority) return false;
    if (filterStatus && t.status !== filterStatus) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      if (!t.title.toLowerCase().includes(q) && 
          !(t.description && t.description.toLowerCase().includes(q)) &&
          !(t.project && t.project.name.toLowerCase().includes(q)) &&
          !(t.assignee && t.assignee.name.toLowerCase().includes(q))) {
        return false;
      }
    }
    return true;
  });

  // Unique assignees from all tasks for filter dropdown
  const allAssignees = [];
  const assigneeIds = new Set();
  tasks.forEach(t => {
    if (t.assignee && !assigneeIds.has(t.assignee.id)) {
      assigneeIds.add(t.assignee.id);
      allAssignees.push(t.assignee);
    }
  });

  // Overview Counts
  const overview = { 'To Do': 0, 'In Progress': 0, 'In Review': 0, 'Done': 0 };
  filteredTasks.forEach(t => {
    const status = t.status === 'Completed' ? 'Done' : t.status;
    if (overview[status] !== undefined) overview[status]++;
  });
  const totalOverview = overview['To Do'] + overview['In Progress'] + overview['In Review'] + overview['Done'];

  // Upcoming Deadlines
  const upcomingDeadlines = tasks
    .filter(t => t.dueDate && new Date(t.dueDate) >= new Date() && t.status !== 'Done' && t.status !== 'Completed')
    .sort((a,b) => new Date(a.dueDate) - new Date(b.dueDate))
    .slice(0, 5);

  // My Tasks
  const myTasks = tasks.filter(t => {
    if (activeMyTasksTab === 'Assigned to Me') return t.assigneeId === currentUser?.id;
    if (activeMyTasksTab === 'Created by Me') return t.creatorId === currentUser?.id;
    return false;
  }).sort((a, b) => {
    // Sort unresolved first, then by date
    const aDone = a.status === 'Done' || a.status === 'Completed';
    const bDone = b.status === 'Done' || b.status === 'Completed';
    if (aDone && !bDone) return 1;
    if (!aDone && bDone) return -1;
    return new Date(b.createdAt) - new Date(a.createdAt);
  });

  // Form Handlers
  const handleAdd = async (e) => {
    e.preventDefault();
    setModalError(null);
    setIsSubmitting(true);
    
    try {
      let successCount = 0;
      let failedRows = [];
      
      await Promise.all(newTasks.map(async (task, index) => {
        if (!task.title.trim()) return;
        try {
          await apiClient('/tasks', {
            body: {
              projectId: selectedProjectId,
              title: task.title,
              description: task.description,
              status: task.status,
              priority: task.priority,
              assigneeId: task.assigneeId || null,
              startDate: task.startDate ? new Date(task.startDate).toISOString() : null,
              dueDate: task.dueDate ? new Date(task.dueDate).toISOString() : null
            }
          });
          successCount++;
        } catch (err) {
          failedRows.push(`Row ${index + 1}: ${err.message}`);
        }
      }));
      
      if (failedRows.length > 0) {
        setModalError(`Created ${successCount} tasks. Failed: ${failedRows.join(' | ')}`);
        if (successCount > 0) fetchData();
      } else {
        setNewTasks([{ ...defaultTask }]);
        setSelectedProjectId('');
        setShowModal(false);
        fetchData();
      }
    } catch (err) {
      setModalError(err.message || 'Failed to create tasks');
    } finally {
      setIsSubmitting(false);
    }
  };

  const updateNewTask = (index, field, value) => {
    const updated = [...newTasks];
    updated[index][field] = value;
    setNewTasks(updated);
  };
  
  const addRow = () => {
    const defaultVals = newTasks[0] || defaultTask;
    setNewTasks([...newTasks, { 
      ...defaultTask,
      priority: defaultVals.priority,
      startDate: defaultVals.startDate,
      dueDate: defaultVals.dueDate,
      assigneeId: defaultVals.assigneeId
    }]);
  };
  const removeRow = (index) => setNewTasks(newTasks.filter((_, i) => i !== index));

  const handleEdit = async (e) => {
    e.preventDefault();
    setModalError(null);
    setIsSubmitting(true);

    try {
      await apiClient(`/tasks/${editingTask.id}`, {
        method: 'PATCH',
        body: {
          title: editingTask.title,
          description: editingTask.description,
          status: editingTask.status,
          priority: editingTask.priority,
          assigneeId: editingTask.assigneeId || null,
          startDate: editingTask.startDate ? new Date(editingTask.startDate).toISOString() : null,
          dueDate: editingTask.dueDate ? new Date(editingTask.dueDate).toISOString() : null
        }
      });
      
      setShowEditModal(false);
      setEditingTask(null);
      fetchData();
    } catch (err) {
      setModalError(err.message || 'Failed to update task');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this task?')) return;
    try {
      await apiClient(`/tasks/${id}`, { method: 'DELETE' });
      fetchData();
    } catch (err) {
      alert(err.message || 'Failed to delete task');
    }
  };

  const handleStatusChange = async (id, newStatus, currentRole, assigneeId) => {
    const isDone = newStatus === 'Done' || newStatus === 'Completed';
    const isReopen = newStatus === 'To Do' || newStatus === 'In Progress';
    
    // RBAC validation logic mirroring backend requirements
    if (isDone) {
      if (currentRole !== 'Admin' && currentRole !== 'Owner' && currentUser?.id !== assigneeId) {
        alert("Only Admins, Owners, or the assigned user can mark this task as complete.");
        return;
      }
    } else if (isReopen) {
      if (currentRole !== 'Admin' && currentRole !== 'Owner') {
        alert("Only Admins or Owners can reopen a completed task.");
        return;
      }
    } else {
      if (currentRole !== 'Admin' && currentRole !== 'Owner' && currentRole !== 'Editor') {
        alert("You don't have permission to edit this task.");
        return;
      }
    }

    try {
      await apiClient(`/tasks/${id}`, {
        method: 'PATCH',
        body: { status: newStatus }
      });
      fetchData();
    } catch (err) {
      alert(err.message || 'Failed to update task');
    }
  };

  const getTaskRole = (projectId) => {
    const project = projects.find(p => p.id === projectId);
    if (!project || !currentUser) return 'Viewer';
    if (project.owner?.id === currentUser.id) return 'Admin';
    if (project.members && project.members.length > 0) return project.members[0].role;
    return 'Viewer';
  };

  const openEditModal = (task) => {
    setEditingTask({
      ...task,
      assigneeId: task.assignee?.id || '',
      startDate: task.startDate ? task.startDate.split('T')[0] : '',
      dueDate: task.dueDate ? task.dueDate.split('T')[0] : ''
    });
    setShowEditModal(true);
  };

  // UI Helpers — color functions imported from utils/colors.js
  const getStatusColor = getStatusDotColor;

  // Rendering Components
  const renderTaskCard = (task) => {
    const role = getTaskRole(task.projectId);
    const isDone = task.status === 'Done' || task.status === 'Completed';
    const isAssignee = currentUser && task.assigneeId === currentUser.id;
    const canMarkDone = role === 'Admin' || role === 'Owner' || isAssignee;
    const canReopen = role === 'Admin' || role === 'Owner';
    const canEdit = role === 'Admin' || role === 'Owner' || role === 'Editor';

    return (
      <div key={task.id} onClick={() => canEdit ? openEditModal(task) : null} className={`bg-[#161d2f] border border-[#1f2a44] hover:border-[#2d3a5a] rounded-xl p-4 transition cursor-pointer group flex flex-col gap-3 shadow-sm ${isDone ? 'opacity-60 grayscale-[30%]' : ''}`}>
        <div className="flex items-start justify-between gap-3">
           <h4 className={`text-sm font-bold truncate ${isDone ? 'text-slate-400 line-through' : 'text-white'}`}>{task.title}</h4>
           <div className="flex items-center gap-2 shrink-0">
             {/* Quick Complete */}
             {!isDone && canMarkDone && (
               <button onClick={(e) => { e.stopPropagation(); handleStatusChange(task.id, 'Done', role, task.assigneeId); }} className="w-5 h-5 rounded border border-slate-500 hover:border-emerald-400 hover:bg-emerald-400/10 flex items-center justify-center transition" title="Mark Complete">
                 <i className="fa-solid fa-check text-[10px] text-transparent hover:text-emerald-400 transition"></i>
               </button>
             )}
             {isDone && canReopen && (
               <button onClick={(e) => { e.stopPropagation(); handleStatusChange(task.id, 'To Do', role, task.assigneeId); }} className="w-5 h-5 rounded border border-slate-500 hover:border-amber-400 hover:bg-amber-400/10 flex items-center justify-center transition" title="Reopen Task">
                 <i className="fa-solid fa-rotate-left text-[10px] text-slate-400 hover:text-amber-400 transition"></i>
               </button>
             )}
             {isDone && !canReopen && (
               <div className="w-5 h-5 rounded bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
                 <i className="fa-solid fa-check text-[10px]"></i>
               </div>
             )}
           </div>
        </div>

        <div className="flex flex-wrap gap-2 text-[10px] font-bold">
          {task.project && (
            <span className="bg-[#0f1422] border border-[#1f2a44] text-slate-300 px-2 py-1 rounded truncate max-w-[150px]">
              {task.project.name}
            </span>
          )}
        </div>

        <div className="flex items-center justify-between mt-1">
           <div className="flex items-center gap-3">
             {task.dueDate && (
               <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-400">
                 <i className="fa-regular fa-calendar"></i>
                 {new Date(task.dueDate).toLocaleDateString(undefined, { day: 'numeric', month: 'short'})}
               </div>
             )}
             <div className="flex items-center gap-1.5">
               <span className={`w-1.5 h-1.5 rounded-full ${getPriorityColor(task.priority).split(' ')[0].replace('text-', 'bg-')}`}></span>
               <span className={`text-[10px] font-bold ${getPriorityColor(task.priority).split(' ')[0]}`}>{task.priority}</span>
             </div>
           </div>
           
           <div className="flex items-center gap-1 text-[10px] text-slate-400">
              {task.assignee && (
                 <div className="w-6 h-6 rounded-full bg-[#0f1422] border border-[#1f2a44] flex items-center justify-center overflow-hidden" title={task.assignee.name}>
                   {task.assignee.avatarUrl ? (
                     <img src={task.assignee.avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
                   ) : (
                     <i className="fa-solid fa-user text-[10px]"></i>
                   )}
                 </div>
              )}
           </div>
        </div>
      </div>
    );
  };

  const renderKanban = () => {
    const columns = ['To Do', 'In Progress', 'In Review', 'Done'];
    return (
      <div className="flex gap-6 overflow-x-auto hide-scrollbar pb-4 min-h-[400px]">
        {columns.map(col => {
          const colTasks = filteredTasks.filter(t => (col === 'Done' ? (t.status === 'Done' || t.status === 'Completed') : t.status === col));
          return (
            <div key={col} className="flex flex-col min-w-[280px] w-[280px] shrink-0">
               <div className="flex items-center justify-between mb-4 px-1">
                 <div className="flex items-center gap-2">
                   <div className={`w-2.5 h-2.5 rounded-full ${getStatusColor(col)} shadow-sm`}></div>
                   <h3 className="text-sm font-bold text-white">{col}</h3>
                   <span className="text-[10px] font-bold text-slate-400 bg-[#161d2f] border border-[#1f2a44] px-2 py-0.5 rounded-full">{colTasks.length}</span>
                 </div>
                 <button onClick={() => setShowModal(true)} className="w-6 h-6 rounded-md hover:bg-[#161d2f] flex items-center justify-center text-slate-400 hover:text-white transition"><i className="fa-solid fa-plus text-xs"></i></button>
               </div>
               
               <div className="flex flex-col gap-3">
                 {colTasks.map(t => renderTaskCard(t))}
                 {colTasks.length === 0 && (
                    <div className="border border-dashed border-[#1f2a44] rounded-xl h-24 flex items-center justify-center text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                      Empty
                    </div>
                 )}
               </div>
            </div>
          )
        })}
      </div>
    );
  };

  const renderList = () => {
    return (
      <div className="bg-[#0f1422] border border-[#192238] rounded-2xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead className="bg-[#161d2f]/50 border-b border-[#192238] text-[10px] font-bold text-slate-400 uppercase tracking-wider">
              <tr>
                <th className="px-6 py-4">Task</th>
                <th className="px-6 py-4">Project</th>
                <th className="px-6 py-4">Assignee</th>
                <th className="px-6 py-4">Due Date</th>
                <th className="px-6 py-4">Priority</th>
                <th className="px-6 py-4">Status</th>
                <th className="px-6 py-4 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1f2a44]">
              {filteredTasks.length === 0 && (
                <tr><td colSpan="7" className="text-center py-12 text-slate-400">No tasks found.</td></tr>
              )}
              {filteredTasks.map(t => {
                const isDone = t.status === 'Done' || t.status === 'Completed';
                const role = getTaskRole(t.projectId);
                const canEdit = role === 'Admin' || role === 'Owner' || role === 'Editor';
                const canDelete = role === 'Admin' || role === 'Owner';
                return (
                  <tr key={t.id} className={`bg-[#0f1422] hover:bg-[#161d2f] transition ${isDone ? 'opacity-60' : ''}`}>
                    <td className="px-6 py-3">
                      <div className={`font-bold ${isDone ? 'text-slate-400 line-through' : 'text-white'}`}>{t.title}</div>
                    </td>
                    <td className="px-6 py-3 text-xs text-slate-300">
                      {t.project ? t.project.name : '-'}
                    </td>
                    <td className="px-6 py-3">
                       <div className="flex items-center gap-2 text-xs text-slate-300">
                         {t.assignee ? (
                           <>
                             <div className="w-5 h-5 rounded-full bg-[#1a2333] flex items-center justify-center overflow-hidden">
                               {t.assignee.avatarUrl ? <img src={t.assignee.avatarUrl} alt="" className="w-full h-full object-cover"/> : <i className="fa-solid fa-user text-[8px] text-slate-400"></i>}
                             </div>
                             {t.assignee.name}
                           </>
                         ) : '-'}
                       </div>
                    </td>
                    <td className="px-6 py-3 text-xs font-bold text-slate-400">
                      {t.dueDate ? new Date(t.dueDate).toLocaleDateString() : '-'}
                    </td>
                    <td className="px-6 py-3">
                      <span className={`px-2 py-1 rounded border text-[10px] font-bold ${getPriorityColor(t.priority)}`}>
                        {t.priority}
                      </span>
                    </td>
                    <td className="px-6 py-3">
                      <span className={`px-2 py-1 rounded bg-[#0f1422] border border-[#1f2a44] text-[10px] font-bold text-slate-300 flex items-center gap-1.5 w-fit`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${getStatusColor(t.status)}`}></span>
                        {t.status}
                      </span>
                    </td>
                    <td className="px-6 py-3 text-center">
                      <div className="flex items-center justify-center gap-3">
                        {canEdit && (
                          <button onClick={() => openEditModal(t)} className="text-slate-500 hover:text-purple-400 transition" title="Edit">
                            <i className="fa-solid fa-pen text-xs"></i>
                          </button>
                        )}
                        {canDelete && (
                          <button onClick={() => handleDelete(t.id)} className="text-slate-500 hover:text-red-400 transition" title="Delete">
                            <i className="fa-solid fa-trash text-xs"></i>
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  const renderCalendar = () => {
    // Basic Task Calendar
    const year = calendarDate.getFullYear();
    const month = calendarDate.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const firstDay = new Date(year, month, 1).getDay();
    const days = Array(firstDay).fill(null).concat(Array.from({length: daysInMonth}, (_, i) => new Date(year, month, i + 1)));
    while(days.length % 7 !== 0) days.push(null);

    return (
      <div className="bg-[#0f1422] border border-[#192238] rounded-2xl overflow-hidden shadow-sm flex flex-col h-[500px]">
         <div className="p-4 flex items-center justify-between border-b border-[#192238]">
            <h3 className="text-sm font-bold text-white">{calendarDate.toLocaleString('default', { month: 'long' })} {year}</h3>
            <div className="flex bg-[#161d2f] rounded-lg p-1 border border-[#1f2a44]">
              <button onClick={() => setCalendarDate(new Date(year, month - 1, 1))} className="px-2 py-1 hover:bg-[#1a2333] rounded text-slate-400"><i className="fa-solid fa-chevron-left text-[10px]"></i></button>
              <button onClick={() => setCalendarDate(new Date(year, month + 1, 1))} className="px-2 py-1 hover:bg-[#1a2333] rounded text-slate-400"><i className="fa-solid fa-chevron-right text-[10px]"></i></button>
            </div>
         </div>
         <div className="grid grid-cols-7 bg-[#161d2f]/50 border-b border-[#192238] text-center text-[10px] font-bold text-slate-400 uppercase py-2">
            <div>Sun</div><div>Mon</div><div>Tue</div><div>Wed</div><div>Thu</div><div>Fri</div><div>Sat</div>
         </div>
         <div className="grid grid-cols-7 divide-x divide-y divide-[#1f2a44] flex-1 overflow-y-auto">
            {days.map((d, i) => {
              if (!d) return <div key={i} className="bg-[#0a0d16] p-1"></div>;
              const isToday = d.toDateString() === new Date().toDateString();
              const dayTasks = filteredTasks.filter(t => (t.dueDate && new Date(t.dueDate).toDateString() === d.toDateString()) || (t.startDate && new Date(t.startDate).toDateString() === d.toDateString()));
              return (
                <div key={i} className={`p-1 flex flex-col gap-1 min-h-[80px] ${isToday ? 'bg-[#1a1c2e] ring-1 ring-inset ring-purple-600/30' : 'bg-[#0f1422]'}`}>
                  <span className={`text-[10px] font-bold px-1 ${isToday ? 'text-purple-400' : 'text-slate-400'}`}>{d.getDate()}</span>
                  <div className="flex flex-col gap-0.5 overflow-y-auto">
                    {dayTasks.map(t => (
                      <div key={t.id} onClick={() => openEditModal(t)} className="text-[9px] bg-[#161d2f] border border-[#1f2a44] text-slate-300 px-1 py-0.5 rounded truncate cursor-pointer hover:border-purple-500/50">
                        <span className={`w-1 h-1 inline-block rounded-full mr-1 ${getStatusColor(t.status)}`}></span>
                        {t.title}
                      </div>
                    ))}
                  </div>
                </div>
              )
            })}
         </div>
      </div>
    );
  };

  const renderTimeline = () => {
    // Simple timeline relative to next 30 days
    const today = new Date();
    today.setHours(0,0,0,0);
    const windowDays = 30;
    
    // Group tasks
    const tasksByProject = {};
    filteredTasks.forEach(t => {
      if (t.startDate && t.dueDate && t.status !== 'Done' && t.status !== 'Completed') {
         const pid = t.projectId || 'personal';
         if (!tasksByProject[pid]) tasksByProject[pid] = { project: t.project, tasks: [] };
         tasksByProject[pid].tasks.push(t);
      }
    });

    if (Object.keys(tasksByProject).length === 0) {
       return <div className="p-12 text-center text-slate-500 bg-[#0f1422] border border-[#192238] rounded-2xl border-dashed">No active tasks with both Start and Due dates found.</div>;
    }

    return (
      <div className="bg-[#0f1422] border border-[#192238] rounded-2xl overflow-hidden shadow-sm p-6 overflow-x-auto">
         <div className="min-w-[700px]">
           <div className="flex items-center justify-between mb-4 pb-2 border-b border-[#1f2a44]">
             <h3 className="text-sm font-bold text-white">30-Day Timeline</h3>
             <div className="flex items-center gap-1 w-[60%] border-l border-[#1f2a44] relative h-4">
                <span className="absolute -left-3 -top-5 text-[9px] font-bold text-slate-500">Today</span>
                <span className="absolute -right-3 -top-5 text-[9px] font-bold text-slate-500">+{windowDays} Days</span>
             </div>
           </div>
           
           <div className="flex flex-col gap-6">
             {Object.entries(tasksByProject).map(([pid, group]) => (
                <div key={pid} className="flex flex-col gap-2">
                   <h4 className="text-xs font-bold text-slate-400 mb-1">{group.project ? group.project.name : 'Personal'}</h4>
                   {group.tasks.map(t => {
                     const start = new Date(t.startDate);
                     const due = new Date(t.dueDate);
                     
                     // Calculate percentages relative to window
                     let diffStartDays = (start - today) / (1000*60*60*24);
                     let durationDays = (due - start) / (1000*60*60*24) || 1;
                     
                     // Constrain visually
                     if (diffStartDays < 0) {
                        durationDays += diffStartDays; 
                        diffStartDays = 0;
                     }
                     if (diffStartDays > windowDays) diffStartDays = windowDays;
                     if (diffStartDays + durationDays > windowDays) durationDays = windowDays - diffStartDays;
                     if (durationDays <= 0) durationDays = 0.5;

                     const left = (diffStartDays / windowDays) * 100;
                     const width = (durationDays / windowDays) * 100;

                     return (
                       <div key={t.id} className="flex items-center gap-4">
                          <div className="w-[35%] min-w-[200px] text-xs font-bold text-slate-300 truncate pr-4 text-right">{t.title}</div>
                          <div className="w-[65%] bg-[#161d2f] h-6 rounded-md relative overflow-hidden border border-[#1f2a44]">
                             {width > 0 && (
                               <div 
                                 className="absolute top-0 bottom-0 bg-gradient-to-r from-purple-600 to-indigo-500 rounded cursor-pointer hover:brightness-110 transition"
                                 style={{ left: `${left}%`, width: `${width}%` }}
                                 onClick={() => openEditModal(t)}
                                 title={`${t.title} (${start.toLocaleDateString()} - ${due.toLocaleDateString()})`}
                               ></div>
                             )}
                          </div>
                       </div>
                     )
                   })}
                </div>
             ))}
           </div>
         </div>
      </div>
    )
  };

  return (
    <div className="flex flex-col gap-5 max-w-[1920px] mx-auto pb-12 min-h-screen">
      
      {/* Top Header / Hero */}
      <div className="relative rounded-2xl py-5 px-6 md:px-7 bg-[#0f1422] border border-[#192238] overflow-hidden flex flex-col justify-center shadow-sm">
         <div className="absolute right-0 top-0 bottom-0 w-2/3 opacity-40 pointer-events-none bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxMDAlIiBoZWlnaHQ9IjEwMCUiPjxkZWZzPjxsaW5lYXJHcmFkaWVudCBpZD0iZyIgeDE9IjAlIiB5MT0iMTAwJSIgeDI9IjEwMCUiIHkyPSIwJSI+PHN0b3Agb2Zmc2V0PSIwJSIgc3RvcC1jb2xvcj0idHJhbnNwYXJlbnQiLz48c3RvcCBvZmZzZXQ9IjEwMCUiIHN0b3AtY29sb3I9IiM1OTIyY2YiIHN0b3Atb3BhY2l0eT0iMC4xNSIvPjwvbGluZWFyR3JhZGllbnQ+PC9kZWZzPjxyZWN0IHdpZHRoPSIxMDAlIiBoZWlnaHQ9IjEwMCUiIGZpbGw9InVybCgjZykiLz48L3N2Zz4=')] bg-cover"></div>
         <div className="z-10">
           <div className="flex items-center gap-2 text-[10px] font-bold tracking-wider text-slate-400 mb-2 uppercase">
             <span>Tasks</span>
             <span className="text-slate-600">›</span>
             <span className="text-purple-400">All Tasks</span>
           </div>
           <h1 className="text-2xl md:text-3xl font-extrabold text-white tracking-tight flex items-center gap-3">
             Tasks
           </h1>
           <p className="text-xs text-slate-400 mt-1 font-medium">Turn plans into progress.</p>
         </div>
      </div>

      <div className="flex flex-col xl:flex-row gap-6">
        
        {/* Main Left Area */}
        <div className="flex-1 min-w-0 flex flex-col gap-6">
           
           {/* View Tabs + Filters + Add */}
           <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
              
              <Tabs 
                tabs={[
                  { id: 'Kanban', label: 'Kanban', icon: 'fa-table-columns' },
                  { id: 'List', label: 'List', icon: 'fa-list' },
                  { id: 'Calendar', label: 'Calendar', icon: 'fa-calendar' },
                  { id: 'Timeline', label: 'Timeline', icon: 'fa-bars-staggered' }
                ]}
                activeTab={activeView}
                onChange={setActiveView}
              />

              <div className="flex flex-wrap items-center gap-2">
                 <div className="relative">
                   <i className="fa-solid fa-search absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-xs"></i>
                   <input type="text" placeholder="Search tasks..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="bg-[#0f1422] border border-[#192238] rounded-lg pl-8 pr-3 py-1.5 text-xs font-bold text-white focus:outline-none focus:border-purple-500 transition shadow-sm w-[160px]" />
                 </div>
                 <select value={filterProjectId} onChange={e => setFilterProjectId(e.target.value)} className="appearance-none bg-[#0f1422] border border-[#192238] rounded-lg px-3 py-1.5 text-xs font-bold text-slate-300 focus:outline-none focus:border-purple-500 transition shadow-sm cursor-pointer min-w-[120px]">
                   <option value="">All Projects</option>
                   {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                 </select>
                 <select value={filterAssigneeId} onChange={e => setFilterAssigneeId(e.target.value)} className="appearance-none bg-[#0f1422] border border-[#192238] rounded-lg px-3 py-1.5 text-xs font-bold text-slate-300 focus:outline-none focus:border-purple-500 transition shadow-sm cursor-pointer min-w-[120px]">
                   <option value="">All Assignees</option>
                   {allAssignees.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                 </select>
                 <select value={filterPriority} onChange={e => setFilterPriority(e.target.value)} className="appearance-none bg-[#0f1422] border border-[#192238] rounded-lg px-3 py-1.5 text-xs font-bold text-slate-300 focus:outline-none focus:border-purple-500 transition shadow-sm cursor-pointer w-[110px]">
                   <option value="">All Priority</option>
                   <option value="Low">Low</option>
                   <option value="Medium">Medium</option>
                   <option value="High">High</option>
                   <option value="Urgent">Urgent</option>
                 </select>
                 <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="appearance-none bg-[#0f1422] border border-[#192238] rounded-lg px-3 py-1.5 text-xs font-bold text-slate-300 focus:outline-none focus:border-purple-500 transition shadow-sm cursor-pointer w-[100px]">
                   <option value="">All Status</option>
                   <option value="To Do">To Do</option>
                   <option value="In Progress">In Progress</option>
                   <option value="In Review">In Review</option>
                   <option value="Done">Done</option>
                 </select>
                 <button onClick={() => setShowModal(true)} className="px-4 py-1.5 bg-[#5922cf] hover:bg-[#682ae6] text-white rounded-lg text-xs font-bold shadow-lg shadow-purple-900/30 transition flex items-center gap-1.5 ml-2">
                   <i className="fa-solid fa-plus"></i> New Task
                 </button>
              </div>
           </div>

           {/* Dynamic View Rendering */}
           {loading ? (
             <LoadingState message="Loading tasks..." minHeight="400px" />
           ) : error ? (
             <ErrorState error={error} onRetry={fetchData} message="Unable to load tasks" />
           ) : tasks.length === 0 ? (
             <EmptyState 
               icon="fa-list-check"
               title="No tasks yet"
               description="Create your first task to start organizing your work."
               actionText="New Task"
               onAction={() => setShowModal(true)}
             />
           ) : (
             <>
               {activeView === 'Kanban' && renderKanban()}
               {activeView === 'List' && renderList()}
               {activeView === 'Calendar' && renderCalendar()}
               {activeView === 'Timeline' && renderTimeline()}
             </>
           )}

           {/* My Tasks Panel */}
           {!loading && !error && (
             <div className="bg-[#0f1422] border border-[#192238] rounded-2xl overflow-hidden shadow-sm mt-4">
                <div className="px-6 py-4 border-b border-[#1f2a44] flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-[#121828]">
                  <div className="flex items-center gap-2">
                    <i className="fa-solid fa-clipboard-user text-purple-500"></i>
                    <h3 className="text-sm font-bold text-white">My Tasks</h3>
                  </div>
                  <Tabs 
                    tabs={[
                      { id: 'Assigned to Me', label: 'Assigned to Me' },
                      { id: 'Created by Me', label: 'Created by Me' }
                    ]}
                    activeTab={activeMyTasksTab}
                    onChange={setActiveMyTasksTab}
                  />
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs whitespace-nowrap">
                    <thead className="bg-[#0a0d16] border-b border-[#1f2a44] font-bold text-slate-500 uppercase tracking-wider">
                      <tr>
                        <th className="px-6 py-3">Task</th>
                        <th className="px-6 py-3">Project</th>
                        <th className="px-6 py-3">Due Date</th>
                        <th className="px-6 py-3">Priority</th>
                        <th className="px-6 py-3">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#1f2a44] bg-[#0f1422]">
                      {myTasks.length === 0 ? (
                        <tr><td colSpan="5" className="text-center py-8 text-slate-500 border-dashed">No tasks found.</td></tr>
                      ) : myTasks.slice(0, 8).map(t => {
                        const isDone = t.status === 'Done' || t.status === 'Completed';
                        return (
                          <tr key={t.id} onClick={() => openEditModal(t)} className={`hover:bg-[#161d2f] cursor-pointer transition ${isDone ? 'opacity-60' : ''}`}>
                            <td className={`px-6 py-3 font-bold ${isDone ? 'text-slate-500 line-through' : 'text-slate-200'}`}>{t.title}</td>
                            <td className="px-6 py-3 text-slate-400">{t.project?.name || '-'}</td>
                            <td className="px-6 py-3 text-slate-400">{t.dueDate ? new Date(t.dueDate).toLocaleDateString() : '-'}</td>
                            <td className="px-6 py-3">
                              <span className={`flex items-center gap-1.5 font-bold ${getPriorityColor(t.priority).split(' ')[0]}`}>
                                <span className={`w-1.5 h-1.5 rounded-full ${getPriorityColor(t.priority).split(' ')[0].replace('text-', 'bg-')}`}></span>
                                {t.priority}
                              </span>
                            </td>
                            <td className="px-6 py-3">
                              <span className={`px-2 py-1 rounded bg-[#0a0d16] border border-[#1f2a44] text-[10px] font-bold text-slate-300 flex items-center gap-1.5 w-fit`}>
                                <span className={`w-1.5 h-1.5 rounded-full ${getStatusColor(t.status)}`}></span>
                                {t.status}
                              </span>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
             </div>
           )}

        </div>

        {/* Right Sidebar */}
        <div className="w-full xl:w-[320px] shrink-0 flex flex-col gap-6">
           
           {/* Task Overview */}
           <div className="bg-[#0f1422] border border-[#192238] rounded-2xl p-5 shadow-sm">
             <div className="flex items-center justify-between mb-6">
                <h2 className="text-sm font-bold text-white flex items-center gap-2"><i className="fa-solid fa-chart-pie text-purple-400"></i> Task Overview</h2>
             </div>
             {tasks.length === 0 ? (
               <div className="text-center py-6 text-xs font-bold text-slate-500 bg-[#161d2f] rounded-xl border border-[#1f2a44] border-dashed">0 Tasks</div>
             ) : (
               <div className="flex items-center justify-between gap-4">
                 <div className="relative w-28 h-28 shrink-0 flex items-center justify-center">
                    <svg viewBox="0 0 36 36" className="w-full h-full transform -rotate-90">
                      {/* We'll calculate simple stroke dasharrays based on percentages */}
                      {(() => {
                         let offset = 0;
                         return ['To Do', 'In Progress', 'In Review', 'Done'].map(s => {
                           const count = overview[s] || 0;
                           if (count === 0) return null;
                           const percent = (count / totalOverview) * 100;
                           const dasharray = `${percent} 100`;
                           const dashoffset = -offset;
                           offset += percent;
                           const color = s === 'To Do' ? '#94a3b8' : s === 'In Progress' ? '#3b82f6' : s === 'In Review' ? '#a855f7' : '#10b981';
                           return (
                             <circle key={s} cx="18" cy="18" r="15.915" fill="transparent" stroke={color} strokeWidth="4" strokeDasharray={dasharray} strokeDashoffset={dashoffset} className="transition-all duration-1000" />
                           );
                         });
                      })()}
                    </svg>
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                       <span className="text-xl font-extrabold text-white">{totalOverview}</span>
                       <span className="text-[9px] font-bold text-slate-400 uppercase">Tasks</span>
                    </div>
                 </div>
                 
                 <div className="flex flex-col gap-3 flex-1">
                   {['To Do', 'In Progress', 'In Review', 'Done'].map(s => (
                     <div key={s} className="flex items-center justify-between text-xs font-bold">
                       <div className="flex items-center gap-2 text-slate-300">
                         <span className={`w-2 h-2 rounded-full ${getStatusColor(s)}`}></span>
                         {s}
                       </div>
                       <span className="text-white">{overview[s] || 0}</span>
                     </div>
                   ))}
                 </div>
               </div>
             )}
           </div>

           {/* Upcoming Deadlines */}
           <div className="bg-[#0f1422] border border-[#192238] rounded-2xl p-5 shadow-sm">
             <div className="flex items-center justify-between mb-5">
                <h2 className="text-sm font-bold text-white flex items-center gap-2"><i className="fa-solid fa-clock-rotate-left text-rose-400"></i> Upcoming Deadlines</h2>
             </div>
             {upcomingDeadlines.length === 0 ? (
               <div className="text-center py-6 text-xs font-bold text-slate-500 bg-[#161d2f] rounded-xl border border-[#1f2a44] border-dashed">No upcoming deadlines</div>
             ) : (
               <div className="flex flex-col gap-3">
                 {upcomingDeadlines.map(t => (
                   <div key={t.id} onClick={() => openEditModal(t)} className="bg-[#161d2f] border border-[#1f2a44] hover:border-[#2d3a5a] rounded-xl p-3 cursor-pointer transition">
                     <div className="flex justify-between items-start mb-1">
                       <h4 className="text-xs font-bold text-white truncate max-w-[180px]">{t.title}</h4>
                       <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${getPriorityColor(t.priority)}`}>{t.priority}</span>
                     </div>
                     <div className="flex justify-between items-center text-[10px] text-slate-400 font-bold">
                       <span className="truncate max-w-[120px]">{t.project?.name || 'Personal'}</span>
                       <span className="text-rose-400">{new Date(t.dueDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>
                     </div>
                   </div>
                 ))}
               </div>
             )}
           </div>

           {/* Activity Feed */}
           <div className="bg-[#0f1422] border border-[#192238] rounded-2xl p-5 shadow-sm flex flex-col flex-1 min-h-[300px] max-h-[500px]">
             <div className="flex items-center justify-between mb-5">
                <h2 className="text-sm font-bold text-white flex items-center gap-2"><i className="fa-solid fa-bolt text-amber-400"></i> Activity Feed</h2>
             </div>
             <div className="flex-1 overflow-y-auto hide-scrollbar">
                <ActivityFeed activities={activity} variant="timeline" emptyMessage="No task activity" />
             </div>
           </div>

        </div>
      </div>

      {/* Bulk Add Tasks Modal (Unchanged logic, restyled) */}
      {showModal && (
        <Modal open={showModal} onClose={() => setShowModal(false)} className="max-w-5xl max-h-[90vh] flex flex-col">
          <div className="p-6">
            <h2 className="text-lg text-white font-bold mb-4 flex items-center gap-2">
              <i className="fa-solid fa-list-check text-purple-500"></i> Bulk Add Tasks
            </h2>
            {modalError && (
              <div className="bg-red-500/10 border border-red-500/50 text-red-400 px-4 py-3 rounded-xl mb-4 text-xs font-bold">
                {modalError}
              </div>
            )}
            
            <form onSubmit={handleAdd} className="flex flex-col gap-4 flex-1 overflow-hidden">
              <div className="w-72 shrink-0">
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Project <span className="text-red-500">*</span></label>
                <select required value={selectedProjectId} onChange={e => setSelectedProjectId(e.target.value)} className="w-full bg-[#161d2f] border border-[#1f2a44] rounded-xl px-4 py-2 text-sm font-bold text-white focus:outline-none focus:border-purple-500 transition shadow-inner">
                  <option value="" disabled>Select a project</option>
                  {projects.map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>

              <div className="overflow-x-auto border border-[#1f2a44] rounded-xl flex-1 bg-[#0f1422]">
                <table className="w-full text-left text-xs whitespace-nowrap">
                  <thead className="bg-[#161d2f] border-b border-[#1f2a44] text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                    <tr>
                      <th className="px-4 py-3">#</th>
                      <th className="px-4 py-3 min-w-[200px]">Task Title *</th>
                      <th className="px-4 py-3">Priority</th>
                      <th className="px-4 py-3">Start Date</th>
                      <th className="px-4 py-3">Due Date</th>
                      <th className="px-4 py-3">Assignee</th>
                      <th className="px-4 py-3 text-center">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#1f2a44]">
                    {newTasks.map((task, index) => (
                      <tr key={index} className="bg-[#0f1422] hover:bg-[#161d2f] transition group">
                        <td className="px-4 py-2 text-center font-bold text-slate-500">{index + 1}</td>
                        <td className="px-4 py-2">
                          <input required value={task.title} onChange={e => updateNewTask(index, 'title', e.target.value)} placeholder="Enter task name..." className="w-full bg-[#161d2f] border border-[#1f2a44] group-hover:border-[#2d3a5a] rounded-lg px-3 py-1.5 text-xs font-bold text-white focus:outline-none focus:border-purple-500 transition" />
                        </td>
                        <td className="px-4 py-2">
                          <select value={task.priority} onChange={e => updateNewTask(index, 'priority', e.target.value)} className="w-full bg-[#161d2f] border border-[#1f2a44] rounded-lg px-3 py-1.5 text-xs font-bold text-white focus:outline-none focus:border-purple-500 transition">
                            <option value="Low">Low</option>
                            <option value="Medium">Medium</option>
                            <option value="High">High</option>
                            <option value="Urgent">Urgent</option>
                          </select>
                        </td>
                        <td className="px-4 py-2">
                          <input type="date" value={task.startDate} onChange={e => updateNewTask(index, 'startDate', e.target.value)} className="w-full bg-[#161d2f] border border-[#1f2a44] rounded-lg px-3 py-1.5 text-xs font-bold text-white focus:outline-none focus:border-purple-500 transition" />
                        </td>
                        <td className="px-4 py-2">
                          <input type="date" value={task.dueDate} onChange={e => updateNewTask(index, 'dueDate', e.target.value)} className="w-full bg-[#161d2f] border border-[#1f2a44] rounded-lg px-3 py-1.5 text-xs font-bold text-white focus:outline-none focus:border-purple-500 transition" />
                        </td>
                        <td className="px-4 py-2">
                          <select value={task.assigneeId} onChange={e => updateNewTask(index, 'assigneeId', e.target.value)} disabled={!selectedProjectId} className="w-full bg-[#161d2f] border border-[#1f2a44] rounded-lg px-3 py-1.5 text-xs font-bold text-white focus:outline-none focus:border-purple-500 transition disabled:opacity-50">
                            <option value="">Unassigned</option>
                            {projectMembers.map(m => (
                              <option key={m.user.id} value={m.user.id}>{m.user.name}</option>
                            ))}
                          </select>
                        </td>
                        <td className="px-4 py-2 text-center">
                          {newTasks.length > 1 ? (
                            <button type="button" onClick={() => removeRow(index)} className="text-slate-500 hover:text-red-400 transition bg-[#161d2f] w-7 h-7 rounded-lg border border-[#1f2a44] flex items-center justify-center mx-auto" title="Remove row">
                              <i className="fa-solid fa-xmark"></i>
                            </button>
                          ) : (
                             <div className="w-7 h-7 mx-auto"></div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              
              <div className="flex justify-start shrink-0">
                <button type="button" onClick={addRow} className="px-4 py-2 bg-[#161d2f] hover:bg-[#1a2333] border border-[#1f2a44] rounded-lg text-xs font-bold text-slate-300 transition flex items-center gap-2">
                  <i className="fa-solid fa-plus text-purple-400"></i> Add Another Row
                </button>
              </div>

              <div className="flex justify-end gap-3 mt-2 shrink-0 border-t border-[#1f2a44] pt-4">
                <button type="button" disabled={isSubmitting} onClick={() => setShowModal(false)} className="px-5 py-2 text-slate-400 text-xs font-bold hover:text-white transition disabled:opacity-50">Cancel</button>
                <button type="submit" disabled={isSubmitting} className="px-6 py-2 bg-[#5922cf] hover:bg-[#682ae6] text-white rounded-xl text-xs font-bold shadow-lg shadow-purple-900/30 transition disabled:opacity-50 flex items-center gap-2">
                  {isSubmitting && <i className="fa-solid fa-spinner fa-spin"></i>}
                  {isSubmitting ? 'Creating...' : `Create ${newTasks.length} Task${newTasks.length !== 1 ? 's' : ''}`}
                </button>
              </div>
            </form>
          </div>
        </Modal>
      )}

      {/* Edit Task Modal */}
      {showEditModal && editingTask && (
        <Modal open={showEditModal} onClose={() => setShowEditModal(false)} className="max-w-md max-h-[90vh] overflow-y-auto">
          <div className="p-6">
            <h2 className="text-lg text-white font-bold mb-5 flex items-center gap-2">
               <i className="fa-solid fa-pen text-purple-500"></i> Edit Task
            </h2>
            {modalError && (
              <div className="bg-red-500/10 border border-red-500/50 text-red-400 px-3 py-2 rounded-lg mb-4 text-xs font-bold">
                {modalError}
              </div>
            )}
            <form onSubmit={handleEdit} className="flex flex-col gap-4">
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Task Title <span className="text-red-500">*</span></label>
                <input required value={editingTask.title} onChange={e => setEditingTask({...editingTask, title: e.target.value})} className="w-full bg-[#161d2f] border border-[#1f2a44] rounded-xl px-4 py-2.5 text-sm font-bold text-white focus:outline-none focus:border-purple-500 transition shadow-inner" />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Description</label>
                <textarea rows="3" value={editingTask.description || ''} onChange={e => setEditingTask({...editingTask, description: e.target.value})} placeholder="Add details..." className="w-full bg-[#161d2f] border border-[#1f2a44] rounded-xl px-4 py-2.5 text-sm font-bold text-white focus:outline-none focus:border-purple-500 transition shadow-inner" />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Status</label>
                  <select value={editingTask.status} onChange={e => setEditingTask({...editingTask, status: e.target.value})} className="w-full bg-[#161d2f] border border-[#1f2a44] rounded-xl px-4 py-2.5 text-sm font-bold text-white focus:outline-none focus:border-purple-500 transition shadow-inner">
                    <option value="To Do">To Do</option>
                    <option value="In Progress">In Progress</option>
                    <option value="In Review">In Review</option>
                    <option value="Done">Done</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Priority</label>
                  <select value={editingTask.priority} onChange={e => setEditingTask({...editingTask, priority: e.target.value})} className="w-full bg-[#161d2f] border border-[#1f2a44] rounded-xl px-4 py-2.5 text-sm font-bold text-white focus:outline-none focus:border-purple-500 transition shadow-inner">
                    <option value="Low">Low</option>
                    <option value="Medium">Medium</option>
                    <option value="High">High</option>
                    <option value="Urgent">Urgent</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Assignee</label>
                <select value={editingTask.assigneeId || ''} onChange={e => setEditingTask({...editingTask, assigneeId: e.target.value})} className="w-full bg-[#161d2f] border border-[#1f2a44] rounded-xl px-4 py-2.5 text-sm font-bold text-white focus:outline-none focus:border-purple-500 transition shadow-inner">
                  <option value="">Unassigned</option>
                  {projectMembers.map(m => (
                    <option key={m.user.id} value={m.user.id}>{m.user.name}</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4 p-4 bg-[#161d2f] border border-[#1f2a44] rounded-xl relative">
                <div className="absolute -top-2 left-4 px-1 bg-[#101524] text-[9px] font-bold text-slate-400 uppercase tracking-wider">Date Window</div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Start Date</label>
                  <input type="date" value={editingTask.startDate} onChange={e => setEditingTask({...editingTask, startDate: e.target.value})} className="w-full bg-[#0f1422] border border-[#1f2a44] rounded-lg px-3 py-2 text-sm font-bold text-white focus:outline-none focus:border-purple-500 transition shadow-inner" />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Due Date</label>
                  <input type="date" value={editingTask.dueDate} onChange={e => setEditingTask({...editingTask, dueDate: e.target.value})} className="w-full bg-[#0f1422] border border-[#1f2a44] rounded-lg px-3 py-2 text-sm font-bold text-white focus:outline-none focus:border-purple-500 transition shadow-inner" />
                </div>
              </div>

              <div className="flex justify-end gap-3 mt-4 pt-4 border-t border-[#1f2a44]">
                <button type="button" disabled={isSubmitting} onClick={() => setShowEditModal(false)} className="px-5 py-2 text-slate-400 text-xs font-bold hover:text-white transition disabled:opacity-50">Cancel</button>
                <button type="submit" disabled={isSubmitting} className="px-6 py-2 bg-[#5922cf] hover:bg-[#682ae6] text-white rounded-xl text-xs font-bold shadow-lg shadow-purple-900/30 transition disabled:opacity-50 flex items-center gap-2">
                  {isSubmitting && <i className="fa-solid fa-spinner fa-spin"></i>}
                  {isSubmitting ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </Modal>
      )}
    </div>
  );
}