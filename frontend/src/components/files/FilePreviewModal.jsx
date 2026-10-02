import React, { useState, useEffect } from 'react';
import Modal from '../common/Modal';
import { formatSize } from '../../utils/formatting';
import { apiClient } from '../../api/client';

export default function FilePreviewModal({
  open,
  onClose,
  file,
  provider = 'local',
  onSaveContent
}) {
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [error, setError] = useState(null);
  const [previewUrl, setPreviewUrl] = useState('');

  const name = file?.name || '';
  const type = (file?.mimeType || file?.type || '').toLowerCase();

  const isGoogleDoc = file?.mimeType === 'application/vnd.google-apps.document';
  const isGoogleSheet = file?.mimeType === 'application/vnd.google-apps.spreadsheet';
  const isGoogleSlide = file?.mimeType === 'application/vnd.google-apps.presentation';
  const isGoogleApp = isGoogleDoc || isGoogleSheet || isGoogleSlide;

  const isImage = type.startsWith('image/') || /\.(png|jpg|jpeg|gif|webp|svg)$/i.test(name);
  const isPdf = type === 'application/pdf' || name.toLowerCase().endsWith('.pdf');
  const isTextOrCode = type.startsWith('text/') || /\.(txt|md|js|jsx|ts|tsx|json|html|css|py|sql|sh|yml|yaml|xml|log|env)$/i.test(name);

  useEffect(() => {
    if (!open || !file) {
      setContent('');
      setPreviewUrl('');
      setError(null);
      setSaveSuccess(false);
      return;
    }

    const loadPreview = async () => {
      try {
        setLoading(true);
        setError(null);
        setSaveSuccess(false);

        // 1. Google Workspace Docs
        if (isGoogleApp) {
          setLoading(false);
          return;
        }

        // 2. Local PC File
        if (provider === 'local') {
          if (file.handle) {
            const rawFile = await file.handle.getFile();
            if (isImage || isPdf) {
              const url = URL.createObjectURL(rawFile);
              setPreviewUrl(url);
            } else if (isTextOrCode) {
              const text = await rawFile.text();
              setContent(text);
            }
          }
          setLoading(false);
          return;
        }

        // 3. DEVHUB File
        if (provider === 'devhub') {
          if (isImage || isPdf) {
            const res = await apiClient(`/files/${file.id}/download`);
            if (res.url) setPreviewUrl(res.url);
          } else if (isTextOrCode) {
            // Fetch content text directly
            const res = await fetch(`/api/files/${file.id}/content`, { credentials: 'include' });
            if (res.ok) {
              const text = await res.text();
              setContent(text);
            } else {
              // Fallback to download URL
              const dl = await apiClient(`/files/${file.id}/download`);
              if (dl.url) {
                const textRes = await fetch(dl.url);
                setContent(await textRes.text());
              }
            }
          }
          setLoading(false);
          return;
        }

        // 4. Google Drive File
        if (provider === 'gdrive' || provider === 'google_drive') {
          const downloadEndpoint = `/api/integrations/google_drive/download/${file.id}`;
          if (isImage || isPdf) {
            setPreviewUrl(downloadEndpoint);
          } else if (isTextOrCode) {
            const res = await fetch(downloadEndpoint, { credentials: 'include' });
            if (res.ok) {
              const text = await res.text();
              setContent(text);
            } else {
              throw new Error('Failed to load file content from Google Drive');
            }
          }
          setLoading(false);
        }
      } catch (err) {
        console.error('Error loading preview:', err);
        setError(err.message || 'Unable to preview file content');
      } finally {
        setLoading(false);
      }
    };

    loadPreview();

    return () => {
      if (previewUrl && previewUrl.startsWith('blob:')) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [open, file, provider]);

  if (!open || !file) return null;

  const handleSaveText = async () => {
    if (!onSaveContent) return;
    try {
      setSaving(true);
      setError(null);
      await onSaveContent(file, content);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err) {
      setError(err.message || 'Failed to save changes');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} className="max-w-4xl w-full p-6 bg-[#0f1422] border border-[#1e2538] rounded-2xl shadow-2xl text-slate-100 flex flex-col max-h-[90vh]">
      {/* Header */}
      <div className="flex items-center justify-between pb-3.5 border-b border-[#1e2538] mb-4 shrink-0">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center shrink-0">
            <i className={`fa-solid ${isImage ? 'fa-file-image text-purple-400' : isPdf ? 'fa-file-pdf text-rose-400' : isTextOrCode ? 'fa-file-code text-sky-400' : isGoogleApp ? 'fa-file-lines text-blue-400' : 'fa-file text-slate-400'} text-sm`}></i>
          </div>
          <div className="min-w-0">
            <h3 className="text-base font-bold text-white truncate max-w-lg leading-tight">{name}</h3>
            <p className="text-[11px] text-slate-400 flex items-center gap-2">
              <span>{file.size > 0 ? formatSize(file.size) : 'File'}</span>
              <span>•</span>
              <span className="capitalize">{provider === 'gdrive' ? 'Google Drive' : provider === 'local' ? 'This PC' : 'DEVHUB S3'}</span>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {isTextOrCode && onSaveContent && provider === 'local' && (
            <button
              type="button"
              disabled={saving || loading}
              onClick={handleSaveText}
              className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-md shadow-emerald-950/40"
            >
              {saving ? <i className="fa-solid fa-circle-notch fa-spin"></i> : <i className="fa-solid fa-floppy-disk"></i>}
              <span>{saveSuccess ? 'Saved!' : 'Save Changes'}</span>
            </button>
          )}

          <button
            type="button"
            onClick={onClose}
            className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-white hover:bg-[#1a2336] transition"
          >
            <i className="fa-solid fa-xmark text-sm"></i>
          </button>
        </div>
      </div>

      {/* Main Preview Area */}
      <div className="flex-1 min-h-[350px] overflow-y-auto flex flex-col justify-center">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-16 text-slate-400 gap-3">
            <i className="fa-solid fa-circle-notch fa-spin text-2xl text-indigo-400"></i>
            <span className="text-xs font-medium">Loading file preview...</span>
          </div>
        ) : error ? (
          <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
            <i className="fa-solid fa-circle-exclamation text-rose-400 shrink-0"></i>
            <span>{error}</span>
          </div>
        ) : isGoogleApp ? (
          /* Google Workspace Doc Card */
          <div className="flex flex-col items-center justify-center py-12 px-6 text-center bg-[#090c14] border border-[#1e2538] rounded-xl gap-4">
            <div className="w-16 h-16 rounded-2xl bg-blue-500/10 border border-blue-500/25 flex items-center justify-center text-3xl text-blue-400">
              <i className={`fa-solid ${isGoogleDoc ? 'fa-file-lines' : isGoogleSheet ? 'fa-file-excel text-emerald-400' : 'fa-file-powerpoint text-amber-400'}`}></i>
            </div>
            <div>
              <h4 className="text-base font-bold text-white mb-1">{name}</h4>
              <p className="text-xs text-slate-400 max-w-md">
                This is a native Google {isGoogleDoc ? 'Document' : isGoogleSheet ? 'Spreadsheet' : 'Presentation'}. Edit and collaborate in real-time in Google Drive.
              </p>
            </div>
            {file.webViewLink ? (
              <a
                href={file.webViewLink}
                target="_blank"
                rel="noopener noreferrer"
                className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-bold transition flex items-center gap-2 shadow-lg shadow-blue-900/40"
              >
                <i className="fa-solid fa-arrow-up-right-from-square"></i>
                <span>Open in Google {isGoogleDoc ? 'Docs' : isGoogleSheet ? 'Sheets' : 'Slides'}</span>
              </a>
            ) : (
              <span className="text-xs text-slate-500">Link not available</span>
            )}
          </div>
        ) : isImage && previewUrl ? (
          /* Image Preview */
          <div className="flex items-center justify-center p-4 bg-[#090c14] border border-[#1e2538] rounded-xl overflow-hidden max-h-[60vh]">
            <img src={previewUrl} alt={name} className="max-w-full max-h-[55vh] object-contain rounded-lg shadow-md" />
          </div>
        ) : isPdf && previewUrl ? (
          /* PDF Preview */
          <div className="w-full h-[550px] bg-[#090c14] border border-[#1e2538] rounded-xl overflow-hidden">
            <iframe src={previewUrl} title={name} className="w-full h-full border-none" />
          </div>
        ) : isTextOrCode ? (
          /* Text / Source Code Viewer & Editor */
          <div className="flex flex-col flex-1 h-[500px] bg-[#090c14] border border-[#1e2538] rounded-xl overflow-hidden font-mono text-xs">
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              readOnly={provider !== 'local'}
              className="w-full h-full p-4 bg-transparent text-slate-200 placeholder-slate-600 focus:outline-none resize-none leading-relaxed overflow-y-auto selection:bg-indigo-600/50"
              spellCheck={false}
            />
          </div>
        ) : (
          /* Binary / Unsupported Preview */
          <div className="flex flex-col items-center justify-center py-12 px-6 text-center bg-[#090c14] border border-[#1e2538] rounded-xl gap-3">
            <div className="w-14 h-14 rounded-2xl bg-slate-800/50 border border-slate-700/50 flex items-center justify-center text-2xl text-slate-400">
              <i className="fa-solid fa-file-zipper"></i>
            </div>
            <div>
              <h4 className="text-sm font-bold text-white mb-1">{name}</h4>
              <p className="text-xs text-slate-400">Preview is not supported for this file format.</p>
            </div>
          </div>
        )}
      </div>

      {/* Footer Info */}
      <div className="flex items-center justify-between pt-3 border-t border-[#1e2538] mt-4 text-[11px] text-slate-500 shrink-0">
        <span>Type: {type || 'application/octet-stream'}</span>
        <button
          type="button"
          onClick={onClose}
          className="px-4 py-1.5 bg-[#161d2f] hover:bg-[#1f2a44] text-slate-300 rounded-xl font-semibold transition border border-[#1e2538]"
        >
          Close
        </button>
      </div>
    </Modal>
  );
}
