import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiClient } from '../../api/client';
import { formatSize } from '../../utils/formatting';

export default function GlobalSearch() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);

  const inputRef = useRef(null);
  const dropdownRef = useRef(null);
  const navigate = useNavigate();

  const isMac = typeof window !== 'undefined' && /Mac|iPod|iPhone|iPad/.test(navigator.platform);

  // 1. Global Keyboard Shortcut: Ctrl+K / Cmd+K
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
        setIsOpen(true);
      } else if (e.key === 'Escape') {
        setIsOpen(false);
        inputRef.current?.blur();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // 2. Click outside handler
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (
        dropdownRef.current && !dropdownRef.current.contains(e.target) &&
        inputRef.current && !inputRef.current.contains(e.target)
      ) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // 3. Debounced Search API call
  useEffect(() => {
    if (!query.trim() || query.trim().length < 2) {
      setResults(null);
      setLoading(false);
      return;
    }

    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await apiClient(`/search?q=${encodeURIComponent(query.trim())}`);
        if (res.success && res.results) {
          setResults(res.results);
          setIsOpen(true);
          setSelectedIndex(-1);
        }
      } catch (err) {
        console.error('Search query failed:', err);
      } finally {
        setLoading(false);
      }
    }, 200);

    return () => clearTimeout(timer);
  }, [query]);

  // Flatten results for keyboard navigation
  const flattenedItems = React.useMemo(() => {
    if (!results) return [];
    const items = [];

    (results.projects || []).forEach(p => items.push({
      category: 'Projects',
      id: `proj-${p.id}`,
      title: p.name,
      subtitle: p.description || p.category || 'Project',
      badge: p.status,
      icon: 'fa-regular fa-folder',
      iconColor: 'text-purple-400',
      iconBg: 'bg-purple-500/10 border-purple-500/20',
      action: () => navigate(`/projects/${p.id}`)
    }));

    (results.tasks || []).forEach(t => items.push({
      category: 'Tasks',
      id: `task-${t.id}`,
      title: t.title,
      subtitle: t.project?.name || 'Task',
      badge: t.priority || t.status,
      badgeColor: t.priority === 'Urgent' || t.priority === 'High' ? 'text-rose-400 bg-rose-500/10' : 'text-blue-400 bg-blue-500/10',
      icon: 'fa-regular fa-square-check',
      iconColor: 'text-blue-400',
      iconBg: 'bg-blue-500/10 border-blue-500/20',
      action: () => navigate(`/tasks?projectId=${t.projectId}`)
    }));

    (results.files || []).forEach(f => items.push({
      category: 'Files',
      id: `file-${f.id}`,
      title: f.name,
      subtitle: `${f.project?.name || 'File'} • ${f.size ? formatSize(f.size) : ''}`,
      icon: 'fa-regular fa-file',
      iconColor: 'text-amber-400',
      iconBg: 'bg-amber-500/10 border-amber-500/20',
      action: () => navigate(`/files${f.projectId ? `?projectId=${f.projectId}` : ''}`)
    }));

    (results.folders || []).forEach(f => items.push({
      category: 'Folders',
      id: `folder-${f.id}`,
      title: f.name,
      subtitle: f.project?.name || 'Folder',
      icon: 'fa-solid fa-folder',
      iconColor: 'text-amber-400',
      iconBg: 'bg-amber-500/10 border-amber-500/20',
      action: () => navigate(`/files${f.projectId ? `?projectId=${f.projectId}&folderId=${f.id}` : `?folderId=${f.id}`}`)
    }));

    (results.users || []).forEach(u => items.push({
      category: 'Team',
      id: `user-${u.id}`,
      title: u.name,
      subtitle: u.email,
      badge: u.role,
      icon: 'fa-solid fa-user',
      iconColor: 'text-emerald-400',
      iconBg: 'bg-emerald-500/10 border-emerald-500/20',
      action: () => navigate('/team')
    }));

    (results.testCases || []).forEach(tc => items.push({
      category: 'QA Tests',
      id: `tc-${tc.id}`,
      title: tc.title,
      subtitle: `${tc.project?.name || ''} ${tc.module ? `• ${tc.module}` : ''}`,
      badge: tc.status,
      icon: 'fa-solid fa-vial',
      iconColor: 'text-pink-400',
      iconBg: 'bg-pink-500/10 border-pink-500/20',
      action: () => navigate('/qa')
    }));

    (results.repositories || []).forEach(r => items.push({
      category: 'GitHub',
      id: `repo-${r.id}`,
      title: r.owner ? `${r.owner}/${r.name}` : r.name,
      subtitle: r.description || 'Repository',
      icon: 'fa-brands fa-github',
      iconColor: 'text-slate-300',
      iconBg: 'bg-slate-700/20 border-slate-600/30',
      action: () => navigate('/github')
    }));

    (results.calendarEvents || []).forEach(e => items.push({
      category: 'Calendar',
      id: `event-${e.id}`,
      title: e.title,
      subtitle: new Date(e.startDateTime).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }),
      badge: e.type,
      icon: 'fa-regular fa-calendar',
      iconColor: 'text-indigo-400',
      iconBg: 'bg-indigo-500/10 border-indigo-500/20',
      action: () => navigate('/calendar')
    }));

    return items;
  }, [results, navigate]);

  // 4. Keyboard navigation (ArrowDown, ArrowUp, Enter)
  const handleInputKeyDown = (e) => {
    if (!isOpen || flattenedItems.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(prev => (prev + 1 < flattenedItems.length ? prev + 1 : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(prev => (prev - 1 >= 0 ? prev - 1 : flattenedItems.length - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (selectedIndex >= 0 && selectedIndex < flattenedItems.length) {
        handleSelectItem(flattenedItems[selectedIndex]);
      } else if (flattenedItems.length > 0) {
        handleSelectItem(flattenedItems[0]);
      }
    }
  };

  const handleSelectItem = (item) => {
    if (item && item.action) {
      item.action();
      setIsOpen(false);
      setQuery('');
      setResults(null);
    }
  };

  const handleClear = () => {
    setQuery('');
    setResults(null);
    setIsOpen(false);
    inputRef.current?.focus();
  };

  const totalResultsCount = flattenedItems.length;

  return (
    <div className="relative w-full max-w-xl lg:max-w-2xl xl:max-w-3xl mx-auto global-search-container">
      {/* Search Input Bar */}
      <div className="relative flex items-center w-full">
        {/* Search Icon */}
        <span className="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400 transition-colors global-search-icon">
          {loading ? (
            <i className="fa-solid fa-circle-notch fa-spin text-indigo-400 text-sm"></i>
          ) : (
            <i className="fa-solid fa-magnifying-glass text-slate-400 text-sm"></i>
          )}
        </span>

        {/* Input Field */}
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            if (!isOpen) setIsOpen(true);
          }}
          onFocus={() => {
            if (query.trim().length >= 2) setIsOpen(true);
          }}
          onKeyDown={handleInputKeyDown}
          placeholder="Search DEVHUB (Projects, Tasks, Files, QA, Team)..."
          className="w-full bg-[#131722]/90 hover:bg-[#161c2b] focus:bg-[#151b29] border border-[#232a3f] focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 rounded-xl pl-10 pr-24 py-2 md:py-2.5 text-xs md:text-sm text-white placeholder-slate-400 font-medium focus:outline-none transition shadow-inner backdrop-blur-md global-search-input"
        />

        {/* Right side: Clear button & Keyboard shortcut indicator */}
        <div className="absolute right-2.5 top-1/2 -translate-y-1/2 flex items-center gap-1.5">
          {query && (
            <button
              type="button"
              onClick={handleClear}
              className="w-5 h-5 rounded-md hover:bg-slate-700/40 text-slate-400 hover:text-white flex items-center justify-center transition global-search-clear"
              title="Clear search"
            >
              <i className="fa-solid fa-xmark text-xs"></i>
            </button>
          )}

          <div className="hidden sm:flex items-center gap-0.5 px-1.5 py-0.5 rounded-md bg-[#1d2334] border border-[#2c364e] text-[10px] font-semibold text-slate-400 shadow-sm pointer-events-none select-none global-search-badge">
            <span>{isMac ? '⌘' : 'Ctrl'}</span>
            <span>K</span>
          </div>
        </div>
      </div>

      {/* Search Results Dropdown Panel */}
      {isOpen && query.trim().length >= 2 && (
        <div
          ref={dropdownRef}
          className="absolute left-0 right-0 top-full mt-2 bg-[#121624] border border-[#242d45] rounded-2xl shadow-2xl overflow-hidden z-50 max-h-[70vh] flex flex-col backdrop-blur-xl animate-scale-in global-search-dropdown"
        >
          {/* Header Summary */}
          <div className="px-4 py-2 border-b border-[#1f273d] bg-[#0e121e] flex items-center justify-between text-xs text-slate-400 global-search-header">
            <span className="font-semibold">
              {loading ? 'Searching DEVHUB...' : `${totalResultsCount} result${totalResultsCount === 1 ? '' : 's'} found`}
            </span>
            <span className="text-[10px] text-slate-500">
              Use <kbd className="px-1 py-0.5 rounded bg-[#1b2234] border border-[#26314a]">↑</kbd> <kbd className="px-1 py-0.5 rounded bg-[#1b2234] border border-[#26314a]">↓</kbd> to navigate, <kbd className="px-1 py-0.5 rounded bg-[#1b2234] border border-[#26314a]">↵</kbd> to open
            </span>
          </div>

          {/* Results List */}
          <div className="overflow-y-auto divide-y divide-[#182033] p-1.5 custom-scrollbar">
            {totalResultsCount === 0 && !loading ? (
              <div className="py-8 px-4 text-center">
                <i className="fa-solid fa-magnifying-glass text-2xl text-slate-600 mb-2"></i>
                <p className="text-sm font-semibold text-white">No results found for "{query}"</p>
                <p className="text-xs text-slate-500 mt-1">Try searching for project names, task titles, file names, or team members.</p>
              </div>
            ) : (
              (() => {
                // Group items by category for clear presentation
                const categories = ['Projects', 'Tasks', 'Files', 'Folders', 'Team', 'QA Tests', 'GitHub', 'Calendar'];
                let globalIdx = 0;

                return categories.map(cat => {
                  const catItems = flattenedItems.filter(item => item.category === cat);
                  if (catItems.length === 0) return null;

                  return (
                    <div key={cat} className="py-1">
                      <div className="px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400 global-search-cat-title">
                        {cat} ({catItems.length})
                      </div>
                      <div className="flex flex-col gap-0.5">
                        {catItems.map(item => {
                          const thisIndex = globalIdx++;
                          const isSelected = selectedIndex === thisIndex;

                          return (
                            <button
                              key={item.id}
                              type="button"
                              onClick={() => handleSelectItem(item)}
                              onMouseEnter={() => setSelectedIndex(thisIndex)}
                              className={`w-full flex items-center justify-between gap-3 px-3 py-2 rounded-xl text-left transition global-search-item ${
                                isSelected
                                  ? 'bg-purple-600/20 border border-purple-500/40 text-white global-search-item-selected'
                                  : 'hover:bg-[#182035] text-slate-200 border border-transparent'
                              }`}
                            >
                              <div className="flex items-center gap-3 min-w-0 flex-1">
                                <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 border ${item.iconBg}`}>
                                  <i className={`${item.icon} ${item.iconColor} text-xs`}></i>
                                </div>
                                <div className="min-w-0 flex-1">
                                  <div className="text-xs font-semibold text-white truncate global-search-item-title">
                                    {item.title}
                                  </div>
                                  {item.subtitle && (
                                    <div className="text-[10px] text-slate-400 truncate mt-0.5 global-search-item-sub">
                                      {item.subtitle}
                                    </div>
                                  )}
                                </div>
                              </div>

                              {item.badge && (
                                <span className={`px-2 py-0.5 rounded text-[10px] font-semibold shrink-0 ${
                                  item.badgeColor || 'bg-[#1b2236] text-slate-300 border border-[#26314a]'
                                }`}>
                                  {item.badge}
                                </span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                });
              })()
            )}
          </div>
        </div>
      )}
    </div>
  );
}
