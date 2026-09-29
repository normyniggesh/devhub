import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { apiClient } from '../api/client';
import Avatar from '../components/common/Avatar';
import Modal from '../components/common/Modal';
import LoadingState from '../components/common/LoadingState';

export default function ProjectDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  
  const [project, setProject] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  const [isEditing, setIsEditing] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [updateError, setUpdateError] = useState(null);
  const [editForm, setEditForm] = useState(null);

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState(null);

  const [showMemberModal, setShowMemberModal] = useState(false);
  const [memberSearchQuery, setMemberSearchQuery] = useState('');
  const [memberSearchResults, setMemberSearchResults] = useState([]);
  const [isSearchingMembers, setIsSearchingMembers] = useState(false);
  const [memberRole, setMemberRole] = useState('Viewer');
  const [memberError, setMemberError] = useState(null);

  useEffect(() => {
    const fetchProject = async () => {
      try {
        setLoading(true);
        const data = await apiClient(`/projects/${id}`);
        setProject(data.project);
        setEditForm({
          name: data.project.name,
          description: data.project.description || '',
          category: data.project.category || '',
          status: data.project.status || 'Active',
          priority: data.project.priority || 'Medium',
          startDate: data.project.startDate ? data.project.startDate.split('T')[0] : '',
          dueDate: data.project.dueDate ? data.project.dueDate.split('T')[0] : ''
        });
        setError(null);
      } catch (err) {
        setError(err.message || 'Failed to fetch project details');
      } finally {
        setLoading(false);
      }
    };
    fetchProject();
  }, [id]);

  const canEdit = project && (project.currentUserRole === 'Admin' || project.currentUserRole === 'Editor');
  const canDelete = project && project.currentUserRole === 'Admin';

  const handleUpdate = async (e) => {
    e.preventDefault();
    setUpdateError(null);
    setIsUpdating(true);
    try {
      const data = await apiClient(`/projects/${id}`, {
        method: 'PATCH',
        body: {
          ...editForm,
          startDate: editForm.startDate ? new Date(editForm.startDate).toISOString() : null,
          dueDate: editForm.dueDate ? new Date(editForm.dueDate).toISOString() : null
        }
      });
      setProject({ ...project, ...data.project });
      setIsEditing(false);
    } catch (err) {
      setUpdateError(err.message || 'Failed to update project');
    } finally {
      setIsUpdating(false);
    }
  };

  const handleDelete = async () => {
    setDeleteError(null);
    setIsDeleting(true);
    try {
      await apiClient(`/projects/${id}`, { method: 'DELETE' });
      navigate('/projects');
    } catch (err) {
      setDeleteError(err.message || 'Failed to delete project');
      setIsDeleting(false);
    }
  };

  const handleSearchUsers = async (e) => {
    const q = e.target.value;
    setMemberSearchQuery(q);
    if (!q || q.trim().length < 2) {
      setMemberSearchResults([]);
      return;
    }
    try {
      setIsSearchingMembers(true);
      const data = await apiClient(`/users/search?q=${encodeURIComponent(q)}`);
      // Filter out existing members and owner
      const existingIds = new Set(project.members.map(m => m.user.id));
      existingIds.add(project.ownerId);
      setMemberSearchResults((data.users || []).filter(u => !existingIds.has(u.id)));
    } catch (err) {
      console.error(err);
    } finally {
      setIsSearchingMembers(false);
    }
  };

  const handleAddMember = async (userId) => {
    setMemberError(null);
    try {
      const data = await apiClient(`/projects/${id}/members`, {
        method: 'POST',
        body: { userId, role: memberRole }
      });
      setProject({ ...project, members: [...project.members, data.member] });
      setShowMemberModal(false);
      setMemberSearchQuery('');
      setMemberSearchResults([]);
    } catch (err) {
      setMemberError(err.message || 'Failed to add member');
    }
  };

  const handleRemoveMember = async (userId) => {
    if (!window.confirm('Are you sure you want to remove this member?')) return;
    try {
      await apiClient(`/projects/${id}/members/${userId}`, {
        method: 'DELETE'
      });
      setProject({ ...project, members: project.members.filter(m => m.user.id !== userId) });
    } catch (err) {
      alert(err.message || 'Failed to remove member');
    }
  };

  if (loading) {
    return <LoadingState message="Loading project details..." />;
  }

  if (error || !project) {
    return (
      <div className="flex flex-col items-center justify-center p-12">
        <div className="bg-red-500/10 border border-red-500/50 text-red-400 px-6 py-4 rounded-xl max-w-md text-center">
          <h2 className="font-bold mb-2">Error Loading Project</h2>
          <p className="text-sm">{error || 'Project not found'}</p>
          <Link to="/projects" className="mt-4 inline-block text-indigo-400 hover:text-indigo-300 text-sm underline">Back to Projects</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 max-w-5xl">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 text-xs text-slate-400 font-medium mb-2">
          <Link to="/projects" className="hover:text-white transition">Projects</Link>
          <span>›</span>
          <span className="text-white font-semibold">{project.name}</span>
        </div>
        
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-3">
              {project.name}
              {project.category && (
                <span className="text-xs px-2.5 py-1 rounded-full bg-[#332513] text-[#f59e0b] border border-[#523b18] font-medium">
                  {project.category}
                </span>
              )}
            </h1>
            {project.description && (
              <p className="text-sm text-slate-400 mt-2 max-w-2xl">{project.description}</p>
            )}
          </div>
          
          <div className="flex items-center gap-3">
            {canEdit && (
              <button onClick={() => setIsEditing(true)} className="px-4 py-2 bg-[#1e293b] hover:bg-[#273549] text-white rounded-lg text-sm font-medium transition flex items-center gap-2">
                <i className="fa-solid fa-pen text-xs"></i> Edit
              </button>
            )}
            {canDelete && (
              <button onClick={() => setShowDeleteConfirm(true)} className="px-4 py-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-lg text-sm font-medium transition flex items-center gap-2">
                <i className="fa-solid fa-trash text-xs"></i> Delete
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Info Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <div className="bg-[#101524] border border-[#192238] rounded-xl p-4">
          <div className="text-xs text-slate-500 mb-1">Status</div>
          <div className="text-sm font-semibold text-white">{project.status}</div>
        </div>
        <div className="bg-[#101524] border border-[#192238] rounded-xl p-4">
          <div className="text-xs text-slate-500 mb-1">Priority</div>
          <div className="text-sm font-semibold text-white">{project.priority || 'None'}</div>
        </div>
        <div className="bg-[#101524] border border-[#192238] rounded-xl p-4">
          <div className="text-xs text-slate-500 mb-1">Start Date</div>
          <div className="text-sm font-semibold text-white">{project.startDate ? new Date(project.startDate).toLocaleDateString() : 'None'}</div>
        </div>
        <div className="bg-[#101524] border border-[#192238] rounded-xl p-4">
          <div className="text-xs text-slate-500 mb-1">Due Date</div>
          <div className="text-sm font-semibold text-white">{project.dueDate ? new Date(project.dueDate).toLocaleDateString() : 'None'}</div>
        </div>
        <div className="bg-[#101524] border border-[#192238] rounded-xl p-4">
          <div className="text-xs text-slate-500 mb-1">Owner</div>
          <div className="flex items-center gap-2 mt-1">
            <Avatar user={project.owner} size="sm" className="w-5 h-5 text-[10px]" />
            <div className="text-sm font-semibold text-white truncate">{project.owner.name}</div>
          </div>
        </div>
        <div className="bg-[#101524] border border-[#192238] rounded-xl p-4">
          <div className="text-xs text-slate-500 mb-1">Your Role</div>
          <div className="text-sm font-semibold text-white">{project.currentUserRole}</div>
        </div>
      </div>

      {/* Team / Members */}
      <div className="mt-4">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-white">Team</h2>
          {canEdit && (
            <button onClick={() => setShowMemberModal(true)} className="px-3 py-1.5 bg-[#1e293b] hover:bg-[#273549] text-white rounded-lg text-xs font-medium transition flex items-center gap-2">
              <i className="fa-solid fa-user-plus text-[10px]"></i> Add Member
            </button>
          )}
        </div>
        <div className="bg-[#101524] border border-[#192238] rounded-xl overflow-hidden">
          {project.members && project.members.length > 0 ? (
            <div className="divide-y divide-[#192238]">
              {project.members.map((member) => (
                <div key={member.user.id} className="p-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Avatar user={member.user} size="md" />
                    <div>
                      <div className="text-sm font-semibold text-white">{member.user.name}</div>
                      <div className="text-xs text-slate-400">{member.user.email}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-xs px-2.5 py-1 rounded bg-[#1e293b] text-slate-300 font-medium">
                      {project.ownerId === member.user.id ? 'Owner' : member.role}
                    </div>
                    {canEdit && project.ownerId !== member.user.id && (
                      <button onClick={() => handleRemoveMember(member.user.id)} className="text-slate-500 hover:text-red-400 transition" title="Remove Member">
                        <i className="fa-solid fa-user-minus"></i>
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-6 text-center text-sm text-slate-400">No members found.</div>
          )}
        </div>
      </div>

      {/* Edit Modal */}
      {isEditing && (
        <Modal open={isEditing} onClose={() => setIsEditing(false)} className="max-w-md p-6">
          <h2 className="text-lg text-white font-bold mb-4">Edit Project</h2>
            {updateError && (
              <div className="bg-red-500/10 border border-red-500/50 text-red-400 px-3 py-2 rounded-lg mb-4 text-sm">
                {updateError}
              </div>
            )}
            <form onSubmit={handleUpdate} className="flex flex-col gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Project Name *</label>
                <input required value={editForm.name} onChange={e => setEditForm({...editForm, name: e.target.value})} className="w-full bg-[#111728] border border-[#1e293f] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Description</label>
                <textarea rows="3" value={editForm.description} onChange={e => setEditForm({...editForm, description: e.target.value})} className="w-full bg-[#111728] border border-[#1e293f] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Category</label>
                  <input value={editForm.category} onChange={e => setEditForm({...editForm, category: e.target.value})} className="w-full bg-[#111728] border border-[#1e293f] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Priority</label>
                  <select value={editForm.priority} onChange={e => setEditForm({...editForm, priority: e.target.value})} className="w-full bg-[#111728] border border-[#1e293f] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500">
                    <option value="Low">Low</option>
                    <option value="Medium">Medium</option>
                    <option value="High">High</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Status</label>
                <select value={editForm.status} onChange={e => setEditForm({...editForm, status: e.target.value})} className="w-full bg-[#111728] border border-[#1e293f] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500">
                  <option value="Active">Active</option>
                  <option value="Completed">Completed</option>
                  <option value="On Hold">On Hold</option>
                  <option value="Archived">Archived</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Start Date</label>
                  <input type="date" value={editForm.startDate} onChange={e => setEditForm({...editForm, startDate: e.target.value})} className="w-full bg-[#111728] border border-[#1e293f] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Due Date</label>
                  <input type="date" value={editForm.dueDate} onChange={e => setEditForm({...editForm, dueDate: e.target.value})} className="w-full bg-[#111728] border border-[#1e293f] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500" />
                </div>
              </div>
              <div className="flex justify-end gap-3 mt-4">
                <button type="button" disabled={isUpdating} onClick={() => setIsEditing(false)} className="px-4 py-2 text-slate-400 text-sm hover:text-white disabled:opacity-50">Cancel</button>
                <button type="submit" disabled={isUpdating} className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm transition flex items-center gap-2 disabled:opacity-50">
                  {isUpdating && <i className="fa-solid fa-spinner fa-spin"></i>}
                  {isUpdating ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
        </Modal>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <Modal open={showDeleteConfirm} onClose={() => setShowDeleteConfirm(false)} className="max-w-sm p-6">
          <h2 className="text-lg text-white font-bold mb-2">Delete Project?</h2>
          <p className="text-sm text-slate-400 mb-6">Are you sure you want to delete <span className="text-white font-semibold">"{project.name}"</span>? This action cannot be undone.</p>
            
            {deleteError && (
              <div className="bg-red-500/10 border border-red-500/50 text-red-400 px-3 py-2 rounded-lg mb-4 text-sm">
                {deleteError}
              </div>
            )}
            
            <div className="flex justify-end gap-3">
              <button type="button" disabled={isDeleting} onClick={() => setShowDeleteConfirm(false)} className="px-4 py-2 text-slate-400 text-sm hover:text-white disabled:opacity-50">Cancel</button>
              <button type="button" disabled={isDeleting} onClick={handleDelete} className="px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg text-sm transition flex items-center gap-2 disabled:opacity-50">
                {isDeleting && <i className="fa-solid fa-spinner fa-spin"></i>}
                {isDeleting ? 'Deleting...' : 'Yes, Delete'}
              </button>
            </div>
        </Modal>
      )}

      {/* Add Member Modal */}
      {showMemberModal && (
        <Modal open={showMemberModal} onClose={() => { setShowMemberModal(false); setMemberSearchQuery(''); setMemberSearchResults([]); setMemberError(null); }} className="max-w-md p-6">
          <h2 className="text-lg text-white font-bold mb-4">Add Project Member</h2>
            {memberError && (
              <div className="bg-red-500/10 border border-red-500/50 text-red-400 px-3 py-2 rounded-lg mb-4 text-sm">
                {memberError}
              </div>
            )}
            
            <div className="flex flex-col gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Search Users</label>
                <input 
                  value={memberSearchQuery} 
                  onChange={handleSearchUsers} 
                  placeholder="Type name or email..."
                  className="w-full bg-[#111728] border border-[#1e293f] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500" 
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Role</label>
                <select 
                  value={memberRole} 
                  onChange={e => setMemberRole(e.target.value)}
                  className="w-full bg-[#111728] border border-[#1e293f] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
                >
                  <option value="Viewer">Viewer</option>
                  <option value="Editor">Editor</option>
                  <option value="Admin">Admin</option>
                </select>
              </div>
              
              <div className="mt-2 max-h-48 overflow-y-auto border border-[#192238] rounded-lg bg-[#0f1422]">
                {isSearchingMembers ? (
                  <div className="p-4 text-center text-xs text-slate-500">Searching...</div>
                ) : memberSearchResults.length > 0 ? (
                  memberSearchResults.map(user => (
                    <div key={user.id} className="flex items-center justify-between p-3 border-b border-[#192238] last:border-0">
                      <div className="flex items-center gap-2">
                        <Avatar user={user} size="sm" className="w-6 h-6 text-[10px]" />
                        <div className="text-xs text-white">{user.name}</div>
                      </div>
                      <button onClick={() => handleAddMember(user.id)} className="px-2.5 py-1 bg-[#5922cf] hover:bg-[#682ae6] text-white rounded text-xs transition">
                        Add
                      </button>
                    </div>
                  ))
                ) : memberSearchQuery.length > 1 ? (
                  <div className="p-4 text-center text-xs text-slate-500">No available users found.</div>
                ) : (
                  <div className="p-4 text-center text-xs text-slate-500">Type at least 2 characters to search.</div>
                )}
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <button type="button" onClick={() => { setShowMemberModal(false); setMemberSearchQuery(''); setMemberSearchResults([]); setMemberError(null); }} className="px-4 py-2 text-slate-400 hover:text-white text-sm font-medium transition">
                Cancel
              </button>
            </div>
        </Modal>
      )}
    </div>
  );
}
