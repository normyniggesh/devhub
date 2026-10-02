import React, { useState, useEffect } from 'react';
import { apiClient } from '../../api/client';
import TestCard from './TestCard';

export default function QASummary({
  projectId,
  testCases = [],
  bugs = [],
  currentUser,
  onNavigateTab,
  onClaimTest,
  onReleaseTest,
  onUpdateResult,
  onCreateBug,
  onViewBug,
  onEditTest,
  onDeleteTest
}) {
  const [summaryData, setSummaryData] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const fetchSummary = async () => {
      try {
        setLoading(true);
        const res = await apiClient(`/qa/summary?projectId=${projectId}`);
        setSummaryData(res.summary);
      } catch (err) {
        console.error('Failed to load QA summary metrics', err);
      } finally {
        setLoading(false);
      }
    };
    if (projectId) fetchSummary();
  }, [projectId]);

  // Compute live counts from testCases if available, falling back to summaryData
  const total = testCases.length > 0 ? testCases.length : (summaryData?.totalTestCases || 0);
  const passed = testCases.length > 0 ? testCases.filter(t => t.status === 'Passed').length : (summaryData?.passedTestCases || 0);
  const failed = testCases.length > 0 ? testCases.filter(t => t.status === 'Failed').length : (summaryData?.failedTestCases || 0);
  const blocked = testCases.length > 0 ? testCases.filter(t => t.status === 'Blocked').length : (summaryData?.blockedTestCases || 0);
  const notTested = testCases.length > 0
    ? testCases.filter(t => !t.status || t.status === 'Not Tested' || t.status === 'Draft' || t.status === 'Pending').length
    : (summaryData?.notTestedTestCases || 0);
  
  const openBugs = bugs.length > 0
    ? bugs.filter(b => b.status === 'Open' || b.status === 'In Progress').length
    : (summaryData?.openBugs || 0);

  // Group test cases into AVAILABLE and TAKEN
  const availableTests = testCases.filter(t => !t.testerId);
  const takenTests = testCases.filter(t => Boolean(t.testerId));

  return (
    <div className="flex flex-col gap-8">
      {/* 6 Clean Status Metric Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3.5">
        {/* Total Tests */}
        <div className="bg-[#0f1422] border border-[#192238] rounded-2xl p-4 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Total Tests</span>
            <div className="w-6 h-6 rounded-lg bg-indigo-500/10 flex items-center justify-center border border-indigo-500/20">
              <i className="fa-solid fa-list-check text-indigo-400 text-[10px]"></i>
            </div>
          </div>
          <div>
            <div className="text-2xl font-extrabold text-white">{total}</div>
          </div>
        </div>

        {/* Passed (Green) */}
        <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-2xl p-4 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-bold text-emerald-400 uppercase tracking-wider">Passed</span>
            <div className="w-6 h-6 rounded-lg bg-emerald-500/20 flex items-center justify-center border border-emerald-500/30">
              <i className="fa-solid fa-check text-emerald-400 text-[10px]"></i>
            </div>
          </div>
          <div>
            <div className="text-2xl font-extrabold text-emerald-400">{passed}</div>
          </div>
        </div>

        {/* Failed (Red) */}
        <div className="bg-rose-500/10 border border-rose-500/30 rounded-2xl p-4 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-bold text-rose-400 uppercase tracking-wider">Failed</span>
            <div className="w-6 h-6 rounded-lg bg-rose-500/20 flex items-center justify-center border border-rose-500/30">
              <i className="fa-solid fa-xmark text-rose-400 text-[10px]"></i>
            </div>
          </div>
          <div>
            <div className="text-2xl font-extrabold text-rose-400">{failed}</div>
          </div>
        </div>

        {/* Not Tested (Neutral Gray) */}
        <div className="bg-slate-500/10 border border-slate-500/25 rounded-2xl p-4 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Not Tested</span>
            <div className="w-6 h-6 rounded-lg bg-slate-500/20 flex items-center justify-center border border-slate-500/30">
              <i className="fa-regular fa-circle-question text-slate-400 text-[10px]"></i>
            </div>
          </div>
          <div>
            <div className="text-2xl font-extrabold text-slate-300">{notTested}</div>
          </div>
        </div>

        {/* Blocked (Orange) */}
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-4 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-bold text-amber-400 uppercase tracking-wider">Blocked</span>
            <div className="w-6 h-6 rounded-lg bg-amber-500/20 flex items-center justify-center border border-amber-500/30">
              <i className="fa-solid fa-ban text-amber-400 text-[10px]"></i>
            </div>
          </div>
          <div>
            <div className="text-2xl font-extrabold text-amber-400">{blocked}</div>
          </div>
        </div>

        {/* Open Bugs */}
        <div
          onClick={() => onNavigateTab && onNavigateTab('Issues/Bugs')}
          className="bg-[#0f1422] border border-rose-500/30 hover:border-rose-500/50 rounded-2xl p-4 shadow-sm flex flex-col justify-between cursor-pointer transition group"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-bold text-rose-400 uppercase tracking-wider">Open Bugs</span>
            <div className="w-6 h-6 rounded-lg bg-rose-500/15 flex items-center justify-center border border-rose-500/25 group-hover:bg-rose-500/25 transition">
              <i className="fa-solid fa-bug text-rose-400 text-[10px]"></i>
            </div>
          </div>
          <div className="flex items-baseline justify-between">
            <div className="text-2xl font-extrabold text-white">{openBugs}</div>
            <span className="text-[10px] text-rose-400 font-semibold group-hover:underline">View →</span>
          </div>
        </div>
      </div>

      {/* SECTION 1: AVAILABLE TESTS */}
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between pb-2 border-b border-[#192238]">
          <div className="flex items-center gap-2.5">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 shadow-[0_0_8px_#10b981]"></span>
            <h2 className="text-sm font-extrabold uppercase tracking-wider text-white">
              Available Tests
            </h2>
            <span className="text-xs font-bold text-slate-400 bg-[#161d2f] px-2 py-0.5 rounded-md border border-[#1f2a44]">
              {availableTests.length}
            </span>
          </div>
          <span className="text-xs text-slate-500 hidden sm:inline">
            Tests nobody is currently testing — any authorized project member can claim
          </span>
        </div>

        {availableTests.length === 0 ? (
          <div className="text-center py-8 text-xs text-slate-500 bg-[#0f1422] rounded-2xl border border-dashed border-[#1f2a44] p-6">
            <i className="fa-solid fa-check-double text-slate-600 text-2xl mb-2 block"></i>
            All tests are currently claimed or no tests available.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4">
            {availableTests.map((tc) => (
              <TestCard
                key={tc.id}
                testCase={tc}
                currentUser={currentUser}
                canEdit={true}
                canTest={true}
                onClaimTest={onClaimTest}
                onReleaseTest={onReleaseTest}
                onUpdateResult={onUpdateResult}
                onEditTest={onEditTest}
                onDeleteTest={onDeleteTest}
                onCreateBug={onCreateBug}
                onViewBug={onViewBug}
              />
            ))}
          </div>
        )}
      </div>

      {/* SECTION 2: TAKEN / IN TESTING */}
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between pb-2 border-b border-[#192238]">
          <div className="flex items-center gap-2.5">
            <span className="w-2.5 h-2.5 rounded-full bg-indigo-400 animate-pulse"></span>
            <h2 className="text-sm font-extrabold uppercase tracking-wider text-white">
              Taken / In Testing
            </h2>
            <span className="text-xs font-bold text-indigo-400 bg-indigo-500/10 px-2 py-0.5 rounded-md border border-indigo-500/20">
              {takenTests.length}
            </span>
          </div>
          <span className="text-xs text-slate-500 hidden sm:inline">
            Tests currently being handled by a member
          </span>
        </div>

        {takenTests.length === 0 ? (
          <div className="text-center py-8 text-xs text-slate-500 bg-[#0f1422] rounded-2xl border border-dashed border-[#1f2a44] p-6">
            <i className="fa-solid fa-hand text-slate-600 text-2xl mb-2 block"></i>
            No tests are currently being tested. Claim an available test above to begin testing.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4">
            {takenTests.map((tc) => (
              <TestCard
                key={tc.id}
                testCase={tc}
                currentUser={currentUser}
                canEdit={true}
                canTest={true}
                onClaimTest={onClaimTest}
                onReleaseTest={onReleaseTest}
                onUpdateResult={onUpdateResult}
                onEditTest={onEditTest}
                onDeleteTest={onDeleteTest}
                onCreateBug={onCreateBug}
                onViewBug={onViewBug}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
