const prisma = require('../db');
const storageQuotaService = require('../services/storageQuotaService');
const storagePoolService = require('../services/storagePoolService');
const { createAuditLog } = require('../utils/audit');

/**
 * List global storage pool summary, personal allocations, and team allocations (Admin only)
 */
exports.listAllocations = async (req, res) => {
  try {
    const poolStatus = await storagePoolService.getPoolStatus();

    const [personalRaw, teamRaw] = await Promise.all([
      prisma.personalStorageAllocation.findMany({
        include: {
          user: {
            select: { id: true, name: true, email: true, role: true, status: true, avatarUrl: true }
          }
        },
        orderBy: { createdAt: 'desc' }
      }),
      prisma.teamStorageAllocation.findMany({
        include: {
          team: {
            select: {
              id: true,
              name: true,
              description: true,
              createdById: true,
              createdBy: { select: { id: true, name: true, email: true, avatarUrl: true } },
              members: {
                select: {
                  userId: true,
                  role: true,
                  user: { select: { id: true, name: true, email: true, avatarUrl: true } }
                }
              },
              _count: { select: { members: true, files: true } }
            }
          }
        },
        orderBy: { createdAt: 'desc' }
      })
    ]);

    const personalAllocations = personalRaw.map((a) => {
      const allocated = BigInt(a.allocatedBytes);
      const used = BigInt(a.usedBytes);
      const remaining = allocated > used ? allocated - used : 0n;
      const percentage = allocated > 0n ? Number((used * 10000n) / allocated) / 100 : 0;
      return {
        id: a.id,
        userId: a.userId,
        allocatedBytes: allocated.toString(),
        usedBytes: used.toString(),
        remainingBytes: remaining.toString(),
        allocatedGB: Number(allocated / (1024n * 1024n * 1024n)),
        usedGB: (Number(used) / (1024 * 1024 * 1024)).toFixed(3),
        remainingGB: (Number(remaining) / (1024 * 1024 * 1024)).toFixed(3),
        percentage,
        user: a.user,
        createdAt: a.createdAt,
        updatedAt: a.updatedAt
      };
    });

    const teamAllocations = teamRaw.map((a) => {
      const allocated = BigInt(a.allocatedBytes);
      const used = BigInt(a.usedBytes);
      const remaining = allocated > used ? allocated - used : 0n;
      const percentage = allocated > 0n ? Number((used * 10000n) / allocated) / 100 : 0;
      const leaderMember = a.team?.members?.find((m) => m.role === 'Leader');
      const leader = leaderMember ? leaderMember.user : a.team?.createdBy;

      return {
        id: a.id,
        teamId: a.teamId,
        allocatedBytes: allocated.toString(),
        usedBytes: used.toString(),
        remainingBytes: remaining.toString(),
        allocatedGB: Number(allocated / (1024n * 1024n * 1024n)),
        usedGB: (Number(used) / (1024 * 1024 * 1024)).toFixed(3),
        remainingGB: (Number(remaining) / (1024 * 1024 * 1024)).toFixed(3),
        percentage,
        team: a.team,
        leader,
        memberCount: a.team?._count?.members || 0,
        createdAt: a.createdAt,
        updatedAt: a.updatedAt
      };
    });

    res.json({
      success: true,
      poolStatus,
      personalAllocations,
      teamAllocations
    });
  } catch (err) {
    console.error('[AdminQuotas] listAllocations error:', err);
    res.status(500).json({ success: false, message: err.message || 'Internal server error' });
  }
};

/**
 * Get quota for a specific user (Personal Storage)
 */
exports.getUserQuota = async (req, res) => {
  try {
    const { userId } = req.params;
    if (!userId) {
      return res.status(400).json({ success: false, message: 'userId is required' });
    }
    const quota = await storageQuotaService.getPersonalQuota(userId);
    res.json({ success: true, quota });
  } catch (err) {
    console.error('[AdminQuotas] getUserQuota error:', err);
    res.status(500).json({ success: false, message: err.message || 'Internal server error' });
  }
};

/**
 * Admin-only: Update personal storage quota for a user
 */
exports.setUserQuota = async (req, res) => {
  try {
    const { userId, allocatedBytes, allocatedGB } = req.body || {};
    if (!userId) {
      return res.status(400).json({ success: false, message: 'userId is required' });
    }

    let targetBytes;
    if (allocatedBytes !== undefined && allocatedBytes !== null) {
      targetBytes = allocatedBytes;
    } else if (allocatedGB !== undefined && allocatedGB !== null) {
      const parsedGB = Number(allocatedGB);
      if (isNaN(parsedGB) || parsedGB <= 0) {
        return res.status(400).json({ success: false, message: 'allocatedGB must be a positive number' });
      }
      targetBytes = BigInt(Math.round(parsedGB * 1024 * 1024 * 1024)).toString();
    } else {
      return res.status(400).json({ success: false, message: 'allocatedBytes or allocatedGB is required' });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, email: true }
    });
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const oldQuota = await storageQuotaService.getPersonalQuota(userId);
    const updatedQuota = await storageQuotaService.setPersonalQuota(userId, targetBytes);

    await createAuditLog({
      userId: req.userId,
      action: 'Updated',
      entityType: 'PersonalStorageAllocation',
      entityId: userId,
      metadata: {
        targetUserId: userId,
        targetUserEmail: user.email,
        oldAllocatedBytes: oldQuota.allocatedBytes,
        newAllocatedBytes: updatedQuota.allocatedBytes,
        oldAllocatedGB: oldQuota.allocatedGB,
        newAllocatedGB: updatedQuota.allocatedGB,
        actionType: 'user_quota_change'
      }
    });

    res.json({
      success: true,
      message: 'Personal storage quota updated successfully.',
      quota: updatedQuota
    });
  } catch (err) {
    console.error('[AdminQuotas] setUserQuota error:', err.message);
    res.status(400).json({ success: false, message: err.message || 'Bad request' });
  }
};

/**
 * Get quota for a specific team (Team Storage)
 */
exports.getTeamQuota = async (req, res) => {
  try {
    const { teamId } = req.params;
    if (!teamId) {
      return res.status(400).json({ success: false, message: 'teamId is required' });
    }
    const quota = await storageQuotaService.getTeamQuota(teamId);
    res.json({ success: true, quota });
  } catch (err) {
    console.error('[AdminQuotas] getTeamQuota error:', err);
    res.status(500).json({ success: false, message: err.message || 'Internal server error' });
  }
};

/**
 * Admin-only: Update team storage quota for a team
 */
exports.setTeamQuota = async (req, res) => {
  try {
    const { teamId, allocatedBytes, allocatedGB } = req.body || {};
    if (!teamId) {
      return res.status(400).json({ success: false, message: 'teamId is required' });
    }

    let targetBytes;
    if (allocatedBytes !== undefined && allocatedBytes !== null) {
      targetBytes = allocatedBytes;
    } else if (allocatedGB !== undefined && allocatedGB !== null) {
      const parsedGB = Number(allocatedGB);
      if (isNaN(parsedGB) || parsedGB <= 0) {
        return res.status(400).json({ success: false, message: 'allocatedGB must be a positive number' });
      }
      targetBytes = BigInt(Math.round(parsedGB * 1024 * 1024 * 1024)).toString();
    } else {
      return res.status(400).json({ success: false, message: 'allocatedBytes or allocatedGB is required' });
    }

    const team = await prisma.team.findUnique({
      where: { id: teamId },
      select: { id: true, name: true }
    });
    if (!team) {
      return res.status(404).json({ success: false, message: 'Team not found' });
    }

    const oldQuota = await storageQuotaService.getTeamQuota(teamId);
    const updatedQuota = await storageQuotaService.setTeamQuota(teamId, targetBytes);

    await createAuditLog({
      userId: req.userId,
      action: 'Updated',
      entityType: 'TeamStorageAllocation',
      entityId: teamId,
      metadata: {
        targetTeamId: teamId,
        targetTeamName: team.name,
        oldAllocatedBytes: oldQuota.allocatedBytes,
        newAllocatedBytes: updatedQuota.allocatedBytes,
        oldAllocatedGB: oldQuota.allocatedGB,
        newAllocatedGB: updatedQuota.allocatedGB,
        actionType: 'team_quota_change'
      }
    });

    res.json({
      success: true,
      message: 'Team storage quota updated successfully.',
      quota: updatedQuota
    });
  } catch (err) {
    console.error('[AdminQuotas] setTeamQuota error:', err.message);
    res.status(400).json({ success: false, message: err.message || 'Bad request' });
  }
};
