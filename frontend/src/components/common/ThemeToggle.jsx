import { useState, useRef } from 'react';
import { useTheme } from '../../context/ThemeContext';
import { useClickOutside } from '../../hooks/useClickOutside';

export default function ThemeToggle() {
  const { theme, setTheme, themes } = useTheme();
  const [open, setOpen] = useState(false);
  const dropdownRef = useRef(null);

  useClickOutside(dropdownRef, () => setOpen(false));

  const currentThemeObj = themes.find(t => t.id === theme) || themes[0];

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setOpen(!open)}
        title={`Theme: ${currentThemeObj.name}`}
        className="w-8 h-8 md:w-9 md:h-9 rounded-full bg-[#131722] border border-[#232a3f] flex items-center justify-center text-slate-300 hover:text-white transition group relative"
      >
        <i className={`${currentThemeObj.icon} text-sm`} style={{ color: currentThemeObj.accent }}></i>
        <span 
          className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-[#131722]"
          style={{ backgroundColor: currentThemeObj.accent }}
        ></span>
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-64 bg-[#1f2638] rounded-xl shadow-2xl border border-[#2d364f] z-50 overflow-hidden py-1 animate-in fade-in slide-in-from-top-2 duration-150">
          <div className="px-3.5 py-2.5 border-b border-[#2d364f] flex items-center justify-between bg-[#171c2a]">
            <span className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
              <i className="fa-solid fa-palette text-indigo-400"></i> Appearance
            </span>
            <span className="text-[10px] text-slate-400 font-medium">{themes.length} Themes</span>
          </div>

          <div className="p-1.5 space-y-1">
            {themes.map(t => {
              const isActive = t.id === theme;
              return (
                <button
                  key={t.id}
                  onClick={() => {
                    setTheme(t.id);
                    setOpen(false);
                  }}
                  className={`w-full text-left px-3 py-2 rounded-lg flex items-center justify-between text-xs transition ${
                    isActive 
                      ? 'bg-[#2a344d] text-white font-semibold shadow-sm' 
                      : 'text-slate-300 hover:bg-[#252d43] hover:text-white'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <span 
                      className="w-3.5 h-3.5 rounded-full border border-white/20 flex items-center justify-center shrink-0"
                      style={{ backgroundColor: t.accent }}
                    ></span>
                    <div>
                      <div className="text-xs font-semibold leading-tight">{t.name}</div>
                      <div className="text-[10px] text-slate-400 font-normal">{t.description}</div>
                    </div>
                  </div>

                  {isActive && (
                    <i className="fa-solid fa-check text-xs text-indigo-400 shrink-0 ml-2"></i>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
