const prisma = require('../db');
const { createAuditLog } = require('../utils/audit');

const VALID_ROLES = ['Admin', 'Editor', 'Member', 'Viewer'];

/**
 * Get aggregated team members across all projects accessible to the current user,
 * along with real summary statistics and integration connection statuses (zero secrets).
 */
exports.getTeamData = async (req, res) => {
  try {
    const currentUserId = req.userId;

    // 1. Fetch all projects accessible to current user
    const accessibleProjects = await prisma.project.findMany({
      where: {
        OR: [
          { ownerId: currentUserId },
          { members: { some: { userId: currentUserId } } }
        ]
      },
      include: {
        owner: {
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

    // 2. Aggregate unique users across accessible projects
    const membersMap = new Map();

    accessibleProjects.forEach(proj => {
      // Process owner
      if (proj.owner) {
        const u = proj.owner;
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
            projects: [],
            integrations: u.integrations || []
          });
        }
        const memberData = membersMap.get(u.id);
        if (!memberData.projects.some(p => p.id === proj.id)) {
          memberData.projects.push({
            id: proj.id,
            name: proj.name,
            role: 'Owner'
          });
        }
      }

      // Process project members
      (proj.members || []).forEach(m => {
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
              projects: [],
              integrations: u.integrations || []
            });
          }
          const memberData = membersMap.get(u.id);
          if (!memberData.projects.some(p => p.id === proj.id)) {
            memberData.projects.push({
              id: proj.id,
              name: proj.name,
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

      // Best display role: if any project role is Owner/Admin or system role is Admin
      let displayRole = m.systemRole;
      if (m.projects.some(p => p.role === 'Owner' || p.role === 'Admin')) {
        displayRole = 'Admin';
      } else if (m.projects.some(p => p.role === 'Editor')) {
        displayRole = 'Editor';
      } else if (m.projects.some(p => p.role === 'Member')) {
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
        projectsCount: m.projects.length,
        projects: m.projects,
        githubConnected: Boolean(githubInt),
        githubAccount: githubInt?.accountName || null,
        cloudConnected: cloudInts.length > 0,
        cloudProviders: cloudInts.map(i => i.provider),
        isCurrentUser: m.id === currentUserId
      };
    });

    // 4. Calculate real summary stats
    const adminsCount = members.filter(m => m.role === 'Admin').length;
    const summary = {
      totalMembers: members.length,
      sharedProjects: accessibleProjects.length,
      admins: adminsCount,
      pendingInvites: 0 // Real count, no pending invite table exists in schema
    };

    res.json({
      success: true,
      members,
      summary,
      projects: accessibleProjects.map(p => ({ id: p.id, name: p.name, ownerId: p.ownerId }))
    });
  } catch (error) {
    console.error('Error fetching team data:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

/**
 * Get full member details (safe profile, shared projects, integrations status, recent activities)
 */
exports.getMemberDetails = async (req, res) => {
  try {
    const { userId } = req.params;
    const currentUserId = req.userId;

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
            projectsOwned: true,
            projectMemberships: true,
            tasksAssigned: true,
            filesUploaded: true
          }
        }
      }
    });

    if (!user) {
      return res.status(404).json({ success: false, message: 'Member not found' });
    }

    // Find shared projects between current user and target user
    const sharedProjects = await prisma.project.findMany({
      where: {
        AND: [
          {
            OR: [
              { ownerId: currentUserId },
              { members: { some: { userId: currentUserId } } }
            ]
          },
          {
            OR: [
              { ownerId: userId },
              { members: { some: { userId: userId } } }
            ]
          }
        ]
      },
      select: {
        id: true,
        name: true,
        description: true,
        status: true,
        ownerId: true,
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
        sharedProjects: sharedProjects.map(p => ({
          id: p.id,
          name: p.name,
          description: p.description,
          status: p.status,
          isOwner: p.ownerId === userId,
          role: p.ownerId === userId ? 'Owner' : (p.members[0]?.role || 'Member')
        }))
      },
      recentActivity
    });
  } catch (error) {
    console.error('Error fetching member details:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

/**
 * Add a team member to a project
 */
exports.addTeamMember = async (req, res) => {
  try {
    const { projectId, email, userId, role = 'Member' } = req.body;
    const currentUserId = req.userId;

    if (!projectId) {
      return res.status(400).json({ success: false, message: 'Project is required' });
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

    // Verify current user is project owner or admin
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      include: { members: { where: { userId: currentUserId } } }
    });

    if (!project) {
      return res.status(404).json({ success: false, message: 'Project not found' });
    }

    const isOwner = project.ownerId === currentUserId;
    const currentMember = project.members[0];

    if (!isOwner && (!currentMember || currentMember.role !== 'Admin')) {
      return res.status(403).json({ success: false, message: 'Only project owners or admins can add members' });
    }

    // Check if already owner
    if (project.ownerId === targetUserId) {
      return res.status(400).json({ success: false, message: 'User is already the owner of this project' });
    }

    // Check if already member
    const existingMembership = await prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId, userId: targetUserId } }
    });

    if (existingMembership) {
      return res.status(400).json({ success: false, message: 'User is already a member of this project' });
    }

    const newMember = await prisma.projectMember.create({
      data: {
        projectId,
        userId: targetUserId,
        role: VALID_ROLES.includes(role) ? role : 'Member'
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            avatarUrl: true
          }
        }
      }
    });

    createAuditLog({
      userId: currentUserId,
      action: 'Added',
      entityType: 'TeamMember',
      entityId: newMember.id,
      metadata: {
        projectId,
        projectName: project.name,
        targetUserId,
        role: newMember.role
      }
    });

    res.status(201).json({
      success: true,
      message: 'Member added successfully',
      member: newMember
    });
  } catch (error) {
    console.error('Error adding team member:', error);
    res.status(500).json({ success: false, message: error.message || 'Internal server error' });
  }
};

/**
 * Update member role across a project or in the system
 */
exports.updateMemberRole = async (req, res) => {
  try {
    const { userId } = req.params;
    const { projectId, role } = req.body;
    const currentUserId = req.userId;

    if (!role || !VALID_ROLES.includes(role)) {
      return res.status(400).json({ success: false, message: `Invalid role. Allowed: ${VALID_ROLES.join(', ')}` });
    }

    if (projectId) {
      // Check permission on project
      const project = await prisma.project.findUnique({
        where: { id: projectId },
        include: { members: { where: { userId: currentUserId } } }
      });

      if (!project) {
        return res.status(404).json({ success: false, message: 'Project not found' });
      }

      const isOwner = project.ownerId === currentUserId;
      const currentMember = project.members[0];

      if (!isOwner && (!currentMember || currentMember.role !== 'Admin')) {
        return res.status(403).json({ success: false, message: 'Only project owners or admins can change roles' });
      }

      if (project.ownerId === userId) {
        return res.status(400).json({ success: false, message: 'Cannot change project owner role' });
      }

      const updated = await prisma.projectMember.update({
        where: { projectId_userId: { projectId, userId } },
        data: { role }
      });

      createAuditLog({
        userId: currentUserId,
        action: 'Updated',
        entityType: 'TeamMemberRole',
        entityId: updated.id,
        metadata: { projectId, userId, newRole: role }
      });

      return res.json({ success: true, message: 'Project role updated successfully', member: updated });
    }

    // If no projectId provided, update system user role (if caller is system Admin)
    const caller = await prisma.user.findUnique({
      where: { id: currentUserId },
      select: { role: true }
    });

    if (caller?.role !== 'Admin') {
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
 * Remove member from a project
 */
exports.removeTeamMember = async (req, res) => {
  try {
    const { userId, projectId } = req.params;
    const currentUserId = req.userId;

    const project = await prisma.project.findUnique({
      where: { id: projectId },
      include: { members: { where: { userId: currentUserId } } }
    });

    if (!project) {
      return res.status(404).json({ success: false, message: 'Project not found' });
    }

    const isOwner = project.ownerId === currentUserId;
    const currentMember = project.members[0];

    // Only Admin, Owner, or the user themselves can remove
    if (!isOwner && (!currentMember || currentMember.role !== 'Admin') && currentUserId !== userId) {
      return res.status(403).json({ success: false, message: 'Only Admins or Owners can remove team members' });
    }

    if (project.ownerId === userId) {
      return res.status(400).json({ success: false, message: 'Cannot remove the project owner from their project' });
    }

    const membership = await prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId, userId } }
    });

    if (!membership) {
      return res.status(404).json({ success: false, message: 'Member is not assigned to this project' });
    }

    await prisma.$transaction(async (tx) => {
      // Unassign user from tasks in this project
      await tx.task.updateMany({
        where: { projectId, assigneeId: userId },
        data: { assigneeId: null }
      });

      await tx.projectMember.delete({
        where: { projectId_userId: { projectId, userId } }
      });
    });

    createAuditLog({
      userId: currentUserId,
      action: 'Removed',
      entityType: 'TeamMember',
      entityId: membership.id,
      metadata: { projectId, projectName: project.name, removedUserId: userId }
    });

    res.json({ success: true, message: 'Member removed from project successfully' });
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
const teamService = require('../services/teamService');

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

