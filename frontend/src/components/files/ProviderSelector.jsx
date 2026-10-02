import React, { useState, useRef, useEffect } from 'react';

const PROVIDERS = [
  { id: 'local', name: 'This PC', icon: 'fa-laptop', color: 'text-sky-400', bg: 'bg-sky-500/10', border: 'border-sky-500/20' },
  { id: 'devhub', name: 'DEVHUB S3', icon: 'fa-cube', color: 'text-purple-400', bg: 'bg-purple-500/10', border: 'border-purple-500/20' },
  { id: 'gdrive', name: 'Google Drive', icon: 'fa-google-drive', isBrand: true, color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20' }
];

export default function ProviderSelector({ currentProvider = 'local', onSelectProvider, disabled = false }) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef(null);

  const active = PROVIDERS.find(p => p.id === currentProvider) || PROVIDERS[0];

  useEffect(() => {
    function handleClickOutside(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [open]);

  return (
    <div className="relative inline-block" ref={containerRef}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen(prev => !prev)}
        className={`flex items-center gap-2 px-2.5 py-1 rounded-xl border text-xs font-bold transition ${active.bg} ${active.border} hover:brightness-110 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed`}
      >
        <i className={`${active.isBrand ? 'fa-brands' : 'fa-solid'} ${active.icon} ${active.color} text-xs`}></i>
        <span className="text-white text-[11px] tracking-wide">{active.name}</span>
        {!disabled && <i className="fa-solid fa-chevron-down text-[9px] text-slate-400 ml-1"></i>}
      </button>

      {open && !disabled && (
        <div className="absolute left-0 top-full mt-1.5 w-44 bg-[#141b2d] border border-[#202b46] rounded-xl shadow-2xl p-1.5 z-50 flex flex-col gap-1 backdrop-blur-md animate-scale-in">
          <div className="px-2 py-1 text-[9px] font-bold tracking-wider text-slate-400 uppercase border-b border-[#1f2a44] mb-0.5">
            Switch Source
          </div>
          {PROVIDERS.map(p => (
            <button
              key={p.id}
              type="button"
              onClick={() => {
                onSelectProvider(p.id);
                setOpen(false);
              }}
              className={`flex items-center justify-between w-full px-2.5 py-1.5 rounded-lg text-xs font-semibold transition ${
                p.id === currentProvider
                  ? 'bg-purple-600/30 text-white font-bold border border-purple-500/30'
                  : 'text-slate-300 hover:text-white hover:bg-[#1a2338]'
              }`}
            >
              <div className="flex items-center gap-2">
                <i className={`${p.isBrand ? 'fa-brands' : 'fa-solid'} ${p.icon} ${p.color} text-xs`}></i>
                <span>{p.name}</span>
              </div>
              {p.id === currentProvider && (
                <i className="fa-solid fa-check text-purple-400 text-[10px]"></i>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
