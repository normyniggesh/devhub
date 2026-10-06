import { useState, useEffect } from 'react';
import { apiClient } from '../api/client';
import Modal from '../components/common/Modal';
import { getStatusBadgeColor } from '../utils/colors';

export default function Deployments() {
  const [deployments, setDeployments] = useState([]);
  const [repositories, setRepositories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Modal State
  const [showModal, setShowModal] = useState(false);
  const [modalMode, setModalMode] = useState('create');
  const [activeDeployment, setActiveDeployment] = useState(null);

  // Form State
  const [formData, setFormData] = useState({
    environment: 'Production',
    status: 'Pending',
    repositoryId: '',
    projectId: '', // auto-filled
    url: ''
  });

  const fetchData = async () => {
    setLoading(true);
    try {
      const [depRes, repoRes] = await Promise.all([
        apiClient('/deployments'),
        apiClient('/repositories')
      ]);
      if (depRes.deployments) setDeployments(depRes.deployments);
      if (repoRes.repositories) setRepositories(repoRes.repositories);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleOpenModal = (mode, dep = null) => {
    setModalMode(mode);
    setActiveDeployment(dep);
    if (mode === 'edit' && dep) {
      setFormData({
        environment: dep.environment,
        status: dep.status,
        repositoryId: dep.repositoryId,
        projectId: dep.projectId,
        url: dep.url || ''
      });
    } else {
      const defaultRepo = repositories.length > 0 ? repositories[0] : null;
      setFormData({
        environment: 'Production',
        status: 'Pending',
        repositoryId: defaultRepo ? defaultRepo.id : '',
        projectId: defaultRepo ? defaultRepo.projectId : '',
        url: ''
      });
    }
    setShowModal(true);
  };

  const handleRepoChange = (e) => {
    const repoId = e.target.value;
    const repo = repositories.find(r => r.id === repoId);
    setFormData({
      ...formData,
      repositoryId: repoId,
      projectId: repo ? repo.projectId : ''
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (modalMode === 'create') {
        await apiClient('/deployments', {
          method: 'POST',
          body: JSON.stringify(formData)
        });
      } else {
        await apiClient(`/deployments/${activeDeployment.id}`, {
          method: 'PATCH',
          body: JSON.stringify(formData)
        });
      }
      setShowModal(false);
      fetchData();
    } catch (err) {
      alert(err.message || 'Failed to save deployment');
    }
  };

  const handleDelete = async (depId) => {
    if (!confirm('Are you sure you want to delete this deployment record?')) return;
    try {
      await apiClient(`/deployments/${depId}`, {
        method: 'DELETE'
      });
      fetchData();
    } catch (err) {
      alert(err.message || 'Failed to delete deployment');
    }
  };

  const getProjectName = (projectId) => {
    const proj = projects.find(p => p.id === projectId);
    return proj ? proj.name : 'Unknown';
  };

  const canEdit = (projectId) => {
    const role = getRole(projectId);
    return role === 'Admin' || role === 'Owner' || role === 'Editor';
  };

  const canDelete = (projectId) => {
    const role = getRole(projectId);
    return role === 'Admin' || role === 'Owner';
  };

  const getStatusColor = getStatusBadgeColor;

  return (
    <>
      <div className="flex flex-col gap-6">
        <div className="flex justify-between items-end">
          <div>
            <h1 className="text-2xl font-bold text-white tracking-tight">Deployments</h1>
            <p className="text-xs text-slate-400 mt-0.5">Track live environments and deployment history.</p>
          </div>
          <button 
            onClick={() => handleOpenModal('create')}
            disabled={repositories.length === 0}
            className="px-4 py-2 bg-[#5922cf] hover:bg-[#682ae6] text-white rounded-lg text-sm font-semibold transition disabled:opacity-50 flex items-center gap-2"
          >
            <i className="fa-solid fa-rocket"></i> Register Deployment
          </button>
        </div>

        {loading ? (
          <div className="text-slate-400 text-sm">Loading deployments...</div>
        ) : error ? (
          <div className="text-rose-500 text-sm">{error}</div>
        ) : deployments.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-12 bg-[#101524] border border-dashed border-[#232a3f] rounded-2xl">
            <i className="fa-solid fa-rocket text-4xl text-slate-500 mb-4"></i>
            <h2 className="text-lg font-bold text-white mb-2">No deployments tracked</h2>
            <p className="text-sm text-slate-400 mb-6 text-center max-w-md">Register your live application environments to track them alongside your code.</p>
            {repositories.length === 0 && (
              <p className="text-xs text-amber-400 mb-4">You must connect a repository before registering a deployment.</p>
            )}
            <button 
              onClick={() => handleOpenModal('create')}
              disabled={repositories.length === 0}
              className="px-5 py-2.5 bg-[#1e293f] hover:bg-[#2d3b55] text-white rounded-lg text-sm font-semibold transition disabled:opacity-50"
            >
              Register Deployment
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto bg-[#101524] border border-[#192238] rounded-xl">
            <table className="w-full text-left text-sm whitespace-nowrap">
              <thead className="bg-[#151a2d] text-slate-400 border-b border-[#1e2538]">
                <tr>
                  <th className="px-6 py-4 font-semibold text-xs">Environment</th>
                  <th className="px-6 py-4 font-semibold text-xs">Status</th>
                  <th className="px-6 py-4 font-semibold text-xs">Repository</th>
                  <th className="px-6 py-4 font-semibold text-xs">Project</th>
                  <th className="px-6 py-4 font-semibold text-xs">Deployer</th>
                  <th className="px-6 py-4 font-semibold text-xs text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1e2538] text-slate-300">
                {deployments.map(dep => (
                  <tr key={dep.id} className="hover:bg-[#151a2d]/50 transition">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <i className="fa-solid fa-server text-slate-500"></i>
                        <span className="font-semibold text-slate-200">{dep.environment}</span>
                      </div>
                      {dep.url && (
                        <a href={dep.url} target="_blank" rel="noreferrer" className="text-xs text-indigo-400 hover:underline mt-1 block">
                          {dep.url}
                        </a>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <span className={`px-2.5 py-1 rounded text-[10px] font-bold border ${getStatusColor(dep.status)}`}>
                        {dep.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-xs text-slate-400">
                      {dep.repository?.owner}/{dep.repository?.name}
                    </td>
                    <td className="px-6 py-4 text-xs text-slate-400">
                      {getProjectName(dep.projectId)}
                    </td>
                    <td className="px-6 py-4 text-xs text-slate-400">
                      {dep.deployerGithubUsername || dep.deployerId || 'Unknown'}
                    </td>
                    <td className="px-6 py-4 text-right space-x-3">
                      {canEdit(dep.projectId) && (
                        <button onClick={() => handleOpenModal('edit', dep)} className="text-slate-400 hover:text-white transition">
                          <i className="fa-solid fa-pen text-xs"></i>
                        </button>
                      )}
                      {canDelete(dep.projectId) && (
                        <button onClick={() => handleDelete(dep.id)} className="text-slate-400 hover:text-red-400 transition">
                          <i className="fa-solid fa-trash text-xs"></i>
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showModal && (
        <Modal open={showModal} onClose={() => setShowModal(false)} className="max-w-md my-auto">
          <div className="px-6 py-4 border-b border-[#1b2234] flex justify-between items-center bg-[#171c2a] rounded-t-2xl">
              <h3 className="text-lg font-bold text-white">
                {modalMode === 'create' ? 'Register Deployment' : 'Edit Deployment'}
              </h3>
              <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-white transition">
                <i className="fa-solid fa-xmark text-lg"></i>
              </button>
            </div>
            
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">Repository</label>
                <select
                  required
                  value={formData.repositoryId}
                  onChange={handleRepoChange}
                  className="w-full bg-[#0b0f19] border border-[#1b2234] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
                >
                  <option value="" disabled>Select a repository</option>
                  {repositories.filter(r => canEdit(r.projectId)).map(r => (
                    <option key={r.id} value={r.id}>{r.owner}/{r.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">Environment</label>
                <select
                  required
                  value={formData.environment}
                  onChange={(e) => setFormData({...formData, environment: e.target.value})}
                  className="w-full bg-[#0b0f19] border border-[#1b2234] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
                >
                  <option value="Production">Production</option>
                  <option value="Staging">Staging</option>
                  <option value="Preview">Preview</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">Status</label>
                <select
                  required
                  value={formData.status}
                  onChange={(e) => setFormData({...formData, status: e.target.value})}
                  className="w-full bg-[#0b0f19] border border-[#1b2234] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
                >
                  <option value="Pending">Pending</option>
                  <option value="Success">Success</option>
                  <option value="Failed">Failed</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">Deployment URL (Optional)</label>
                <input
                  type="url"
                  placeholder="https://..."
                  value={formData.url}
                  onChange={(e) => setFormData({...formData, url: e.target.value})}
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
                  Save Deployment
                </button>
              </div>
            </form>
        </Modal>
      )}
    </>
  );
}
