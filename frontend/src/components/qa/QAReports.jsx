import { useState, useEffect } from 'react';
import { apiClient } from '../../api/client';
import TestStatusBadge from './TestStatusBadge';

export default function QAReports({ projectId, onCreateBugFromRun, onRunTest }) {
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchReportData = async () => {
      try {
        setLoading(true);
        const res = await apiClient(`/qa/summary?projectId=${projectId}`);
        setSummary(res.summary);
      } catch (err) {
        console.error('Failed to load QA report metrics', err);
      } finally {
        setLoading(false);
      }
    };
    if (projectId) fetchReportData();
  }, [projectId]);

  if (loading) {
    return (
      <div className="flex flex-col gap-6 animate-pulse">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-24 bg-[#0f1422] rounded-2xl border border-[#192238]"></div>
          ))}
        </div>
        <div className="h-72 bg-[#0f1422] rounded-2xl border border-[#192238]"></div>
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
  const resolvedBugs = summary.resolvedBugs || 0;
  const passRate = summary.passRate || (total > 0 ? Math.round((passed / total) * 100) : 0);
  const failRate = summary.failRate || (total > 0 ? Math.round((failed / total) * 100) : 0);
  const recentlyFailed = summary.recentlyFailedTests || [];

  return (
    <div className="flex flex-col gap-6">
      {/* Metrics Row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {/* Total Tests */}
        <div className="bg-[#0f1422] border border-[#192238] rounded-2xl p-4 shadow-sm">
          <span className="text-xs font-bold text-slate-400 block mb-1">Total Tests</span>
          <div className="text-2xl font-extrabold text-white">{total}</div>
          <div className="text-[11px] text-slate-500 mt-1">Configured in QA suite</div>
        </div>

        {/* Pass Rate */}
        <div className="bg-[#0f1422] border border-[#192238] rounded-2xl p-4 shadow-sm">
          <span className="text-xs font-bold text-emerald-400 block mb-1">Pass Rate</span>
          <div className="text-2xl font-extrabold text-emerald-400">{passRate}%</div>
          <div className="text-[11px] text-slate-500 mt-1">{passed} of {total} passing</div>
        </div>

        {/* Fail Rate */}
        <div className="bg-[#0f1422] border border-[#192238] rounded-2xl p-4 shadow-sm">
          <span className="text-xs font-bold text-rose-400 block mb-1">Fail Rate</span>
          <div className="text-2xl font-extrabold text-rose-400">{failRate}%</div>
          <div className="text-[11px] text-slate-500 mt-1">{failed} failing tests</div>
        </div>

        {/* Open Bugs */}
        <div className="bg-[#0f1422] border border-[#192238] rounded-2xl p-4 shadow-sm">
          <span className="text-xs font-bold text-rose-300 block mb-1">Open Bugs</span>
          <div className="text-2xl font-extrabold text-white">{openBugs}</div>
          <div className="text-[11px] text-slate-500 mt-1">{resolvedBugs} resolved</div>
        </div>
      </div>

      {/* Progress Breakdown Bar */}
      <div className="bg-[#0f1422] border border-[#192238] rounded-2xl p-5 shadow-sm space-y-3">
        <div className="flex items-center justify-between text-xs font-bold">
          <span className="text-white">Execution Health Ratio</span>
          <span className="text-slate-400">
            {total > 0 ? Math.round(((passed + failed + blocked) / total) * 100) : 0}% Executed
          </span>
        </div>

        <div className="h-3 w-full bg-[#161d2f] rounded-full overflow-hidden flex border border-[#1f2a44]">
          <div
            style={{ width: `${total > 0 ? (passed / total) * 100 : 0}%` }}
            className="bg-emerald-500 transition-all duration-500"
            title={`Passed: ${passed}`}
          ></div>
          <div
            style={{ width: `${total > 0 ? (failed / total) * 100 : 0}%` }}
            className="bg-rose-500 transition-all duration-500"
            title={`Failed: ${failed}`}
          ></div>
          <div
            style={{ width: `${total > 0 ? (blocked / total) * 100 : 0}%` }}
            className="bg-amber-500 transition-all duration-500"
            title={`Blocked: ${blocked}`}
          ></div>
          <div
            style={{ width: `${total > 0 ? (notTested / total) * 100 : 0}%` }}
            className="bg-slate-700 transition-all duration-500"
            title={`Not Tested: ${notTested}`}
          ></div>
        </div>

        <div className="flex items-center justify-between text-[11px] text-slate-400 pt-1 flex-wrap gap-2">
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-emerald-500"></span>
            <span>Passed ({passed})</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-rose-500"></span>
            <span>Failed ({failed})</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-amber-500"></span>
            <span>Blocked ({blocked})</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-slate-700"></span>
            <span>Not Tested ({notTested})</span>
          </div>
        </div>
      </div>

      {/* Recently Failed Tests (Real data, actionable) */}
      <div className="bg-[#0f1422] border border-[#192238] rounded-2xl p-5 shadow-sm flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-rose-500/10 flex items-center justify-center border border-rose-500/20">
              <i className="fa-solid fa-triangle-exclamation text-rose-400 text-xs"></i>
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">Recently Failed Tests</h3>
              <p className="text-[11px] text-slate-400">Tests that need bug triage or re-execution</p>
            </div>
          </div>
          <span className="text-xs font-bold text-slate-400 bg-[#161d2f] px-2.5 py-1 rounded-lg border border-[#1f2a44]">
            {recentlyFailed.length} Failed Items
          </span>
        </div>

        {recentlyFailed.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-10 bg-[#161d2f]/50 border border-dashed border-[#1f2a44] rounded-xl text-center">
            <i className="fa-solid fa-shield-check text-emerald-400 text-3xl mb-2"></i>
            <h4 className="text-sm font-bold text-white mb-1">Zero Recent Failures</h4>
            <p className="text-xs text-slate-400">All recent test executions are passing or in good standing.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs whitespace-nowrap">
              <thead className="bg-[#161d2f] text-slate-400 uppercase font-bold text-[10px] tracking-wider border-b border-[#1f2a44]">
                <tr>
                  <th className="py-2.5 px-3">Test Case</th>
                  <th className="py-2.5 px-3">Expected Result</th>
                  <th className="py-2.5 px-3">Actual Result</th>
                  <th className="py-2.5 px-3">Failed By</th>
                  <th className="py-2.5 px-3">Date</th>
                  <th className="py-2.5 px-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1f2a44] text-slate-300 font-medium">
                {recentlyFailed.map((res) => {
                  const testCase = res.testCase;
                  const dateStr = res.executedAt
                    ? new Date(res.executedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
                    : 'Recent';
                  const hasBugs = res.bugs && res.bugs.length > 0;

                  return (
                    <tr key={res.id} className="hover:bg-[#161d2f] transition">
                      <td className="py-3 px-3 font-bold text-white max-w-[200px] truncate">
                        {testCase?.title || 'Unknown Test'}
                      </td>
                      <td className="py-3 px-3 text-slate-400 text-[11px] max-w-[180px] truncate">
                        {testCase?.expectedResult || '-'}
                      </td>
                      <td className="py-3 px-3 text-rose-400 font-medium text-[11px] max-w-[180px] truncate">
                        {res.actualResult || '-'}
                      </td>
                      <td className="py-3 px-3 text-slate-400 text-[11px]">
                        {res.executor?.name || 'Tester'}
                      </td>
                      <td className="py-3 px-3 text-slate-400 text-[11px]">
                        {dateStr}
                      </td>
                      <td className="py-3 px-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          {testCase && onRunTest && (
                            <button
                              type="button"
                              onClick={() => onRunTest(testCase)}
                              className="px-2.5 py-1 bg-[#1e293f] hover:bg-[#2d3a5a] text-slate-200 rounded-lg text-[10px] font-bold transition flex items-center gap-1"
                              title="Re-run test"
                            >
                              <i className="fa-solid fa-rotate-right text-[9px]"></i>
                              <span>Re-run</span>
                            </button>
                          )}
                          {!hasBugs && testCase && onCreateBugFromRun && (
                            <button
                              type="button"
                              onClick={() => onCreateBugFromRun(testCase, res)}
                              className="px-2.5 py-1 bg-rose-600/20 hover:bg-rose-600/30 text-rose-300 border border-rose-500/30 rounded-lg text-[10px] font-bold transition flex items-center gap-1"
                            >
                              <i className="fa-solid fa-bug text-[9px]"></i>
                              <span>Create Bug</span>
                            </button>
                          )}
                          {hasBugs && (
                            <span className="text-[10px] font-semibold text-purple-400 bg-purple-500/10 px-2 py-0.5 rounded border border-purple-500/20">
                              Bug Linked
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
