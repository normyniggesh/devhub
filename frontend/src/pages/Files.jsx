import { useState, useEffect } from 'react';
import { apiClient } from '../api/client';
import { useStore } from '../store';

export default function Files() {
  const { currentUser } = useStore();
  const [projects, setProjects] = useState([]);
  const [selectedProjectId, setSelectedProjectId] = useState('');
  const [currentFolderId, setCurrentFolderId] = useState(null);
  const [folderHistory, setFolderHistory] = useState([]); // Array of { id, name }

  const [folders, setFolders] = useState([]);
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(true);

  const [showFolderModal, setShowFolderModal] = useState(false);
  const [editingFolder, setEditingFolder] = useState(null);
  const [folderForm, setFolderForm] = useState({ name: '' });

  const [showFileModal, setShowFileModal] = useState(false);
  const [editingFile, setEditingFile] = useState(null);
  const [fileForm, setFileForm] = useState({ name: '', type: 'Document', size: 1024, storagePath: '' });

  useEffect(() => {
    const fetchProjects = async () => {
      try {
        const data = await apiClient('/projects');
        setProjects(data.projects || []);
      } catch (err) {}
    };
    fetchProjects();
  }, []);

  const loadContents = async () => {
    if (!selectedProjectId) {
      setFolders([]);
      setFiles([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const folderUrl = currentFolderId 
        ? `/folders?projectId=${selectedProjectId}&parentId=${currentFolderId}`
        : `/folders?projectId=${selectedProjectId}&isRoot=true`; // Assuming backend has isRoot or handles null parentId
      
      // Some backends might require querying all and filtering, or have parentId explicitly. We'll pass parentId. If null, we only want root folders.
      // Wait, let's just pass parentId. If currentFolderId is null, some APIs expect parentId=null to be explicitly queried or handled.
      // Let's check backend behavior. If it doesn't support parentId filtering properly, we might have to filter locally.
      // Assuming backend supports: /api/folders?projectId=x
      const allFoldersData = await apiClient(`/folders?projectId=${selectedProjectId}`);
      const allFilesData = await apiClient(`/files?projectId=${selectedProjectId}`);
      
      const allFolders = allFoldersData.folders || [];
      const allFiles = allFilesData.files || [];

      setFolders(allFolders.filter(f => f.parentId === currentFolderId));
      setFiles(allFiles.filter(f => f.folderId === currentFolderId));
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadContents();
  }, [selectedProjectId, currentFolderId]);

  const handleProjectChange = (e) => {
    setSelectedProjectId(e.target.value);
    setCurrentFolderId(null);
    setFolderHistory([]);
  };

  const getRole = () => {
    const project = projects.find(p => p.id === selectedProjectId);
    if (!project || !currentUser) return 'Viewer';
    if (project.owner?.id === currentUser.id) return 'Admin';
    if (project.members && project.members.length > 0) return project.members[0].role;
    return 'Viewer';
  };

  const role = getRole();
  const canEdit = role === 'Admin' || role === 'Editor';
  const canDelete = role === 'Admin';

  const handleOpenFolder = (folder) => {
    setFolderHistory([...folderHistory, { id: folder.id, name: folder.name }]);
    setCurrentFolderId(folder.id);
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

  // Folder Actions
  const handleSaveFolder = async (e) => {
    e.preventDefault();
    try {
      if (editingFolder) {
        await apiClient(`/folders/${editingFolder.id}`, { method: 'PATCH', body: { name: folderForm.name } });
      } else {
        await apiClient('/folders', { method: 'POST', body: { name: folderForm.name, projectId: selectedProjectId, parentId: currentFolderId || null } });
      }
      setShowFolderModal(false);
      setEditingFolder(null);
      setFolderForm({ name: '' });
      loadContents();
    } catch (err) {
      alert(err.message || 'Failed to save folder');
    }
  };

  const handleDeleteFolder = async (e, id) => {
    e.stopPropagation();
    if (!confirm('Are you sure you want to delete this folder?')) return;
    try {
      await apiClient(`/folders/${id}`, { method: 'DELETE' });
      loadContents();
    } catch (err) {
      alert(err.message || 'Failed to delete folder');
    }
  };

  // File Actions
  const handleSaveFile = async (e) => {
    e.preventDefault();
    try {
      if (editingFile) {
        await apiClient(`/files/${editingFile.id}`, { method: 'PATCH', body: { name: fileForm.name } }); // Usually only name is editable
      } else {
        await apiClient('/files', { method: 'POST', body: { ...fileForm, projectId: selectedProjectId, folderId: currentFolderId || null } });
      }
      setShowFileModal(false);
      setEditingFile(null);
      setFileForm({ name: '', type: 'Document', size: 1024, storagePath: '' });
      loadContents();
    } catch (err) {
      alert(err.message || 'Failed to save file metadata');
    }
  };

  const handleDeleteFile = async (id) => {
    if (!confirm('Are you sure you want to delete this file metadata?')) return;
    try {
      await apiClient(`/files/${id}`, { method: 'DELETE' });
      loadContents();
    } catch (err) {
      alert(err.message || 'Failed to delete file');
    }
  };

  const formatSize = (bytes) => {
    if (!bytes) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  return (
    <>
      <section className="relative rounded-2xl p-6 custom-gradient-banner border border-[#1f263e] overflow-hidden flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div className="absolute right-0 top-0 bottom-0 w-2/5 opacity-25 pointer-events-none bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-indigo-500 via-purple-900 to-transparent"></div>
        <div className="z-10">
          <div className="flex items-center gap-2 text-xs font-medium text-slate-400 mb-1">
            <span>Files</span>
            <svg className="w-3 h-3 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M9 5l7 7-7 7" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"></path></svg>
            <span className="text-slate-300">All Files</span>
          </div>
          <h1 className="text-3xl font-extrabold text-white tracking-tight">Files</h1>
          <p className="text-xs text-slate-400 mt-1 font-normal">Store. Share. Collaborate. Keep everything in one place.</p>
        </div>
        <div className="z-10">
          <select 
            value={selectedProjectId} 
            onChange={handleProjectChange}
            className="bg-[#111728] border border-[#1e293f] rounded-lg px-3 py-2 text-sm text-white focus:outline-none"
          >
            <option value="" disabled>Select a Project</option>
            {projects.map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>
      </section>

      {!selectedProjectId ? (
        <div className="flex flex-col items-center justify-center p-12 bg-[#101524] border border-dashed border-[#232a3f] rounded-2xl mt-6">
          <i className="fa-solid fa-folder-tree text-4xl text-slate-500 mb-4"></i>
          <h2 className="text-lg font-bold text-white mb-2">Select a Project</h2>
          <p className="text-sm text-slate-400 mb-6 text-center max-w-md">Please select a project to view its folders and files.</p>
        </div>
      ) : (
        <>
          <section className="flex flex-wrap items-center justify-between gap-3 mt-6">
            <div className="flex items-center gap-2 text-sm text-slate-300 bg-[#101420] border border-[#1b2234] px-3 py-1.5 rounded-lg">
              <button onClick={handleGoRoot} className="hover:text-white transition"><i className="fa-solid fa-home text-xs"></i></button>
              {folderHistory.map((h, i) => (
                <div key={h.id} className="flex items-center gap-2">
                  <span className="text-slate-600">/</span>
                  <span className={i === folderHistory.length - 1 ? 'text-white font-medium' : 'hover:text-white transition cursor-pointer'} onClick={() => {
                    const newHistory = folderHistory.slice(0, i + 1);
                    setFolderHistory(newHistory);
                    setCurrentFolderId(h.id);
                  }}>{h.name}</span>
                </div>
              ))}
            </div>

            {canEdit && (
              <div className="flex items-center gap-2">
                <button onClick={() => { setEditingFile(null); setFileForm({ name: '', type: 'Document', size: 1024, storagePath: '/demo/path' }); setShowFileModal(true); }} className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#151926] hover:bg-[#1c2336] text-white border border-[#232b40] text-xs font-medium transition shadow-sm">
                  <i className="fa-solid fa-file-circle-plus"></i>
                  <span>Register File</span>
                </button>
                <button onClick={() => { setEditingFolder(null); setFolderForm({ name: '' }); setShowFolderModal(true); }} className="flex items-center gap-2 px-3.5 py-1.5 rounded-lg bg-[#5922cf] hover:bg-[#682ae6] text-white border border-[#5922cf] text-xs font-medium transition shadow-sm">
                  <i className="fa-solid fa-folder-plus"></i>
                  <span>New Folder</span>
                </button>
              </div>
            )}
          </section>

          {loading ? (
            <div className="p-12 text-center text-slate-400 text-sm">Loading...</div>
          ) : (
            <>
              {folders.length > 0 && (
                <section className="space-y-3 mt-6">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <i className="fa-solid fa-folder text-slate-400"></i>
                      <h2 className="text-sm font-semibold text-white">Folders</h2>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
                    {folders.map(folder => (
                      <div key={folder.id} onClick={() => handleOpenFolder(folder)} className="group bg-[#101524] border border-[#1b2234] hover:border-[#384366] rounded-xl p-4 cursor-pointer transition flex items-center justify-between">
                        <div className="flex items-center gap-3 truncate">
                          <i className="fa-solid fa-folder text-purple-500 text-lg"></i>
                          <span className="text-sm font-medium text-slate-200 truncate">{folder.name}</span>
                        </div>
                        {canEdit && (
                          <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition">
                            <button onClick={(e) => { e.stopPropagation(); setEditingFolder(folder); setFolderForm({ name: folder.name }); setShowFolderModal(true); }} className="text-slate-500 hover:text-white"><i className="fa-solid fa-pen text-xs"></i></button>
                            {canDelete && <button onClick={(e) => handleDeleteFolder(e, folder.id)} className="text-slate-500 hover:text-red-400"><i className="fa-solid fa-trash text-xs"></i></button>}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </section>
              )}

              <section className="bg-[#111522] border border-[#1b2234] rounded-2xl overflow-hidden flex flex-col mt-6">
                <div className="p-3.5 border-b border-[#1b2234] flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <i className="fa-solid fa-file-lines text-slate-400"></i>
                    <h3 className="text-sm font-semibold text-white">Files</h3>
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs whitespace-nowrap">
                    <thead className="bg-[#0e121d] text-slate-400 uppercase font-medium text-[10px] tracking-wider border-b border-[#1b2234]">
                      <tr>
                        <th className="py-3 px-4">Name</th>
                        <th className="py-3 px-2">Type</th>
                        <th className="py-3 px-2">Size</th>
                        <th className="py-3 px-2">Last Modified</th>
                        <th className="py-3 px-2 text-right pr-4">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#182033] font-normal text-slate-300">
                      {files.length === 0 ? (
                        <tr>
                          <td colSpan="5" className="py-12 text-center">
                            <div className="flex flex-col items-center justify-center">
                              <i className="fa-regular fa-file text-4xl text-slate-500 mb-4"></i>
                              <h2 className="text-lg font-bold text-white mb-2">No files yet</h2>
                              <p className="text-sm text-slate-400 text-center max-w-md">Register your first file metadata in this folder.</p>
                            </div>
                          </td>
                        </tr>
                      ) : (
                        files.map(file => (
                          <tr key={file.id} className="hover:bg-[#151a29] transition group">
                            <td className="py-3 px-4 flex items-center gap-3">
                              <i className="fa-regular fa-file-lines text-blue-400"></i>
                              <span className="font-medium text-white">{file.name}</span>
                            </td>
                            <td className="py-3 px-2 text-slate-400">{file.type}</td>
                            <td className="py-3 px-2 text-slate-400">{formatSize(file.size)}</td>
                            <td className="py-3 px-2 text-slate-400">{new Date(file.updatedAt).toLocaleDateString()}</td>
                            <td className="py-3 px-4 text-right">
                              {canEdit && (
                                <div className="flex items-center justify-end gap-3 opacity-0 group-hover:opacity-100 transition">
                                  <button onClick={() => { setEditingFile(file); setFileForm({ name: file.name, type: file.type, size: file.size, storagePath: file.storagePath }); setShowFileModal(true); }} className="text-slate-500 hover:text-white"><i className="fa-solid fa-pen text-xs"></i></button>
                                  {canDelete && <button onClick={() => handleDeleteFile(file.id)} className="text-slate-500 hover:text-red-400"><i className="fa-solid fa-trash text-xs"></i></button>}
                                </div>
                              )}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </section>

              {folders.length === 0 && files.length === 0 && folderHistory.length > 0 && (
                 <div className="flex flex-col items-center justify-center p-12 bg-[#101524] border border-dashed border-[#232a3f] rounded-2xl mt-6">
                 <i className="fa-regular fa-folder-open text-4xl text-slate-500 mb-4"></i>
                 <h2 className="text-lg font-bold text-white mb-2">Empty Folder</h2>
                 <p className="text-sm text-slate-400 text-center max-w-md">This folder does not contain any files or subfolders.</p>
               </div>
              )}
            </>
          )}
        </>
      )}

      {/* Folder Modal */}
      {showFolderModal && (
        <div className="fixed inset-0 flex items-center justify-center z-50 bg-black/60 p-4">
          <div className="bg-[#101524] p-6 rounded-xl border border-[#192238] w-full max-w-sm">
            <h2 className="text-lg text-white font-bold mb-4">{editingFolder ? 'Rename Folder' : 'New Folder'}</h2>
            <form onSubmit={handleSaveFolder} className="flex flex-col gap-3">
              <input required value={folderForm.name} onChange={e => setFolderForm({...folderForm, name: e.target.value})} placeholder="Folder Name" className="bg-[#111728] border border-[#1e293f] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500" />
              <div className="flex justify-end gap-2 mt-2">
                <button type="button" onClick={() => setShowFolderModal(false)} className="px-4 py-2 text-slate-400 text-sm">Cancel</button>
                <button type="submit" className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm">Save</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* File Modal */}
      {showFileModal && (
        <div className="fixed inset-0 flex items-center justify-center z-50 bg-black/60 p-4">
          <div className="bg-[#101524] p-6 rounded-xl border border-[#192238] w-full max-w-sm">
            <h2 className="text-lg text-white font-bold mb-4">{editingFile ? 'Edit File Metadata' : 'Register File Metadata'}</h2>
            <form onSubmit={handleSaveFile} className="flex flex-col gap-3">
              <input required value={fileForm.name} onChange={e => setFileForm({...fileForm, name: e.target.value})} placeholder="File Name (e.g. spec.pdf)" className="bg-[#111728] border border-[#1e293f] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500" />
              {!editingFile && (
                <>
                  <input required value={fileForm.type} onChange={e => setFileForm({...fileForm, type: e.target.value})} placeholder="Type (e.g. Document, Image)" className="bg-[#111728] border border-[#1e293f] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500" />
                  <input required type="number" value={fileForm.size} onChange={e => setFileForm({...fileForm, size: parseInt(e.target.value)})} placeholder="Size in bytes" className="bg-[#111728] border border-[#1e293f] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500" />
                  <input required value={fileForm.storagePath} onChange={e => setFileForm({...fileForm, storagePath: e.target.value})} placeholder="Storage Path (/path/to/file)" className="bg-[#111728] border border-[#1e293f] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500" />
                </>
              )}
              <div className="flex justify-end gap-2 mt-2">
                <button type="button" onClick={() => setShowFileModal(false)} className="px-4 py-2 text-slate-400 text-sm">Cancel</button>
                <button type="submit" className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm">Save</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}