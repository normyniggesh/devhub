import React from 'react';

export default function LoadingState({ message = "Loading...", minHeight = "400px" }) {
  return (
    <div className={`flex flex-col items-center justify-center p-20 min-h-[${minHeight}]`}>
      <i className="fa-solid fa-circle-notch fa-spin text-3xl text-purple-500 mb-4"></i>
      <span className="text-sm font-bold text-slate-400">{message}</span>
    </div>
  );
}
