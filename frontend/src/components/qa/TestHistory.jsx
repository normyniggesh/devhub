import React from 'react';
import TestStatusBadge from './TestStatusBadge';
import Avatar from '../common/Avatar';

/**
 * Reusable TestHistory component.
 * Renders the chronological execution history attached directly to a test case.
 */
export default function TestHistory({
  results = [],
  testCase,
  onCreateBugFromRun
}) {
  if (!results || results.length === 0) {
    return (
      <div className="text-center py-4 text-xs text-slate-500 bg-[#090c14] rounded-xl border border-dashed border-[#1e2538]">
        No previous test results recorded for this test case.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {results.map((r, idx) => {
        const dateStr = r.executedAt
          ? new Date(r.executedAt).toLocaleDateString(undefined, {
              month: 'short',
              day: 'numeric',
              year: 'numeric'
            })
          : 'Recent';

        const testerName = r.executor?.name || 'Tester';
        const hasLinkedBug = r.bugs && r.bugs.length > 0;
        const isFailed = r.status === 'Failed';
        const isBlocked = r.status === 'Blocked';

        return (
          <div
            key={r.id || idx}
            className="p-3 rounded-xl bg-[#090c14] border border-[#1e2538] hover:border-[#28324a] transition text-xs flex flex-col gap-2"
          >
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <TestStatusBadge status={r.status} />
                <span className="text-slate-400 font-semibold">{dateStr}</span>
                <span className="text-slate-600">•</span>
                <div className="flex items-center gap-1.5 text-slate-300">
                  <Avatar user={r.executor} size="xs" />
                  <span>{testerName}</span>
                </div>
              </div>

              {/* Bug action if failed/blocked */}
              {(isFailed || isBlocked) && (
                <div>
                  {hasLinkedBug ? (
                    <span className="text-[10px] font-bold text-rose-400 bg-rose-500/10 px-2 py-0.5 rounded border border-rose-500/20 flex items-center gap-1">
                      <i className="fa-solid fa-bug text-[9px]"></i>
                      <span>Bug Logged</span>
                    </span>
                  ) : (
                    onCreateBugFromRun && (
                      <button
                        type="button"
                        onClick={() => onCreateBugFromRun(testCase, r)}
                        className="px-2 py-1 bg-rose-600/20 hover:bg-rose-600/30 text-rose-300 border border-rose-500/30 rounded-lg text-[10px] font-bold transition flex items-center gap-1"
                      >
                        <i className="fa-solid fa-bug text-[9px]"></i>
                        <span>Create Bug</span>
                      </button>
                    )
                  )}
                </div>
              )}
            </div>

            {/* Result Description if available */}
            {r.actualResult && (
              <p className="text-[11px] text-slate-300 bg-[#121624] px-2.5 py-1.5 rounded-lg border border-[#1a2336] leading-relaxed whitespace-pre-wrap">
                <span className="text-slate-500 font-semibold mr-1">Result:</span>
                {r.actualResult}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}
