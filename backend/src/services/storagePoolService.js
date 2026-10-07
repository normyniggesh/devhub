const prisma = require('../db');
const {
  GLOBAL_PHYSICAL_CAPACITY_BYTES,
  GLOBAL_SAFETY_BUFFER_BYTES,
  STORAGE_CONSTANTS
} = require('../constants/storage');

/**
 * Authoritative Global Storage Pool Service
 *
 * Tracks:
 * - Physical Capacity: 5 TB
 * - Actual Used Bytes across all stored files
 * - Actual Remaining Physical Capacity
 * - Total Logical Personal Allocations
 * - Total Logical Team Allocations
 * - Safety Buffer Enforcement
 */
class StoragePoolService {
  /**
   * Calculates current global storage statistics
   */
  async getPoolStatus() {
    // 1. Calculate actual used physical bytes from File records
    const fileSumResult = await prisma.file.aggregate({
      _sum: { size: true }
    });
    const actualUsedBytes = BigInt(fileSumResult._sum.size || 0);

    // 2. Physical capacity and remaining
    const physicalCapacityBytes = GLOBAL_PHYSICAL_CAPACITY_BYTES;
    const safetyBufferBytes = GLOBAL_SAFETY_BUFFER_BYTES;
    const actualRemainingBytes = physicalCapacityBytes > actualUsedBytes
      ? physicalCapacityBytes - actualUsedBytes
      : 0n;

    // 3. Aggregate total logical personal allocations
    const personalAllocResult = await prisma.personalStorageAllocation.aggregate({
      _sum: { allocatedBytes: true }
    });
    const totalLogicalPersonalBytes = BigInt(personalAllocResult._sum.allocatedBytes || 0);

    // 4. Aggregate total logical team allocations
    const teamAllocResult = await prisma.teamStorageAllocation.aggregate({
      _sum: { allocatedBytes: true }
    });
    const totalLogicalTeamBytes = BigInt(teamAllocResult._sum.allocatedBytes || 0);

    // 5. Total logical allocations (may exceed physical 5 TB capacity)
    const totalLogicalAllocatedBytes = totalLogicalPersonalBytes + totalLogicalTeamBytes;

    // 6. Check if physical pool has available capacity including safety buffer
    const usablePhysicalBytes = physicalCapacityBytes > safetyBufferBytes
      ? physicalCapacityBytes - safetyBufferBytes
      : 0n;
    const isPhysicalPoolExhausted = actualUsedBytes >= usablePhysicalBytes;

    const physicalCapacityGB = Number(physicalCapacityBytes / (1024n * 1024n * 1024n));
    const safetyBufferGB = Number(safetyBufferBytes / (1024n * 1024n * 1024n));
    const actualUsedGB = (Number(actualUsedBytes) / (1024 * 1024 * 1024)).toFixed(3);
    const actualRemainingGB = (Number(actualRemainingBytes) / (1024 * 1024 * 1024)).toFixed(3);
    const totalLogicalPersonalGB = (Number(totalLogicalPersonalBytes) / (1024 * 1024 * 1024)).toFixed(2);
    const totalLogicalTeamGB = (Number(totalLogicalTeamBytes) / (1024 * 1024 * 1024)).toFixed(2);
    const allocatedGB = (Number(totalLogicalAllocatedBytes) / (1024 * 1024 * 1024)).toFixed(2);
    const poolPercentage = physicalCapacityBytes > 0n ? Number((actualUsedBytes * 10000n) / physicalCapacityBytes) / 100 : 0;
    const allocatedPercentage = physicalCapacityBytes > 0n ? Number((totalLogicalAllocatedBytes * 10000n) / physicalCapacityBytes) / 100 : 0;

    // 7. Aggregate counts and highest-usage users/teams
    const [userCount, teamCount, highestUsersRaw, highestTeamsRaw] = await Promise.all([
      prisma.user.count(),
      prisma.team.count(),
      prisma.personalStorageAllocation.findMany({
        take: 5,
        orderBy: { usedBytes: 'desc' },
        include: {
          user: { select: { id: true, name: true, email: true, avatarUrl: true, role: true } }
        }
      }),
      prisma.teamStorageAllocation.findMany({
        take: 5,
        orderBy: { usedBytes: 'desc' },
        include: {
          team: {
            select: {
              id: true,
              name: true,
              createdBy: { select: { id: true, name: true, email: true } },
              _count: { select: { members: true } }
            }
          }
        }
      })
    ]);

    const highestUsageUsers = highestUsersRaw.map((u) => {
      const allocated = BigInt(u.allocatedBytes);
      const used = BigInt(u.usedBytes);
      const remaining = allocated > used ? allocated - used : 0n;
      const pct = allocated > 0n ? Number((used * 10000n) / allocated) / 100 : 0;
      return {
        userId: u.userId,
        name: u.user?.name || 'User',
        email: u.user?.email || '',
        role: u.user?.role || 'User',
        allocatedBytes: allocated.toString(),
        usedBytes: used.toString(),
        remainingBytes: remaining.toString(),
        allocatedGB: Number(allocated / (1024n * 1024n * 1024n)),
        usedGB: (Number(used) / (1024 * 1024 * 1024)).toFixed(3),
        remainingGB: (Number(remaining) / (1024 * 1024 * 1024)).toFixed(3),
        percentage: pct
      };
    });

    const highestUsageTeams = highestTeamsRaw.map((t) => {
      const allocated = BigInt(t.allocatedBytes);
      const used = BigInt(t.usedBytes);
      const remaining = allocated > used ? allocated - used : 0n;
      const pct = allocated > 0n ? Number((used * 10000n) / allocated) / 100 : 0;
      return {
        teamId: t.teamId,
        name: t.team?.name || 'Unnamed Team',
        leaderName: t.team?.createdBy?.name || 'Leader',
        memberCount: t.team?._count?.members || 0,
        allocatedBytes: allocated.toString(),
        usedBytes: used.toString(),
        remainingBytes: remaining.toString(),
        allocatedGB: Number(allocated / (1024n * 1024n * 1024n)),
        usedGB: (Number(used) / (1024 * 1024 * 1024)).toFixed(3),
        remainingGB: (Number(remaining) / (1024 * 1024 * 1024)).toFixed(3),
        percentage: pct
      };
    });

    return {
      physicalCapacityBytes: physicalCapacityBytes.toString(),
      physicalCapacityFormatted: `${Number(physicalCapacityBytes / (1024n * 1024n * 1024n * 1024n))} TB`,
      physicalCapacityGB,
      physicalCapacityTB: 5,
      actualUsedBytes: actualUsedBytes.toString(),
      actualUsedGB,
      actualRemainingBytes: actualRemainingBytes.toString(),
      actualRemainingGB,
      safetyBufferBytes: safetyBufferBytes.toString(),
      safetyBufferGB,
      totalLogicalPersonalBytes: totalLogicalPersonalBytes.toString(),
      totalLogicalPersonalGB,
      totalLogicalTeamBytes: totalLogicalTeamBytes.toString(),
      totalLogicalTeamGB,
      totalLogicalAllocatedBytes: totalLogicalAllocatedBytes.toString(),
      allocatedGB,
      poolPercentage,
      allocatedPercentage,
      isPhysicalPoolExhausted,
      logicalOvercommitRatio: actualUsedBytes > 0n
        ? (Number(totalLogicalAllocatedBytes) / Number(actualUsedBytes)).toFixed(2)
        : '0.00',
      userCount,
      teamCount,
      highestUsageUsers,
      highestUsageTeams
    };
  }

  /**
   * Verify if incoming upload can physically fit in the DEVHUB storage pool
   *
   * @param {bigint|number|string} incomingBytes
   * @returns {Promise<{allowed: boolean, reason?: string}>}
   */
  async canAcceptUpload(incomingBytes) {
    const bytesToAdd = BigInt(incomingBytes || 0);
    if (bytesToAdd <= 0n) return { allowed: true };

    const pool = await this.getPoolStatus();
    const currentUsed = BigInt(pool.actualUsedBytes);
    const capacity = GLOBAL_PHYSICAL_CAPACITY_BYTES;
    const buffer = GLOBAL_SAFETY_BUFFER_BYTES;

    const maxAllowed = capacity > buffer ? capacity - buffer : 0n;
    if (currentUsed + bytesToAdd > maxAllowed) {
      return {
        allowed: false,
        reason: 'DEVHUB Cloud physical storage capacity exceeded (safety threshold reached).'
      };
    }

    return { allowed: true };
  }
}

module.exports = new StoragePoolService();
