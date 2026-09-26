import { useState, useEffect } from 'react';
import { apiClient } from '../api/client';
import { useStore } from '../store';

export default function Github() {
  const { projects, getRole } = useStore();
  const [repositories, setRepositories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Modal State
  const [showModal, setShowModal] = useState(false);
  const [modalMode, setModalMode] = useState('create');
  const [activeRepo, setActiveRepo] = useState(null);

  // Form State
  const [formData, setFormData] = useState({
    name: '',
    owner: '',
    url: '',
    projectId: '',
    defaultBranch: 'main'
  });

  const fetchRepositories = async () => {
    setLoading(true);
    try {
      const res = await apiClient('/repositories');
      if (res.repositories) {
        setRepositories(res.repositories);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRepositories();
  }, []);

  const handleOpenModal = (mode, repo = null) => {
    setModalMode(mode);
    setActiveRepo(repo);
    if (mode === 'edit' && repo) {
      setFormData({
        name: repo.name,
        owner: repo.owner,
        url: repo.url,
        projectId: repo.projectId,
        defaultBranch: repo.defaultBranch || 'main'
      });
    } else {
      setFormData({
        name: '',
        owner: '',
        url: '',
        projectId: projects.length > 0 ? projects[0].id : '',
        defaultBranch: 'main'
      });
    }
    setShowModal(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (modalMode === 'create') {
        await apiClient('/repositories', {
          method: 'POST',
          body: JSON.stringify(formData)
        });
      } else {
        await apiClient(`/repositories/${activeRepo.id}`, {
          method: 'PATCH',
          body: JSON.stringify(formData)
        });
      }
      setShowModal(false);
      fetchRepositories();
    } catch (err) {
      alert(err.message || 'Failed to save repository');
    }
  };

  const handleDelete = async (repoId) => {
    if (!confirm('Are you sure you want to remove this repository from DevHub?')) return;
    try {
      await apiClient(`/repositories/${repoId}`, {
        method: 'DELETE'
      });
      fetchRepositories();
    } catch (err) {
      alert(err.message || 'Failed to delete repository');
    }
  };

  const getProjectName = (projectId) => {
    const proj = projects.find(p => p.id === projectId);
    return proj ? proj.name : 'Unknown Project';
  };

  const canEdit = (projectId) => {
    const role = getRole(projectId);
    return role === 'Admin' || role === 'Owner' || role === 'Editor';
  };

  const canDelete = (projectId) => {
    const role = getRole(projectId);
    return role === 'Admin' || role === 'Owner';
  };

  return (
    <>
      <div className="flex flex-col gap-6">
        <div className="flex justify-between items-end">
          <div>
            <h1 className="text-2xl font-bold text-white tracking-tight">Repositories</h1>
            <p className="text-xs text-slate-400 mt-0.5">Manage connected code repositories across your projects.</p>
          </div>
          <button 
            onClick={() => handleOpenModal('create')}
            className="px-4 py-2 bg-[#5922cf] hover:bg-[#682ae6] text-white rounded-lg text-sm font-semibold transition flex items-center gap-2"
          >
            <i className="fa-solid fa-plus"></i> Connect Repository
          </button>
        </div>

        {loading ? (
          <div className="text-slate-400 text-sm">Loading repositories...</div>
        ) : error ? (
          <div className="text-rose-500 text-sm">{error}</div>
        ) : repositories.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-12 bg-[#101524] border border-dashed border-[#232a3f] rounded-2xl">
            <i className="fa-brands fa-github text-4xl text-slate-500 mb-4"></i>
            <h2 className="text-lg font-bold text-white mb-2">No repositories connected</h2>
            <p className="text-sm text-slate-400 mb-6 text-center max-w-md">Connect your code repositories to track pull requests and deployments alongside your tasks.</p>
            <button 
              onClick={() => handleOpenModal('create')}
              className="px-5 py-2.5 bg-[#1e293f] hover:bg-[#2d3b55] text-white rounded-lg text-sm font-semibold transition"
            >
              Connect Repository
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            {repositories.map(repo => (
              <div 
                key={repo.id} 
                className="bg-[#101524] border border-[#192238] rounded-xl p-5 flex flex-col gap-3"
              >
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="text-white font-bold text-base flex items-center gap-2">
                      <i className="fa-brands fa-github text-slate-400"></i>
                      {repo.owner}/{repo.name}
                    </h3>
                    <a href={repo.url} target="_blank" rel="noreferrer" className="text-xs text-indigo-400 hover:underline mt-1 block w-fit">
                      {repo.url}
                    </a>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    {canEdit(repo.projectId) && (
                      <button onClick={() => handleOpenModal('edit', repo)} className="text-slate-400 hover:text-white transition p-1">
                        <i className="fa-solid fa-pen text-xs"></i>
                      </button>
                    )}
                    {canDelete(repo.projectId) && (
                      <button onClick={() => handleDelete(repo.id)} className="text-slate-400 hover:text-red-400 transition p-1">
                        <i className="fa-solid fa-trash text-xs"></i>
                      </button>
                    )}
                  </div>
                </div>
                
                <div className="flex gap-4 text-xs text-slate-400 mt-2">
                  <span className="flex items-center gap-1.5 px-2 py-1 rounded bg-[#161c2d] border border-[#232a3f]">
                    <i className="fa-regular fa-folder text-slate-500"></i> 
                    Project: {getProjectName(repo.projectId)}
                  </span>
                  <span className="flex items-center gap-1.5 px-2 py-1 rounded bg-[#161c2d] border border-[#232a3f]">
                    <i className="fa-solid fa-code-branch text-slate-500"></i> 
                    Branch: {repo.defaultBranch || 'main'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-[#121623] border border-[#1b2234] rounded-2xl w-full max-w-md overflow-hidden shadow-2xl">
            <div className="px-6 py-4 border-b border-[#1b2234] flex justify-between items-center bg-[#171c2a]">
              <h3 className="text-lg font-bold text-white">
                {modalMode === 'create' ? 'Connect Repository' : 'Edit Repository'}
              </h3>
              <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-white transition">
                <i className="fa-solid fa-xmark text-lg"></i>
              </button>
            </div>
            
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">Project</label>
                <select
                  required
                  value={formData.projectId}
                  onChange={(e) => setFormData({...formData, projectId: e.target.value})}
                  className="w-full bg-[#0b0f19] border border-[#1b2234] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
                >
                  <option value="" disabled>Select a project</option>
                  {projects.filter(p => canEdit(p.id)).map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">Owner / Organization</label>
                <input
                  required
                  type="text"
                  placeholder="e.g. facebook"
                  value={formData.owner}
                  onChange={(e) => setFormData({...formData, owner: e.target.value})}
                  className="w-full bg-[#0b0f19] border border-[#1b2234] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">Repository Name</label>
                <input
                  required
                  type="text"
                  placeholder="e.g. react"
                  value={formData.name}
                  onChange={(e) => setFormData({...formData, name: e.target.value})}
                  className="w-full bg-[#0b0f19] border border-[#1b2234] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">URL</label>
                <input
                  required
                  type="url"
                  placeholder="https://github.com/..."
                  value={formData.url}
                  onChange={(e) => setFormData({...formData, url: e.target.value})}
                  className="w-full bg-[#0b0f19] border border-[#1b2234] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">Default Branch</label>
                <input
                  type="text"
                  placeholder="main"
                  value={formData.defaultBranch}
                  onChange={(e) => setFormData({...formData, defaultBranch: e.target.value})}
                  className="w-full bg-[#0b0f19] border border-[#1b2234] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="pt-4 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 bg-transparent border border-[#2d364f] hover:bg-[#1b2234] text-white rounded-lg text-sm font-semibold transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-[#5922cf] hover:bg-[#682ae6] text-white rounded-lg text-sm font-semibold transition"
                >
                  Save Repository
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
