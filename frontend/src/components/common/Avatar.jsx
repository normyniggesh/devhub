import React from 'react';

export default function Avatar({ user, size = 'md', className = '' }) {
  const sizeClasses = {
    sm: 'w-6 h-6 text-[10px]',
    md: 'w-8 h-8 text-[12px]',
    lg: 'w-10 h-10 text-[14px]',
    xl: 'w-12 h-12 text-[16px]'
  };

  const css = `rounded-full bg-[#1a2333] border border-[#2d3a5a] flex items-center justify-center shrink-0 overflow-hidden text-purple-400 shadow-inner ${sizeClasses[size] || sizeClasses.md} ${className}`;

  if (!user) {
    return <div className={css}><i className="fa-solid fa-user text-slate-500 text-[0.8em]"></i></div>;
  }

  return (
    <div className={css} title={user.name}>
      {user.avatarUrl ? (
        <img src={user.avatarUrl} alt={user.name} className="w-full h-full object-cover" />
      ) : (
        <span className="font-bold">{user.name?.charAt(0).toUpperCase() || 'U'}</span>
      )}
    </div>
  );
}
