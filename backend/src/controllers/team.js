const prisma = require('../db');
const { createAuditLog } = require('../utils/audit');
const teamService = require('../services/teamService');
const permissionService = require('../services/permissionService');
const { TEAM_ROLES } = require('../constants/storage');

const VALID_ROLES = ['Admin', 'Leader', 'Member', 'Viewer'];

/**
 * Get aggregated team members across all teams accessible to the current user,
 * along with real summary statistics and integration connection statuses (zero secrets).
 */
exports.getTeamData = async (req, res) => {
  try {
    const currentUserId = req.userId;

    const currentUser = await prisma.user.findUnique({
      where: { id: currentUserId },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        avatarUrl: true,
        status: true,
        lastSeen: true,
        createdAt: true,
        integrations: {
          select: {
            provider: true,
            status: true,
            accountName: true
          }
        }
      }
    });

    if (!currentUser) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const isAdmin = permissionService.isAdmin(currentUser);

    // 1. Fetch accessible teams based on role
    let teams = [];
    if (isAdmin) {
      teams = await prisma.team.findMany({
        include: {
          createdBy: {
            select: {
              id: true,
              name: true,
              email: true,
              avatarUrl: true,
              role: true,
              status: true,
              lastSeen: true,
              createdAt: true
            }
          },
          members: {
            include: {
              user: {
                select: {
                  id: true,
                  name: true,
                  email: true,
                  avatarUrl: true,
                  role: true,
                  status: true,
                  lastSeen: true,
                  createdAt: true,
                  integrations: {
                    select: {
                      provider: true,
                      status: true,
                      accountName: true
                    }
                  }
                }
              }
            }
          }
        },
        orderBy: { updatedAt: 'desc' }
      });
    } else {
      teams = await prisma.team.findMany({
        where: {
          OR: [
            { createdById: currentUserId },
            { members: { some: { userId: currentUserId } } }
          ]
        },
        include: {
          createdBy: {
            select: {
              id: true,
              name: true,
              email: true,
              avatarUrl: true,
              role: true,
              status: true,
              lastSeen: true,
              createdAt: true
            }
          },
          members: {
            include: {
              user: {
                select: {
                  id: true,
                  name: true,
                  email: true,
                  avatarUrl: true,
                  role: true,
                  status: true,
                  lastSeen: true,
                  createdAt: true,
                  integrations: {
                    select: {
                      provider: true,
                      status: true,
                      accountName: true
                    }
                  }
                }
              }
            }
          }
        },
        orderBy: { updatedAt: 'desc' }
      });
    }

    // 2. Aggregate unique users across accessible teams
    const membersMap = new Map();

    // Ensure current user is always included in the view
    membersMap.set(currentUser.id, {
      id: currentUser.id,
      name: currentUser.name,
      email: currentUser.email,
      avatarUrl: currentUser.avatarUrl,
      systemRole: currentUser.role || 'Admin',
      status: currentUser.status || 'Active',
      lastSeen: currentUser.lastSeen,
      createdAt: currentUser.createdAt,
      teams: [],
      integrations: currentUser.integrations || []
    });

    teams.forEach(t => {
      // Process team creator
      if (t.createdBy) {
        const u = t.createdBy;
        if (!membersMap.has(u.id)) {
          membersMap.set(u.id, {
            id: u.id,
            name: u.name,
            email: u.email,
            avatarUrl: u.avatarUrl,
            systemRole: u.role || 'Member',
            status: u.status || 'Active',
            lastSeen: u.lastSeen,
            createdAt: u.createdAt,
            teams: [],
            integrations: u.integrations || []
          });
        }
        const memberData = membersMap.get(u.id);
        if (!memberData.teams.some(teamItem => teamItem.id === t.id)) {
          memberData.teams.push({
            id: t.id,
            name: t.name,
            role: 'Leader'
          });
        }
      }

      // Process team members
      (t.members || []).forEach(m => {
        if (m.user) {
          const u = m.user;
          if (!membersMap.has(u.id)) {
            membersMap.set(u.id, {
              id: u.id,
              name: u.name,
              email: u.email,
              avatarUrl: u.avatarUrl,
              systemRole: u.role || 'Member',
              status: u.status || 'Active',
              lastSeen: u.lastSeen,
              createdAt: u.createdAt,
              teams: [],
              integrations: u.integrations || []
            });
          }
          const memberData = membersMap.get(u.id);
          if (!memberData.teams.some(teamItem => teamItem.id === t.id)) {
            memberData.teams.push({
              id: t.id,
              name: t.name,
              role: m.role || 'Member'
            });
          }
        }
      });
    });

    // 3. Format members list
    const members = Array.from(membersMap.values()).map(m => {
      const githubInt = m.integrations.find(i => i.provider === 'github' && i.status === 'connected');
      const cloudInts = m.integrations.filter(i =>
        ['google_drive', 'dropbox', 'onedrive'].includes(i.provider) && i.status === 'connected'
      );

      let displayRole = m.systemRole;
      if (m.systemRole === 'Admin') {
        displayRole = 'Admin';
      } else if (m.teams.some(t => t.role === 'Leader')) {
        displayRole = 'Leader';
      } else {
        displayRole = 'Member';
      }

      return {
        id: m.id,
        name: m.name,
        email: m.email,
        avatarUrl: m.avatarUrl,
        role: displayRole,
        status: m.status,
        lastSeen: m.lastSeen,
        createdAt: m.createdAt,
        teamsCount: m.teams.length,
        teams: m.teams,
        projectsCount: m.teams.length, // UI compatibility alias
        projects: m.teams,             // UI compatibility alias
        githubConnected: Boolean(githubInt),
        githubAccount: githubInt?.accountName || null,
        cloudConnected: cloudInts.length > 0,
        cloudProviders: cloudInts.map(i => i.provider),
        isCurrentUser: m.id === currentUserId
      };
    });

    // 4. Calculate real summary stats
    const adminsCount = members.filter(m => m.role === 'Admin' || m.role === 'Leader').length;
    const summary = {
      totalMembers: members.length,
      sharedProjects: teams.length,
      teamsCount: teams.length,
      admins: adminsCount,
      pendingInvites: 0
    };

    res.json({
      success: true,
      members,
      summary,
      teams: teams.map(t => ({ id: t.id, name: t.name, createdById: t.createdById })),
      projects: teams.map(t => ({ id: t.id, name: t.name, ownerId: t.createdById }))
    });
  } catch (error) {
    console.error('Error fetching team data:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

/**
 * Get full member details (safe profile, shared teams, integrations status, recent activities)
 */
exports.getMemberDetails = async (req, res) => {
  try {
    const { userId } = req.params;
    const currentUserId = req.userId;

    const caller = await prisma.user.findUnique({
      where: { id: currentUserId },
      select: { id: true, role: true }
    });

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        avatarUrl: true,
        role: true,
        status: true,
        emailVerified: true,
        lastSeen: true,
        createdAt: true,
        updatedAt: true,
        integrations: {
          select: {
            provider: true,
            status: true,
            accountName: true,
            updatedAt: true
          }
        },
        _count: {
          select: {
            createdTeams: true,
            teamMemberships: true,
            filesUploaded: true
          }
        }
      }
    });

    if (!user) {
      return res.status(404).json({ success: false, message: 'Member not found' });
    }

    const isAdmin = permissionService.isAdmin(caller);

    // Shared teams between current user and target user
    const teamsWhere = isAdmin
      ? { members: { some: { userId } } }
      : {
          AND: [
            { members: { some: { userId: currentUserId } } },
            { members: { some: { userId } } }
          ]
        };

    const sharedTeams = await prisma.team.findMany({
      where: teamsWhere,
      select: {
        id: true,
        name: true,
        description: true,
        createdById: true,
        members: {
          where: { userId },
          select: { role: true, joinedAt: true }
        }
      }
    });

    // Recent major activity by this user
    const recentActivity = await prisma.auditLog.findMany({
      where: { userId },
      take: 10,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        action: true,
        entityType: true,
        entityId: true,
        metadata: true,
        createdAt: true
      }
    });

    const safeIntegrations = (user.integrations || []).map(i => ({
      provider: i.provider,
      status: i.status,
      accountName: i.accountName,
      connectedAt: i.updatedAt
    }));

    const formattedTeams = sharedTeams.map(t => ({
      id: t.id,
      name: t.name,
      description: t.description,
      isLeader: t.members[0]?.role === 'Leader' || t.createdById === userId,
      role: t.members[0]?.role || (t.createdById === userId ? 'Leader' : 'Member')
    }));

    res.json({
      success: true,
      member: {
        id: user.id,
        name: user.name,
        email: user.email,
        avatarUrl: user.avatarUrl,
        role: user.role,
        status: user.status,
        emailVerified: user.emailVerified,
        lastSeen: user.lastSeen,
        createdAt: user.createdAt,
        counts: user._count,
        integrations: safeIntegrations,
        sharedTeams: formattedTeams,
        sharedProjects: formattedTeams // UI compatibility
      },
      recentActivity
    });
  } catch (error) {
    console.error('Error fetching member details:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

/**
 * Add a member to a team
 */
exports.addTeamMember = async (req, res) => {
  try {
    const { teamId, projectId, email, userId, role = 'Member' } = req.body;
    const targetTeamId = teamId || projectId;
    const currentUserId = req.userId;

    if (!targetTeamId) {
      return res.status(400).json({ success: false, message: 'Team ID is required' });
    }

    let targetUserId = userId;

    if (!targetUserId && email) {
      const cleanEmail = email.trim().toLowerCase();
      const existingUser = await prisma.user.findUnique({
        where: { email: cleanEmail }
      });
      if (!existingUser) {
        return res.status(404).json({ success: false, message: `No user found with email: ${cleanEmail}` });
      }
      targetUserId = existingUser.id;
    }

    if (!targetUserId) {
      return res.status(400).json({ success: false, message: 'User ID or valid email is required' });
    }

    const team = await prisma.team.findUnique({
      where: { id: targetTeamId },
      include: { members: true }
    });

    if (!team) {
      return res.status(404).json({ success: false, message: 'Team not found' });
    }

    const caller = await prisma.user.findUnique({
      where: { id: currentUserId },
      select: { id: true, role: true }
    });

    if (!permissionService.canManageTeam(caller, team.members)) {
      return res.status(403).json({ success: false, message: 'Only Team Leaders or Admins can add members' });
    }

    const newMember = await teamService.addMember({
      teamId: targetTeamId,
      userId: targetUserId,
      role: role === TEAM_ROLES.LEADER ? TEAM_ROLES.LEADER : TEAM_ROLES.MEMBER
    });

    createAuditLog({
      userId: currentUserId,
      action: 'Added',
      entityType: 'TeamMember',
      entityId: newMember.id,
      metadata: {
        teamId: targetTeamId,
        teamName: team.name,
        targetUserId,
        role: newMember.role
      }
    });

    res.status(201).json({
      success: true,
      message: 'Member added to team successfully',
      member: newMember
    });
  } catch (error) {
    console.error('Error adding team member:', error);
    res.status(500).json({ success: false, message: error.message || 'Internal server error' });
  }
};

/**
 * Update member role across a team or in the system
 */
exports.updateMemberRole = async (req, res) => {
  try {
    const { userId } = req.params;
    const { teamId, projectId, role } = req.body;
    const currentUserId = req.userId;
    const targetTeamId = teamId || projectId;

    const caller = await prisma.user.findUnique({
      where: { id: currentUserId },
      select: { id: true, role: true }
    });

    if (targetTeamId) {
      const team = await prisma.team.findUnique({
        where: { id: targetTeamId },
        include: { members: true }
      });

      if (!team) {
        return res.status(404).json({ success: false, message: 'Team not found' });
      }

      if (!permissionService.canManageTeam(caller, team.members)) {
        return res.status(403).json({ success: false, message: 'Only Team Leaders or Admins can change team roles' });
      }

      const updated = await teamService.updateMemberRole({
        teamId: targetTeamId,
        userId,
        role: role === TEAM_ROLES.LEADER ? TEAM_ROLES.LEADER : TEAM_ROLES.MEMBER
      });

      createAuditLog({
        userId: currentUserId,
        action: 'Updated',
        entityType: 'TeamMemberRole',
        entityId: updated.id,
        metadata: { teamId: targetTeamId, userId, newRole: role }
      });

      return res.json({ success: true, message: 'Team role updated successfully', member: updated });
    }

    // If no targetTeamId provided, update global system role (Admin only)
    if (!permissionService.isAdmin(caller)) {
      return res.status(403).json({ success: false, message: 'Only Admins can update global member roles' });
    }

    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: { role }
    });

    createAuditLog({
      userId: currentUserId,
      action: 'Updated',
      entityType: 'UserRole',
      entityId: userId,
      metadata: { newRole: role }
    });

    res.json({ success: true, message: 'Member role updated successfully', user: updatedUser });
  } catch (error) {
    console.error('Error updating member role:', error);
    res.status(500).json({ success: false, message: error.message || 'Internal server error' });
  }
};

/**
 * Remove member from a team
 */
exports.removeTeamMember = async (req, res) => {
  try {
    const { userId, teamId, projectId } = req.params;
    const targetTeamId = teamId || projectId;
    const currentUserId = req.userId;

    const team = await prisma.team.findUnique({
      where: { id: targetTeamId },
      include: { members: true }
    });

    if (!team) {
      return res.status(404).json({ success: false, message: 'Team not found' });
    }

    const caller = await prisma.user.findUnique({
      where: { id: currentUserId },
      select: { id: true, role: true }
    });

    // Only Admin, Leader, or the member themselves can remove
    if (!permissionService.canManageTeam(caller, team.members) && currentUserId !== userId) {
      return res.status(403).json({ success: false, message: 'Only Team Leaders or Admins can remove members' });
    }

    if (team.createdById === userId && currentUserId !== userId) {
      return res.status(400).json({ success: false, message: 'Cannot remove the team creator' });
    }

    await teamService.removeMember({ teamId: targetTeamId, userId });

    createAuditLog({
      userId: currentUserId,
      action: 'Removed',
      entityType: 'TeamMember',
      entityId: `${targetTeamId}_${userId}`,
      metadata: { teamId: targetTeamId, teamName: team.name, removedUserId: userId }
    });

    res.json({ success: true, message: 'Member removed from team successfully' });
  } catch (error) {
    console.error('Error removing team member:', error);
    res.status(500).json({ success: false, message: error.message || 'Internal server error' });
  }
};

/**
 * =========================================================================
 * REAL TEAM ENTITY CONTROLLERS (New User/Team Foundation)
 * =========================================================================
 */

/**
 * List teams for current user
 */
exports.getMyTeams = async (req, res) => {
  try {
    const teams = await teamService.getUserTeams(req.userId);
    res.json({ success: true, teams });
  } catch (err) {
    console.error('Error getting user teams:', err);
    res.status(500).json({ success: false, message: err.message || 'Internal server error' });
  }
};

/**
 * Create a new team (auto-allocates 10 GB)
 */
exports.createTeam = async (req, res) => {
  try {
    const { name, description } = req.body || {};
    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, message: 'Team name is required' });
    }
    const team = await teamService.createTeam({
      name,
      description,
      createdById: req.userId
    });
    res.status(201).json({ success: true, team });
  } catch (err) {
    console.error('Error creating team:', err);
    res.status(400).json({ success: false, message: err.message || 'Bad request' });
  }
};

/**
 * Get single team by ID with quota and members
 */
exports.getTeamEntity = async (req, res) => {
  try {
    const { id } = req.params;
    const team = await teamService.getTeamById(id);
    if (!team) {
      return res.status(404).json({ success: false, message: 'Team not found' });
    }
    res.json({ success: true, team });
  } catch (err) {
    console.error('Error getting team entity:', err);
    res.status(500).json({ success: false, message: err.message || 'Internal server error' });
  }
};

/**
 * Delete team entity (Team Leader or Admin only)
 */
exports.deleteTeam = async (req, res) => {
  try {
    const { id } = req.params;
    const currentUserId = req.userId;

    const team = await prisma.team.findUnique({
      where: { id },
      include: { members: true }
    });

    if (!team) {
      return res.status(404).json({ success: false, message: 'Team not found' });
    }

    const caller = await prisma.user.findUnique({
      where: { id: currentUserId },
      select: { id: true, role: true }
    });

    if (!permissionService.canManageTeam(caller, team.members)) {
      return res.status(403).json({ success: false, message: 'Only Team Leaders or Admins can delete teams' });
    }

    await teamService.deleteTeam(id);

    createAuditLog({
      userId: currentUserId,
      action: 'Deleted',
      entityType: 'Team',
      entityId: id,
      metadata: { name: team.name }
    });

    res.json({ success: true, message: 'Team deleted successfully' });
  } catch (err) {
    console.error('Error deleting team:', err);
    res.status(500).json({ success: false, message: err.message || 'Internal server error' });
  }
};

