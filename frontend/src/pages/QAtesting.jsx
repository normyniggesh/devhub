import { useState, useEffect } from 'react';
import { apiClient } from '../api/client';
import { useStore } from '../store';

export default function QAtesting() {
  const { currentUser } = useStore();
  const [projects, setProjects] = useState([]);
  const [selectedProjectId, setSelectedProjectId] = useState('');
  const [activeTab, setActiveTab] = useState('Summary'); // Summary, Test Cases, Test Runs, Bugs
  
  const [loadingProjects, setLoadingProjects] = useState(true);

  useEffect(() => {
    const fetchProjects = async () => {
      try {
        const data = await apiClient('/projects');
        setProjects(data.projects || []);
      } catch (err) {
        console.error('Failed to fetch projects', err);
      } finally {
        setLoadingProjects(false);
      }
    };
    fetchProjects();
  }, []);

  return (
    <div className="flex gap-6 flex-col">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">QA / Testing</h1>
          <p className="text-xs text-slate-400 mt-0.5">Ensure everything is working perfectly.</p>
        </div>
        <div className="flex items-center gap-3">
          <select 
            value={selectedProjectId} 
            onChange={e => setSelectedProjectId(e.target.value)}
            className="bg-[#111728] border border-[#1e293f] rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none"
          >
            <option value="" disabled>Select a Project</option>
            {projects.map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>
      </div>

      {!selectedProjectId ? (
        <div className="flex flex-col items-center justify-center p-12 bg-[#101524] border border-dashed border-[#232a3f] rounded-2xl mt-4">
          <i className="fa-solid fa-folder-tree text-4xl text-slate-500 mb-4"></i>
          <h2 className="text-lg font-bold text-white mb-2">Select a Project</h2>
          <p className="text-sm text-slate-400 mb-6 text-center max-w-md">Please select a project from the dropdown to view QA metrics, test cases, and bugs.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-4 mt-2">
          <div className="flex gap-1 border-b border-[#1e293f] pb-px">
            {['Summary', 'Test Cases', 'Test Runs', 'Bugs'].map(tab => (
              <button 
                key={tab} 
                onClick={() => setActiveTab(tab)}
                className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${activeTab === tab ? 'border-indigo-500 text-white' : 'border-transparent text-slate-400 hover:text-slate-300'}`}
              >
                {tab}
              </button>
            ))}
          </div>

          <div className="pt-2">
            {activeTab === 'Summary' && <QaSummary projectId={selectedProjectId} />}
            {activeTab === 'Test Cases' && <TestCases projectId={selectedProjectId} currentUser={currentUser} projects={projects} />}
            {activeTab === 'Test Runs' && <TestRuns projectId={selectedProjectId} currentUser={currentUser} projects={projects} />}
            {activeTab === 'Bugs' && <Bugs projectId={selectedProjectId} currentUser={currentUser} projects={projects} />}
          </div>
        </div>
      )}
    </div>
  );
}

// ----------------------------------------------------------------------
// QA Summary
// ----------------------------------------------------------------------
function QaSummary({ projectId }) {
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchSummary = async () => {
      try {
        setLoading(true);
        const data = await apiClient(`/qa/summary?projectId=${projectId}`);
        setSummary(data.summary);
        setError(null);
      } catch (err) {
        setError(err.message || 'Failed to fetch summary');
      } finally {
        setLoading(false);
      }
    };
    if (projectId) fetchSummary();
  }, [projectId]);

  if (loading) return <div className="text-slate-400 text-sm p-8 text-center">Loading summary...</div>;
  if (error) return <div className="text-red-400 text-sm p-4 bg-red-400/10 rounded-lg">{error}</div>;
  if (!summary) return null;

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      <div className="bg-[#101524] border border-[#192238] rounded-xl p-4">
        <div className="text-xs text-slate-500 mb-1">Total Test Cases</div>
        <div className="text-2xl font-bold text-white">{summary.totalTestCases}</div>
      </div>
      <div className="bg-[#101524] border border-[#192238] rounded-xl p-4">
        <div className="text-xs text-slate-500 mb-1">Active Test Cases</div>
        <div className="text-2xl font-bold text-white">{summary.activeTestCases}</div>
      </div>
      <div className="bg-[#101524] border border-[#192238] rounded-xl p-4">
        <div className="text-xs text-slate-500 mb-1">Test Runs (Total/Completed)</div>
        <div className="text-2xl font-bold text-white">{summary.totalTestRuns} / {summary.completedTestRuns}</div>
      </div>
      <div className="bg-[#101524] border border-[#192238] rounded-xl p-4">
        <div className="text-xs text-slate-500 mb-1">Pass Rate</div>
        <div className="text-2xl font-bold text-emerald-400">{summary.passRate}%</div>
      </div>
      
      <div className="bg-[#101524] border border-[#192238] rounded-xl p-4">
        <div className="text-xs text-slate-500 mb-1">Passed Results</div>
        <div className="text-lg font-bold text-emerald-400">{summary.passedResults}</div>
      </div>
      <div className="bg-[#101524] border border-[#192238] rounded-xl p-4">
        <div className="text-xs text-slate-500 mb-1">Failed Results</div>
        <div className="text-lg font-bold text-red-400">{summary.failedResults}</div>
      </div>
      <div className="bg-[#101524] border border-[#192238] rounded-xl p-4">
        <div className="text-xs text-slate-500 mb-1">Open Bugs</div>
        <div className="text-lg font-bold text-amber-400">{summary.openBugs}</div>
      </div>
      <div className="bg-[#101524] border border-[#192238] rounded-xl p-4">
        <div className="text-xs text-slate-500 mb-1">Resolved Bugs</div>
        <div className="text-lg font-bold text-white">{summary.resolvedBugs}</div>
      </div>
    </div>
  );
}

// ----------------------------------------------------------------------
// Utils
// ----------------------------------------------------------------------
function getRole(projectId, projects, currentUser) {
  const project = projects.find(p => p.id === projectId);
  if (!project || !currentUser) return 'Viewer';
  if (project.owner?.id === currentUser.id) return 'Admin';
  if (project.members && project.members.length > 0) return project.members[0].role;
  return 'Viewer';
}

// ----------------------------------------------------------------------
// Test Cases
// ----------------------------------------------------------------------
function TestCases({ projectId, currentUser, projects }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  
  const [form, setForm] = useState({ title: '', description: '', module: '', status: 'Active', priority: 'Medium', expectedResult: '' });

  const role = getRole(projectId, projects, currentUser);
  const canEdit = role === 'Admin' || role === 'Editor';
  const canDelete = role === 'Admin';

  const fetchItems = async () => {
    try {
      setLoading(true);
      const data = await apiClient(`/test-cases?projectId=${projectId}`);
      setItems(data.testCases || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (projectId) fetchItems();
  }, [projectId]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editingItem) {
        await apiClient(`/test-cases/${editingItem.id}`, { method: 'PATCH', body: form });
      } else {
        await apiClient('/test-cases', { method: 'POST', body: { ...form, projectId } });
      }
      setShowModal(false);
      setEditingItem(null);
      setForm({ title: '', description: '', module: '', status: 'Active', priority: 'Medium', expectedResult: '' });
      fetchItems();
    } catch (err) {
      alert(err.message || 'Failed to save test case');
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('Are you sure?')) return;
    try {
      await apiClient(`/test-cases/${id}`, { method: 'DELETE' });
      fetchItems();
    } catch (err) {
      alert(err.message || 'Failed to delete');
    }
  };

  const openEdit = (item) => {
    setEditingItem(item);
    setForm({
      title: item.title, description: item.description || '', module: item.module || '',
      status: item.status || 'Active', priority: item.priority || 'Medium', expectedResult: item.expectedResult || ''
    });
    setShowModal(true);
  };

  if (loading) return <div className="p-8 text-center text-slate-400 text-sm">Loading test cases...</div>;

  return (
    <div className="flex flex-col gap-4">
      {canEdit && (
        <button onClick={() => { setEditingItem(null); setForm({ title: '', description: '', module: '', status: 'Active', priority: 'Medium', expectedResult: '' }); setShowModal(true); }} className="self-start px-3.5 py-1.5 bg-[#5922cf] hover:bg-[#682ae6] text-white rounded-lg text-xs font-semibold">
          New Test Case
        </button>
      )}

      {items.length === 0 ? (
        <div className="p-12 text-center bg-[#101524] border border-dashed border-[#1e293f] rounded-xl text-slate-400 text-sm">No test cases yet.</div>
      ) : (
        <div className="grid gap-3">
          {items.map(item => (
            <div key={item.id} className="bg-[#101524] border border-[#192238] rounded-xl p-4 flex justify-between items-center">
              <div>
                <div className="font-bold text-sm text-white">{item.title}</div>
                <div className="text-xs text-slate-400 mt-1">{item.module || 'No Module'} • {item.priority} • {item.status}</div>
              </div>
              <div className="flex gap-2">
                {canEdit && <button onClick={() => openEdit(item)} className="text-slate-500 hover:text-white p-2"><i className="fa-solid fa-pen text-xs"></i></button>}
                {canDelete && <button onClick={() => handleDelete(item.id)} className="text-slate-500 hover:text-red-400 p-2"><i className="fa-solid fa-trash text-xs"></i></button>}
              </div>
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 flex items-center justify-center z-50 bg-black/60 p-4">
          <div className="bg-[#101524] p-6 rounded-xl border border-[#192238] w-full max-w-md max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg text-white font-bold mb-4">{editingItem ? 'Edit Test Case' : 'New Test Case'}</h2>
            <form onSubmit={handleSubmit} className="flex flex-col gap-3">
              <input required value={form.title} onChange={e => setForm({...form, title: e.target.value})} placeholder="Title" className="bg-[#111728] border border-[#1e293f] rounded-lg px-3 py-2 text-sm text-white" />
              <textarea value={form.description} onChange={e => setForm({...form, description: e.target.value})} placeholder="Description" rows="2" className="bg-[#111728] border border-[#1e293f] rounded-lg px-3 py-2 text-sm text-white" />
              <input value={form.module} onChange={e => setForm({...form, module: e.target.value})} placeholder="Module (e.g., Auth)" className="bg-[#111728] border border-[#1e293f] rounded-lg px-3 py-2 text-sm text-white" />
              <textarea value={form.expectedResult} onChange={e => setForm({...form, expectedResult: e.target.value})} placeholder="Expected Result" rows="2" className="bg-[#111728] border border-[#1e293f] rounded-lg px-3 py-2 text-sm text-white" />
              <div className="grid grid-cols-2 gap-3">
                <select value={form.status} onChange={e => setForm({...form, status: e.target.value})} className="bg-[#111728] border border-[#1e293f] rounded-lg px-3 py-2 text-sm text-white">
                  <option>Active</option><option>Draft</option><option>Deprecated</option>
                </select>
                <select value={form.priority} onChange={e => setForm({...form, priority: e.target.value})} className="bg-[#111728] border border-[#1e293f] rounded-lg px-3 py-2 text-sm text-white">
                  <option>Low</option><option>Medium</option><option>High</option>
                </select>
              </div>
              <div className="flex justify-end gap-2 mt-2">
                <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2 text-slate-400 text-sm">Cancel</button>
                <button type="submit" className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm">Save</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

// ----------------------------------------------------------------------
// Test Runs (And their Results inside)
// ----------------------------------------------------------------------
function TestRuns({ projectId, currentUser, projects }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ name: '', status: 'Pending' });

  const role = getRole(projectId, projects, currentUser);
  const canEdit = role === 'Admin' || role === 'Editor';

  const fetchItems = async () => {
    try {
      setLoading(true);
      const data = await apiClient(`/test-runs?projectId=${projectId}`);
      setItems(data.testRuns || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (projectId) fetchItems();
  }, [projectId]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      await apiClient('/test-runs', { method: 'POST', body: { ...form, projectId } });
      setShowModal(false);
      setForm({ name: '', status: 'Pending' });
      fetchItems();
    } catch (err) {
      alert(err.message || 'Failed to create run');
    }
  };

  const handleStatusChange = async (id, newStatus) => {
    try {
      await apiClient(`/test-runs/${id}`, { method: 'PATCH', body: { status: newStatus } });
      fetchItems();
    } catch (err) {
      alert(err.message || 'Failed to update');
    }
  };

  if (loading) return <div className="p-8 text-center text-slate-400 text-sm">Loading test runs...</div>;

  return (
    <div className="flex flex-col gap-4">
      {canEdit && (
        <button onClick={() => setShowModal(true)} className="self-start px-3.5 py-1.5 bg-[#5922cf] hover:bg-[#682ae6] text-white rounded-lg text-xs font-semibold">
          New Test Run
        </button>
      )}

      {items.length === 0 ? (
        <div className="p-12 text-center bg-[#101524] border border-dashed border-[#1e293f] rounded-xl text-slate-400 text-sm">No test runs yet.</div>
      ) : (
        <div className="grid gap-4">
          {items.map(item => (
            <div key={item.id} className="bg-[#101524] border border-[#192238] rounded-xl p-4">
              <div className="flex justify-between items-center mb-3">
                <div className="font-bold text-sm text-white">{item.name}</div>
                <div className="flex items-center gap-3">
                  <select disabled={!canEdit} value={item.status} onChange={e => handleStatusChange(item.id, e.target.value)} className="bg-[#111728] border border-[#1e293f] rounded text-xs px-2 py-1 text-white disabled:opacity-50">
                    <option>Pending</option><option>Running</option><option>Completed</option>
                  </select>
                </div>
              </div>
              <div className="text-xs text-slate-400 mb-4">
                Executor: {item.executor?.name || 'Unassigned'} • Started: {item.startedAt ? new Date(item.startedAt).toLocaleDateString() : 'N/A'} • Completed: {item.completedAt ? new Date(item.completedAt).toLocaleDateString() : 'N/A'}
              </div>
              
              <TestResults testRunId={item.id} canEdit={canEdit} projectId={projectId} />
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 flex items-center justify-center z-50 bg-black/60 p-4">
          <div className="bg-[#101524] p-6 rounded-xl border border-[#192238] w-full max-w-md">
            <h2 className="text-lg text-white font-bold mb-4">New Test Run</h2>
            <form onSubmit={handleSubmit} className="flex flex-col gap-3">
              <input required value={form.name} onChange={e => setForm({...form, name: e.target.value})} placeholder="Run Name (e.g., Release 1.0)" className="bg-[#111728] border border-[#1e293f] rounded-lg px-3 py-2 text-sm text-white" />
              <div className="flex justify-end gap-2 mt-2">
                <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2 text-slate-400 text-sm">Cancel</button>
                <button type="submit" className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm">Create</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

// ----------------------------------------------------------------------
// Test Results (Nested inside Test Runs)
// ----------------------------------------------------------------------
function TestResults({ testRunId, canEdit, projectId }) {
  const [results, setResults] = useState([]);
  const [testCases, setTestCases] = useState([]);
  const [loading, setLoading] = useState(true);

  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ testCaseId: '', status: 'Pending', actualResult: '' });

  const fetchResults = async () => {
    try {
      const data = await apiClient(`/test-results?testRunId=${testRunId}`);
      setResults(data.testResults || []);
    } catch (err) {}
  };

  const fetchTestCases = async () => {
    try {
      const data = await apiClient(`/test-cases?projectId=${projectId}`);
      setTestCases(data.testCases || []);
    } catch (err) {}
  };

  useEffect(() => {
    const init = async () => {
      setLoading(true);
      await fetchResults();
      await fetchTestCases();
      setLoading(false);
    };
    init();
  }, [testRunId, projectId]);

  const handleAdd = async (e) => {
    e.preventDefault();
    try {
      await apiClient('/test-results', { method: 'POST', body: { ...form, testRunId } });
      setShowAdd(false);
      setForm({ testCaseId: '', status: 'Pending', actualResult: '' });
      fetchResults();
    } catch (err) {
      alert(err.message || 'Failed to add result');
    }
  };

  const handleUpdate = async (id, status) => {
    try {
      await apiClient(`/test-results/${id}`, { method: 'PATCH', body: { status } });
      fetchResults();
    } catch (err) {
      alert(err.message || 'Failed to update result');
    }
  };

  if (loading) return <div className="text-xs text-slate-500">Loading results...</div>;

  return (
    <div className="bg-[#0b0f19] p-3 rounded-lg border border-[#1e293f]">
      <div className="flex justify-between items-center mb-2">
        <h4 className="text-xs font-semibold text-slate-300 uppercase tracking-wider">Results</h4>
        {canEdit && (
          <button onClick={() => setShowAdd(!showAdd)} className="text-[10px] bg-[#1e293f] hover:bg-[#2d3b55] text-white px-2 py-1 rounded transition">
            {showAdd ? 'Cancel' : '+ Add Result'}
          </button>
        )}
      </div>

      {showAdd && (
        <form onSubmit={handleAdd} className="flex flex-col sm:flex-row gap-2 mb-3 bg-[#111728] p-2 rounded border border-[#1e293f]">
          <select required value={form.testCaseId} onChange={e => setForm({...form, testCaseId: e.target.value})} className="flex-1 bg-transparent text-xs text-white outline-none border border-[#1e293f] rounded px-2">
            <option value="" disabled>Select Test Case</option>
            {testCases.map(tc => <option key={tc.id} value={tc.id}>{tc.title}</option>)}
          </select>
          <select value={form.status} onChange={e => setForm({...form, status: e.target.value})} className="bg-transparent text-xs text-white outline-none border border-[#1e293f] rounded px-2">
            <option>Pending</option><option>Passed</option><option>Failed</option><option>Blocked</option><option>Skipped</option>
          </select>
          <input value={form.actualResult} onChange={e => setForm({...form, actualResult: e.target.value})} placeholder="Actual Result (opt)" className="flex-1 bg-transparent text-xs text-white outline-none border border-[#1e293f] rounded px-2 py-1" />
          <button type="submit" className="bg-indigo-600 text-white text-[10px] px-2 rounded">Save</button>
        </form>
      )}

      {results.length === 0 ? (
        <div className="text-xs text-slate-500 italic">No results logged for this run.</div>
      ) : (
        <div className="flex flex-col gap-1">
          {results.map(r => (
            <div key={r.id} className="flex justify-between items-center text-xs py-1 px-2 hover:bg-[#111728] rounded group">
              <div className="text-slate-300 truncate max-w-[50%]">{r.testCase?.title || 'Unknown Case'}</div>
              <div className="flex items-center gap-2">
                <span className="text-slate-500 truncate max-w-[150px] hidden sm:block">{r.actualResult}</span>
                <select disabled={!canEdit} value={r.status} onChange={e => handleUpdate(r.id, e.target.value)} className={`bg-transparent outline-none disabled:opacity-75 font-semibold ${r.status === 'Passed' ? 'text-emerald-400' : r.status === 'Failed' ? 'text-red-400' : r.status === 'Blocked' ? 'text-amber-400' : 'text-slate-400'}`}>
                  <option className="text-slate-900">Pending</option>
                  <option className="text-slate-900">Passed</option>
                  <option className="text-slate-900">Failed</option>
                  <option className="text-slate-900">Blocked</option>
                  <option className="text-slate-900">Skipped</option>
                </select>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ----------------------------------------------------------------------
// Bugs
// ----------------------------------------------------------------------
function Bugs({ projectId, currentUser, projects }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  
  const [form, setForm] = useState({ title: '', description: '', type: 'Bug', severity: 'Medium', status: 'Open', assigneeId: '' });
  
  const [projectMembers, setProjectMembers] = useState([]);

  const role = getRole(projectId, projects, currentUser);
  const canEdit = role === 'Admin' || role === 'Editor';
  const canDelete = role === 'Admin';

  const fetchItems = async () => {
    try {
      setLoading(true);
      const data = await apiClient(`/bugs?projectId=${projectId}`);
      setItems(data.bugs || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (projectId) {
      fetchItems();
      const loadMembers = async () => {
        try {
          const pData = await apiClient(`/projects/${projectId}`);
          let members = pData.project.members || [];
          const owner = pData.project.owner;
          if (!members.some(m => m.user.id === owner.id)) {
             members.push({ user: owner });
          }
          setProjectMembers(members);
        } catch (e) {}
      };
      loadMembers();
    }
  }, [projectId]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const payload = { ...form, assigneeId: form.assigneeId || null };
      if (editingItem) {
        await apiClient(`/bugs/${editingItem.id}`, { method: 'PATCH', body: payload });
      } else {
        await apiClient('/bugs', { method: 'POST', body: { ...payload, projectId } });
      }
      setShowModal(false);
      setEditingItem(null);
      setForm({ title: '', description: '', type: 'Bug', severity: 'Medium', status: 'Open', assigneeId: '' });
      fetchItems();
    } catch (err) {
      alert(err.message || 'Failed to save bug');
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('Are you sure?')) return;
    try {
      await apiClient(`/bugs/${id}`, { method: 'DELETE' });
      fetchItems();
    } catch (err) {
      alert(err.message || 'Failed to delete');
    }
  };

  const openEdit = (item) => {
    setEditingItem(item);
    setForm({
      title: item.title, description: item.description || '', type: item.type || 'Bug',
      severity: item.severity || 'Medium', status: item.status || 'Open', assigneeId: item.assignee?.id || ''
    });
    setShowModal(true);
  };

  if (loading) return <div className="p-8 text-center text-slate-400 text-sm">Loading bugs...</div>;

  return (
    <div className="flex flex-col gap-4">
      {canEdit && (
        <button onClick={() => { setEditingItem(null); setForm({ title: '', description: '', type: 'Bug', severity: 'Medium', status: 'Open', assigneeId: '' }); setShowModal(true); }} className="self-start px-3.5 py-1.5 bg-[#5922cf] hover:bg-[#682ae6] text-white rounded-lg text-xs font-semibold">
          Report Bug
        </button>
      )}

      {items.length === 0 ? (
        <div className="p-12 text-center bg-[#101524] border border-dashed border-[#1e293f] rounded-xl text-slate-400 text-sm">No bugs reported.</div>
      ) : (
        <div className="grid gap-3">
          {items.map(item => (
            <div key={item.id} className="bg-[#101524] border border-[#192238] rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <div className="font-bold text-sm text-white mb-1">{item.title}</div>
                <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400 mt-2">
                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${item.severity === 'High' || item.severity === 'Critical' ? 'bg-red-400/10 text-red-400 border border-red-400/20' : 'bg-[#1e293f] border border-[#2d3b55] text-white'}`}>{item.severity}</span>
                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${item.status === 'Resolved' || item.status === 'Closed' || item.status === 'Done' ? 'bg-emerald-400/10 text-emerald-400 border border-emerald-400/20' : 'bg-amber-400/10 text-amber-400 border border-amber-400/20'}`}>{item.status}</span>
                  <span>• {item.type}</span>
                  {item.assignee && <span>• Assigned: {item.assignee.name}</span>}
                </div>
              </div>
              <div className="flex gap-2">
                {canEdit && <button onClick={() => openEdit(item)} className="text-slate-500 hover:text-white p-2"><i className="fa-solid fa-pen text-xs"></i></button>}
                {canDelete && <button onClick={() => handleDelete(item.id)} className="text-slate-500 hover:text-red-400 p-2"><i className="fa-solid fa-trash text-xs"></i></button>}
              </div>
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 flex items-center justify-center z-50 bg-black/60 p-4">
          <div className="bg-[#101524] p-6 rounded-xl border border-[#192238] w-full max-w-md max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg text-white font-bold mb-4">{editingItem ? 'Edit Bug' : 'Report Bug'}</h2>
            <form onSubmit={handleSubmit} className="flex flex-col gap-3">
              <input required value={form.title} onChange={e => setForm({...form, title: e.target.value})} placeholder="Bug Title" className="bg-[#111728] border border-[#1e293f] rounded-lg px-3 py-2 text-sm text-white" />
              <textarea value={form.description} onChange={e => setForm({...form, description: e.target.value})} placeholder="Steps to reproduce, etc." rows="3" className="bg-[#111728] border border-[#1e293f] rounded-lg px-3 py-2 text-sm text-white" />
              
              <div className="grid grid-cols-2 gap-3">
                <select value={form.type} onChange={e => setForm({...form, type: e.target.value})} className="bg-[#111728] border border-[#1e293f] rounded-lg px-3 py-2 text-sm text-white">
                  <option>Bug</option><option>UI Issue</option><option>Performance</option>
                </select>
                <select value={form.severity} onChange={e => setForm({...form, severity: e.target.value})} className="bg-[#111728] border border-[#1e293f] rounded-lg px-3 py-2 text-sm text-white">
                  <option>Low</option><option>Medium</option><option>High</option><option>Critical</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <select value={form.status} onChange={e => setForm({...form, status: e.target.value})} className="bg-[#111728] border border-[#1e293f] rounded-lg px-3 py-2 text-sm text-white">
                  <option>Open</option><option>In Progress</option><option>Resolved</option><option>Closed</option>
                </select>
                <select value={form.assigneeId} onChange={e => setForm({...form, assigneeId: e.target.value})} className="bg-[#111728] border border-[#1e293f] rounded-lg px-3 py-2 text-sm text-white">
                  <option value="">Unassigned</option>
                  {projectMembers.map(m => <option key={m.user.id} value={m.user.id}>{m.user.name}</option>)}
                </select>
              </div>

              <div className="flex justify-end gap-2 mt-2">
                <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2 text-slate-400 text-sm">Cancel</button>
                <button type="submit" className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm">Save</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}