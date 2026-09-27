import React from 'react';

export default function ErrorState({ error, onRetry, message = "Unable to load data" }) {
  return (
    <div className="flex flex-col items-center justify-center p-12 bg-[#0f1422] border border-[#192238] rounded-2xl mt-4">
      <i className="fa-solid fa-triangle-exclamation text-4xl text-rose-500/80 mb-4"></i>
      <h2 className="text-lg font-bold text-white mb-2">{message}</h2>
      {error && <p className="text-sm text-slate-400 mb-6 text-center max-w-md">{error.message || error}</p>}
      {onRetry && (
        <button onClick={onRetry} className="px-5 py-2.5 bg-[#5922cf] hover:bg-[#682ae6] text-white rounded-lg text-sm font-semibold transition flex items-center gap-2">
          <i className="fa-solid fa-rotate-right"></i> Please try again
        </button>
      )}
    </div>
  );
}
