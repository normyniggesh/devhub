import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { apiClient } from '../api/client';
import { useStore } from '../store';
import Modal from '../components/common/Modal';

export default function Github() {
  const { currentUser } = useStore();
  const [repositories, setRepositories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // GitHub Account Connection State
  const [githubStatus, setGithubStatus] = useState({ connected: false });
  const [statusLoading, setStatusLoading] = useState(true);
  const [showConnectModal, setShowConnectModal] = useState(false);
  const [connectForm, setConnectForm] = useState({ token: '', username: '' });
  const [connecting, setConnecting] = useState(false);

  // Import Repositories Modal State
  const [showImportModal, setShowImportModal] = useState(false);
  const [userGhRepos, setUserGhRepos] = useState([]);
  const [importSearch, setImportSearch] = useState('');
  const [selectedRepoIds, setSelectedRepoIds] = useState(new Set());
  const [importProjectId, setImportProjectId] = useState('');
  const [importLoading, setImportLoading] = useState(false);
  const [importing, setImporting] = useState(false);

  // Syncing State
  const [syncingRepoId, setSyncingRepoId] = useState(null);

  // Search filter for repositories
  const [repoSearch, setRepoSearch] = useState('');

  // Manual Add/Edit Repository Modal State
  const [showModal, setShowModal] = useState(false);
  const [modalMode, setModalMode] = useState('create');
  const [activeRepo, setActiveRepo] = useState(null);
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

  const fetchGithubStatus = async () => {
    setStatusLoading(true);
    try {
      const res = await apiClient('/github/status');
      setGithubStatus(res);
    } catch (err) {
      console.error('Failed to load GitHub status:', err);
    } finally {
      setStatusLoading(false);
    }
  };

  useEffect(() => {
    fetchRepositories();
    fetchGithubStatus();
  }, []);

  const handleConnectGitHub = async (e) => {
    e.preventDefault();
    setConnecting(true);
    try {
      const res = await apiClient('/github/connect', {
        method: 'POST',
        body: {
          token: connectForm.token.trim() || undefined,
          username: connectForm.username.trim() || undefined
        }
      });
      setShowConnectModal(false);
      setConnectForm({ token: '', username: '' });
      await fetchGithubStatus();
      alert(`GitHub account @${res.username} connected successfully!`);
    } catch (err) {
      alert(err.message || 'Failed to connect GitHub account');
    } finally {
      setConnecting(false);
    }
  };

  const handleDisconnectGitHub = async () => {
    if (!window.confirm('Disconnect your GitHub account from DEVHUB? Connected repositories will remain in DEVHUB.')) return;
    try {
      await apiClient('/github/disconnect', { method: 'POST' });
      await fetchGithubStatus();
    } catch (err) {
      alert(err.message || 'Failed to disconnect GitHub');
    }
  };

  const openImportModal = async () => {
    setShowImportModal(true);
    setImportLoading(true);
    setSelectedRepoIds(new Set());
    setImportProjectId(projects.length > 0 ? projects[0].id : '');
    try {
      const res = await apiClient('/github/user-repos');
      setUserGhRepos(res.repos || []);
    } catch (err) {
      alert(err.message || 'Failed to fetch repositories from GitHub');
      setShowImportModal(false);
    } finally {
      setImportLoading(false);
    }
  };

  const toggleSelectRepo = (repoId) => {
    const next = new Set(selectedRepoIds);
    if (next.has(repoId)) {
      next.delete(repoId);
    } else {
      next.add(repoId);
    }
    setSelectedRepoIds(next);
  };

  const handleImportSubmit = async (e) => {
    e.preventDefault();
    if (selectedRepoIds.size === 0) {
      alert('Please select at least one repository to import');
      return;
    }

    setImporting(true);
    try {
      const selectedList = userGhRepos.filter(r => selectedRepoIds.has(r.id));
      await apiClient('/github/import', {
        method: 'POST',
        body: {
          repos: selectedList,
          projectId: importProjectId || null
        }
      });
      setShowImportModal(false);
      fetchRepositories();
    } catch (err) {
      alert(err.message || 'Failed to import repositories');
    } finally {
      setImporting(false);
    }
  };

  const handleSyncRepo = async (repoId) => {
    setSyncingRepoId(repoId);
    try {
      const res = await apiClient(`/github/sync/${repoId}`, { method: 'POST' });
      if (res.repository) {
        setRepositories(prev => prev.map(r => r.id === repoId ? res.repository : r));
      }
    } catch (err) {
      alert(err.message || 'Failed to sync repository from GitHub');
    } finally {
      setSyncingRepoId(null);
    }
  };

  const handleOpenModal = (mode, repo = null) => {
    setModalMode(mode);
    setActiveRepo(repo);
    if (mode === 'edit' && repo) {
      setFormData({
        name: repo.name,
        owner: repo.owner,
        url: repo.url,
        projectId: repo.projectId || '',
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
    if (!confirm('Are you sure you want to remove this repository from DEVHUB?')) return;
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
    if (!projectId) return 'Personal / Unassigned';
    const proj = projects.find(p => p.id === projectId);
    return proj ? proj.name : 'Unknown Project';
  };

  const canEdit = (repo) => {
    if (repo.userId === currentUser?.id) return true;
    if (repo.projectId) {
      const role = getRole(repo.projectId);
      return role === 'Admin' || role === 'Owner' || role === 'Editor';
    }
    return false;
  };

  const canDelete = (repo) => {
    if (repo.userId === currentUser?.id) return true;
    if (repo.projectId) {
      const role = getRole(repo.projectId);
      return role === 'Admin' || role === 'Owner';
    }
    return false;
  };

  const filteredImportRepos = userGhRepos.filter(r => 
    r.name.toLowerCase().includes(importSearch.toLowerCase()) ||
    r.owner.toLowerCase().includes(importSearch.toLowerCase()) ||
    (r.description && r.description.toLowerCase().includes(importSearch.toLowerCase()))
  );

  const filteredRepositories = repositories.filter(repo => {
    if (!repoSearch.trim()) return true;
    const q = repoSearch.toLowerCase();
    const projName = getProjectName(repo.projectId).toLowerCase();
    return (
      repo.name.toLowerCase().includes(q) ||
      repo.owner.toLowerCase().includes(q) ||
      (repo.language && repo.language.toLowerCase().includes(q)) ||
      projName.includes(q) ||
      (repo.description && repo.description.toLowerCase().includes(q))
    );
  });

  return (
    <>
      <div className="flex flex-col gap-6">
        
        {/* Header Banner & Title */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4">
          <div>
            <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2.5">
              <i className="fa-brands fa-github text-purple-400"></i> GitHub & Code Repositories
            </h1>
            <p className="text-xs text-slate-400 mt-1">
              Connect your personal GitHub account, import repositories, and link code to DEVHUB projects.
            </p>
          </div>
          
          <div className="flex items-center gap-2.5 flex-wrap">
            {githubStatus.connected ? (
              <button 
                onClick={openImportModal}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold transition flex items-center gap-2 shadow-lg shadow-indigo-900/30"
              >
                <i className="fa-solid fa-cloud-arrow-down"></i> Import Repositories
              </button>
            ) : (
              <button 
                onClick={() => setShowConnectModal(true)}
                className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-xl text-xs font-bold transition flex items-center gap-2 shadow-lg shadow-purple-900/30"
              >
                <i className="fa-brands fa-github"></i> Connect GitHub Account
              </button>
            )}

            <button 
              onClick={() => handleOpenModal('create')}
              className="px-3.5 py-2 bg-[#1c2438] hover:bg-[#25304a] text-slate-200 hover:text-white border border-[#2d3a59] rounded-xl text-xs font-semibold transition flex items-center gap-2"
            >
              <i className="fa-solid fa-plus text-[10px]"></i> Add URL Manually
            </button>
          </div>
        </div>

        {/* Beginner Guide / How it Works Card */}
        <div className="bg-gradient-to-r from-indigo-950/40 via-[#0f1422] to-[#0f1422] border border-indigo-500/20 rounded-2xl p-5 shadow-sm">
          <h2 className="text-xs font-bold text-indigo-400 uppercase tracking-wider mb-2 flex items-center gap-2">
            <i className="fa-solid fa-circle-info"></i> How GitHub Integration Works
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs text-slate-300">
            <div className="bg-[#121829] border border-[#1d273e] p-3.5 rounded-xl">
              <div className="font-bold text-white mb-1 flex items-center gap-1.5">
                <span className="w-5 h-5 rounded-full bg-purple-600/30 text-purple-400 text-[11px] flex items-center justify-center font-extrabold">1</span>
                Connect Account
              </div>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                Connect your personal GitHub account using a Personal Access Token (for private & public repos) or username (for public-only). One account per user.
              </p>
            </div>
            <div className="bg-[#121829] border border-[#1d273e] p-3.5 rounded-xl">
              <div className="font-bold text-white mb-1 flex items-center gap-1.5">
                <span className="w-5 h-5 rounded-full bg-indigo-600/30 text-indigo-400 text-[11px] flex items-center justify-center font-extrabold">2</span>
                Import Repositories
              </div>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                Choose which repositories you want in DEVHUB. You can import multiple repositories and optionally assign each to a specific DEVHUB project.
              </p>
            </div>
            <div className="bg-[#121829] border border-[#1d273e] p-3.5 rounded-xl">
              <div className="font-bold text-white mb-1 flex items-center gap-1.5">
                <span className="w-5 h-5 rounded-full bg-emerald-600/30 text-emerald-400 text-[11px] flex items-center justify-center font-extrabold">3</span>
                Sync & Track
              </div>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                Use the Refresh button to fetch latest stars, forks, and branch activity directly from GitHub. Link your code to Tasks, PRs, and Deployments.
              </p>
            </div>
          </div>
        </div>

        {/* Section 1: Connect your GitHub account */}
        <div className="bg-[#0f1422] border border-[#192238] rounded-2xl p-5 shadow-sm">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div className="flex items-center gap-3.5">
              {githubStatus.connected && githubStatus.metadata?.avatarUrl ? (
                <img 
                  src={githubStatus.metadata.avatarUrl} 
                  alt={githubStatus.username} 
                  className="w-12 h-12 rounded-full border-2 border-purple-500/50 object-cover shrink-0" 
                />
              ) : (
                <div className="w-12 h-12 rounded-2xl bg-[#161c2d] border border-[#232a3f] flex items-center justify-center shrink-0">
                  <i className="fa-brands fa-github text-2xl text-slate-400"></i>
                </div>
              )}

              <div>
                <div className="flex items-center gap-2.5">
                  <h2 className="text-sm font-bold text-white">
                    {githubStatus.connected ? `@${githubStatus.username}` : 'Connect your GitHub account'}
                  </h2>
                  {githubStatus.connected ? (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span> Connected
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-800 text-slate-400 border border-slate-700">
                      Not Connected
                    </span>
                  )}
                </div>

                <p className="text-xs text-slate-400 mt-1">
                  {githubStatus.connected ? (
                    <span>
                      {githubStatus.metadata?.name ? `${githubStatus.metadata.name} • ` : ''}
                      {githubStatus.metadata?.publicRepos || 0} public repositories • Connected to your private DEVHUB profile
                    </span>
                  ) : (
                    'Connect your personal GitHub account to import repositories and sync pull requests.'
                  )}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 self-end md:self-center">
              {githubStatus.connected ? (
                <>
                  <button
                    onClick={openImportModal}
                    className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold transition flex items-center gap-1.5 shadow-sm"
                  >
                    <i className="fa-solid fa-cloud-arrow-down text-[11px]"></i> Import Repositories
                  </button>
                  <button
                    onClick={handleDisconnectGitHub}
                    className="px-3 py-1.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 rounded-lg text-xs font-semibold border border-rose-500/20 transition"
                  >
                    Disconnect
                  </button>
                </>
              ) : (
                <button
                  onClick={() => setShowConnectModal(true)}
                  className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-xl text-xs font-semibold transition flex items-center gap-1.5 shadow-md shadow-purple-900/30"
                >
                  <i className="fa-brands fa-github"></i> Connect GitHub Account
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Section 2: My Repositories */}
        <div>
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-4">
            <div>
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <i className="fa-solid fa-code-fork text-indigo-400"></i> My Repositories
                <span className="text-xs font-bold text-purple-400 bg-purple-500/10 border border-purple-500/20 px-2 py-0.5 rounded-full ml-1">
                  {repositories.length}
                </span>
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Repositories imported by you or associated with your DEVHUB projects. Private repositories are strictly isolated to your account.
              </p>
            </div>

            {/* Filter Search Input */}
            {repositories.length > 0 && (
              <div className="relative w-full sm:w-72">
                <i className="fa-solid fa-magnifying-glass absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-xs"></i>
                <input
                  type="text"
                  placeholder="Filter by name, language, project..."
                  value={repoSearch}
                  onChange={(e) => setRepoSearch(e.target.value)}
                  className="w-full bg-[#0f1422] border border-[#192238] rounded-xl pl-8 pr-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition"
                />
              </div>
            )}
          </div>

          {/* Repositories Grid */}
          {loading ? (
            <div className="flex items-center justify-center p-12 bg-[#101524] border border-[#192238] rounded-2xl text-slate-400 text-sm">
              <i className="fa-solid fa-spinner fa-spin mr-2 text-indigo-400"></i> Loading repositories...
            </div>
          ) : error ? (
            <div className="p-4 bg-rose-500/10 border border-rose-500/20 rounded-xl text-rose-400 text-sm">
              {error}
            </div>
          ) : repositories.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-12 bg-[#101524] border border-dashed border-[#232a3f] rounded-2xl text-center">
              <div className="w-16 h-16 rounded-2xl bg-[#161c2d] border border-[#232a3f] flex items-center justify-center mb-4">
                <i className="fa-brands fa-github text-3xl text-slate-400"></i>
              </div>
              <h3 className="text-base font-bold text-white mb-1.5">No repositories in DEVHUB yet</h3>
              <p className="text-xs text-slate-400 mb-6 max-w-md leading-relaxed">
                Connect your GitHub account to import repositories with one click, or add repository URLs manually to track branches, pull requests, and deployment status.
              </p>
              <div className="flex gap-3">
                {githubStatus.connected ? (
                  <button 
                    onClick={openImportModal}
                    className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold transition flex items-center gap-2 shadow-lg shadow-indigo-900/30"
                  >
                    <i className="fa-solid fa-cloud-arrow-down"></i> Import Repositories
                  </button>
                ) : (
                  <button 
                    onClick={() => setShowConnectModal(true)}
                    className="px-5 py-2.5 bg-purple-600 hover:bg-purple-500 text-white rounded-xl text-xs font-bold transition flex items-center gap-2 shadow-lg shadow-purple-900/30"
                  >
                    <i className="fa-brands fa-github"></i> Connect GitHub Account
                  </button>
                )}
                <button 
                  onClick={() => handleOpenModal('create')}
                  className="px-4 py-2.5 bg-[#1e263d] hover:bg-[#2b3552] text-slate-300 rounded-xl text-xs font-semibold transition"
                >
                  Add Manually
                </button>
              </div>
            </div>
          ) : filteredRepositories.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-400 bg-[#0f1422] border border-[#192238] rounded-2xl">
              No repositories match your search query "{repoSearch}".
            </div>
          ) : (
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
              {filteredRepositories.map(repo => {
                const isSyncing = syncingRepoId === repo.id;
                const projectName = getProjectName(repo.projectId);

                return (
                  <div 
                    key={repo.id} 
                    className="bg-[#101524] border border-[#192238] rounded-2xl p-5 flex flex-col justify-between gap-4 hover:border-[#2a3754] transition shadow-sm"
                  >
                    <div>
                      {/* Top Row: Repository Name, Visibility & Action Controls */}
                      <div className="flex justify-between items-start gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="text-white font-bold text-base flex items-center gap-2 truncate" title={`${repo.owner}/${repo.name}`}>
                              <i className="fa-brands fa-github text-slate-400"></i>
                              <span>{repo.owner}/{repo.name}</span>
                            </h3>

                            {/* Public / Private Badge */}
                            {repo.isPrivate ? (
                              <span className="px-2 py-0.5 rounded text-[9px] font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20 flex items-center gap-1">
                                <i className="fa-solid fa-lock text-[8px]"></i> Private
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded text-[9px] font-bold bg-slate-800 text-slate-300 border border-slate-700 flex items-center gap-1">
                                <i className="fa-solid fa-globe text-[8px]"></i> Public
                              </span>
                            )}
                          </div>

                          <a 
                            href={repo.url} 
                            target="_blank" 
                            rel="noreferrer" 
                            className="text-xs text-indigo-400 hover:underline mt-1 inline-flex items-center gap-1 truncate max-w-md"
                          >
                            {repo.url} <i className="fa-solid fa-arrow-up-right-from-square text-[9px]"></i>
                          </a>
                        </div>
                        
                        {/* Action buttons: Refresh/Sync, Edit, Remove */}
                        <div className="flex items-center gap-1.5 shrink-0">
                          <button 
                            onClick={() => handleSyncRepo(repo.id)} 
                            disabled={isSyncing}
                            title="Refresh stats and branch from GitHub"
                            className="text-slate-400 hover:text-white hover:bg-[#1a2336] p-1.5 rounded-lg transition disabled:opacity-50"
                          >
                            <i className={`fa-solid fa-rotate text-xs ${isSyncing ? 'fa-spin text-indigo-400' : ''}`}></i>
                          </button>
                          {canEdit(repo) && (
                            <button 
                              onClick={() => handleOpenModal('edit', repo)} 
                              title="Edit repository or project association"
                              className="text-slate-400 hover:text-white hover:bg-[#1a2336] p-1.5 rounded-lg transition"
                            >
                              <i className="fa-solid fa-pen text-xs"></i>
                            </button>
                          )}
                          {canDelete(repo) && (
                            <button 
                              onClick={() => handleDelete(repo.id)} 
                              title="Remove repository from DEVHUB"
                              className="text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 p-1.5 rounded-lg transition"
                            >
                              <i className="fa-solid fa-trash text-xs"></i>
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Description */}
                      {repo.description && (
                        <p className="text-xs text-slate-400 mt-2 line-clamp-2 leading-relaxed">
                          {repo.description}
                        </p>
                      )}
                    </div>

                    {/* Metadata Chips: Project, Language, Stars, Forks, Last Updated */}
                    <div className="pt-3 border-t border-[#192238] flex flex-col gap-3">
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        {/* Project Association */}
                        <span 
                          className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#161c2d] border border-[#232a3f] text-slate-300"
                          title="DEVHUB Project Association"
                        >
                          <i className="fa-regular fa-folder text-indigo-400 text-[10px]"></i> 
                          <span className="text-[11px] font-semibold">{projectName}</span>
                        </span>

                        {/* Default Branch */}
                        <span className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#161c2d] border border-[#232a3f] text-slate-300">
                          <i className="fa-solid fa-code-branch text-purple-400 text-[10px]"></i> 
                          <span className="text-[11px] font-medium">{repo.defaultBranch || 'main'}</span>
                        </span>

                        {/* Language */}
                        {repo.language && (
                          <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#161c2d] border border-[#232a3f] text-slate-300 text-[11px]">
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-400"></span>
                            {repo.language}
                          </span>
                        )}

                        {/* Stars */}
                        <span className="flex items-center gap-1 px-2 py-1 rounded-lg bg-[#161c2d] text-slate-400 text-[11px]" title="Stars on GitHub">
                          <i className="fa-solid fa-star text-amber-400 text-[10px]"></i> {repo.starsCount || 0}
                        </span>

                        {/* Forks */}
                        <span className="flex items-center gap-1 px-2 py-1 rounded-lg bg-[#161c2d] text-slate-400 text-[11px]" title="Forks on GitHub">
                          <i className="fa-solid fa-code-fork text-slate-400 text-[10px]"></i> {repo.forksCount || 0}
                        </span>
                      </div>

                      {/* Quick Links & Last Updated */}
                      <div className="flex items-center justify-between text-xs pt-1 text-slate-400">
                        <div className="flex gap-4">
                          <Link 
                            to="/pull-requests" 
                            className="hover:text-indigo-400 transition flex items-center gap-1 font-medium"
                          >
                            <i className="fa-solid fa-code-pull-request text-[11px]"></i> Pull Requests
                          </Link>
                          <Link 
                            to="/deployments" 
                            className="hover:text-indigo-400 transition flex items-center gap-1 font-medium"
                          >
                            <i className="fa-solid fa-rocket text-[11px]"></i> Deployments
                          </Link>
                        </div>

                        {repo.pushedAt && (
                          <span className="text-[10px] text-slate-500">
                            Last updated {new Date(repo.pushedAt).toLocaleDateString()}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Connect GitHub Account Modal */}
      {showConnectModal && (
        <Modal open={showConnectModal} onClose={() => setShowConnectModal(false)} className="max-w-md p-6">
          <div className="flex items-center justify-between pb-3 border-b border-[#1f2a44] mb-4">
            <h2 className="text-base text-white font-bold flex items-center gap-2">
              <i className="fa-brands fa-github text-purple-400"></i> Connect GitHub Account
            </h2>
            <button onClick={() => setShowConnectModal(false)} className="text-slate-400 hover:text-white transition">
              <i className="fa-solid fa-xmark"></i>
            </button>
          </div>

          <form onSubmit={handleConnectGitHub} className="space-y-4">
            <div className="text-xs text-slate-400 bg-[#161d2f] border border-[#1f2a44] p-3.5 rounded-xl space-y-1">
              <p className="font-semibold text-white">Secure Server-Side Authentication</p>
              <p className="text-[11px] leading-relaxed">
                Connect your personal GitHub account. Provide a GitHub Personal Access Token (classic or fine-grained with <code className="text-purple-300">repo</code> scope) for private repo access, or enter your GitHub username for public repositories.
              </p>
            </div>

            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                GitHub Personal Access Token <span className="text-purple-400 font-semibold">(Recommended)</span>
              </label>
              <input
                type="password"
                placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
                value={connectForm.token}
                onChange={e => setConnectForm({ ...connectForm, token: e.target.value })}
                className="w-full bg-[#161d2f] border border-[#1f2a44] rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500 transition"
              />
              <p className="text-[10px] text-slate-500 mt-1">
                Your token is stored safely in PostgreSQL and never sent to other users or browsers.
              </p>
            </div>

            <div className="relative flex py-1 items-center">
              <div className="flex-grow border-t border-[#1f2a44]"></div>
              <span className="flex-shrink mx-3 text-slate-500 text-[10px] uppercase font-bold">Or Public Only</span>
              <div className="flex-grow border-t border-[#1f2a44]"></div>
            </div>

            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                GitHub Username
              </label>
              <input
                type="text"
                placeholder="e.g. torvalds"
                value={connectForm.username}
                onChange={e => setConnectForm({ ...connectForm, username: e.target.value })}
                className="w-full bg-[#161d2f] border border-[#1f2a44] rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500 transition"
              />
            </div>

            <div className="flex justify-end gap-3 pt-3 border-t border-[#1f2a44]">
              <button
                type="button"
                disabled={connecting}
                onClick={() => setShowConnectModal(false)}
                className="px-4 py-2 text-slate-300 text-xs font-bold hover:text-white hover:bg-[#1a2333] rounded-lg transition"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={connecting || (!connectForm.token.trim() && !connectForm.username.trim())}
                className="px-5 py-2 bg-[#5922cf] hover:bg-[#682ae6] text-white rounded-lg text-xs font-bold shadow-lg shadow-purple-900/30 transition flex items-center gap-2 disabled:opacity-50"
              >
                {connecting && <i className="fa-solid fa-spinner fa-spin"></i>}
                Connect GitHub
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Import Repositories Modal */}
      {showImportModal && (
        <Modal open={showImportModal} onClose={() => setShowImportModal(false)} className="max-w-2xl p-6">
          <div className="flex items-center justify-between pb-3 border-b border-[#1f2a44] mb-4">
            <div>
              <h2 className="text-base text-white font-bold flex items-center gap-2">
                <i className="fa-solid fa-cloud-arrow-down text-indigo-400"></i> Import Repositories
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Select repositories from your connected GitHub account (<span className="text-purple-400 font-semibold">@{githubStatus.username}</span>)
              </p>
            </div>
            <button onClick={() => setShowImportModal(false)} className="text-slate-400 hover:text-white transition">
              <i className="fa-solid fa-xmark"></i>
            </button>
          </div>

          <form onSubmit={handleImportSubmit} className="space-y-4">
            {/* Project association selector */}
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="flex-1">
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                  Associate with DEVHUB Project <span className="text-slate-500 font-normal">(Optional)</span>
                </label>
                <select
                  value={importProjectId}
                  onChange={e => setImportProjectId(e.target.value)}
                  className="w-full bg-[#161d2f] border border-[#1f2a44] rounded-xl px-4 py-2 text-xs font-semibold text-white focus:outline-none focus:border-indigo-500"
                >
                  <option value="">Personal / No Project</option>
                  {projects.map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>

              <div className="flex-1">
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                  Filter Repositories
                </label>
                <div className="relative">
                  <i className="fa-solid fa-search absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-xs"></i>
                  <input
                    type="text"
                    placeholder="Search by name or description..."
                    value={importSearch}
                    onChange={e => setImportSearch(e.target.value)}
                    className="w-full bg-[#161d2f] border border-[#1f2a44] rounded-xl pl-8 pr-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>
            </div>

            {/* Repositories List with Checkboxes */}
            <div className="border border-[#1f2a44] rounded-xl max-h-72 overflow-y-auto divide-y divide-[#1f2a44] bg-[#0c101d]">
              {importLoading ? (
                <div className="p-8 text-center text-xs text-slate-400">
                  <i className="fa-solid fa-spinner fa-spin mr-2"></i> Loading repositories from GitHub...
                </div>
              ) : filteredImportRepos.length === 0 ? (
                <div className="p-8 text-center text-xs text-slate-400">
                  No repositories found matching your search.
                </div>
              ) : (
                filteredImportRepos.map(repo => {
                  const isSelected = selectedRepoIds.has(repo.id);
                  const isAlreadyConnected = repositories.some(r => r.name.toLowerCase() === repo.name.toLowerCase() && r.owner.toLowerCase() === repo.owner.toLowerCase());

                  return (
                    <div 
                      key={repo.id}
                      onClick={() => toggleSelectRepo(repo.id)}
                      className={`p-3.5 flex items-start gap-3 cursor-pointer transition ${
                        isSelected ? 'bg-indigo-950/30' : 'hover:bg-[#141b2c]'
                      }`}
                    >
                      <input 
                        type="checkbox" 
                        checked={isSelected}
                        onChange={() => {}} 
                        className="mt-1 rounded bg-[#161d2f] border-[#293552] text-indigo-500 focus:ring-0 cursor-pointer"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-white truncate">
                            {repo.fullName || `${repo.owner}/${repo.name}`}
                          </span>
                          {repo.isPrivate ? (
                            <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20 font-semibold">
                              Private
                            </span>
                          ) : (
                            <span className="text-[9px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 font-semibold">
                              Public
                            </span>
                          )}
                          {isAlreadyConnected && (
                            <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 font-semibold">
                              Connected
                            </span>
                          )}
                        </div>

                        {repo.description && (
                          <p className="text-[11px] text-slate-400 truncate mt-0.5">
                            {repo.description}
                          </p>
                        )}

                        <div className="flex items-center gap-3 text-[10px] text-slate-500 mt-1">
                          {repo.language && <span>{repo.language}</span>}
                          <span><i className="fa-solid fa-star text-amber-400 text-[9px]"></i> {repo.starsCount}</span>
                          <span><i className="fa-solid fa-code-fork text-[9px]"></i> {repo.forksCount}</span>
                          <span>Branch: {repo.defaultBranch}</span>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            <div className="flex items-center justify-between pt-3 border-t border-[#1f2a44]">
              <span className="text-xs text-slate-400 font-medium">
                {selectedRepoIds.size} {selectedRepoIds.size === 1 ? 'repository' : 'repositories'} selected
              </span>

              <div className="flex gap-3">
                <button
                  type="button"
                  disabled={importing}
                  onClick={() => setShowImportModal(false)}
                  className="px-4 py-2 text-slate-300 text-xs font-bold hover:text-white hover:bg-[#1a2333] rounded-lg transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={importing || selectedRepoIds.size === 0}
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-bold shadow-lg shadow-indigo-900/30 transition flex items-center gap-2 disabled:opacity-50"
                >
                  {importing && <i className="fa-solid fa-spinner fa-spin"></i>}
                  Import {selectedRepoIds.size > 0 ? `(${selectedRepoIds.size})` : ''}
                </button>
              </div>
            </div>
          </form>
        </Modal>
      )}

      {/* Manual Connect / Edit Repository Modal */}
      {showModal && (
        <Modal open={showModal} onClose={() => setShowModal(false)} className="max-w-md overflow-hidden">
          <div className="px-6 py-4 border-b border-[#1b2234] flex justify-between items-center bg-[#171c2a]">
            <h3 className="text-base font-bold text-white">
              {modalMode === 'create' ? 'Add Repository' : 'Edit Repository'}
            </h3>
            <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-white transition">
              <i className="fa-solid fa-xmark text-lg"></i>
            </button>
          </div>
          
          <form onSubmit={handleSubmit} className="p-6 space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">Project Association</label>
              <select
                value={formData.projectId}
                onChange={(e) => setFormData({...formData, projectId: e.target.value})}
                className="w-full bg-[#0b0f19] border border-[#1b2234] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
              >
                <option value="">Personal / Unassigned</option>
                {projects.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">Owner / Organization <span className="text-red-500">*</span></label>
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
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">Repository Name <span className="text-red-500">*</span></label>
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
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">URL <span className="text-red-500">*</span></label>
              <input
                required
                type="url"
                placeholder="https://github.com/facebook/react"
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

            <div className="pt-4 flex justify-end gap-3 border-t border-[#1b2234]">
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="px-4 py-2 bg-transparent border border-[#2d364f] hover:bg-[#1b2234] text-white rounded-lg text-xs font-semibold transition"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-5 py-2 bg-[#5922cf] hover:bg-[#682ae6] text-white rounded-lg text-xs font-semibold transition"
              >
                Save Repository
              </button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
