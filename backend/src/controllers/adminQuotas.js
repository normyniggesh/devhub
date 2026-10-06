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

    const [personalAllocations, teamAllocations] = await Promise.all([
      prisma.personalStorageAllocation.findMany({
        include: {
          user: {
            select: { id: true, name: true, email: true, role: true }
          }
        },
        orderBy: { createdAt: 'desc' }
      }),
      prisma.teamStorageAllocation.findMany({
        include: {
          team: {
            select: { id: true, name: true, createdById: true }
          }
        },
        orderBy: { createdAt: 'desc' }
      })
    ]);

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
    const { userId, allocatedBytes } = req.body || {};
    if (!userId) {
      return res.status(400).json({ success: false, message: 'userId is required' });
    }
    if (allocatedBytes === undefined || allocatedBytes === null) {
      return res.status(400).json({ success: false, message: 'allocatedBytes is required' });
    }

    const quota = await storageQuotaService.setPersonalQuota(userId, allocatedBytes);

    createAuditLog({
      userId: req.userId,
      action: 'Updated',
      entityType: 'PersonalStorageAllocation',
      entityId: userId,
      metadata: { targetUserId: userId, allocatedBytes: quota.allocatedBytes }
    });

    res.json({
      success: true,
      message: 'Personal storage quota updated successfully.',
      quota
    });
  } catch (err) {
    console.error('[AdminQuotas] setUserQuota error:', err);
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
    const { teamId, allocatedBytes } = req.body || {};
    if (!teamId) {
      return res.status(400).json({ success: false, message: 'teamId is required' });
    }
    if (allocatedBytes === undefined || allocatedBytes === null) {
      return res.status(400).json({ success: false, message: 'allocatedBytes is required' });
    }

    const quota = await storageQuotaService.setTeamQuota(teamId, allocatedBytes);

    createAuditLog({
      userId: req.userId,
      action: 'Updated',
      entityType: 'TeamStorageAllocation',
      entityId: teamId,
      metadata: { targetTeamId: teamId, allocatedBytes: quota.allocatedBytes }
    });

    res.json({
      success: true,
      message: 'Team storage quota updated successfully.',
      quota
    });
  } catch (err) {
    console.error('[AdminQuotas] setTeamQuota error:', err);
    res.status(400).json({ success: false, message: err.message || 'Bad request' });
  }
};

