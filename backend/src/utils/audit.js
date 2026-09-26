const prisma = require('../db');

/**
 * Creates an audit log entry safely.
 * @param {Object} params
 * @param {string} params.userId
 * @param {string} params.action - e.g. "Created", "Updated", "Deleted", "Completed"
 * @param {string} params.entityType
 * @param {string} params.entityId
 * @param {Object} [params.metadata]
 */
exports.createAuditLog = async ({ userId, action, entityType, entityId, metadata }) => {
  try {
    if (!userId || !action || !entityType || !entityId) {
      console.warn('createAuditLog: Missing required fields');
      return null;
    }

    const log = await prisma.auditLog.create({
      data: {
        userId,
        action,
        entityType,
        entityId,
        metadata: metadata || null
      }
    });
    return log;
  } catch (error) {
    console.error('Failed to create audit log:', error);
    // Non-blocking, return null on error
    return null;
  }
};
