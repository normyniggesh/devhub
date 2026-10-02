import React, { useState, useEffect, useMemo, useRef } from 'react';
import { apiClient } from '../../api/client';
import ProviderBadge from './ProviderBadge';
import Breadcrumbs from './Breadcrumbs';
import FileToolbar from './FileToolbar';
import FolderRow from './FolderRow';
import FileRow from './FileRow';
import { formatSize } from '../../utils/formatting';

export default function FileBrowser({
  provider = 'local', // 'local' | 'devhub' | 'gdrive'
  title = 'File Browser',
  currentUser,
  projects = [],
  selectedProjectId = '',
  onSelectProject,
  integration = null, // for google_drive
  onConnectIntegration,
  transferManager,
  onPreviewFile,
  className = ''
}) {
  // Navigation
  const [currentPath, setCurrentPath] = useState([]); // [{ id, name, handle? }]
  const [folders, setFolders] = useState([]);
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Local PC Handle State
  const [localRootHandle, setLocalRootHandle] = useState(null);
  const [currentDirHandle, setCurrentDirHandle] = useState(null);

  // Search & Sort
  const [searchQuery, setSearchQuery] = useState('');
  const [sortConfig, setSortConfig] = useState({ key: 'name', direction: 'asc' });

  // Selection
  const [selectedIds, setSelectedIds] = useState(new Set());

  // Drag over pane state
  const [isPaneDragOver, setIsPaneDragOver] = useState(false);
  const fileInputRef = useRef(null);

  // Check File System Access API support
  const isFileSystemAccessSupported = typeof window !== 'undefined' && 'showDirectoryPicker' in window;

  // ----------------------------------------------------
  // Load Content for Provider
  // ----------------------------------------------------

  // 1. LOCAL PC BROWSER
  const loadLocalDirectory = async (dirHandle) => {
    if (!dirHandle) return;
    try {
      setLoading(true);
      setError(null);
      const subFolders = [];
      const subFiles = [];

      // Iterate handles
      for await (const entry of dirHandle.values()) {
        if (entry.kind === 'directory') {
          subFolders.push({
            id: entry.name,
            name: entry.name,
            handle: entry,
            isFolder: true
          });
        } else if (entry.kind === 'file') {
          const fileData = await entry.getFile();
          subFiles.push({
            id: entry.name,
            name: entry.name,
            size: fileData.size,
            lastModified: fileData.lastModified,
            mimeType: fileData.type,
            handle: entry,
            isFolder: false
          });
        }
      }

      setFolders(subFolders);
      setFiles(subFiles);
      setSelectedIds(new Set());
    } catch (err) {
      console.error('Error reading local directory:', err);
      setError(err.message || 'Permission denied or unable to read folder');
    } finally {
      setLoading(false);
    }
  };

  const handleConnectLocalFolder = async () => {
    if (!isFileSystemAccessSupported) {
      alert('Your browser does not support the File System Access API. Please use Google Chrome, Edge, or Opera.');
      return;
    }
    try {
      const handle = await window.showDirectoryPicker({ mode: 'readwrite' });
      setLocalRootHandle(handle);
      setCurrentDirHandle(handle);
      setCurrentPath([]);
      await loadLocalDirectory(handle);
    } catch (err) {
      if (err.name !== 'AbortError') {
        setError(err.message || 'Failed to select folder');
      }
    }
  };

  // 2. DEVHUB S3 BROWSER
  const loadDevhubFiles = async (projId, folderId = null) => {
    if (!projId) {
      setFolders([]);
      setFiles([]);
      return;
    }
    try {
      setLoading(true);
      setError(null);
      const [fRes, dRes] = await Promise.all([
        apiClient(`/files?projectId=${projId}&folderId=${folderId || 'null'}`),
        apiClient(`/folders?projectId=${projId}&parentId=${folderId || 'null'}`)
      ]);
      setFiles(fRes.files || []);
      setFolders(dRes.folders || []);
      setSelectedIds(new Set());
    } catch (err) {
      console.error('Error loading DEVHUB files:', err);
      setError(err.message || 'Failed to load DEVHUB files');
    } finally {
      setLoading(false);
    }
  };

  // 3. GOOGLE DRIVE BROWSER
  const loadGoogleDriveFiles = async (folderId = 'root') => {
    if (!integration?.connected) return;
    try {
      setLoading(true);
      setError(null);
      const res = await apiClient(`/integrations/google_drive/files?folderId=${folderId}`);
      const list = res.files || [];
      const driveFolders = list.filter(f => f.isFolder);
      const driveFiles = list.filter(f => !f.isFolder);
      setFolders(driveFolders);
      setFiles(driveFiles);
      setSelectedIds(new Set());
    } catch (err) {
      console.error('Error loading Google Drive files:', err);
      setError(err.message || 'Failed to load Google Drive files');
    } finally {
      setLoading(false);
    }
  };

  // Effect to load on path/project change
  useEffect(() => {
    if (provider === 'local') {
      if (currentDirHandle) {
        loadLocalDirectory(currentDirHandle);
      }
    } else if (provider === 'devhub') {
      const activeFolderId = currentPath.length > 0 ? currentPath[currentPath.length - 1].id : null;
      loadDevhubFiles(selectedProjectId, activeFolderId);
    } else if (provider === 'gdrive') {
      if (integration?.connected) {
        const activeFolderId = currentPath.length > 0 ? currentPath[currentPath.length - 1].id : 'root';
        loadGoogleDriveFiles(activeFolderId);
      }
    }
  }, [provider, selectedProjectId, currentDirHandle, integration?.connected, currentPath]);

  // ----------------------------------------------------
  // Navigation Handlers
  // ----------------------------------------------------
  const handleOpenFolder = async (folder) => {
    if (provider === 'local') {
      if (folder.handle) {
        setCurrentDirHandle(folder.handle);
        setCurrentPath(prev => [...prev, { id: folder.name, name: folder.name, handle: folder.handle }]);
      }
    } else if (provider === 'devhub') {
      setCurrentPath(prev => [...prev, { id: folder.id, name: folder.name }]);
    } else if (provider === 'gdrive') {
      setCurrentPath(prev => [...prev, { id: folder.id, name: folder.name }]);
    }
  };

  const handleNavigateCrumb = async (crumb, index) => {
    if (index === -1) {
      // Go to root
      setCurrentPath([]);
      if (provider === 'local') {
        setCurrentDirHandle(localRootHandle);
      }
    } else {
      const newPath = currentPath.slice(0, index + 1);
      setCurrentPath(newPath);
      if (provider === 'local' && crumb.handle) {
        setCurrentDirHandle(crumb.handle);
      }
    }
  };

  const handleGoUp = () => {
    if (currentPath.length <= 1) {
      handleNavigateCrumb(null, -1);
    } else {
      handleNavigateCrumb(currentPath[currentPath.length - 2], currentPath.length - 2);
    }
  };

  const refreshCurrentView = () => {
    if (provider === 'local') {
      loadLocalDirectory(currentDirHandle);
    } else if (provider === 'devhub') {
      const activeFolderId = currentPath.length > 0 ? currentPath[currentPath.length - 1].id : null;
      loadDevhubFiles(selectedProjectId, activeFolderId);
    } else if (provider === 'gdrive') {
      const activeFolderId = currentPath.length > 0 ? currentPath[currentPath.length - 1].id : 'root';
      loadGoogleDriveFiles(activeFolderId);
    }
  };

  // ----------------------------------------------------
  // Selection
  // ----------------------------------------------------
  const handleToggleSelect = (id) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const allVisibleItems = useMemo(() => [...folders, ...files], [folders, files]);

  const handleSelectAll = () => {
    const next = new Set();
    allVisibleItems.forEach(item => next.add(item.id || item.name));
    setSelectedIds(next);
  };

  const handleClearSelection = () => {
    setSelectedIds(new Set());
  };

  const getSelectedItems = () => {
    return allVisibleItems.filter(item => selectedIds.has(item.id || item.name));
  };

  // ----------------------------------------------------
  // Clipboard & Transfers
  // ----------------------------------------------------
  const getContextInfo = () => {
    const activeFolderId = currentPath.length > 0 ? currentPath[currentPath.length - 1].id : null;
    return {
      dirHandle: currentDirHandle,
      projectId: selectedProjectId,
      folderId: activeFolderId
    };
  };

  const handleCopySelected = () => {
    const selected = getSelectedItems();
    if (transferManager && selected.length > 0) {
      transferManager.copyItems(provider, selected, getContextInfo());
    }
  };

  const handleCutSelected = () => {
    const selected = getSelectedItems();
    if (transferManager && selected.length > 0) {
      transferManager.cutItems(provider, selected, getContextInfo());
    }
  };

  const handlePasteHere = async () => {
    if (!transferManager?.clipboard) return;
    try {
      await transferManager.executeTransfer(provider, getContextInfo());
      refreshCurrentView();
    } catch (err) {
      alert(`Transfer failed: ${err.message}`);
    }
  };

  // ----------------------------------------------------
  // File / Folder Actions
  // ----------------------------------------------------
  const handleCreateFolder = async () => {
    const name = window.prompt('Enter new folder name:');
    if (!name || !name.trim()) return;

    try {
      if (provider === 'local') {
        if (!currentDirHandle) return;
        await currentDirHandle.getDirectoryHandle(name.trim(), { create: true });
        refreshCurrentView();
      } else if (provider === 'devhub') {
        if (!selectedProjectId) return alert('Please select a project first');
        const activeFolderId = currentPath.length > 0 ? currentPath[currentPath.length - 1].id : null;
        await apiClient('/folders', {
          method: 'POST',
          body: {
            name: name.trim(),
            projectId: selectedProjectId,
            parentId: activeFolderId || null
          }
        });
        refreshCurrentView();
      } else if (provider === 'gdrive') {
        const activeFolderId = currentPath.length > 0 ? currentPath[currentPath.length - 1].id : 'root';
        await apiClient('/integrations/google_drive/folders', {
          method: 'POST',
          body: {
            name: name.trim(),
            parentId: activeFolderId
          }
        });
        refreshCurrentView();
      }
    } catch (err) {
      alert(`Failed to create folder: ${err.message}`);
    }
  };

  const handleDeleteItem = async (item) => {
    if (!window.confirm(`Are you sure you want to delete "${item.name}"?`)) return;

    try {
      if (provider === 'local') {
        if (currentDirHandle) {
          await currentDirHandle.removeEntry(item.name);
          refreshCurrentView();
        }
      } else if (provider === 'devhub') {
        if (item.isFolder) {
          await apiClient(`/folders/${item.id}`, { method: 'DELETE' });
        } else {
          await apiClient(`/files/${item.id}`, { method: 'DELETE' });
        }
        refreshCurrentView();
      } else if (provider === 'gdrive') {
        await apiClient(`/integrations/google_drive/files/${item.id}`, { method: 'DELETE' });
        refreshCurrentView();
      }
    } catch (err) {
      alert(`Failed to delete item: ${err.message}`);
    }
  };

  const handleDeleteSelected = async () => {
    const items = getSelectedItems();
    if (items.length === 0) return;
    if (!window.confirm(`Delete ${items.length} selected item(s)?`)) return;

    for (const item of items) {
      try {
        if (provider === 'local' && currentDirHandle) {
          await currentDirHandle.removeEntry(item.name);
        } else if (provider === 'devhub') {
          if (item.isFolder) await apiClient(`/folders/${item.id}`, { method: 'DELETE' });
          else await apiClient(`/files/${item.id}`, { method: 'DELETE' });
        } else if (provider === 'gdrive') {
          await apiClient(`/integrations/google_drive/files/${item.id}`, { method: 'DELETE' });
        }
      } catch (err) {
        console.error('Delete error for', item.name, err);
      }
    }
    refreshCurrentView();
    setSelectedIds(new Set());
  };

  const handleDownloadItem = async (file) => {
    try {
      if (provider === 'local') {
        if (file.handle) {
          const rawFile = await file.handle.getFile();
          const url = URL.createObjectURL(rawFile);
          const a = document.createElement('a');
          a.href = url;
          a.download = file.name;
          a.click();
          URL.revokeObjectURL(url);
        }
      } else if (provider === 'devhub') {
        const res = await apiClient(`/files/${file.id}/download`);
        if (res.url) window.open(res.url, '_blank');
      } else if (provider === 'gdrive') {
        window.open(`/api/integrations/google_drive/download/${file.id}`, '_blank');
      }
    } catch (err) {
      alert(`Download failed: ${err.message}`);
    }
  };

  // Upload trigger via hidden file input
  const handleFileUploadChange = async (e) => {
    const uploadFiles = e.target.files;
    if (!uploadFiles || uploadFiles.length === 0) return;

    try {
      setLoading(true);
      for (const rawFile of uploadFiles) {
        if (provider === 'local' && currentDirHandle) {
          const fileHandle = await currentDirHandle.getFileHandle(rawFile.name, { create: true });
          const writable = await fileHandle.createWritable();
          await writable.write(await rawFile.arrayBuffer());
          await writable.close();
        } else if (provider === 'devhub') {
          if (!selectedProjectId) throw new Error('Please select a project first');
          const formData = new FormData();
          formData.append('files', rawFile);
          formData.append('projectId', selectedProjectId);
          const activeFolderId = currentPath.length > 0 ? currentPath[currentPath.length - 1].id : null;
          if (activeFolderId) formData.append('folderId', activeFolderId);
          await apiClient('/files/upload', { body: formData });
        } else if (provider === 'gdrive') {
          const formData = new FormData();
          formData.append('file', rawFile);
          const activeFolderId = currentPath.length > 0 ? currentPath[currentPath.length - 1].id : 'root';
          if (activeFolderId !== 'root') formData.append('parentId', activeFolderId);
          await apiClient('/integrations/google_drive/upload', { body: formData });
        }
      }
      refreshCurrentView();
    } catch (err) {
      alert(`Upload error: ${err.message}`);
    } finally {
      setLoading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // ----------------------------------------------------
  // Drag & Drop onto Pane
  // ----------------------------------------------------
  const handlePaneDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsPaneDragOver(true);
  };

  const handlePaneDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsPaneDragOver(false);
  };

  const handlePaneDrop = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsPaneDragOver(false);

    // 1. Check if files were dropped directly from desktop/OS
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      try {
        setLoading(true);
        for (const rawFile of e.dataTransfer.files) {
          if (provider === 'local' && currentDirHandle) {
            const fileHandle = await currentDirHandle.getFileHandle(rawFile.name, { create: true });
            const writable = await fileHandle.createWritable();
            await writable.write(await rawFile.arrayBuffer());
            await writable.close();
          } else if (provider === 'devhub') {
            if (!selectedProjectId) throw new Error('Please select a DEVHUB project first');
            const formData = new FormData();
            formData.append('files', rawFile);
            formData.append('projectId', selectedProjectId);
            const activeFolderId = currentPath.length > 0 ? currentPath[currentPath.length - 1].id : null;
            if (activeFolderId) formData.append('folderId', activeFolderId);
            await apiClient('/files/upload', { body: formData });
          } else if (provider === 'gdrive') {
            const formData = new FormData();
            formData.append('file', rawFile);
            const activeFolderId = currentPath.length > 0 ? currentPath[currentPath.length - 1].id : 'root';
            if (activeFolderId !== 'root') formData.append('parentId', activeFolderId);
            await apiClient('/integrations/google_drive/upload', { body: formData });
          }
        }
        refreshCurrentView();
      } catch (err) {
        alert(`Drop upload failed: ${err.message}`);
      } finally {
        setLoading(false);
      }
      return;
    }

    // 2. Cross-pane drag drop from another pane
    const transferDataStr = e.dataTransfer.getData('application/json');
    if (transferDataStr && transferManager) {
      try {
        const data = JSON.parse(transferDataStr);
        if (data.item) {
          const isMove = e.ctrlKey ? 'copy' : 'copy';
          await transferManager.executeTransfer(
            provider,
            getContextInfo(),
            [data.item],
            isMove,
            data.sourceProvider
          );
          refreshCurrentView();
        }
      } catch (err) {
        console.error('Drag & drop transfer error:', err);
      }
    }
  };

  // Dropping directly onto a specific folder
  const handleDropOnFolder = async (e, targetFolder) => {
    const transferDataStr = e.dataTransfer.getData('application/json');
    if (!transferDataStr || !transferManager) return;
    try {
      const data = JSON.parse(transferDataStr);
      let targetContext;
      if (provider === 'local') {
        targetContext = { dirHandle: targetFolder.handle };
      } else if (provider === 'devhub') {
        targetContext = { projectId: selectedProjectId, folderId: targetFolder.id };
      } else if (provider === 'gdrive') {
        targetContext = { folderId: targetFolder.id };
      }

      await transferManager.executeTransfer(
        provider,
        targetContext,
        [data.item],
        'copy',
        data.sourceProvider
      );
      refreshCurrentView();
    } catch (err) {
      alert(`Folder drop failed: ${err.message}`);
    }
  };

  // ----------------------------------------------------
  // Filtered & Sorted Items
  // ----------------------------------------------------
  const filteredFolders = useMemo(() => {
    return folders.filter(f => f.name.toLowerCase().includes(searchQuery.toLowerCase()))
      .sort((a, b) => {
        if (sortConfig.key === 'name') {
          return sortConfig.direction === 'asc' ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name);
        }
        return 0;
      });
  }, [folders, searchQuery, sortConfig]);

  const filteredFiles = useMemo(() => {
    return files.filter(f => f.name.toLowerCase().includes(searchQuery.toLowerCase()))
      .sort((a, b) => {
        if (sortConfig.key === 'name') {
          return sortConfig.direction === 'asc' ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name);
        }
        if (sortConfig.key === 'size') {
          const sizeA = a.size || 0;
          const sizeB = b.size || 0;
          return sortConfig.direction === 'asc' ? sizeA - sizeB : sizeB - sizeA;
        }
        if (sortConfig.key === 'date') {
          const dateA = new Date(a.lastModified || a.updatedAt || 0).getTime();
          const dateB = new Date(b.lastModified || b.updatedAt || 0).getTime();
          return sortConfig.direction === 'asc' ? dateA - dateB : dateB - dateA;
        }
        return 0;
      });
  }, [files, searchQuery, sortConfig]);

  // Root name for breadcrumbs
  const getRootName = () => {
    if (provider === 'local') return localRootHandle?.name || 'This PC';
    if (provider === 'devhub') {
      const proj = projects.find(p => p.id === selectedProjectId);
      return proj?.name || 'Select Project';
    }
    if (provider === 'gdrive') return 'My Drive';
    return 'Root';
  };

  const getRootIcon = () => {
    if (provider === 'local') return 'fa-laptop';
    if (provider === 'devhub') return 'fa-server';
    if (provider === 'gdrive') return 'fa-brands fa-google-drive';
    return 'fa-folder';
  };

  const isConnected = provider === 'local'
    ? Boolean(localRootHandle)
    : provider === 'devhub'
    ? Boolean(selectedProjectId)
    : Boolean(integration?.connected);

  const canPaste = Boolean(transferManager?.clipboard && transferManager.clipboard.items?.length > 0 && isConnected);
  const pasteCount = transferManager?.clipboard?.items?.length || 0;

  return (
    <div
      onDragOver={handlePaneDragOver}
      onDragLeave={handlePaneDragLeave}
      onDrop={handlePaneDrop}
      className={`bg-[#0f1422] border rounded-2xl p-4 shadow-sm flex flex-col gap-3 min-w-0 transition-all ${
        isPaneDragOver
          ? 'border-indigo-500 ring-2 ring-indigo-500/30 bg-[#12192c]'
          : 'border-[#192238] hover:border-[#202b46]'
      } ${className}`}
    >
      {/* Hidden File Input for Native Upload */}
      <input
        type="file"
        multiple
        ref={fileInputRef}
        onChange={handleFileUploadChange}
        className="hidden"
      />

      {/* Pane Header: Provider Badge + Project / Account Selector */}
      <div className="flex items-center justify-between gap-2 pb-2.5 border-b border-[#192238] flex-wrap">
        <div className="flex items-center gap-2">
          <ProviderBadge provider={provider} />
          <span className="font-bold text-xs text-white">{title}</span>
        </div>

        {/* Custom Header controls based on provider */}
        {provider === 'devhub' && (
          <div className="flex items-center gap-1.5 max-w-[200px]">
            <select
              value={selectedProjectId}
              onChange={(e) => onSelectProject && onSelectProject(e.target.value)}
              className="w-full appearance-none bg-[#161d2f] border border-[#1f2a44] rounded-xl px-2.5 py-1 text-[11px] font-bold text-white focus:outline-none focus:border-purple-500 transition cursor-pointer truncate"
            >
              <option value="" disabled>Select Project</option>
              {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
        )}

        {provider === 'gdrive' && integration?.connected && (
          <div className="flex items-center gap-1 text-[11px] text-emerald-400 font-semibold truncate max-w-[180px]">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
            <span className="truncate">{integration.accountName || 'Connected'}</span>
          </div>
        )}
      </div>

      {/* Breadcrumb Path */}
      {isConnected && (
        <Breadcrumbs
          items={currentPath}
          onNavigate={handleNavigateCrumb}
          onGoUp={handleGoUp}
          rootName={getRootName()}
          rootIcon={getRootIcon()}
        />
      )}

      {/* Toolbar Controls */}
      {isConnected && (
        <FileToolbar
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          sortConfig={sortConfig}
          onSortChange={setSortConfig}
          onCreateFolder={handleCreateFolder}
          onUploadFile={() => fileInputRef.current && fileInputRef.current.click()}
          onPaste={handlePasteHere}
          canPaste={canPaste}
          pasteCount={pasteCount}
          onRefresh={refreshCurrentView}
          selectedCount={selectedIds.size}
          totalCount={allVisibleItems.length}
          onSelectAll={handleSelectAll}
          onClearSelection={handleClearSelection}
          onCopySelected={handleCopySelected}
          onCutSelected={handleCutSelected}
          onDeleteSelected={handleDeleteSelected}
          onDownloadSelected={() => {
            const selected = getSelectedItems();
            selected.filter(i => !i.isFolder).forEach(f => handleDownloadItem(f));
          }}
        />
      )}

      {/* Pane Body */}
      <div className="flex-1 min-h-[360px] max-h-[600px] overflow-y-auto pr-1 flex flex-col gap-1.5">
        {/* State 1: Local PC Not Connected */}
        {provider === 'local' && !localRootHandle ? (
          <div className="flex flex-col items-center justify-center p-8 bg-[#090c14] border border-dashed border-[#1e2538] rounded-2xl flex-1 text-center gap-3.5 my-auto">
            <div className="w-12 h-12 rounded-2xl bg-sky-500/10 border border-sky-500/20 flex items-center justify-center text-sky-400 text-xl">
              <i className="fa-solid fa-laptop"></i>
            </div>
            <div>
              <h4 className="text-sm font-bold text-white mb-1">Connect This PC Folder</h4>
              <p className="text-[11px] text-slate-400 max-w-xs leading-relaxed">
                Authorize a local folder to browse, copy, and transfer files between your PC, DEVHUB, and Google Drive.
              </p>
            </div>
            <button
              type="button"
              onClick={handleConnectLocalFolder}
              className="px-4 py-2 bg-sky-600 hover:bg-sky-500 text-white rounded-xl text-xs font-bold transition flex items-center gap-2 shadow-lg shadow-sky-950/40 active:scale-95"
            >
              <i className="fa-solid fa-folder-open text-xs"></i>
              <span>Select PC Folder</span>
            </button>
            <span className="text-[10px] text-slate-500 italic">
              Your browser will prompt for permission. Zero silent access.
            </span>
          </div>
        ) : provider === 'devhub' && !selectedProjectId ? (
          /* State 2: DEVHUB No Project Selected */
          <div className="flex flex-col items-center justify-center p-8 bg-[#090c14] border border-dashed border-[#1e2538] rounded-2xl flex-1 text-center gap-3 my-auto">
            <i className="fa-solid fa-server text-3xl text-slate-600"></i>
            <h4 className="text-sm font-bold text-white">Select a Project</h4>
            <p className="text-[11px] text-slate-400 max-w-xs">
              Select a project from the top dropdown to view and manage DEVHUB S3 workspace files.
            </p>
          </div>
        ) : provider === 'gdrive' && !integration?.connected ? (
          /* State 3: Google Drive Not Connected */
          <div className="flex flex-col items-center justify-center p-8 bg-[#090c14] border border-dashed border-[#1e2538] rounded-2xl flex-1 text-center gap-3.5 my-auto">
            <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 text-xl">
              <i className="fa-brands fa-google-drive"></i>
            </div>
            <div>
              <h4 className="text-sm font-bold text-white mb-1">Connect Personal Google Drive</h4>
              <p className="text-[11px] text-slate-400 max-w-xs leading-relaxed">
                Connect your personal Google account to browse, download, copy, move, and edit Google Drive files.
              </p>
            </div>
            {onConnectIntegration ? (
              <button
                type="button"
                onClick={() => onConnectIntegration('google_drive')}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition flex items-center gap-2 shadow-lg shadow-emerald-950/40 active:scale-95"
              >
                <i className="fa-brands fa-google text-xs"></i>
                <span>Connect Google Drive</span>
              </button>
            ) : (
              <span className="text-xs text-slate-500">Not connected</span>
            )}
          </div>
        ) : loading ? (
          /* State 4: Loading */
          <div className="flex flex-col items-center justify-center py-20 text-slate-400 gap-2">
            <i className="fa-solid fa-circle-notch fa-spin text-xl text-indigo-400"></i>
            <span className="text-xs">Loading items...</span>
          </div>
        ) : error ? (
          /* State 5: Error */
          <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
            <i className="fa-solid fa-circle-exclamation text-rose-400 shrink-0"></i>
            <span>{error}</span>
          </div>
        ) : allVisibleItems.length === 0 ? (
          /* State 6: Empty Folder */
          <div className="flex flex-col items-center justify-center py-16 text-center text-slate-500 border border-dashed border-[#1e2538] rounded-xl gap-2 my-auto">
            <i className="fa-regular fa-folder-open text-3xl opacity-40"></i>
            <span className="text-xs font-medium">This folder is empty</span>
            <span className="text-[10px] text-slate-600">Drag files here or use Upload above</span>
          </div>
        ) : (
          /* State 7: List of Folders and Files */
          <div className="space-y-1.5">
            {/* Folders */}
            {filteredFolders.map(folder => (
              <FolderRow
                key={folder.id || folder.name}
                folder={folder}
                provider={provider}
                isSelected={selectedIds.has(folder.id || folder.name)}
                onToggleSelect={handleToggleSelect}
                onOpenFolder={handleOpenFolder}
                onDelete={handleDeleteItem}
                onCopy={(item) => transferManager && transferManager.copyItems(provider, [item], getContextInfo())}
                onCut={(item) => transferManager && transferManager.cutItems(provider, [item], getContextInfo())}
                onDropOnFolder={handleDropOnFolder}
              />
            ))}

            {/* Files */}
            {filteredFiles.map(file => (
              <FileRow
                key={file.id || file.name}
                file={file}
                provider={provider}
                isSelected={selectedIds.has(file.id || file.name)}
                onToggleSelect={handleToggleSelect}
                onPreview={onPreviewFile ? (f) => onPreviewFile(f, provider) : undefined}
                onDownload={handleDownloadItem}
                onCopy={(item) => transferManager && transferManager.copyItems(provider, [item], getContextInfo())}
                onCut={(item) => transferManager && transferManager.cutItems(provider, [item], getContextInfo())}
                onDelete={handleDeleteItem}
              />
            ))}
          </div>
        )}
      </div>

      {/* Pane Footer: Item count & Storage info */}
      {isConnected && (
        <div className="flex items-center justify-between pt-2 border-t border-[#192238] text-[10px] text-slate-500 shrink-0">
          <span>{filteredFolders.length} folder{filteredFolders.length !== 1 ? 's' : ''}, {filteredFiles.length} file{filteredFiles.length !== 1 ? 's' : ''}</span>
          <span className="text-slate-400 font-medium">
            {formatSize(filteredFiles.reduce((acc, f) => acc + (f.size || 0), 0))}
          </span>
        </div>
      )}
    </div>
  );
}
