import React, { useState, useEffect } from 'react';
import { NavLink } from 'react-router-dom';
import { useStore } from '../store';

/**
 * Reusable NavItem with active styling and hover tooltips for collapsed mode
 */
function NavItem({ to, icon, label, end = false, collapsed, onClick }) {
  return (
    <div className="relative group/tooltip">
      <NavLink
        to={to}
        end={end}
        onClick={onClick}
        className={({ isActive }) =>
          `sidebar-link flex items-center transition rounded-xl font-medium text-xs ${
            collapsed
              ? 'w-10 h-10 mx-auto justify-center'
              : 'px-3 py-2 space-x-2.5'
          } ${
            isActive
              ? 'sidebar-link-active bg-[#5243d4] text-white shadow-md shadow-indigo-600/20 font-semibold'
              : 'text-slate-400 hover:text-white hover:bg-[#161a28]'
          }`
        }
      >
        <i className={`${icon} text-[14px] w-5 text-center shrink-0`}></i>
        {!collapsed && <span className="truncate">{label}</span>}
      </NavLink>

      {/* Floating Tooltip when collapsed */}
      {collapsed && (
        <div className="pointer-events-none absolute left-full ml-3 top-1/2 -translate-y-1/2 z-50 whitespace-nowrap rounded-lg bg-[#1f2638] border border-[#2d364f] px-2.5 py-1 text-xs font-semibold text-white shadow-2xl opacity-0 invisible group-hover/tooltip:opacity-100 group-hover/tooltip:visible transition-all duration-150">
          {label}
          <div className="absolute right-full top-1/2 -translate-y-1/2 border-4 border-transparent border-r-[#1f2638]"></div>
        </div>
      )}
    </div>
  );
}

export default function Sidebar({ isOpen, setIsOpen }) {
  const { currentUser } = useStore();

  // Desktop screen detection (so mobile drawer always opens with full readable width)
  const [isDesktop, setIsDesktop] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth >= 768 : true
  );

  useEffect(() => {
    const handleResize = () => {
      setIsDesktop(window.innerWidth >= 768);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Remember collapsed/expanded state in localStorage
  const [isCollapsed, setIsCollapsed] = useState(() => {
    try {
      return localStorage.getItem('devhub_sidebar_collapsed') === 'true';
    } catch {
      return false;
    }
  });

  const toggleCollapse = () => {
    setIsCollapsed(prev => {
      const next = !prev;
      try {
        localStorage.setItem('devhub_sidebar_collapsed', String(next));
      } catch {}
      return next;
    });
  };

  // Only collapse on desktop; mobile drawer stays expanded for usability
  const collapsed = isDesktop && isCollapsed;

  const handleLinkClick = () => {
    if (setIsOpen) setIsOpen(false);
  };

  return (
    <>
      {/* Mobile Backdrop Overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/60 z-40 md:hidden backdrop-blur-xs transition-opacity"
          onClick={() => setIsOpen(false)}
        />
      )}

      {/* Sidebar Container: 15% narrower than w-64 (256px * 0.85 = 218px) */}
      <aside
        className={`fixed md:sticky top-0 left-0 h-screen bg-[#0c0e17] border-r border-[#191e2e] sidebar-container flex flex-col justify-between shrink-0 overflow-y-auto z-40 transition-[width,transform] duration-200 ease-in-out ${
          collapsed ? 'w-[68px]' : 'w-[218px]'
        } ${isOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}`}
      >
        <div>
          {/* Brand Header */}
          <div
            className={`border-b border-[#191e2e]/60 transition-all ${
              collapsed
                ? 'py-3.5 px-2 flex flex-col items-center gap-2.5'
                : 'px-3.5 py-3.5 flex items-center justify-between'
            }`}
          >
            <div className="flex items-center space-x-2.5 min-w-0">
              <div
                className="w-8 h-8 rounded-lg devhub-logo-box bg-gradient-to-tr from-purple-600 to-indigo-500 flex items-center justify-center text-white shadow-lg shadow-indigo-600/30 shrink-0"
                title="DEVHUB"
              >
                <i className="fa-solid fa-bolt text-sm devhub-logo-icon"></i>
              </div>
              {!collapsed && (
                <div className="min-w-0">
                  <span className="devhub-brand-title text-white font-extrabold text-base tracking-wider block leading-none">
                    DEVHUB
                  </span>
                  <span className="devhub-tagline text-[10px] font-medium text-slate-500 tracking-tight block mt-1">
                    Developer Suite
                  </span>
                </div>
              )}
            </div>

            {/* Desktop Collapse / Expand Toggle Button */}
            <button
              type="button"
              onClick={toggleCollapse}
              title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              className="hidden md:flex w-7 h-7 rounded-lg items-center justify-center text-slate-400 hover:text-white hover:bg-[#161a28] transition shrink-0"
            >
              <i
                className={`fa-solid ${
                  collapsed ? 'fa-angles-right' : 'fa-angles-left'
                } text-xs`}
              ></i>
            </button>

            {/* Mobile Close Button */}
            <button
              type="button"
              onClick={() => setIsOpen && setIsOpen(false)}
              title="Close menu"
              aria-label="Close menu"
              className="md:hidden w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-white hover:bg-[#161a28] transition shrink-0"
            >
              <i className="fa-solid fa-xmark text-sm"></i>
            </button>
          </div>

          {/* Navigation Links */}
          <nav className="p-2 space-y-4 mt-1">
            {/* Primary Navigation */}
            <div className="space-y-1">
              <NavItem
                to="/"
                icon="fa-solid fa-house"
                label="Dashboard"
                end
                collapsed={collapsed}
                onClick={handleLinkClick}
              />
              <NavItem
                to="/activity"
                icon="fa-regular fa-sun"
                label="My Day"
                collapsed={collapsed}
                onClick={handleLinkClick}
              />
            </div>

            {/* Section: WORKSPACE */}
            <div>
              {collapsed ? (
                <div
                  className="my-2 border-t border-[#191e2e]/80 mx-2"
                  title="WORKSPACE"
                ></div>
              ) : (
                <h3 className="px-3 text-[10px] font-bold text-slate-500 sidebar-heading tracking-wider uppercase mb-1">
                  WORKSPACE
                </h3>
              )}
              <div className="space-y-0.5">
                <NavItem
                  to="/projects"
                  icon="fa-regular fa-folder"
                  label="Projects"
                  collapsed={collapsed}
                  onClick={handleLinkClick}
                />
                <NavItem
                  to="/tasks"
                  icon="fa-regular fa-square-check"
                  label="Tasks"
                  collapsed={collapsed}
                  onClick={handleLinkClick}
                />
                <NavItem
                  to="/qa"
                  icon="fa-solid fa-flask"
                  label="QA / Testing"
                  collapsed={collapsed}
                  onClick={handleLinkClick}
                />
                <NavItem
                  to="/calendar"
                  icon="fa-regular fa-calendar"
                  label="Calendar"
                  collapsed={collapsed}
                  onClick={handleLinkClick}
                />
                <NavItem
                  to="/team"
                  icon="fa-solid fa-user-group"
                  label="Team"
                  collapsed={collapsed}
                  onClick={handleLinkClick}
                />
                <NavItem
                  to="/files"
                  icon="fa-regular fa-file"
                  label="Files"
                  collapsed={collapsed}
                  onClick={handleLinkClick}
                />
              </div>
            </div>

            {/* Section: DEVELOPMENT */}
            <div>
              {collapsed ? (
                <div
                  className="my-2 border-t border-[#191e2e]/80 mx-2"
                  title="DEVELOPMENT"
                ></div>
              ) : (
                <h3 className="px-3 text-[10px] font-bold text-slate-500 sidebar-heading tracking-wider uppercase mb-1">
                  DEVELOPMENT
                </h3>
              )}
              <div className="space-y-0.5">
                <NavItem
                  to="/github"
                  icon="fa-brands fa-github"
                  label="GitHub"
                  collapsed={collapsed}
                  onClick={handleLinkClick}
                />
                <NavItem
                  to="/pull-requests"
                  icon="fa-solid fa-code-pull-request"
                  label="Pull Requests"
                  collapsed={collapsed}
                  onClick={handleLinkClick}
                />
                <NavItem
                  to="/deployments"
                  icon="fa-solid fa-rocket"
                  label="Deployments"
                  collapsed={collapsed}
                  onClick={handleLinkClick}
                />
              </div>
            </div>

            {/* Section: ADMINISTRATION (Admin role only) */}
            {currentUser?.role === 'Admin' && (
              <div>
                {collapsed ? (
                  <div
                    className="my-2 border-t border-[#191e2e]/80 mx-2"
                    title="ADMINISTRATION"
                  ></div>
                ) : (
                  <h3 className="px-3 text-[10px] font-bold text-slate-500 sidebar-heading tracking-wider uppercase mb-1">
                    ADMINISTRATION
                  </h3>
                )}
                <div className="space-y-0.5">
                  <NavItem
                    to="/admin"
                    icon="fa-solid fa-shield-halved"
                    label="Admin Panel"
                    collapsed={collapsed}
                    onClick={handleLinkClick}
                  />
                </div>
              </div>
            )}
          </nav>
        </div>

        {/* User Profile Footer */}
        <div className="p-2 border-t border-[#191e2e] sidebar-footer">
          {collapsed ? (
            <div className="flex justify-center relative group/user py-1">
              <div
                className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center font-bold text-white text-xs border border-slate-600 overflow-hidden cursor-pointer hover:ring-2 hover:ring-indigo-500/50 transition shrink-0"
                title={currentUser?.name || 'User Profile'}
              >
                {currentUser?.avatarUrl ? (
                  <img
                    src={currentUser.avatarUrl}
                    alt={currentUser.name}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <span>
                    {currentUser?.name?.charAt(0).toUpperCase() || 'U'}
                  </span>
                )}
              </div>

              {/* Profile Tooltip on Hover when collapsed */}
              <div className="pointer-events-none absolute left-full ml-3 bottom-1 z-50 whitespace-nowrap rounded-lg bg-[#1f2638] border border-[#2d364f] px-2.5 py-1.5 text-xs text-white shadow-2xl opacity-0 invisible group-hover/user:opacity-100 group-hover/user:visible transition-all duration-150">
                <div className="font-semibold">
                  {currentUser?.name || 'User Name'}
                </div>
                <div className="text-[10px] text-slate-400">
                  {currentUser?.role || 'Team Member'}
                </div>
                <div className="absolute right-full top-1/2 -translate-y-1/2 border-4 border-transparent border-r-[#1f2638]"></div>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between p-1.5 rounded-xl sidebar-user-card hover:bg-[#151a29] transition cursor-pointer">
              <div className="flex items-center space-x-2.5 min-w-0">
                <div className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center font-bold text-white text-xs border border-slate-600 overflow-hidden shrink-0">
                  {currentUser?.avatarUrl ? (
                    <img
                      src={currentUser.avatarUrl}
                      alt={currentUser.name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <span>
                      {currentUser?.name?.charAt(0).toUpperCase() || 'U'}
                    </span>
                  )}
                </div>
                <div className="min-w-0">
                  <h4 className="text-xs font-semibold text-white sidebar-user-name leading-tight truncate">
                    {currentUser?.name || 'User Name'}
                  </h4>
                  <p className="text-[10px] text-slate-500 sidebar-user-role leading-tight truncate">
                    {currentUser?.role || 'Team Member'}
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </aside>
    </>
  );
}
