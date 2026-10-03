import { useState, useEffect } from 'react';
import { apiClient } from '../../api/client';
import { useStore } from '../../store';
import CloudIntegrationCard from './CloudIntegrationCard';
import DriveBrowser from './DriveBrowser';
import Modal from '../common/Modal';

const PROVIDERS = [
  {
    id: 'google_drive',
    name: 'Google Drive',
    description: 'Personal cloud files & documents from your Google Account',
    icon: 'fa-brands fa-google-drive',
    iconColor: 'text-amber-400',
    iconBg: 'bg-amber-500/10'
  },
  {
    id: 'dropbox',
    name: 'Dropbox',
    description: 'Cloud file sync and storage for personal and team files',
    icon: 'fa-brands fa-dropbox',
    iconColor: 'text-blue-400',
    iconBg: 'bg-blue-500/10'
  },
  {
    id: 'onedrive',
    name: 'OneDrive',
    description: 'Microsoft 365 cloud file storage and workspace files',
    icon: 'fa-brands fa-microsoft',
    iconColor: 'text-sky-400',
    iconBg: 'bg-sky-500/10'
  }
];

export default function CloudIntegrations({
  integrations = {},
  onRefreshIntegrations,
  projects = [],
  currentProjectId,
  currentFolderId,
  onFileImported
}) {
  const [browserProvider, setBrowserProvider] = useState(null); // 'google_drive' | 'dropbox' | 'onedrive'
  const [configModalProvider, setConfigModalProvider] = useState(null);
  const [connecting, setConnecting] = useState(false);
  const [connectMessage, setConnectMessage] = useState(null);
  const [copiedKey, setCopiedKey] = useState(null);
  const [togglingSystemStorage, setTogglingSystemStorage] = useState(false);

  const currentUser = useStore(state => state.currentUser);
  const isAdmin = currentUser?.role === 'Admin';

  const handleToggleSystemStorage = async (providerId) => {
    if (providerId !== 'google_drive') return;
    const isCurrentlySystem = Boolean(integrations.google_drive?.isSystemStorage);
    setTogglingSystemStorage(true);
    setConnectMessage(null);
    try {
      const res = await apiClient('/integrations/google/system-storage', {
        method: 'POST',
        body: { enabled: !isCurrentlySystem }
      });
      setConnectMessage({
        type: 'success',
        text: res.message || (isCurrentlySystem ? 'Google Drive system storage disabled' : 'Google Drive system storage enabled')
      });
      if (onRefreshIntegrations) await onRefreshIntegrations();
    } catch (err) {
      setConnectMessage({
        type: 'error',
        text: err.message || 'Failed to update system storage status'
      });
    } finally {
      setTogglingSystemStorage(false);
    }
  };

  const copyToClipboard = (text, key) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  // Handle OAuth redirect callback (?code=... in URL)
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get('code');

    if (code) {
      setConnecting(true);
      // Clean query params from URL to prevent duplicate exchange
      window.history.replaceState({}, document.title, window.location.pathname);

      const redirectUri = `${window.location.origin}${window.location.pathname}`;

      apiClient('/integrations/google/callback', {
        method: 'POST',
        body: { code, redirectUri }
      })
        .then(async (res) => {
          setConnectMessage({
            type: 'success',
            text: res.message || 'Google Drive connected successfully!'
          });
          if (onRefreshIntegrations) await onRefreshIntegrations();
        })
        .catch(err => {
          setConnectMessage({
            type: 'error',
            text: err.message || 'Failed to complete Google OAuth connection'
          });
        })
        .finally(() => {
          setConnecting(false);
        });
    }
  }, []);

  const handleConnectClick = async (providerId) => {
    setConnectMessage(null);

    if (providerId === 'google_drive') {
      try {
        setConnecting(true);
        const redirectUri = `${window.location.origin}${window.location.pathname}`;
        const res = await apiClient(`/integrations/google/auth-url?redirectUri=${encodeURIComponent(redirectUri)}`);

        if (res.configured && res.url) {
          // Direct redirect to Google OAuth 2.0 consent screen
          window.location.href = res.url;
        } else {
          // Google OAuth client ID not yet configured on server
          setConfigModalProvider(providerId);
        }
      } catch (err) {
        setConfigModalProvider(providerId);
      } finally {
        setConnecting(false);
      }
    } else {
      // Dropbox / OneDrive OAuth guidance
      setConfigModalProvider(providerId);
    }
  };

  const handleDisconnect = async (providerId) => {
    const pName = PROVIDERS.find(p => p.id === providerId)?.name || providerId;
    if (!window.confirm(`Disconnect your ${pName} account from DEVHUB?`)) return;

    try {
      await apiClient('/integrations/disconnect', {
        method: 'POST',
        body: { provider: providerId }
      });
      if (onRefreshIntegrations) await onRefreshIntegrations();
      setConnectMessage({ type: 'success', text: `${pName} disconnected successfully` });
    } catch (err) {
      alert(err.message || 'Failed to disconnect integration');
    }
  };

  return (
    <div className="mb-6">
      {/* Section Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-sm font-bold text-white tracking-tight flex items-center gap-2">
            <i className="fa-solid fa-cloud-arrow-up text-purple-400"></i>
            <span>Cloud Storage Integrations</span>
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Connect your personal cloud storage to browse and import files directly into DEVHUB projects
          </p>
        </div>
      </div>

      {/* Connection notification message banner */}
      {connectMessage && (
        <div
          className={`mb-4 px-4 py-3 rounded-xl text-xs flex items-center justify-between border ${
            connectMessage.type === 'success'
              ? 'bg-emerald-500/10 border-emerald-500/25 text-emerald-300'
              : 'bg-rose-500/10 border-rose-500/25 text-rose-300'
          }`}
        >
          <div className="flex items-center gap-2">
            <i className={`fa-solid ${connectMessage.type === 'success' ? 'fa-circle-check text-emerald-400' : 'fa-circle-exclamation text-rose-400'}`}></i>
            <span className="font-medium">{connectMessage.text}</span>
          </div>
          <button type="button" onClick={() => setConnectMessage(null)} className="hover:opacity-75">
            <i className="fa-solid fa-xmark"></i>
          </button>
        </div>
      )}

      {/* Provider Cards Grid - Equal Heights, Spacious Row of 3 on Desktop, Stacking on Mobile */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5 items-stretch">
        {PROVIDERS.map(p => {
          const status = integrations[p.id] || { connected: false };
          return (
            <CloudIntegrationCard
              key={p.id}
              providerId={p.id}
              name={p.name}
              description={p.description}
              icon={p.icon}
              iconBg={p.iconBg}
              iconColor={p.iconColor}
              isConnected={Boolean(status.connected)}
              accountName={status.accountName}
              onConnect={() => handleConnectClick(p.id)}
              onOpen={() => setBrowserProvider(p.id)}
              onDisconnect={() => handleDisconnect(p.id)}
              connecting={connecting && p.id === 'google_drive'}
              isAdmin={isAdmin}
              isSystemStorage={Boolean(status.isSystemStorage)}
              onToggleSystemStorage={() => handleToggleSystemStorage(p.id)}
              togglingSystemStorage={togglingSystemStorage}
            />
          );
        })}
      </div>

      {/* Drive Browser Modal */}
      {browserProvider && (
        <DriveBrowser
          isOpen={Boolean(browserProvider)}
          onClose={() => setBrowserProvider(null)}
          provider={browserProvider}
          providerName={PROVIDERS.find(p => p.id === browserProvider)?.name}
          providerIcon={PROVIDERS.find(p => p.id === browserProvider)?.icon}
          accountName={integrations[browserProvider]?.accountName}
          projects={projects}
          currentProjectId={currentProjectId}
          currentFolderId={currentFolderId}
          onFileImported={onFileImported}
        />
      )}

      {/* Integration Setup / Configuration Guidance Modal */}
      {configModalProvider && (
        <Modal
          open={Boolean(configModalProvider)}
          onClose={() => setConfigModalProvider(null)}
          className="max-w-xl p-6 bg-[#0f1422] border border-[#1f2a44] rounded-2xl shadow-2xl text-slate-100"
        >
          {/* Header */}
          <div className="flex items-center justify-between pb-3.5 border-b border-slate-700/50 mb-4">
            <h3 className="text-base font-bold flex items-center gap-2.5 text-white">
              <span className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 border border-white/10 ${
                configModalProvider === 'google_drive' ? 'bg-amber-500/10 text-amber-500' :
                configModalProvider === 'dropbox' ? 'bg-blue-500/10 text-blue-500' :
                'bg-sky-500/10 text-sky-500'
              }`}>
                <i className={`${PROVIDERS.find(p => p.id === configModalProvider)?.icon} text-base`}></i>
              </span>
              <span>Connect {PROVIDERS.find(p => p.id === configModalProvider)?.name}</span>
            </h3>
            <button
              onClick={() => setConfigModalProvider(null)}
              className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-800 transition"
              title="Close modal"
            >
              <i className="fa-solid fa-xmark text-sm"></i>
            </button>
          </div>

          {configModalProvider === 'google_drive' ? (
            <div className="space-y-4 text-xs">
              <div className="p-3.5 rounded-xl border border-amber-500/30 bg-amber-500/10 text-amber-200">
                <p className="font-bold mb-1 flex items-center gap-1.5 text-sm text-amber-300">
                  <i className="fa-solid fa-circle-info"></i> Google OAuth 2.0 Credentials Setup
                </p>
                <p className="text-xs leading-relaxed opacity-90">
                  DEVHUB uses authentic Google OAuth 2.0 to connect your personal Google Drive with strict per-user isolation. To enable 1-click Google Sign-in on your live backend, add these environment variables in your <strong>Render Dashboard &rarr; Environment</strong>:
                </p>
              </div>

              {/* Render Environment Code Snippet */}
              <div className="border border-[#1f2a44] rounded-xl overflow-hidden shadow-lg bg-[#0b101b]">
                <div className="px-3.5 py-2 bg-slate-950 border-b border-slate-800 flex items-center justify-between text-[11px]">
                  <div className="flex items-center gap-2 text-slate-300 font-mono font-medium">
                    <i className="fa-solid fa-terminal text-purple-400 text-xs"></i>
                    <span>Backend Environment Variables (.env)</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => copyToClipboard(
                      `GOOGLE_CLIENT_ID=your_client_id.apps.googleusercontent.com\nGOOGLE_CLIENT_SECRET=GOCSPX-your_client_secret\nGOOGLE_REDIRECT_URI=${window.location.origin}/files`,
                      'all'
                    )}
                    className="px-2.5 py-1 rounded bg-purple-500/20 hover:bg-purple-500/30 text-purple-300 border border-purple-500/30 text-[11px] font-semibold transition flex items-center gap-1.5"
                  >
                    <i className={`fa-solid ${copiedKey === 'all' ? 'fa-check text-emerald-400' : 'fa-copy'}`}></i>
                    <span>{copiedKey === 'all' ? 'Copied!' : 'Copy'}</span>
                  </button>
                </div>

                <div className="p-3 space-y-2 font-mono text-[11px]">
                  <div className="bg-slate-900/80 p-2 rounded-lg border border-slate-800 flex items-center justify-between">
                    <span className="text-purple-300 font-bold">GOOGLE_CLIENT_ID</span>
                    <span className="text-slate-400 text-[10px]">Google Cloud OAuth 2.0 Client ID</span>
                  </div>
                  <div className="bg-slate-900/80 p-2 rounded-lg border border-slate-800 flex items-center justify-between">
                    <span className="text-purple-300 font-bold">GOOGLE_CLIENT_SECRET</span>
                    <span className="text-slate-400 text-[10px]">Google Cloud OAuth 2.0 Client Secret</span>
                  </div>
                  <div className="bg-slate-900/80 p-2 rounded-lg border border-slate-800 flex items-center justify-between">
                    <span className="text-purple-300 font-bold">GOOGLE_REDIRECT_URI</span>
                    <span className="text-slate-400 text-[10px]">{window.location.origin}/files</span>
                  </div>
                </div>
              </div>

              {/* Instructions */}
              <div className="p-3.5 bg-[#141b2d] border border-[#1f2a44] rounded-xl text-xs space-y-2 text-slate-300">
                <p className="font-bold text-white flex items-center gap-1.5">
                  <i className="fa-solid fa-list-ol text-purple-400"></i> Setup Steps:
                </p>
                <ol className="list-decimal list-inside space-y-1.5 text-[11px] text-slate-300 leading-relaxed">
                  <li>In Google Cloud Console, enable the <strong>Google Drive API</strong>.</li>
                  <li>Create an <strong>OAuth 2.0 Client ID (Web Application)</strong>.</li>
                  <li>Add <code>{window.location.origin}/files</code> to <strong>Authorized redirect URIs</strong>.</li>
                  <li>Paste the Client ID and Secret in your Render backend Environment.</li>
                  <li>Click <strong>Connect</strong> to authorize with your personal Google Account!</li>
                </ol>
              </div>

              <div className="flex justify-end pt-2">
                <button
                  type="button"
                  onClick={() => setConfigModalProvider(null)}
                  className="px-4 py-2 bg-[#161d2f] hover:bg-[#1e273f] text-white rounded-xl text-xs font-semibold transition border border-[#1f2a44]"
                >
                  Close
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-4 text-xs">
              <div className="p-3.5 bg-[#141b2d] border border-[#1f2a44] rounded-xl text-slate-300 space-y-2">
                <p className="font-bold text-white flex items-center gap-1.5 text-sm">
                  <i className="fa-solid fa-circle-info text-blue-400"></i>
                  <span>{PROVIDERS.find(p => p.id === configModalProvider)?.name} OAuth Integration</span>
                </p>
                <p className="text-[11px] leading-relaxed text-slate-300">
                  Real OAuth connection for {PROVIDERS.find(p => p.id === configModalProvider)?.name} requires registering a developer application and configuring client credentials on the backend.
                </p>
                <p className="text-[11px] leading-relaxed text-slate-400">
                  In accordance with strict security standards, DEVHUB does not use fake connection states. Once your app credentials are added to the backend, personal account authorization will be enabled.
                </p>
              </div>

              <div className="flex justify-end pt-2">
                <button
                  type="button"
                  onClick={() => setConfigModalProvider(null)}
                  className="px-4 py-2 bg-[#161d2f] hover:bg-[#1e273f] text-white rounded-xl text-xs font-semibold transition border border-[#1f2a44]"
                >
                  Close
                </button>
              </div>
            </div>
          )}
        </Modal>
      )}
    </div>
  );
}
