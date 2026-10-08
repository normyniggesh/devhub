import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { apiClient } from '../api/client';
import { useStore } from '../store';
import { formatSize } from '../utils/formatting';
import CompactPageHeader from '../components/common/CompactPageHeader';
import StorageUsage from '../components/files/StorageUsage';
import ActivityFeed from '../components/activity/ActivityFeed';
import Modal from '../components/common/Modal';
import ConfirmDialog from '../components/common/ConfirmDialog';
import { useClickOutside } from '../hooks/useClickOutside';

export default function Files({ projectId: forcedProjectId }) {
  const [searchParams] = useSearchParams();
  const initialProjectId = forcedProjectId || searchParams.get('projectId') || null;

  const { currentUser } = useStore();
  const navigate = useNavigate();
  const [folders, setFolders] = useState([]);
  const [files, setFiles] = useState([]);
  const [userTeams, setUserTeams] = useState([]);
  const [selectedTeamId, setSelectedTeamId] = useState(null);
  const [recentActivity, setRecentActivity] = useState([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Active navigation tab
  // 'My Cloud Storage' (PERSONAL) | 'Team Cloud Storage' (TEAM) | 'All Files'
  const [activeTab, setActiveTab] = useState(initialProjectId ? 'All Files' : 'My Cloud Storage');
  const [viewMode, setViewMode] = useState('list'); // 'list' | 'grid'
  const [searchQuery, setSearchQuery] = useState('');
  const [sortConfig, setSortConfig] = useState({ key: 'updatedAt', direction: 'desc' });

  // Navigation state for folders
  const [currentFolderId, setCurrentFolderId] = useState(null);
  const [folderHistory, setFolderHistory] = useState([]); // [{id, name}]

  // Storage Quota State (authoritative backend quotas)
  const [quotas, setQuotas] = useState({});
  const [quotasLoading, setQuotasLoading] = useState(false);

  // Drag and Drop & Upload State
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [statusBanner, setStatusBanner] = useState(null); // { type: 'success'|'error', message }

  // Modals state
  const [showFolderModal, setShowFolderModal] = useState(false);
  const [editingFolder, setEditingFolder] = useState(null);
  const [folderForm, setFolderForm] = useState({ name: '' });
  const [folderSubmitting, setFolderSubmitting] = useState(false);

  const [showFileModal, setShowFileModal] = useState(false);
  const [editingFile, setEditingFile] = useState(null);
  const [fileForm, setFileForm] = useState({ name: '' });
  const [fileSubmitting, setFileSubmitting] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState(null);

  const [confirmDelete, setConfirmDelete] = useState(null); // { type: 'file'|'folder', id, name }
  const [deleting, setDeleting] = useState(false);

  // Sharing State
  const [shareModal, setShareModal] = useState({ open: false, type: 'file', resource: null });
  const [shareList, setShareList] = useState([]);
  const [shareLoading, setShareLoading] = useState(false);
  const [shareSubmitting, setShareSubmitting] = useState(false);
  const [shareTargetUser, setShareTargetUser] = useState('');
  const [sharePermission, setSharePermission] = useState('VIEW');
  const [shareError, setShareError] = useState(null);
  const [shareSuccess, setShareSuccess] = useState(null);

  const [openMenuId, setOpenMenuId] = useState(null);
  const menuRef = useRef(null);
  useClickOutside(menuRef, () => setOpenMenuId(null));
  const fileInputRef = useRef(null);

  // Current selected team object
  const selectedTeam = useMemo(() => {
    return userTeams.find(t => t.id === selectedTeamId) || null;
  }, [userTeams, selectedTeamId]);

  // Authorization checks
  const canManageCurrentTeam = useMemo(() => {
    if (!selectedTeam) return false;
    if (currentUser?.role === 'Admin') return true;
    return selectedTeam.myRole === 'Leader';
  }, [selectedTeam, currentUser]);

  const canUploadOrAddFolder = useMemo(() => {
    if (activeTab === 'Shared with Me') return Boolean(currentFolderId);
    if (activeTab === 'My Cloud Storage') return true;
    if (activeTab === 'Team Cloud Storage') return canManageCurrentTeam;
    return true;
  }, [activeTab, canManageCurrentTeam, currentFolderId]);

  // 1. Fetch authoritative Quotas
  const fetchQuotas = useCallback(async (teamIdOverride) => {
    try {
      setQuotasLoading(true);
      const targetTeamId = teamIdOverride !== undefined ? teamIdOverride : selectedTeamId;
      const queryUrl = `/integrations/quota${targetTeamId ? `?teamId=${targetTeamId}` : ''}`;
      const res = await apiClient(queryUrl).catch(() => ({ quotas: {} }));
      setQuotas(res?.quotas || {});
    } catch (err) {
      console.warn('Could not fetch storage quotas:', err);
    } finally {
      setQuotasLoading(false);
    }
  }, [selectedTeamId]);

  // 2. Fetch Teams for current user
  const fetchTeams = useCallback(async () => {
    try {
      const res = await apiClient('/team/list').catch(() => ({ teams: [] }));
      const loadedTeams = res.teams || [];
      setUserTeams(loadedTeams);
      if (loadedTeams.length > 0 && !selectedTeamId) {
        setSelectedTeamId(loadedTeams[0].id);
      }
      return loadedTeams;
    } catch (err) {
      console.warn('Could not fetch user teams:', err);
      return [];
    }
  }, [selectedTeamId]);

  // 3. Load Storage Contents (folders and files according to active scope and folder)
  const loadContents = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      let folderQuery = '/folders?';
      let fileQuery = '/files?';

      if (activeTab === 'My Cloud Storage') {
        folderQuery += 'scope=PERSONAL';
        fileQuery += 'scope=PERSONAL';
      } else if (activeTab === 'Shared with Me') {
        folderQuery += 'shared=true';
        fileQuery += 'shared=true';
      } else if (activeTab === 'Team Cloud Storage') {
        if (!selectedTeamId) {
          setFolders([]);
          setFiles([]);
          setLoading(false);
          return;
        }
        folderQuery += `teamId=${encodeURIComponent(selectedTeamId)}`;
        fileQuery += `teamId=${encodeURIComponent(selectedTeamId)}`;
      } else {
        // All Files
        folderQuery += 'scope=ALL';
        fileQuery += 'scope=ALL';
      }

      if (currentFolderId) {
        folderQuery += `&parentId=${encodeURIComponent(currentFolderId)}`;
        fileQuery += `&folderId=${encodeURIComponent(currentFolderId)}`;
      } else {
        folderQuery += '&parentId=null';
        fileQuery += '&folderId=null';
      }

      const [foldRes, fileRes, dashRes] = await Promise.all([
        apiClient(folderQuery).catch(() => ({ folders: [] })),
        apiClient(fileQuery).catch(() => ({ files: [] })),
        apiClient('/dashboard').catch(() => ({ dashboard: { recentActivity: [] } }))
      ]);

      let finalFolders = foldRes.folders || [];
      let finalFiles = fileRes.files || [];
      
      if (initialProjectId) {
        finalFolders = finalFolders.filter(f => f.projectId === initialProjectId);
        finalFiles = finalFiles.filter(f => f.projectId === initialProjectId);
      }
      
      setFolders(finalFolders);
      setFiles(finalFiles);

      const allAct = dashRes.dashboard?.recentActivity || [];
      setRecentActivity(allAct.filter(a => a.entityType === 'File' || a.entityType === 'Folder'));

      await fetchQuotas();
    } catch (err) {
      console.error('loadContents error:', err);
      setError(err.message || 'Unable to load storage contents');
    } finally {
      setLoading(false);
    }
  }, [activeTab, selectedTeamId, currentFolderId, fetchQuotas]);

  // Initial load
  useEffect(() => {
    (async () => {
      const teams = await fetchTeams();
      if (teams.length > 0 && !selectedTeamId) {
        setSelectedTeamId(teams[0].id);
      }
    })();
  }, [fetchTeams]);

  useEffect(() => {
    loadContents();
  }, [loadContents]);

  // When selectedTeamId changes, re-fetch quotas
  useEffect(() => {
    if (selectedTeamId) {
      fetchQuotas(selectedTeamId);
    }
  }, [selectedTeamId, fetchQuotas]);

  // Navigation handlers
  const handleOpenFolder = (folder) => {
    setFolderHistory(prev => [...prev, { id: folder.id, name: folder.name }]);
    setCurrentFolderId(folder.id);
    setSearchQuery('');
  };

  const handleGoRoot = () => {
    setFolderHistory([]);
    setCurrentFolderId(null);
  };

  const handleBreadcrumbClick = (index) => {
    if (index < 0) {
      handleGoRoot();
      return;
    }
    const target = folderHistory[index];
    setFolderHistory(prev => prev.slice(0, index + 1));
    setCurrentFolderId(target.id);
  };

  // Upload implementation (Direct to Backend DEVHUB Cloud Storage)
  const handleUploadFiles = async (fileList) => {
    if (!fileList || fileList.length === 0) return;

    if (activeTab === 'Team Cloud Storage' && !canManageCurrentTeam) {
      setStatusBanner({
        type: 'error',
        message: 'Permission denied: Only Team Leaders or Admins can upload files to Team Storage.'
      });
      return;
    }

    try {
      setUploading(true);
      setUploadProgress(10);
      setStatusBanner(null);

      const formData = new FormData();
      if (activeTab === 'Team Cloud Storage') {
        formData.append('scope', 'TEAM');
        formData.append('teamId', selectedTeamId);
      } else {
        formData.append('scope', 'PERSONAL');
      }

      if (currentFolderId) {
        formData.append('folderId', currentFolderId);
      }

      for (let i = 0; i < fileList.length; i++) {
        formData.append('files', fileList[i]);
      }

      setUploadProgress(50);
      const res = await apiClient('/files/upload', {
        method: 'POST',
        body: formData
      });

      setUploadProgress(100);
      setStatusBanner({
        type: 'success',
        message: `${fileList.length} file(s) successfully uploaded to DEVHUB Cloud Storage.`
      });

      await loadContents();
      await fetchQuotas();
    } catch (err) {
      console.error('Upload Error:', err);
      let errMsg = err.message || 'Upload failed.';
      if (errMsg.includes('quota') || errMsg.includes('Quota')) {
        errMsg = `Storage quota exceeded: ${errMsg}`;
      } else if (errMsg.includes('capacity') || errMsg.includes('threshold')) {
        errMsg = `System storage capacity limit reached: ${errMsg}`;
      }
      setStatusBanner({
        type: 'error',
        message: errMsg
      });
    } finally {
      setUploading(false);
      setUploadProgress(0);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // Save Folder (create or rename)
  const handleSaveFolder = async (e) => {
    e.preventDefault();
    if (!folderForm.name.trim()) return;

    setFolderSubmitting(true);
    setStatusBanner(null);
    try {
      if (editingFolder) {
        await apiClient(`/folders/${editingFolder.id}`, {
          method: 'PATCH',
          body: { name: folderForm.name.trim() }
        });
        setStatusBanner({ type: 'success', message: `Folder renamed to "${folderForm.name.trim()}".` });
      } else {
        const payload = {
          name: folderForm.name.trim(),
          parentId: currentFolderId || null
        };
        if (activeTab === 'Team Cloud Storage') {
          payload.scope = 'TEAM';
          payload.teamId = selectedTeamId;
        } else {
          payload.scope = 'PERSONAL';
        }

        await apiClient('/folders', {
          method: 'POST',
          body: payload
        });
        setStatusBanner({ type: 'success', message: `Folder "${folderForm.name.trim()}" created successfully.` });
      }

      setShowFolderModal(false);
      setFolderForm({ name: '' });
      setEditingFolder(null);
      await loadContents();
    } catch (err) {
      setStatusBanner({ type: 'error', message: err.message || 'Failed to save folder.' });
    } finally {
      setFolderSubmitting(false);
    }
  };

  // Save File (Rename)
  const handleSaveFile = async (e) => {
    e.preventDefault();
    if (editingFile) {
      setFileSubmitting(true);
      setStatusBanner(null);
      try {
        await apiClient(`/files/${editingFile.id}`, {
          method: 'PATCH',
          body: { name: fileForm.name.trim() }
        });
        setStatusBanner({ type: 'success', message: `File renamed to "${fileForm.name.trim()}".` });
        setShowFileModal(false);
        setEditingFile(null);
        await loadContents();
      } catch (err) {
        setStatusBanner({ type: 'error', message: err.message || 'Failed to rename file.' });
      } finally {
        setFileSubmitting(false);
      }
    } else {
      if (selectedFiles && selectedFiles.length > 0) {
        setShowFileModal(false);
        await handleUploadFiles(selectedFiles);
        setSelectedFiles(null);
      }
    }
  };

  // Download File (Direct stream download)
  const handleDownloadFile = async (e, file) => {
    e.stopPropagation();
    try {
      const res = await apiClient(`/files/${file.id}/download`);
      if (res.url) {
        const token = localStorage.getItem('token');
        const apiBase = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';
        const fullUrl = res.url.startsWith('http')
          ? res.url
          : `${apiBase.replace(/\/api$/, '')}${res.url}${token ? `&token=${encodeURIComponent(token)}` : ''}`;

        const link = document.createElement('a');
        link.href = fullUrl;
        link.setAttribute('download', file.name || 'download');
        link.setAttribute('target', '_blank');
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      }
    } catch (err) {
      setStatusBanner({ type: 'error', message: err.message || 'Download failed' });
    }
  };

  // Execute Deletion
  const handleExecuteDelete = async () => {
    if (!confirmDelete) return;
    try {
      setDeleting(true);
      setStatusBanner(null);
      if (confirmDelete.type === 'folder') {
        await apiClient(`/folders/${confirmDelete.id}`, { method: 'DELETE' });
        setStatusBanner({ type: 'success', message: `Folder "${confirmDelete.name}" deleted.` });
      } else {
        await apiClient(`/files/${confirmDelete.id}`, { method: 'DELETE' });
        setStatusBanner({ type: 'success', message: `File "${confirmDelete.name}" deleted.` });
      }
      setConfirmDelete(null);
      await loadContents();
      await fetchQuotas();
    } catch (err) {
      setStatusBanner({ type: 'error', message: err.message || 'Failed to delete item.' });
    } finally {
      setDeleting(false);
    }
  };

  // Sharing Handlers
  const handleOpenShareModal = async (type, resource) => {
    setShareModal({ open: true, type, resource });
    setShareTargetUser('');
    setSharePermission('VIEW');
    setShareError(null);
    setShareSuccess(null);
    await loadShares(type, resource.id);
  };

  const loadShares = async (type, id) => {
    try {
      setShareLoading(true);
      const endpoint = type === 'folder' ? `/folders/${id}/shares` : `/files/${id}/shares`;
      const res = await apiClient(endpoint);
      setShareList(res?.shares || []);
    } catch (err) {
      console.warn('Could not load shares:', err);
      setShareList([]);
    } finally {
      setShareLoading(false);
    }
  };

  const handleCreateShare = async (e) => {
    e.preventDefault();
    if (!shareTargetUser.trim()) return;
    setShareSubmitting(true);
    setShareError(null);
    setShareSuccess(null);

    try {
      const endpoint = shareModal.type === 'folder'
        ? `/folders/${shareModal.resource.id}/share`
        : `/files/${shareModal.resource.id}/share`;

      await apiClient(endpoint, {
        method: 'POST',
        body: {
          targetUser: shareTargetUser.trim(),
          permission: sharePermission
        }
      });

      setShareSuccess(`Shared successfully with ${shareTargetUser.trim()} as ${sharePermission}`);
      setShareTargetUser('');
      await loadShares(shareModal.type, shareModal.resource.id);
      await loadContents();
    } catch (err) {
      setShareError(err.message || 'Failed to share resource');
    } finally {
      setShareSubmitting(false);
    }
  };

  const handleRevokeShare = async (targetUserId) => {
    try {
      setShareError(null);
      setShareSuccess(null);
      const endpoint = shareModal.type === 'folder'
        ? `/folders/${shareModal.resource.id}/shares/${targetUserId}`
        : `/files/${shareModal.resource.id}/shares/${targetUserId}`;

      await apiClient(endpoint, { method: 'DELETE' });
      setShareSuccess('Share access revoked successfully');
      await loadShares(shareModal.type, shareModal.resource.id);
      await loadContents();
    } catch (err) {
      setShareError(err.message || 'Failed to revoke share');
    }
  };

  // Filter and sort items
  const filteredFolders = useMemo(() => {
    if (!searchQuery.trim()) return folders;
    const q = searchQuery.toLowerCase();
    return folders.filter(f => f.name.toLowerCase().includes(q));
  }, [folders, searchQuery]);

  const filteredFiles = useMemo(() => {
    let result = [...files];
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(f =>
        f.name.toLowerCase().includes(q) ||
        (f.type && f.type.toLowerCase().includes(q))
      );
    }

    result.sort((a, b) => {
      let aVal = a[sortConfig.key];
      let bVal = b[sortConfig.key];
      if (sortConfig.key === 'updatedAt') {
        aVal = new Date(a.updatedAt || 0).getTime();
        bVal = new Date(b.updatedAt || 0).getTime();
      }
      if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });

    return result;
  }, [files, searchQuery, sortConfig]);

  const getFileIcon = (type) => {
    const t = (type || '').toLowerCase();
    if (t.includes('pdf')) return { icon: 'fa-solid fa-file-pdf', color: 'text-rose-400' };
    if (t.includes('doc')) return { icon: 'fa-solid fa-file-word', color: 'text-blue-400' };
    if (t.includes('xls') || t.includes('csv')) return { icon: 'fa-solid fa-file-excel', color: 'text-emerald-400' };
    if (t.includes('ppt')) return { icon: 'fa-solid fa-file-powerpoint', color: 'text-amber-400' };
    if (t.includes('png') || t.includes('jpg') || t.includes('jpeg') || t.includes('svg') || t.includes('fig')) return { icon: 'fa-solid fa-file-image', color: 'text-purple-400' };
    if (t.includes('zip') || t.includes('rar') || t.includes('tar') || t.includes('gz')) return { icon: 'fa-solid fa-file-zipper', color: 'text-yellow-400' };
    if (t.includes('video') || t.includes('mp4') || t.includes('mov')) return { icon: 'fa-solid fa-file-video', color: 'text-sky-400' };
    return { icon: 'fa-solid fa-file', color: 'text-slate-400' };
  };

  // Hero tabs config
  const heroTabs = [
    { id: 'My Cloud Storage', label: 'My Cloud Storage', icon: 'fa-solid fa-cloud' },
    { id: 'Shared with Me', label: 'Shared with Me', icon: 'fa-solid fa-user-group' },
    { id: 'Team Cloud Storage', label: 'Team Cloud Storage', icon: 'fa-solid fa-users' },
    { id: 'All Files', label: 'All Files', icon: 'fa-solid fa-folder-tree' }
  ];

  return (
    <div className="flex flex-col lg:flex-row gap-6 max-w-[1920px] mx-auto pb-12 min-h-screen">
      {/* Hidden file input for header upload button */}
      <input
        type="file"
        ref={fileInputRef}
        multiple
        className="hidden"
        onChange={(e) => {
          if (e.target.files?.length > 0) {
            handleUploadFiles(e.target.files);
          }
        }}
      />

      {/* Main Content Area */}
      <div className="flex-1 min-w-0 flex flex-col gap-5">
        
        {/* Compact Hero Header */}
        <CompactPageHeader
          title="DEVHUB Cloud Storage"
          subtitle="Secure, high-performance cloud file storage backed by DEVHUB."
          tabs={heroTabs}
          activeTab={activeTab}
          onTabChange={(tab) => {
            setActiveTab(tab);
            setCurrentFolderId(null);
            setFolderHistory([]);
            setSearchQuery('');
            setStatusBanner(null);
          }}
          actions={
            <>
              {/* Search Filter */}
              <div className="relative w-44 sm:w-56">
                <i className="fa-solid fa-magnifying-glass absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-xs"></i>
                <input
                  type="text"
                  placeholder="Filter files & folders..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-[#161d2f] border border-[#1f2a44] rounded-xl pl-8 pr-7 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                  >
                    <i className="fa-solid fa-xmark text-xs"></i>
                  </button>
                )}
              </div>

              {/* External Storage Nav Button */}
              <button
                type="button"
                onClick={() => navigate('/settings')}
                className="flex items-center gap-1.5 px-3 py-2 border rounded-xl text-xs font-bold transition shrink-0 bg-[#161d2f] hover:bg-[#1f2a44] text-slate-200 hover:text-white border-[#1f2a44]"
                title="Manage Connected External Storage (Google Drive, Dropbox, OneDrive)"
              >
                <i className="fa-solid fa-cloud text-xs text-indigo-400"></i>
                <span>External Storage</span>
              </button>

              {/* Upload Button */}
              <button
                type="button"
                disabled={!canUploadOrAddFolder || uploading}
                onClick={() => {
                  if (fileInputRef.current) {
                    fileInputRef.current.click();
                  }
                }}
                className={`flex items-center gap-1.5 px-3 py-2 border rounded-xl text-xs font-bold transition shrink-0 ${
                  canUploadOrAddFolder && !uploading
                    ? 'bg-[#161d2f] hover:bg-[#1f2a44] text-slate-200 hover:text-white border-[#1f2a44]'
                    : 'bg-[#121624] text-slate-500 border-[#1a2030] cursor-not-allowed opacity-60'
                }`}
                title={canUploadOrAddFolder ? 'Upload files' : 'Only Team Leaders or Admins can upload'}
              >
                {uploading ? (
                  <i className="fa-solid fa-spinner fa-spin text-xs text-indigo-400"></i>
                ) : (
                  <i className="fa-solid fa-arrow-up-from-bracket text-xs text-indigo-400"></i>
                )}
                <span>Upload</span>
              </button>

              {/* New Folder Button */}
              <button
                type="button"
                disabled={!canUploadOrAddFolder || uploading}
                onClick={() => {
                  setEditingFolder(null);
                  setFolderForm({ name: '' });
                  setShowFolderModal(true);
                }}
                className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold shadow-md transition shrink-0 ${
                  canUploadOrAddFolder && !uploading
                    ? 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-indigo-900/30 active:scale-95'
                    : 'bg-[#1e2538] text-slate-500 cursor-not-allowed opacity-60'
                }`}
                title={canUploadOrAddFolder ? 'Create a new folder' : 'Only Team Leaders or Admins can create folders'}
              >
                <i className="fa-solid fa-folder-plus text-xs"></i>
                <span>New Folder</span>
              </button>

              {/* Refresh Button */}
              <button
                type="button"
                onClick={() => {
                  loadContents();
                  fetchQuotas();
                }}
                className="w-8 h-8 flex items-center justify-center bg-[#161d2f] hover:bg-[#1f2a44] border border-[#1f2a44] text-slate-400 hover:text-white rounded-xl text-xs transition shrink-0"
                title="Refresh contents"
              >
                <i className="fa-solid fa-arrows-rotate text-xs"></i>
              </button>

              {/* View / List Toggle */}
              <div className="flex items-center bg-[#121828] border border-[#192238] rounded-xl p-1 shrink-0">
                <button
                  type="button"
                  onClick={() => setViewMode('list')}
                  className={`w-7 h-7 flex items-center justify-center rounded-lg transition ${
                    viewMode === 'list' ? 'bg-[#1f2a44] text-white shadow-sm' : 'text-slate-500 hover:text-white'
                  }`}
                  title="List view"
                >
                  <i className="fa-solid fa-list text-xs"></i>
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('grid')}
                  className={`w-7 h-7 flex items-center justify-center rounded-lg transition ${
                    viewMode === 'grid' ? 'bg-[#1f2a44] text-white shadow-sm' : 'text-slate-500 hover:text-white'
                  }`}
                  title="Grid view"
                >
                  <i className="fa-solid fa-border-all text-xs"></i>
                </button>
              </div>
            </>
          }
        />

        {/* Upload Progress Indicator Bar */}
        {uploading && (
          <div className="bg-[#121624] border border-indigo-500/30 rounded-xl p-3 flex flex-col gap-2 shadow-sm animate-pulse">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-indigo-300 flex items-center gap-2">
                <i className="fa-solid fa-cloud-arrow-up fa-bounce text-indigo-400"></i>
                <span>Uploading files to DEVHUB Cloud Storage...</span>
              </span>
              <span className="text-[11px] font-mono text-slate-400">{uploadProgress}%</span>
            </div>
            <div className="w-full bg-[#192238] rounded-full h-1.5 overflow-hidden">
              <div
                className="h-full bg-indigo-500 transition-all duration-300 rounded-full"
                style={{ width: `${Math.max(15, uploadProgress)}%` }}
              ></div>
            </div>
          </div>
        )}

        {/* Status / Alert Banner */}
        {statusBanner && (
          <div
            className={`px-4 py-3 rounded-xl text-xs flex items-center justify-between border transition ${
              statusBanner.type === 'success'
                ? 'bg-emerald-500/10 border-emerald-500/25 text-emerald-300'
                : 'bg-rose-500/10 border-rose-500/25 text-rose-300'
            }`}
          >
            <div className="flex items-center gap-2.5">
              <i
                className={`fa-solid ${
                  statusBanner.type === 'success'
                    ? 'fa-circle-check text-emerald-400'
                    : 'fa-circle-exclamation text-rose-400'
                }`}
              ></i>
              <span className="font-medium">{statusBanner.message}</span>
            </div>
            <button
              type="button"
              onClick={() => setStatusBanner(null)}
              className="text-slate-400 hover:text-white transition ml-3"
            >
              <i className="fa-solid fa-xmark"></i>
            </button>
          </div>
        )}

        {/* Team Selector & Role Badge Bar (Only visible when activeTab === 'Team Cloud Storage') */}
        {activeTab === 'Team Cloud Storage' && (
          userTeams.length === 0 ? (
            <div className="bg-[#0f1422] border border-dashed border-[#192238] rounded-2xl p-8 text-center flex flex-col items-center justify-center">
              <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center mb-3 text-amber-400">
                <i className="fa-solid fa-users-slash text-xl"></i>
              </div>
              <h3 className="text-sm font-bold text-white mb-1">No Teams Joined</h3>
              <p className="text-xs text-slate-400 max-w-md leading-relaxed">
                You are not currently a member of any teams. Team Cloud Storage provides 10 GB shared storage per team. Join or create a team to access shared team storage.
              </p>
            </div>
          ) : (
            <div className="bg-[#0f1422] border border-[#192238] rounded-xl px-4 py-3 flex flex-wrap items-center justify-between gap-3 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 shrink-0">
                  <i className="fa-solid fa-users text-sm"></i>
                </div>
                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                    Active Team Storage
                  </span>
                  <select
                    value={selectedTeamId || ''}
                    onChange={(e) => {
                      setSelectedTeamId(e.target.value);
                      setCurrentFolderId(null);
                      setFolderHistory([]);
                    }}
                    className="bg-[#161d2f] border border-[#1f2a44] rounded-lg px-2.5 py-1 text-xs font-semibold text-white focus:outline-none focus:border-indigo-500 cursor-pointer"
                  >
                    {userTeams.map(t => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-400">Access Level:</span>
                {canManageCurrentTeam ? (
                  <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center gap-1.5">
                    <i className="fa-solid fa-crown text-[10px]"></i>
                    <span>{currentUser?.role === 'Admin' ? 'Admin' : 'Team Leader'} (Full Management)</span>
                  </span>
                ) : (
                  <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-blue-500/10 border border-blue-500/20 text-blue-400 flex items-center gap-1.5">
                    <i className="fa-solid fa-eye text-[10px]"></i>
                    <span>Team Member (View & Download)</span>
                  </span>
                )}
              </div>
            </div>
          )
        )}

        {/* Breadcrumb Navigation Bar */}
        <div className="flex items-center gap-2 text-xs text-slate-400 bg-[#0f1422] border border-[#192238] px-4 py-2.5 rounded-xl font-medium">
          <button
            type="button"
            onClick={handleGoRoot}
            className={`hover:text-white transition flex items-center gap-1.5 ${
              folderHistory.length === 0 ? 'text-white font-bold' : ''
            }`}
          >
            <i className="fa-solid fa-house text-indigo-400 text-xs"></i>
            <span>
              {activeTab === 'Team Cloud Storage'
                ? (selectedTeam ? `${selectedTeam.name} Root` : 'Team Root')
                : activeTab === 'My Cloud Storage'
                ? 'My Storage Root'
                : 'All Files Root'}
            </span>
          </button>
          {folderHistory.map((h, i) => (
            <div key={h.id} className="flex items-center gap-2">
              <span className="text-slate-600">/</span>
              <button
                type="button"
                onClick={() => handleBreadcrumbClick(i)}
                className={`transition truncate max-w-[150px] ${
                  i === folderHistory.length - 1 ? 'text-white font-bold' : 'hover:text-white'
                }`}
              >
                {h.name}
              </button>
            </div>
          ))}
        </div>

        {/* Drag-and-Drop Dropzone Container & File Browser */}
        <div
          onDragOver={(e) => {
            e.preventDefault();
            e.stopPropagation();
            if (canUploadOrAddFolder && !isDragging) setIsDragging(true);
          }}
          onDragEnter={(e) => {
            e.preventDefault();
            e.stopPropagation();
            if (canUploadOrAddFolder) setIsDragging(true);
          }}
          onDragLeave={(e) => {
            e.preventDefault();
            e.stopPropagation();
            if (!e.currentTarget.contains(e.relatedTarget)) {
              setIsDragging(false);
            }
          }}
          onDrop={async (e) => {
            e.preventDefault();
            e.stopPropagation();
            setIsDragging(false);
            if (canUploadOrAddFolder && e.dataTransfer?.files?.length > 0) {
              await handleUploadFiles(e.dataTransfer.files);
            }
          }}
          className="relative flex flex-col gap-4 min-h-[350px]"
        >
          {/* Glassmorphic Drag Overlay */}
          {isDragging && (
            <div className="absolute inset-0 z-50 bg-[#0f1422]/90 border-2 border-dashed border-indigo-500 rounded-2xl flex flex-col items-center justify-center pointer-events-none backdrop-blur-sm">
              <i className="fa-solid fa-cloud-arrow-up text-4xl text-indigo-400 mb-2 animate-bounce"></i>
              <p className="text-sm font-bold text-white">Drop files here to upload</p>
              <p className="text-xs text-indigo-300 mt-1">
                Uploading to {activeTab === 'Team Cloud Storage' ? (selectedTeam?.name || 'Team Storage') : 'My Cloud Storage'}
              </p>
            </div>
          )}

          {/* Loading State */}
          {loading ? (
            <div className="flex flex-col items-center justify-center py-24 bg-[#0f1422] border border-[#192238] rounded-2xl">
              <i className="fa-solid fa-circle-notch fa-spin text-3xl text-indigo-500 mb-3"></i>
              <span className="text-xs font-semibold text-slate-400">Loading files...</span>
            </div>
          ) : error ? (
            <div className="p-8 text-center text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-2xl text-xs">
              <i className="fa-solid fa-triangle-exclamation text-2xl mb-2 block"></i>
              <p className="font-semibold">{error}</p>
              <button
                type="button"
                onClick={loadContents}
                className="mt-3 px-3 py-1.5 bg-[#192238] hover:bg-[#253250] text-white rounded-lg text-xs font-bold transition"
              >
                Retry
              </button>
            </div>
          ) : (
            <>
              {/* Folders Section */}
              {filteredFolders.length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-3 px-1">
                    <h2 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
                      <i className="fa-solid fa-folder text-indigo-400"></i>
                      <span>Folders ({filteredFolders.length})</span>
                    </h2>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3.5">
                    {filteredFolders.map(folder => {
                      const isMenuOpen = openMenuId === `folder_${folder.id}`;
                      const isTeamFolder = folder.storageScope === 'TEAM';
                      const canManageThisFolder = isTeamFolder ? canManageCurrentTeam : true;

                      return (
                        <div
                          key={folder.id}
                          onClick={() => handleOpenFolder(folder)}
                          className="group bg-[#0f1422] border border-[#192238] hover:border-[#283552] rounded-xl p-3.5 cursor-pointer transition shadow-sm relative flex items-center justify-between"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <i className="fa-solid fa-folder text-2xl text-indigo-400 group-hover:scale-105 transition-transform shrink-0"></i>
                            <div className="min-w-0">
                              <span className="text-xs font-bold text-white truncate flex items-center gap-1 group-hover:text-indigo-300 transition" title={folder.name}>
                                <span className="truncate">{folder.name}</span>
                                {folder.isShared && (
                                  <i className="fa-solid fa-user-group text-indigo-400 text-[10px] shrink-0" title="Shared folder"></i>
                                )}
                              </span>
                              <span className="text-[10px] text-slate-500 truncate block">
                                {folder.team?.name ? `${folder.team.name} (Team)` : 'Personal Folder'}
                              </span>
                            </div>
                          </div>

                          {/* Action Dropdown Menu */}
                          {canManageThisFolder && (
                            <div className="relative shrink-0" ref={isMenuOpen ? menuRef : null}>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setOpenMenuId(isMenuOpen ? null : `folder_${folder.id}`);
                                }}
                                className="w-7 h-7 flex items-center justify-center rounded text-slate-500 hover:text-white hover:bg-[#1a2333] transition opacity-0 group-hover:opacity-100"
                              >
                                <i className="fa-solid fa-ellipsis"></i>
                              </button>
                              {isMenuOpen && (
                                <div
                                  className="absolute right-0 top-full mt-1 w-32 bg-[#1f2638] rounded-xl shadow-xl border border-[#2d364f] z-50 overflow-hidden py-1"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setOpenMenuId(null);
                                      handleOpenFolder(folder);
                                    }}
                                    className="flex items-center gap-2 w-full px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#2a344a] text-left"
                                  >
                                    <i className="fa-solid fa-folder-open w-3 text-indigo-400"></i> Open
                                  </button>
                                  {!isTeamFolder && (folder.creatorId === currentUser?.id || currentUser?.role === 'Admin') && (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setOpenMenuId(null);
                                        handleOpenShareModal('folder', folder);
                                      }}
                                      className="flex items-center gap-2 w-full px-3 py-1.5 text-xs font-semibold text-indigo-300 hover:bg-[#2a344a] hover:text-white text-left"
                                    >
                                      <i className="fa-solid fa-share-nodes w-3 text-indigo-400"></i> Share
                                    </button>
                                  )}
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setOpenMenuId(null);
                                      setEditingFolder(folder);
                                      setFolderForm({ name: folder.name });
                                      setShowFolderModal(true);
                                    }}
                                    className="flex items-center gap-2 w-full px-3 py-1.5 text-xs font-semibold text-slate-300 hover:bg-[#2a344a] hover:text-white text-left"
                                  >
                                    <i className="fa-solid fa-pen w-3 text-slate-400"></i> Rename
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setOpenMenuId(null);
                                      setConfirmDelete({ type: 'folder', id: folder.id, name: folder.name });
                                    }}
                                    className="flex items-center gap-2 w-full px-3 py-1.5 text-xs font-semibold text-rose-400 hover:bg-rose-500/10 text-left border-t border-[#2d364f] mt-1 pt-1.5"
                                  >
                                    <i className="fa-solid fa-trash w-3"></i> Delete
                                  </button>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Files Section */}
              <div className="bg-[#0f1422] border border-[#192238] rounded-2xl shadow-sm overflow-hidden">
                <div className="py-3 px-4 bg-[#121828] border-b border-[#192238] flex items-center justify-between">
                  <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
                    <i className="fa-solid fa-file text-indigo-400"></i>
                    <span>Files ({filteredFiles.length})</span>
                  </h3>
                  <div className="flex items-center gap-2 text-xs text-slate-400">
                    <span>Sort by:</span>
                    <select
                      value={sortConfig.key}
                      onChange={(e) => setSortConfig(prev => ({ ...prev, key: e.target.value }))}
                      className="bg-[#161d2f] border border-[#1f2a44] rounded-lg px-2 py-1 text-xs text-white focus:outline-none"
                    >
                      <option value="updatedAt">Date Modified</option>
                      <option value="name">Name</option>
                      <option value="size">Size</option>
                    </select>
                  </div>
                </div>

                {filteredFiles.length === 0 ? (
                  <div className="py-16 text-center text-slate-400 text-xs">
                    <i className="fa-solid fa-box-open text-3xl text-slate-600 mb-2"></i>
                    <p className="font-semibold text-slate-300">No files in this folder</p>
                    <p className="text-[11px] text-slate-500 mt-1">
                      {canUploadOrAddFolder
                        ? 'Drag and drop files here or click Upload to get started.'
                        : 'No files uploaded to this team folder yet.'}
                    </p>
                  </div>
                ) : viewMode === 'list' ? (
                  <div className="overflow-y-auto max-h-[520px] hide-scrollbar">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="bg-[#121828]/50 border-b border-[#192238] text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                          <th className="py-2.5 px-4">Name</th>
                          <th className="py-2.5 px-4 hidden sm:table-cell">Scope</th>
                          <th className="py-2.5 px-4 hidden md:table-cell">Size</th>
                          <th className="py-2.5 px-4 hidden lg:table-cell">Modified</th>
                          <th className="py-2.5 px-4 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#192238]/60 text-slate-300">
                        {filteredFiles.map(file => {
                          const { icon, color } = getFileIcon(file.type);
                          const isTeamFile = file.storageScope === 'TEAM';
                          const canManageThisFile = isTeamFile
                            ? canManageCurrentTeam
                            : (file.uploaderId === currentUser?.id || currentUser?.role === 'Admin');

                          return (
                            <tr
                              key={file.id}
                              className="hover:bg-[#161d2f]/70 transition-colors group cursor-pointer"
                              onClick={(e) => handleDownloadFile(e, file)}
                            >
                              <td className="py-3 px-4">
                                <div className="flex items-center gap-3 min-w-0">
                                  <div className="w-8 h-8 rounded-lg bg-[#161d2f] border border-[#1f2a44] flex items-center justify-center shrink-0">
                                    <i className={`${icon} ${color} text-sm`}></i>
                                  </div>
                                  <div className="min-w-0">
                                    <span className="font-semibold text-white truncate flex items-center gap-1.5 group-hover:text-indigo-300 transition" title={file.name}>
                                      <span className="truncate">{file.name}</span>
                                      {file.isShared && (
                                        <i className="fa-solid fa-user-group text-indigo-400 text-[10px] shrink-0" title="Shared file"></i>
                                      )}
                                    </span>
                                    <span className="text-[10px] text-slate-500 uppercase sm:hidden">
                                      {formatSize(file.size)}
                                    </span>
                                  </div>
                                </div>
                              </td>
                              <td className="py-3 px-4 hidden sm:table-cell text-xs">
                                {isTeamFile ? (
                                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/10 border border-amber-500/20 text-amber-400">
                                    {file.team?.name || 'Team'}
                                  </span>
                                ) : (
                                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-500/10 border border-indigo-500/20 text-indigo-300">
                                    Personal
                                  </span>
                                )}
                              </td>
                              <td className="py-3 px-4 hidden md:table-cell font-mono text-slate-300 text-xs">
                                {formatSize(file.size)}
                              </td>
                              <td className="py-3 px-4 hidden lg:table-cell text-slate-400 text-xs">
                                {new Date(file.updatedAt).toLocaleDateString()}
                              </td>
                              <td className="py-3 px-4 text-right" onClick={(e) => e.stopPropagation()}>
                                <div className="flex items-center justify-end gap-1.5">
                                  <button
                                    type="button"
                                    onClick={(e) => handleDownloadFile(e, file)}
                                    title="Download file"
                                    className="w-7 h-7 flex items-center justify-center rounded text-slate-400 hover:text-white hover:bg-[#1a2333] transition"
                                  >
                                    <i className="fa-solid fa-download text-xs"></i>
                                  </button>
                                  {!isTeamFile && (file.uploaderId === currentUser?.id || currentUser?.role === 'Admin') && (
                                    <button
                                      type="button"
                                      onClick={() => handleOpenShareModal('file', file)}
                                      title="Share file"
                                      className="w-7 h-7 flex items-center justify-center rounded text-slate-400 hover:text-indigo-400 hover:bg-[#1a2333] transition"
                                    >
                                      <i className="fa-solid fa-share-nodes text-xs"></i>
                                    </button>
                                  )}
                                  {canManageThisFile && (
                                    <>
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setEditingFile(file);
                                          setFileForm({ name: file.name });
                                          setShowFileModal(true);
                                        }}
                                        title="Rename file"
                                        className="w-7 h-7 flex items-center justify-center rounded text-slate-400 hover:text-white hover:bg-[#1a2333] transition"
                                      >
                                        <i className="fa-solid fa-pen text-xs"></i>
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => setConfirmDelete({ type: 'file', id: file.id, name: file.name })}
                                        title="Delete file"
                                        className="w-7 h-7 flex items-center justify-center rounded text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition"
                                      >
                                        <i className="fa-solid fa-trash text-xs"></i>
                                      </button>
                                    </>
                                  )}
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="p-4 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3.5 overflow-y-auto max-h-[520px] hide-scrollbar">
                    {filteredFiles.map(file => {
                      const { icon, color } = getFileIcon(file.type);
                      const isTeamFile = file.storageScope === 'TEAM';
                      return (
                        <div
                          key={file.id}
                          onClick={(e) => handleDownloadFile(e, file)}
                          className="group bg-[#161d2f] border border-[#1f2a44] rounded-xl p-3.5 flex flex-col hover:border-[#384366] transition shadow-sm relative cursor-pointer"
                        >
                          <div className="flex items-start justify-between mb-2.5">
                            <i className={`${icon} ${color} text-2xl`}></i>
                            <div className="flex items-center gap-1.5">
                              {file.isShared && (
                                <span className="text-[9px] font-bold text-indigo-400 bg-indigo-500/10 border border-indigo-500/20 px-1.5 py-0.5 rounded flex items-center gap-1">
                                  <i className="fa-solid fa-user-group text-[8px]"></i>
                                  <span>Shared</span>
                                </span>
                              )}
                              <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400 bg-[#0f1422] px-2 py-0.5 rounded">
                                {isTeamFile ? 'Team' : 'Personal'}
                              </span>
                            </div>
                          </div>
                          <h4 className="text-xs font-bold text-white truncate mb-0.5" title={file.name}>
                            {file.name}
                          </h4>
                          <p className="text-[10px] text-slate-400 truncate mb-3">
                            {formatSize(file.size)} • {new Date(file.updatedAt).toLocaleDateString()}
                          </p>
                          <div className="mt-auto pt-2 border-t border-[#1f2a44]/60 flex items-center justify-between text-[10px] text-slate-400">
                            <span className="text-indigo-400 font-semibold">Click to Download</span>
                            <div className="flex items-center gap-2">
                              {!isTeamFile && (file.uploaderId === currentUser?.id || currentUser?.role === 'Admin') && (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleOpenShareModal('file', file);
                                  }}
                                  title="Share file"
                                  className="w-5 h-5 flex items-center justify-center rounded hover:text-indigo-400 transition"
                                >
                                  <i className="fa-solid fa-share-nodes text-[10px]"></i>
                                </button>
                              )}
                              <i className="fa-solid fa-download text-xs text-slate-400 group-hover:text-white"></i>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* RIGHT SIDEBAR (Authoritative Storage Quota, Recent Activity, Quick Actions) */}
      <div className="w-full lg:w-[280px] xl:w-[320px] shrink-0 flex flex-col gap-4">
        
        {/* Dynamic Context-Aware Storage Usage Component */}
        <StorageUsage
          activeTab={activeTab}
          viewFiles={filteredFiles}
          allDevhubFiles={files}
          quotas={quotas}
          loading={quotasLoading}
          onRefresh={() => fetchQuotas()}
        />

        {/* Compact Recent Activity */}
        <div className="bg-[#0f1422] border border-[#192238] rounded-2xl p-4 shadow-sm flex flex-col max-h-[280px]">
          <div className="flex items-center justify-between mb-3 shrink-0">
            <h2 className="text-xs font-bold text-white tracking-tight uppercase flex items-center gap-1.5">
              <i className="fa-regular fa-clock text-indigo-400"></i>
              <span>Recent Activity</span>
            </h2>
          </div>
          <div className="flex-1 overflow-y-auto hide-scrollbar pr-1">
            <ActivityFeed activities={recentActivity} emptyMessage="No recent file actions." />
          </div>
        </div>

        {/* Compact Quick Actions */}
        <div className="bg-[#0f1422] border border-[#192238] rounded-2xl p-4 shadow-sm">
          <h2 className="text-xs font-bold text-white tracking-tight uppercase flex items-center gap-1.5 mb-3">
            <i className="fa-solid fa-bolt text-indigo-400"></i>
            <span>Quick Actions</span>
          </h2>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              disabled={!canUploadOrAddFolder || uploading}
              onClick={() => {
                if (fileInputRef.current) fileInputRef.current.click();
              }}
              className="flex items-center gap-2 p-2 rounded-xl bg-[#161d2f] hover:bg-[#1a2333] border border-[#1f2a44] text-slate-300 hover:text-white text-xs font-bold transition text-left disabled:opacity-50"
            >
              <i className="fa-solid fa-upload text-indigo-400 w-3"></i>
              <span>Upload</span>
            </button>

            <button
              type="button"
              disabled={!canUploadOrAddFolder || uploading}
              onClick={() => {
                setEditingFolder(null);
                setFolderForm({ name: '' });
                setShowFolderModal(true);
              }}
              className="flex items-center gap-2 p-2 rounded-xl bg-[#161d2f] hover:bg-[#1a2333] border border-[#1f2a44] text-slate-300 hover:text-white text-xs font-bold transition text-left disabled:opacity-50"
            >
              <i className="fa-solid fa-folder-plus text-indigo-400 w-3"></i>
              <span>Folder</span>
            </button>

            <button
              type="button"
              onClick={() => {
                loadContents();
                fetchQuotas();
              }}
              className="flex items-center gap-2 p-2 rounded-xl bg-[#161d2f] hover:bg-[#1a2333] border border-[#1f2a44] text-slate-300 hover:text-white text-xs font-bold transition text-left"
            >
              <i className="fa-solid fa-arrows-rotate text-emerald-400 w-3"></i>
              <span>Refresh</span>
            </button>

            <button
              type="button"
              onClick={handleGoRoot}
              className="flex items-center gap-2 p-2 rounded-xl bg-[#161d2f] hover:bg-[#1a2333] border border-[#1f2a44] text-slate-300 hover:text-white text-xs font-bold transition text-left"
            >
              <i className="fa-solid fa-house text-purple-400 w-3"></i>
              <span>Root</span>
            </button>
          </div>
        </div>

      </div>

      {/* Create / Rename Folder Modal */}
      {showFolderModal && (
        <Modal open={showFolderModal} onClose={() => setShowFolderModal(false)} className="max-w-sm p-6">
          <h2 className="text-base text-white font-bold mb-4">
            {editingFolder ? 'Rename Folder' : 'New Folder'}
          </h2>
          <form onSubmit={handleSaveFolder} className="flex flex-col gap-4">
            <div>
              <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                Storage Destination
              </span>
              <div className="text-xs font-semibold text-slate-200 bg-[#161d2f] border border-[#1f2a44] rounded-xl px-3.5 py-2">
                {activeTab === 'Team Cloud Storage' ? (selectedTeam?.name ? `${selectedTeam.name} (Team)` : 'Team Storage') : 'My Cloud Storage'}
                {currentFolderId && folderHistory.length > 0 && ` / ${folderHistory[folderHistory.length - 1].name}`}
              </div>
            </div>

            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                Folder Name <span className="text-rose-400">*</span>
              </label>
              <input
                required
                autoFocus
                value={folderForm.name}
                onChange={e => setFolderForm({ name: e.target.value })}
                placeholder="E.g. Documents"
                className="w-full bg-[#161d2f] border border-[#1f2a44] rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:border-indigo-500 transition shadow-inner"
              />
            </div>

            <div className="flex justify-end gap-3 mt-2 pt-4 border-t border-[#1f2a44]">
              <button
                type="button"
                disabled={folderSubmitting}
                onClick={() => setShowFolderModal(false)}
                className="px-4 py-2 text-slate-300 text-xs font-bold hover:text-white hover:bg-[#1a2333] rounded-lg transition disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={folderSubmitting}
                className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold shadow-lg shadow-indigo-900/30 transition disabled:opacity-50 flex items-center gap-2"
              >
                {folderSubmitting && <i className="fa-solid fa-spinner fa-spin"></i>}
                <span>Save</span>
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Rename File Modal */}
      {showFileModal && (
        <Modal open={showFileModal} onClose={() => setShowFileModal(false)} className="max-w-sm p-6">
          <h2 className="text-base text-white font-bold mb-4">
            Rename File
          </h2>
          <form onSubmit={handleSaveFile} className="flex flex-col gap-4">
            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                File Name <span className="text-rose-400">*</span>
              </label>
              <input
                required
                autoFocus
                value={fileForm.name}
                onChange={e => setFileForm({ name: e.target.value })}
                placeholder="E.g. Roadmap.pdf"
                className="w-full bg-[#161d2f] border border-[#1f2a44] rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:border-indigo-500 transition shadow-inner"
              />
            </div>
            <div className="flex justify-end gap-3 mt-2 pt-4 border-t border-[#1f2a44]">
              <button
                type="button"
                disabled={fileSubmitting}
                onClick={() => setShowFileModal(false)}
                className="px-4 py-2 text-slate-300 text-xs font-bold hover:text-white hover:bg-[#1a2333] rounded-lg transition disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={fileSubmitting}
                className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold shadow-lg shadow-indigo-900/30 transition disabled:opacity-50 flex items-center gap-2"
              >
                {fileSubmitting && <i className="fa-solid fa-spinner fa-spin"></i>}
                <span>Save Changes</span>
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Delete Confirmation Dialog */}
      {confirmDelete && (
        <ConfirmDialog
          open={Boolean(confirmDelete)}
          onClose={() => setConfirmDelete(null)}
          onConfirm={handleExecuteDelete}
          title={`Delete ${confirmDelete.type === 'folder' ? 'Folder' : 'File'}`}
          message={`Are you sure you want to delete "${confirmDelete.name}"? This action cannot be undone.`}
          confirmText="Delete"
          loading={deleting}
          danger={true}
        />
      )}

      {/* Share Resource Modal (Personal Files & Folders) */}
      {shareModal.open && shareModal.resource && (
        <Modal
          open={shareModal.open}
          onClose={() => setShareModal({ open: false, type: 'file', resource: null })}
          className="max-w-md p-6"
        >
          <div className="flex items-center justify-between mb-4 pb-3 border-b border-[#1f2a44]">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 shrink-0">
                <i className={`fa-solid ${shareModal.type === 'folder' ? 'fa-folder' : 'fa-file'} text-sm`}></i>
              </div>
              <div className="min-w-0">
                <h2 className="text-sm text-white font-bold truncate">
                  Share {shareModal.type === 'folder' ? 'Folder' : 'File'}
                </h2>
                <p className="text-[11px] text-slate-400 truncate" title={shareModal.resource.name}>
                  {shareModal.resource.name}
                </p>
              </div>
            </div>
            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 shrink-0">
              Personal Storage
            </span>
          </div>

          {/* Feedback messages */}
          {shareError && (
            <div className="mb-3 px-3 py-2 rounded-lg text-xs bg-rose-500/10 border border-rose-500/25 text-rose-300 flex items-center gap-2">
              <i className="fa-solid fa-circle-exclamation text-rose-400"></i>
              <span>{shareError}</span>
            </div>
          )}
          {shareSuccess && (
            <div className="mb-3 px-3 py-2 rounded-lg text-xs bg-emerald-500/10 border border-emerald-500/25 text-emerald-300 flex items-center gap-2">
              <i className="fa-solid fa-circle-check text-emerald-400"></i>
              <span>{shareSuccess}</span>
            </div>
          )}

          {/* Share Form */}
          <form onSubmit={handleCreateShare} className="flex flex-col gap-3.5 mb-6">
            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                Target DEVHUB User (Email or User ID) <span className="text-rose-400">*</span>
              </label>
              <input
                required
                type="text"
                value={shareTargetUser}
                onChange={e => setShareTargetUser(e.target.value)}
                placeholder="colleague@devhub.com or user ID"
                className="w-full bg-[#161d2f] border border-[#1f2a44] rounded-xl px-3.5 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition shadow-inner"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                  Permission Level
                </label>
                <select
                  value={sharePermission}
                  onChange={e => setSharePermission(e.target.value)}
                  className="w-full bg-[#161d2f] border border-[#1f2a44] rounded-xl px-3 py-2 text-xs font-semibold text-white focus:outline-none focus:border-indigo-500 transition cursor-pointer"
                >
                  <option value="VIEW">View (Read & Download)</option>
                  <option value="EDIT">Edit (Modify & Delete)</option>
                </select>
              </div>

              <div className="flex items-end">
                <button
                  type="submit"
                  disabled={shareSubmitting || !shareTargetUser.trim()}
                  className="w-full py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold shadow-md shadow-indigo-900/30 transition flex items-center justify-center gap-1.5"
                >
                  {shareSubmitting ? (
                    <i className="fa-solid fa-spinner fa-spin text-xs"></i>
                  ) : (
                    <i className="fa-solid fa-user-plus text-xs"></i>
                  )}
                  <span>Grant Access</span>
                </button>
              </div>
            </div>
          </form>

          {/* Current Shared Users List */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                Current Access ({shareList.length})
              </span>
              <span className="text-[10px] text-slate-500">
                Private by default
              </span>
            </div>

            {shareLoading ? (
              <div className="py-6 text-center text-slate-400 text-xs">
                <i className="fa-solid fa-circle-notch fa-spin text-indigo-400 mr-2"></i>
                Loading permissions...
              </div>
            ) : shareList.length === 0 ? (
              <div className="py-5 text-center text-slate-400 text-xs bg-[#161d2f]/50 border border-[#1f2a44] rounded-xl">
                <i className="fa-solid fa-lock text-slate-500 text-sm mb-1 block"></i>
                <span>This personal resource is not shared with anyone yet.</span>
              </div>
            ) : (
              <div className="max-h-48 overflow-y-auto divide-y divide-[#1f2a44] border border-[#1f2a44] rounded-xl bg-[#161d2f]/40">
                {shareList.map(share => (
                  <div key={share.id} className="p-2.5 flex items-center justify-between gap-3 text-xs">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-7 h-7 rounded-full bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-indigo-300 font-bold text-xs shrink-0">
                        {share.sharedWith?.name?.charAt(0).toUpperCase() || 'U'}
                      </div>
                      <div className="min-w-0">
                        <span className="font-semibold text-white truncate block">
                          {share.sharedWith?.name || 'DEVHUB User'}
                        </span>
                        <span className="text-[10px] text-slate-400 truncate block">
                          {share.sharedWith?.email}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        share.permission === 'EDIT'
                          ? 'bg-purple-500/10 border border-purple-500/20 text-purple-300'
                          : 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-300'
                      }`}>
                        {share.permission}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleRevokeShare(share.sharedWith?.id)}
                        title="Revoke access"
                        className="w-6 h-6 flex items-center justify-center rounded text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition"
                      >
                        <i className="fa-solid fa-xmark text-xs"></i>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="mt-5 pt-3 border-t border-[#1f2a44] flex justify-end">
            <button
              type="button"
              onClick={() => setShareModal({ open: false, type: 'file', resource: null })}
              className="px-4 py-1.5 text-xs font-bold text-slate-300 hover:text-white hover:bg-[#1a2333] rounded-lg transition"
            >
              Done
            </button>
          </div>
        </Modal>
      )}

    </div>
  );
}