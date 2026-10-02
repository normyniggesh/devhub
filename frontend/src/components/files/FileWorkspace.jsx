import React, { useState, useEffect } from 'react';
import FileWorkspacePane from './FileWorkspacePane';

const STORAGE_KEY = 'devhub_file_panes_config';

const DEFAULT_3_PANES = [
  { id: 'pane-1', provider: 'local', title: 'This PC' },
  { id: 'pane-2', provider: 'devhub', title: 'DEVHUB S3' },
  { id: 'pane-3', provider: 'gdrive', title: 'Google Drive' }
];

const PRESETS = [
  {
    name: 'PC + DEVHUB',
    panes: [
      { id: 'p1', provider: 'local', title: 'This PC' },
      { id: 'p2', provider: 'devhub', title: 'DEVHUB S3' }
    ]
  },
  {
    name: 'PC + Google Drive',
    panes: [
      { id: 'p1', provider: 'local', title: 'This PC' },
      { id: 'p2', provider: 'gdrive', title: 'Google Drive' }
    ]
  },
  {
    name: 'DEVHUB + Google Drive',
    panes: [
      { id: 'p1', provider: 'devhub', title: 'DEVHUB S3' },
      { id: 'p2', provider: 'gdrive', title: 'Google Drive' }
    ]
  },
  {
    name: 'All 3 Panes',
    panes: DEFAULT_3_PANES
  }
];

export default function FileWorkspace({
  currentUser,
  projects = [],
  selectedProjectId = '',
  onSelectProject,
  integrations = {},
  onConnectIntegration,
  transferManager,
  onPreviewFile
}) {
  // Load saved pane configuration or default to 3 panes
  const [panes, setPanes] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length >= 2 && parsed.length <= 4) {
          return parsed;
        }
      }
    } catch (_) {}
    return DEFAULT_3_PANES;
  });

  // Save changes to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(panes));
    } catch (_) {}
  }, [panes]);

  // Set pane count directly (2, 3, or 4)
  const handleSetPaneCount = (count) => {
    if (count === panes.length) return;

    if (count < panes.length) {
      setPanes(prev => prev.slice(0, count));
    } else {
      // Add missing panes
      setPanes(prev => {
        const next = [...prev];
        const possibleProviders = ['local', 'devhub', 'gdrive'];
        while (next.length < count) {
          const used = next.map(p => p.provider);
          const nextProvider = possibleProviders.find(p => !used.includes(p)) || 'devhub';
          next.push({
            id: `pane-${Date.now()}-${next.length}`,
            provider: nextProvider,
            title: nextProvider === 'local' ? 'This PC' : nextProvider === 'devhub' ? 'DEVHUB S3' : 'Google Drive'
          });
        }
        return next;
      });
    }
  };

  // Change provider for a specific pane
  const handleChangePaneProvider = (paneIndex, newProvider) => {
    setPanes(prev => {
      const next = [...prev];
      next[paneIndex] = {
        ...next[paneIndex],
        provider: newProvider,
        title: newProvider === 'local' ? 'This PC' : newProvider === 'devhub' ? 'DEVHUB S3' : 'Google Drive'
      };
      return next;
    });
  };

  // Close / remove a pane (minimum 2 panes)
  const handleClosePane = (paneIndex) => {
    if (panes.length <= 2) return;
    setPanes(prev => prev.filter((_, idx) => idx !== paneIndex));
  };

  // Add 4th pane if less than 4
  const handleAddPane = () => {
    if (panes.length >= 4) return;
    handleSetPaneCount(panes.length + 1);
  };

  // Apply a preset
  const handleApplyPreset = (presetPanes) => {
    setPanes(presetPanes.map((p, i) => ({
      ...p,
      id: `pane-${Date.now()}-${i}`
    })));
  };

  // Grid columns class based on pane count
  const getGridColsClass = () => {
    if (panes.length === 2) return 'grid-cols-1 md:grid-cols-2';
    if (panes.length === 3) return 'grid-cols-1 lg:grid-cols-3';
    return 'grid-cols-1 md:grid-cols-2 xl:grid-cols-4';
  };

  return (
    <div className="flex flex-col gap-4 w-full">
      {/* Top Workspace Toolbar: Layout Switcher & Presets */}
      <div className="bg-[#0f1422] border border-[#192238] rounded-2xl px-4 py-2.5 shadow-sm flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3 flex-wrap">
          {/* Pane count buttons: 2 / 3 / 4 */}
          <div className="flex items-center gap-1 bg-[#141b2d] border border-[#1f2a44] p-1 rounded-xl">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider px-2">Layout:</span>
            {[2, 3, 4].map(num => (
              <button
                key={num}
                type="button"
                onClick={() => handleSetPaneCount(num)}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
                  panes.length === num
                    ? 'bg-purple-600 text-white shadow-md shadow-purple-900/40'
                    : 'text-slate-400 hover:text-white hover:bg-[#1f2a44]'
                }`}
              >
                <span>{num} Panes</span>
              </button>
            ))}
          </div>

          {/* Quick Presets */}
          <div className="hidden sm:flex items-center gap-1.5">
            <span className="text-[10px] text-slate-500 font-semibold">Presets:</span>
            {PRESETS.map((preset, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => handleApplyPreset(preset.panes)}
                className="px-2 py-0.5 rounded-lg text-[10px] font-semibold text-slate-400 hover:text-white hover:bg-[#161d2f] border border-[#1c2438] transition"
              >
                {preset.name}
              </button>
            ))}
          </div>
        </div>

        {/* Right side: Clipboard counter & Add Pane */}
        <div className="flex items-center gap-2">
          {transferManager?.clipboard && transferManager.clipboard.items?.length > 0 && (
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-purple-950/40 border border-purple-500/40 text-purple-300 text-[11px] font-semibold animate-pulse">
              <i className="fa-solid fa-clipboard-check text-purple-400"></i>
              <span>{transferManager.clipboard.items.length} in clipboard ({transferManager.clipboard.operation})</span>
              <button
                type="button"
                onClick={() => transferManager.clearClipboard && transferManager.clearClipboard()}
                className="text-slate-400 hover:text-white ml-1 text-xs"
                title="Clear clipboard"
              >
                <i className="fa-solid fa-xmark"></i>
              </button>
            </div>
          )}

          {panes.length < 4 && (
            <button
              type="button"
              onClick={handleAddPane}
              className="px-2.5 py-1 bg-[#141b2d] hover:bg-[#1f2a44] text-slate-300 hover:text-white rounded-xl text-xs font-bold transition flex items-center gap-1 border border-[#1f2a44] active:scale-95"
            >
              <i className="fa-solid fa-plus text-[10px]"></i>
              <span>Add Pane</span>
            </button>
          )}
        </div>
      </div>

      {/* Customizable Panes Grid (Equal Height / Aligned) */}
      <div className={`grid gap-4 items-stretch ${getGridColsClass()}`}>
        {panes.map((pane, idx) => (
          <FileWorkspacePane
            key={pane.id}
            paneId={pane.id}
            provider={pane.provider}
            onChangeProvider={(newProv) => handleChangePaneProvider(idx, newProv)}
            onClosePane={() => handleClosePane(idx)}
            canClose={panes.length > 2}
            currentUser={currentUser}
            projects={projects}
            selectedProjectId={selectedProjectId}
            onSelectProject={onSelectProject}
            integration={integrations[pane.provider] || (pane.provider === 'gdrive' ? integrations.google_drive : null)}
            onConnectIntegration={onConnectIntegration}
            transferManager={transferManager}
            onPreviewFile={onPreviewFile}
          />
        ))}
      </div>
    </div>
  );
}
