import { useState, useEffect } from 'react';
import Modal from '../common/Modal';
import DriveFolderRow from './DriveFolderRow';
import DriveFileRow from './DriveFileRow';
import { apiClient } from '../../api/client';

export default function DriveBrowser({
  isOpen,
  onClose,
  provider = 'google_drive',
  providerName = 'Google Drive',
  providerIcon = 'fa-brands fa-google-drive',
  accountName,
  projects = [],
  currentProjectId,
  currentFolderId,
  onFileImported
}) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  
  // Navigation: breadcrumbs stack [{ id: 'root', name: 'My Drive' }, ...]
  const [breadcrumbs, setBreadcrumbs] = useState([{ id: 'root', name: 'My Drive' }]);
  const currentFolder = breadcrumbs[breadcrumbs.length - 1];

  // Target for import into DEVHUB
  const [selectedProjectId, setSelectedProjectId] = useState(currentProjectId || (projects[0]?.id || ''));
  const [selectedFolderId, setSelectedFolderId] = useState(currentFolderId || '');
  const [projectFolders, setProjectFolders] = useState([]);

  // Import state
  const [importingId, setImportingId] = useState(null);
  const [statusMessage, setStatusMessage] = useState(null); // { type: 'success' | 'error', text: '' }

  // Load project folders when selected project changes
  useEffect(() => {
    if (!selectedProjectId) {
      setProjectFolders([]);
      return;
    }
    apiClient(`/folders?projectId=${selectedProjectId}`)
      .then(res => setProjectFolders(res.folders || []))
      .catch(() => setProjectFolders([]));
  }, [selectedProjectId]);

  // Fetch files from provider
  const loadFiles = async (folderId = currentFolder.id, searchQuery = search) => {
    try {
      setLoading(true);
      setError(null);
      let queryUrl = `/integrations/${provider}/files?folderId=${encodeURIComponent(folderId)}`;
      if (searchQuery && searchQuery.trim()) {
        queryUrl += `&search=${encodeURIComponent(searchQuery.trim())}`;
      }

      const res = await apiClient(queryUrl);
      setItems(res.files || []);
    } catch (err) {
      setError(err.message || 'Failed to load files from cloud provider');
      setItems([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadFiles(currentFolder.id, search);
    }
  }, [isOpen, currentFolder.id]);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    loadFiles(currentFolder.id, search);
  };

  const handleClearSearch = () => {
    setSearch('');
    loadFiles(currentFolder.id, '');
  };

  const handleOpenFolder = (folder) => {
    setSearch('');
    setBreadcrumbs(prev => [...prev, { id: folder.id, name: folder.name }]);
  };

  const handleNavigateBreadcrumb = (index) => {
    setSearch('');
    setBreadcrumbs(prev => prev.slice(0, index + 1));
  };

  const handleDownload = (file) => {
    const apiBase = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';
    const downloadUrl = `${apiBase}/integrations/${provider}/download/${encodeURIComponent(file.id)}`;
    
    // Create hidden anchor to trigger browser download
    const link = document.createElement('a');
    link.href = downloadUrl;
    link.setAttribute('download', file.name);
    link.target = '_blank';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleImport = async (file) => {
    if (!selectedProjectId) {
      setStatusMessage({ type: 'error', text: 'Please select a DEVHUB project destination before importing.' });
      return;
    }

    try {
      setImportingId(file.id);
      setStatusMessage(null);

      const res = await apiClient(`/integrations/${provider}/import`, {
        method: 'POST',
        body: {
          fileId: file.id,
          fileName: file.name,
          projectId: selectedProjectId,
          folderId: selectedFolderId || null
        }
      });

      setStatusMessage({
        type: 'success',
        text: `Successfully imported "${file.name}" into DEVHUB project!`
      });

      if (onFileImported) {
        onFileImported(res.file);
      }
    } catch (err) {
      setStatusMessage({
        type: 'error',
        text: err.message || 'Failed to import file into DEVHUB.'
      });
    } finally {
      setImportingId(null);
    }
  };

  if (!isOpen) return null;

  return (
    <Modal open={isOpen} onClose={onClose} className="max-w-4xl p-0 overflow-hidden bg-[#0d121f] border border-[#1e293b] rounded-2xl shadow-2xl">
      {/* Header */}
      <div className="p-5 border-b border-[#182136] bg-[#101627] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center shrink-0">
            <i className={`${providerIcon} text-amber-400 text-lg`}></i>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-white">{providerName}</h2>
              {accountName && (
                <span className="text-[11px] font-mono text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full">
                  {accountName}
                </span>
              )}
            </div>
            <p className="text-xs text-slate-400 mt-0.5">Browse your personal cloud drive and import files into DEVHUB</p>
          </div>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
          {/* Refresh */}
          <button
            type="button"
            onClick={() => loadFiles(currentFolder.id, search)}
            title="Refresh files"
            disabled={loading}
            className="p-2 text-slate-400 hover:text-white bg-[#161d2f] hover:bg-[#1e2840] border border-[#222e48] rounded-lg transition text-xs"
          >
            <i className={`fa-solid fa-rotate-right ${loading ? 'fa-spin' : ''}`}></i>
          </button>

          {/* Close */}
          <button
            type="button"
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white bg-[#161d2f] hover:bg-[#1e2840] border border-[#222e48] rounded-lg transition text-xs"
          >
            <i className="fa-solid fa-xmark"></i>
          </button>
        </div>
      </div>

      {/* Import Destination Bar */}
      <div className="p-3.5 bg-[#0b0f1a] border-b border-[#182136] flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2">
          <span className="text-slate-400 font-medium shrink-0">Import destination:</span>
          {/* Project selector */}
          <select
            value={selectedProjectId}
            onChange={e => {
              setSelectedProjectId(e.target.value);
              setSelectedFolderId('');
            }}
            className="bg-[#141b2d] border border-[#222e48] rounded-lg px-2.5 py-1 text-slate-200 text-xs font-medium focus:outline-none focus:border-indigo-500"
          >
            {projects.map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>

          {/* Folder selector */}
          <select
            value={selectedFolderId}
            onChange={e => setSelectedFolderId(e.target.value)}
            className="bg-[#141b2d] border border-[#222e48] rounded-lg px-2.5 py-1 text-slate-200 text-xs font-medium focus:outline-none focus:border-indigo-500"
          >
            <option value="">Root / No folder</option>
            {projectFolders.map(f => (
              <option key={f.id} value={f.id}>{f.name}</option>
            ))}
          </select>
        </div>

        {/* Search */}
        <form onSubmit={handleSearchSubmit} className="relative min-w-[200px] flex-1 sm:flex-initial">
          <i className="fa-solid fa-search absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500 text-xs"></i>
          <input
            type="text"
            placeholder="Search Drive files..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full bg-[#141b2d] border border-[#222e48] rounded-lg pl-8 pr-7 py-1 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
          />
          {search && (
            <button
              type="button"
              onClick={handleClearSearch}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white text-xs"
            >
              <i className="fa-solid fa-xmark"></i>
            </button>
          )}
        </form>
      </div>

      {/* Breadcrumbs Navigation */}
      <div className="px-5 py-2.5 bg-[#0e1424] border-b border-[#182136] flex items-center gap-1.5 text-xs overflow-x-auto">
        <i className="fa-solid fa-cloud text-amber-400 text-xs mr-1"></i>
        {breadcrumbs.map((crumb, idx) => {
          const isLast = idx === breadcrumbs.length - 1;
          return (
            <div key={crumb.id || idx} className="flex items-center gap-1.5 shrink-0">
              {idx > 0 && <span className="text-slate-600">/</span>}
              <button
                type="button"
                onClick={() => handleNavigateBreadcrumb(idx)}
                disabled={isLast}
                className={`transition ${
                  isLast
                    ? 'font-semibold text-white cursor-default'
                    : 'text-slate-400 hover:text-indigo-400'
                }`}
              >
                {crumb.name}
              </button>
            </div>
          );
        })}
      </div>

      {/* Status Banner */}
      {statusMessage && (
        <div
          className={`px-5 py-2.5 text-xs flex items-center justify-between border-b ${
            statusMessage.type === 'success'
              ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-300'
              : 'bg-rose-500/10 border-rose-500/20 text-rose-300'
          }`}
        >
          <div className="flex items-center gap-2">
            <i
              className={`fa-solid ${
                statusMessage.type === 'success' ? 'fa-check-circle' : 'fa-circle-exclamation'
              }`}
            ></i>
            <span>{statusMessage.text}</span>
          </div>
          <button
            type="button"
            onClick={() => setStatusMessage(null)}
            className="hover:opacity-75"
          >
            <i className="fa-solid fa-xmark"></i>
          </button>
        </div>
      )}

      {/* Main File Table */}
      <div className="max-h-[460px] min-h-[300px] overflow-y-auto">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 text-slate-400">
            <i className="fa-solid fa-circle-notch fa-spin text-2xl mb-3 text-indigo-400"></i>
            <span className="text-xs">Loading Google Drive contents...</span>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center py-16 text-center px-4">
            <div className="w-10 h-10 rounded-full bg-rose-500/10 text-rose-400 flex items-center justify-center mb-3">
              <i className="fa-solid fa-triangle-exclamation"></i>
            </div>
            <p className="text-xs text-rose-400 font-semibold mb-1">Failed to load files</p>
            <p className="text-[11px] text-slate-500 max-w-md mb-4">{error}</p>
            <button
              onClick={() => loadFiles(currentFolder.id, search)}
              className="py-1.5 px-3 bg-[#161d2f] hover:bg-[#1e2840] text-xs text-slate-200 border border-[#222e48] rounded-lg transition"
            >
              Retry
            </button>
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-slate-500 text-center">
            <i className="fa-regular fa-folder-open text-3xl mb-2.5 text-slate-600"></i>
            <p className="text-xs font-medium text-slate-400">
              {search ? 'No files match your search' : 'This folder is empty'}
            </p>
            {search && (
              <button
                type="button"
                onClick={handleClearSearch}
                className="mt-2 text-[11px] text-indigo-400 hover:text-indigo-300"
              >
                Clear search filter
              </button>
            )}
          </div>
        ) : (
          <table className="w-full text-left border-collapse">
            <thead className="bg-[#0b0f1a] sticky top-0 text-[10px] font-bold text-slate-500 uppercase tracking-wider border-b border-[#182136]">
              <tr>
                <th className="py-2.5 px-4 font-semibold">Name</th>
                <th className="py-2.5 px-4 font-semibold w-24">Size</th>
                <th className="py-2.5 px-4 font-semibold w-32">Modified</th>
                <th className="py-2.5 px-4 font-semibold text-right w-44">Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.map(item => {
                if (item.isFolder) {
                  return (
                    <DriveFolderRow
                      key={item.id}
                      folder={item}
                      onOpenFolder={handleOpenFolder}
                    />
                  );
                }
                return (
                  <DriveFileRow
                    key={item.id}
                    file={item}
                    onImport={handleImport}
                    onDownload={handleDownload}
                    importing={importingId === item.id}
                  />
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Footer info */}
      <div className="p-3 bg-[#0a0e18] border-t border-[#182136] text-[11px] text-slate-500 flex items-center justify-between">
        <span>Files remain in your Google Drive unless imported to DEVHUB storage.</span>
        <span>{items.length} items</span>
      </div>
    </Modal>
  );
}
