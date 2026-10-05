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

    return {
      physicalCapacityBytes: physicalCapacityBytes.toString(),
      physicalCapacityFormatted: `${Number(physicalCapacityBytes / (1024n * 1024n * 1024n * 1024n))} TB`,
      actualUsedBytes: actualUsedBytes.toString(),
      actualRemainingBytes: actualRemainingBytes.toString(),
      safetyBufferBytes: safetyBufferBytes.toString(),
      totalLogicalPersonalBytes: totalLogicalPersonalBytes.toString(),
      totalLogicalTeamBytes: totalLogicalTeamBytes.toString(),
      totalLogicalAllocatedBytes: totalLogicalAllocatedBytes.toString(),
      isPhysicalPoolExhausted,
      logicalOvercommitRatio: actualUsedBytes > 0n
        ? (Number(totalLogicalAllocatedBytes) / Number(actualUsedBytes)).toFixed(2)
        : '0.00'
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
