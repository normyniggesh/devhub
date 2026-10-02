import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { apiClient } from '../api/client';
import { useStore } from '../store';
import FileWorkspace from '../components/files/FileWorkspace';
import FilePreviewModal from '../components/files/FilePreviewModal';
import { useTransferManager } from '../hooks/useTransferManager';
import Avatar from '../components/common/Avatar';

export default function Files() {
  const { currentUser } = useStore();
  const location = useLocation();
  const navigate = useNavigate();

  const [projects, setProjects] = useState([]);
  const [selectedProjectId, setSelectedProjectId] = useState('');
  const [integrations, setIntegrations] = useState({
    google_drive: { connected: false }
  });
  const [loadingInitial, setLoadingInitial] = useState(true);
  const [oauthStatus, setOauthStatus] = useState({ loading: false, message: '', error: '' });

  // Preview Modal state
  const [previewFile, setPreviewFile] = useState(null);
  const [previewProvider, setPreviewProvider] = useState('local');
  const [showPreviewModal, setShowPreviewModal] = useState(false);

  // Transfer Manager (Clipboard & Cross-Pane Transfers)
  const transferManager = useTransferManager();

  // Load Initial Data (Projects & Integrations)
  const loadInitialData = async () => {
    try {
      setLoadingInitial(true);
      const [projRes, intRes] = await Promise.all([
        apiClient('/projects').catch(() => ({ projects: [] })),
        apiClient('/integrations').catch(() => ({ integrations: {} }))
      ]);

      const projectList = projRes.projects || [];
      setProjects(projectList);
      if (projectList.length > 0 && !selectedProjectId) {
        setSelectedProjectId(projectList[0].id);
      }

      setIntegrations(intRes.integrations || { google_drive: { connected: false } });
    } catch (err) {
      console.error('Failed to load initial file data:', err);
    } finally {
      setLoadingInitial(false);
    }
  };

  useEffect(() => {
    loadInitialData();
  }, []);

  // Handle Google OAuth Callback redirect
  useEffect(() => {
    const queryParams = new URLSearchParams(location.search);
    const code = queryParams.get('code');
    const error = queryParams.get('error');

    if (error) {
      setOauthStatus({ loading: false, message: '', error: `Google OAuth error: ${error}` });
      navigate('/files', { replace: true });
      return;
    }

    if (code) {
      const exchangeCode = async () => {
        try {
          setOauthStatus({ loading: true, message: 'Finalizing Google Drive connection...', error: '' });
          const redirectUri = `${window.location.origin}/files`;
          const res = await apiClient('/integrations/google/callback', {
            method: 'POST',
            body: { code, redirectUri }
          });

          if (res.success) {
            setOauthStatus({
              loading: false,
              message: 'Google Drive connected with full file management permissions!',
              error: ''
            });
            await loadInitialData();
          }
        } catch (err) {
          setOauthStatus({ loading: false, message: '', error: err.message || 'Failed to exchange Google OAuth code' });
        } finally {
          navigate('/files', { replace: true });
          setTimeout(() => setOauthStatus(prev => ({ ...prev, message: '' })), 6000);
        }
      };
      exchangeCode();
    }
  }, [location.search]);

  // Connect Google Drive Action
  const handleConnectGoogleDrive = async () => {
    try {
      setOauthStatus({ loading: true, message: 'Initiating Google Drive authorization...', error: '' });
      const redirectUri = `${window.location.origin}/files`;
      const res = await apiClient(`/integrations/google/auth-url?redirectUri=${encodeURIComponent(redirectUri)}`);

      if (res.configured && res.url) {
        window.location.href = res.url;
      } else {
        setOauthStatus({
          loading: false,
          message: '',
          error: res.message || 'Google OAuth is not configured on the backend.'
        });
      }
    } catch (err) {
      setOauthStatus({ loading: false, message: '', error: err.message || 'Failed to start Google OAuth' });
    }
  };

  // Open Preview Modal
  const handleOpenPreview = (file, provider) => {
    setPreviewFile(file);
    setPreviewProvider(provider);
    setShowPreviewModal(true);
  };

  // Save content from Preview Modal (for local PC text files)
  const handleSavePreviewContent = async (file, newContent) => {
    if (previewProvider === 'local' && file.handle) {
      const writable = await file.handle.createWritable();
      await writable.write(newContent);
      await writable.close();
    }
  };

  return (
    <div className="flex flex-col gap-6 max-w-[1920px] mx-auto pb-12 min-h-screen">
      {/* Top Header */}
      <div className="bg-[#0f1422] border border-[#192238] rounded-2xl p-6 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-[10px] font-bold tracking-wider text-slate-400 mb-1.5 uppercase">
            <span>Workspace</span>
            <span className="text-slate-600">›</span>
            <span className="text-indigo-400">File Manager</span>
          </div>
          <h1 className="text-2xl font-extrabold text-white tracking-tight flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 to-indigo-700 flex items-center justify-center shadow-lg shadow-indigo-950/50 shrink-0">
              <i className="fa-solid fa-folder-tree text-white text-base"></i>
            </div>
            <span>3-Pane File Manager</span>
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Seamlessly browse, copy, move, and transfer files across your local computer, DEVHUB S3 storage, and personal Google Drive.
          </p>
        </div>

        {/* User and Mini Connections Bar */}
        <div className="flex items-center gap-3 flex-wrap">
          {/* Google Drive Status Pill */}
          <div className="flex items-center gap-2 bg-[#141b2d] border border-[#1f2a44] px-3 py-1.5 rounded-xl text-xs">
            <i className="fa-brands fa-google-drive text-emerald-400"></i>
            {integrations.google_drive?.connected ? (
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_8px_#10b981]"></span>
                <span className="text-slate-200 font-semibold truncate max-w-[150px]">
                  {integrations.google_drive.accountName || 'Connected'}
                </span>
              </div>
            ) : (
              <button
                type="button"
                onClick={handleConnectGoogleDrive}
                className="text-emerald-400 hover:text-emerald-300 font-bold hover:underline"
              >
                Connect Google Drive
              </button>
            )}
          </div>

          <Avatar user={currentUser} size="sm" shape="square" />
        </div>
      </div>

      {/* OAuth Notification / Status Banner */}
      {oauthStatus.message && (
        <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs flex items-center justify-between gap-2 shadow-sm animate-fade-in">
          <div className="flex items-center gap-2 font-medium">
            <i className="fa-solid fa-circle-check text-emerald-400 text-sm"></i>
            <span>{oauthStatus.message}</span>
          </div>
          <button
            type="button"
            onClick={() => setOauthStatus(prev => ({ ...prev, message: '' }))}
            className="text-slate-400 hover:text-white"
          >
            <i className="fa-solid fa-xmark"></i>
          </button>
        </div>
      )}

      {oauthStatus.error && (
        <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center justify-between gap-2 shadow-sm animate-fade-in">
          <div className="flex items-center gap-2 font-medium">
            <i className="fa-solid fa-circle-exclamation text-rose-400 text-sm"></i>
            <span>{oauthStatus.error}</span>
          </div>
          <button
            type="button"
            onClick={() => setOauthStatus(prev => ({ ...prev, error: '' }))}
            className="text-slate-400 hover:text-white"
          >
            <i className="fa-solid fa-xmark"></i>
          </button>
        </div>
      )}

      {/* Active Transfer Progress Toast */}
      {transferManager.isTransferring && (
        <div className="p-3 rounded-xl bg-indigo-600/20 border border-indigo-500/40 text-indigo-200 text-xs flex items-center gap-3 shadow-lg shadow-indigo-950/40 animate-pulse">
          <i className="fa-solid fa-circle-notch fa-spin text-indigo-400 text-sm"></i>
          <span className="font-semibold">{transferManager.transferMessage || 'Transfer in progress...'}</span>
        </div>
      )}

      {/* Customizable File Workspace (2 / 3 / 4 Equal-Height Panes) */}
      <FileWorkspace
        currentUser={currentUser}
        projects={projects}
        selectedProjectId={selectedProjectId}
        onSelectProject={setSelectedProjectId}
        integrations={integrations}
        onConnectIntegration={handleConnectGoogleDrive}
        transferManager={transferManager}
        onPreviewFile={handleOpenPreview}
      />

      {/* File Preview Modal */}
      <FilePreviewModal
        open={showPreviewModal}
        onClose={() => setShowPreviewModal(false)}
        file={previewFile}
        provider={previewProvider}
        onSaveContent={handleSavePreviewContent}
      />
    </div>
  );
}