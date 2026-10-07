import React, { useState, useEffect, useCallback } from 'react';
import { apiClient } from '../api/client';
import { useStore } from '../store';
import CompactPageHeader from '../components/common/CompactPageHeader';
import Modal from '../components/common/Modal';
import ConfirmDialog from '../components/common/ConfirmDialog';
import ExternalFileBrowser from '../components/files/ExternalFileBrowser';

const EXTERNAL_PROVIDERS = [
  {
    id: 'google_drive',
    name: 'Google Drive',
    description: 'Personal Google Drive documents, sheets, and drives',
    icon: 'fa-brands fa-google-drive',
    color: 'text-amber-400',
    bg: 'bg-amber-500/10',
    border: 'border-amber-500/20'
  },
  {
    id: 'dropbox',
    name: 'Dropbox',
    description: 'Personal Dropbox storage and synced files',
    icon: 'fa-brands fa-dropbox',
    color: 'text-blue-400',
    bg: 'bg-blue-500/10',
    border: 'border-blue-500/20'
  },
  {
    id: 'onedrive',
    name: 'OneDrive',
    description: 'Microsoft OneDrive and Office 365 cloud files',
    icon: 'fa-brands fa-microsoft',
    color: 'text-sky-400',
    bg: 'bg-sky-500/10',
    border: 'border-sky-500/20'
  }
];

export default function Settings() {
  const { currentUser } = useStore();
  const [integrations, setIntegrations] = useState({});
  const [devhubQuota, setDevhubQuota] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [feedback, setFeedback] = useState(null);

  // External Browser modal
  const [browserConfig, setBrowserConfig] = useState({
    isOpen: false,
    provider: 'google_drive',
    accountName: ''
  });

  // Connect Token Modal
  const [connectModal, setConnectModal] = useState({
    isOpen: false,
    provider: null,
    accessToken: '',
    accountName: '',
    submitting: false,
    error: null
  });

  // Disconnect Confirmation Dialog
  const [disconnectModal, setDisconnectModal] = useState({
    isOpen: false,
    provider: null,
    providerName: '',
    submitting: false
  });

  // Load integrations and DEVHUB quota
  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const [intRes, quotaRes] = await Promise.all([
        apiClient('/integrations').catch(() => ({ integrations: {} })),
        apiClient('/integrations/quota?provider=devhub').catch(() => ({ quota: null }))
      ]);

      setIntegrations(intRes?.integrations || {});
      setDevhubQuota(quotaRes?.quota || null);
    } catch (err) {
      setError(err.message || 'Failed to load storage integrations');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Handle OAuth redirect callback query params (e.g. ?code=...&state=...)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    const state = params.get('state');

    if (code) {
      setLoading(true);
      const redirectUri = `${window.location.origin}${window.location.pathname}`.replace(/\/$/, '');
      
      // Attempt callback exchange (defaulting to google or state provider)
      let targetProvider = 'google_drive';
      if (state) {
        try {
          const parsed = JSON.parse(atob(state));
          if (parsed.provider) targetProvider = parsed.provider;
        } catch (_) {}
      }

      apiClient(`/integrations/${targetProvider}/callback`, {
        method: 'POST',
        body: { code, redirectUri, state }
      })
        .then(() => {
          setFeedback({
            type: 'success',
            text: `Successfully connected ${targetProvider.replace('_', ' ')}!`
          });
          window.history.replaceState({}, document.title, window.location.pathname);
          loadData();
        })
        .catch(err => {
          setFeedback({
            type: 'error',
            text: `Connection failed: ${err.message}`
          });
          window.history.replaceState({}, document.title, window.location.pathname);
        })
        .finally(() => setLoading(false));
    }
  }, [loadData]);

  // Start OAuth Connect Flow
  const handleStartOAuthConnect = async (providerId) => {
    try {
      const redirectUri = `${window.location.origin}${window.location.pathname}`.replace(/\/$/, '');
      const res = await apiClient(`/integrations/${providerId}/auth-url?redirectUri=${encodeURIComponent(redirectUri)}`);

      if (res.url) {
        window.location.href = res.url;
      } else {
        // Fallback to token modal if OAuth URL is not configured on server
        setConnectModal({
          isOpen: true,
          provider: providerId,
          accessToken: '',
          accountName: '',
          submitting: false,
          error: null
        });
      }
    } catch (err) {
      // Fallback to token input modal
      setConnectModal({
        isOpen: true,
        provider: providerId,
        accessToken: '',
        accountName: '',
        submitting: false,
        error: null
      });
    }
  };

  // Submit Direct Token Connect
  const handleSubmitTokenConnect = async (e) => {
    e.preventDefault();
    if (!connectModal.accessToken.trim()) {
      setConnectModal(prev => ({ ...prev, error: 'Access token is required' }));
      return;
    }

    try {
      setConnectModal(prev => ({ ...prev, submitting: true, error: null }));
      await apiClient('/integrations/connect', {
        method: 'POST',
        body: {
          provider: connectModal.provider,
          accessToken: connectModal.accessToken.trim(),
          accountName: connectModal.accountName.trim() || undefined
        }
      });

      setFeedback({
        type: 'success',
        text: `Connected ${connectModal.provider.replace('_', ' ')} successfully.`
      });
      setConnectModal({ isOpen: false, provider: null, accessToken: '', accountName: '', submitting: false, error: null });
      loadData();
    } catch (err) {
      setConnectModal(prev => ({ ...prev, submitting: false, error: err.message || 'Token verification failed' }));
    }
  };

  // Prompt Disconnect Modal
  const handlePromptDisconnect = (provider) => {
    setDisconnectModal({
      isOpen: true,
      provider: provider.id,
      providerName: provider.name,
      submitting: false
    });
  };

  // Execute Safe Disconnect
  const handleConfirmDisconnect = async () => {
    try {
      setDisconnectModal(prev => ({ ...prev, submitting: true }));
      await apiClient('/integrations/disconnect', {
        method: 'POST',
        body: { provider: disconnectModal.provider }
      });

      setFeedback({
        type: 'success',
        text: `${disconnectModal.providerName} was safely disconnected. No files were deleted.`
      });
      setDisconnectModal({ isOpen: false, provider: null, providerName: '', submitting: false });
      loadData();
    } catch (err) {
      setFeedback({
        type: 'error',
        text: `Disconnect failed: ${err.message}`
      });
      setDisconnectModal(prev => ({ ...prev, submitting: false }));
    }
  };

  // Open External Browser
  const handleOpenBrowser = (providerId, accountName) => {
    setBrowserConfig({
      isOpen: true,
      provider: providerId,
      accountName: accountName || ''
    });
  };

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto space-y-6">
      {/* Page Header */}
      <CompactPageHeader
        title="Settings"
        subtitle="Manage your connected cloud storage, security, and account preferences"
        icon="fa-solid fa-gear"
      />

      {feedback && (
        <div
          className={`p-3.5 rounded-xl border flex items-center justify-between text-xs ${
            feedback.type === 'success'
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
              : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
          }`}
        >
          <div className="flex items-center space-x-2">
            <i className={`fa-solid ${feedback.type === 'success' ? 'fa-circle-check' : 'fa-circle-exclamation'}`}></i>
            <span>{feedback.text}</span>
          </div>
          <button
            onClick={() => setFeedback(null)}
            className="text-slate-400 hover:text-white"
          >
            <i className="fa-solid fa-xmark"></i>
          </button>
        </div>
      )}

      {/* Main Settings Section: Connected Storage */}
      <div className="space-y-6">
        <div>
          <h2 className="text-lg font-bold text-white flex items-center space-x-2">
            <i className="fa-solid fa-hard-drive text-indigo-400"></i>
            <span>Connected Storage</span>
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Configure DEVHUB Cloud Storage and manage your private personal cloud integrations.
          </p>
        </div>

        {/* 1. DEVHUB CLOUD STORAGE (SYSTEM MANAGED) */}
        <div className="p-5 rounded-2xl bg-gradient-to-br from-[#121626] to-[#0d101a] border border-indigo-500/30 shadow-xl relative overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/5 rounded-full blur-3xl pointer-events-none"></div>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-start space-x-3.5">
              <div className="w-12 h-12 rounded-xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center shrink-0">
                <i className="fa-solid fa-cloud text-indigo-400 text-xl"></i>
              </div>
              <div>
                <div className="flex items-center space-x-2.5">
                  <h3 className="text-base font-bold text-white">DEVHUB Cloud Storage</h3>
                  <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 flex items-center space-x-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                    <span>System managed</span>
                  </span>
                </div>
                <p className="text-xs text-slate-400 mt-1 max-w-xl leading-relaxed">
                  The primary physical storage pool for all DEVHUB workspace files, personal folders, and team drives. Managed automatically by the DEVHUB System Storage backend.
                </p>
              </div>
            </div>

            {/* Quota Indicator */}
            {devhubQuota && (
              <div className="bg-slate-900/80 border border-slate-800 p-3 rounded-xl shrink-0 text-right">
                <div className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">Personal Quota</div>
                <div className="text-sm font-bold text-white mt-0.5">
                  {devhubQuota.usedGB} / {devhubQuota.allocatedGB} GB
                </div>
                <div className="w-32 bg-slate-800 h-1.5 rounded-full mt-2 overflow-hidden">
                  <div
                    className="bg-indigo-500 h-full rounded-full transition-all"
                    style={{ width: `${Math.min(devhubQuota.percentage || 0, 100)}%` }}
                  ></div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* 2. PERSONAL EXTERNAL CLOUD STORAGE SECTION */}
        <div className="space-y-4 pt-2">
          <div>
            <h3 className="text-sm font-bold text-white uppercase tracking-wider text-slate-300">
              Personal External Storage
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Connect your private cloud accounts to browse or import files. External files do <strong>not</strong> count towards your DEVHUB quota.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {EXTERNAL_PROVIDERS.map(p => {
              const integration = integrations[p.id];
              const isConnected = Boolean(integration?.connected);
              const accountName = integration?.accountName;

              return (
                <div
                  key={p.id}
                  className={`p-4 rounded-xl bg-[#0f121d] border ${
                    isConnected ? p.border : 'border-slate-800'
                  } transition flex flex-col justify-between space-y-4`}
                >
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2.5">
                        <div className={`w-9 h-9 rounded-lg ${p.bg} flex items-center justify-center`}>
                          <i className={`${p.icon} ${p.color} text-lg`}></i>
                        </div>
                        <span className="font-bold text-white text-sm">{p.name}</span>
                      </div>

                      {isConnected ? (
                        <span className="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                          Connected
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-slate-800 text-slate-400 border border-slate-700">
                          Not connected
                        </span>
                      )}
                    </div>

                    <p className="text-xs text-slate-400 leading-relaxed">
                      {p.description}
                    </p>

                    {isConnected && accountName && (
                      <div className="text-[11px] text-slate-300 bg-slate-900/80 px-2.5 py-1 rounded-lg border border-slate-800 truncate">
                        <i className="fa-regular fa-user text-slate-500 mr-1.5"></i>
                        <span>{accountName}</span>
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="pt-2 border-t border-slate-800/80 flex items-center gap-2">
                    {isConnected ? (
                      <>
                        <button
                          type="button"
                          onClick={() => handleOpenBrowser(p.id, accountName)}
                          className="flex-1 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-medium transition flex items-center justify-center space-x-1.5"
                        >
                          <i className="fa-regular fa-folder-open"></i>
                          <span>Browse</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => handlePromptDisconnect(p)}
                          className="px-3 py-1.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/30 rounded-lg text-xs font-medium transition flex items-center justify-center space-x-1"
                          title="Disconnect account"
                        >
                          <i className="fa-solid fa-link-slash"></i>
                          <span>Disconnect</span>
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleStartOAuthConnect(p.id)}
                        className="w-full px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-white border border-slate-700 rounded-lg text-xs font-medium transition flex items-center justify-center space-x-1.5"
                      >
                        <i className="fa-solid fa-plug"></i>
                        <span>Connect</span>
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* External File Browser Modal */}
      {browserConfig.isOpen && (
        <ExternalFileBrowser
          isOpen={browserConfig.isOpen}
          onClose={() => setBrowserConfig(prev => ({ ...prev, isOpen: false }))}
          provider={browserConfig.provider}
          accountName={browserConfig.accountName}
          onFileImported={() => {
            loadData();
          }}
        />
      )}

      {/* Direct Token Connect Modal */}
      {connectModal.isOpen && (
        <Modal
          isOpen={connectModal.isOpen}
          onClose={() => setConnectModal(prev => ({ ...prev, isOpen: false }))}
          title={`Connect ${connectModal.provider ? connectModal.provider.replace('_', ' ') : 'Cloud Storage'}`}
        >
          <form onSubmit={handleSubmitTokenConnect} className="space-y-4">
            <p className="text-xs text-slate-400">
              Provide an API access token for your personal cloud storage account. Tokens are encrypted at rest and never exposed.
            </p>

            {connectModal.error && (
              <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-xs text-rose-300">
                {connectModal.error}
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Account Label (Optional)
              </label>
              <input
                type="text"
                placeholder="e.g. personal-drive@gmail.com"
                value={connectModal.accountName}
                onChange={e => setConnectModal(prev => ({ ...prev, accountName: e.target.value }))}
                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-hidden focus:border-indigo-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                API Access Token <span className="text-rose-400">*</span>
              </label>
              <textarea
                rows={3}
                placeholder="Paste your OAuth access token or developer token..."
                value={connectModal.accessToken}
                onChange={e => setConnectModal(prev => ({ ...prev, accessToken: e.target.value }))}
                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-hidden focus:border-indigo-500 font-mono"
                required
              />
            </div>

            <div className="flex justify-end space-x-2 pt-2">
              <button
                type="button"
                onClick={() => setConnectModal(prev => ({ ...prev, isOpen: false }))}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs rounded-xl"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={connectModal.submitting}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-semibold rounded-xl flex items-center space-x-1.5"
              >
                {connectModal.submitting && <i className="fa-solid fa-circle-notch fa-spin"></i>}
                <span>Connect Storage</span>
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Disconnect Safety Dialog */}
      {disconnectModal.isOpen && (
        <ConfirmDialog
          isOpen={disconnectModal.isOpen}
          title={`Disconnect ${disconnectModal.providerName}?`}
          message={
            <span>
              Are you sure you want to disconnect your <strong>{disconnectModal.providerName}</strong> account?
              <br /><br />
              <span className="text-slate-400">
                Safety Guarantee: Disconnecting only removes DEVHUB's integration token. Your files on {disconnectModal.providerName} and your DEVHUB Cloud Storage files remain completely untouched and safe.
              </span>
            </span>
          }
          confirmLabel={disconnectModal.submitting ? 'Disconnecting...' : 'Disconnect'}
          confirmVariant="danger"
          onConfirm={handleConfirmDisconnect}
          onCancel={() => setDisconnectModal({ isOpen: false, provider: null, providerName: '', submitting: false })}
        />
      )}
    </div>
  );
}
