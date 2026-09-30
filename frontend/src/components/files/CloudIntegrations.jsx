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

const DEFAULT_GOOGLE_CONFIG = {
  clientId: 'your_client_id.apps.googleusercontent.com',
  clientSecret: 'GOCSPX-your_client_secret',
  redirectUri: 'https://devhub-ten-wheat.vercel.app/files'
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
  const [browserProvider, setBrowserProvider] = useState(null); // 'google_drive' | 'dropbox' | 'onedrive'
  const [configModalProvider, setConfigModalProvider] = useState(null);
  const [connecting, setConnecting] = useState(false);
  const [connectMessage, setConnectMessage] = useState(null);

  // Manual token connect state (for development/testing or Dropbox/OneDrive)
  const [manualToken, setManualToken] = useState('');
  const [manualAccount, setManualAccount] = useState('');
  const [manualSubmitting, setManualSubmitting] = useState(false);
  const [manualError, setManualError] = useState(null);
  const [copiedKey, setCopiedKey] = useState(null);

  const copyToClipboard = (text, key) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

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

    if (configModalProvider === 'google_drive' && (manualToken.trim().startsWith('GOCSPX-') || manualToken.trim().includes('client_secret'))) {
      setManualError('This is your Google Client Secret (GOCSPX-...), not an OAuth Access Token. To connect Google Drive, add your Client ID and Secret to Render environment variables. 1-Click Google Sign-in will then connect automatically.');
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
          className="max-w-xl p-6 bg-[#0f1422] border border-[#1f2a44] rounded-2xl shadow-2xl text-slate-100"
        >
          {/* Header */}
          <div className="flex items-center justify-between pb-3.5 border-b border-slate-700/50 mb-4">
            <h3 className="text-base font-bold flex items-center gap-2.5 text-slate-900 dark:text-white">
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
              className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200 dark:hover:bg-slate-800 transition"
              title="Close modal"
            >
              <i className="fa-solid fa-xmark text-sm"></i>
            </button>
          </div>

          {configModalProvider === 'google_drive' ? (
            <div className="space-y-4 text-xs">
              {/* High Contrast Alert */}
              <div className="p-3.5 rounded-xl border cloud-alert-amber text-xs">
                <p className="font-bold mb-1 flex items-center gap-1.5 text-sm">
                  <i className="fa-solid fa-circle-info"></i> Google OAuth Setup Required on Backend
                </p>
                <p className="text-xs leading-relaxed opacity-90">
                  To enable seamless 1-click Google Sign-in for all workspace members, add these 3 credentials to your <strong>Render Dashboard &rarr; Environment</strong>:
                </p>
              </div>

              {/* Code Snippet Box (Always Dark Terminal Style & Ultra High Contrast) */}
              <div className="cloud-env-snippet border rounded-xl overflow-hidden shadow-lg">
                <div className="px-3.5 py-2 bg-slate-950 border-b border-slate-800 flex items-center justify-between text-[11px]">
                  <div className="flex items-center gap-2 text-slate-300 font-mono font-medium">
                    <i className="fa-solid fa-terminal text-sky-400 text-xs"></i>
                    <span>Render Environment (.env)</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => copyToClipboard(
                      `GOOGLE_CLIENT_ID=${DEFAULT_GOOGLE_CONFIG.clientId}\nGOOGLE_CLIENT_SECRET=${DEFAULT_GOOGLE_CONFIG.clientSecret}\nGOOGLE_REDIRECT_URI=${typeof window !== 'undefined' ? `${window.location.origin}/files` : DEFAULT_GOOGLE_CONFIG.redirectUri}`,
                      'all'
                    )}
                    className="px-2.5 py-1 rounded bg-sky-500/15 hover:bg-sky-500/25 text-sky-300 border border-sky-500/30 text-[11px] font-semibold transition flex items-center gap-1.5 shadow-sm"
                  >
                    <i className={`fa-solid ${copiedKey === 'all' ? 'fa-check text-emerald-400' : 'fa-copy'}`}></i>
                    <span>{copiedKey === 'all' ? 'Copied All!' : 'Copy All'}</span>
                  </button>
                </div>

                <div className="p-3 space-y-2 font-mono text-[11px] bg-[#0b101b]">
                  {/* Row 1 */}
                  <div className="flex items-center justify-between gap-2 bg-slate-900/80 p-2 rounded-lg border border-slate-800">
                    <div className="min-w-0 flex-1 truncate">
                      <span className="env-var-name font-bold">GOOGLE_CLIENT_ID</span>
                      <span className="text-slate-500 mx-1">=</span>
                      <span className="env-var-val truncate">{DEFAULT_GOOGLE_CONFIG.clientId}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => copyToClipboard(DEFAULT_GOOGLE_CONFIG.clientId, 'id')}
                      title="Copy Client ID"
                      className="p-1 px-2 text-[10px] rounded bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition shrink-0"
                    >
                      <i className={`fa-solid ${copiedKey === 'id' ? 'fa-check text-emerald-400' : 'fa-copy'}`}></i>
                    </button>
                  </div>

                  {/* Row 2 */}
                  <div className="flex items-center justify-between gap-2 bg-slate-900/80 p-2 rounded-lg border border-slate-800">
                    <div className="min-w-0 flex-1 truncate">
                      <span className="env-var-name font-bold">GOOGLE_CLIENT_SECRET</span>
                      <span className="text-slate-500 mx-1">=</span>
                      <span className="env-var-val truncate">{DEFAULT_GOOGLE_CONFIG.clientSecret}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => copyToClipboard(DEFAULT_GOOGLE_CONFIG.clientSecret, 'secret')}
                      title="Copy Client Secret"
                      className="p-1 px-2 text-[10px] rounded bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition shrink-0"
                    >
                      <i className={`fa-solid ${copiedKey === 'secret' ? 'fa-check text-emerald-400' : 'fa-copy'}`}></i>
                    </button>
                  </div>

                  {/* Row 3 */}
                  <div className="flex items-center justify-between gap-2 bg-slate-900/80 p-2 rounded-lg border border-slate-800">
                    <div className="min-w-0 flex-1 truncate">
                      <span className="env-var-name font-bold">GOOGLE_REDIRECT_URI</span>
                      <span className="text-slate-500 mx-1">=</span>
                      <span className="env-var-val truncate">{typeof window !== 'undefined' ? `${window.location.origin}/files` : DEFAULT_GOOGLE_CONFIG.redirectUri}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => copyToClipboard(typeof window !== 'undefined' ? `${window.location.origin}/files` : DEFAULT_GOOGLE_CONFIG.redirectUri, 'uri')}
                      title="Copy Redirect URI"
                      className="p-1 px-2 text-[10px] rounded bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition shrink-0"
                    >
                      <i className={`fa-solid ${copiedKey === 'uri' ? 'fa-check text-emerald-400' : 'fa-copy'}`}></i>
                    </button>
                  </div>
                </div>
              </div>

              {/* Instructions */}
              <div className="p-3 bg-slate-100 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 rounded-xl text-xs space-y-1.5">
                <p className="font-bold text-slate-800 dark:text-slate-200">How to activate 1-click Google Sign-in:</p>
                <ol className="list-decimal list-inside space-y-1 text-slate-600 dark:text-slate-300 text-[11px] leading-relaxed">
                  <li>Go to your <strong>Render Dashboard</strong> &rarr; DevHub Backend &rarr; <strong>Environment</strong>.</li>
                  <li>Click <strong>Add Environment Variable</strong> and paste the 3 variables above.</li>
                  <li>Click <strong>Save Changes</strong> (Render will automatically redeploy in ~1 min).</li>
                  <li>Come back here and click <strong>Connect</strong> &mdash; Google&apos;s 1-click sign-in will launch immediately!</li>
                </ol>
              </div>

              {/* Advanced / Developer Token Option */}
              <div className="pt-2 border-t border-slate-200 dark:border-slate-800">
                <details className="group">
                  <summary className="cursor-pointer text-[11px] font-semibold text-slate-500 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition select-none flex items-center justify-between py-1">
                    <span>Advanced: Test immediately with a temporary OAuth Access Token (ya29...)</span>
                    <i className="fa-solid fa-chevron-down text-[10px] transition group-open:rotate-180"></i>
                  </summary>
                  <form onSubmit={handleManualConnectSubmit} className="mt-3 space-y-3">
                    <div className="p-2.5 bg-amber-500/10 border border-amber-500/20 rounded-lg text-amber-700 dark:text-amber-300 text-[11px]">
                      ⚠️ <strong>Important:</strong> Do not paste your <code>client_secret</code> (GOCSPX-...) here. Only paste a temporary Bearer access token starting with <code>ya29...</code>.
                    </div>
                    {manualError && (
                      <p className="text-[11px] text-rose-500 dark:text-rose-400 font-medium bg-rose-500/10 border border-rose-500/20 p-2 rounded-lg">{manualError}</p>
                    )}
                    <input
                      type="password"
                      placeholder="ya29.a0AfH6SM... (OAuth 2.0 Access Token)"
                      value={manualToken}
                      onChange={e => {
                        setManualToken(e.target.value);
                        setManualError(null);
                      }}
                      className="w-full bg-[#161d2f] border border-[#222e48] rounded-lg px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 font-mono"
                    />
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setConfigModalProvider(null)}
                        className="px-3 py-1.5 bg-slate-200 dark:bg-[#1b233a] hover:bg-slate-300 dark:hover:bg-[#253150] text-slate-700 dark:text-slate-300 rounded-lg text-xs font-medium"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        disabled={manualSubmitting}
                        className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold shadow-sm"
                      >
                        {manualSubmitting ? 'Verifying...' : 'Connect with Token'}
                      </button>
                    </div>
                  </form>
                </details>
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
                <div className="flex justify-end gap-2 pt-2 border-t border-slate-200 dark:border-[#1f2a44]">
                  <button
                    type="button"
                    onClick={() => setConfigModalProvider(null)}
                    className="px-3 py-1.5 bg-slate-200 dark:bg-[#1b233a] hover:bg-slate-300 dark:hover:bg-[#253150] text-slate-700 dark:text-slate-300 rounded-lg text-xs font-medium"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={manualSubmitting}
                    className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold shadow-sm"
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
