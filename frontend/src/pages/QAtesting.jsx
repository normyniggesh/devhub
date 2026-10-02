import { useState, useEffect } from 'react';
import { apiClient } from '../api/client';
import { useStore } from '../store';
import Tabs from '../components/common/Tabs';
import Avatar from '../components/common/Avatar';
import ActivityFeed from '../components/activity/ActivityFeed';

// Unified QA Components
import TestCard from '../components/qa/TestCard';
import TestCaseModal from '../components/qa/TestCaseModal';
import TestResultModal from '../components/qa/TestResultModal';
import BugModal from '../components/qa/BugModal';
import QASummary from '../components/qa/QASummary';
import QAReports from '../components/qa/QAReports';
import TestStatusBadge from '../components/qa/TestStatusBadge';

export default function QAtesting() {
  const { currentUser } = useStore();
  const [projects, setProjects] = useState([]);
  const [selectedProjectId, setSelectedProjectId] = useState('');
  const [activeTab, setActiveTab] = useState('Overview');
  const [recentActivity, setRecentActivity] = useState([]);
  const [loadingProjects, setLoadingProjects] = useState(true);
  const [projectMembers, setProjectMembers] = useState([]);

  // Data states for Tests & Bugs
  const [testCases, setTestCases] = useState([]);
  const [bugs, setBugs] = useState([]);
  const [loadingTests, setLoadingTests] = useState(false);
  const [loadingBugs, setLoadingBugs] = useState(false);

  // Filters & Search
  const [searchQuery, setSearchQuery] = useState('');
  const [testFilter, setTestFilter] = useState('All');
  const [bugFilter, setBugFilter] = useState('All');

  // Modals
  const [showNewDropdown, setShowNewDropdown] = useState(false);
  const [showTestCaseModal, setShowTestCaseModal] = useState(false);
  const [editingTestCase, setEditingTestCase] = useState(null);

  const [showResultModal, setShowResultModal] = useState(false);
  const [testingTestCase, setTestingTestCase] = useState(null);

  const [showBugModal, setShowBugModal] = useState(false);
  const [editingBug, setEditingBug] = useState(null);
  const [bugInitialData, setBugInitialData] = useState(null);

  // Initial Fetch: Projects & Activity
  useEffect(() => {
    const fetchInitData = async () => {
      try {
        setLoadingProjects(true);
        const [projData, dashData] = await Promise.all([
          apiClient('/projects'),
          apiClient('/dashboard').catch(() => ({ dashboard: { recentActivity: [] } }))
        ]);
        const list = projData.projects || [];
        setProjects(list);
        if (list.length > 0 && !selectedProjectId) {
          setSelectedProjectId(list[0].id);
        }

        const allAct = dashData.dashboard?.recentActivity || [];
        setRecentActivity(allAct.filter(a => ['TestCase', 'TestRun', 'TestResult', 'Bug'].includes(a.entityType)));
      } catch (err) {
        console.error('Failed to fetch initial QA data', err);
      } finally {
        setLoadingProjects(false);
      }
    };
    fetchInitData();
  }, []);

  // Fetch project-specific data (Test Cases, Bugs, Project Members)
  const fetchProjectData = async (projId) => {
    if (!projId) return;
    try {
      setLoadingTests(true);
      setLoadingBugs(true);

      const [tcData, bugData, pDetails] = await Promise.all([
        apiClient(`/test-cases?projectId=${projId}`).catch(() => ({ testCases: [] })),
        apiClient(`/bugs?projectId=${projId}`).catch(() => ({ bugs: [] })),
        apiClient(`/projects/${projId}`).catch(() => ({ project: {} }))
      ]);

      setTestCases(tcData.testCases || []);
      setBugs(bugData.bugs || []);

      // Extract members
      let members = pDetails.project?.members || [];
      const owner = pDetails.project?.owner;
      if (owner && !members.some(m => (m.userId === owner.id || m.user?.id === owner.id))) {
        members = [{ user: owner, role: 'Admin' }, ...members];
      }
      setProjectMembers(members);
    } catch (err) {
      console.error('Failed to load project QA data', err);
    } finally {
      setLoadingTests(false);
      setLoadingBugs(false);
    }
  };

  useEffect(() => {
    if (selectedProjectId) {
      fetchProjectData(selectedProjectId);
    } else {
      setTestCases([]);
      setBugs([]);
      setProjectMembers([]);
    }
  }, [selectedProjectId]);

  // Determine user permissions
  const role = getRole(selectedProjectId, projects, currentUser);
  const canEdit = role === 'Admin' || role === 'Editor';
  const canDelete = role === 'Admin';

  // ----------------------------------------------------
  // Handler Actions
  // ----------------------------------------------------

  // 1. Claim Test Case ([Take Test])
  const handleClaimTest = async (tc) => {
    try {
      const res = await apiClient(`/test-cases/${tc.id}/claim`, { method: 'POST' });
      const updated = res.testCase;
      setTestCases(prev => prev.map(item => item.id === tc.id ? { ...item, ...updated } : item));
      return updated;
    } catch (err) {
      alert(err.message || 'Failed to claim test case');
      throw err;
    }
  };

  // 2. Release Test Case ([Unselect / Release Test])
  const handleReleaseTest = async (tc) => {
    try {
      const res = await apiClient(`/test-cases/${tc.id}/release`, { method: 'POST' });
      const updated = res.testCase;
      setTestCases(prev => prev.map(item => item.id === tc.id ? { ...item, ...updated, testerId: null, tester: null } : item));
      return updated;
    } catch (err) {
      alert(err.message || 'Failed to release test case');
      throw err;
    }
  };

  // 3. Open Result Modal ([Test / Update Status])
  const handleOpenResultModal = (tc) => {
    setTestingTestCase(tc);
    setShowResultModal(true);
  };

  // 4. Save Test Result & Status
  const handleSaveResult = async (testCaseId, { status, description }) => {
    const res = await apiClient(`/test-cases/${testCaseId}/result`, {
      method: 'POST',
      body: { status, description }
    });
    const updated = res.testCase;
    const newResult = res.testResult;
    setTestCases(prev => prev.map(tc => {
      if (tc.id === testCaseId) {
        const existingResults = tc.results || [];
        return {
          ...tc,
          ...updated,
          results: newResult ? [newResult, ...existingResults] : existingResults
        };
      }
      return tc;
    }));
    return res;
  };

  // 5. Create Bug from Failed or Blocked Test Case
  const handleCreateBugFromTest = (tc, resultInfo) => {
    setEditingBug(null);
    const testerName = tc.tester?.name || currentUser?.name || 'Tester';
    setBugInitialData({
      testCaseId: tc.id,
      testCaseTitle: tc.title,
      title: `[Bug] ${tc.title}`,
      description: `Test Case: ${tc.title}\nTester: ${testerName}\nDate: ${new Date().toLocaleDateString()}\n\nExpected Result: ${tc.expectedResult || 'N/A'}\nActual Result: ${resultInfo?.actualResult || tc.actualResult || 'N/A'}`,
      expectedResult: tc.expectedResult || '',
      actualResult: resultInfo?.actualResult || tc.actualResult || '',
      assigneeId: tc.assigneeId || ''
    });
    setShowBugModal(true);
  };

  // 6. Save Bug (Create / Update)
  const handleBugSaved = (savedBug) => {
    setBugs(prev => {
      const idx = prev.findIndex(b => b.id === savedBug.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = savedBug;
        return next;
      }
      return [savedBug, ...prev];
    });

    // Also update linked bugs inside the test cases
    if (savedBug.testCaseId) {
      setTestCases(prev => prev.map(tc => {
        if (tc.id === savedBug.testCaseId) {
          const existingBugs = tc.bugs || [];
          const bIdx = existingBugs.findIndex(b => b.id === savedBug.id);
          const nextBugs = bIdx >= 0
            ? existingBugs.map(b => b.id === savedBug.id ? savedBug : b)
            : [savedBug, ...existingBugs];
          return { ...tc, bugs: nextBugs };
        }
        return tc;
      }));
    }
  };

  // 7. Update Bug Status directly
  const handleUpdateBugStatus = async (bugId, newStatus) => {
    try {
      const res = await apiClient(`/bugs/${bugId}`, {
        method: 'PATCH',
        body: { status: newStatus }
      });
      handleBugSaved(res.bug);
    } catch (err) {
      alert(err.message || 'Failed to update bug status');
    }
  };

  // 8. Delete Bug
  const handleDeleteBug = async (bugId) => {
    if (!window.confirm('Are you sure you want to delete this bug?')) return;
    try {
      await apiClient(`/bugs/${bugId}`, { method: 'DELETE' });
      setBugs(prev => prev.filter(b => b.id !== bugId));
      setTestCases(prev => prev.map(tc => ({
        ...tc,
        bugs: (tc.bugs || []).filter(b => b.id !== bugId)
      })));
    } catch (err) {
      alert(err.message || 'Failed to delete bug');
    }
  };

  // 9. Delete Test Case
  const handleDeleteTest = async (tcId) => {
    if (!window.confirm('Are you sure you want to delete this test case?')) return;
    try {
      await apiClient(`/test-cases/${tcId}`, { method: 'DELETE' });
      setTestCases(prev => prev.filter(tc => tc.id !== tcId));
    } catch (err) {
      alert(err.message || 'Failed to delete test case');
    }
  };

  // 10. Save Test Case (Create / Edit)
  const handleTestSaved = (savedTest) => {
    setTestCases(prev => {
      const idx = prev.findIndex(t => t.id === savedTest.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = { ...next[idx], ...savedTest };
        return next;
      }
      return [{ ...savedTest, results: [], bugs: [] }, ...prev];
    });
  };

  // Filtered test cases
  const filteredTests = testCases.filter(tc => {
    let matchesFilter = true;
    if (testFilter === 'Available') {
      matchesFilter = !tc.testerId;
    } else if (testFilter === 'Taken') {
      matchesFilter = Boolean(tc.testerId);
    } else if (testFilter === 'Not Tested') {
      matchesFilter = !tc.status || tc.status === 'Not Tested' || tc.status === 'Draft' || tc.status === 'Pending';
    } else if (testFilter !== 'All') {
      matchesFilter = tc.status === testFilter;
    }

    const matchesSearch = searchQuery.trim() === '' ||
      tc.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (tc.module && tc.module.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (tc.description && tc.description.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (tc.tester?.name && tc.tester.name.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (tc.assignee?.name && tc.assignee.name.toLowerCase().includes(searchQuery.toLowerCase()));

    return matchesFilter && matchesSearch;
  });

  // Filtered bugs
  const filteredBugs = bugs.filter(b => {
    const matchesFilter =
      bugFilter === 'All' ? true :
      b.status === bugFilter;

    const matchesSearch = searchQuery.trim() === '' ||
      b.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (b.description && b.description.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (b.assignee?.name && b.assignee.name.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (b.testCase?.title && b.testCase.title.toLowerCase().includes(searchQuery.toLowerCase()));

    return matchesFilter && matchesSearch;
  });

  // Tests claimed by current user for sidebar
  const myClaimedTests = testCases.filter(t => t.testerId === currentUser?.id || t.tester?.id === currentUser?.id);

  return (
    <div className="flex flex-col xl:flex-row gap-6 max-w-[1920px] mx-auto pb-12 min-h-screen">
      {/* Main Content Area */}
      <div className="flex-1 min-w-0 flex flex-col gap-6">
        
        {/* Top Header / Search */}
        <div className="flex items-center justify-between gap-4 bg-[#0f1422] border border-[#192238] rounded-2xl p-3 px-4 shadow-sm">
          <div className="relative flex-1 max-w-xl">
            <i className="fa-solid fa-magnifying-glass absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 text-sm"></i>
            <input
              type="text"
              placeholder="Search tests, bugs, modules, testers..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-[#161d2f] border border-[#1f2a44] rounded-xl pl-10 pr-10 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-purple-500 transition shadow-inner"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
              >
                <i className="fa-solid fa-xmark text-xs"></i>
              </button>
            )}
          </div>
          <div className="flex items-center gap-3">
            <Avatar user={currentUser} size="md" shape="square" />
          </div>
        </div>

        {/* Hero Section */}
        <div className="relative rounded-2xl p-8 bg-[#0f1422] border border-[#192238] overflow-hidden flex flex-col sm:flex-row justify-between items-start sm:items-center gap-6 shadow-sm">
          <div className="absolute right-0 top-0 bottom-0 w-1/2 opacity-30 pointer-events-none bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-purple-600/30 via-[#0f1422]/10 to-transparent"></div>
          <div className="z-10">
            <div className="flex items-center gap-2 text-[10px] font-bold tracking-wider text-slate-400 mb-2 uppercase">
              <span>QA / Testing</span>
              <span className="text-slate-600">›</span>
              <span className="text-purple-400">
                {projects.find(p => p.id === selectedProjectId)?.name || 'Select a Project'}
              </span>
            </div>
            <h1 className="text-3xl font-extrabold text-white tracking-tight mb-2 flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-purple-800 flex items-center justify-center shadow-lg shadow-purple-900/50 shrink-0">
                <i className="fa-solid fa-vial-circle-check text-white text-lg"></i>
              </div>
              QA & Testing
            </h1>
            <p className="text-sm text-slate-400">Direct test claiming, execution history, and connected bug management.</p>
          </div>

          {/* Project Selector & "+ New" Dropdown */}
          <div className="z-10 flex flex-col sm:flex-row items-center gap-3 w-full sm:w-auto">
            <div className="relative w-full sm:w-auto">
              <select
                value={selectedProjectId}
                onChange={e => setSelectedProjectId(e.target.value)}
                className="w-full appearance-none bg-[#161d2f] border border-[#1f2a44] rounded-xl pl-4 pr-10 py-2.5 text-sm font-bold text-white focus:outline-none focus:border-purple-500 transition shadow-inner cursor-pointer"
              >
                <option value="" disabled>Select a Project</option>
                {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              <i className="fa-solid fa-chevron-down absolute right-4 top-1/2 -translate-y-1/2 text-[10px] text-slate-500 pointer-events-none"></i>
            </div>

            {/* "+ New" Dropdown Button */}
            <div className="relative w-full sm:w-auto">
              <button
                type="button"
                onClick={() => setShowNewDropdown(!showNewDropdown)}
                className="w-full sm:w-auto px-5 py-2.5 bg-[#5922cf] hover:bg-[#682ae6] text-white rounded-xl text-sm font-bold shadow-lg shadow-purple-900/30 transition flex items-center justify-center gap-2"
              >
                <i className="fa-solid fa-plus text-xs"></i>
                <span>New</span>
                <i className="fa-solid fa-chevron-down text-[10px] ml-1 opacity-70"></i>
              </button>

              {showNewDropdown && (
                <div
                  className="absolute right-0 mt-2 w-48 bg-[#141b2d] border border-[#1f2a44] rounded-xl shadow-2xl py-1.5 z-50 text-xs font-semibold"
                  onMouseLeave={() => setShowNewDropdown(false)}
                >
                  <button
                    type="button"
                    onClick={() => {
                      setShowNewDropdown(false);
                      setEditingTestCase(null);
                      setShowTestCaseModal(true);
                    }}
                    className="w-full text-left px-4 py-2.5 text-slate-200 hover:text-white hover:bg-purple-600/20 flex items-center gap-2.5 transition"
                  >
                    <i className="fa-solid fa-vial text-purple-400 text-xs"></i>
                    <span>New Test</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowNewDropdown(false);
                      setEditingBug(null);
                      setBugInitialData(null);
                      setShowBugModal(true);
                    }}
                    className="w-full text-left px-4 py-2.5 text-slate-200 hover:text-white hover:bg-rose-600/20 flex items-center gap-2.5 transition"
                  >
                    <i className="fa-solid fa-bug text-rose-400 text-xs"></i>
                    <span>New Bug</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* 4 Clean Connected QA Tabs: Overview | Tests | Issues/Bugs | Reports */}
        <Tabs
          tabs={[
            { id: 'Overview', label: 'Overview' },
            { id: 'Tests', label: `Tests (${testCases.length})` },
            { id: 'Issues/Bugs', label: `Issues/Bugs (${bugs.length})` },
            { id: 'Reports', label: 'Reports' }
          ]}
          activeTab={activeTab}
          onChange={setActiveTab}
        />

        {/* Tab Content */}
        {!selectedProjectId ? (
          <div className="flex flex-col items-center justify-center p-20 bg-[#0f1422] border border-dashed border-[#1f2a44] rounded-2xl flex-1 shadow-sm">
            <i className="fa-solid fa-vial-circle-check text-5xl text-slate-600 mb-6 opacity-50"></i>
            <h2 className="text-xl font-bold text-white mb-2">No Project Selected</h2>
            <p className="text-sm text-slate-400 max-w-sm text-center">
              Select a project from the dropdown above to view QA metrics, available tests, and linked bugs.
            </p>
          </div>
        ) : (
          <div className="flex-1 flex flex-col gap-6">
            
            {/* 1. OVERVIEW TAB: Simplified layout with status cards + Available/Taken sections */}
            {activeTab === 'Overview' && (
              <QASummary
                projectId={selectedProjectId}
                testCases={testCases}
                bugs={bugs}
                currentUser={currentUser}
                onNavigateTab={setActiveTab}
                onClaimTest={handleClaimTest}
                onReleaseTest={handleReleaseTest}
                onUpdateResult={handleOpenResultModal}
                onCreateBug={handleCreateBugFromTest}
                onViewBug={(bug) => {
                  setEditingBug(bug);
                  setBugInitialData(null);
                  setShowBugModal(true);
                }}
                onEditTest={(test) => {
                  setEditingTestCase(test);
                  setShowTestCaseModal(true);
                }}
                onDeleteTest={handleDeleteTest}
              />
            )}

            {/* 2. TESTS TAB */}
            {activeTab === 'Tests' && (
              <div className="flex flex-col gap-5">
                {/* Header Controls: Filters & New Test */}
                <div className="bg-[#0f1422] border border-[#192238] rounded-2xl p-4 flex flex-col md:flex-row items-center justify-between gap-4">
                  {/* Status Filters */}
                  <div className="flex items-center gap-1.5 overflow-x-auto w-full md:w-auto pb-1 md:pb-0">
                    {['All', 'Available', 'Taken', 'Not Tested', 'Passed', 'Failed', 'Blocked'].map(tab => (
                      <button
                        key={tab}
                        type="button"
                        onClick={() => setTestFilter(tab)}
                        className={`px-3 py-1.5 rounded-xl text-xs font-bold transition ${
                          testFilter === tab
                            ? 'bg-purple-600 text-white shadow-md shadow-purple-950/40'
                            : 'bg-[#161d2f] text-slate-400 hover:text-white border border-[#1f2a44]'
                        }`}
                      >
                        {tab}
                      </button>
                    ))}
                  </div>

                  {/* Actions */}
                  {canEdit && (
                    <button
                      type="button"
                      onClick={() => {
                        setEditingTestCase(null);
                        setShowTestCaseModal(true);
                      }}
                      className="px-4 py-2 bg-[#5922cf] hover:bg-[#682ae6] text-white rounded-xl text-xs font-bold shadow-lg shadow-purple-900/30 transition flex items-center gap-2 shrink-0 self-end md:self-auto"
                    >
                      <i className="fa-solid fa-plus text-[10px]"></i>
                      <span>New Test</span>
                    </button>
                  )}
                </div>

                {/* Tests List */}
                {loadingTests ? (
                  <div className="p-20 text-center flex items-center justify-center">
                    <i className="fa-solid fa-circle-notch fa-spin text-3xl text-purple-500"></i>
                  </div>
                ) : filteredTests.length === 0 ? (
                  <div className="flex flex-col items-center justify-center p-20 bg-[#0f1422] border border-dashed border-[#1f2a44] rounded-2xl text-center">
                    <i className="fa-solid fa-vial-circle-check text-4xl text-slate-600 mb-4 opacity-50"></i>
                    <h3 className="text-base font-bold text-white mb-1">No tests found</h3>
                    <p className="text-xs text-slate-400 max-w-sm mb-4">
                      {searchQuery || testFilter !== 'All'
                        ? 'No tests match your current search or status filter.'
                        : 'Create your first test case to begin claiming and testing features.'}
                    </p>
                    {canEdit && (
                      <button
                        type="button"
                        onClick={() => {
                          setEditingTestCase(null);
                          setShowTestCaseModal(true);
                        }}
                        className="px-4 py-2 bg-[#5922cf] hover:bg-[#682ae6] text-white rounded-xl text-xs font-bold shadow-lg shadow-purple-900/30 transition flex items-center gap-2"
                      >
                        <i className="fa-solid fa-plus"></i>
                        <span>Create Test</span>
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-4">
                    {filteredTests.map(tc => (
                      <TestCard
                        key={tc.id}
                        testCase={tc}
                        currentUser={currentUser}
                        canEdit={canEdit}
                        canTest={true}
                        onClaimTest={handleClaimTest}
                        onReleaseTest={handleReleaseTest}
                        onUpdateResult={handleOpenResultModal}
                        onEditTest={(test) => {
                          setEditingTestCase(test);
                          setShowTestCaseModal(true);
                        }}
                        onDeleteTest={handleDeleteTest}
                        onCreateBug={handleCreateBugFromTest}
                        onViewBug={(bug) => {
                          setEditingBug(bug);
                          setBugInitialData(null);
                          setShowBugModal(true);
                        }}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* 3. ISSUES / BUGS TAB */}
            {activeTab === 'Issues/Bugs' && (
              <div className="flex flex-col gap-5">
                {/* Header Controls */}
                <div className="bg-[#0f1422] border border-[#192238] rounded-2xl p-4 flex flex-col md:flex-row items-center justify-between gap-4">
                  {/* Status Filters */}
                  <div className="flex items-center gap-1.5 overflow-x-auto w-full md:w-auto pb-1 md:pb-0">
                    {['All', 'Open', 'In Progress', 'Resolved', 'Closed'].map(tab => (
                      <button
                        key={tab}
                        type="button"
                        onClick={() => setBugFilter(tab)}
                        className={`px-3 py-1.5 rounded-xl text-xs font-bold transition ${
                          bugFilter === tab
                            ? 'bg-rose-600 text-white shadow-md shadow-rose-950/40'
                            : 'bg-[#161d2f] text-slate-400 hover:text-white border border-[#1f2a44]'
                        }`}
                      >
                        {tab}
                      </button>
                    ))}
                  </div>

                  {/* Actions */}
                  {canEdit && (
                    <button
                      type="button"
                      onClick={() => {
                        setEditingBug(null);
                        setBugInitialData(null);
                        setShowBugModal(true);
                      }}
                      className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-xs font-bold shadow-lg shadow-rose-900/30 transition flex items-center gap-2 shrink-0 self-end md:self-auto"
                    >
                      <i className="fa-solid fa-plus text-[10px]"></i>
                      <span>Report Bug</span>
                    </button>
                  )}
                </div>

                {/* Bugs List */}
                {loadingBugs ? (
                  <div className="p-20 text-center flex items-center justify-center">
                    <i className="fa-solid fa-circle-notch fa-spin text-3xl text-rose-500"></i>
                  </div>
                ) : filteredBugs.length === 0 ? (
                  <div className="flex flex-col items-center justify-center p-20 bg-[#0f1422] border border-dashed border-[#1f2a44] rounded-2xl text-center">
                    <i className="fa-solid fa-bug-slash text-4xl text-slate-600 mb-4 opacity-50"></i>
                    <h3 className="text-base font-bold text-white mb-1">No bugs reported</h3>
                    <p className="text-xs text-slate-400 max-w-sm mb-4">
                      {searchQuery || bugFilter !== 'All'
                        ? 'No bugs match your current search or status filter.'
                        : 'All tests are healthy and no defects have been filed.'}
                    </p>
                    {canEdit && (
                      <button
                        type="button"
                        onClick={() => {
                          setEditingBug(null);
                          setBugInitialData(null);
                          setShowBugModal(true);
                        }}
                        className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-xs font-bold shadow-lg shadow-rose-900/30 transition flex items-center gap-2"
                      >
                        <i className="fa-solid fa-plus"></i>
                        <span>Report Bug</span>
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-4">
                    {filteredBugs.map(b => (
                      <div
                        key={b.id}
                        className="bg-[#0f1422] border border-[#192238] hover:border-[#2a3652] rounded-2xl p-5 shadow-sm transition flex flex-col gap-4"
                      >
                        {/* Top: Title, ID, Priority, Status Dropdown, Actions */}
                        <div className="flex items-center justify-between gap-3 flex-wrap">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-[11px] font-bold text-slate-500 bg-[#161d2f] px-2 py-0.5 rounded-md border border-[#1f2a44]">
                              BUG-{b.id.substring(0, 6).toUpperCase()}
                            </span>
                            <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md border ${
                              b.severity === 'Critical' || b.severity === 'High'
                                ? 'bg-rose-500/10 text-rose-400 border-rose-500/20'
                                : b.severity === 'Low'
                                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                                : 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                            }`}>
                              {b.severity || 'Medium'}
                            </span>
                          </div>

                          <div className="flex items-center gap-3">
                            {/* Status Selector dropdown */}
                            <select
                              disabled={!canEdit}
                              value={b.status}
                              onChange={e => handleUpdateBugStatus(b.id, e.target.value)}
                              className={`text-xs font-bold px-3 py-1 rounded-xl border transition cursor-pointer focus:outline-none ${
                                b.status === 'Resolved' || b.status === 'Closed'
                                  ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                                  : b.status === 'In Progress'
                                  ? 'bg-purple-500/10 text-purple-400 border-purple-500/30'
                                  : 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                              }`}
                            >
                              <option value="Open" className="bg-[#141b2d] text-slate-200">Open</option>
                              <option value="In Progress" className="bg-[#141b2d] text-slate-200">In Progress</option>
                              <option value="Resolved" className="bg-[#141b2d] text-slate-200">Resolved</option>
                              <option value="Closed" className="bg-[#141b2d] text-slate-200">Closed</option>
                            </select>

                            {/* Edit / Delete */}
                            {canEdit && (
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingBug(b);
                                  setBugInitialData(null);
                                  setShowBugModal(true);
                                }}
                                className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-white hover:bg-[#161d2f] transition"
                                title="Edit Bug"
                              >
                                <i className="fa-solid fa-pen text-xs"></i>
                              </button>
                            )}
                            {canDelete && (
                              <button
                                type="button"
                                onClick={() => handleDeleteBug(b.id)}
                                className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition"
                                title="Delete Bug"
                              >
                                <i className="fa-solid fa-trash text-xs"></i>
                              </button>
                            )}
                          </div>
                        </div>

                        {/* Title & Description */}
                        <div>
                          <h3 className="text-base font-bold text-white leading-snug mb-1">
                            {b.title}
                          </h3>
                          {b.description && (
                            <p className="text-xs text-slate-400 leading-relaxed whitespace-pre-line">
                              {b.description}
                            </p>
                          )}
                        </div>

                        {/* Linked Test Box */}
                        {b.testCase && (
                          <div className="flex items-center justify-between p-3 bg-purple-500/10 border border-purple-500/20 rounded-xl text-xs text-purple-300">
                            <div className="flex items-center gap-2">
                              <i className="fa-solid fa-link text-purple-400"></i>
                              <span>
                                Linked to Test: <strong>{b.testCase.title}</strong>
                              </span>
                            </div>
                            <button
                              type="button"
                              onClick={() => {
                                setActiveTab('Tests');
                                setSearchQuery(b.testCase.title);
                              }}
                              className="text-[11px] font-bold text-purple-400 hover:text-purple-200 underline"
                            >
                              View Test →
                            </button>
                          </div>
                        )}

                        {/* Expected vs Actual Result Preview if available */}
                        {(b.expectedResult || b.actualResult) && (
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 bg-[#161d2f]/70 border border-[#1f2a44] rounded-xl p-3.5 text-xs">
                            <div>
                              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                                Expected Result
                              </span>
                              <p className="text-slate-200 font-medium">
                                {b.expectedResult || 'N/A'}
                              </p>
                            </div>
                            <div>
                              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                                Actual Result
                              </span>
                              <p className="text-rose-400 font-medium">
                                {b.actualResult || 'N/A'}
                              </p>
                            </div>
                          </div>
                        )}

                        {/* Footer: Assignee & Date */}
                        <div className="flex items-center justify-between pt-2 border-t border-[#192238] text-xs text-slate-500 flex-wrap gap-2">
                          <div className="flex items-center gap-2">
                            <span>Assignee:</span>
                            {b.assignee ? (
                              <div className="flex items-center gap-1.5 text-slate-300 font-medium">
                                <Avatar user={b.assignee} size="xs" />
                                <span>{b.assignee.name}</span>
                              </div>
                            ) : (
                              <span className="italic">Unassigned</span>
                            )}
                          </div>

                          <div className="flex items-center gap-3 text-[11px]">
                            {b.reporter && (
                              <span>Reported by: <strong className="text-slate-400">{b.reporter.name}</strong></span>
                            )}
                            <span>{new Date(b.createdAt).toLocaleDateString()}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* 4. REPORTS TAB */}
            {activeTab === 'Reports' && (
              <QAReports
                projectId={selectedProjectId}
                onCreateBugFromRun={handleCreateBugFromTest}
                onRunTest={handleOpenResultModal}
              />
            )}

          </div>
        )}
      </div>

      {/* RIGHT SIDEBAR: Claimed Tests & Recent Activity */}
      <div className="w-full xl:w-[320px] shrink-0 flex flex-col gap-6">
        
        {/* Tests Claimed by Current User */}
        <div className="bg-[#0f1422] border border-[#192238] rounded-2xl p-5 shadow-sm flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-bold text-white flex items-center gap-2">
              <i className="fa-solid fa-hand text-indigo-400"></i>
              <span>Claimed by You</span>
            </h2>
            <span className="text-[10px] font-bold text-indigo-400 bg-indigo-500/10 px-2 py-0.5 rounded border border-indigo-500/20">
              {myClaimedTests.length}
            </span>
          </div>

          {myClaimedTests.length === 0 ? (
            <div className="text-center py-6 text-xs text-slate-500 bg-[#161d2f]/50 rounded-xl border border-[#1f2a44] border-dashed">
              You haven't claimed any tests yet. Click [Take Test] on any available test.
            </div>
          ) : (
            <div className="flex flex-col gap-2.5">
              {myClaimedTests.map(tc => (
                <div
                  key={tc.id}
                  className="p-3 rounded-xl bg-[#141b2d] border border-indigo-500/30 hover:border-indigo-500/50 transition flex items-center justify-between gap-3 text-xs"
                >
                  <div className="min-w-0">
                    <h4 className="font-bold text-white truncate max-w-[150px]">{tc.title}</h4>
                    <div className="flex items-center gap-2 mt-1">
                      <TestStatusBadge status={tc.status} className="!text-[9px] !py-0.5 !px-1.5" />
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleOpenResultModal(tc)}
                      className="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-[10px] font-bold transition flex items-center gap-1 shadow-sm"
                    >
                      <i className="fa-solid fa-pen-to-square text-[8px]"></i>
                      <span>Test</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleReleaseTest(tc)}
                      title="Release test"
                      className="p-1 hover:bg-rose-500/20 text-slate-400 hover:text-rose-300 rounded-lg text-xs transition"
                    >
                      <i className="fa-solid fa-arrow-rotate-left text-[10px]"></i>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recent Activity */}
        <div className="bg-[#0f1422] border border-[#192238] rounded-2xl p-5 shadow-sm flex flex-col max-h-[420px]">
          <div className="flex items-center justify-between mb-4 shrink-0">
            <h2 className="text-sm font-bold text-white flex items-center gap-2">
              <i className="fa-solid fa-clock-rotate-left text-slate-400"></i>
              <span>Recent QA Activity</span>
            </h2>
          </div>
          <div className="flex-1 overflow-y-auto hide-scrollbar pr-1">
            <ActivityFeed activities={recentActivity} emptyMessage="No recent QA activity." />
          </div>
        </div>
      </div>

      {/* Modals */}
      {/* 1. Test Case Modal (Create / Edit Test) */}
      <TestCaseModal
        isOpen={showTestCaseModal}
        onClose={() => {
          setShowTestCaseModal(false);
          setEditingTestCase(null);
        }}
        projectId={selectedProjectId}
        editingTest={editingTestCase}
        projectMembers={projectMembers}
        onTestSaved={handleTestSaved}
      />

      {/* 2. Test Result Modal (Status & Description with strict validation) */}
      <TestResultModal
        open={showResultModal}
        onClose={() => {
          setShowResultModal(false);
          setTestingTestCase(null);
        }}
        testCase={testingTestCase}
        currentUser={currentUser}
        onSaveResult={handleSaveResult}
        onCreateBug={handleCreateBugFromTest}
      />

      {/* 3. Bug Modal (Create / Edit Bug, prefilled from failed/blocked test or standalone) */}
      <BugModal
        isOpen={showBugModal}
        onClose={() => {
          setShowBugModal(false);
          setEditingBug(null);
          setBugInitialData(null);
        }}
        projectId={selectedProjectId}
        initialData={bugInitialData}
        editingBug={editingBug}
        projectMembers={projectMembers}
        testCases={testCases}
        onBugSaved={handleBugSaved}
      />
    </div>
  );
}

function getRole(projectId, projects, currentUser) {
  const project = projects.find(p => p.id === projectId);
  if (!project || !currentUser) return 'Viewer';
  if (project.owner?.id === currentUser.id) return 'Admin';
  if (project.members && project.members.length > 0) {
    const member = project.members.find(m => (m.userId === currentUser.id || m.user?.id === currentUser.id));
    if (member) return member.role;
  }
  return 'Viewer';
}