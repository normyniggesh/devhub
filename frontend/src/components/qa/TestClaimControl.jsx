import React, { useState } from 'react';
import Avatar from '../common/Avatar';

/**
 * Reusable TestClaimControl component.
 * Allows project members to take or release a test case.
 * Enforces mutual exclusion: if taken by another member, prevents others from claiming.
 */
export default function TestClaimControl({
  testCase,
  currentUser,
  onClaim,
  onRelease,
  onUpdateResult,
  compact = false
}) {
  const [submitting, setSubmitting] = useState(false);

  const isTaken = Boolean(testCase.testerId);
  const isTakenByMe = isTaken && (testCase.testerId === currentUser?.id || testCase.tester?.id === currentUser?.id);
  const isTakenByOther = isTaken && !isTakenByMe;
  const testerName = testCase.tester?.name || 'Another member';

  const handleTake = async (e) => {
    e.stopPropagation();
    if (submitting || !onClaim) return;
    try {
      setSubmitting(true);
      await onClaim(testCase);
    } catch (err) {
      alert(err.message || 'Failed to take test');
    } finally {
      setSubmitting(false);
    }
  };

  const handleRelease = async (e) => {
    e.stopPropagation();
    if (submitting || !onRelease) return;
    try {
      setSubmitting(true);
      await onRelease(testCase);
    } catch (err) {
      alert(err.message || 'Failed to release test');
    } finally {
      setSubmitting(false);
    }
  };

  if (compact) {
    if (isTakenByMe) {
      return (
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => onUpdateResult && onUpdateResult(testCase)}
            className="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-[11px] font-bold transition flex items-center gap-1 shadow-sm"
          >
            <i className="fa-solid fa-pen-to-square text-[10px]"></i>
            <span>Test</span>
          </button>
          <button
            type="button"
            disabled={submitting}
            onClick={handleRelease}
            title="Release test back to available pool"
            className="px-2 py-1 bg-[#1c2438] hover:bg-rose-500/20 text-slate-300 hover:text-rose-300 rounded-lg text-[11px] font-semibold transition border border-[#2b3854]"
          >
            {submitting ? <i className="fa-solid fa-circle-notch fa-spin"></i> : <i className="fa-solid fa-arrow-rotate-left"></i>}
          </button>
        </div>
      );
    }

    if (isTakenByOther) {
      return (
        <div className="flex items-center gap-1 text-[11px] text-amber-400/90 bg-amber-500/10 px-2 py-1 rounded-lg border border-amber-500/20">
          <Avatar user={testCase.tester} size="xs" />
          <span className="font-semibold truncate max-w-[90px]">{testerName}</span>
        </div>
      );
    }

    return (
      <button
        type="button"
        disabled={submitting}
        onClick={handleTake}
        className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-[11px] font-bold transition flex items-center gap-1 shadow-sm"
      >
        {submitting ? <i className="fa-solid fa-circle-notch fa-spin text-[10px]"></i> : <i className="fa-solid fa-hand text-[10px]"></i>}
        <span>Take</span>
      </button>
    );
  }

  // Full detailed display
  return (
    <div className="flex items-center gap-2 flex-wrap">
      {isTakenByMe ? (
        <>
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-indigo-500/10 border border-indigo-500/25 text-indigo-300 text-xs">
            <span className="w-2 h-2 rounded-full bg-indigo-400 animate-pulse"></span>
            <span className="font-bold">Taken by You</span>
          </div>

          {onUpdateResult && (
            <button
              type="button"
              onClick={() => onUpdateResult(testCase)}
              className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-md shadow-indigo-600/20"
            >
              <i className="fa-solid fa-pen-to-square text-[11px]"></i>
              <span>Update Status / Result</span>
            </button>
          )}

          <button
            type="button"
            disabled={submitting}
            onClick={handleRelease}
            className="px-3 py-1.5 bg-[#161d2f] hover:bg-rose-500/15 text-slate-300 hover:text-rose-300 rounded-xl text-xs font-semibold transition border border-[#222e48] hover:border-rose-500/30 flex items-center gap-1.5"
          >
            {submitting ? <i className="fa-solid fa-circle-notch fa-spin text-[10px]"></i> : <i className="fa-solid fa-arrow-rotate-left text-[10px]"></i>}
            <span>Release Test</span>
          </button>
        </>
      ) : isTakenByOther ? (
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-amber-500/10 border border-amber-500/25 text-amber-300 text-xs">
          <Avatar user={testCase.tester} size="xs" />
          <span className="font-semibold">Taken by <strong className="text-white">{testerName}</strong></span>
          <span className="text-[10px] text-amber-400/80 bg-amber-400/10 px-1.5 py-0.5 rounded ml-1">In Testing</span>
        </div>
      ) : (
        <button
          type="button"
          disabled={submitting}
          onClick={handleTake}
          className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-md shadow-emerald-950/40 active:scale-95"
        >
          {submitting ? <i className="fa-solid fa-circle-notch fa-spin text-[10px]"></i> : <i className="fa-solid fa-hand text-[10px]"></i>}
          <span>Take Test</span>
        </button>
      )}
    </div>
  );
}
