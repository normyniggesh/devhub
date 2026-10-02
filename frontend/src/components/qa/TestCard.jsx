import { useState } from 'react';
import TestStatusBadge from './TestStatusBadge';
import TestClaimControl from './TestClaimControl';
import TestHistory from './TestHistory';
import Avatar from '../common/Avatar';

export default function TestCard({
  testCase,
  currentUser,
  canEdit = true,
  canTest = true,
  onClaimTest,
  onReleaseTest,
  onUpdateResult,
  onEditTest,
  onDeleteTest,
  onCreateBug,
  onViewBug
}) {
  const [showHistory, setShowHistory] = useState(false);

  const results = testCase.results || [];
  const bugs = testCase.bugs || [];
  const openBugs = bugs.filter(b => b.status === 'Open' || b.status === 'In Progress');
  
  const isTaken = Boolean(testCase.testerId);
  const isTakenByMe = isTaken && (testCase.testerId === currentUser?.id || testCase.tester?.id === currentUser?.id);
  const isTakenByOther = isTaken && !isTakenByMe;
  const testerName = testCase.tester?.name || 'Another member';

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

  const lastUpdatedStr = testCase.updatedAt
    ? new Date(testCase.updatedAt).toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric'
      })
    : 'Recently';

  const isFailedOrBlocked = testCase.status === 'Failed' || testCase.status === 'Blocked';

  return (
    <div className={`bg-[#0f1422] border rounded-2xl p-5 shadow-sm transition-all flex flex-col gap-4 ${
      isTakenByMe
        ? 'border-indigo-500/40 ring-1 ring-indigo-500/20 shadow-indigo-950/20'
        : isTakenByOther
        ? 'border-amber-500/30'
        : 'border-[#192238] hover:border-[#243354]'
    }`}>
      {/* Top row: ID, Module, Priority, Status, Edit/Delete */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
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

        <div className="flex items-center gap-2.5">
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
            Actual / Latest Result
          </span>
          <p className="font-medium leading-relaxed">
            {testCase.actualResult ? (
              <span className={testCase.status === 'Failed' ? 'text-rose-400' : testCase.status === 'Passed' ? 'text-emerald-400' : testCase.status === 'Blocked' ? 'text-amber-400' : 'text-slate-200'}>
                {testCase.actualResult}
              </span>
            ) : (
              <span className="text-slate-500 italic">Filled when test is executed</span>
            )}
          </p>
        </div>
      </div>

      {/* Linked Bugs & Quick Create Bug Button */}
      {(bugs.length > 0 || (isFailedOrBlocked && canTest)) && (
        <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
          <div className="flex flex-wrap items-center gap-2">
            {bugs.length > 0 && (
              <>
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
              </>
            )}
          </div>

          {/* Quick Create Bug button if Failed/Blocked and user can test */}
          {isFailedOrBlocked && onCreateBug && openBugs.length === 0 && (
            <button
              type="button"
              onClick={() => onCreateBug(testCase, { actualResult: testCase.actualResult, status: testCase.status })}
              className="px-3 py-1 bg-rose-600/20 hover:bg-rose-600/30 text-rose-300 border border-rose-500/40 rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-sm ml-auto"
            >
              <i className="fa-solid fa-bug text-[10px]"></i>
              <span>Create Bug</span>
            </button>
          )}
        </div>
      )}

      {/* Footer bar: Tester status, Last Updated, and Actions */}
      <div className="flex items-center justify-between pt-3 border-t border-[#192238] flex-wrap gap-3">
        {/* Tester & Last Updated info */}
        <div className="flex items-center gap-4 flex-wrap text-xs">
          {/* Active Tester Display */}
          <div className="flex items-center gap-2">
            <span className="text-slate-500 text-[11px] font-medium">Tester:</span>
            {isTaken ? (
              <div className={`flex items-center gap-1.5 px-2 py-0.5 rounded-lg border ${
                isTakenByMe
                  ? 'bg-indigo-500/10 border-indigo-500/30 text-indigo-300'
                  : 'bg-amber-500/10 border-amber-500/30 text-amber-300'
              }`}>
                <Avatar user={testCase.tester} size="xs" />
                <span className="font-semibold text-xs">{testerName}</span>
                {isTakenByMe && <span className="text-[10px] text-indigo-400 font-bold ml-0.5">(You)</span>}
              </div>
            ) : (
              <span className="text-slate-500 italic text-[11px] bg-[#161d2f] px-2 py-0.5 rounded border border-[#1f2a44]">
                Available
              </span>
            )}
          </div>

          {/* Last updated */}
          <div className="text-slate-500 text-[11px] hidden sm:block">
            <span>Updated {lastUpdatedStr}</span>
          </div>

          {/* Execution History Toggle */}
          {results.length > 0 && (
            <button
              type="button"
              onClick={() => setShowHistory(!showHistory)}
              className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white transition bg-[#161d2f] border border-[#1f2a44] px-2.5 py-1 rounded-lg"
            >
              <i className="fa-solid fa-clock-rotate-left text-[10px] text-purple-400"></i>
              <span>{results.length} Result{results.length !== 1 ? 's' : ''}</span>
              <i className={`fa-solid fa-chevron-${showHistory ? 'up' : 'down'} text-[9px] text-slate-500 ml-0.5`}></i>
            </button>
          )}
        </div>

        {/* Claim / Test Actions */}
        <div className="flex items-center gap-2">
          {canTest && (
            <TestClaimControl
              testCase={testCase}
              currentUser={currentUser}
              onClaim={onClaimTest}
              onRelease={onReleaseTest}
              onUpdateResult={onUpdateResult}
            />
          )}
        </div>
      </div>

      {/* Collapsible Attached Test History */}
      {showHistory && (
        <div className="mt-1 pt-3 border-t border-[#1f2a44] bg-[#0c101c] -mx-5 -mb-5 p-5 rounded-b-2xl flex flex-col gap-2.5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
              Attached Test History
            </span>
            <span className="text-[10px] text-slate-500">
              Chronological results
            </span>
          </div>

          <TestHistory
            results={results}
            testCase={testCase}
            onCreateBugFromRun={onCreateBug}
          />
        </div>
      )}
    </div>
  );
}
