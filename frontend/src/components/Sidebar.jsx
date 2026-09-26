import { NavLink } from 'react-router-dom';

export default function Sidebar({ isOpen, setIsOpen }) {
  const getPrimaryClass = ({ isActive }) => 
    `flex items-center space-x-3 px-3.5 py-2.5 rounded-xl transition font-semibold text-sm ${isActive ? 'bg-[#5243d4] text-white shadow-md shadow-indigo-600/20' : 'text-slate-400 hover:text-white hover:bg-[#161a28]'}`;

  const getSecondaryClass = ({ isActive }) => 
    `flex items-center space-x-3 px-3.5 py-2 rounded-lg transition font-medium text-[13.5px] ${isActive ? 'bg-[#5243d4] text-white' : 'text-slate-400 hover:text-white hover:bg-[#161a28]'}`;

  const handleLinkClick = () => {
    if (setIsOpen) setIsOpen(false);
  };

  return (
    <>
      {isOpen && (
        <div 
          className="fixed inset-0 bg-black/60 z-30 md:hidden"
          onClick={() => setIsOpen(false)}
        />
      )}
      <aside className={`fixed md:sticky top-0 left-0 h-screen w-64 bg-[#0c0e17] border-r border-[#191e2e] flex flex-col justify-between shrink-0 overflow-y-auto z-40 transition-transform duration-300 ${isOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}`}>
      <div>
        {/* DEVHUB Brand Header */}
        <div className="px-6 py-5">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-purple-600 to-indigo-500 flex items-center justify-center text-white shadow-lg shadow-indigo-600/30">
              <i className="fa-solid fa-bolt text-base"></i>
            </div>
            <span className="text-white font-extrabold text-xl tracking-wider">DEVHUB</span>
          </div>
          <p className="text-[11px] font-medium text-slate-500 tracking-wide mt-1">Build &middot; Learn &middot; Manage &middot; Grow</p>
        </div>
        
        {/* Navigation Links */}
        <nav className="px-3 space-y-6 mt-1">
          {/* Main primary navigation */}
          <div className="space-y-1">
            <NavLink to="/" onClick={handleLinkClick} className={getPrimaryClass} end>
              <i className="fa-solid fa-house text-[15px] w-5 text-center"></i>
              <span>Dashboard</span>
            </NavLink>
            <NavLink to="/activity" onClick={handleLinkClick} className={getPrimaryClass}>
              <i className="fa-regular fa-sun text-[16px] w-5 text-center"></i>
              <span>My Day</span>
            </NavLink>
          </div>
          
          {/* Section: WORKSPACE */}
          <div>
            <h3 className="px-3 text-[11px] font-bold text-slate-500 tracking-wider uppercase mb-2">WORKSPACE</h3>
            <div className="space-y-0.5">
              <NavLink to="/projects" onClick={handleLinkClick} className={getSecondaryClass}>
                <i className="fa-regular fa-folder text-[15px] w-5 text-center"></i>
                <span>Projects</span>
              </NavLink>
              <NavLink to="/tasks" onClick={handleLinkClick} className={getSecondaryClass}>
                <i className="fa-regular fa-square-check text-[15px] w-5 text-center"></i>
                <span>Tasks</span>
              </NavLink>
              <NavLink to="/qa" onClick={handleLinkClick} className={getSecondaryClass}>
                <i className="fa-solid fa-shield-check text-[15px] w-5 text-center"></i>
                <span>QA / Testing</span>
              </NavLink>
              <NavLink to="/calendar" onClick={handleLinkClick} className={getSecondaryClass}>
                <i className="fa-regular fa-calendar text-[15px] w-5 text-center"></i>
                <span>Calendar</span>
              </NavLink>
              <NavLink to="/team" onClick={handleLinkClick} className={getSecondaryClass}>
                <i className="fa-solid fa-user-group text-[14px] w-5 text-center"></i>
                <span>Team</span>
              </NavLink>
              <NavLink to="/files" onClick={handleLinkClick} className={getSecondaryClass}>
                <i className="fa-regular fa-file text-[15px] w-5 text-center"></i>
                <span>Files</span>
              </NavLink>
            </div>
          </div>
          
          {/* Section: DEVELOPMENT */}
          <div>
            <h3 className="px-3 text-[11px] font-bold text-slate-500 tracking-wider uppercase mb-2">DEVELOPMENT</h3>
            <div className="space-y-0.5">
              <NavLink to="/github" onClick={handleLinkClick} className={getSecondaryClass}>
                <i className="fa-brands fa-github text-[16px] w-5 text-center"></i>
                <span>GitHub</span>
              </NavLink>
              <NavLink to="/pull-requests" onClick={handleLinkClick} className={getSecondaryClass}>
                <i className="fa-solid fa-code-pull-request text-[15px] w-5 text-center"></i>
                <span>Pull Requests</span>
              </NavLink>
              <NavLink to="/deployments" onClick={handleLinkClick} className={getSecondaryClass}>
                <i className="fa-solid fa-rocket text-[14px] w-5 text-center"></i>
                <span>Deployments</span>
              </NavLink>
            </div>
          </div>
        </nav>
      </div>
      
      {/* User Profile Footer */}
      <div className="p-3 border-t border-[#191e2e]">
        <div className="flex items-center justify-between p-2 rounded-xl hover:bg-[#151a29] transition cursor-pointer">
          <div className="flex items-center space-x-3">
            <div className="w-9 h-9 rounded-full bg-slate-700 flex items-center justify-center font-bold text-white text-xs border border-slate-600">
              <i className="fa-solid fa-user"></i>
            </div>
            <div>
              <h4 className="text-sm font-semibold text-white leading-tight">User Name</h4>
              <p className="text-[11px] text-slate-500 leading-tight">User Role</p>
            </div>
          </div>
          <i className="fa-solid fa-chevron-down text-slate-500 text-xs"></i>
        </div>
      </div>
    </aside>
    </>
  );
}
