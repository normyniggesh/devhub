import React, { useState, useEffect } from 'react';
import Modal from '../common/Modal';
import { apiClient } from '../../api/client';
import { formatSize } from '../../utils/formatting';
import { useStore } from '../../store';

const PROVIDER_METAS = {
  google_drive: {
    name: 'Google Drive',
    icon: 'fa-brands fa-google-drive',
    color: 'text-amber-400',
    bg: 'bg-amber-500/10'
  },
  dropbox: {
    name: 'Dropbox',
    icon: 'fa-brands fa-dropbox',
    color: 'text-blue-400',
    bg: 'bg-blue-500/10'
  },
  onedrive: {
    name: 'OneDrive',
    icon: 'fa-brands fa-microsoft',
    color: 'text-sky-400',
    bg: 'bg-sky-500/10'
  }
};

export default function ExternalFileBrowser({
  isOpen,
  onClose,
  provider = 'google_drive',
  accountName,
  onFileImported
}) {
  const { currentUser } = useStore();
  const meta = PROVIDER_METAS[provider] || PROVIDER_METAS.google_drive;

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');

  // Breadcrumbs navigation
  const [breadcrumbs, setBreadcrumbs] = useState([{ id: 'root', name: meta.name + ' Root' }]);
  const currentFolder = breadcrumbs[breadcrumbs.length - 1];

  // Teams for import destination
  const [userTeams, setUserTeams] = useState([]);
  const [importTarget, setImportTarget] = useState({
    scope: 'PERSONAL', // 'PERSONAL' | 'TEAM'
    teamId: ''
  });
  const [importingFileId, setImportingFileId] = useState(null);
  const [importNotice, setImportNotice] = useState(null); // { type: 'success' | 'error', text }

  // Load user teams on open
  useEffect(() => {
    if (isOpen) {
      apiClient('/teams')
        .then(res => {
          const teams = res.teams || [];
          setUserTeams(teams);
          if (teams.length > 0) {
            setImportTarget(prev => ({ ...prev, teamId: teams[0].id }));
          }
        })
        .catch(() => setUserTeams([]));
    }
  }, [isOpen]);

  // Load files from external provider
  const loadFiles = async (folderId = currentFolder.id, query = search) => {
    try {
      setLoading(true);
      setError(null);
      let endpoint = `/integrations/${provider}/files?folderId=${encodeURIComponent(folderId)}`;
      if (query && query.trim()) {
        endpoint += `&search=${encodeURIComponent(query.trim())}`;
      }
      const res = await apiClient(endpoint);
      setItems(res.files || []);
    } catch (err) {
      setError(err.message || `Failed to load files from ${meta.name}`);
      setItems([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      setBreadcrumbs([{ id: 'root', name: meta.name + ' Root' }]);
      loadFiles('root', '');
      setImportNotice(null);
    }
  }, [isOpen, provider]);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    loadFiles(currentFolder.id, search);
  };

  const handleOpenFolder = (folder) => {
    setSearch('');
    setBreadcrumbs(prev => [...prev, { id: folder.id, name: folder.name }]);
    loadFiles(folder.id, '');
  };

  const handleNavigateBreadcrumb = (index) => {
    setSearch('');
    const target = breadcrumbs[index];
    setBreadcrumbs(prev => prev.slice(0, index + 1));
    loadFiles(target.id, '');
  };

  const handleDownload = (file) => {
    const apiBase = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';
    const downloadUrl = `${apiBase}/integrations/${provider}/download/${encodeURIComponent(file.id)}`;
    const link = document.createElement('a');
    link.href = downloadUrl;
    link.setAttribute('download', file.name);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleImportToDevhub = async (file) => {
    try {
      setImportingFileId(file.id);
      setImportNotice(null);

      const payload = {
        fileId: file.id,
        filePath: file.path || file.id,
        fileName: file.name,
        targetScope: importTarget.scope,
        teamId: importTarget.scope === 'TEAM' ? importTarget.teamId : null
      };

      const res = await apiClient(`/integrations/${provider}/import`, {
        method: 'POST',
        body: payload
      });

      setImportNotice({
        type: 'success',
        text: `✓ Successfully imported "${file.name}" into DEVHUB Cloud Storage (${importTarget.scope === 'TEAM' ? 'Team Storage' : 'Personal Storage'}). DEVHUB quota updated.`
      });

      if (onFileImported) {
        onFileImported(res.file);
      }
    } catch (err) {
      setImportNotice({
        type: 'error',
        text: `Import failed: ${err.message}`
      });
    } finally {
      setImportingFileId(null);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={
        <div className="flex items-center space-x-3">
          <div className={`w-8 h-8 rounded-lg ${meta.bg} flex items-center justify-center`}>
            <i className={`${meta.icon} ${meta.color} text-base`}></i>
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <span className="text-white font-bold text-base">External Storage</span>
              <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                {meta.name}
              </span>
            </div>
            {accountName && (
              <span className="text-xs text-slate-400 block">{accountName}</span>
            )}
          </div>
        </div>
      }
      maxWidth="max-w-4xl"
    >
      <div className="space-y-4">
        {/* Notice Banner */}
        <div className="p-3 bg-slate-800/60 border border-slate-700/60 rounded-xl text-xs text-slate-300 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <i className="fa-solid fa-cloud-arrow-down text-indigo-400"></i>
            <span>
              Browsing external files does <strong>not</strong> consume your DEVHUB Cloud quota. Only imported files count against your 5 GB quota.
            </span>
          </div>
        </div>

        {importNotice && (
          <div
            className={`p-3 rounded-xl text-xs flex items-center space-x-2 border ${
              importNotice.type === 'success'
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
            }`}
          >
            <i
              className={`fa-solid ${
                importNotice.type === 'success' ? 'fa-circle-check' : 'fa-circle-exclamation'
              }`}
            ></i>
            <span>{importNotice.text}</span>
          </div>
        )}

        {/* Search & Breadcrumb Bar */}
        <div className="flex flex-col sm:flex-row gap-2 justify-between items-stretch sm:items-center bg-[#131722] p-2.5 rounded-xl border border-slate-800">
          {/* Breadcrumbs */}
          <div className="flex items-center space-x-1 overflow-x-auto py-1 text-xs text-slate-300">
            {breadcrumbs.map((crumb, idx) => (
              <React.Fragment key={crumb.id || idx}>
                {idx > 0 && <span className="text-slate-600">/</span>}
                <button
                  type="button"
                  onClick={() => handleNavigateBreadcrumb(idx)}
                  className={`px-2 py-1 rounded transition hover:bg-slate-800 ${
                    idx === breadcrumbs.length - 1
                      ? 'font-bold text-white bg-slate-800/80'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {crumb.name}
                </button>
              </React.Fragment>
            ))}
          </div>

          {/* Search Form */}
          <form onSubmit={handleSearchSubmit} className="flex items-center space-x-1.5 shrink-0">
            <div className="relative">
              <input
                type="text"
                placeholder="Search files..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-40 sm:w-48 bg-slate-900 border border-slate-700/80 rounded-lg px-2.5 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-hidden focus:border-indigo-500"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => { setSearch(''); loadFiles(currentFolder.id, ''); }}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white text-xs"
                >
                  <i className="fa-solid fa-xmark"></i>
                </button>
              )}
            </div>
            <button
              type="submit"
              className="px-2.5 py-1.5 rounded-lg bg-indigo-600 text-white hover:bg-indigo-500 transition text-xs"
            >
              <i className="fa-solid fa-magnifying-glass"></i>
            </button>
          </form>
        </div>

        {/* Import Destination Selector */}
        <div className="flex flex-wrap items-center gap-3 p-3 bg-[#111420] rounded-xl border border-slate-800 text-xs text-slate-300">
          <span className="font-semibold text-slate-400">Import Destination:</span>
          <label className="flex items-center space-x-1.5 cursor-pointer">
            <input
              type="radio"
              name="importScope"
              value="PERSONAL"
              checked={importTarget.scope === 'PERSONAL'}
              onChange={() => setImportTarget(prev => ({ ...prev, scope: 'PERSONAL' }))}
              className="accent-indigo-500"
            />
            <span>Personal Cloud Storage</span>
          </label>

          {userTeams.length > 0 && (
            <label className="flex items-center space-x-1.5 cursor-pointer">
              <input
                type="radio"
                name="importScope"
                value="TEAM"
                checked={importTarget.scope === 'TEAM'}
                onChange={() => setImportTarget(prev => ({ ...prev, scope: 'TEAM' }))}
                className="accent-indigo-500"
              />
              <span>Team Cloud Storage</span>
            </label>
          )}

          {importTarget.scope === 'TEAM' && userTeams.length > 0 && (
            <select
              value={importTarget.teamId}
              onChange={e => setImportTarget(prev => ({ ...prev, teamId: e.target.value }))}
              className="bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-xs text-white"
            >
              {userTeams.map(t => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          )}
        </div>

        {/* Files / Folders List */}
        <div className="border border-slate-800 rounded-xl overflow-hidden bg-[#0d101a] max-h-96 overflow-y-auto">
          {loading ? (
            <div className="py-16 text-center text-slate-400">
              <i className="fa-solid fa-circle-notch fa-spin text-2xl mb-2 text-indigo-400"></i>
              <p className="text-xs">Loading external files...</p>
            </div>
          ) : error ? (
            <div className="py-12 text-center text-rose-400 px-4">
              <i className="fa-solid fa-triangle-exclamation text-2xl mb-2"></i>
              <p className="text-xs font-semibold">{error}</p>
              <button
                onClick={() => loadFiles(currentFolder.id)}
                className="mt-3 px-3 py-1 bg-slate-800 text-xs rounded-lg hover:bg-slate-700 text-white"
              >
                Retry
              </button>
            </div>
          ) : items.length === 0 ? (
            <div className="py-16 text-center text-slate-500">
              <i className="fa-regular fa-folder-open text-3xl mb-2 text-slate-600"></i>
              <p className="text-xs">No files or folders found in this directory</p>
            </div>
          ) : (
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-800 bg-slate-900/60 text-slate-400 uppercase tracking-wider text-[10px]">
                  <th className="py-2.5 px-3">Name</th>
                  <th className="py-2.5 px-3 w-24">Size</th>
                  <th className="py-2.5 px-3 w-32 hidden sm:table-cell">Modified</th>
                  <th className="py-2.5 px-3 w-44 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {items.map(item => {
                  const isFolder = item.isFolder;
                  const isImporting = importingFileId === item.id;

                  return (
                    <tr
                      key={item.id}
                      className="hover:bg-slate-800/40 transition group text-slate-300"
                    >
                      <td className="py-2.5 px-3">
                        {isFolder ? (
                          <button
                            type="button"
                            onClick={() => handleOpenFolder(item)}
                            className="flex items-center space-x-2 text-left hover:text-indigo-300 transition w-full"
                          >
                            <i className="fa-solid fa-folder text-amber-400 text-sm"></i>
                            <span className="font-medium text-white truncate max-w-xs">{item.name}</span>
                          </button>
                        ) : (
                          <div className="flex items-center space-x-2">
                            <i className="fa-regular fa-file-lines text-slate-400 text-sm"></i>
                            <span className="truncate max-w-xs">{item.name}</span>
                          </div>
                        )}
                      </td>

                      <td className="py-2.5 px-3 text-slate-400">
                        {isFolder ? '—' : formatSize(item.size || 0)}
                      </td>

                      <td className="py-2.5 px-3 text-slate-500 hidden sm:table-cell">
                        {item.lastModified ? new Date(item.lastModified).toLocaleDateString() : '—'}
                      </td>

                      <td className="py-2.5 px-3 text-right">
                        {!isFolder && (
                          <div className="flex items-center justify-end space-x-1.5">
                            <button
                              type="button"
                              onClick={() => handleDownload(item)}
                              title="Download directly to your computer (Free, 0 DEVHUB quota)"
                              className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition text-[11px] flex items-center space-x-1"
                            >
                              <i className="fa-solid fa-download"></i>
                              <span>Download</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => handleImportToDevhub(item)}
                              disabled={isImporting}
                              title="Import file into DEVHUB Cloud Storage"
                              className="px-2.5 py-1 rounded bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white transition text-[11px] font-medium flex items-center space-x-1"
                            >
                              {isImporting ? (
                                <>
                                  <i className="fa-solid fa-circle-notch fa-spin"></i>
                                  <span>Importing...</span>
                                </>
                              ) : (
                                <>
                                  <i className="fa-solid fa-cloud-arrow-up"></i>
                                  <span>Import</span>
                                </>
                              )}
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Footer info */}
        <div className="flex items-center justify-between text-[11px] text-slate-500 pt-2 border-t border-slate-800">
          <span>Items: {items.length}</span>
          <span>External Provider: {meta.name}</span>
        </div>
      </div>
    </Modal>
  );
}
