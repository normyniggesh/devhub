import { useState, useEffect } from 'react';
import { apiClient } from '../api/client';
import { useStore } from '../store';

export default function Tasks() {
  const { currentUser } = useStore();
  const [tasks, setTasks] = useState([]);
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  const [showModal, setShowModal] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [modalError, setModalError] = useState(null);
  const [selectedProjectId, setSelectedProjectId] = useState('');
  const [projectMembers, setProjectMembers] = useState([]);
  
  const [filterProjectId, setFilterProjectId] = useState('');

  const [newTask, setNewTask] = useState({ 
    title: '', 
    description: '',
    status: 'To Do', 
    priority: 'Medium',
    assigneeId: '',
    startDate: '',
    dueDate: ''
  });

  const [editingTask, setEditingTask] = useState(null);
  const [showEditModal, setShowEditModal] = useState(false);

  const fetchTasks = async () => {
    try {
      setLoading(true);
      const endpoint = filterProjectId ? `/tasks?projectId=${filterProjectId}` : '/tasks';
      const data = await apiClient(endpoint);
      setTasks(data.tasks || []);
      setError(null);
    } catch (err) {
      setError(err.message || 'Failed to fetch tasks');
    } finally {
      setLoading(false);
    }
  };

  const fetchProjects = async () => {
    try {
      const data = await apiClient('/projects');
      setProjects(data.projects || []);
    } catch (err) {
      console.error('Failed to fetch projects', err);
    }
  };

  useEffect(() => {
    fetchTasks();
  }, [filterProjectId]);

  useEffect(() => {
    fetchProjects();
  }, []);

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

  const handleAdd = async (e) => {
    e.preventDefault();
    setModalError(null);
    setIsSubmitting(true);
    
    try {
      await apiClient('/tasks', {
        body: {
          projectId: selectedProjectId,
          title: newTask.title,
          description: newTask.description,
          status: newTask.status,
          priority: newTask.priority,
          assigneeId: newTask.assigneeId || null,
          startDate: newTask.startDate ? new Date(newTask.startDate).toISOString() : null,
          dueDate: newTask.dueDate ? new Date(newTask.dueDate).toISOString() : null
        }
      });
      
      setNewTask({ title: '', description: '', status: 'To Do', priority: 'Medium', assigneeId: '', startDate: '', dueDate: '' });
      setSelectedProjectId('');
      setShowModal(false);
      fetchTasks();
    } catch (err) {
      setModalError(err.message || 'Failed to create task');
    } finally {
      setIsSubmitting(false);
    }
  };

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
      fetchTasks();
    } catch (err) {
      setModalError(err.message || 'Failed to update task');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('Are you sure you want to delete this task?')) return;
    try {
      await apiClient(`/tasks/${id}`, { method: 'DELETE' });
      fetchTasks();
    } catch (err) {
      alert(err.message || 'Failed to delete task');
    }
  };

  const handleStatusChange = async (id, newStatus, currentRole) => {
    if (currentRole !== 'Admin' && currentRole !== 'Editor') {
      alert("You don't have permission to edit this task.");
      return;
    }
    try {
      await apiClient(`/tasks/${id}`, {
        method: 'PATCH',
        body: { status: newStatus }
      });
      fetchTasks();
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

  return (
    <>
      <div className="flex gap-6">
        <div className="flex-1 min-w-0 flex flex-col gap-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-white tracking-tight">Tasks</h1>
              <p className="text-xs text-slate-400 mt-0.5">Manage your daily to-dos.</p>
            </div>
            <div className="flex items-center gap-3">
              <select 
                value={filterProjectId} 
                onChange={e => setFilterProjectId(e.target.value)}
                className="bg-[#111728] border border-[#1e293f] rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none"
              >
                <option value="">All Projects</option>
                {projects.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
              <button onClick={() => setShowModal(true)} className="px-3.5 py-1.5 bg-[#5922cf] hover:bg-[#682ae6] text-white rounded-lg text-xs font-semibold shadow-md transition">
                Add Task
              </button>
            </div>
          </div>

          {error && (
            <div className="bg-red-500/10 border border-red-500/50 text-red-400 px-4 py-3 rounded-lg">
              {error}
            </div>
          )}

          {loading ? (
            <div className="flex justify-center p-12 text-slate-400">Loading tasks...</div>
          ) : (
            <div className="grid grid-cols-1 gap-3">
              {tasks.map(task => {
                const isOverdue = task.dueDate && new Date(task.dueDate) < new Date() && task.status !== 'Done';
                const role = getTaskRole(task.projectId);
                const canEdit = role === 'Admin' || role === 'Editor';
                const canDelete = role === 'Admin';

                return (
                  <div key={task.id} className="bg-[#101524] border border-[#192238] rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition hover:border-slate-700">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <div className="text-sm font-bold text-white">{task.title}</div>
                        {isOverdue && (
                          <span className="text-[9px] uppercase tracking-wider font-bold text-red-400 bg-red-400/10 px-1.5 py-0.5 rounded border border-red-400/20">Overdue</span>
                        )}
                      </div>
                      {task.description && (
                        <div className="text-xs text-slate-400 mb-2 max-w-xl truncate">{task.description}</div>
                      )}
                      <div className="flex items-center gap-3 text-xs text-slate-400">
                        {task.project && (
                          <span className="flex items-center gap-1"><i className="fa-regular fa-folder text-slate-500"></i> {task.project.name}</span>
                        )}
                        {task.assignee && (
                          <span className="flex items-center gap-1"><i className="fa-regular fa-user text-slate-500"></i> {task.assignee.name}</span>
                        )}
                        {task.dueDate && (
                          <span className="flex items-center gap-1"><i className="fa-regular fa-calendar text-slate-500"></i> {new Date(task.dueDate).toLocaleDateString()}</span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <select 
                        value={task.status} 
                        onChange={(e) => handleStatusChange(task.id, e.target.value, role)}
                        disabled={!canEdit}
                        className="bg-[#1e293f] border border-[#2d3b55] text-white text-xs rounded px-2 py-1 focus:outline-none disabled:opacity-50"
                      >
                        <option value="To Do">To Do</option>
                        <option value="In Progress">In Progress</option>
                        <option value="Done">Done</option>
                      </select>
                      <span className="text-[10px] px-2 py-0.5 rounded bg-[#332513] text-[#f59e0b] border border-[#523b18] font-medium">{task.priority}</span>
                      
                      {canEdit && (
                        <button onClick={() => openEditModal(task)} className="text-slate-500 hover:text-white transition" title="Edit Task">
                          <i className="fa-solid fa-pen text-xs"></i>
                        </button>
                      )}
                      {canDelete && (
                        <button onClick={() => handleDelete(task.id)} className="text-slate-500 hover:text-red-400 transition" title="Delete Task">
                          <i className="fa-solid fa-trash text-xs"></i>
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
              {tasks.length === 0 && !error && (
                <div className="flex flex-col items-center justify-center p-12 bg-[#101524] border border-dashed border-[#232a3f] rounded-2xl mt-4">
                  <i className="fa-solid fa-list-check text-4xl text-slate-500 mb-4"></i>
                  <h2 className="text-lg font-bold text-white mb-2">No tasks yet</h2>
                  <p className="text-sm text-slate-400 mb-6 text-center max-w-md">Create your first task for a project to start organizing your day.</p>
                  <button onClick={() => setShowModal(true)} className="px-5 py-2.5 bg-[#5922cf] hover:bg-[#682ae6] text-white rounded-lg text-sm font-semibold transition">
                    Add First Task
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 flex items-center justify-center z-50 bg-black/60 p-4">
          <div className="bg-[#101524] p-6 rounded-xl border border-[#192238] w-full max-w-md shadow-2xl max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg text-white font-bold mb-4">Add Task</h2>
            {modalError && (
              <div className="bg-red-500/10 border border-red-500/50 text-red-400 px-3 py-2 rounded-lg mb-4 text-sm">
                {modalError}
              </div>
            )}
            <form onSubmit={handleAdd} className="flex flex-col gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Project *</label>
                <select required value={selectedProjectId} onChange={e => setSelectedProjectId(e.target.value)} className="w-full bg-[#111728] border border-[#1e293f] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500">
                  <option value="" disabled>Select a project</option>
                  {projects.map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Task Title *</label>
                <input required value={newTask.title} onChange={e => setNewTask({...newTask, title: e.target.value})} placeholder="E.g. Update user settings" className="w-full bg-[#111728] border border-[#1e293f] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500" />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Description</label>
                <textarea rows="2" value={newTask.description} onChange={e => setNewTask({...newTask, description: e.target.value})} placeholder="Task details" className="w-full bg-[#111728] border border-[#1e293f] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500" />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Status</label>
                  <select value={newTask.status} onChange={e => setNewTask({...newTask, status: e.target.value})} className="w-full bg-[#111728] border border-[#1e293f] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500">
                    <option value="To Do">To Do</option>
                    <option value="In Progress">In Progress</option>
                    <option value="Done">Done</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Priority</label>
                  <select value={newTask.priority} onChange={e => setNewTask({...newTask, priority: e.target.value})} className="w-full bg-[#111728] border border-[#1e293f] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500">
                    <option value="Low">Low</option>
                    <option value="Medium">Medium</option>
                    <option value="High">High</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Assignee</label>
                <select value={newTask.assigneeId} onChange={e => setNewTask({...newTask, assigneeId: e.target.value})} disabled={!selectedProjectId} className="w-full bg-[#111728] border border-[#1e293f] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500 disabled:opacity-50">
                  <option value="">Unassigned</option>
                  {projectMembers.map(m => (
                    <option key={m.user.id} value={m.user.id}>{m.user.name}</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Start Date</label>
                  <input type="date" value={newTask.startDate} onChange={e => setNewTask({...newTask, startDate: e.target.value})} className="w-full bg-[#111728] border border-[#1e293f] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Due Date</label>
                  <input type="date" value={newTask.dueDate} onChange={e => setNewTask({...newTask, dueDate: e.target.value})} className="w-full bg-[#111728] border border-[#1e293f] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500" />
                </div>
              </div>

              <div className="flex justify-end gap-3 mt-4">
                <button type="button" disabled={isSubmitting} onClick={() => setShowModal(false)} className="px-4 py-2 text-slate-400 text-sm hover:text-white disabled:opacity-50">Cancel</button>
                <button type="submit" disabled={isSubmitting} className="px-4 py-2 bg-[#5922cf] hover:bg-[#682ae6] text-white rounded-lg text-sm transition disabled:opacity-50 flex items-center gap-2">
                  {isSubmitting && <i className="fa-solid fa-spinner fa-spin"></i>}
                  {isSubmitting ? 'Creating...' : 'Create Task'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showEditModal && editingTask && (
        <div className="fixed inset-0 flex items-center justify-center z-50 bg-black/60 p-4">
          <div className="bg-[#101524] p-6 rounded-xl border border-[#192238] w-full max-w-md shadow-2xl max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg text-white font-bold mb-4">Edit Task</h2>
            {modalError && (
              <div className="bg-red-500/10 border border-red-500/50 text-red-400 px-3 py-2 rounded-lg mb-4 text-sm">
                {modalError}
              </div>
            )}
            <form onSubmit={handleEdit} className="flex flex-col gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Task Title *</label>
                <input required value={editingTask.title} onChange={e => setEditingTask({...editingTask, title: e.target.value})} className="w-full bg-[#111728] border border-[#1e293f] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500" />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Description</label>
                <textarea rows="2" value={editingTask.description || ''} onChange={e => setEditingTask({...editingTask, description: e.target.value})} className="w-full bg-[#111728] border border-[#1e293f] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500" />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Status</label>
                  <select value={editingTask.status} onChange={e => setEditingTask({...editingTask, status: e.target.value})} className="w-full bg-[#111728] border border-[#1e293f] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500">
                    <option value="To Do">To Do</option>
                    <option value="In Progress">In Progress</option>
                    <option value="Done">Done</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Priority</label>
                  <select value={editingTask.priority} onChange={e => setEditingTask({...editingTask, priority: e.target.value})} className="w-full bg-[#111728] border border-[#1e293f] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500">
                    <option value="Low">Low</option>
                    <option value="Medium">Medium</option>
                    <option value="High">High</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Assignee</label>
                <select value={editingTask.assigneeId || ''} onChange={e => setEditingTask({...editingTask, assigneeId: e.target.value})} className="w-full bg-[#111728] border border-[#1e293f] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500">
                  <option value="">Unassigned</option>
                  {projectMembers.map(m => (
                    <option key={m.user.id} value={m.user.id}>{m.user.name}</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Start Date</label>
                  <input type="date" value={editingTask.startDate} onChange={e => setEditingTask({...editingTask, startDate: e.target.value})} className="w-full bg-[#111728] border border-[#1e293f] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Due Date</label>
                  <input type="date" value={editingTask.dueDate} onChange={e => setEditingTask({...editingTask, dueDate: e.target.value})} className="w-full bg-[#111728] border border-[#1e293f] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500" />
                </div>
              </div>

              <div className="flex justify-end gap-3 mt-4">
                <button type="button" disabled={isSubmitting} onClick={() => setShowEditModal(false)} className="px-4 py-2 text-slate-400 text-sm hover:text-white disabled:opacity-50">Cancel</button>
                <button type="submit" disabled={isSubmitting} className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm transition disabled:opacity-50 flex items-center gap-2">
                  {isSubmitting && <i className="fa-solid fa-spinner fa-spin"></i>}
                  {isSubmitting ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}