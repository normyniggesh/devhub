import { useState, useEffect } from 'react';
import { apiClient } from '../../api/client';
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
  // Modal states
  const [browserProvider, setBrowserProvider] = useState(null); // 'google_drive' | 'dropbox' | 'onedrive'
  const [configModalProvider, setConfigModalProvider] = useState(null);
  const [connecting, setConnecting] = useState(false);
  const [connectMessage, setConnectMessage] = useState(null);

  // Manual token connect state (for development/testing or Dropbox/OneDrive)
  const [manualToken, setManualToken] = useState('');
  const [manualAccount, setManualAccount] = useState('');
  const [manualSubmitting, setManualSubmitting] = useState(false);
  const [manualError, setManualError] = useState(null);

  // Handle OAuth redirect callback (?code=... in URL)
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get('code');
    const state = urlParams.get('state');

    if (code) {
      setConnecting(true);
      // Clean query params from URL to prevent duplicate exchange
      window.history.replaceState({}, document.title, window.location.pathname);

      const redirectUri = `${window.location.origin}${window.location.pathname}`;

      apiClient('/integrations/google/callback', {
        method: 'POST',
        body: { code, redirectUri }
      })
        .then(async () => {
          setConnectMessage({ type: 'success', text: 'Google Drive connected successfully!' });
          if (onRefreshIntegrations) await onRefreshIntegrations();
        })
        .catch(err => {
          setConnectMessage({ type: 'error', text: err.message || 'Failed to complete Google OAuth connection' });
        })
        .finally(() => {
          setConnecting(false);
        });
    }

    // Also listen for popup messages if popup flow is used
    const handleMessage = async (event) => {
      if (event.data?.type === 'GOOGLE_OAUTH_SUCCESS') {
        if (onRefreshIntegrations) await onRefreshIntegrations();
        setConnectMessage({ type: 'success', text: 'Google Drive connected successfully!' });
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  const handleConnectClick = async (providerId) => {
    setConnectMessage(null);

    if (providerId === 'google_drive') {
      try {
        setConnecting(true);
        const redirectUri = `${window.location.origin}${window.location.pathname}`;
        const res = await apiClient(`/integrations/google/auth-url?redirectUri=${encodeURIComponent(redirectUri)}`);

        if (res.configured && res.url) {
          // Redirect user to Google OAuth 2.0 consent screen
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
      // Dropbox / OneDrive
      setConfigModalProvider(providerId);
      setManualToken('');
      setManualAccount('');
      setManualError(null);
    }
  };

  const handleManualConnectSubmit = async (e) => {
    e.preventDefault();
    if (!manualToken.trim()) {
      setManualError('Access token is required');
      return;
    }

    try {
      setManualSubmitting(true);
      setManualError(null);

      await apiClient('/integrations/connect', {
        method: 'POST',
        body: {
          provider: configModalProvider,
          accessToken: manualToken.trim(),
          accountName: manualAccount.trim() || undefined
        }
      });

      if (onRefreshIntegrations) await onRefreshIntegrations();
      setConfigModalProvider(null);
      setConnectMessage({ type: 'success', text: `${configModalProvider.replace('_', ' ')} connected successfully!` });
    } catch (err) {
      setManualError(err.message || 'Failed to validate and connect with token');
    } finally {
      setManualSubmitting(false);
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
      <div className="flex items-center justify-between mb-3.5">
        <div>
          <h2 className="text-sm font-bold text-white tracking-tight flex items-center gap-2">
            <i className="fa-solid fa-cloud-arrow-up text-indigo-400"></i>
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
          className={`mb-4 px-4 py-2.5 rounded-xl text-xs flex items-center justify-between border ${
            connectMessage.type === 'success'
              ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-300'
              : 'bg-rose-500/10 border-rose-500/20 text-rose-300'
          }`}
        >
          <div className="flex items-center gap-2">
            <i className={`fa-solid ${connectMessage.type === 'success' ? 'fa-circle-check' : 'fa-circle-exclamation'}`}></i>
            <span>{connectMessage.text}</span>
          </div>
          <button type="button" onClick={() => setConnectMessage(null)} className="hover:opacity-75">
            <i className="fa-solid fa-xmark"></i>
          </button>
        </div>
      )}

      {/* Provider Cards Grid - Equal Heights, Professional SaaS Styling */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-stretch">
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
          className="max-w-lg p-6 bg-[#0f1422] border border-[#1f2a44] rounded-2xl shadow-xl text-white"
        >
          <div className="flex items-center justify-between pb-3 border-b border-[#1f2a44] mb-4">
            <h3 className="text-base font-bold flex items-center gap-2">
              <i className={`${PROVIDERS.find(p => p.id === configModalProvider)?.icon} ${PROVIDERS.find(p => p.id === configModalProvider)?.iconColor}`}></i>
              <span>Connect {PROVIDERS.find(p => p.id === configModalProvider)?.name}</span>
            </h3>
            <button
              onClick={() => setConfigModalProvider(null)}
              className="text-slate-400 hover:text-white transition"
            >
              <i className="fa-solid fa-xmark"></i>
            </button>
          </div>

          {configModalProvider === 'google_drive' ? (
            <div className="space-y-4 text-xs">
              <div className="p-3.5 bg-amber-500/10 border border-amber-500/20 rounded-xl text-amber-300">
                <p className="font-semibold mb-1 flex items-center gap-1.5">
                  <i className="fa-solid fa-gear"></i> Google OAuth Setup Required
                </p>
                <p className="text-[11px] text-amber-300/80 leading-relaxed">
                  To enable 1-click Google Sign-in for your personal Google Drive, add your OAuth credentials to your Render or backend environment:
                </p>
              </div>

              <div className="bg-[#141b2d] border border-[#222e48] rounded-xl p-3.5 space-y-2 text-[11px] text-slate-300 font-mono">
                <p><span className="text-indigo-400">GOOGLE_CLIENT_ID</span>=your_client_id.apps.googleusercontent.com</p>
                <p><span className="text-indigo-400">GOOGLE_CLIENT_SECRET</span>=GOCSPX-your_client_secret</p>
                <p><span className="text-indigo-400">GOOGLE_REDIRECT_URI</span>={window.location.origin}/files</p>
              </div>

              <div className="text-slate-400 text-[11px] space-y-1">
                <p className="font-semibold text-slate-300">Quick Setup Instructions:</p>
                <ol className="list-decimal list-inside space-y-0.5">
                  <li>Visit <a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noreferrer" className="text-indigo-400 underline">Google Cloud Console &rarr; Credentials</a></li>
                  <li>Create an <strong>OAuth client ID</strong> (Web application)</li>
                  <li>Add <strong>{window.location.origin}/files</strong> to Authorized Redirect URIs</li>
                  <li>Enable the <strong>Google Drive API</strong> in API Library</li>
                </ol>
              </div>

              {/* Developer / Manual Token Connect Option */}
              <div className="pt-3 border-t border-[#1f2a44]">
                <p className="text-[11px] text-slate-400 mb-2">Or test immediately with a Google OAuth Access Token:</p>
                <form onSubmit={handleManualConnectSubmit} className="space-y-3">
                  {manualError && (
                    <p className="text-[11px] text-rose-400 font-medium">{manualError}</p>
                  )}
                  <input
                    type="password"
                    placeholder="ya29.a0AfH6SM... (Access Token)"
                    value={manualToken}
                    onChange={e => setManualToken(e.target.value)}
                    className="w-full bg-[#161d2f] border border-[#222e48] rounded-lg px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 font-mono"
                  />
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setConfigModalProvider(null)}
                      className="px-3 py-1.5 bg-[#1b233a] hover:bg-[#253150] text-slate-300 rounded-lg text-xs"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={manualSubmitting}
                      className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold"
                    >
                      {manualSubmitting ? 'Verifying...' : 'Connect with Token'}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          ) : (
            <div className="space-y-4 text-xs">
              <div className="p-3 bg-[#161d2f] border border-[#222e48] rounded-xl text-slate-300">
                <p className="text-[11px] leading-relaxed">
                  Enter an API Access Token for <strong>{PROVIDERS.find(p => p.id === configModalProvider)?.name}</strong> to authenticate and browse your cloud files.
                </p>
              </div>

              <form onSubmit={handleManualConnectSubmit} className="space-y-3">
                {manualError && (
                  <p className="text-[11px] text-rose-400 font-medium">{manualError}</p>
                )}
                <div>
                  <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1">
                    Account Name or Email (Optional)
                  </label>
                  <input
                    type="text"
                    placeholder="user@example.com"
                    value={manualAccount}
                    onChange={e => setManualAccount(e.target.value)}
                    className="w-full bg-[#161d2f] border border-[#222e48] rounded-lg px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1">
                    API Access Token
                  </label>
                  <input
                    type="password"
                    placeholder="Paste access token here..."
                    value={manualToken}
                    onChange={e => setManualToken(e.target.value)}
                    className="w-full bg-[#161d2f] border border-[#222e48] rounded-lg px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 font-mono"
                  />
                </div>
                <div className="flex justify-end gap-2 pt-2 border-t border-[#1f2a44]">
                  <button
                    type="button"
                    onClick={() => setConfigModalProvider(null)}
                    className="px-3 py-1.5 bg-[#1b233a] hover:bg-[#253150] text-slate-300 rounded-lg text-xs"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={manualSubmitting}
                    className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold"
                  >
                    {manualSubmitting ? 'Verifying...' : 'Connect'}
                  </button>
                </div>
              </form>
            </div>
          )}
        </Modal>
      )}
    </div>
  );
}
