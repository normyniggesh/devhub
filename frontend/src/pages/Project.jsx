import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { apiClient } from '../api/client';

export default function Project() {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  const [showModal, setShowModal] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [modalError, setModalError] = useState(null);
  const [newProject, setNewProject] = useState({ 
    name: '', 
    description: '',
    category: '', 
    status: 'Active',
    priority: 'Medium',
    startDate: '',
    dueDate: ''
  });

  const fetchProjects = async () => {
    try {
      setLoading(true);
      const data = await apiClient('/projects');
      setProjects(data.projects || []);
      setError(null);
    } catch (err) {
      setError(err.message || 'Failed to fetch projects');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProjects();
  }, []);

  const handleAdd = async (e) => {
    e.preventDefault();
    setModalError(null);
    setIsSubmitting(true);
    
    try {
      await apiClient('/projects', {
        body: {
          name: newProject.name,
          description: newProject.description,
          category: newProject.category,
          status: newProject.status,
          priority: newProject.priority,
          startDate: newProject.startDate ? new Date(newProject.startDate).toISOString() : null,
          dueDate: newProject.dueDate ? new Date(newProject.dueDate).toISOString() : null
        }
      });
      
      setNewProject({ name: '', description: '', category: '', status: 'Active', priority: 'Medium', startDate: '', dueDate: '' });
      setShowModal(false);
      fetchProjects();
    } catch (err) {
      setModalError(err.message || 'Failed to create project');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <div className="flex gap-6">
        <div className="flex-1 min-w-0 flex flex-col gap-6">
          <div>
            <div className="flex items-center gap-2 text-xs text-slate-400 font-medium mb-1">
              <span>Projects</span>
              <span>›</span>
              <span className="text-white font-semibold">All Projects</span>
            </div>
            <h1 className="text-2xl font-bold text-white tracking-tight">Projects</h1>
            <p className="text-xs text-slate-400 mt-0.5">Organize, track and deliver — all your work in one place.</p>
          </div>
          
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <button onClick={() => setShowModal(true)} className="flex items-center gap-1.5 px-3.5 py-1.5 bg-[#5922cf] hover:bg-[#682ae6] text-white rounded-lg text-xs font-semibold shadow-md shadow-purple-900/40 transition">
              <span>New Project</span>
            </button>
          </div>

          {error && (
            <div className="bg-red-500/10 border border-red-500/50 text-red-400 px-4 py-3 rounded-lg">
              {error}
            </div>
          )}

          {loading ? (
            <div className="flex justify-center p-12 text-slate-400">Loading projects...</div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {projects.map(proj => (
                <Link to={`/projects/${proj.id}`} key={proj.id} className="bg-[#101524] border border-[#192238] rounded-xl overflow-hidden flex flex-col hover:border-slate-600 transition shadow-sm p-4 gap-3">
                  <div className="flex items-center justify-between gap-2">
                    <h2 className="text-sm font-bold text-white tracking-tight truncate">{proj.name}</h2>
                    {proj.category && (
                      <span className="text-[10px] px-2 py-0.5 rounded bg-[#332513] text-[#f59e0b] border border-[#523b18] font-medium whitespace-nowrap">
                        {proj.category}
                      </span>
                    )}
                  </div>
                  {proj.description && (
                    <p className="text-xs text-slate-400 line-clamp-2">{proj.description}</p>
                  )}
                  <div className="flex items-center justify-between mt-auto pt-2 text-[10px] font-medium text-slate-400">
                    <span className="px-2 py-1 bg-[#1e293b] rounded text-slate-300">{proj.status}</span>
                    <span className="px-2 py-1 bg-[#1e293b] rounded text-slate-300">{proj.priority}</span>
                  </div>
                </Link>
              ))}
              {projects.length === 0 && !error && (
                <div className="col-span-full flex flex-col items-center justify-center p-12 bg-[#101524] border border-dashed border-[#232a3f] rounded-2xl">
                  <i className="fa-solid fa-folder-open text-4xl text-slate-500 mb-4"></i>
                  <h2 className="text-lg font-bold text-white mb-2">No projects yet</h2>
                  <p className="text-sm text-slate-400 mb-6 text-center max-w-md">Get started by creating your first project to organize your work, track progress, and hit your goals.</p>
                  <button onClick={() => setShowModal(true)} className="px-5 py-2.5 bg-[#5922cf] hover:bg-[#682ae6] text-white rounded-lg text-sm font-semibold transition">
                    Create First Project
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 flex items-center justify-center z-50 bg-black/50 p-4">
          <div className="bg-[#101524] p-6 rounded-xl border border-[#192238] w-full max-w-md">
            <h2 className="text-lg text-white font-bold mb-4">Add Project</h2>
            {modalError && (
              <div className="bg-red-500/10 border border-red-500/50 text-red-400 px-3 py-2 rounded-lg mb-4 text-sm">
                {modalError}
              </div>
            )}
            <form onSubmit={handleAdd} className="flex flex-col gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Project Name *</label>
                <input required value={newProject.name} onChange={e => setNewProject({...newProject, name: e.target.value})} placeholder="E.g. Website Redesign" className="w-full bg-[#111728] border border-[#1e293f] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500" />
              </div>
              
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Description</label>
                <textarea rows="3" value={newProject.description} onChange={e => setNewProject({...newProject, description: e.target.value})} placeholder="Brief overview of the project" className="w-full bg-[#111728] border border-[#1e293f] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500" />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Category</label>
                  <input value={newProject.category} onChange={e => setNewProject({...newProject, category: e.target.value})} placeholder="E.g. Development" className="w-full bg-[#111728] border border-[#1e293f] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Priority</label>
                  <select value={newProject.priority} onChange={e => setNewProject({...newProject, priority: e.target.value})} className="w-full bg-[#111728] border border-[#1e293f] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500">
                    <option value="Low">Low</option>
                    <option value="Medium">Medium</option>
                    <option value="High">High</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Start Date</label>
                  <input type="date" value={newProject.startDate} onChange={e => setNewProject({...newProject, startDate: e.target.value})} className="w-full bg-[#111728] border border-[#1e293f] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Due Date</label>
                  <input type="date" value={newProject.dueDate} onChange={e => setNewProject({...newProject, dueDate: e.target.value})} className="w-full bg-[#111728] border border-[#1e293f] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500" />
                </div>
              </div>
              
              <div className="flex justify-end gap-3 mt-4">
                <button type="button" disabled={isSubmitting} onClick={() => setShowModal(false)} className="px-4 py-2 text-slate-400 text-sm hover:text-white disabled:opacity-50">Cancel</button>
                <button type="submit" disabled={isSubmitting} className="px-4 py-2 bg-[#5922cf] hover:bg-[#682ae6] text-white rounded-lg text-sm transition disabled:opacity-50 flex items-center gap-2">
                  {isSubmitting && <i className="fa-solid fa-spinner fa-spin"></i>}
                  {isSubmitting ? 'Creating...' : 'Create Project'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}