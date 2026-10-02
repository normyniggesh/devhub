import React from 'react';

/**
 * Reusable Compact Page Header with Tab Style navigation and integrated action controls.
 * Clean, compact, professional SaaS layout.
 *
 * @param {string} title - Primary page title
 * @param {string} subtitle - Short description
 * @param {Array} tabs - Array of tab objects: [{ id, label, icon, count, badge }]
 * @param {string} activeTab - Currently active tab ID
 * @param {Function} onTabChange - Tab change handler
 * @param {React.ReactNode} actions - Action buttons and controls
 * @param {React.ReactNode} children - Additional optional content inside header
 */
export default function CompactPageHeader({
  title,
  subtitle,
  tabs = [],
  activeTab,
  onTabChange,
  actions,
  children
}) {
  return (
    <div className="bg-[#0f1422] border border-[#192238] rounded-2xl p-4 md:p-5 shadow-sm transition-colors">
      {/* Top Row: Title, Subtitle, and Right Actions */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h1 className="text-xl md:text-2xl font-extrabold text-white tracking-tight truncate">
              {title}
            </h1>
            {activeTab && (
              <span className="text-[11px] font-semibold text-purple-400 bg-purple-500/10 border border-purple-500/20 px-2.5 py-0.5 rounded-full shrink-0">
                {activeTab}
              </span>
            )}
          </div>
          {subtitle && (
            <p className="text-xs md:text-sm text-slate-400 truncate">
              {subtitle}
            </p>
          )}
        </div>

        {/* Action Controls */}
        {actions && (
          <div className="flex items-center flex-wrap gap-2.5 shrink-0">
            {actions}
          </div>
        )}
      </div>

      {/* Tabs Row (Tab Style Hero Navigation) */}
      {tabs && tabs.length > 0 && (
        <div className="mt-4 pt-3.5 border-t border-[#192238] flex items-center justify-between gap-3 overflow-x-auto hide-scrollbar">
          <div className="flex items-center gap-1.5 shrink-0">
            {tabs.map((tab) => {
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => onTabChange && onTabChange(tab.id)}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all shrink-0 ${
                    isActive
                      ? 'bg-purple-600 text-white shadow-md shadow-purple-900/30'
                      : 'text-slate-400 hover:text-white hover:bg-[#161d2f]'
                  }`}
                >
                  {tab.icon && <i className={`${tab.icon} text-xs`}></i>}
                  <span>{tab.label}</span>
                  {tab.count !== undefined && (
                    <span
                      className={`text-[10px] px-1.5 py-0.2 rounded-md font-bold ${
                        isActive
                          ? 'bg-white/20 text-white'
                          : 'bg-[#192238] text-slate-400'
                      }`}
                    >
                      {tab.count}
                    </span>
                  )}
                  {tab.badge && (
                    <span className="text-[9px] uppercase tracking-wider font-bold bg-amber-500/20 text-amber-300 px-1.5 py-0.2 rounded">
                      {tab.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {children && (
        <div className="mt-3.5 pt-3 border-t border-[#192238]">
          {children}
        </div>
      )}
    </div>
  );
}
