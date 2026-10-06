const prisma = require('../db');
const {
  DEFAULT_PERSONAL_STORAGE_BYTES,
  DEFAULT_TEAM_STORAGE_BYTES,
  STORAGE_SCOPES
} = require('../constants/storage');
const storagePoolService = require('./storagePoolService');

/**
 * Authoritative Storage Quota Service
 *
 * Manages:
 * 1. PersonalStorageAllocation (per User, default 5 GB)
 * 2. TeamStorageAllocation (per Team, default 10 GB)
 * 3. Logical quota checks against user / team allocations
 * 4. Combined check with GlobalStoragePoolService
 */
class StorageQuotaService {
  /**
   * Ensure a user has a PersonalStorageAllocation (creates default 5 GB if missing)
   */
  async ensurePersonalAllocation(userId, defaultBytes = DEFAULT_PERSONAL_STORAGE_BYTES) {
    if (!userId) throw new Error('userId is required');

    let allocation = await prisma.personalStorageAllocation.findUnique({
      where: { userId }
    });

    if (!allocation) {
      allocation = await prisma.personalStorageAllocation.create({
        data: {
          userId,
          allocatedBytes: BigInt(defaultBytes),
          usedBytes: 0n
        }
      });
    }

    return allocation;
  }

  /**
   * Ensure a team has a TeamStorageAllocation (creates default 10 GB if missing)
   */
  async ensureTeamAllocation(teamId, defaultBytes = DEFAULT_TEAM_STORAGE_BYTES) {
    if (!teamId) throw new Error('teamId is required');

    let allocation = await prisma.teamStorageAllocation.findUnique({
      where: { teamId }
    });

    if (!allocation) {
      allocation = await prisma.teamStorageAllocation.create({
        data: {
          teamId,
          allocatedBytes: BigInt(defaultBytes),
          usedBytes: 0n
        }
      });
    }

    return allocation;
  }

  /**
   * Get quota summary for a specific user (Personal Storage)
   */
  async getPersonalQuota(userId) {
    const allocation = await this.ensurePersonalAllocation(userId);
    const allocated = BigInt(allocation.allocatedBytes);

    // Calculate actual personal usage from File records owned by this user
    const agg = await prisma.file.aggregate({
      where: {
        uploaderId: userId,
        storageScope: STORAGE_SCOPES.PERSONAL
      },
      _sum: { size: true }
    });
    const used = BigInt(agg._sum.size || 0);
    const remaining = allocated > used ? allocated - used : 0n;
    const percentage = allocated > 0n ? Number((used * 10000n) / allocated) / 100 : 0;

    return {
      scope: STORAGE_SCOPES.PERSONAL,
      userId,
      allocatedBytes: allocated.toString(),
      usedBytes: used.toString(),
      remainingBytes: remaining.toString(),
      percentage,
      allocatedGB: Number(allocated / (1024n * 1024n * 1024n)),
      usedGB: (Number(used) / (1024 * 1024 * 1024)).toFixed(3),
      remainingGB: (Number(remaining) / (1024 * 1024 * 1024)).toFixed(3)
    };
  }

  /**
   * Get quota summary for a specific team (Team Storage)
   */
  async getTeamQuota(teamId) {
    const allocation = await this.ensureTeamAllocation(teamId);
    const allocated = BigInt(allocation.allocatedBytes);

    // Calculate actual team usage from File records assigned to this team
    const agg = await prisma.file.aggregate({
      where: {
        teamId,
        storageScope: STORAGE_SCOPES.TEAM
      },
      _sum: { size: true }
    });
    const used = BigInt(agg._sum.size || 0);
    const remaining = allocated > used ? allocated - used : 0n;
    const percentage = allocated > 0n ? Number((used * 10000n) / allocated) / 100 : 0;

    return {
      scope: STORAGE_SCOPES.TEAM,
      teamId,
      allocatedBytes: allocated.toString(),
      usedBytes: used.toString(),
      remainingBytes: remaining.toString(),
      percentage,
      allocatedGB: Number(allocated / (1024n * 1024n * 1024n)),
      usedGB: (Number(used) / (1024 * 1024 * 1024)).toFixed(3),
      remainingGB: (Number(remaining) / (1024 * 1024 * 1024)).toFixed(3)
    };
  }

  /**
   * Admin-only: Set personal storage quota
   */
  async setPersonalQuota(userId, newAllocatedBytes) {
    const bytes = BigInt(newAllocatedBytes);
    if (bytes <= 0n) throw new Error('Allocated bytes must be greater than zero');

    const updated = await prisma.personalStorageAllocation.upsert({
      where: { userId },
      update: { allocatedBytes: bytes },
      create: { userId, allocatedBytes: bytes, usedBytes: 0n }
    });

    return await this.getPersonalQuota(userId);
  }

  /**
   * Admin-only: Set team storage quota
   */
  async setTeamQuota(teamId, newAllocatedBytes) {
    const bytes = BigInt(newAllocatedBytes);
    if (bytes <= 0n) throw new Error('Allocated bytes must be greater than zero');

    const updated = await prisma.teamStorageAllocation.upsert({
      where: { teamId },
      update: { allocatedBytes: bytes },
      create: { teamId, allocatedBytes: bytes, usedBytes: 0n }
    });

    return await this.getTeamQuota(teamId);
  }

  /**
   * Validate if an upload can proceed.
   * Checks BOTH:
   * 1. Target logical quota (Personal or Team)
   * 2. Global DEVHUB physical capacity (5 TB pool)
   */
  async validateUpload({ scope, userId, teamId, incomingBytes }) {
    const bytes = BigInt(incomingBytes || 0);

    // 1. Check Global Physical Capacity
    const poolCheck = await storagePoolService.canAcceptUpload(bytes);
    if (!poolCheck.allowed) {
      return poolCheck;
    }

    // 2. Check Logical Quota
    if (scope === STORAGE_SCOPES.TEAM) {
      if (!teamId) return { allowed: false, reason: 'teamId is required for team storage' };
      const teamQuota = await this.getTeamQuota(teamId);
      const remaining = BigInt(teamQuota.remainingBytes);
      if (bytes > remaining) {
        return {
          allowed: false,
          reason: `Team storage quota exceeded. Required: ${Number(bytes)} bytes, Remaining: ${teamQuota.remainingBytes} bytes`
        };
      }
    } else {
      // Personal storage
      if (!userId) return { allowed: false, reason: 'userId is required for personal storage' };
      const personalQuota = await this.getPersonalQuota(userId);
      const remaining = BigInt(personalQuota.remainingBytes);
      if (bytes > remaining) {
        return {
          allowed: false,
          reason: `Personal storage quota exceeded. Required: ${Number(bytes)} bytes, Remaining: ${personalQuota.remainingBytes} bytes`
        };
      }
    }

    return { allowed: true };
  }

  /**
   * Synchronize authoritative usedBytes in PersonalStorageAllocation or TeamStorageAllocation
   * from the database sum of File records.
   *
   * @param {string} scope - STORAGE_SCOPES.PERSONAL or STORAGE_SCOPES.TEAM
   * @param {string} targetId - userId for personal, teamId for team
   * @returns {Promise<bigint>} - updated usedBytes
   */
  async syncUsage(scope, targetId) {
    if (!targetId) return 0n;

    if (scope === STORAGE_SCOPES.TEAM) {
      await this.ensureTeamAllocation(targetId);
      const agg = await prisma.file.aggregate({
        where: { teamId: targetId, storageScope: STORAGE_SCOPES.TEAM },
        _sum: { size: true }
      });
      const usedBytes = BigInt(agg._sum.size || 0);
      await prisma.teamStorageAllocation.updateMany({
        where: { teamId: targetId },
        data: { usedBytes, updatedAt: new Date() }
      });
      return usedBytes;
    } else {
      await this.ensurePersonalAllocation(targetId);
      const agg = await prisma.file.aggregate({
        where: { uploaderId: targetId, storageScope: STORAGE_SCOPES.PERSONAL },
        _sum: { size: true }
      });
      const usedBytes = BigInt(agg._sum.size || 0);
      await prisma.personalStorageAllocation.updateMany({
        where: { userId: targetId },
        data: { usedBytes, updatedAt: new Date() }
      });
      return usedBytes;
    }
  }

  /**
   * Record successful upload accounting.
   */
  async recordUploadSuccess({ scope, userId, teamId, sizeBytes }) {
    if (scope === STORAGE_SCOPES.TEAM && teamId) {
      return await this.syncUsage(STORAGE_SCOPES.TEAM, teamId);
    }
    if (userId) {
      return await this.syncUsage(STORAGE_SCOPES.PERSONAL, userId);
    }
  }

  /**
   * Record successful delete accounting.
   */
  async recordDeleteSuccess({ scope, userId, teamId, sizeBytes }) {
    if (scope === STORAGE_SCOPES.TEAM && teamId) {
      return await this.syncUsage(STORAGE_SCOPES.TEAM, teamId);
    }
    if (userId) {
      return await this.syncUsage(STORAGE_SCOPES.PERSONAL, userId);
    }
  }

  // Deprecated project-based quota methods (kept as no-ops to prevent crashes)

  async getQuota() { return null; }
  async setQuota() { return null; }
  async deactivateQuota() { return null; }
  async listAllocations() { return { poolStatus: await storagePoolService.getPoolStatus(), allocations: [] }; }
}

module.exports = new StorageQuotaService();
