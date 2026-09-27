import { useState, useEffect, useMemo, useRef } from 'react';
import { Link } from 'react-router-dom';
import { apiClient } from '../api/client';
import { useStore } from '../store';

export default function Files() {
  const { currentUser } = useStore();
  const [projects, setProjects] = useState([]);
  const [folders, setFolders] = useState([]);
  const [files, setFiles] = useState([]);
  const [recentActivity, setRecentActivity] = useState([]);
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [activeTab, setActiveTab] = useState('All Files');
  const [viewMode, setViewMode] = useState('list'); // 'list' | 'grid'
  
  const [searchQuery, setSearchQuery] = useState('');
  const [sortConfig, setSortConfig] = useState({ key: 'updatedAt', direction: 'desc' });

  // Navigation state
  const [currentFolderId, setCurrentFolderId] = useState(null);
  const [folderHistory, setFolderHistory] = useState([]); // [{id, name, projectId}]

  // Modals
  const [showFolderModal, setShowFolderModal] = useState(false);
  const [editingFolder, setEditingFolder] = useState(null);
  const [folderForm, setFolderForm] = useState({ name: '', projectId: '' });
  const [folderSubmitting, setFolderSubmitting] = useState(false);

  const [showFileModal, setShowFileModal] = useState(false);
  const [editingFile, setEditingFile] = useState(null);
  const [fileForm, setFileForm] = useState({ name: '', type: 'Document', size: 1024, storagePath: '', projectId: '' });
  const [fileSubmitting, setFileSubmitting] = useState(false);

  const [openMenuId, setOpenMenuId] = useState(null); // format: 'file_ID' or 'folder_ID'
  const menuRef = useRef(null);

  useEffect(() => {
    const handleClick = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setOpenMenuId(null);
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const [projRes, foldRes, fileRes, dashRes] = await Promise.all([
        apiClient('/projects'),
        apiClient('/folders'),
        apiClient('/files'),
        apiClient('/dashboard').catch(() => ({ dashboard: { recentActivity: [] } }))
      ]);

      setProjects(projRes.projects || []);
      setFolders(foldRes.folders || []);
      setFiles(fileRes.files || []);
      
      const allAct = dashRes.dashboard?.recentActivity || [];
      setRecentActivity(allAct.filter(a => a.entityType === 'File' || a.entityType === 'Folder'));
    } catch (err) {
      setError(err.message || 'Unable to load files');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleOpenFolder = (folder) => {
    setFolderHistory([...folderHistory, { id: folder.id, name: folder.name, projectId: folder.projectId }]);
    setCurrentFolderId(folder.id);
    setActiveTab('All Files');
    setSearchQuery('');
  };

  const handleGoBack = () => {
    if (folderHistory.length > 0) {
      const newHistory = [...folderHistory];
      newHistory.pop();
      setFolderHistory(newHistory);
      setCurrentFolderId(newHistory.length > 0 ? newHistory[newHistory.length - 1].id : null);
    }
  };

  const handleGoRoot = () => {
    setFolderHistory([]);
    setCurrentFolderId(null);
  };

  // RBAC Helpers (Safe checks)
  const canModifyProject = (projectId) => {
    if (!projectId) return false;
    const proj = projects.find(p => p.id === projectId);
    if (!proj) return false;
    if (proj.owner?.id === currentUser?.id || proj.ownerId === currentUser?.id) return true;
    const member = proj.members?.find(m => m.user?.id === currentUser?.id || m.userId === currentUser?.id);
    return member?.role === 'Admin' || member?.role === 'Editor';
  };
  
  const canDeleteProjectData = (projectId) => {
    if (!projectId) return false;
    const proj = projects.find(p => p.id === projectId);
    if (!proj) return false;
    if (proj.owner?.id === currentUser?.id || proj.ownerId === currentUser?.id) return true;
    const member = proj.members?.find(m => m.user?.id === currentUser?.id || m.userId === currentUser?.id);
    return member?.role === 'Admin';
  };

  const currentProjectId = currentFolderId ? folderHistory[folderHistory.length - 1]?.projectId : '';

  // Data Filtering
  let currentViewFolders = [];
  let currentViewFiles = [];

  if (activeTab === 'All Files') {
    currentViewFolders = folders.filter(f => f.parentId === currentFolderId);
    currentViewFiles = files.filter(f => f.folderId === currentFolderId);
  } else if (activeTab === 'Shared with Me') {
    currentViewFiles = files.filter(f => f.uploader?.id !== currentUser?.id && f.uploaderId !== currentUser?.id);
  } else if (activeTab === 'Recent') {
    currentViewFiles = [...files].sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt)).slice(0, 30);
  }

  if (searchQuery) {
    const q = searchQuery.toLowerCase();
    currentViewFiles = currentViewFiles.filter(f => 
      f.name?.toLowerCase().includes(q) || 
      f.type?.toLowerCase().includes(q) ||
      f.project?.name?.toLowerCase().includes(q)
    );
    if (activeTab === 'All Files') {
      currentViewFolders = currentViewFolders.filter(f => 
        f.name?.toLowerCase().includes(q) ||
        f.project?.name?.toLowerCase().includes(q)
      );
    }
  }

  currentViewFiles.sort((a, b) => {
    let aVal = a[sortConfig.key];
    let bVal = b[sortConfig.key];
    if (sortConfig.key === 'project') {
      aVal = a.project?.name || '';
      bVal = b.project?.name || '';
    } else if (sortConfig.key === 'updatedAt') {
      aVal = new Date(a.updatedAt || 0).getTime();
      bVal = new Date(b.updatedAt || 0).getTime();
    }
    if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
    if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
    return 0;
  });

  const storageMetrics = useMemo(() => {
    let total = 0, images = 0, documents = 0, videos = 0, others = 0;
    files.forEach(f => {
      const s = f.size || 0;
      total += s;
      const t = (f.type || '').toLowerCase();
      if (t.includes('image') || t.includes('png') || t.includes('jpg') || t.includes('jpeg') || t.includes('svg') || t.includes('fig')) images += s;
      else if (t.includes('pdf') || t.includes('doc') || t.includes('txt') || t.includes('csv') || t.includes('xls') || t.includes('ppt')) documents += s;
      else if (t.includes('video') || t.includes('mp4') || t.includes('avi') || t.includes('mov')) videos += s;
      else others += s;
    });
    return { total, images, documents, videos, others };
  }, [files]);

  const formatSize = (bytes) => {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  const getFileIcon = (type) => {
    const t = (type || '').toLowerCase();
    if (t.includes('pdf')) return { icon: 'fa-solid fa-file-pdf', color: 'text-rose-400' };
    if (t.includes('doc')) return { icon: 'fa-solid fa-file-word', color: 'text-blue-400' };
    if (t.includes('xls') || t.includes('csv')) return { icon: 'fa-solid fa-file-excel', color: 'text-emerald-400' };
    if (t.includes('ppt')) return { icon: 'fa-solid fa-file-powerpoint', color: 'text-orange-400' };
    if (t.includes('png') || t.includes('jpg') || t.includes('jpeg') || t.includes('svg') || t.includes('fig')) return { icon: 'fa-solid fa-file-image', color: 'text-purple-400' };
    if (t.includes('zip') || t.includes('rar')) return { icon: 'fa-solid fa-file-zipper', color: 'text-amber-400' };
    if (t.includes('txt')) return { icon: 'fa-solid fa-file-lines', color: 'text-slate-400' };
    return { icon: 'fa-solid fa-file', color: 'text-slate-400' };
  };

  // Handlers
  const handleSaveFolder = async (e) => {
    e.preventDefault();
    setFolderSubmitting(true);
    try {
      if (editingFolder) {
        await apiClient(`/folders/${editingFolder.id}`, { method: 'PATCH', body: { name: folderForm.name } });
      } else {
        await apiClient('/folders', { 
          method: 'POST', 
          body: { 
            name: folderForm.name, 
            projectId: folderForm.projectId, 
            parentId: currentFolderId || null 
          } 
        });
      }
      setShowFolderModal(false);
      loadData();
    } catch (err) {
      alert(err.message || 'Failed to save folder');
    } finally {
      setFolderSubmitting(false);
    }
  };

  const handleDeleteFolder = async (id) => {
    if (!window.confirm('Are you sure you want to delete this folder? All contents must be empty.')) return;
    try {
      await apiClient(`/folders/${id}`, { method: 'DELETE' });
      loadData();
    } catch (err) {
      alert(err.message || 'Failed to delete folder');
    }
  };

  const handleSaveFile = async (e) => {
    e.preventDefault();
    setFileSubmitting(true);
    try {
      if (editingFile) {
        await apiClient(`/files/${editingFile.id}`, { method: 'PATCH', body: { name: fileForm.name } });
      } else {
        await apiClient('/files', { 
          method: 'POST', 
          body: { 
            ...fileForm, 
            projectId: fileForm.projectId, 
            folderId: currentFolderId || null 
          } 
        });
      }
      setShowFileModal(false);
      loadData();
    } catch (err) {
      alert(err.message || 'Failed to save file');
    } finally {
      setFileSubmitting(false);
    }
  };

  const handleDeleteFile = async (id) => {
    if (!window.confirm('Are you sure you want to delete this file metadata?')) return;
    try {
      await apiClient(`/files/${id}`, { method: 'DELETE' });
      loadData();
    } catch (err) {
      alert(err.message || 'Failed to delete file');
    }
  };

  const openNewFolder = () => {
    setEditingFolder(null);
    setFolderForm({ name: '', projectId: currentProjectId || (projects[0]?.id || '') });
    setShowFolderModal(true);
  };

  const openNewFile = () => {
    setEditingFile(null);
    setFileForm({ name: '', type: 'Document', size: 1024, storagePath: '/demo/path', projectId: currentProjectId || (projects[0]?.id || '') });
    setShowFileModal(true);
  };

  return (
    <div className="flex flex-col lg:flex-row gap-6 max-w-[1920px] mx-auto pb-12 min-h-screen">
      
      {/* Main Content Area */}
      <div className="flex-1 min-w-0 flex flex-col gap-6">
        
        {/* Top Header / Search */}
        <div className="flex items-center justify-between gap-4 bg-[#0f1422] border border-[#192238] rounded-2xl p-3 px-4 shadow-sm">
          <div className="relative flex-1 max-w-xl">
            <i className="fa-solid fa-magnifying-glass absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 text-sm"></i>
            <input 
              type="text" 
              placeholder="Search files, folders, projects, or keywords..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-[#161d2f] border border-[#1f2a44] rounded-xl pl-10 pr-10 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-purple-500 transition shadow-inner"
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery('')} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white">
                <i className="fa-solid fa-xmark"></i>
              </button>
            )}
          </div>
        </div>

        {/* Hero Section */}
        <div className="relative rounded-2xl p-8 bg-[#0f1422] border border-[#192238] overflow-hidden flex flex-col md:flex-row justify-between items-center gap-6 shadow-sm">
          <div className="absolute right-0 top-0 bottom-0 w-1/2 opacity-30 pointer-events-none bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-purple-600/40 via-indigo-900/10 to-transparent"></div>
          <div className="z-10 w-full">
            <div className="flex items-center gap-2 text-[11px] font-bold tracking-wider text-slate-400 mb-2 uppercase">
              <span>Files</span>
              <span className="text-slate-600">›</span>
              <span className="text-purple-400">{activeTab}</span>
            </div>
            <h1 className="text-3xl font-extrabold text-white tracking-tight mb-2">Files</h1>
            <p className="text-sm text-slate-400">Store. Share. Collaborate. Keep everything in one place.</p>
          </div>
          <div className="z-10 hidden md:block shrink-0 text-right">
             <p className="text-xs italic text-slate-400">"Organized files create organized minds."</p>
             <div className="w-12 h-0.5 bg-purple-500 mt-2 ml-auto rounded-full shadow-[0_0_8px_rgba(168,85,247,0.6)]"></div>
          </div>
        </div>

        {/* Filter / Action Bar */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-1.5 p-1 bg-[#0f1422] border border-[#192238] rounded-xl w-full sm:w-auto overflow-x-auto hide-scrollbar">
            {['All Files', 'Shared with Me', 'Recent', 'Starred', 'Trash'].map(tab => (
              <button 
                key={tab}
                onClick={() => { setActiveTab(tab); setCurrentFolderId(null); setFolderHistory([]); }}
                className={`px-4 py-2 rounded-lg text-xs font-bold transition whitespace-nowrap ${activeTab === tab ? 'bg-purple-600 text-white shadow-md shadow-purple-900/20' : 'text-slate-400 hover:text-white hover:bg-[#1a2333]'}`}
              >
                {tab}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-3 w-full sm:w-auto">
             <button onClick={openNewFile} className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2 bg-[#161d2f] hover:bg-[#1a2333] text-white border border-[#1f2a44] rounded-xl text-xs font-bold transition">
               <i className="fa-solid fa-upload"></i> Upload
             </button>
             
             <div className="relative" ref={openMenuId === 'new_menu' ? menuRef : null}>
               <button onClick={() => setOpenMenuId(openMenuId === 'new_menu' ? null : 'new_menu')} className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2 bg-[#5922cf] hover:bg-[#682ae6] text-white rounded-xl text-xs font-bold shadow-lg shadow-purple-900/30 transition">
                 New <i className="fa-solid fa-chevron-down text-[10px] ml-1"></i>
               </button>
               {openMenuId === 'new_menu' && (
                 <div className="absolute right-0 top-full mt-2 w-48 bg-[#1f2638] rounded-xl shadow-xl border border-[#2d364f] z-50 overflow-hidden py-1">
                   <button onClick={() => { setOpenMenuId(null); openNewFolder(); }} className="flex items-center gap-3 w-full px-4 py-2.5 text-xs font-semibold text-slate-200 hover:text-white hover:bg-[#2a344a] text-left">
                     <i className="fa-solid fa-folder-plus text-purple-400"></i> New Folder
                   </button>
                 </div>
               )}
             </div>
             <div className="flex items-center bg-[#0f1422] border border-[#192238] rounded-xl p-1 shrink-0">
               <button onClick={() => setViewMode('grid')} className={`w-8 h-8 flex items-center justify-center rounded-lg transition ${viewMode === 'grid' ? 'bg-[#1a2333] text-white' : 'text-slate-500 hover:text-white'}`}><i className="fa-solid fa-border-all text-xs"></i></button>
               <button onClick={() => setViewMode('list')} className={`w-8 h-8 flex items-center justify-center rounded-lg transition ${viewMode === 'list' ? 'bg-[#1a2333] text-white' : 'text-slate-500 hover:text-white'}`}><i className="fa-solid fa-list text-xs"></i></button>
             </div>
          </div>
        </div>

        {/* Empty States for unsupported tabs */}
        {(activeTab === 'Starred' || activeTab === 'Trash') && (
          <div className="flex flex-col items-center justify-center py-20 bg-[#0f1422] border border-dashed border-[#1f2a44] rounded-2xl">
            <i className={`fa-solid ${activeTab === 'Starred' ? 'fa-star text-amber-500' : 'fa-trash text-slate-500'} text-4xl mb-4 opacity-50`}></i>
            <h2 className="text-lg font-bold text-white mb-2">{activeTab} not supported</h2>
            <p className="text-sm text-slate-400">This feature is not currently available in the backend.</p>
          </div>
        )}

        {/* Breadcrumb Navigation for All Files */}
        {activeTab === 'All Files' && (
           <div className="flex items-center gap-2 text-xs text-slate-400 bg-[#0f1422] border border-[#192238] px-4 py-2.5 rounded-xl font-medium">
             <button onClick={handleGoRoot} className="hover:text-white transition flex items-center gap-2"><i className="fa-solid fa-home"></i> Root</button>
             {folderHistory.map((h, i) => (
               <div key={h.id} className="flex items-center gap-2">
                 <span className="text-slate-600">/</span>
                 <button onClick={() => {
                   const newHistory = folderHistory.slice(0, i + 1);
                   setFolderHistory(newHistory);
                   setCurrentFolderId(h.id);
                 }} className={`transition truncate max-w-[150px] ${i === folderHistory.length - 1 ? 'text-white font-bold' : 'hover:text-white'}`}>{h.name}</button>
               </div>
             ))}
           </div>
        )}

        {/* Main Content (Folders & Files) */}
        {error ? (
          <div className="p-8 text-center text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl">{error}</div>
        ) : loading ? (
          <div className="flex justify-center py-20"><i className="fa-solid fa-circle-notch fa-spin text-3xl text-purple-500"></i></div>
        ) : (activeTab === 'All Files' || activeTab === 'Shared with Me' || activeTab === 'Recent') && (
          <>
            {/* Folders Section (Only in All Files) */}
            {activeTab === 'All Files' && (
              <div className="mb-2">
                <div className="flex items-center justify-between mb-4 px-2">
                  <h2 className="text-sm font-bold text-white flex items-center gap-2"><i className="fa-solid fa-folder text-slate-400"></i> Folders</h2>
                  <span className="text-xs font-bold text-slate-500">{currentViewFolders.length} folders</span>
                </div>
                
                {currentViewFolders.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-10 bg-[#0f1422] border border-dashed border-[#1f2a44] rounded-2xl">
                    <p className="text-sm text-slate-400">No folders yet.</p>
                    <button onClick={openNewFolder} className="mt-3 text-xs font-bold text-purple-400 hover:text-purple-300">Create Folder</button>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                    {currentViewFolders.map(folder => {
                      const fCount = files.filter(f => f.folderId === folder.id).length;
                      const isMenuOpen = openMenuId === `folder_${folder.id}`;
                      const canEdit = canModifyProject(folder.projectId);
                      const canDel = canDeleteProjectData(folder.projectId);
                      
                      return (
                        <div key={folder.id} onClick={() => handleOpenFolder(folder)} className="group bg-[#0f1422] border border-[#192238] hover:border-[#2d3a5a] rounded-2xl p-4 cursor-pointer transition shadow-sm relative">
                          <div className="flex items-start justify-between mb-3">
                            <i className="fa-solid fa-folder text-3xl text-purple-500 group-hover:scale-110 transition-transform origin-bottom-left"></i>
                            <div className="relative" ref={isMenuOpen ? menuRef : null}>
                              <button onClick={(e) => { e.stopPropagation(); setOpenMenuId(isMenuOpen ? null : `folder_${folder.id}`); }} className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-500 hover:text-white hover:bg-[#1a2333] transition opacity-0 group-hover:opacity-100">
                                <i className="fa-solid fa-ellipsis text-sm"></i>
                              </button>
                              {isMenuOpen && (
                                <div className="absolute right-0 top-full mt-1 w-32 bg-[#1f2638] rounded-xl shadow-xl border border-[#2d364f] z-50 overflow-hidden py-1" onClick={e => e.stopPropagation()}>
                                  <button onClick={() => { setOpenMenuId(null); handleOpenFolder(folder); }} className="flex items-center gap-2 w-full px-4 py-2 text-xs font-semibold text-white hover:bg-[#2a344a] text-left"><i className="fa-solid fa-folder-open w-3"></i> Open</button>
                                  {canEdit && <button onClick={() => { setOpenMenuId(null); setEditingFolder(folder); setFolderForm({ name: folder.name, projectId: folder.projectId }); setShowFolderModal(true); }} className="flex items-center gap-2 w-full px-4 py-2 text-xs font-semibold text-slate-300 hover:bg-[#2a344a] hover:text-white text-left"><i className="fa-solid fa-pen w-3"></i> Rename</button>}
                                  {canDel && <button onClick={() => { setOpenMenuId(null); handleDeleteFolder(folder.id); }} className="flex items-center gap-2 w-full px-4 py-2 text-xs font-semibold text-red-400 hover:bg-red-500/10 text-left border-t border-[#2d364f] mt-1 pt-2"><i className="fa-solid fa-trash w-3"></i> Delete</button>}
                                </div>
                              )}
                            </div>
                          </div>
                          <div>
                            <h3 className="text-sm font-bold text-white truncate mb-1 group-hover:text-purple-400 transition-colors">{folder.name}</h3>
                            <p className="text-[10px] text-slate-400 font-medium truncate">{folder.project?.name || 'Unknown Project'}</p>
                            <p className="text-[10px] text-slate-500 mt-2">{fCount} files • Updated {new Date(folder.updatedAt).toLocaleDateString()}</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Files Section */}
            <div className="flex-1 bg-[#0f1422] border border-[#192238] rounded-2xl overflow-hidden flex flex-col shadow-sm">
              <div className="p-4 border-b border-[#192238] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <h2 className="text-sm font-bold text-white flex items-center gap-2 shrink-0"><i className="fa-solid fa-file-lines text-slate-400"></i> Files</h2>
                <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
                  
                  <div className="relative flex-1 sm:flex-none sm:min-w-[200px]">
                    <i className="fa-solid fa-magnifying-glass absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-xs"></i>
                    <input 
                      type="text" 
                      placeholder="Search files..." 
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full bg-[#161d2f] border border-[#1f2a44] rounded-lg pl-8 pr-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-purple-500 transition shadow-inner"
                    />
                  </div>

                  <div className="relative" ref={openMenuId === 'filter_menu' ? menuRef : null}>
                    <button onClick={() => setOpenMenuId(openMenuId === 'filter_menu' ? null : 'filter_menu')} className="flex items-center gap-2 bg-[#161d2f] border border-[#1f2a44] rounded-lg px-3 py-1.5 text-xs font-bold text-slate-300 hover:text-white transition">
                      <i className="fa-solid fa-filter text-slate-500"></i> Filter <i className="fa-solid fa-chevron-down text-[10px]"></i>
                    </button>
                    {openMenuId === 'filter_menu' && (
                      <div className="absolute right-0 top-full mt-1 w-48 bg-[#1f2638] rounded-xl shadow-xl border border-[#2d364f] z-50 p-3">
                        <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">File Type</div>
                        <div className="flex flex-col gap-1.5 mb-3">
                           <label className="flex items-center gap-2 text-xs text-slate-300"><input type="checkbox" className="rounded bg-[#0f1422] border-[#2d364f] text-purple-500" /> Documents</label>
                           <label className="flex items-center gap-2 text-xs text-slate-300"><input type="checkbox" className="rounded bg-[#0f1422] border-[#2d364f] text-purple-500" /> Images</label>
                        </div>
                        <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2 border-t border-[#2d364f] pt-3">Shared Status</div>
                        <div className="flex flex-col gap-1.5">
                           <label className="flex items-center gap-2 text-xs text-slate-300"><input type="checkbox" className="rounded bg-[#0f1422] border-[#2d364f] text-purple-500" /> Shared with me</label>
                           <label className="flex items-center gap-2 text-xs text-slate-300"><input type="checkbox" className="rounded bg-[#0f1422] border-[#2d364f] text-purple-500" /> Owned by me</label>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="relative">
                    <select value={sortConfig.key} onChange={e => setSortConfig({...sortConfig, key: e.target.value})} className="appearance-none bg-[#161d2f] border border-[#1f2a44] rounded-lg pl-3 pr-8 py-1.5 text-xs font-bold text-slate-300 focus:outline-none cursor-pointer hover:text-white transition">
                      <option value="updatedAt">Last Modified</option>
                      <option value="name">Name</option>
                      <option value="size">Size</option>
                      <option value="type">Type</option>
                      <option value="project">Project</option>
                    </select>
                    <i className="fa-solid fa-sort absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-slate-500 pointer-events-none"></i>
                  </div>
                  <button onClick={() => setSortConfig({...sortConfig, direction: sortConfig.direction === 'asc' ? 'desc' : 'asc'})} className="w-8 h-8 flex items-center justify-center bg-[#161d2f] border border-[#1f2a44] rounded-lg text-slate-400 hover:text-white transition shrink-0">
                    <i className={`fa-solid fa-arrow-${sortConfig.direction === 'asc' ? 'up' : 'down'} text-xs`}></i>
                  </button>
                </div>
              </div>

              {currentViewFiles.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 flex-1">
                  <i className="fa-regular fa-file text-4xl text-slate-600 mb-4"></i>
                  <h3 className="text-base font-bold text-white mb-1">No files found</h3>
                  <p className="text-xs text-slate-400">Upload documents, images, and other files here.</p>
                </div>
              ) : viewMode === 'list' ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs whitespace-nowrap">
                    <thead className="bg-[#161d2f]/50 text-slate-400 uppercase font-bold text-[10px] tracking-wider border-b border-[#1f2a44]">
                      <tr>
                        <th className="py-3 px-4 w-10"><input type="checkbox" className="rounded border-slate-600 bg-[#0f1422] checked:bg-purple-500" disabled /></th>
                        <th className="py-3 px-4">Name</th>
                        <th className="py-3 px-4">Type</th>
                        <th className="py-3 px-4">Project / Folder</th>
                        <th className="py-3 px-4">Size</th>
                        <th className="py-3 px-4">Last Modified</th>
                        <th className="py-3 px-4">Shared</th>
                        <th className="py-3 px-4 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#1f2a44] text-slate-300 font-medium">
                      {currentViewFiles.map(file => {
                        const { icon, color } = getFileIcon(file.type);
                        const isMenuOpen = openMenuId === `file_${file.id}`;
                        const canEdit = canModifyProject(file.projectId);
                        const canDel = canDeleteProjectData(file.projectId);

                        return (
                          <tr key={file.id} className="hover:bg-[#161d2f] transition group">
                            <td className="py-3 px-4"><input type="checkbox" className="rounded border-slate-600 bg-[#0f1422] checked:bg-purple-500 cursor-pointer" /></td>
                            <td className="py-3 px-4">
                              <div className="flex items-center gap-3">
                                <i className={`${icon} ${color} text-sm w-4 text-center`}></i>
                                <span className="text-white font-bold">{file.name}</span>
                              </div>
                            </td>
                            <td className="py-3 px-4 text-[10px] uppercase tracking-wider">{file.type}</td>
                            <td className="py-3 px-4">
                              <div className="flex items-center gap-1.5">
                                <span className={`w-2 h-2 rounded-full ${file.project?.name ? 'bg-emerald-500' : 'bg-slate-500'}`}></span>
                                <span>{file.project?.name || 'Unknown Project'}</span>
                              </div>
                            </td>
                            <td className="py-3 px-4">{formatSize(file.size)}</td>
                            <td className="py-3 px-4">{new Date(file.updatedAt).toLocaleDateString()}</td>
                            <td className="py-3 px-4">
                              <div className="flex items-center gap-2">
                                <div className="w-5 h-5 rounded-full bg-slate-700 flex items-center justify-center overflow-hidden border border-[#0f1422]" title={file.uploader?.name}>
                                  <span className="text-[8px] font-bold text-white">{file.uploader?.name?.charAt(0) || 'U'}</span>
                                </div>
                                <span className="text-[10px] text-slate-500 bg-[#161d2f] px-1.5 py-0.5 rounded">Project members</span>
                              </div>
                            </td>
                            <td className="py-3 px-4 text-right">
                               <div className="relative inline-block text-left" ref={isMenuOpen ? menuRef : null}>
                                 <button onClick={(e) => { e.stopPropagation(); setOpenMenuId(isMenuOpen ? null : `file_${file.id}`); }} className="w-6 h-6 flex items-center justify-center rounded text-slate-500 hover:text-white hover:bg-[#1a2333] transition opacity-0 group-hover:opacity-100">
                                   <i className="fa-solid fa-ellipsis"></i>
                                 </button>
                                 {isMenuOpen && (
                                   <div className="absolute right-0 top-full mt-1 w-32 bg-[#1f2638] rounded-xl shadow-xl border border-[#2d364f] z-50 overflow-hidden py-1">
                                     <a href={file.storagePath} target="_blank" rel="noreferrer" className="flex items-center gap-2 w-full px-4 py-2 text-xs font-semibold text-white hover:bg-[#2a344a]"><i className="fa-solid fa-download w-3"></i> Download</a>
                                     {canEdit && <button onClick={() => { setOpenMenuId(null); setEditingFile(file); setFileForm({ name: file.name, type: file.type, size: file.size, storagePath: file.storagePath, projectId: file.projectId }); setShowFileModal(true); }} className="flex items-center gap-2 w-full px-4 py-2 text-xs font-semibold text-slate-300 hover:text-white hover:bg-[#2a344a] text-left"><i className="fa-solid fa-pen w-3"></i> Rename</button>}
                                     {canDel && <button onClick={() => { setOpenMenuId(null); handleDeleteFile(file.id); }} className="flex items-center gap-2 w-full px-4 py-2 text-xs font-semibold text-red-400 hover:bg-red-500/10 text-left border-t border-[#2d364f] mt-1 pt-2"><i className="fa-solid fa-trash w-3"></i> Delete</button>}
                                   </div>
                                 )}
                               </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="p-4 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4 overflow-y-auto">
                   {currentViewFiles.map(file => {
                     const { icon, color } = getFileIcon(file.type);
                     return (
                       <div key={file.id} className="group bg-[#161d2f] border border-[#1f2a44] rounded-xl p-4 flex flex-col hover:border-[#384366] transition shadow-sm relative">
                         <div className="flex items-start justify-between mb-3">
                           <i className={`${icon} ${color} text-3xl`}></i>
                           <div className="text-right">
                             <span className="text-[9px] font-bold uppercase tracking-wider text-slate-500 bg-[#0f1422] px-2 py-1 rounded-md">{file.type}</span>
                           </div>
                         </div>
                         <h3 className="text-xs font-bold text-white truncate mb-1" title={file.name}>{file.name}</h3>
                         <p className="text-[10px] text-slate-400 truncate mb-3">{file.project?.name}</p>
                         <div className="mt-auto flex items-center justify-between text-[10px] font-medium text-slate-500">
                           <span>{formatSize(file.size)}</span>
                           <span>{new Date(file.updatedAt).toLocaleDateString()}</span>
                         </div>
                         <a href={file.storagePath} target="_blank" rel="noreferrer" className="absolute inset-0 z-0"></a>
                       </div>
                     );
                   })}
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* Right Sidebar */}
      <div className="w-full lg:w-[280px] xl:w-[320px] shrink-0 flex flex-col gap-5">
        
        {/* Storage */}
        <div className="bg-[#0f1422] border border-[#192238] rounded-2xl p-5 shadow-sm">
          <div className="flex items-center justify-between mb-4">
             <h2 className="text-sm font-bold text-white flex items-center gap-2"><i className="fa-solid fa-hard-drive text-slate-400"></i> Storage</h2>
             <span className="text-[10px] font-bold text-purple-400 bg-purple-500/10 px-2 py-0.5 rounded uppercase tracking-wider">{files.length} files</span>
          </div>
          <div className="mb-4">
             <div className="flex justify-between text-xs mb-1">
               <span className="text-slate-300 font-medium">Usage Breakdown</span>
               <span className="text-slate-500">Quota Unknown</span>
             </div>
             <div className="text-base font-extrabold text-white mb-3">{formatSize(storageMetrics.total)} <span className="text-xs font-medium text-slate-500 font-normal">total processed</span></div>
             
             {storageMetrics.total > 0 ? (
               <div className="h-1.5 w-full flex rounded-full overflow-hidden mb-4 bg-[#1f2a44]">
                 {storageMetrics.documents > 0 && <div style={{width: `${(storageMetrics.documents/storageMetrics.total)*100}%`}} className="bg-blue-500"></div>}
                 {storageMetrics.images > 0 && <div style={{width: `${(storageMetrics.images/storageMetrics.total)*100}%`}} className="bg-emerald-500"></div>}
                 {storageMetrics.videos > 0 && <div style={{width: `${(storageMetrics.videos/storageMetrics.total)*100}%`}} className="bg-amber-500"></div>}
                 {storageMetrics.others > 0 && <div style={{width: `${(storageMetrics.others/storageMetrics.total)*100}%`}} className="bg-purple-500"></div>}
               </div>
             ) : (
               <div className="h-1.5 w-full rounded-full bg-[#1f2a44] mb-4"></div>
             )}

             <div className="flex flex-col gap-2.5">
               <div className="flex items-center justify-between text-xs font-medium">
                 <div className="flex items-center gap-2 text-slate-300"><span className="w-2 h-2 rounded-full bg-blue-500"></span> Documents</div>
                 <span className="text-white">{formatSize(storageMetrics.documents)}</span>
               </div>
               <div className="flex items-center justify-between text-xs font-medium">
                 <div className="flex items-center gap-2 text-slate-300"><span className="w-2 h-2 rounded-full bg-emerald-500"></span> Images</div>
                 <span className="text-white">{formatSize(storageMetrics.images)}</span>
               </div>
               <div className="flex items-center justify-between text-xs font-medium">
                 <div className="flex items-center gap-2 text-slate-300"><span className="w-2 h-2 rounded-full bg-amber-500"></span> Videos</div>
                 <span className="text-white">{formatSize(storageMetrics.videos)}</span>
               </div>
               <div className="flex items-center justify-between text-xs font-medium">
                 <div className="flex items-center gap-2 text-slate-300"><span className="w-2 h-2 rounded-full bg-purple-500"></span> Others</div>
                 <span className="text-white">{formatSize(storageMetrics.others)}</span>
               </div>
             </div>
          </div>
          <button className="w-full py-2 bg-purple-600/20 hover:bg-purple-600/30 text-purple-400 rounded-xl text-xs font-bold transition border border-purple-500/30">
            Storage Options Unavailable
          </button>
        </div>

        {/* Recent Activity */}
        <div className="bg-[#0f1422] border border-[#192238] rounded-2xl p-5 shadow-sm flex flex-col max-h-[300px]">
          <div className="flex items-center justify-between mb-4 shrink-0">
             <h2 className="text-sm font-bold text-white flex items-center gap-2"><i className="fa-regular fa-calendar-check text-slate-400"></i> Recent Activity</h2>
             <span className="text-[10px] text-slate-500 font-bold uppercase hover:text-white cursor-pointer transition">View All →</span>
          </div>
          <div className="flex-1 overflow-y-auto hide-scrollbar pr-2">
            {recentActivity.length === 0 ? (
               <div className="text-center py-6 text-xs text-slate-500">No recent file activity.</div>
            ) : (
              <div className="flex flex-col gap-4">
                {recentActivity.map(act => (
                  <div key={act.id} className="flex gap-3">
                    <div className="w-7 h-7 rounded-full bg-[#1a2333] border border-[#2d3a5a] flex items-center justify-center shrink-0 overflow-hidden text-purple-400">
                      {act.user?.avatarUrl ? (
                         <img src={act.user.avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
                      ) : (
                         <span className="text-[10px] font-bold">{act.user?.name?.charAt(0).toUpperCase() || 'U'}</span>
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="text-[11px] text-slate-300 leading-tight">
                        <span className="font-bold text-white">{act.user?.name || 'Someone'}</span> {act.action.toLowerCase()} {act.entityType.toLowerCase()}
                      </p>
                      <p className="text-[11px] font-bold text-purple-400 truncate mt-0.5">{act.metadata?.name || 'Unknown item'}</p>
                      <p className="text-[9px] text-slate-500 mt-0.5">{new Date(act.createdAt).toLocaleDateString()}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Quick Actions */}
        <div className="bg-[#0f1422] border border-[#192238] rounded-2xl p-5 shadow-sm">
          <h2 className="text-sm font-bold text-white flex items-center gap-2 mb-4"><i className="fa-solid fa-bolt text-slate-400"></i> Quick Actions</h2>
          <div className="grid grid-cols-2 gap-3">
            <button onClick={openNewFile} className="flex items-center gap-2 p-2 rounded-lg hover:bg-[#161d2f] text-slate-300 hover:text-white text-[11px] font-bold transition text-left">
              <i className="fa-solid fa-upload w-4 text-center"></i> Upload Files
            </button>
            <button onClick={openNewFolder} className="flex items-center gap-2 p-2 rounded-lg hover:bg-[#161d2f] text-slate-300 hover:text-white text-[11px] font-bold transition text-left">
              <i className="fa-solid fa-folder-plus w-4 text-center"></i> Create Folder
            </button>
            <button className="flex items-center gap-2 p-2 rounded-lg hover:bg-[#161d2f] text-slate-300 hover:text-white text-[11px] font-bold transition text-left opacity-50 cursor-not-allowed">
              <i className="fa-solid fa-share-nodes w-4 text-center"></i> Share Files
            </button>
            <button onClick={() => { setActiveTab('Trash'); setCurrentFolderId(null); }} className="flex items-center gap-2 p-2 rounded-lg hover:bg-[#161d2f] text-slate-300 hover:text-white text-[11px] font-bold transition text-left">
              <i className="fa-solid fa-trash w-4 text-center"></i> View Trash
            </button>
          </div>
        </div>

        {/* Integrations */}
        <div className="bg-[#0f1422] border border-[#192238] rounded-2xl p-5 shadow-sm">
          <div className="flex items-center justify-between mb-1">
             <h2 className="text-sm font-bold text-white flex items-center gap-2"><i className="fa-solid fa-plug text-slate-400"></i> Integrations</h2>
             <span className="text-[9px] text-slate-500 font-bold uppercase border border-slate-700 px-2 py-0.5 rounded cursor-not-allowed">Manage</span>
          </div>
          <p className="text-[10px] text-slate-400 mb-4">Connect and access your files</p>
          <div className="flex justify-between gap-2">
             <div className="flex flex-col items-center gap-1 opacity-40">
                <i className="fa-brands fa-google-drive text-2xl text-slate-300"></i>
                <span className="text-[9px] font-bold text-slate-300 mt-1">Google Drive</span>
                <span className="text-[8px] text-slate-500 flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-slate-600"></span> Not Connected</span>
             </div>
             <div className="flex flex-col items-center gap-1 opacity-40">
                <i className="fa-brands fa-dropbox text-2xl text-slate-300"></i>
                <span className="text-[9px] font-bold text-slate-300 mt-1">Dropbox</span>
                <span className="text-[8px] text-slate-500 flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-slate-600"></span> Not Connected</span>
             </div>
             <div className="flex flex-col items-center gap-1 opacity-40">
                <i className="fa-brands fa-microsoft text-2xl text-slate-300"></i>
                <span className="text-[9px] font-bold text-slate-300 mt-1">OneDrive</span>
                <span className="text-[8px] text-slate-500 flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-slate-600"></span> Not Connected</span>
             </div>
          </div>
        </div>

        {/* Info Card */}
        <div className="bg-gradient-to-br from-indigo-900/40 to-[#0f1422] border border-indigo-500/20 rounded-2xl p-5 shadow-sm flex items-start gap-4">
           <div className="w-10 h-10 rounded-full bg-indigo-500/20 flex items-center justify-center shrink-0">
             <i className="fa-solid fa-lightbulb text-indigo-400"></i>
           </div>
           <div>
             <h3 className="text-xs font-bold text-white mb-1">Keep your workspace organized</h3>
             <p className="text-[10px] text-slate-400 leading-relaxed mb-2">Use folders, tags and consistent naming to find files faster.</p>
             <span className="text-[10px] font-bold text-indigo-400 cursor-pointer hover:text-indigo-300 transition">Learn file organization tips &rarr;</span>
           </div>
        </div>

      </div>

      {/* Folder Modal */}
      {showFolderModal && (
        <div className="fixed inset-0 flex items-center justify-center z-50 bg-black/60 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="bg-[#101524] p-6 rounded-2xl border border-[#192238] w-full max-w-sm shadow-2xl">
            <h2 className="text-lg text-white font-bold mb-4">{editingFolder ? 'Rename Folder' : 'New Folder'}</h2>
            <form onSubmit={handleSaveFolder} className="flex flex-col gap-4">
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Project <span className="text-red-500">*</span></label>
                <select required disabled={!!editingFolder} value={folderForm.projectId} onChange={e => setFolderForm({...folderForm, projectId: e.target.value})} className="w-full bg-[#161d2f] border border-[#1f2a44] rounded-xl px-4 py-2.5 text-sm font-semibold text-white focus:outline-none focus:border-purple-500 transition disabled:opacity-50 appearance-none">
                  <option value="" disabled>Select a project</option>
                  {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Folder Name <span className="text-red-500">*</span></label>
                <input required value={folderForm.name} onChange={e => setFolderForm({...folderForm, name: e.target.value})} placeholder="E.g. Assets" className="w-full bg-[#161d2f] border border-[#1f2a44] rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-purple-500 transition shadow-inner" />
              </div>
              <div className="flex justify-end gap-3 mt-2 pt-4 border-t border-[#1f2a44]">
                <button type="button" disabled={folderSubmitting} onClick={() => setShowFolderModal(false)} className="px-4 py-2 text-slate-300 text-xs font-bold hover:text-white hover:bg-[#1a2333] rounded-lg transition disabled:opacity-50">Cancel</button>
                <button type="submit" disabled={folderSubmitting} className="px-5 py-2 bg-[#5922cf] hover:bg-[#682ae6] text-white rounded-lg text-xs font-bold shadow-lg shadow-purple-900/30 transition disabled:opacity-50 flex items-center gap-2">
                  {folderSubmitting && <i className="fa-solid fa-spinner fa-spin"></i>}
                  Save
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* File Modal */}
      {showFileModal && (
        <div className="fixed inset-0 flex items-center justify-center z-50 bg-black/60 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="bg-[#101524] p-6 rounded-2xl border border-[#192238] w-full max-w-sm shadow-2xl">
            <h2 className="text-lg text-white font-bold mb-4">{editingFile ? 'Edit File Metadata' : 'Upload / Register File'}</h2>
            <form onSubmit={handleSaveFile} className="flex flex-col gap-4">
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Project <span className="text-red-500">*</span></label>
                <select required disabled={!!editingFile} value={fileForm.projectId} onChange={e => setFileForm({...fileForm, projectId: e.target.value})} className="w-full bg-[#161d2f] border border-[#1f2a44] rounded-xl px-4 py-2.5 text-sm font-semibold text-white focus:outline-none focus:border-purple-500 transition disabled:opacity-50 appearance-none">
                  <option value="" disabled>Select a project</option>
                  {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">File Name <span className="text-red-500">*</span></label>
                <input required value={fileForm.name} onChange={e => setFileForm({...fileForm, name: e.target.value})} placeholder="E.g. Logo.png" className="w-full bg-[#161d2f] border border-[#1f2a44] rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-purple-500 transition shadow-inner" />
              </div>
              {!editingFile && (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Type <span className="text-red-500">*</span></label>
                      <input required value={fileForm.type} onChange={e => setFileForm({...fileForm, type: e.target.value})} placeholder="E.g. PNG" className="w-full bg-[#161d2f] border border-[#1f2a44] rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-purple-500 transition shadow-inner" />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Size (bytes) <span className="text-red-500">*</span></label>
                      <input required type="number" min="0" value={fileForm.size} onChange={e => setFileForm({...fileForm, size: parseInt(e.target.value) || 0})} className="w-full bg-[#161d2f] border border-[#1f2a44] rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-purple-500 transition shadow-inner" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Storage URL / Path <span className="text-red-500">*</span></label>
                    <input required value={fileForm.storagePath} onChange={e => setFileForm({...fileForm, storagePath: e.target.value})} placeholder="https://..." className="w-full bg-[#161d2f] border border-[#1f2a44] rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-purple-500 transition shadow-inner" />
                  </div>
                </>
              )}
              <div className="flex justify-end gap-3 mt-2 pt-4 border-t border-[#1f2a44]">
                <button type="button" disabled={fileSubmitting} onClick={() => setShowFileModal(false)} className="px-4 py-2 text-slate-300 text-xs font-bold hover:text-white hover:bg-[#1a2333] rounded-lg transition disabled:opacity-50">Cancel</button>
                <button type="submit" disabled={fileSubmitting} className="px-5 py-2 bg-[#5922cf] hover:bg-[#682ae6] text-white rounded-lg text-xs font-bold shadow-lg shadow-purple-900/30 transition disabled:opacity-50 flex items-center gap-2">
                  {fileSubmitting && <i className="fa-solid fa-spinner fa-spin"></i>}
                  {editingFile ? 'Save Changes' : 'Upload'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}