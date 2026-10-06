import { useState, useEffect } from 'react';
import { apiClient } from '../api/client';
import Modal from '../components/common/Modal';
import { getStatusBadgeColor } from '../utils/colors';

export default function PullRequests() {
  const [pullRequests, setPullRequests] = useState([]);
  const [repositories, setRepositories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Modal State
  const [showModal, setShowModal] = useState(false);
  const [modalMode, setModalMode] = useState('create');
  const [activePR, setActivePR] = useState(null);

  // Form State
  const [formData, setFormData] = useState({
    title: '',
    number: '',
    status: 'Open',
    repositoryId: '',
    projectId: '' // auto-filled when repo is selected
  });

  const fetchData = async () => {
    setLoading(true);
    try {
      const [prRes, repoRes] = await Promise.all([
        apiClient('/pull-requests'),
        apiClient('/repositories')
      ]);
      if (prRes.pullRequests) setPullRequests(prRes.pullRequests);
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

  const handleOpenModal = (mode, pr = null) => {
    setModalMode(mode);
    setActivePR(pr);
    if (mode === 'edit' && pr) {
      setFormData({
        title: pr.title,
        number: pr.number.toString(),
        status: pr.status,
        repositoryId: pr.repositoryId,
        projectId: pr.projectId
      });
    } else {
      const defaultRepo = repositories.length > 0 ? repositories[0] : null;
      setFormData({
        title: '',
        number: '',
        status: 'Open',
        repositoryId: defaultRepo ? defaultRepo.id : '',
        projectId: defaultRepo ? defaultRepo.projectId : ''
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
      const payload = { ...formData, number: parseInt(formData.number, 10) };
      if (modalMode === 'create') {
        await apiClient('/pull-requests', {
          method: 'POST',
          body: JSON.stringify(payload)
        });
      } else {
        await apiClient(`/pull-requests/${activePR.id}`, {
          method: 'PATCH',
          body: JSON.stringify(payload)
        });
      }
      setShowModal(false);
      fetchData();
    } catch (err) {
      alert(err.message || 'Failed to save pull request');
    }
  };

  const handleDelete = async (prId) => {
    if (!confirm('Are you sure you want to remove this pull request?')) return;
    try {
      await apiClient(`/pull-requests/${prId}`, {
        method: 'DELETE'
      });
      fetchData();
    } catch (err) {
      alert(err.message || 'Failed to delete pull request');
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
            <h1 className="text-2xl font-bold text-white tracking-tight">Pull Requests</h1>
            <p className="text-xs text-slate-400 mt-0.5">Track and review code changes across your repositories.</p>
          </div>
          <button 
            onClick={() => handleOpenModal('create')}
            disabled={repositories.length === 0}
            className="px-4 py-2 bg-[#5922cf] hover:bg-[#682ae6] text-white rounded-lg text-sm font-semibold transition disabled:opacity-50 flex items-center gap-2"
          >
            <i className="fa-solid fa-code-pull-request"></i> Register PR
          </button>
        </div>

        {loading ? (
          <div className="text-slate-400 text-sm">Loading pull requests...</div>
        ) : error ? (
          <div className="text-rose-500 text-sm">{error}</div>
        ) : pullRequests.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-12 bg-[#101524] border border-dashed border-[#232a3f] rounded-2xl">
            <i className="fa-solid fa-code-pull-request text-4xl text-slate-500 mb-4"></i>
            <h2 className="text-lg font-bold text-white mb-2">No pull requests tracked</h2>
            <p className="text-sm text-slate-400 mb-6 text-center max-w-md">Register your active pull requests here to track their status alongside your DevHub tasks.</p>
            {repositories.length === 0 && (
              <p className="text-xs text-amber-400 mb-4">You must connect a repository before registering a PR.</p>
            )}
            <button 
              onClick={() => handleOpenModal('create')}
              disabled={repositories.length === 0}
              className="px-5 py-2.5 bg-[#1e293f] hover:bg-[#2d3b55] text-white rounded-lg text-sm font-semibold transition disabled:opacity-50"
            >
              Register Pull Request
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto bg-[#101524] border border-[#192238] rounded-xl">
            <table className="w-full text-left text-sm whitespace-nowrap">
              <thead className="bg-[#151a2d] text-slate-400 border-b border-[#1e2538]">
                <tr>
                  <th className="px-6 py-4 font-semibold text-xs">Title</th>
                  <th className="px-6 py-4 font-semibold text-xs">Status</th>
                  <th className="px-6 py-4 font-semibold text-xs">Repository</th>
                  <th className="px-6 py-4 font-semibold text-xs">Project</th>
                  <th className="px-6 py-4 font-semibold text-xs">Author</th>
                  <th className="px-6 py-4 font-semibold text-xs text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1e2538] text-slate-300">
                {pullRequests.map(pr => (
                  <tr key={pr.id} className="hover:bg-[#151a2d]/50 transition">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <i className="fa-solid fa-code-pull-request text-slate-500"></i>
                        <span className="font-semibold text-slate-200">{pr.title}</span>
                        <span className="text-xs text-slate-500">#{pr.number}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`px-2.5 py-1 rounded text-[10px] font-bold border ${getStatusColor(pr.status)}`}>
                        {pr.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-xs text-slate-400">
                      {pr.repository?.owner}/{pr.repository?.name}
                    </td>
                    <td className="px-6 py-4 text-xs text-slate-400">
                      {getProjectName(pr.projectId)}
                    </td>
                    <td className="px-6 py-4 text-xs text-slate-400">
                      {pr.authorGithubUsername || pr.authorId || 'Unknown'}
                    </td>
                    <td className="px-6 py-4 text-right space-x-3">
                      {canEdit(pr.projectId) && (
                        <button onClick={() => handleOpenModal('edit', pr)} className="text-slate-400 hover:text-white transition">
                          <i className="fa-solid fa-pen text-xs"></i>
                        </button>
                      )}
                      {canDelete(pr.projectId) && (
                        <button onClick={() => handleDelete(pr.id)} className="text-slate-400 hover:text-red-400 transition">
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
                {modalMode === 'create' ? 'Register Pull Request' : 'Edit Pull Request'}
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
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">PR Title</label>
                <input
                  required
                  type="text"
                  placeholder="e.g. Add user authentication"
                  value={formData.title}
                  onChange={(e) => setFormData({...formData, title: e.target.value})}
                  className="w-full bg-[#0b0f19] border border-[#1b2234] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">PR Number</label>
                <input
                  required
                  type="number"
                  min="1"
                  placeholder="e.g. 42"
                  value={formData.number}
                  onChange={(e) => setFormData({...formData, number: e.target.value})}
                  className="w-full bg-[#0b0f19] border border-[#1b2234] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">Status</label>
                <select
                  required
                  value={formData.status}
                  onChange={(e) => setFormData({...formData, status: e.target.value})}
                  className="w-full bg-[#0b0f19] border border-[#1b2234] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
                >
                  <option value="Open">Open</option>
                  <option value="Merged">Merged</option>
                  <option value="Closed">Closed</option>
                  <option value="Draft">Draft</option>
                </select>
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
                  Save Pull Request
                </button>
              </div>
            </form>
        </Modal>
      )}
    </>
  );
}
