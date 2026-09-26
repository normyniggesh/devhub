import { useState, useEffect, useRef } from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import { useStore } from '../store';
import { apiClient } from '../api/client';

export default function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { currentUser, logout } = useStore();

  const [notifications, setNotifications] = useState([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const notificationRef = useRef(null);

  const fetchNotifications = async () => {
    try {
      const res = await apiClient('/notifications');
      if (res.notifications) {
        setNotifications(res.notifications);
      }
    } catch (err) {
      console.error('Failed to fetch notifications', err);
    }
  };

  useEffect(() => {
    if (currentUser) {
      fetchNotifications();
      // Optional: poll every 60s
      const interval = setInterval(fetchNotifications, 60000);
      return () => clearInterval(interval);
    }
  }, [currentUser]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (notificationRef.current && !notificationRef.current.contains(event.target)) {
        setShowNotifications(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleMarkAsRead = async (id, e) => {
    e.stopPropagation();
    try {
      await apiClient(`/notifications/${id}/read`, { method: 'POST' });
      fetchNotifications();
    } catch (err) {
      console.error(err);
    }
  };

  const handleMarkAllAsRead = async (e) => {
    e.stopPropagation();
    try {
      await apiClient('/notifications/read-all', { method: 'POST' });
      fetchNotifications();
    } catch (err) {
      console.error(err);
    }
  };

  const handleDelete = async (id, e) => {
    e.stopPropagation();
    try {
      await apiClient(`/notifications/${id}`, { method: 'DELETE' });
      fetchNotifications();
    } catch (err) {
      console.error(err);
    }
  };

  const unreadCount = notifications.filter(n => !n.read).length;

  return (
    <div className="min-h-screen flex antialiased selection:bg-indigo-600 selection:text-white text-slate-400">
      <Sidebar isOpen={sidebarOpen} setIsOpen={setSidebarOpen} />
      <main className="flex-1 flex flex-col min-w-0 bg-[#090c13] overflow-x-hidden">
        {/* Top Bar & Search */}
        <div className="hero-banner px-4 md:px-8 pt-4 md:pt-6 pb-6 border-b border-[#161b2b]">
          <div className="flex items-center justify-between gap-4 pb-4 md:pb-6">
            <div className="flex items-center gap-3">
              <button 
                className="md:hidden text-slate-400 hover:text-white transition"
                onClick={() => setSidebarOpen(true)}
              >
                <i className="fa-solid fa-bars text-xl"></i>
              </button>
              <div className="relative w-full max-w-[200px] sm:max-w-xs md:w-96">
                <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 pointer-events-none text-slate-500">
                  <i className="fa-solid fa-magnifying-glass text-xs"></i>
                </span>
                <input className="w-full bg-[#131722]/80 border border-[#232a3f] rounded-xl pl-9 pr-12 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 backdrop-blur-md" placeholder="Search..." type="text" />
                <div className="absolute inset-y-0 right-0 hidden sm:flex items-center pr-3 pointer-events-none">
                  <span className="text-[10px] font-semibold bg-[#1f2638] text-slate-400 px-1.5 py-0.5 rounded border border-[#2d364f]">⌘ K</span>
                </div>
              </div>
            </div>
            
            <div className="flex items-center space-x-3 md:space-x-4 shrink-0">
              {/* Notifications Dropdown */}
              <div className="relative" ref={notificationRef}>
                <button 
                  onClick={() => setShowNotifications(!showNotifications)}
                  className="w-8 h-8 md:w-9 md:h-9 rounded-full bg-[#131722] border border-[#232a3f] flex items-center justify-center text-slate-400 hover:text-white transition relative"
                >
                  <i className="fa-regular fa-bell text-sm"></i>
                  {unreadCount > 0 && (
                    <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full ring-2 ring-[#131722]"></span>
                  )}
                </button>

                {showNotifications && (
                  <div className="absolute right-0 mt-2 w-80 sm:w-96 bg-[#1f2638] rounded-xl shadow-2xl border border-[#2d364f] z-50 overflow-hidden flex flex-col max-h-[80vh]">
                    <div className="px-4 py-3 border-b border-[#2d364f] flex justify-between items-center bg-[#171c2a]">
                      <h3 className="text-sm font-bold text-white">Notifications</h3>
                      {unreadCount > 0 && (
                        <button onClick={handleMarkAllAsRead} className="text-xs text-indigo-400 hover:text-indigo-300">
                          Mark all read
                        </button>
                      )}
                    </div>
                    
                    <div className="overflow-y-auto flex-1">
                      {notifications.length === 0 ? (
                        <div className="p-6 text-center">
                          <i className="fa-regular fa-bell-slash text-2xl text-slate-500 mb-2"></i>
                          <p className="text-xs text-slate-400">You're all caught up!</p>
                        </div>
                      ) : (
                        <div className="divide-y divide-[#2d364f]">
                          {notifications.map(notification => (
                            <div key={notification.id} className={`p-4 hover:bg-[#252d43] transition group ${!notification.read ? 'bg-[#2a3047]/30' : ''}`}>
                              <div className="flex justify-between items-start gap-3">
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 mb-1">
                                    {!notification.read && <div className="w-1.5 h-1.5 rounded-full bg-indigo-500 shrink-0"></div>}
                                    <h4 className={`text-sm truncate ${!notification.read ? 'font-bold text-white' : 'font-medium text-slate-300'}`}>
                                      {notification.title}
                                    </h4>
                                  </div>
                                  <p className="text-xs text-slate-400 line-clamp-2">{notification.message}</p>
                                  <p className="text-[10px] text-slate-500 mt-2">{new Date(notification.createdAt).toLocaleString()}</p>
                                </div>
                                <div className="flex flex-col gap-2 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                                  {!notification.read && (
                                    <button onClick={(e) => handleMarkAsRead(notification.id, e)} className="text-slate-400 hover:text-indigo-400 tooltip-trigger" title="Mark as read">
                                      <i className="fa-solid fa-check text-xs"></i>
                                    </button>
                                  )}
                                  <button onClick={(e) => handleDelete(notification.id, e)} className="text-slate-400 hover:text-red-400" title="Delete">
                                    <i className="fa-solid fa-trash text-xs"></i>
                                  </button>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Avatar Dropdown */}
              <div className="relative group">
                <button className="w-8 h-8 md:w-9 md:h-9 rounded-full ring-2 ring-indigo-500/40 bg-slate-800 flex items-center justify-center text-white text-xs font-bold overflow-hidden">
                  {currentUser?.avatarUrl ? (
                    <img src={currentUser.avatarUrl} alt={currentUser.name} className="w-full h-full object-cover" />
                  ) : (
                    <span>{currentUser?.name?.charAt(0).toUpperCase() || 'U'}</span>
                  )}
                </button>
                <div className="absolute right-0 mt-2 w-48 bg-[#1f2638] rounded-xl shadow-xl border border-[#2d364f] opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50 overflow-hidden">
                  <div className="px-4 py-3 border-b border-[#2d364f]">
                    <p className="text-sm font-medium text-white truncate">{currentUser?.name}</p>
                    <p className="text-xs text-slate-400 truncate">{currentUser?.email}</p>
                  </div>
                  <div className="p-1">
                    <button 
                      onClick={logout}
                      className="w-full text-left px-3 py-2 text-sm text-red-400 hover:bg-red-500/10 hover:text-red-300 rounded-lg transition-colors flex items-center gap-2"
                    >
                      <i className="fa-solid fa-arrow-right-from-bracket"></i>
                      Sign Out
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
        
        {/* Page content */}
        <div className="p-4 md:p-8 space-y-6">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
