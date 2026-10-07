const prisma = require('../db');
const { createAuditLog } = require('../utils/audit');

const VALID_ROLES = ['Admin', 'Member', 'Viewer'];
const VALID_STATUSES = ['Active', 'Deactivated'];

/**
 * Get high-level overview metrics for Admin Dashboard
 */
exports.getOverview = async (req, res) => {
  try {
    const now = new Date();
    const tenMinutesAgo = new Date(now.getTime() - 10 * 60 * 1000);
    const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    const [
      totalUsers,
      verifiedUsers,
      unverifiedUsers,
      currentlyActive,
      activeRecently,
      totalProjects,
      totalTasks,
      connectedCloud,
      connectedGithub
    ] = await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { emailVerified: true } }),
      prisma.user.count({ where: { emailVerified: false } }),
      prisma.user.count({ where: { lastSeen: { gte: tenMinutesAgo } } }),
      prisma.user.count({ where: { lastSeen: { gte: twentyFourHoursAgo } } }),
      prisma.project.count(),
      prisma.task.count(),
      prisma.userIntegration.count({
        where: {
          provider: { in: ['google_drive', 'dropbox', 'onedrive'] },
          status: 'connected'
        }
      }),
      prisma.userIntegration.count({
        where: {
          provider: 'github',
          status: 'connected'
        }
      })
    ]);

    res.json({
      success: true,
      stats: {
        totalUsers,
        verifiedUsers,
        unverifiedUsers,
        currentlyActive,
        activeRecently,
        totalProjects,
        totalTasks,
        connectedCloud,
        connectedGithub
      }
    });
  } catch (error) {
    console.error('Error fetching admin overview:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

/**
 * List all users with status, verification, last active, connected providers, and personal storage metrics
 */
exports.getUsers = async (req, res) => {
  try {
    const rawUsers = await prisma.user.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        status: true,
        emailVerified: true,
        lastSeen: true,
        avatarUrl: true,
        createdAt: true,
        updatedAt: true,
        personalStorage: {
          select: {
            allocatedBytes: true,
            usedBytes: true
          }
        },
        _count: {
          select: {
            projectsOwned: true,
            projectMemberships: true,
            tasksAssigned: true
          }
        },
        integrations: {
          select: {
            provider: true,
            status: true,
            accountName: true,
            updatedAt: true
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    const users = rawUsers.map((u) => {
      const allocated = u.personalStorage ? BigInt(u.personalStorage.allocatedBytes) : 5368709120n;
      const used = u.personalStorage ? BigInt(u.personalStorage.usedBytes) : 0n;
      const remaining = allocated > used ? allocated - used : 0n;
      const percentage = allocated > 0n ? Number((used * 10000n) / allocated) / 100 : 0;

      return {
        ...u,
        storage: {
          allocatedBytes: allocated.toString(),
          usedBytes: used.toString(),
          remainingBytes: remaining.toString(),
          allocatedGB: Number(allocated / (1024n * 1024n * 1024n)),
          usedGB: (Number(used) / (1024 * 1024 * 1024)).toFixed(3),
          remainingGB: (Number(remaining) / (1024 * 1024 * 1024)).toFixed(3),
          percentage
        }
      };
    });

    res.json({ success: true, users });
  } catch (error) {
    console.error('Error fetching users for admin:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

/**
 * Update user role (Admin, Member, Viewer)
 */
exports.updateUserRole = async (req, res) => {
  try {
    const { id } = req.params;
    const { role } = req.body || {};

    if (!role || !VALID_ROLES.includes(role)) {
      return res.status(400).json({
        success: false,
        message: `Invalid role. Allowed roles are: ${VALID_ROLES.join(', ')}`
      });
    }

    const targetUser = await prisma.user.findUnique({
      where: { id },
      select: { id: true, name: true, email: true, role: true }
    });

    if (!targetUser) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    // Safety guard: Prevent last remaining admin from demoting themselves
    if (targetUser.id === req.userId && role !== 'Admin') {
      const adminCount = await prisma.user.count({ where: { role: 'Admin' } });
      if (adminCount <= 1) {
        return res.status(400).json({
          success: false,
          message: 'Cannot demote the sole administrator of the platform.'
        });
      }
    }

    const previousRole = targetUser.role;
    const updated = await prisma.user.update({
      where: { id },
      data: { role },
      select: { id: true, name: true, email: true, role: true, status: true }
    });

    createAuditLog({
      userId: req.userId,
      action: 'Updated',
      entityType: 'UserRole',
      entityId: updated.id,
      metadata: {
        targetUser: targetUser.email,
        fromRole: previousRole,
        toRole: role,
        changedBy: req.userId
      }
    });

    res.json({
      success: true,
      message: `Role for ${updated.name} updated to ${role}`,
      user: updated
    });
  } catch (error) {
    console.error('Error updating user role:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

/**
 * Activate or Deactivate a user account
 */
exports.updateUserStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body || {};

    if (!status || !VALID_STATUSES.includes(status)) {
      return res.status(400).json({
        success: false,
        message: `Invalid status. Allowed values are: ${VALID_STATUSES.join(', ')}`
      });
    }

    if (id === req.userId && status === 'Deactivated') {
      return res.status(400).json({
        success: false,
        message: 'You cannot deactivate your own account.'
      });
    }

    const targetUser = await prisma.user.findUnique({
      where: { id },
      select: { id: true, name: true, email: true, status: true }
    });

    if (!targetUser) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const updated = await prisma.user.update({
      where: { id },
      data: { status },
      select: { id: true, name: true, email: true, role: true, status: true }
    });

    createAuditLog({
      userId: req.userId,
      action: status === 'Active' ? 'Updated' : 'Deleted',
      entityType: 'UserStatus',
      entityId: updated.id,
      metadata: {
        targetUser: targetUser.email,
        status,
        actionName: status === 'Active' ? 'User Reactivated' : 'User Deactivated',
        changedBy: req.userId
      }
    });

    res.json({
      success: true,
      message: `User account is now ${status}`,
      user: updated
    });
  } catch (error) {
    console.error('Error updating user status:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

/**
 * List all projects with owner and members
 */
exports.getProjects = async (req, res) => {
  try {
    const projects = await prisma.project.findMany({
      include: {
        owner: {
          select: { id: true, name: true, email: true, avatarUrl: true }
        },
        members: {
          include: {
            user: {
              select: { id: true, name: true, email: true, avatarUrl: true }
            }
          }
        },
        _count: {
          select: {
            tasks: true,
            files: true,
            testCases: true,
            repositories: true
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    res.json({ success: true, projects });
  } catch (error) {
    console.error('Error fetching admin projects:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

/**
 * List all teams with leader, member counts, and team storage metrics
 */
exports.getTeams = async (req, res) => {
  try {
    const rawTeams = await prisma.team.findMany({
      include: {
        createdBy: {
          select: { id: true, name: true, email: true, avatarUrl: true }
        },
        members: {
          include: {
            user: {
              select: { id: true, name: true, email: true, avatarUrl: true }
            }
          }
        },
        storageAllocation: true,
        _count: {
          select: { members: true, files: true }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    const teams = rawTeams.map((t) => {
      const leaderMember = t.members.find((m) => m.role === 'Leader');
      const leader = leaderMember ? leaderMember.user : t.createdBy;
      const allocated = t.storageAllocation ? BigInt(t.storageAllocation.allocatedBytes) : 10737418240n;
      const used = t.storageAllocation ? BigInt(t.storageAllocation.usedBytes) : 0n;
      const remaining = allocated > used ? allocated - used : 0n;
      const percentage = allocated > 0n ? Number((used * 10000n) / allocated) / 100 : 0;

      return {
        id: t.id,
        name: t.name,
        description: t.description,
        createdAt: t.createdAt,
        updatedAt: t.updatedAt,
        leader,
        memberCount: t._count.members,
        storage: {
          allocatedBytes: allocated.toString(),
          usedBytes: used.toString(),
          remainingBytes: remaining.toString(),
          allocatedGB: Number(allocated / (1024n * 1024n * 1024n)),
          usedGB: (Number(used) / (1024 * 1024 * 1024)).toFixed(3),
          remainingGB: (Number(remaining) / (1024 * 1024 * 1024)).toFixed(3),
          percentage
        },
        members: t.members.map((m) => ({
          userId: m.userId,
          role: m.role,
          name: m.user.name,
          email: m.user.email,
          avatarUrl: m.user.avatarUrl
        }))
      };
    });

    res.json({ success: true, teams });
  } catch (error) {
    console.error('Error fetching admin teams:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

/**
 * Add a member to a project
 */
exports.addProjectMember = async (req, res) => {
  try {
    const { id: projectId } = req.params;
    const { userId, role = 'Member' } = req.body || {};

    if (!userId) {
      return res.status(400).json({ success: false, message: 'userId is required' });
    }

    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { id: true, name: true, ownerId: true }
    });

    if (!project) {
      return res.status(404).json({ success: false, message: 'Project not found' });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, email: true }
    });

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const member = await prisma.projectMember.upsert({
      where: {
        projectId_userId: { projectId, userId }
      },
      update: { role },
      create: { projectId, userId, role },
      include: {
        user: { select: { id: true, name: true, email: true, avatarUrl: true } }
      }
    });

    createAuditLog({
      userId: req.userId,
      action: 'Added',
      entityType: 'ProjectMember',
      entityId: member.id,
      projectId,
      metadata: {
        projectName: project.name,
        memberEmail: user.email,
        role
      }
    });

    res.json({
      success: true,
      message: `Added ${user.name} to ${project.name}`,
      member
    });
  } catch (error) {
    console.error('Error adding project member:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

/**
 * Remove a member from a project
 */
exports.removeProjectMember = async (req, res) => {
  try {
    const { id: projectId, userId } = req.params;

    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { id: true, name: true, ownerId: true }
    });

    if (!project) {
      return res.status(404).json({ success: false, message: 'Project not found' });
    }

    if (project.ownerId === userId) {
      return res.status(400).json({
        success: false,
        message: 'Cannot remove the project owner from their own project.'
      });
    }

    const member = await prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId, userId } }
    });

    if (!member) {
      return res.status(404).json({ success: false, message: 'User is not a member of this project' });
    }

    await prisma.projectMember.delete({
      where: { id: member.id }
    });

    createAuditLog({
      userId: req.userId,
      action: 'Removed',
      entityType: 'ProjectMember',
      entityId: member.id,
      projectId,
      metadata: {
        projectName: project.name,
        removedUserId: userId
      }
    });

    res.json({
      success: true,
      message: 'Member removed from project successfully'
    });
  } catch (error) {
    console.error('Error removing project member:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

/**
 * Change a member's role within a project
 */
exports.updateProjectMemberRole = async (req, res) => {
  try {
    const { id: projectId, userId } = req.params;
    const { role } = req.body;

    if (!role) {
      return res.status(400).json({ success: false, message: 'Role is required' });
    }

    const member = await prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId, userId } }
    });

    if (!member) {
      return res.status(404).json({ success: false, message: 'Member not found in project' });
    }

    const updated = await prisma.projectMember.update({
      where: { id: member.id },
      data: { role },
      include: {
        user: { select: { id: true, name: true, email: true, avatarUrl: true } }
      }
    });

    createAuditLog({
      userId: req.userId,
      action: 'Updated',
      entityType: 'ProjectMember',
      entityId: member.id,
      projectId,
      metadata: { newRole: role, updatedUserId: userId }
    });

    res.json({
      success: true,
      message: 'Member role updated successfully',
      member: updated
    });
  } catch (error) {
    console.error('Error updating project member role:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

/**
 * Get all connected cloud and provider accounts across all users (NO secrets)
 */
exports.getCloudConnections = async (req, res) => {
  try {
    const connections = await prisma.userIntegration.findMany({
      select: {
        id: true,
        provider: true,
        status: true,
        accountName: true,
        createdAt: true,
        updatedAt: true,
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            avatarUrl: true
          }
        }
      },
      orderBy: { updatedAt: 'desc' }
    });

    res.json({ success: true, connections });
  } catch (error) {
    console.error('Error fetching admin cloud connections:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

/**
 * Get platform-level audit activity feed for Admin Panel
 */
exports.getActivity = async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 40, 100);

    const logs = await prisma.auditLog.findMany({
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        user: {
          select: { id: true, name: true, email: true, avatarUrl: true }
        }
      }
    });

    res.json({ success: true, activity: logs });
  } catch (error) {
    console.error('Error fetching admin activity:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

/**
 * Admin: Create or provision a user directly with automatic verified status and personal storage
 */
exports.createUser = async (req, res) => {
  try {
    const { name, email, password, role = 'Member' } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Email and password required' });
    }
    const cleanEmail = email.toLowerCase().trim();
    const bcrypt = require('bcryptjs');
    const passwordHash = await bcrypt.hash(password, 10);
    const existing = await prisma.user.findUnique({ where: { email: cleanEmail } });
    if (existing) {
      const updated = await prisma.user.update({
        where: { id: existing.id },
        data: {
          name: name ? name.trim() : existing.name,
          passwordHash,
          emailVerified: true,
          status: 'Active'
        }
      });
      const userService = require('../services/userService');
      await userService.initializeUserStorage(updated.id);
      return res.json({ success: true, user: { id: updated.id, email: updated.email, name: updated.name, role: updated.role } });
    }
    const user = await prisma.user.create({
      data: {
        name: (name || 'Test User').trim(),
        email: cleanEmail,
        passwordHash,
        emailVerified: true,
        status: 'Active',
        role: role === 'Admin' ? 'Member' : role
      }
    });
    const userService = require('../services/userService');
    await userService.initializeUserStorage(user.id);
    res.status(201).json({ success: true, user: { id: user.id, email: user.email, name: user.name, role: user.role } });
  } catch (err) {
    console.error('Error creating user via admin:', err);
    res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * Admin: Verify user email directly
 */
exports.verifyUser = async (req, res) => {
  try {
    const { id } = req.params;
    const user = await prisma.user.update({
      where: { id },
      data: {
        emailVerified: true,
        verificationCodeHash: null,
        verificationCodeExpiresAt: null,
        status: 'Active'
      },
      select: { id: true, name: true, email: true, emailVerified: true, role: true, status: true }
    });
    const userService = require('../services/userService');
    await userService.initializeUserStorage(user.id);
    res.json({ success: true, message: 'User verified successfully', user });
  } catch (err) {
    console.error('Error verifying user:', err);
    res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * Admin: Delete a user and clean up all associated records
 */
exports.deleteUser = async (req, res) => {
  try {
    const { id } = req.params;
    if (id === req.userId) {
      return res.status(400).json({ success: false, message: 'Cannot delete own account' });
    }
    await prisma.file.deleteMany({ where: { uploaderId: id } });
    await prisma.folder.deleteMany({ where: { creatorId: id } });
    await prisma.personalStorageAllocation.deleteMany({ where: { userId: id } });
    await prisma.teamMember.deleteMany({ where: { userId: id } });
    await prisma.userIntegration.deleteMany({ where: { userId: id } });
    await prisma.auditLog.deleteMany({ where: { userId: id } });
    await prisma.user.delete({ where: { id } });
    res.json({ success: true, message: 'User deleted successfully' });
  } catch (err) {
    console.error('Error deleting user:', err);
    res.status(500).json({ success: false, message: err.message });
  }
};

