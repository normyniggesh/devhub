import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { apiClient } from '../api/client';
import { useStore } from '../store';
import { formatSize } from '../utils/formatting';
import CompactPageHeader from '../components/common/CompactPageHeader';
import StorageUsage from '../components/files/StorageUsage';
import CloudIntegrations from '../components/files/CloudIntegrations';
import DriveFolderRow from '../components/files/DriveFolderRow';
import DriveFileRow from '../components/files/DriveFileRow';
import ActivityFeed from '../components/activity/ActivityFeed';
import Modal from '../components/common/Modal';
import ConfirmDialog from '../components/common/ConfirmDialog';
import { useClickOutside } from '../hooks/useClickOutside';

export default function Files() {
  const { currentUser } = useStore();
  const [projects, setProjects] = useState([]);
  const [folders, setFolders] = useState([]);
  const [files, setFiles] = useState([]);
  const [recentActivity, setRecentActivity] = useState([]);
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Active navigation tab
  // 'All Files' | 'Google Drive' | 'DEVHUB' | 'Shared with Me' | 'Dropbox' | 'OneDrive'
  const [activeTab, setActiveTab] = useState('All Files');
  const [viewMode, setViewMode] = useState('list'); // 'list' | 'grid'
  const [searchQuery, setSearchQuery] = useState('');
  const [sortConfig, setSortConfig] = useState({ key: 'updatedAt', direction: 'desc' });

  // Navigation state for DEVHUB files
  const [currentFolderId, setCurrentFolderId] = useState(null);
  const [folderHistory, setFolderHistory] = useState([]); // [{id, name, projectId}]

  // Cloud Storage Integrations state
  const [integrations, setIntegrations] = useState({
    google_drive: { connected: false },
    dropbox: { connected: false },
    onedrive: { connected: false }
  });

  // Storage Quota State (Dynamic Quotas for all providers)
  const [quotas, setQuotas] = useState({});
  const [quotasLoading, setQuotasLoading] = useState(false);

  // Inline Cloud Provider browsing state (for Google Drive, Dropbox, OneDrive tabs)
  const [cloudItems, setCloudItems] = useState([]);
  const [cloudLoading, setCloudLoading] = useState(false);
  const [cloudError, setCloudError] = useState(null);
  const [cloudBreadcrumbs, setCloudBreadcrumbs] = useState([{ id: 'root', name: 'My Drive' }]);
  const [importingFileId, setImportingFileId] = useState(null);
  const [importMessage, setImportMessage] = useState(null);

  // Modals state
  const [showFolderModal, setShowFolderModal] = useState(false);
  const [editingFolder, setEditingFolder] = useState(null);
  const [folderForm, setFolderForm] = useState({ name: '', projectId: '' });
  const [folderSubmitting, setFolderSubmitting] = useState(false);

  const [showFileModal, setShowFileModal] = useState(false);
  const [editingFile, setEditingFile] = useState(null);
  const [fileForm, setFileForm] = useState({ name: '', projectId: '' });
  const [fileSubmitting, setFileSubmitting] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState(null);

  const [confirmDelete, setConfirmDelete] = useState(null); // { type: 'file'|'folder', id, name }
  const [deleting, setDeleting] = useState(false);

  const [openMenuId, setOpenMenuId] = useState(null);
  const menuRef = useRef(null);
  useClickOutside(menuRef, () => setOpenMenuId(null));

  // 1. Fetch initial data and storage quota
  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const [projRes, foldRes, fileRes, dashRes, intRes] = await Promise.all([
        apiClient('/projects'),
        apiClient('/folders'),
        apiClient('/files'),
        apiClient('/dashboard').catch(() => ({ dashboard: { recentActivity: [] } })),
        apiClient('/integrations').catch(() => ({ integrations: {} }))
      ]);

      setProjects(projRes.projects || []);
      setFolders(foldRes.folders || []);
      setFiles(fileRes.files || []);
      setIntegrations(intRes.integrations || {
        google_drive: { connected: false },
        dropbox: { connected: false },
        onedrive: { connected: false }
      });

      const allAct = dashRes.dashboard?.recentActivity || [];
      setRecentActivity(allAct.filter(a => a.entityType === 'File' || a.entityType === 'Folder'));
    } catch (err) {
      setError(err.message || 'Unable to load files');
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchQuotas = useCallback(async () => {
    try {
      setQuotasLoading(true);
      const res = await apiClient('/integrations/quota');
      if (res.quotas) {
        setQuotas(res.quotas);
      }
    } catch (err) {
      console.warn('Could not fetch storage quotas:', err);
    } finally {
      setQuotasLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
    fetchQuotas();
  }, [loadData, fetchQuotas]);

  // 2. Fetch cloud provider items when activeTab is a cloud provider
  const currentCloudFolder = cloudBreadcrumbs[cloudBreadcrumbs.length - 1];

  const loadCloudFiles = useCallback(async (provider, folderId = 'root') => {
    try {
      setCloudLoading(true);
      setCloudError(null);
      let queryUrl = `/integrations/${provider}/files?folderId=${encodeURIComponent(folderId)}`;
      if (searchQuery.trim()) {
        queryUrl += `&search=${encodeURIComponent(searchQuery.trim())}`;
      }
      const res = await apiClient(queryUrl);
      setCloudItems(res.files || []);
    } catch (err) {
      setCloudError(err.message || `Failed to load files from ${provider}`);
      setCloudItems([]);
    } finally {
      setCloudLoading(false);
    }
  }, [searchQuery]);

  useEffect(() => {
    if (activeTab === 'Google Drive' && integrations.google_drive?.connected) {
      loadCloudFiles('google_drive', currentCloudFolder.id);
    } else if (activeTab === 'Dropbox' && integrations.dropbox?.connected) {
      loadCloudFiles('dropbox', currentCloudFolder.id === 'root' ? '' : currentCloudFolder.id);
    } else if (activeTab === 'OneDrive' && integrations.onedrive?.connected) {
      loadCloudFiles('onedrive', currentCloudFolder.id);
    }
  }, [activeTab, integrations, currentCloudFolder.id, loadCloudFiles]);

  // DEVHUB Folder navigation
  const handleOpenFolder = (folder) => {
    setFolderHistory([...folderHistory, { id: folder.id, name: folder.name, projectId: folder.projectId }]);
    setCurrentFolderId(folder.id);
    setActiveTab('All Files');
    setSearchQuery('');
  };

  const handleGoRoot = () => {
    setFolderHistory([]);
    setCurrentFolderId(null);
  };

  const handleGoBack = () => {
    if (folderHistory.length > 0) {
      const newHistory = [...folderHistory];
      newHistory.pop();
      setFolderHistory(newHistory);
      setCurrentFolderId(newHistory.length > 0 ? newHistory[newHistory.length - 1].id : null);
    }
  };

  // RBAC checks
  const canModifyProject = (projectId) => {
    if (!projectId) return false;
    const proj = projects.find(p => p.id === projectId);
    if (!proj) return false;
    if (proj.owner?.id === currentUser?.id || proj.ownerId === currentUser?.id) return true;
    const member = proj.members?.find(m => m.user?.id === currentUser?.id || m.userId === currentUser?.id);
    return member?.role === 'Admin' || member?.role === 'Editor';
  };

  const canDeleteProjectData = (projectId) => {
    if (!projectId) return false;
    const proj = projects.find(p => p.id === projectId);
    if (!proj) return false;
    if (proj.owner?.id === currentUser?.id || proj.ownerId === currentUser?.id) return true;
    const member = proj.members?.find(m => m.user?.id === currentUser?.id || m.userId === currentUser?.id);
    return member?.role === 'Admin';
  };

  const currentProjectId = currentFolderId ? folderHistory[folderHistory.length - 1]?.projectId : '';

  // Data Filtering for local DEVHUB views
  let currentViewFolders = [];
  let currentViewFiles = [];

  if (activeTab === 'All Files') {
    currentViewFolders = folders.filter(f => f.parentId === currentFolderId);
    currentViewFiles = files.filter(f => f.folderId === currentFolderId);
  } else if (activeTab === 'DEVHUB') {
    // Show all DEVHUB workspace files
    currentViewFiles = files;
    currentViewFolders = folders.filter(f => !f.parentId);
  } else if (activeTab === 'Shared with Me') {
    currentViewFiles = files.filter(f => f.uploader?.id !== currentUser?.id && f.uploaderId !== currentUser?.id);
  }

  if (searchQuery && (activeTab === 'All Files' || activeTab === 'DEVHUB' || activeTab === 'Shared with Me')) {
    const q = searchQuery.toLowerCase();
    currentViewFiles = currentViewFiles.filter(f => 
      f.name?.toLowerCase().includes(q) || 
      f.type?.toLowerCase().includes(q) ||
      f.project?.name?.toLowerCase().includes(q)
    );
    if (activeTab === 'All Files' || activeTab === 'DEVHUB') {
      currentViewFolders = currentViewFolders.filter(f => 
        f.name?.toLowerCase().includes(q) ||
        f.project?.name?.toLowerCase().includes(q)
      );
    }
  }

  // Sort files
  currentViewFiles.sort((a, b) => {
    let aVal = a[sortConfig.key];
    let bVal = b[sortConfig.key];
    if (sortConfig.key === 'project') {
      aVal = a.project?.name || '';
      bVal = b.project?.name || '';
    } else if (sortConfig.key === 'updatedAt') {
      aVal = new Date(a.updatedAt || 0).getTime();
      bVal = new Date(b.updatedAt || 0).getTime();
    }
    if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
    if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
    return 0;
  });

  const getFileIcon = (type) => {
    const t = (type || '').toLowerCase();
    if (t.includes('pdf')) return { icon: 'fa-solid fa-file-pdf', color: 'text-rose-400' };
    if (t.includes('doc')) return { icon: 'fa-solid fa-file-word', color: 'text-blue-400' };
    if (t.includes('xls') || t.includes('csv')) return { icon: 'fa-solid fa-file-excel', color: 'text-emerald-400' };
    if (t.includes('ppt')) return { icon: 'fa-solid fa-file-powerpoint', color: 'text-amber-400' };
    if (t.includes('png') || t.includes('jpg') || t.includes('jpeg') || t.includes('svg') || t.includes('fig')) return { icon: 'fa-solid fa-file-image', color: 'text-purple-400' };
    if (t.includes('zip') || t.includes('rar')) return { icon: 'fa-solid fa-file-zipper', color: 'text-yellow-400' };
    if (t.includes('video') || t.includes('mp4')) return { icon: 'fa-solid fa-file-video', color: 'text-sky-400' };
    return { icon: 'fa-solid fa-file', color: 'text-slate-400' };
  };

  // Save Folder (create or rename)
  const handleSaveFolder = async (e) => {
    e.preventDefault();
    setFolderSubmitting(true);
    try {
      if (editingFolder) {
        await apiClient(`/folders/${editingFolder.id}`, { method: 'PATCH', body: { name: folderForm.name } });
      } else {
        await apiClient('/folders', { 
          method: 'POST', 
          body: { 
            name: folderForm.name, 
            projectId: folderForm.projectId, 
            parentId: currentFolderId || null 
          } 
        });
      }
      setShowFolderModal(false);
      await loadData();
      await fetchQuotas();
    } catch (err) {
      alert(err.message || 'Failed to save folder');
    } finally {
      setFolderSubmitting(false);
    }
  };

  // Save File (upload or rename)
  const handleSaveFile = async (e) => {
    e.preventDefault();
    setFileSubmitting(true);
    try {
      if (editingFile) {
        await apiClient(`/files/${editingFile.id}`, { method: 'PATCH', body: { name: fileForm.name } });
      } else {
        if (!selectedFiles || selectedFiles.length === 0) {
          throw new Error('Please select at least one file to upload.');
        }
        
        const formData = new FormData();
        formData.append('projectId', fileForm.projectId);
        if (currentFolderId) {
          formData.append('folderId', currentFolderId);
        }
        
        for (let i = 0; i < selectedFiles.length; i++) {
          formData.append('files', selectedFiles[i]);
        }
        
        await apiClient('/files', { method: 'POST', body: formData });
      }
      setShowFileModal(false);
      setSelectedFiles(null);
      await loadData();
      await fetchQuotas();
    } catch (err) {
      alert(err.message || 'Failed to upload file');
    } finally {
      setFileSubmitting(false);
    }
  };

  // Download DEVHUB file
  const handleDownloadFile = async (e, fileId) => {
    e.stopPropagation();
    try {
      const res = await apiClient(`/files/${fileId}/download`);
      if (res.url) {
        window.open(res.url, '_blank');
      }
    } catch (err) {
      alert(err.message || 'Download failed');
    }
  };

  // Execute deletion
  const handleExecuteDelete = async () => {
    if (!confirmDelete) return;
    try {
      setDeleting(true);
      if (confirmDelete.type === 'folder') {
        await apiClient(`/folders/${confirmDelete.id}`, { method: 'DELETE' });
      } else {
        await apiClient(`/files/${confirmDelete.id}`, { method: 'DELETE' });
      }
      setConfirmDelete(null);
      await loadData();
      await fetchQuotas();
    } catch (err) {
      alert(err.message || 'Failed to delete item');
    } finally {
      setDeleting(false);
    }
  };

  // Cloud item download
  const handleCloudDownload = (file, provider = 'google_drive') => {
    const apiBase = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';
    const downloadUrl = `${apiBase}/integrations/${provider}/download/${encodeURIComponent(file.id)}`;
    const link = document.createElement('a');
    link.href = downloadUrl;
    link.setAttribute('download', file.name);
    link.setAttribute('target', '_blank');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Cloud item import to DEVHUB
  const handleCloudImport = async (file, provider = 'google_drive') => {
    const targetProject = projects[0]?.id;
    if (!targetProject) {
      alert('Please create at least one DEVHUB project first to import files.');
      return;
    }
    try {
      setImportingFileId(file.id);
      setImportMessage(null);
      const res = await apiClient(`/integrations/${provider}/import`, {
        method: 'POST',
        body: {
          fileId: file.id,
          fileName: file.name,
          mimeType: file.mimeType,
          size: file.size,
          projectId: targetProject,
          folderId: currentFolderId || null
        }
      });
      setImportMessage({ type: 'success', text: res.message || `Imported "${file.name}" to DEVHUB` });
      await loadData();
      await fetchQuotas();
    } catch (err) {
      setImportMessage({ type: 'error', text: err.message || 'Import failed' });
    } finally {
      setImportingFileId(null);
    }
  };

  // Hero tabs config
  const heroTabs = [
    { id: 'All Files', label: 'All Files', icon: 'fa-solid fa-folder-tree' },
    { id: 'Google Drive', label: 'Google Drive', icon: 'fa-brands fa-google-drive' },
    { id: 'DEVHUB', label: 'DEVHUB', icon: 'fa-solid fa-cloud' },
    { id: 'Shared with Me', label: 'Shared with Me', icon: 'fa-solid fa-users' },
    ...(integrations.dropbox?.connected ? [{ id: 'Dropbox', label: 'Dropbox', icon: 'fa-brands fa-dropbox' }] : []),
    ...(integrations.onedrive?.connected ? [{ id: 'OneDrive', label: 'OneDrive', icon: 'fa-brands fa-microsoft' }] : [])
  ];

  return (
    <div className="flex flex-col lg:flex-row gap-6 max-w-[1920px] mx-auto pb-12 min-h-screen">
      
      {/* Main Content Area */}
      <div className="flex-1 min-w-0 flex flex-col gap-5">
        
        {/* Compact Hero Header (Approved 4th Tab Style Direction) */}
        <CompactPageHeader
          title="Files"
          subtitle="Manage your files across different storage providers."
          tabs={heroTabs}
          activeTab={activeTab}
          onTabChange={(tab) => {
            setActiveTab(tab);
            setCurrentFolderId(null);
            setFolderHistory([]);
            setCloudBreadcrumbs([{ id: 'root', name: 'My Drive' }]);
          }}
          actions={
            <>
              {/* Search Filter */}
              <div className="relative w-44 sm:w-56">
                <i className="fa-solid fa-magnifying-glass absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-xs"></i>
                <input
                  type="text"
                  placeholder="Filter files..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-[#161d2f] border border-[#1f2a44] rounded-xl pl-8 pr-7 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-purple-500 transition"
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

              {/* Upload Button */}
              <button
                type="button"
                onClick={() => {
                  setEditingFile(null);
                  setFileForm({ name: '', projectId: currentProjectId || (projects[0]?.id || '') });
                  setSelectedFiles(null);
                  setShowFileModal(true);
                }}
                className="flex items-center gap-1.5 px-3 py-2 bg-[#161d2f] hover:bg-[#1f2a44] text-slate-200 hover:text-white border border-[#1f2a44] rounded-xl text-xs font-bold transition shrink-0"
              >
                <i className="fa-solid fa-arrow-up-from-bracket text-xs text-purple-400"></i>
                <span>Upload</span>
              </button>

              {/* New Folder Button */}
              <button
                type="button"
                onClick={() => {
                  setEditingFolder(null);
                  setFolderForm({ name: '', projectId: currentProjectId || (projects[0]?.id || '') });
                  setShowFolderModal(true);
                }}
                className="flex items-center gap-1.5 px-3.5 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-bold shadow-md shadow-purple-900/30 transition shrink-0 active:scale-95"
              >
                <i className="fa-solid fa-folder-plus text-xs"></i>
                <span>New Folder</span>
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

        {/* Cloud Storage Integrations Section (Equal Card Heights, Clear Statuses, Real OAuth) */}
        <CloudIntegrations
          integrations={integrations}
          onRefreshIntegrations={async () => {
            await loadData();
            await fetchQuotas();
          }}
          projects={projects}
          currentProjectId={currentProjectId}
          currentFolderId={currentFolderId}
          onFileImported={async () => {
            await loadData();
            await fetchQuotas();
          }}
        />

        {/* Import Notification Message */}
        {importMessage && (
          <div
            className={`px-4 py-3 rounded-xl text-xs flex items-center justify-between border ${
              importMessage.type === 'success'
                ? 'bg-emerald-500/10 border-emerald-500/25 text-emerald-300'
                : 'bg-rose-500/10 border-rose-500/25 text-rose-300'
            }`}
          >
            <div className="flex items-center gap-2">
              <i className={`fa-solid ${importMessage.type === 'success' ? 'fa-circle-check text-emerald-400' : 'fa-circle-exclamation text-rose-400'}`}></i>
              <span className="font-semibold">{importMessage.text}</span>
            </div>
            <button type="button" onClick={() => setImportMessage(null)} className="hover:opacity-75">
              <i className="fa-solid fa-xmark"></i>
            </button>
          </div>
        )}

        {/* Breadcrumb Navigation for DEVHUB All Files */}
        {activeTab === 'All Files' && (
          <div className="flex items-center gap-2 text-xs text-slate-400 bg-[#0f1422] border border-[#192238] px-4 py-2 rounded-xl font-medium">
            <button
              type="button"
              onClick={handleGoRoot}
              className={`hover:text-white transition flex items-center gap-1.5 ${
                folderHistory.length === 0 ? 'text-white font-bold' : ''
              }`}
            >
              <i className="fa-solid fa-home text-purple-400"></i>
              <span>Root</span>
            </button>
            {folderHistory.map((h, i) => (
              <div key={h.id} className="flex items-center gap-2">
                <span className="text-slate-600">/</span>
                <button
                  type="button"
                  onClick={() => {
                    const newHistory = folderHistory.slice(0, i + 1);
                    setFolderHistory(newHistory);
                    setCurrentFolderId(h.id);
                  }}
                  className={`transition truncate max-w-[150px] ${
                    i === folderHistory.length - 1 ? 'text-white font-bold' : 'hover:text-white'
                  }`}
                >
                  {h.name}
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Breadcrumb Navigation for Google Drive View */}
        {activeTab === 'Google Drive' && integrations.google_drive?.connected && (
          <div className="flex items-center gap-2 text-xs text-slate-400 bg-[#0f1422] border border-[#192238] px-4 py-2 rounded-xl font-medium">
            <i className="fa-brands fa-google-drive text-amber-400 mr-1"></i>
            {cloudBreadcrumbs.map((bc, idx) => (
              <div key={bc.id} className="flex items-center gap-2">
                {idx > 0 && <span className="text-slate-600">/</span>}
                <button
                  type="button"
                  onClick={() => setCloudBreadcrumbs(prev => prev.slice(0, idx + 1))}
                  className={`hover:text-white transition truncate max-w-[150px] ${
                    idx === cloudBreadcrumbs.length - 1 ? 'text-white font-bold' : ''
                  }`}
                >
                  {bc.name}
                </button>
              </div>
            ))}
          </div>
        )}

        {/* MAIN FILE BROWSER AREA */}
        {error ? (
          <div className="p-8 text-center text-red-400 bg-red-500/10 border border-red-500/20 rounded-2xl text-xs">
            {error}
          </div>
        ) : loading ? (
          <div className="flex flex-col items-center justify-center py-24 bg-[#0f1422] border border-[#192238] rounded-2xl">
            <i className="fa-solid fa-circle-notch fa-spin text-3xl text-purple-500 mb-3"></i>
            <span className="text-xs font-semibold text-slate-400">Loading files...</span>
          </div>
        ) : (
          <div className="flex flex-col gap-4">

            {/* CASE 1: Google Drive Tab */}
            {activeTab === 'Google Drive' && (
              !integrations.google_drive?.connected ? (
                <div className="bg-[#0f1422] border border-dashed border-[#192238] rounded-2xl p-12 text-center flex flex-col items-center justify-center">
                  <div className="w-14 h-14 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center mb-3">
                    <i className="fa-brands fa-google-drive text-2xl text-amber-400"></i>
                  </div>
                  <h3 className="text-base font-bold text-white mb-1">Google Drive Not Connected</h3>
                  <p className="text-xs text-slate-400 max-w-md mb-5 leading-relaxed">
                    Connect your personal Google Account to browse, download, and import files directly into DEVHUB projects.
                  </p>
                  <button
                    type="button"
                    onClick={async () => {
                      const redirectUri = `${window.location.origin}${window.location.pathname}`;
                      const res = await apiClient(`/integrations/google/auth-url?redirectUri=${encodeURIComponent(redirectUri)}`);
                      if (res.url) window.location.href = res.url;
                    }}
                    className="px-5 py-2.5 bg-amber-500 hover:bg-amber-600 text-slate-950 rounded-xl text-xs font-bold transition shadow-lg shadow-amber-500/20 flex items-center gap-2"
                  >
                    <i className="fa-solid fa-plug text-xs"></i>
                    <span>Connect Google Drive</span>
                  </button>
                </div>
              ) : cloudLoading ? (
                <div className="py-20 text-center bg-[#0f1422] border border-[#192238] rounded-2xl">
                  <i className="fa-solid fa-circle-notch fa-spin text-2xl text-amber-400 mb-2"></i>
                  <p className="text-xs text-slate-400">Loading Google Drive files...</p>
                </div>
              ) : cloudError ? (
                <div className="p-6 text-center text-red-400 bg-red-500/10 border border-red-500/20 rounded-2xl text-xs">
                  {cloudError}
                </div>
              ) : (
                <div className="bg-[#0f1422] border border-[#192238] rounded-2xl overflow-hidden shadow-sm">
                  <div className="overflow-y-auto max-h-[580px] hide-scrollbar">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="bg-[#121828] border-b border-[#192238] text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                          <th className="py-3 px-4">Item Name</th>
                          <th className="py-3 px-4 hidden sm:table-cell">Size</th>
                          <th className="py-3 px-4 hidden md:table-cell">Modified</th>
                          <th className="py-3 px-4 text-right">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#192238]/60 text-slate-300">
                        {cloudItems.length > 0 ? (
                          cloudItems.map(item => {
                            if (item.isFolder) {
                              return (
                                <DriveFolderRow
                                  key={item.id}
                                  folder={item}
                                  onOpenFolder={(f) => {
                                    setCloudBreadcrumbs(prev => [...prev, { id: f.id, name: f.name }]);
                                  }}
                                />
                              );
                            }
                            return (
                              <DriveFileRow
                                key={item.id}
                                file={item}
                                onDownload={(f) => handleCloudDownload(f, 'google_drive')}
                                onImport={(f) => handleCloudImport(f, 'google_drive')}
                                importing={importingFileId === item.id}
                              />
                            );
                          })
                        ) : (
                          <tr>
                            <td colSpan="4" className="py-12 text-center text-slate-400 text-xs">
                              No files or folders in this Google Drive folder.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )
            )}

            {/* CASE 2: DEVHUB Local Views (All Files, DEVHUB, Shared with Me) */}
            {(activeTab === 'All Files' || activeTab === 'DEVHUB' || activeTab === 'Shared with Me') && (
              <>
                {/* Folders Row (Only for All Files and DEVHUB root) */}
                {(activeTab === 'All Files' || activeTab === 'DEVHUB') && currentViewFolders.length > 0 && (
                  <div>
                    <div className="flex items-center justify-between mb-3 px-1">
                      <h2 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
                        <i className="fa-solid fa-folder text-purple-400"></i>
                        <span>Folders ({currentViewFolders.length})</span>
                      </h2>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3.5">
                      {currentViewFolders.map(folder => {
                        const canEdit = canModifyProject(folder.projectId);
                        const canDel = canDeleteProjectData(folder.projectId);
                        const isMenuOpen = openMenuId === `folder_${folder.id}`;

                        return (
                          <div
                            key={folder.id}
                            onClick={() => handleOpenFolder(folder)}
                            className="group bg-[#0f1422] border border-[#192238] hover:border-[#283552] rounded-xl p-3.5 cursor-pointer transition shadow-sm relative flex items-center justify-between"
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              <i className="fa-solid fa-folder text-2xl text-purple-500 group-hover:scale-105 transition-transform shrink-0"></i>
                              <div className="min-w-0">
                                <span className="text-xs font-bold text-white truncate block group-hover:text-purple-300 transition">
                                  {folder.name}
                                </span>
                                <span className="text-[10px] text-slate-500 truncate block">
                                  {folder.project?.name || 'Project'}
                                </span>
                              </div>
                            </div>

                            {/* Dropdown Menu */}
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
                                    <i className="fa-solid fa-folder-open w-3 text-purple-400"></i> Open
                                  </button>
                                  {canEdit && (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setOpenMenuId(null);
                                        setEditingFolder(folder);
                                        setFolderForm({ name: folder.name, projectId: folder.projectId });
                                        setShowFolderModal(true);
                                      }}
                                      className="flex items-center gap-2 w-full px-3 py-1.5 text-xs font-semibold text-slate-300 hover:bg-[#2a344a] hover:text-white text-left"
                                    >
                                      <i className="fa-solid fa-pen w-3 text-slate-400"></i> Rename
                                    </button>
                                  )}
                                  {canDel && (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setOpenMenuId(null);
                                        setConfirmDelete({ type: 'folder', id: folder.id, name: folder.name });
                                      }}
                                      className="flex items-center gap-2 w-full px-3 py-1.5 text-xs font-semibold text-red-400 hover:bg-red-500/10 text-left border-t border-[#2d364f] mt-1 pt-1.5"
                                    >
                                      <i className="fa-solid fa-trash w-3"></i> Delete
                                    </button>
                                  )}
                                </div>
                              )}
                            </div>
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
                      <i className="fa-solid fa-file text-purple-400"></i>
                      <span>Files ({currentViewFiles.length})</span>
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
                        <option value="project">Project</option>
                      </select>
                    </div>
                  </div>

                  {currentViewFiles.length === 0 ? (
                    <div className="py-16 text-center text-slate-400 text-xs">
                      <i className="fa-solid fa-box-open text-3xl text-slate-600 mb-2"></i>
                      <p className="font-semibold text-slate-300">No files in this view</p>
                      <p className="text-[11px] text-slate-500 mt-1">Upload a file or import from connected cloud storage.</p>
                    </div>
                  ) : viewMode === 'list' ? (
                    <div className="overflow-y-auto max-h-[520px] hide-scrollbar">
                      <table className="w-full text-left text-xs border-collapse">
                        <thead>
                          <tr className="bg-[#121828]/50 border-b border-[#192238] text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                            <th className="py-2.5 px-4">Name</th>
                            <th className="py-2.5 px-4 hidden sm:table-cell">Project</th>
                            <th className="py-2.5 px-4 hidden md:table-cell">Size</th>
                            <th className="py-2.5 px-4 hidden lg:table-cell">Modified</th>
                            <th className="py-2.5 px-4 text-right">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#192238]/60 text-slate-300">
                          {currentViewFiles.map(file => {
                            const { icon, color } = getFileIcon(file.type);
                            const canEdit = canModifyProject(file.projectId);
                            const canDel = canDeleteProjectData(file.projectId);
                            const isMenuOpen = openMenuId === `file_${file.id}`;

                            return (
                              <tr
                                key={file.id}
                                className="hover:bg-[#161d2f]/70 transition-colors group cursor-pointer"
                                onClick={(e) => handleDownloadFile(e, file.id)}
                              >
                                <td className="py-3 px-4">
                                  <div className="flex items-center gap-3 min-w-0">
                                    <div className="w-8 h-8 rounded-lg bg-[#161d2f] border border-[#1f2a44] flex items-center justify-center shrink-0">
                                      <i className={`${icon} ${color} text-sm`}></i>
                                    </div>
                                    <div className="min-w-0">
                                      <span className="font-semibold text-white truncate block group-hover:text-purple-300 transition" title={file.name}>
                                        {file.name}
                                      </span>
                                      <span className="text-[10px] text-slate-500 uppercase sm:hidden">
                                        {formatSize(file.size)}
                                      </span>
                                    </div>
                                  </div>
                                </td>
                                <td className="py-3 px-4 hidden sm:table-cell text-slate-400 text-xs truncate max-w-[150px]">
                                  {file.project?.name || 'Project'}
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
                                      onClick={(e) => handleDownloadFile(e, file.id)}
                                      title="Download file"
                                      className="w-7 h-7 flex items-center justify-center rounded text-slate-400 hover:text-white hover:bg-[#1a2333] transition"
                                    >
                                      <i className="fa-solid fa-download text-xs"></i>
                                    </button>
                                    {canEdit && (
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setEditingFile(file);
                                          setFileForm({ name: file.name, projectId: file.projectId });
                                          setShowFileModal(true);
                                        }}
                                        title="Rename file"
                                        className="w-7 h-7 flex items-center justify-center rounded text-slate-400 hover:text-white hover:bg-[#1a2333] transition"
                                      >
                                        <i className="fa-solid fa-pen text-xs"></i>
                                      </button>
                                    )}
                                    {canDel && (
                                      <button
                                        type="button"
                                        onClick={() => setConfirmDelete({ type: 'file', id: file.id, name: file.name })}
                                        title="Delete file"
                                        className="w-7 h-7 flex items-center justify-center rounded text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition"
                                      >
                                        <i className="fa-solid fa-trash text-xs"></i>
                                      </button>
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
                      {currentViewFiles.map(file => {
                        const { icon, color } = getFileIcon(file.type);
                        return (
                          <div
                            key={file.id}
                            onClick={(e) => handleDownloadFile(e, file.id)}
                            className="group bg-[#161d2f] border border-[#1f2a44] rounded-xl p-3.5 flex flex-col hover:border-[#384366] transition shadow-sm relative cursor-pointer"
                          >
                            <div className="flex items-start justify-between mb-2.5">
                              <i className={`${icon} ${color} text-2xl`}></i>
                              <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400 bg-[#0f1422] px-2 py-0.5 rounded">
                                {file.type || 'file'}
                              </span>
                            </div>
                            <h4 className="text-xs font-bold text-white truncate mb-0.5" title={file.name}>
                              {file.name}
                            </h4>
                            <p className="text-[10px] text-slate-400 truncate mb-3">
                              {file.project?.name}
                            </p>
                            <div className="mt-auto pt-2 border-t border-[#1f2a44]/60 flex items-center justify-between text-[10px] text-slate-400">
                              <span>{formatSize(file.size)}</span>
                              <span>{new Date(file.updatedAt).toLocaleDateString()}</span>
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
        )}
      </div>

      {/* RIGHT SIDEBAR (Compact, Dynamic Storage Usage, Recent Activity, Quick Actions) */}
      <div className="w-full lg:w-[280px] xl:w-[320px] shrink-0 flex flex-col gap-4">
        
        {/* Dynamic Context-Aware Storage Usage Component */}
        <StorageUsage
          activeTab={activeTab}
          viewFiles={currentViewFiles}
          allDevhubFiles={files}
          quotas={quotas}
          loading={quotasLoading}
          onRefresh={fetchQuotas}
        />

        {/* Compact Recent Activity */}
        <div className="bg-[#0f1422] border border-[#192238] rounded-2xl p-4 shadow-sm flex flex-col max-h-[280px]">
          <div className="flex items-center justify-between mb-3 shrink-0">
            <h2 className="text-xs font-bold text-white tracking-tight uppercase flex items-center gap-1.5">
              <i className="fa-regular fa-clock text-purple-400"></i>
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
            <i className="fa-solid fa-bolt text-purple-400"></i>
            <span>Quick Actions</span>
          </h2>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => {
                setEditingFile(null);
                setFileForm({ name: '', projectId: currentProjectId || (projects[0]?.id || '') });
                setSelectedFiles(null);
                setShowFileModal(true);
              }}
              className="flex items-center gap-2 p-2 rounded-xl bg-[#161d2f] hover:bg-[#1a2333] border border-[#1f2a44] text-slate-300 hover:text-white text-xs font-bold transition text-left"
            >
              <i className="fa-solid fa-upload text-purple-400 w-3"></i>
              <span>Upload</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setEditingFolder(null);
                setFolderForm({ name: '', projectId: currentProjectId || (projects[0]?.id || '') });
                setShowFolderModal(true);
              }}
              className="flex items-center gap-2 p-2 rounded-xl bg-[#161d2f] hover:bg-[#1a2333] border border-[#1f2a44] text-slate-300 hover:text-white text-xs font-bold transition text-left"
            >
              <i className="fa-solid fa-folder-plus text-indigo-400 w-3"></i>
              <span>Folder</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('Google Drive')}
              className="flex items-center gap-2 p-2 rounded-xl bg-[#161d2f] hover:bg-[#1a2333] border border-[#1f2a44] text-slate-300 hover:text-white text-xs font-bold transition text-left"
            >
              <i className="fa-brands fa-google-drive text-amber-400 w-3"></i>
              <span>Drive</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setActiveTab('All Files');
                handleGoRoot();
              }}
              className="flex items-center gap-2 p-2 rounded-xl bg-[#161d2f] hover:bg-[#1a2333] border border-[#1f2a44] text-slate-300 hover:text-white text-xs font-bold transition text-left"
            >
              <i className="fa-solid fa-house text-emerald-400 w-3"></i>
              <span>Root</span>
            </button>
          </div>
        </div>

      </div>

      {/* Folder Modal */}
      {showFolderModal && (
        <Modal open={showFolderModal} onClose={() => setShowFolderModal(false)} className="max-w-sm p-6">
          <h2 className="text-base text-white font-bold mb-4">
            {editingFolder ? 'Rename Folder' : 'New Folder'}
          </h2>
          <form onSubmit={handleSaveFolder} className="flex flex-col gap-4">
            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                Project <span className="text-red-500">*</span>
              </label>
              <select
                required
                disabled={Boolean(editingFolder)}
                value={folderForm.projectId}
                onChange={e => setFolderForm({ ...folderForm, projectId: e.target.value })}
                className="w-full bg-[#161d2f] border border-[#1f2a44] rounded-xl px-4 py-2.5 text-xs font-semibold text-white focus:outline-none focus:border-purple-500 transition disabled:opacity-50"
              >
                <option value="" disabled>Select a project</option>
                {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                Folder Name <span className="text-red-500">*</span>
              </label>
              <input
                required
                value={folderForm.name}
                onChange={e => setFolderForm({ ...folderForm, name: e.target.value })}
                placeholder="E.g. Documents"
                className="w-full bg-[#161d2f] border border-[#1f2a44] rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:border-purple-500 transition shadow-inner"
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
                className="px-5 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-xs font-bold shadow-lg shadow-purple-900/30 transition disabled:opacity-50 flex items-center gap-2"
              >
                {folderSubmitting && <i className="fa-solid fa-spinner fa-spin"></i>}
                <span>Save</span>
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* File Upload / Rename Modal */}
      {showFileModal && (
        <Modal open={showFileModal} onClose={() => setShowFileModal(false)} className="max-w-sm p-6">
          <h2 className="text-base text-white font-bold mb-4">
            {editingFile ? 'Rename File' : 'Upload Files'}
          </h2>
          <form onSubmit={handleSaveFile} className="flex flex-col gap-4">
            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                Project <span className="text-red-500">*</span>
              </label>
              <select
                required
                disabled={Boolean(editingFile)}
                value={fileForm.projectId}
                onChange={e => setFileForm({ ...fileForm, projectId: e.target.value })}
                className="w-full bg-[#161d2f] border border-[#1f2a44] rounded-xl px-4 py-2.5 text-xs font-semibold text-white focus:outline-none focus:border-purple-500 transition disabled:opacity-50"
              >
                <option value="" disabled>Select a project</option>
                {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            {editingFile ? (
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                  File Name <span className="text-red-500">*</span>
                </label>
                <input
                  required
                  value={fileForm.name}
                  onChange={e => setFileForm({ ...fileForm, name: e.target.value })}
                  placeholder="E.g. Roadmap.pdf"
                  className="w-full bg-[#161d2f] border border-[#1f2a44] rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:border-purple-500 transition shadow-inner"
                />
              </div>
            ) : (
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                  Select Files <span className="text-red-500">*</span>
                </label>
                <input
                  required
                  type="file"
                  multiple
                  onChange={e => setSelectedFiles(e.target.files)}
                  className="w-full bg-[#161d2f] border border-[#1f2a44] rounded-xl px-4 py-2.5 text-xs text-slate-400 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-purple-500/20 file:text-purple-400 hover:file:bg-purple-500/30 transition shadow-inner"
                />
              </div>
            )}
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
                className="px-5 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-xs font-bold shadow-lg shadow-purple-900/30 transition disabled:opacity-50 flex items-center gap-2"
              >
                {fileSubmitting && <i className="fa-solid fa-spinner fa-spin"></i>}
                <span>{editingFile ? 'Save Changes' : 'Upload'}</span>
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

    </div>
  );
}