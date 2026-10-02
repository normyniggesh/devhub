import React, { useState, useEffect, useMemo, useRef } from 'react';
import { apiClient } from '../../api/client';
import ProviderSelector from './ProviderSelector';
import Breadcrumbs from './Breadcrumbs';
import FileToolbar from './FileToolbar';
import FileList from './FileList';
import FileSelection from './FileSelection';

export default function FileWorkspacePane({
  paneId,
  provider = 'local', // 'local' | 'devhub' | 'gdrive'
  onChangeProvider,
  onClosePane,
  canClose = false,
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
  // Navigation & Path state
  const [currentPath, setCurrentPath] = useState([]); // [{ id, name, handle?, virtual? }]
  const [folders, setFolders] = useState([]);
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Search & Sort state
  const [searchQuery, setSearchQuery] = useState('');
  const [sortConfig, setSortConfig] = useState({ key: 'name', direction: 'asc' });

  // Selection
  const [selectedIds, setSelectedIds] = useState(new Set());

  // Drag over pane state
  const [isPaneDragOver, setIsPaneDragOver] = useState(false);

  // Hidden native file input & directory fallback input
  const fileInputRef = useRef(null);
  const dirFallbackInputRef = useRef(null);

  // Check if File System Access API is supported
  const isFSAccessSupported = typeof window !== 'undefined' && 'showDirectoryPicker' in window;
  const [isFallbackMode, setIsFallbackMode] = useState(false);

  // Local PC State: Authorized Locations Map
  // stores { id, name, handle, type: 'handle' | 'virtual', files: [...] }
  const [authorizedLocations, setAuthorizedLocations] = useState(() => {
    return [
      { id: 'loc-docs', name: 'Documents', isPreset: true },
      { id: 'loc-downloads', name: 'Downloads', isPreset: true },
      { id: 'loc-desktop', name: 'Desktop', isPreset: true },
      { id: 'loc-pictures', name: 'Pictures', isPreset: true }
    ];
  });
  const [activeLocation, setActiveLocation] = useState(null);
  const [currentDirHandle, setCurrentDirHandle] = useState(null);
  const [virtualFolderTree, setVirtualFolderTree] = useState(null);

  // DEVHUB state
  const [activeDevhubProjectId, setActiveDevhubProjectId] = useState(selectedProjectId || (projects[0]?.id || ''));

  useEffect(() => {
    if (selectedProjectId && selectedProjectId !== activeDevhubProjectId) {
      setActiveDevhubProjectId(selectedProjectId);
    }
  }, [selectedProjectId]);

  // Reset selections on provider or path changes
  useEffect(() => {
    setSelectedIds(new Set());
    setError(null);
  }, [provider, currentPath]);

  // --------------------------------------------------------------------------
  // 1. THIS PC: LOCAL FILE SYSTEM & FALLBACK
  // --------------------------------------------------------------------------

  // Connect / Authorize a local directory
  const handleAuthorizeLocalFolder = async (startInPreset = null) => {
    if (isFSAccessSupported) {
      try {
        const options = { mode: 'readwrite' };
        if (startInPreset) {
          options.startIn = startInPreset;
        }
        const handle = await window.showDirectoryPicker(options);
        const newLoc = {
          id: `loc-${Date.now()}-${handle.name}`,
          name: handle.name,
          handle,
          type: 'handle'
        };

        setAuthorizedLocations(prev => {
          const filtered = prev.filter(l => l.name !== handle.name);
          return [newLoc, ...filtered];
        });

        setActiveLocation(newLoc);
        setCurrentDirHandle(handle);
        setCurrentPath([{ id: newLoc.id, name: newLoc.name, handle }]);
        await loadLocalHandleDirectory(handle);
        setIsFallbackMode(false);
      } catch (err) {
        if (err.name !== 'AbortError') {
          console.warn('showDirectoryPicker failed, falling back to directory input:', err);
          // If browser blocked it or failed, trigger standard webkit directory input
          triggerFallbackDirectoryPicker();
        }
      }
    } else {
      // Standard directory picker fallback
      triggerFallbackDirectoryPicker();
    }
  };

  const triggerFallbackDirectoryPicker = () => {
    setIsFallbackMode(true);
    if (dirFallbackInputRef.current) {
      dirFallbackInputRef.current.value = '';
      dirFallbackInputRef.current.click();
    }
  };

  // Handle files selected via webkitdirectory fallback
  const handleFallbackDirectorySelected = (e) => {
    const rawFiles = Array.from(e.target.files || []);
    if (rawFiles.length === 0) return;

    // Parse webkitRelativePath into a tree
    const rootName = rawFiles[0].webkitRelativePath?.split('/')[0] || 'Selected Folder';
    const tree = { name: rootName, isFolder: true, subfolders: {}, files: [] };

    rawFiles.forEach(file => {
      const parts = (file.webkitRelativePath || file.name).split('/');
      // Skip the root name
      let currentLevel = tree;
      for (let i = 1; i < parts.length - 1; i++) {
        const folderName = parts[i];
        if (!currentLevel.subfolders[folderName]) {
          currentLevel.subfolders[folderName] = {
            name: folderName,
            isFolder: true,
            subfolders: {},
            files: []
          };
        }
        currentLevel = currentLevel.subfolders[folderName];
      }
      currentLevel.files.push({
        id: `${file.name}-${file.lastModified}-${file.size}`,
        name: file.name,
        size: file.size,
        lastModified: file.lastModified,
        mimeType: file.type || 'application/octet-stream',
        file,
        isFolder: false
      });
    });

    const newLoc = {
      id: `loc-virtual-${Date.now()}`,
      name: rootName,
      type: 'virtual',
      tree
    };

    setAuthorizedLocations(prev => [newLoc, ...prev.filter(l => l.name !== rootName)]);
    setActiveLocation(newLoc);
    setVirtualFolderTree(tree);
    setCurrentPath([{ id: newLoc.id, name: rootName, virtualNode: tree }]);
    renderVirtualNode(tree);
  };

  const renderVirtualNode = (node) => {
    const subFolders = Object.values(node.subfolders || {}).map(sf => ({
      id: sf.name,
      name: sf.name,
      isFolder: true,
      virtualNode: sf
    }));
    setFolders(subFolders);
    setFiles(node.files || []);
  };

  // Load directories from FileSystemDirectoryHandle
  const loadLocalHandleDirectory = async (dirHandle) => {
    if (!dirHandle) return;
    try {
      setLoading(true);
      setError(null);
      const subFolders = [];
      const subFiles = [];

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
            file: fileData,
            isFolder: false
          });
        }
      }

      setFolders(subFolders);
      setFiles(subFiles);
    } catch (err) {
      console.error('Error reading local directory:', err);
      setError('Permission required or unable to read directory.');
    } finally {
      setLoading(false);
    }
  };

  // --------------------------------------------------------------------------
  // 2. DEVHUB: S3 / DATABASE WORKSPACE
  // --------------------------------------------------------------------------

  const loadDevhubFiles = async (projId, folderId = null) => {
    if (!projId) {
      setFolders([]);
      setFiles([]);
      return;
    }
    try {
      setLoading(true);
      setError(null);
      const res = await apiClient(`/projects/${projId}/files`);
      const allFiles = res.files || [];
      const allFolders = res.folders || [];

      // Filter for current folder level
      const currentFolderId = folderId || null;
      const filteredFolders = allFolders
        .filter(f => (f.parentId || null) === currentFolderId)
        .map(f => ({ ...f, isFolder: true }));

      const filteredFiles = allFiles
        .filter(f => (f.folderId || null) === currentFolderId)
        .map(f => ({ ...f, isFolder: false }));

      setFolders(filteredFolders);
      setFiles(filteredFiles);
    } catch (err) {
      console.error('Error loading DEVHUB files:', err);
      setError(err.message || 'Failed to load DEVHUB files');
    } finally {
      setLoading(false);
    }
  };

  // --------------------------------------------------------------------------
  // 3. GOOGLE DRIVE: PERSONAL OAUTH DRIVE
  // --------------------------------------------------------------------------

  const loadGoogleDriveFiles = async (folderId = 'root') => {
    if (!integration?.connected) {
      setFolders([]);
      setFiles([]);
      return;
    }
    try {
      setLoading(true);
      setError(null);
      const endpoint = `/integrations/google_drive/files?folderId=${encodeURIComponent(folderId)}`;
      const res = await apiClient(endpoint);

      if (res.success && res.items) {
        const subFolders = [];
        const subFiles = [];

        res.items.forEach(item => {
          if (item.isFolder) {
            subFolders.push(item);
          } else {
            subFiles.push(item);
          }
        });

        setFolders(subFolders);
        setFiles(subFiles);
      } else {
        setFolders([]);
        setFiles([]);
      }
    } catch (err) {
      console.error('Error loading Google Drive files:', err);
      setError(err.message || 'Failed to access Google Drive. Check permissions.');
    } finally {
      setLoading(false);
    }
  };

  // --------------------------------------------------------------------------
  // Provider Switch / Initial Load Trigger
  // --------------------------------------------------------------------------

  useEffect(() => {
    if (provider === 'local') {
      if (currentPath.length === 0) {
        // At "This PC" root
        setFolders(authorizedLocations.map(loc => ({
          id: loc.id,
          name: loc.name,
          isFolder: true,
          isDriveLocation: true,
          isPreset: loc.isPreset,
          locationObj: loc
        })));
        setFiles([]);
        setLoading(false);
      } else {
        const top = currentPath[currentPath.length - 1];
        if (top.virtualNode) {
          renderVirtualNode(top.virtualNode);
        } else if (top.handle) {
          loadLocalHandleDirectory(top.handle);
        }
      }
    } else if (provider === 'devhub') {
      const activeFolder = currentPath.length > 0 ? currentPath[currentPath.length - 1].id : null;
      loadDevhubFiles(activeDevhubProjectId, activeFolder);
    } else if (provider === 'gdrive') {
      const activeFolder = currentPath.length > 0 ? currentPath[currentPath.length - 1].id : 'root';
      loadGoogleDriveFiles(activeFolder);
    }
  }, [provider, currentPath, activeDevhubProjectId, integration?.connected]);

  // --------------------------------------------------------------------------
  // Navigation Handlers
  // --------------------------------------------------------------------------

  const handleOpenFolder = async (folder) => {
    if (provider === 'local') {
      // If at "This PC" root and opening a location
      if (currentPath.length === 0 && folder.isDriveLocation) {
        const loc = folder.locationObj;
        if (loc.handle) {
          setActiveLocation(loc);
          setCurrentDirHandle(loc.handle);
          setCurrentPath([{ id: loc.id, name: loc.name, handle: loc.handle }]);
          await loadLocalHandleDirectory(loc.handle);
        } else if (loc.tree) {
          setActiveLocation(loc);
          setCurrentPath([{ id: loc.id, name: loc.name, virtualNode: loc.tree }]);
          renderVirtualNode(loc.tree);
        } else if (loc.isPreset) {
          // Preset clicked (e.g. Documents, Downloads) -> trigger folder picker
          const presetName = loc.name.toLowerCase();
          await handleAuthorizeLocalFolder(presetName);
        }
        return;
      }

      // Normal subfolder navigation inside local directory
      if (folder.handle) {
        setCurrentDirHandle(folder.handle);
        setCurrentPath(prev => [...prev, { id: folder.id, name: folder.name, handle: folder.handle }]);
        await loadLocalHandleDirectory(folder.handle);
      } else if (folder.virtualNode) {
        setCurrentPath(prev => [...prev, { id: folder.id, name: folder.name, virtualNode: folder.virtualNode }]);
        renderVirtualNode(folder.virtualNode);
      }
    } else if (provider === 'devhub') {
      setCurrentPath(prev => [...prev, { id: folder.id, name: folder.name }]);
    } else if (provider === 'gdrive') {
      setCurrentPath(prev => [...prev, { id: folder.id, name: folder.name }]);
    }
  };

  const handleNavigateCrumb = (index) => {
    if (index === -1) {
      // Go to root
      setCurrentPath([]);
      if (provider === 'local') {
        setActiveLocation(null);
        setCurrentDirHandle(null);
      }
      return;
    }
    const newPath = currentPath.slice(0, index + 1);
    setCurrentPath(newPath);
    if (provider === 'local') {
      const target = newPath[newPath.length - 1];
      if (target.handle) {
        setCurrentDirHandle(target.handle);
      }
    }
  };

  const handleGoUp = () => {
    if (currentPath.length === 0) return;
    if (currentPath.length === 1) {
      handleNavigateCrumb(-1);
    } else {
      handleNavigateCrumb(currentPath.length - 2);
    }
  };

  // --------------------------------------------------------------------------
  // Selection Handlers (Single click, Multi-select, Select All)
  // --------------------------------------------------------------------------

  const handleToggleSelect = (itemId) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(itemId)) next.delete(itemId);
      else next.add(itemId);
      return next;
    });
  };

  const handleSelectAll = () => {
    const allIds = [...folders.map(f => f.id), ...files.map(f => f.id)];
    setSelectedIds(new Set(allIds));
  };

  const handleClearSelection = () => {
    setSelectedIds(new Set());
  };

  const getSelectedItems = () => {
    const selected = [];
    folders.forEach(f => { if (selectedIds.has(f.id)) selected.push(f); });
    files.forEach(f => { if (selectedIds.has(f.id)) selected.push(f); });
    return selected;
  };

  // --------------------------------------------------------------------------
  // Action Handlers: Create Folder, Upload, Delete, Transfer
  // --------------------------------------------------------------------------

  const handleCreateFolder = async () => {
    const name = window.prompt('Enter new folder name:');
    if (!name || !name.trim()) return;

    try {
      if (provider === 'local') {
        if (currentDirHandle && currentDirHandle.getDirectoryHandle) {
          await currentDirHandle.getDirectoryHandle(name.trim(), { create: true });
          await loadLocalHandleDirectory(currentDirHandle);
        } else {
          // Virtual folder creation in fallback mode
          const newFolderObj = {
            name: name.trim(),
            isFolder: true,
            subfolders: {},
            files: []
          };
          setFolders(prev => [{ id: name.trim(), name: name.trim(), isFolder: true, virtualNode: newFolderObj }, ...prev]);
        }
      } else if (provider === 'devhub') {
        const currentFolderId = currentPath.length > 0 ? currentPath[currentPath.length - 1].id : null;
        await apiClient('/folders', {
          method: 'POST',
          body: {
            name: name.trim(),
            projectId: activeDevhubProjectId,
            parentId: currentFolderId
          }
        });
        await loadDevhubFiles(activeDevhubProjectId, currentFolderId);
      } else if (provider === 'gdrive') {
        const currentFolderId = currentPath.length > 0 ? currentPath[currentPath.length - 1].id : 'root';
        await apiClient('/integrations/google_drive/folders', {
          method: 'POST',
          body: {
            name: name.trim(),
            parentId: currentFolderId
          }
        });
        await loadGoogleDriveFiles(currentFolderId);
      }
    } catch (err) {
      alert(`Failed to create folder: ${err.message}`);
    }
  };

  // Upload trigger
  const handleUploadFiles = async (fileList) => {
    if (!fileList || fileList.length === 0) return;
    try {
      setLoading(true);
      const currentFolderId = currentPath.length > 0 ? currentPath[currentPath.length - 1].id : null;

      if (provider === 'local') {
        if (currentDirHandle && currentDirHandle.getFileHandle) {
          for (const rawFile of fileList) {
            const handle = await currentDirHandle.getFileHandle(rawFile.name, { create: true });
            const writable = await handle.createWritable();
            await writable.write(rawFile);
            await writable.close();
          }
          await loadLocalHandleDirectory(currentDirHandle);
        } else {
          // Add to current virtual view
          const newFiles = Array.from(fileList).map(f => ({
            id: `${f.name}-${Date.now()}`,
            name: f.name,
            size: f.size,
            lastModified: f.lastModified,
            mimeType: f.type,
            file: f,
            isFolder: false
          }));
          setFiles(prev => [...newFiles, ...prev]);
        }
      } else if (provider === 'devhub') {
        const formData = new FormData();
        Array.from(fileList).forEach(file => formData.append('files', file));
        formData.append('projectId', activeDevhubProjectId);
        if (currentFolderId) formData.append('folderId', currentFolderId);

        await apiClient('/files/upload', { body: formData });
        await loadDevhubFiles(activeDevhubProjectId, currentFolderId);
      } else if (provider === 'gdrive') {
        for (const rawFile of fileList) {
          const formData = new FormData();
          formData.append('file', rawFile);
          if (currentFolderId && currentFolderId !== 'root') {
            formData.append('parentId', currentFolderId);
          }
          await apiClient('/integrations/google_drive/upload', { body: formData });
        }
        await loadGoogleDriveFiles(currentFolderId || 'root');
      }
    } catch (err) {
      alert(`Upload failed: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  // Delete Item
  const handleDeleteItem = async (item) => {
    if (!window.confirm(`Are you sure you want to delete "${item.name}"?`)) return;
    try {
      if (provider === 'local') {
        if (currentDirHandle && currentDirHandle.removeEntry) {
          await currentDirHandle.removeEntry(item.name, { recursive: item.isFolder });
          await loadLocalHandleDirectory(currentDirHandle);
        } else {
          if (item.isFolder) setFolders(prev => prev.filter(f => f.id !== item.id));
          else setFiles(prev => prev.filter(f => f.id !== item.id));
        }
      } else if (provider === 'devhub') {
        if (item.isFolder) {
          await apiClient(`/folders/${item.id}`, { method: 'DELETE' });
        } else {
          await apiClient(`/files/${item.id}`, { method: 'DELETE' });
        }
        const currentFolderId = currentPath.length > 0 ? currentPath[currentPath.length - 1].id : null;
        await loadDevhubFiles(activeDevhubProjectId, currentFolderId);
      } else if (provider === 'gdrive') {
        await apiClient(`/integrations/google_drive/files/${item.id}`, { method: 'DELETE' });
        const currentFolderId = currentPath.length > 0 ? currentPath[currentPath.length - 1].id : 'root';
        await loadGoogleDriveFiles(currentFolderId);
      }
      setSelectedIds(prev => {
        const next = new Set(prev);
        next.delete(item.id);
        return next;
      });
    } catch (err) {
      alert(`Delete failed: ${err.message}`);
    }
  };

  // Download File
  const handleDownloadFile = async (file) => {
    if (provider === 'local' && file.file) {
      const url = URL.createObjectURL(file.file);
      const a = document.createElement('a');
      a.href = url;
      a.download = file.name;
      a.click();
      URL.revokeObjectURL(url);
    } else if (provider === 'devhub') {
      const dlRes = await apiClient(`/files/${file.id}/download`);
      if (dlRes.url) window.open(dlRes.url, '_blank');
    } else if (provider === 'gdrive') {
      window.open(`/api/integrations/google_drive/download/${file.id}`, '_blank');
    }
  };

  // Copy / Cut to TransferManager
  const handleCopySelected = () => {
    const selected = getSelectedItems();
    if (selected.length === 0) return;
    const currentFolderId = currentPath.length > 0 ? currentPath[currentPath.length - 1].id : null;
    transferManager.copyItems(provider, selected, {
      dirHandle: currentDirHandle,
      projectId: activeDevhubProjectId,
      folderId: currentFolderId
    });
  };

  const handleCutSelected = () => {
    const selected = getSelectedItems();
    if (selected.length === 0) return;
    const currentFolderId = currentPath.length > 0 ? currentPath[currentPath.length - 1].id : null;
    transferManager.cutItems(provider, selected, {
      dirHandle: currentDirHandle,
      projectId: activeDevhubProjectId,
      folderId: currentFolderId
    });
  };

  // Paste into current pane
  const handlePasteHere = async () => {
    const currentFolderId = currentPath.length > 0 ? currentPath[currentPath.length - 1].id : null;
    try {
      await transferManager.executeTransfer(provider, {
        dirHandle: currentDirHandle,
        projectId: activeDevhubProjectId,
        folderId: currentFolderId
      });
      // Refresh current view
      if (provider === 'local' && currentDirHandle) await loadLocalHandleDirectory(currentDirHandle);
      else if (provider === 'devhub') await loadDevhubFiles(activeDevhubProjectId, currentFolderId);
      else if (provider === 'gdrive') await loadGoogleDriveFiles(currentFolderId || 'root');
    } catch (err) {
      alert(`Transfer failed: ${err.message}`);
    }
  };

  // Drag and Drop
  const handleDragOver = (e) => {
    e.preventDefault();
    setIsPaneDragOver(true);
  };

  const handleDragLeave = () => {
    setIsPaneDragOver(false);
  };

  const handleDrop = async (e) => {
    e.preventDefault();
    setIsPaneDragOver(false);

    // Case A: OS files dragged from desktop
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      await handleUploadFiles(e.dataTransfer.files);
      return;
    }

    // Case B: Cross-pane drag from another DEVHUB pane
    const rawData = e.dataTransfer.getData('application/json');
    if (rawData) {
      try {
        const payload = JSON.parse(rawData);
        if (payload.item) {
          const currentFolderId = currentPath.length > 0 ? currentPath[currentPath.length - 1].id : null;
          await transferManager.executeTransfer(
            provider,
            { dirHandle: currentDirHandle, projectId: activeDevhubProjectId, folderId: currentFolderId },
            [payload.item],
            'copy',
            payload.sourceProvider
          );
          if (provider === 'local' && currentDirHandle) await loadLocalHandleDirectory(currentDirHandle);
          else if (provider === 'devhub') await loadDevhubFiles(activeDevhubProjectId, currentFolderId);
          else if (provider === 'gdrive') await loadGoogleDriveFiles(currentFolderId || 'root');
        }
      } catch (err) {
        console.error('Drag drop transfer error:', err);
      }
    }
  };

  // --------------------------------------------------------------------------
  // Filtered & Sorted Items
  // --------------------------------------------------------------------------

  const filteredFolders = useMemo(() => {
    if (!searchQuery.trim()) return folders;
    return folders.filter(f => f.name.toLowerCase().includes(searchQuery.toLowerCase()));
  }, [folders, searchQuery]);

  const filteredFiles = useMemo(() => {
    let result = files;
    if (searchQuery.trim()) {
      result = result.filter(f => f.name.toLowerCase().includes(searchQuery.toLowerCase()));
    }
    return [...result].sort((a, b) => {
      let valA = a[sortConfig.key] || '';
      let valB = b[sortConfig.key] || '';
      if (sortConfig.key === 'size') {
        valA = a.size || 0;
        valB = b.size || 0;
        return sortConfig.direction === 'asc' ? valA - valB : valB - valA;
      }
      if (sortConfig.key === 'date') {
        valA = new Date(a.lastModified || a.updatedAt || 0).getTime();
        valB = new Date(b.lastModified || b.updatedAt || 0).getTime();
        return sortConfig.direction === 'asc' ? valA - valB : valB - valA;
      }
      return sortConfig.direction === 'asc'
        ? String(valA).localeCompare(String(valB))
        : String(valB).localeCompare(String(valA));
    });
  }, [files, searchQuery, sortConfig]);

  // Root icon and label
  const getRootIcon = () => {
    if (provider === 'local') return 'fa-laptop';
    if (provider === 'devhub') return 'fa-cube';
    return 'fa-google-drive';
  };

  const getRootName = () => {
    if (provider === 'local') return 'This PC';
    if (provider === 'devhub') {
      const proj = projects.find(p => p.id === activeDevhubProjectId);
      return proj ? proj.name : 'DEVHUB S3';
    }
    return 'My Drive';
  };

  const isConnected = provider === 'local'
    ? true // "This PC" is always accessible with its explorer root
    : provider === 'devhub'
    ? Boolean(activeDevhubProjectId)
    : Boolean(integration?.connected);

  const canPaste = Boolean(transferManager?.clipboard && transferManager.clipboard.items?.length > 0 && isConnected);
  const pasteCount = transferManager?.clipboard?.items?.length || 0;

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={`bg-[#0f1422] border rounded-2xl shadow-sm flex flex-col h-[600px] xl:h-[640px] overflow-hidden transition-all ${
        isPaneDragOver
          ? 'border-indigo-500 ring-2 ring-indigo-500/30 bg-[#12192c]'
          : 'border-[#192238] hover:border-[#222e4c]'
      } ${className}`}
    >
      {/* Hidden standard file input */}
      <input
        type="file"
        multiple
        ref={fileInputRef}
        onChange={(e) => handleUploadFiles(e.target.files)}
        className="hidden"
      />

      {/* Hidden fallback webkitdirectory input */}
      <input
        type="file"
        webkitdirectory="true"
        directory="true"
        multiple
        ref={dirFallbackInputRef}
        onChange={handleFallbackDirectorySelected}
        className="hidden"
      />

      {/* 1. FIXED HEADER */}
      <div className="h-[52px] shrink-0 px-3.5 py-2 border-b border-[#192238] flex items-center justify-between gap-2 bg-[#0c101c]/90">
        <div className="flex items-center gap-2 min-w-0">
          <ProviderSelector
            currentProvider={provider}
            onSelectProvider={onChangeProvider}
          />

          {/* PC Action: + Add Location */}
          {provider === 'local' && (
            <button
              type="button"
              onClick={() => handleAuthorizeLocalFolder()}
              className="px-2 py-1 bg-sky-500/10 hover:bg-sky-500/20 text-sky-400 border border-sky-500/20 rounded-lg text-[10px] font-bold transition flex items-center gap-1 active:scale-95 shrink-0"
              title="Authorize a folder from your PC"
            >
              <i className="fa-solid fa-plus text-[9px]"></i>
              <span className="hidden sm:inline">Add Location</span>
            </button>
          )}

          {/* DEVHUB Project Selector */}
          {provider === 'devhub' && (
            <select
              value={activeDevhubProjectId}
              onChange={(e) => {
                setActiveDevhubProjectId(e.target.value);
                if (onSelectProject) onSelectProject(e.target.value);
                setCurrentPath([]);
              }}
              className="appearance-none bg-[#141b2d] border border-[#1f2a44] rounded-lg px-2 py-1 text-[11px] font-semibold text-white focus:outline-none focus:border-purple-500 transition cursor-pointer truncate max-w-[150px]"
            >
              <option value="" disabled>Select Project</option>
              {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          )}

          {/* Google Drive Status / Connect */}
          {provider === 'gdrive' && (
            integration?.connected ? (
              <div className="flex items-center gap-1.5 text-[10px] text-emerald-400 font-semibold truncate max-w-[140px]">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_6px_#10b981]"></span>
                <span className="truncate">{integration.accountName || 'Connected'}</span>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => onConnectIntegration && onConnectIntegration('google_drive')}
                className="px-2 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-[10px] font-bold transition flex items-center gap-1 shadow-sm active:scale-95"
              >
                <i className="fa-brands fa-google text-[9px]"></i>
                <span>Connect</span>
              </button>
            )
          )}
        </div>

        {/* Right side controls: Close pane */}
        <div className="flex items-center gap-1 shrink-0">
          {canClose && onClosePane && (
            <button
              type="button"
              onClick={onClosePane}
              title="Close pane"
              className="w-6 h-6 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 flex items-center justify-center transition text-xs"
            >
              <i className="fa-solid fa-xmark"></i>
            </button>
          )}
        </div>
      </div>

      {/* 2. FIXED BREADCRUMBS */}
      <div className="h-[38px] shrink-0 px-3.5 border-b border-[#192238]/60 flex items-center bg-[#090c15]">
        <Breadcrumbs
          items={currentPath}
          onNavigate={handleNavigateCrumb}
          onGoUp={handleGoUp}
          rootName={getRootName()}
          rootIcon={getRootIcon()}
        />
      </div>

      {/* 3. FIXED TOOLBAR */}
      <div className="h-[46px] shrink-0 px-3.5 border-b border-[#192238]/60 flex items-center bg-[#0d121f]">
        <FileToolbar
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          sortConfig={sortConfig}
          onSortChange={setSortConfig}
          onCreateFolder={handleCreateFolder}
          onUploadFile={() => {
            if (provider === 'local' && currentPath.length === 0) {
              handleAuthorizeLocalFolder();
            } else if (fileInputRef.current) {
              fileInputRef.current.click();
            }
          }}
          uploadLabel={provider === 'local' && currentPath.length === 0 ? '+ Location' : 'Upload'}
          onPaste={handlePasteHere}
          canPaste={canPaste}
          pasteCount={pasteCount}
          onRefresh={() => {
            if (provider === 'local' && currentDirHandle) loadLocalHandleDirectory(currentDirHandle);
            else if (provider === 'devhub') loadDevhubFiles(activeDevhubProjectId, currentPath[currentPath.length - 1]?.id);
            else if (provider === 'gdrive') loadGoogleDriveFiles(currentPath[currentPath.length - 1]?.id || 'root');
          }}
          selectedCount={selectedIds.size}
          onCopySelected={handleCopySelected}
          onCutSelected={handleCutSelected}
          canCreateFolder={provider !== 'local' || Boolean(currentDirHandle)}
          canUpload={isConnected}
        />
      </div>

      {/* Selection Action Bar (when items selected) */}
      {selectedIds.size > 0 && (
        <div className="px-3.5 py-1.5 border-b border-[#192238] bg-purple-950/20 shrink-0">
          <FileSelection
            selectedCount={selectedIds.size}
            totalCount={folders.length + files.length}
            onSelectAll={handleSelectAll}
            onClearSelection={handleClearSelection}
            onCopySelected={handleCopySelected}
            onCutSelected={handleCutSelected}
            onDeleteSelected={() => {
              const selected = getSelectedItems();
              if (window.confirm(`Delete ${selected.length} selected items?`)) {
                selected.forEach(handleDeleteItem);
              }
            }}
            onDownloadSelected={() => {
              const selected = getSelectedItems().filter(i => !i.isFolder);
              selected.forEach(handleDownloadFile);
            }}
          />
        </div>
      )}

      {/* 4. SCROLLABLE CONTENT (FILE LIST) */}
      <div className="flex-1 min-h-0 px-3.5 py-2 flex flex-col overflow-hidden">
        {provider === 'gdrive' && !integration?.connected ? (
          <div className="flex-1 min-h-0 flex flex-col items-center justify-center p-6 text-center gap-3 text-slate-400">
            <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 text-xl">
              <i className="fa-brands fa-google-drive"></i>
            </div>
            <div>
              <h4 className="text-xs font-bold text-white mb-1">Google Drive Not Connected</h4>
              <p className="text-[11px] text-slate-400 max-w-xs leading-relaxed">
                Connect your personal Google account to browse, download, copy, and transfer Drive files.
              </p>
            </div>
            <button
              type="button"
              onClick={() => onConnectIntegration && onConnectIntegration('google_drive')}
              className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-md shadow-emerald-950/40 active:scale-95"
            >
              <i className="fa-brands fa-google text-xs"></i>
              <span>Connect Account</span>
            </button>
          </div>
        ) : provider === 'devhub' && !activeDevhubProjectId ? (
          <div className="flex-1 min-h-0 flex flex-col items-center justify-center p-6 text-center text-slate-400 gap-2">
            <i className="fa-solid fa-server text-2xl text-slate-600"></i>
            <span className="text-xs font-medium">Select a project above to browse DEVHUB files</span>
          </div>
        ) : (
          <FileList
            folders={filteredFolders}
            files={filteredFiles}
            selectedIds={selectedIds}
            onToggleSelect={handleToggleSelect}
            onOpenFolder={handleOpenFolder}
            onOpenFile={(file) => onPreviewFile && onPreviewFile(file, provider)}
            onDownloadFile={handleDownloadFile}
            onDeleteFolder={handleDeleteItem}
            onDeleteFile={handleDeleteItem}
            loading={loading}
            error={error}
            searchQuery={searchQuery}
            emptyMessage={
              provider === 'local' && currentPath.length === 0
                ? 'No authorized PC folders yet. Click [+ Add Location] to connect.'
                : 'This folder is empty'
            }
          />
        )}
      </div>

      {/* 5. FIXED FOOTER / STATUS BAR */}
      <div className="h-[34px] shrink-0 px-3.5 border-t border-[#192238] bg-[#0c101c] flex items-center justify-between text-[10px] text-slate-400 font-medium">
        <div className="flex items-center gap-2">
          <span>{filteredFolders.length + filteredFiles.length} item{(filteredFolders.length + filteredFiles.length) === 1 ? '' : 's'}</span>
          {isFallbackMode && (
            <span className="px-1.5 py-0.5 rounded bg-amber-500/10 border border-amber-500/20 text-amber-300 text-[9px] font-semibold">
              Standard Folder Picker
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {selectedIds.size > 0 && (
            <span className="text-purple-400 font-bold">{selectedIds.size} selected</span>
          )}
          <span className="text-slate-600">•</span>
          <span className="uppercase text-[9px] tracking-wider text-slate-500">{provider}</span>
        </div>
      </div>
    </div>
  );
}
