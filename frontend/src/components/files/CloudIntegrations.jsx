import { useState, useEffect } from 'react';
import { apiClient } from '../../api/client';
import Modal from '../common/Modal';
import { formatSize } from '../../utils/formatting';

const PROVIDER_CONFIG = {
  google_drive: {
    id: 'google_drive',
    name: 'Google Drive',
    icon: 'fa-brands fa-google-drive',
    color: 'text-amber-400',
    borderActive: 'border-amber-500/40 bg-amber-500/10',
    helpText: 'Requires a Google OAuth2 Access Token with Drive read permissions (drive.readonly). Generate via Google Cloud Console or Google OAuth Playground.',
    tokenPlaceholder: 'ya29.a0AfH6SM...'
  },
  dropbox: {
    id: 'dropbox',
    name: 'Dropbox',
    icon: 'fa-brands fa-dropbox',
    color: 'text-blue-400',
    borderActive: 'border-blue-500/40 bg-blue-500/10',
    helpText: 'Requires a Dropbox Generated Access Token with files.metadata.read and files.content.read permissions. Generate via Dropbox App Console.',
    tokenPlaceholder: 'sl.B... or personal access token'
  },
  onedrive: {
    id: 'onedrive',
    name: 'OneDrive',
    icon: 'fa-brands fa-microsoft',
    color: 'text-sky-400',
    borderActive: 'border-sky-500/40 bg-sky-500/10',
    helpText: 'Requires a Microsoft Graph Access Token with Files.Read permissions. Generate via Azure Portal App Registration or Graph Explorer.',
    tokenPlaceholder: 'EwB... or Microsoft Graph bearer token'
  }
};

export default function CloudIntegrations({
  integrations = {},
  onRefreshIntegrations,
  projects = [],
  currentProjectId,
  currentFolderId,
  onFileImported
}) {
  // Modal states
  const [connectModalProvider, setConnectModalProvider] = useState(null);
  const [browseModalProvider, setBrowseModalProvider] = useState(null);

  // Connect form state
  const [connectForm, setConnectForm] = useState({ accountName: '', accessToken: '' });
  const [connecting, setConnecting] = useState(false);
  const [connectError, setConnectError] = useState(null);

  // Browse state
  const [providerFiles, setProviderFiles] = useState([]);
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [browseSearch, setBrowseSearch] = useState('');
  const [importingFileId, setImportingFileId] = useState(null);
  const [importTargetProject, setImportTargetProject] = useState('');
  const [importTargetFolder, setImportTargetFolder] = useState('');
  const [browseError, setBrowseError] = useState(null);
  const [importSuccessMsg, setImportSuccessMsg] = useState(null);

  const openConnect = (providerId) => {
    setConnectModalProvider(providerId);
    setConnectError(null);
    setConnectForm({
      accountName: integrations[providerId]?.accountName || '',
      accessToken: ''
    });
  };

  const handleConnect = async (e) => {
    e.preventDefault();
    if (!connectModalProvider) return;
    if (!connectForm.accessToken.trim()) {
      setConnectError('An Access Token is required to connect to this provider.');
      return;
    }

    setConnecting(true);
    setConnectError(null);

    try {
      await apiClient('/integrations/connect', {
        method: 'POST',
        body: {
          provider: connectModalProvider,
          accountName: connectForm.accountName.trim() || undefined,
          accessToken: connectForm.accessToken.trim()
        }
      });
      if (onRefreshIntegrations) await onRefreshIntegrations();
      setConnectModalProvider(null);
      setConnectForm({ accountName: '', accessToken: '' });
    } catch (err) {
      setConnectError(err.message || 'Failed to connect. Please verify your access token.');
    } finally {
      setConnecting(false);
    }
  };

  const handleDisconnect = async (providerId) => {
    const config = PROVIDER_CONFIG[providerId];
    if (!window.confirm(`Are you sure you want to disconnect ${config.name}? You will no longer be able to browse its files.`)) return;

    try {
      await apiClient('/integrations/disconnect', {
        method: 'POST',
        body: { provider: providerId }
      });
      if (onRefreshIntegrations) await onRefreshIntegrations();
    } catch (err) {
      alert(err.message || 'Failed to disconnect integration');
    }
  };

  const openBrowse = async (providerId) => {
    setBrowseModalProvider(providerId);
    setBrowseError(null);
    setImportSuccessMsg(null);
    setBrowseSearch('');
    setImportTargetProject(currentProjectId || (projects[0]?.id || ''));
    setImportTargetFolder(currentFolderId || '');
    setLoadingFiles(true);

    try {
      const res = await apiClient(`/integrations/${providerId}/files`);
      setProviderFiles(res.files || []);
    } catch (err) {
      setBrowseError(err.message || 'Failed to load files from cloud provider');
      setProviderFiles([]);
    } finally {
      setLoadingFiles(false);
    }
  };

  const handleImportFile = async (file) => {
    if (!importTargetProject) {
      alert('Please select a destination project.');
      return;
    }

    setImportingFileId(file.id);
    setBrowseError(null);
    setImportSuccessMsg(null);

    try {
      const res = await apiClient(`/integrations/${browseModalProvider}/import`, {
        method: 'POST',
        body: {
          fileId: file.id,
          filePath: file.path,
          fileName: file.name,
          projectId: importTargetProject,
          folderId: importTargetFolder || null
        }
      });

      setImportSuccessMsg(`"${file.name}" imported into DEVHUB successfully!`);
      if (onFileImported) onFileImported(res.file);
      setTimeout(() => setImportSuccessMsg(null), 4000);
    } catch (err) {
      setBrowseError(err.message || 'Failed to import file into DEVHUB');
    } finally {
      setImportingFileId(null);
    }
  };

  const filteredFiles = providerFiles.filter(f =>
    f.name.toLowerCase().includes(browseSearch.toLowerCase())
  );

  return (
    <>
      {/* Integrations Card Container */}
      <div className="bg-[#0f1422] border border-[#192238] rounded-2xl p-5 shadow-sm">
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-sm font-bold text-white flex items-center gap-2">
            <i className="fa-solid fa-cloud text-indigo-400"></i> Cloud Storage Integrations
          </h2>
          <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">
            AWS S3 Synced
          </span>
        </div>
        <p className="text-[11px] text-slate-400 mb-4 leading-relaxed">
          Connect your personal cloud accounts to browse and import files directly into DEVHUB projects.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {Object.values(PROVIDER_CONFIG).map((cfg) => {
            const isConnected = Boolean(integrations[cfg.id]?.connected);
            const accountName = integrations[cfg.id]?.accountName;

            return (
              <div
                key={cfg.id}
                className={`p-3.5 rounded-xl border flex flex-col justify-between transition ${
                  isConnected
                    ? 'bg-[#12192c] border-[#223052]'
                    : 'bg-[#101524] border-[#182136] hover:border-[#223052]'
                }`}
              >
                <div>
                  <div className="flex items-start justify-between mb-2">
                    <i className={`${cfg.icon} text-2xl ${cfg.color}`}></i>
                    {isConnected ? (
                      <span className="text-[9px] font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                        Connected
                      </span>
                    ) : (
                      <span className="text-[9px] font-semibold text-slate-500 bg-[#161d2f] px-2 py-0.5 rounded-full border border-slate-700/50">
                        Not Connected
                      </span>
                    )}
                  </div>

                  <h3 className="text-xs font-bold text-white mb-0.5">{cfg.name}</h3>
                  <p className="text-[10px] text-slate-400 truncate mb-3">
                    {isConnected ? accountName : 'Connect to browse & import files'}
                  </p>
                </div>

                <div className="pt-2 border-t border-[#1a233a] flex items-center gap-2">
                  {isConnected ? (
                    <>
                      <button
                        type="button"
                        onClick={() => openBrowse(cfg.id)}
                        className="flex-1 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-[11px] font-bold transition flex items-center justify-center gap-1.5 shadow-sm"
                      >
                        <i className="fa-solid fa-folder-open text-[10px]"></i> Browse Files
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDisconnect(cfg.id)}
                        title="Disconnect account"
                        className="p-1.5 text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition"
                      >
                        <i className="fa-solid fa-power-off text-xs"></i>
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={() => openConnect(cfg.id)}
                      className="w-full py-1.5 bg-[#1b233a] hover:bg-[#253150] text-slate-200 hover:text-white rounded-lg text-[11px] font-semibold transition border border-[#2b395c] flex items-center justify-center gap-1.5"
                    >
                      <i className="fa-solid fa-link text-[10px]"></i> Connect
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Connect Modal */}
      {connectModalProvider && (
        <Modal
          open={Boolean(connectModalProvider)}
          onClose={() => setConnectModalProvider(null)}
          className="max-w-md p-6"
        >
          {(() => {
            const cfg = PROVIDER_CONFIG[connectModalProvider];
            return (
              <div>
                <div className="flex items-center justify-between pb-3 border-b border-[#1f2a44] mb-4">
                  <h2 className="text-base text-white font-bold flex items-center gap-2">
                    <i className={`${cfg.icon} ${cfg.color}`}></i> Connect {cfg.name}
                  </h2>
                  <button
                    onClick={() => setConnectModalProvider(null)}
                    className="text-slate-400 hover:text-white transition"
                  >
                    <i className="fa-solid fa-xmark"></i>
                  </button>
                </div>

                <form onSubmit={handleConnect} className="space-y-4">
                  <div className="text-xs text-slate-400 bg-[#161d2f] border border-[#1f2a44] p-3.5 rounded-xl space-y-1">
                    <p className="font-semibold text-white flex items-center gap-1.5">
                      <i className="fa-solid fa-shield-halved text-indigo-400"></i> Per-User Cloud Connection
                    </p>
                    <p className="text-[11px] leading-relaxed">
                      {cfg.helpText}
                    </p>
                  </div>

                  {connectError && (
                    <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl text-rose-400 text-xs flex items-center gap-2">
                      <i className="fa-solid fa-triangle-exclamation shrink-0"></i>
                      <span>{connectError}</span>
                    </div>
                  )}

                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                      Account Name / Email <span className="text-slate-500 font-normal">(Optional)</span>
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. user@gmail.com"
                      value={connectForm.accountName}
                      onChange={(e) => setConnectForm({ ...connectForm, accountName: e.target.value })}
                      className="w-full bg-[#161d2f] border border-[#1f2a44] rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500 transition"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                      API Access Token <span className="text-red-500">*</span>
                    </label>
                    <input
                      required
                      type="password"
                      placeholder={cfg.tokenPlaceholder}
                      value={connectForm.accessToken}
                      onChange={(e) => setConnectForm({ ...connectForm, accessToken: e.target.value })}
                      className="w-full bg-[#161d2f] border border-[#1f2a44] rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500 transition font-mono"
                    />
                    <p className="text-[10px] text-slate-500 mt-1">
                      Token is validated server-side against the provider's API. No fake states.
                    </p>
                  </div>

                  <div className="flex justify-end gap-3 pt-3 border-t border-[#1f2a44]">
                    <button
                      type="button"
                      disabled={connecting}
                      onClick={() => setConnectModalProvider(null)}
                      className="px-4 py-2 text-slate-300 text-xs font-bold hover:text-white hover:bg-[#1a2333] rounded-lg transition"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={connecting || !connectForm.accessToken.trim()}
                      className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-bold shadow-lg shadow-indigo-900/30 transition flex items-center gap-2 disabled:opacity-50"
                    >
                      {connecting && <i className="fa-solid fa-spinner fa-spin"></i>}
                      Connect {cfg.name}
                    </button>
                  </div>
                </form>
              </div>
            );
          })()}
        </Modal>
      )}

      {/* Browse & Import Modal */}
      {browseModalProvider && (
        <Modal
          open={Boolean(browseModalProvider)}
          onClose={() => setBrowseModalProvider(null)}
          className="max-w-2xl p-6"
        >
          {(() => {
            const cfg = PROVIDER_CONFIG[browseModalProvider];
            return (
              <div>
                <div className="flex items-center justify-between pb-3 border-b border-[#1f2a44] mb-4">
                  <div>
                    <h2 className="text-base text-white font-bold flex items-center gap-2">
                      <i className={`${cfg.icon} ${cfg.color}`}></i> Browse & Import from {cfg.name}
                    </h2>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Select files from your connected cloud storage to copy directly into DEVHUB's persistent S3 storage.
                    </p>
                  </div>
                  <button
                    onClick={() => setBrowseModalProvider(null)}
                    className="text-slate-400 hover:text-white transition"
                  >
                    <i className="fa-solid fa-xmark"></i>
                  </button>
                </div>

                {importSuccessMsg && (
                  <div className="p-3 mb-4 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-emerald-400 text-xs flex items-center gap-2">
                    <i className="fa-solid fa-circle-check shrink-0"></i>
                    <span>{importSuccessMsg}</span>
                  </div>
                )}

                {browseError && (
                  <div className="p-3 mb-4 bg-rose-500/10 border border-rose-500/20 rounded-xl text-rose-400 text-xs flex items-center gap-2">
                    <i className="fa-solid fa-triangle-exclamation shrink-0"></i>
                    <span>{browseError}</span>
                  </div>
                )}

                {/* Destination Selector & Search Bar */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                      Target Project <span className="text-red-500">*</span>
                    </label>
                    <select
                      value={importTargetProject}
                      onChange={(e) => setImportTargetProject(e.target.value)}
                      className="w-full bg-[#161d2f] border border-[#1f2a44] rounded-xl px-3 py-2 text-xs font-semibold text-white focus:outline-none focus:border-indigo-500"
                    >
                      <option value="" disabled>Select a destination project</option>
                      {projects.map((p) => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                      Search Cloud Files
                    </label>
                    <div className="relative">
                      <i className="fa-solid fa-magnifying-glass absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-xs"></i>
                      <input
                        type="text"
                        placeholder="Search file name..."
                        value={browseSearch}
                        onChange={(e) => setBrowseSearch(e.target.value)}
                        className="w-full bg-[#161d2f] border border-[#1f2a44] rounded-xl pl-8 pr-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
                      />
                    </div>
                  </div>
                </div>

                {/* File List */}
                <div className="border border-[#1f2a44] rounded-xl max-h-80 overflow-y-auto divide-y divide-[#1f2a44] bg-[#0c101d]">
                  {loadingFiles ? (
                    <div className="p-12 text-center text-xs text-slate-400">
                      <i className="fa-solid fa-spinner fa-spin mr-2 text-indigo-400"></i>
                      Loading files from {cfg.name}...
                    </div>
                  ) : filteredFiles.length === 0 ? (
                    <div className="p-12 text-center text-xs text-slate-400">
                      {browseSearch ? 'No files match your search.' : `No files found in this ${cfg.name} account.`}
                    </div>
                  ) : (
                    filteredFiles.map((file) => {
                      const isImporting = importingFileId === file.id;

                      return (
                        <div
                          key={file.id}
                          className="p-3 flex items-center justify-between gap-3 hover:bg-[#131a2b] transition"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="w-8 h-8 rounded-lg bg-[#161d2f] flex items-center justify-center shrink-0 border border-[#222c42]">
                              <i className="fa-regular fa-file text-slate-400 text-sm"></i>
                            </div>
                            <div className="min-w-0">
                              <h4 className="text-xs font-bold text-white truncate max-w-sm" title={file.name}>
                                {file.name}
                              </h4>
                              <p className="text-[10px] text-slate-500">
                                {file.size ? formatSize(file.size) : 'File'} •{' '}
                                {file.lastModified ? new Date(file.lastModified).toLocaleDateString() : 'Cloud storage'}
                              </p>
                            </div>
                          </div>

                          <button
                            type="button"
                            disabled={isImporting || !importTargetProject}
                            onClick={() => handleImportFile(file)}
                            className="px-3 py-1.5 bg-indigo-600/20 hover:bg-indigo-600 text-indigo-300 hover:text-white border border-indigo-500/30 rounded-lg text-xs font-bold transition flex items-center gap-1.5 shrink-0 disabled:opacity-50"
                          >
                            {isImporting ? (
                              <>
                                <i className="fa-solid fa-spinner fa-spin"></i>
                                Importing...
                              </>
                            ) : (
                              <>
                                <i className="fa-solid fa-cloud-arrow-down text-[10px]"></i>
                                Import to DevHub
                              </>
                            )}
                          </button>
                        </div>
                      );
                    })
                  )}
                </div>

                <div className="flex justify-end pt-4 border-t border-[#1f2a44] mt-4">
                  <button
                    type="button"
                    onClick={() => setBrowseModalProvider(null)}
                    className="px-4 py-2 bg-[#1b233a] hover:bg-[#253150] text-slate-200 hover:text-white rounded-lg text-xs font-semibold transition"
                  >
                    Close
                  </button>
                </div>
              </div>
            );
          })()}
        </Modal>
      )}
    </>
  );
}
