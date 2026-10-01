import { useState, useEffect } from 'react';
import { apiClient } from '../../api/client';
import TestStatusBadge from './TestStatusBadge';

export default function QASummary({ projectId, onNavigateTab, onRunTest, onCreateBugFromRun }) {
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchSummary = async () => {
      try {
        setLoading(true);
        const res = await apiClient(`/qa/summary?projectId=${projectId}`);
        setSummary(res.summary);
      } catch (err) {
        console.error('Failed to load QA summary', err);
      } finally {
        setLoading(false);
      }
    };
    if (projectId) fetchSummary();
  }, [projectId]);

  if (loading) {
    return (
      <div className="flex flex-col gap-6 animate-pulse">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-24 bg-[#0f1422] rounded-2xl border border-[#192238]"></div>
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="h-64 bg-[#0f1422] rounded-2xl border border-[#192238]"></div>
          <div className="h-64 bg-[#0f1422] rounded-2xl border border-[#192238]"></div>
        </div>
      </div>
    );
  }

  if (!summary) return null;

  const total = summary.totalTestCases || 0;
  const passed = summary.passedTestCases || 0;
  const failed = summary.failedTestCases || 0;
  const blocked = summary.blockedTestCases || 0;
  const notTested = summary.notTestedTestCases || 0;
  const openBugs = summary.openBugs || 0;
  const passPerc = summary.passRate || (total > 0 ? Math.round((passed / total) * 100) : 0);
  const failPerc = summary.failRate || (total > 0 ? Math.round((failed / total) * 100) : 0);
  const recentResults = summary.recentResults || [];

  return (
    <div className="flex flex-col gap-6">
      {/* 5 Real Metric Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        {/* Total Tests */}
        <div className="bg-[#0f1422] border border-[#192238] rounded-2xl p-4 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-slate-400">Total Tests</span>
            <div className="w-7 h-7 rounded-lg bg-indigo-500/10 flex items-center justify-center border border-indigo-500/20">
              <i className="fa-solid fa-list-check text-indigo-400 text-xs"></i>
            </div>
          </div>
          <div>
            <div className="text-2xl font-extrabold text-white">{total}</div>
            <div className="text-[10px] font-semibold text-slate-500 mt-1">Configured test cases</div>
          </div>
        </div>

        {/* Passed */}
        <div className="bg-[#0f1422] border border-[#192238] rounded-2xl p-4 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-slate-400">Passed</span>
            <div className="w-7 h-7 rounded-lg bg-emerald-500/10 flex items-center justify-center border border-emerald-500/20">
              <i className="fa-solid fa-check text-emerald-400 text-xs"></i>
            </div>
          </div>
          <div>
            <div className="text-2xl font-extrabold text-emerald-400">{passed}</div>
            <div className="text-[10px] font-semibold text-slate-500 mt-1">{passPerc}% of all tests</div>
          </div>
        </div>

        {/* Failed */}
        <div className="bg-[#0f1422] border border-[#192238] rounded-2xl p-4 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-slate-400">Failed</span>
            <div className="w-7 h-7 rounded-lg bg-rose-500/10 flex items-center justify-center border border-rose-500/20">
              <i className="fa-solid fa-xmark text-rose-400 text-xs"></i>
            </div>
          </div>
          <div>
            <div className="text-2xl font-extrabold text-rose-400">{failed}</div>
            <div className="text-[10px] font-semibold text-slate-500 mt-1">{failPerc}% of all tests</div>
          </div>
        </div>

        {/* Not Tested */}
        <div className="bg-[#0f1422] border border-[#192238] rounded-2xl p-4 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-slate-400">Not Tested</span>
            <div className="w-7 h-7 rounded-lg bg-slate-500/10 flex items-center justify-center border border-slate-500/20">
              <i className="fa-solid fa-minus text-slate-400 text-xs"></i>
            </div>
          </div>
          <div>
            <div className="text-2xl font-extrabold text-slate-300">{notTested}</div>
            <div className="text-[10px] font-semibold text-slate-500 mt-1">
              {total > 0 ? Math.round((notTested / total) * 100) : 0}% pending run
            </div>
          </div>
        </div>

        {/* Open Bugs */}
        <div
          onClick={() => onNavigateTab && onNavigateTab('Issues/Bugs')}
          className="bg-[#0f1422] border border-[#192238] hover:border-rose-500/40 rounded-2xl p-4 shadow-sm flex flex-col justify-between cursor-pointer transition"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-slate-400">Open Bugs</span>
            <div className="w-7 h-7 rounded-lg bg-rose-500/10 flex items-center justify-center border border-rose-500/20">
              <i className="fa-solid fa-bug text-rose-400 text-xs"></i>
            </div>
          </div>
          <div>
            <div className="text-2xl font-extrabold text-white">{openBugs}</div>
            <div className="text-[10px] font-bold text-rose-400 mt-1 flex items-center gap-1">
              <span>View Bugs</span>
              <i className="fa-solid fa-arrow-right text-[8px]"></i>
            </div>
          </div>
        </div>
      </div>

      {/* Main Grid: Status Distribution & Recent Test Results */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Test Health / Status Breakdown */}
        <div className="bg-[#0f1422] border border-[#192238] rounded-2xl p-5 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <i className="fa-solid fa-chart-pie text-purple-400"></i>
                <span>Test Status Breakdown</span>
              </h3>
              <button
                type="button"
                onClick={() => onNavigateTab && onNavigateTab('Tests')}
                className="text-[10px] font-bold text-purple-400 hover:text-purple-300 transition"
              >
                Go to Tests →
              </button>
            </div>

            {/* Circular / Progress view */}
            <div className="py-4 flex items-center justify-center">
              {total === 0 ? (
                <div className="text-center text-xs text-slate-500 py-8">
                  No tests created yet.
                </div>
              ) : (
                <div
                  className="relative w-40 h-40 flex items-center justify-center rounded-full shrink-0 shadow-lg shadow-black/50"
                  style={{
                    background: `conic-gradient(#10b981 0% ${passPerc}%, #ef4444 ${passPerc}% ${passPerc + failPerc}%, #64748b ${passPerc + failPerc}% 100%)`
                  }}
                >
                  <div className="absolute inset-[16%] bg-[#0f1422] rounded-full flex flex-col items-center justify-center shadow-inner">
                    <span className="text-2xl font-extrabold text-white leading-none">{total}</span>
                    <span className="text-[10px] font-bold text-slate-400 mt-1">Total Tests</span>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2 pt-4 border-t border-[#1f2a44] text-center">
            <div className="p-2 rounded-xl bg-[#161d2f] border border-[#1f2a44]">
              <span className="text-[10px] font-bold text-emerald-400 block">Passed</span>
              <span className="text-sm font-extrabold text-white">{passed}</span>
            </div>
            <div className="p-2 rounded-xl bg-[#161d2f] border border-[#1f2a44]">
              <span className="text-[10px] font-bold text-rose-400 block">Failed</span>
              <span className="text-sm font-extrabold text-white">{failed}</span>
            </div>
            <div className="p-2 rounded-xl bg-[#161d2f] border border-[#1f2a44]">
              <span className="text-[10px] font-bold text-slate-400 block">Not Tested</span>
              <span className="text-sm font-extrabold text-white">{notTested}</span>
            </div>
          </div>
        </div>

        {/* Recent Test Results (Spans 2 columns) */}
        <div className="lg:col-span-2 bg-[#0f1422] border border-[#192238] rounded-2xl p-5 shadow-sm flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <i className="fa-solid fa-list-check text-purple-400"></i>
              <span>Recent Test Results</span>
            </h3>
            <button
              type="button"
              onClick={() => onNavigateTab && onNavigateTab('Tests')}
              className="text-[10px] font-bold text-purple-400 hover:text-purple-300 transition"
            >
              View All Tests →
            </button>
          </div>

          <div className="flex-1 overflow-x-auto">
            {recentResults.length === 0 ? (
              <div className="flex flex-col items-center justify-center p-12 text-center bg-[#161d2f]/50 border border-dashed border-[#1f2a44] rounded-xl h-full">
                <i className="fa-solid fa-play text-slate-600 text-3xl mb-3"></i>
                <p className="text-xs text-slate-400 font-medium">No test executions logged yet.</p>
                <p className="text-[11px] text-slate-500 mt-1">Run tests in the "Tests" tab to see real execution history here.</p>
              </div>
            ) : (
              <table className="w-full text-left text-xs whitespace-nowrap">
                <thead className="bg-[#161d2f] text-slate-400 uppercase font-bold text-[10px] tracking-wider border-b border-[#1f2a44]">
                  <tr>
                    <th className="py-2.5 px-3">Test Case</th>
                    <th className="py-2.5 px-3">Result</th>
                    <th className="py-2.5 px-3">Tester</th>
                    <th className="py-2.5 px-3">Date</th>
                    <th className="py-2.5 px-3">Actual Result</th>
                    <th className="py-2.5 px-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#1f2a44] text-slate-300 font-medium">
                  {recentResults.map((res) => {
                    const testCase = res.testCase;
                    const dateStr = res.executedAt
                      ? new Date(res.executedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
                      : 'Recent';
                    const hasBugs = res.bugs && res.bugs.length > 0;

                    return (
                      <tr key={res.id} className="hover:bg-[#161d2f] transition">
                        <td className="py-2.5 px-3 font-bold text-white max-w-[180px] truncate">
                          {testCase?.title || 'Test Case'}
                        </td>
                        <td className="py-2.5 px-3">
                          <TestStatusBadge status={res.status} />
                        </td>
                        <td className="py-2.5 px-3 text-slate-400 text-[11px]">
                          {res.executor?.name || 'Tester'}
                        </td>
                        <td className="py-2.5 px-3 text-slate-400 text-[11px]">
                          {dateStr}
                        </td>
                        <td className="py-2.5 px-3 text-slate-400 text-[11px] max-w-[160px] truncate">
                          {res.actualResult || '-'}
                        </td>
                        <td className="py-2.5 px-3 text-right">
                          {res.status === 'Failed' && !hasBugs && (
                            <button
                              type="button"
                              onClick={() => onCreateBugFromRun && onCreateBugFromRun(testCase, res)}
                              className="px-2 py-1 bg-rose-600/20 hover:bg-rose-600/30 text-rose-300 border border-rose-500/30 rounded text-[10px] font-bold transition inline-flex items-center gap-1"
                            >
                              <i className="fa-solid fa-bug text-[8px]"></i>
                              <span>Create Bug</span>
                            </button>
                          )}
                          {res.status === 'Failed' && hasBugs && (
                            <span className="text-[10px] text-purple-400 font-semibold">
                              Bug linked
                            </span>
                          )}
                          {res.status === 'Passed' && (
                            <span className="text-[10px] text-emerald-400 font-medium">
                              Verified
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
