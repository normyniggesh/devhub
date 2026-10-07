import React, { useMemo } from 'react';
import { formatSize } from '../../utils/formatting';

/**
 * Context-Aware Dynamic StorageUsage Component
 * Immediately adapts to the selected Files tab/source:
 * - All Files: Total size and breakdown of DEVHUB files represented in current view
 * - Google Drive: Real Google Drive usage/quota for connected user
 * - DEVHUB: Total DEVHUB/AWS S3 workspace storage usage and quota
 * - Dropbox / OneDrive: Live provider quota when connected
 * - Shared with Me: Size of shared files
 */
export default function StorageUsage({
  activeTab = 'All Files',
  viewFiles = [],
  allDevhubFiles = [],
  quotas = {},
  loading = false,
  onRefresh
}) {
  // 1. Calculate local DEVHUB metrics from files
  const viewMetrics = useMemo(() => {
    let total = 0, documents = 0, images = 0, videos = 0, others = 0;
    (viewFiles || []).forEach(f => {
      const s = Number(f.size) || 0;
      total += s;
      const t = (f.type || '').toLowerCase();
      if (t.includes('pdf') || t.includes('doc') || t.includes('txt') || t.includes('csv') || t.includes('xls') || t.includes('ppt')) {
        documents += s;
      } else if (t.includes('image') || t.includes('png') || t.includes('jpg') || t.includes('jpeg') || t.includes('svg') || t.includes('fig')) {
        images += s;
      } else if (t.includes('video') || t.includes('mp4') || t.includes('mov') || t.includes('avi')) {
        videos += s;
      } else {
        others += s;
      }
    });
    return { total, documents, images, videos, others, count: viewFiles.length };
  }, [viewFiles]);

  const allDevhubMetrics = useMemo(() => {
    let total = 0, documents = 0, images = 0, videos = 0, others = 0;
    (allDevhubFiles || []).forEach(f => {
      const s = Number(f.size) || 0;
      total += s;
      const t = (f.type || '').toLowerCase();
      if (t.includes('pdf') || t.includes('doc') || t.includes('txt') || t.includes('csv') || t.includes('xls') || t.includes('ppt')) {
        documents += s;
      } else if (t.includes('image') || t.includes('png') || t.includes('jpg') || t.includes('jpeg') || t.includes('svg') || t.includes('fig')) {
        images += s;
      } else if (t.includes('video') || t.includes('mp4') || t.includes('mov') || t.includes('avi')) {
        videos += s;
      } else {
        others += s;
      }
    });
    return { total, documents, images, videos, others, count: allDevhubFiles.length };
  }, [allDevhubFiles]);

  // 2. Resolve context-specific display data based on activeTab
  let providerTitle = 'DEVHUB Cloud Storage';
  let providerIcon = 'fa-solid fa-hard-drive';
  let iconColor = 'text-purple-400';
  let usedBytes = 0;
  let limitBytes = null;
  let remainingBytes = 0;
  let percentage = null;
  let statusBadge = null;
  let isAvailable = true;
  let unavailableMessage = null;
  let breakdown = null;

  const devhubQuota = quotas.devhub;
  const teamQuota = quotas.teamQuota;

  if (activeTab === 'Team Cloud Storage') {
    providerTitle = teamQuota?.name ? teamQuota.name : 'Team Cloud Storage';
    providerIcon = 'fa-solid fa-users';
    iconColor = 'text-amber-400';
    if (!teamQuota) {
      isAvailable = false;
      unavailableMessage = 'No team storage selected or available';
      statusBadge = 'No Team';
    } else {
      usedBytes = teamQuota.used !== undefined ? teamQuota.used : Number(teamQuota.usedBytes || 0);
      limitBytes = teamQuota.limit !== undefined ? teamQuota.limit : Number(teamQuota.allocatedBytes || 0);
      remainingBytes = teamQuota.remainingBytes !== undefined ? Number(teamQuota.remainingBytes) : Math.max(0, limitBytes - usedBytes);
      percentage = teamQuota.percentage !== undefined ? teamQuota.percentage : (limitBytes ? (usedBytes / limitBytes) * 100 : 0);
      statusBadge = percentage !== null ? `${percentage.toFixed(1)}% used` : 'Active';
      breakdown = teamQuota.breakdown;
    }
  } else if (activeTab === 'My Cloud Storage' || activeTab === 'DEVHUB') {
    providerTitle = 'My Cloud Storage';
    providerIcon = 'fa-solid fa-cloud';
    iconColor = 'text-indigo-400';
    usedBytes = devhubQuota?.used !== undefined ? devhubQuota.used : allDevhubMetrics.total;
    limitBytes = devhubQuota?.limit || null;
    remainingBytes = devhubQuota?.remainingBytes !== undefined ? Number(devhubQuota.remainingBytes) : Math.max(0, (limitBytes || 0) - usedBytes);
    percentage = devhubQuota?.percentage !== undefined ? devhubQuota.percentage : (limitBytes ? (usedBytes / limitBytes) * 100 : 0);
    statusBadge = `${devhubQuota?.fileCount ?? allDevhubMetrics.count} files`;
    breakdown = devhubQuota?.breakdown || allDevhubMetrics;
  } else if (activeTab === 'All Files' || activeTab === 'Project Files') {
    providerTitle = 'DEVHUB Cloud Storage';
    providerIcon = 'fa-solid fa-box-archive';
    iconColor = 'text-purple-400';
    usedBytes = devhubQuota?.used !== undefined ? devhubQuota.used : viewMetrics.total;
    limitBytes = devhubQuota?.limit || null;
    remainingBytes = devhubQuota?.remainingBytes !== undefined ? Number(devhubQuota.remainingBytes) : Math.max(0, (limitBytes || 0) - usedBytes);
    percentage = devhubQuota?.percentage !== undefined ? devhubQuota.percentage : (limitBytes ? (usedBytes / limitBytes) * 100 : 0);
    statusBadge = `${viewMetrics.count} files in view`;
    breakdown = devhubQuota?.breakdown || viewMetrics;
  } else if (activeTab === 'Shared with Me') {
    providerTitle = 'Shared with Me';
    providerIcon = 'fa-solid fa-share-nodes';
    iconColor = 'text-emerald-400';
    usedBytes = viewMetrics.total;
    limitBytes = devhubQuota?.limit || null;
    remainingBytes = Math.max(0, (limitBytes || 0) - usedBytes);
    percentage = limitBytes ? (usedBytes / limitBytes) * 100 : null;
    statusBadge = `${viewMetrics.count} shared files`;
    breakdown = viewMetrics;
  } else {
    // Default fallback
    providerTitle = 'DEVHUB Cloud Storage';
    providerIcon = 'fa-solid fa-hard-drive';
    iconColor = 'text-purple-400';
    usedBytes = devhubQuota?.used !== undefined ? devhubQuota.used : viewMetrics.total;
    limitBytes = devhubQuota?.limit || null;
    remainingBytes = Math.max(0, (limitBytes || 0) - usedBytes);
    percentage = devhubQuota?.percentage !== undefined ? devhubQuota.percentage : (limitBytes ? (usedBytes / limitBytes) * 100 : 0);
    statusBadge = `${viewMetrics.count} files`;
    breakdown = devhubQuota?.breakdown || viewMetrics;
  }

  // Format percentage display
  const displayPercentage = percentage !== null && !isNaN(percentage) 
    ? (percentage < 0.01 && percentage > 0 ? '<0.01%' : `${percentage.toFixed(1)}%`)
    : null;

  return (
    <div className="bg-[#0f1422] border border-[#192238] rounded-2xl p-5 shadow-sm transition-all">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2.5 min-w-0">
          <i className={`${providerIcon} ${iconColor} text-base shrink-0`}></i>
          <h2 className="text-sm font-bold text-white tracking-tight truncate">
            {providerTitle}
          </h2>
        </div>
        {statusBadge && (
          <span className="text-[10px] font-bold text-purple-400 bg-purple-500/10 border border-purple-500/20 px-2 py-0.5 rounded-full shrink-0">
            {statusBadge}
          </span>
        )}
      </div>

      {/* Main Metric Section */}
      {loading ? (
        <div className="py-6 flex justify-center items-center">
          <i className="fa-solid fa-circle-notch fa-spin text-purple-500 text-lg"></i>
        </div>
      ) : !isAvailable ? (
        <div className="py-4 text-center">
          <div className="inline-flex items-center justify-center w-9 h-9 rounded-xl bg-slate-800/60 text-slate-400 mb-2">
            <i className="fa-solid fa-cloud-slash text-sm"></i>
          </div>
          <p className="text-xs font-semibold text-slate-300 mb-1">
            {unavailableMessage || 'Storage unavailable'}
          </p>
          <p className="text-[11px] text-slate-500">
            Select a team or switch to My Cloud Storage to view usage.
          </p>
        </div>
      ) : (
        <div>
          {/* Used vs Allocated */}
          <div className="flex items-baseline justify-between gap-2 mb-1.5">
            <div className="text-lg font-black text-white tracking-tight">
              {formatSize(usedBytes)}{' '}
              <span className="text-xs font-medium text-slate-400">used</span>
            </div>
            {limitBytes ? (
              <span className="text-xs font-medium text-slate-300">
                Allocated: <strong className="text-white">{formatSize(limitBytes)}</strong>
              </span>
            ) : (
              <span className="text-xs font-medium text-slate-400">
                (Unlimited quota)
              </span>
            )}
          </div>

          {/* Progress Bar */}
          <div className="w-full bg-[#192238] rounded-full h-2 overflow-hidden mb-2">
            {percentage !== null ? (
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  percentage > 90
                    ? 'bg-rose-500'
                    : percentage > 75
                    ? 'bg-amber-500'
                    : 'bg-indigo-500'
                }`}
                style={{ width: `${Math.min(100, Math.max(2, percentage))}%` }}
              ></div>
            ) : (
              <div className="h-full bg-indigo-500/50 w-full"></div>
            )}
          </div>

          {/* Quota details (Percentage, Remaining, Allocated) */}
          <div className="flex justify-between items-center text-[11px] text-slate-400 mb-4">
            <span className="font-semibold text-indigo-400">
              {displayPercentage || '0.0%'} used
            </span>
            {limitBytes ? (
              <span>
                Remaining: <strong className="text-emerald-400 font-semibold">{formatSize(remainingBytes)}</strong>
              </span>
            ) : null}
          </div>

          {/* Detailed Breakdown for DEVHUB / All Files */}
          {breakdown && breakdown.total > 0 && (
            <div className="pt-3 border-t border-[#192238] flex flex-col gap-2">
              <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-0.5">
                File Types
              </div>
              <div className="flex items-center justify-between text-xs font-medium">
                <span className="flex items-center gap-2 text-slate-300">
                  <span className="w-2 h-2 rounded-full bg-blue-500"></span> Documents
                </span>
                <span className="text-white font-semibold">
                  {formatSize(breakdown.documents)}
                </span>
              </div>
              <div className="flex items-center justify-between text-xs font-medium">
                <span className="flex items-center gap-2 text-slate-300">
                  <span className="w-2 h-2 rounded-full bg-emerald-500"></span> Images
                </span>
                <span className="text-white font-semibold">
                  {formatSize(breakdown.images)}
                </span>
              </div>
              <div className="flex items-center justify-between text-xs font-medium">
                <span className="flex items-center gap-2 text-slate-300">
                  <span className="w-2 h-2 rounded-full bg-amber-500"></span> Videos
                </span>
                <span className="text-white font-semibold">
                  {formatSize(breakdown.videos)}
                </span>
              </div>
              <div className="flex items-center justify-between text-xs font-medium">
                <span className="flex items-center gap-2 text-slate-300">
                  <span className="w-2 h-2 rounded-full bg-purple-500"></span> Others
                </span>
                <span className="text-white font-semibold">
                  {formatSize(breakdown.others)}
                </span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Footer / Refresh Button */}
      {onRefresh && (
        <div className="mt-4 pt-3 border-t border-[#192238] flex items-center justify-between">
          <span className="text-[11px] text-slate-500">Live Quota</span>
          <button
            type="button"
            onClick={onRefresh}
            title="Refresh storage quota"
            className="text-[11px] font-semibold text-purple-400 hover:text-purple-300 flex items-center gap-1 transition"
          >
            <i className="fa-solid fa-arrows-rotate text-[10px]"></i>
            <span>Refresh</span>
          </button>
        </div>
      )}
    </div>
  );
}
