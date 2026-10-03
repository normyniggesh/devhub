const crypto = require('crypto');
const prisma = require('../db');

// Owner Google Drive DEVHUB Pool Limit: 5 TB
const TOTAL_DEVHUB_POOL_BYTES = process.env.TOTAL_STORAGE_POOL_BYTES
  ? BigInt(process.env.TOTAL_STORAGE_POOL_BYTES)
  : 5n * 1024n * 1024n * 1024n * 1024n; // 5,497,558,138,880 bytes (5 TB)

/**
 * Format a quota allocation object for API consumption with serializable strings and numbers.
 */
function formatQuotaForApi(allocation, usedBytes) {
  if (!allocation) return null;
  const allocated = BigInt(allocation.allocatedBytes);
  const reserved = BigInt(allocation.reservedBytes || 0n);
  const used = BigInt(usedBytes !== undefined ? usedBytes : 0n);
  const occupied = used + reserved;
  const remaining = allocated > occupied ? allocated - occupied : 0n;
  const percentage = allocated > 0n ? Number((used * 10000n) / allocated) / 100 : 0;

  return {
    id: allocation.id,
    projectId: allocation.projectId,
    name: allocation.name || allocation.project?.name || null,
    allocatedBytes: allocated.toString(),
    usedBytes: used.toString(),
    reservedBytes: reserved.toString(),
    remainingBytes: remaining.toString(),
    allocatedNumber: Number(allocated),
    usedNumber: Number(used),
    remainingNumber: Number(remaining),
    percentage,
    isActive: allocation.isActive,
    project: allocation.project ? {
      id: allocation.project.id,
      name: allocation.project.name,
      owner: allocation.project.owner ? {
        id: allocation.project.owner.id,
        name: allocation.project.owner.name,
        email: allocation.project.owner.email
      } : undefined
    } : undefined,
    createdAt: allocation.createdAt,
    updatedAt: allocation.updatedAt
  };
}

/**
 * Calculates current Google Drive-backed storage usage for a DEVHUB project.
 * Only files with storageProvider = 'google_drive' are counted.
 *
 * @param {string} projectId
 * @returns {Promise<bigint>}
 */
async function getUsage(projectId) {
  if (!projectId) return 0n;
  const agg = await prisma.file.aggregate({
    where: {
      projectId,
      storageProvider: 'google_drive'
    },
    _sum: {
      size: true
    }
  });
  return agg._sum.size !== null && agg._sum.size !== undefined ? BigInt(agg._sum.size) : 0n;
}

/**
 * Retrieves the storage quota, usage, and remaining capacity for a project.
 *
 * @param {string} projectId
 * @returns {Promise<object|null>}
 */
async function getQuota(projectId) {
  if (!projectId) return null;
  const allocation = await prisma.storageAllocation.findUnique({
    where: { projectId },
    include: {
      project: {
        select: {
          id: true,
          name: true,
          owner: { select: { id: true, name: true, email: true } }
        }
      }
    }
  });

  if (!allocation) return null;

  const used = await getUsage(projectId);
  return formatQuotaForApi(allocation, used);
}

/**
 * Retrieves the total DEVHUB Google Drive storage pool status across all projects.
 */
async function getPoolSummary() {
  const allocations = await prisma.storageAllocation.findMany({
    where: { isActive: true }
  });

  const totalAllocated = allocations.reduce((sum, a) => sum + BigInt(a.allocatedBytes), 0n);
  const remainingPool = TOTAL_DEVHUB_POOL_BYTES > totalAllocated
    ? TOTAL_DEVHUB_POOL_BYTES - totalAllocated
    : 0n;

  return {
    totalPoolBytes: TOTAL_DEVHUB_POOL_BYTES.toString(),
    totalAllocatedBytes: totalAllocated.toString(),
    remainingPoolBytes: remainingPool.toString(),
    totalPoolNumber: Number(TOTAL_DEVHUB_POOL_BYTES),
    totalAllocatedNumber: Number(totalAllocated),
    remainingPoolNumber: Number(remainingPool),
    totalAllocationsCount: allocations.length,
    poolPercentage: Number((totalAllocated * 10000n) / TOTAL_DEVHUB_POOL_BYTES) / 100
  };
}

/**
 * Lists all project storage allocations with current usage and available bytes.
 */
async function listAllocations() {
  const allocations = await prisma.storageAllocation.findMany({
    include: {
      project: {
        select: {
          id: true,
          name: true,
          owner: { select: { id: true, name: true, email: true } }
        }
      }
    },
    orderBy: { createdAt: 'desc' }
  });

  const results = [];
  for (const alloc of allocations) {
    const used = await getUsage(alloc.projectId);
    results.push(formatQuotaForApi(alloc, used));
  }

  const poolSummary = await getPoolSummary();

  return {
    allocations: results,
    pool: poolSummary
  };
}

/**
 * Sets, creates, or updates a storage quota for a project.
 * Enforces validation:
 * - quota >= 0
 * - quota > 0 if active
 * - does not exceed total pool
 * - does not reduce below current usage (unless allowUsageTruncate is true)
 */
async function setQuota({ projectId, allocatedBytes, name, isActive = true, allowUsageTruncate = false }) {
  if (!projectId) throw new Error('projectId is required');
  const bytes = BigInt(allocatedBytes);

  if (bytes < 0n) {
    throw new Error('Storage quota cannot be negative.');
  }

  if (isActive && bytes === 0n) {
    throw new Error('Storage quota cannot be zero for an active allocation.');
  }

  const project = await prisma.project.findUnique({
    where: { id: projectId }
  });
  if (!project) {
    throw new Error(`Project not found: ${projectId}`);
  }

  // Check current usage
  const currentUsage = await getUsage(projectId);
  if (!allowUsageTruncate && bytes < currentUsage) {
    throw new Error(`Cannot reduce quota to ${bytes} bytes because current Google Drive usage is ${currentUsage} bytes.`);
  }

  // Check total DEVHUB storage pool limit
  const otherAllocations = await prisma.storageAllocation.findMany({
    where: {
      projectId: { not: projectId },
      isActive: true
    }
  });

  const totalOther = otherAllocations.reduce((acc, a) => acc + BigInt(a.allocatedBytes), 0n);
  const projectedTotal = isActive ? totalOther + bytes : totalOther;

  if (projectedTotal > TOTAL_DEVHUB_POOL_BYTES) {
    const availablePool = TOTAL_DEVHUB_POOL_BYTES > totalOther ? TOTAL_DEVHUB_POOL_BYTES - totalOther : 0n;
    throw new Error(`Requested quota (${bytes} bytes) exceeds available DEVHUB pool (${availablePool} bytes remaining of 5 TB).`);
  }

  const allocationName = name ? name.trim() : project.name;

  const allocation = await prisma.storageAllocation.upsert({
    where: { projectId },
    create: {
      projectId,
      name: allocationName,
      allocatedBytes: bytes,
      reservedBytes: 0n,
      isActive
    },
    update: {
      name: allocationName,
      allocatedBytes: bytes,
      isActive
    },
    include: {
      project: {
        select: {
          id: true,
          name: true,
          owner: { select: { id: true, name: true, email: true } }
        }
      }
    }
  });

  return formatQuotaForApi(allocation, currentUsage);
}

/**
 * Deactivates an existing storage allocation.
 */
async function deactivateQuota(projectId) {
  if (!projectId) throw new Error('projectId is required');
  const allocation = await prisma.storageAllocation.update({
    where: { projectId },
    data: { isActive: false },
    include: {
      project: {
        select: {
          id: true,
          name: true,
          owner: { select: { id: true, name: true, email: true } }
        }
      }
    }
  });
  const used = await getUsage(projectId);
  return formatQuotaForApi(allocation, used);
}

/**
 * Validates whether an incoming upload would fit within the project's allocation without reserving.
 */
async function validateUpload({ projectId, incomingBytes }) {
  if (!projectId) throw new Error('projectId is required');
  const bytes = BigInt(incomingBytes);

  const allocation = await prisma.storageAllocation.findUnique({
    where: { projectId }
  });

  // If no quota record exists, project has no Google Drive allocation
  if (!allocation) {
    return {
      allowed: false,
      reason: 'No Google Drive storage allocation configured for this project.'
    };
  }

  if (!allocation.isActive) {
    return {
      allowed: false,
      reason: 'Storage allocation for this project is inactive.'
    };
  }

  const used = await getUsage(projectId);
  const occupied = used + BigInt(allocation.reservedBytes || 0n);
  const available = BigInt(allocation.allocatedBytes) > occupied
    ? BigInt(allocation.allocatedBytes) - occupied
    : 0n;

  if (bytes > available) {
    return {
      allowed: false,
      reason: `Storage quota exceeded. Available: ${available} bytes, Requested: ${bytes} bytes.`,
      available: available.toString(),
      requested: bytes.toString()
    };
  }

  return {
    allowed: true,
    available: available.toString(),
    requested: bytes.toString()
  };
}

/**
 * Reserves quota for an in-flight upload using a PostgreSQL transaction with row-level locking.
 * Prevents concurrent uploads from exceeding the allocation.
 *
 * @param {object} params
 * @param {string} params.projectId
 * @param {bigint|number|string} params.incomingBytes
 * @returns {Promise<object>} reservation details
 */
async function reserve({ projectId, incomingBytes }) {
  if (!projectId) throw new Error('projectId is required');
  const bytes = BigInt(incomingBytes);

  return await prisma.$transaction(async (tx) => {
    // 1. Acquire row lock on StorageAllocation
    const lockedRows = await tx.$queryRaw`
      SELECT id, "projectId", "allocatedBytes", "reservedBytes", "isActive"
      FROM "StorageAllocation"
      WHERE "projectId" = ${projectId}
      FOR UPDATE;
    `;

    if (!lockedRows || lockedRows.length === 0) {
      throw new Error('No Google Drive storage allocation found for this project.');
    }

    const row = lockedRows[0];
    if (!row.isActive) {
      throw new Error('Google Drive storage allocation for this project is inactive.');
    }

    const allocated = BigInt(row.allocatedBytes);
    const reserved = BigInt(row.reservedBytes);

    // 2. Compute current used bytes inside transaction
    const usedAgg = await tx.file.aggregate({
      where: {
        projectId,
        storageProvider: 'google_drive'
      },
      _sum: { size: true }
    });
    const used = usedAgg._sum.size !== null && usedAgg._sum.size !== undefined ? BigInt(usedAgg._sum.size) : 0n;

    // 3. Verify that used + reserved + incomingBytes <= allocated
    if (used + reserved + bytes > allocated) {
      const remaining = allocated > (used + reserved) ? allocated - (used + reserved) : 0n;
      throw new Error(`Storage quota exceeded for this project. Requested: ${bytes} bytes, Remaining: ${remaining} bytes.`);
    }

    // 4. Update reservedBytes
    const newReserved = reserved + bytes;
    await tx.$executeRaw`
      UPDATE "StorageAllocation"
      SET "reservedBytes" = ${newReserved}, "updatedAt" = CURRENT_TIMESTAMP
      WHERE "id" = ${row.id};
    `;

    const reservationId = crypto.randomUUID();
    return {
      reservationId,
      projectId,
      bytes: bytes.toString(),
      reservedNumber: Number(bytes)
    };
  });
}

/**
 * Releases reserved bytes when an upload fails or is cancelled.
 */
async function release({ projectId, bytes }) {
  if (!projectId || !bytes) return;
  const releaseBytes = BigInt(bytes);

  try {
    await prisma.$transaction(async (tx) => {
      const lockedRows = await tx.$queryRaw`
        SELECT id, "reservedBytes"
        FROM "StorageAllocation"
        WHERE "projectId" = ${projectId}
        FOR UPDATE;
      `;

      if (lockedRows && lockedRows.length > 0) {
        const curReserved = BigInt(lockedRows[0].reservedBytes);
        const newReserved = curReserved > releaseBytes ? curReserved - releaseBytes : 0n;
        await tx.$executeRaw`
          UPDATE "StorageAllocation"
          SET "reservedBytes" = ${newReserved}, "updatedAt" = CURRENT_TIMESTAMP
          WHERE "id" = ${lockedRows[0].id};
        `;
      }
    });
  } catch (err) {
    console.error(`[StorageQuotaService] Error releasing reservation for project ${projectId}:`, err.message);
  }
}

/**
 * Finalizes quota usage after a successful Google Drive file upload.
 * Decrements the reserved bytes (as the created File row now represents permanent usedBytes).
 */
async function finalize({ projectId, bytes }) {
  await release({ projectId, bytes });
}

module.exports = {
  TOTAL_DEVHUB_POOL_BYTES,
  getUsage,
  getQuota,
  getPoolSummary,
  listAllocations,
  setQuota,
  deactivateQuota,
  validateUpload,
  reserve,
  release,
  finalize,
  formatQuotaForApi
};
