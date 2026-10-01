import { useState } from 'react';
import TestStatusBadge from './TestStatusBadge';
import Avatar from '../common/Avatar';

export default function TestCard({
  testCase,
  currentUser,
  canEdit = true,
  canRun = true,
  onRunTest,
  onEditTest,
  onDeleteTest,
  onCreateBugFromRun,
  onViewBug
}) {
  const [showRuns, setShowRuns] = useState(false);

  // Normalize runs / results (backend sends results ordered by createdAt desc)
  const results = testCase.results || [];
  const latestRun = results[0];
  const bugs = testCase.bugs || [];
  const openBugs = bugs.filter(b => b.status === 'Open' || b.status === 'In Progress');

  // Priority color helper
  const getPriorityBadge = (p) => {
    switch (p) {
      case 'High':
      case 'Critical':
        return 'bg-rose-500/10 text-rose-400 border-rose-500/20';
      case 'Low':
        return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
      case 'Medium':
      default:
        return 'bg-amber-500/10 text-amber-400 border-amber-500/20';
    }
  };

  return (
    <div className="bg-[#0f1422] border border-[#192238] hover:border-[#243354] rounded-2xl p-5 shadow-sm transition-all flex flex-col gap-4">
      {/* Top row: ID, Module, Priority, Assignee, Actions */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <span className="font-mono text-[11px] font-bold text-slate-500 bg-[#161d2f] px-2 py-0.5 rounded-md border border-[#1f2a44]">
            TC-{testCase.id.substring(0, 6).toUpperCase()}
          </span>
          {testCase.module && (
            <span className="text-[11px] font-medium text-purple-400 bg-purple-500/10 px-2 py-0.5 rounded-md border border-purple-500/20">
              {testCase.module}
            </span>
          )}
          <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md border ${getPriorityBadge(testCase.priority)}`}>
            {testCase.priority || 'Medium'}
          </span>
        </div>

        <div className="flex items-center gap-3">
          {/* Status Badge */}
          <TestStatusBadge status={testCase.status} />

          {/* Edit/Delete icons */}
          {canEdit && (
            <div className="flex items-center gap-1 border-l border-[#1f2a44] pl-2">
              <button
                type="button"
                onClick={() => onEditTest && onEditTest(testCase)}
                className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-white hover:bg-[#161d2f] transition"
                title="Edit Test Case"
              >
                <i className="fa-solid fa-pen text-xs"></i>
              </button>
              {onDeleteTest && (
                <button
                  type="button"
                  onClick={() => onDeleteTest(testCase.id)}
                  className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition"
                  title="Delete Test Case"
                >
                  <i className="fa-solid fa-trash text-xs"></i>
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Main Title & Description */}
      <div>
        <h3 className="text-base font-bold text-white leading-snug mb-1">
          {testCase.title}
        </h3>
        {testCase.description && (
          <p className="text-xs text-slate-400 leading-relaxed">
            {testCase.description}
          </p>
        )}
      </div>

      {/* Expected vs Actual Result Section */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 bg-[#161d2f]/70 border border-[#1f2a44] rounded-xl p-3.5 text-xs">
        <div>
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
            Expected Result
          </span>
          <p className="text-slate-200 font-medium leading-relaxed">
            {testCase.expectedResult || <span className="text-slate-500 italic">No expected result specified</span>}
          </p>
        </div>

        <div>
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
            Actual Result
          </span>
          <p className="font-medium leading-relaxed">
            {testCase.actualResult ? (
              <span className={testCase.status === 'Failed' ? 'text-rose-400' : testCase.status === 'Passed' ? 'text-emerald-400' : 'text-slate-200'}>
                {testCase.actualResult}
              </span>
            ) : (
              <span className="text-slate-500 italic">Filled when test is executed</span>
            )}
          </p>
        </div>
      </div>

      {/* Linked Bugs (if any) */}
      {bugs.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
            Linked Bugs:
          </span>
          {bugs.map((bug) => {
            const isOpen = bug.status === 'Open' || bug.status === 'In Progress';
            return (
              <button
                key={bug.id}
                type="button"
                onClick={() => onViewBug && onViewBug(bug)}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold transition border ${
                  isOpen
                    ? 'bg-rose-500/10 text-rose-300 border-rose-500/30 hover:bg-rose-500/20'
                    : 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30 hover:bg-emerald-500/20'
                }`}
              >
                <i className={`fa-solid ${isOpen ? 'fa-bug' : 'fa-check'}`}></i>
                <span className="truncate max-w-[180px]">{bug.title}</span>
                <span className="text-[9px] uppercase px-1 py-0.2 rounded bg-black/30">
                  {bug.status}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* Footer bar: Assignee, Runs trigger, and Run Test button */}
      <div className="flex items-center justify-between pt-3 border-t border-[#192238] flex-wrap gap-3">
        {/* Assignee & Execution History Toggle */}
        <div className="flex items-center gap-4 flex-wrap">
          {/* Assigned To */}
          <div className="flex items-center gap-2 text-xs">
            <span className="text-slate-500 text-[11px] font-medium">Assigned:</span>
            {testCase.assignee ? (
              <div className="flex items-center gap-1.5 bg-[#161d2f] border border-[#1f2a44] px-2 py-1 rounded-lg">
                <Avatar user={testCase.assignee} size="xs" />
                <span className="text-slate-300 text-xs font-semibold">{testCase.assignee.name}</span>
              </div>
            ) : (
              <span className="text-slate-500 text-xs italic">Unassigned</span>
            )}
          </div>

          {/* Runs history pill */}
          {results.length > 0 && (
            <button
              type="button"
              onClick={() => setShowRuns(!showRuns)}
              className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white transition bg-[#161d2f] border border-[#1f2a44] px-2.5 py-1 rounded-lg"
            >
              <i className="fa-solid fa-clock-rotate-left text-[10px] text-purple-400"></i>
              <span>{results.length} Run{results.length !== 1 ? 's' : ''}</span>
              <i className={`fa-solid fa-chevron-${showRuns ? 'up' : 'down'} text-[9px] text-slate-500 ml-0.5`}></i>
            </button>
          )}
        </div>

        {/* Action Button: Run Test */}
        {canRun && (
          <button
            type="button"
            onClick={() => onRunTest && onRunTest(testCase)}
            className="px-4 py-2 bg-[#5922cf] hover:bg-[#682ae6] text-white rounded-xl text-xs font-bold shadow-lg shadow-purple-900/30 transition flex items-center gap-2 active:scale-95"
          >
            <i className="fa-solid fa-play text-[10px]"></i>
            <span>Run Test</span>
          </button>
        )}
      </div>

      {/* Collapsible Execution Runs History */}
      {showRuns && (
        <div className="mt-1 pt-3 border-t border-[#1f2a44] bg-[#0c101c] -mx-5 -mb-5 p-5 rounded-b-2xl flex flex-col gap-2.5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
              Execution History
            </span>
            <span className="text-[10px] text-slate-500">
              Latest first
            </span>
          </div>

          <div className="space-y-2">
            {results.map((run, idx) => {
              const runDate = run.executedAt
                ? new Date(run.executedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
                : 'Recent';
              const testerName = run.executor?.name || 'Tester';
              const hasLinkedBug = run.bugs && run.bugs.length > 0;

              return (
                <div
                  key={run.id || idx}
                  className="flex items-center justify-between gap-3 p-2.5 rounded-xl bg-[#141b2d] border border-[#1f2a44] text-xs flex-wrap"
                >
                  <div className="flex items-center gap-3">
                    <span
                      className={`w-2.5 h-2.5 rounded-full ${
                        run.status === 'Passed'
                          ? 'bg-emerald-500 shadow-[0_0_8px_#10b981]'
                          : run.status === 'Failed'
                          ? 'bg-rose-500 shadow-[0_0_8px_#ef4444]'
                          : 'bg-amber-500'
                      }`}
                    ></span>
                    <span className="text-slate-300 font-medium">
                      <strong>{runDate}</strong> — <span className={run.status === 'Failed' ? 'text-rose-400 font-bold' : run.status === 'Passed' ? 'text-emerald-400 font-bold' : 'text-amber-400 font-bold'}>{run.status}</span> — {testerName}
                    </span>
                    {run.actualResult && (
                      <span className="text-slate-400 text-[11px] hidden sm:inline italic">
                        "{run.actualResult}"
                      </span>
                    )}
                  </div>

                  {/* If Failed: Option to create bug or see bug */}
                  {run.status === 'Failed' && (
                    <div>
                      {hasLinkedBug ? (
                        <span className="text-[10px] font-bold text-purple-400 bg-purple-500/10 px-2 py-0.5 rounded border border-purple-500/20">
                          <i className="fa-solid fa-bug mr-1"></i> Bug Created
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => onCreateBugFromRun && onCreateBugFromRun(testCase, run)}
                          className="px-2.5 py-1 bg-rose-600/20 hover:bg-rose-600/30 text-rose-300 border border-rose-500/30 rounded-lg text-[10px] font-bold transition flex items-center gap-1.5"
                        >
                          <i className="fa-solid fa-bug text-[9px]"></i>
                          <span>Create Bug</span>
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
