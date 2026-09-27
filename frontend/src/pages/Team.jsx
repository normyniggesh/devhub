import { useState, useEffect } from 'react';
import { apiClient } from '../api/client';
import Avatar from '../components/common/Avatar';
import LoadingState from '../components/common/LoadingState';
import ErrorState from '../components/common/ErrorState';

export default function Team() {
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchTeam = async () => {
      try {
        const data = await apiClient('/projects');
        const allProjects = data.projects || [];
        
        // Aggregate unique users and the projects they are in
        const userMap = new Map();
        
        allProjects.forEach(project => {
          // Add owner
          if (!userMap.has(project.owner.id)) {
            userMap.set(project.owner.id, {
              user: project.owner,
              projects: []
            });
          }
          if (!userMap.get(project.owner.id).projects.includes(project.name)) {
            userMap.get(project.owner.id).projects.push(project.name);
          }
          
          // Add members
          project.members.forEach(m => {
            if (!userMap.has(m.user.id)) {
              userMap.set(m.user.id, {
                user: m.user,
                projects: []
              });
            }
            if (!userMap.get(m.user.id).projects.includes(project.name)) {
              userMap.get(m.user.id).projects.push(project.name);
            }
          });
        });
        
        setMembers(Array.from(userMap.values()));
      } catch (err) {
        setError(err.message || 'Failed to fetch team data');
      } finally {
        setLoading(false);
      }
    };
    fetchTeam();
  }, []);

  if (loading) return <LoadingState message="Loading team members..." />;
  if (error) return <ErrorState title="Error Loading Team" message={error} onRetry={() => window.location.reload()} />;

  return (
    <div className="flex flex-col gap-6 max-w-6xl">
      <div>
        <h1 className="text-2xl font-bold text-white tracking-tight">Team</h1>
        <p className="text-xs text-slate-400 mt-0.5">People you collaborate with across your projects.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {members.length > 0 ? (
          members.map(member => (
            <div key={member.user.id} className="bg-[#101524] border border-[#192238] rounded-xl p-5 hover:border-[#2a3655] transition group">
              <div className="flex flex-col items-center text-center">
                <Avatar user={member.user} size="lg" className="mb-3 group-hover:scale-105 transition-transform" />
                <h3 className="text-base font-bold text-white mb-1">{member.user.name}</h3>
                <p className="text-xs text-slate-400 mb-4">{member.user.email}</p>
                
                <div className="w-full">
                  <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2 text-left">
                    Shared Projects ({member.projects.length})
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {member.projects.slice(0, 3).map(pName => (
                      <span key={pName} className="text-[10px] px-2 py-0.5 rounded bg-[#1e293b] text-slate-300 font-medium truncate max-w-full">
                        {pName}
                      </span>
                    ))}
                    {member.projects.length > 3 && (
                      <span className="text-[10px] px-2 py-0.5 rounded bg-[#1e293b] text-slate-400 font-medium">
                        +{member.projects.length - 3} more
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))
        ) : (
          <div className="col-span-full flex flex-col items-center justify-center p-12 bg-[#101524] border border-dashed border-[#232a3f] rounded-2xl">
            <i className="fa-solid fa-users text-4xl text-slate-500 mb-4"></i>
            <h2 className="text-lg font-bold text-white mb-2">No team members yet</h2>
            <p className="text-sm text-slate-400 text-center max-w-md">Invite people to collaborate on your projects and tasks. Your team space will appear here.</p>
          </div>
        )}
      </div>
    </div>
  );
}
