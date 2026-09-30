const prisma = require('../db');

const MAJOR_ACTIONS = new Set([
  'Created', 'Updated', 'Deleted', 'Completed', 'Reopened', 
  'Uploaded', 'Resolved', 'Merged', 'Deployed', 'Added', 'Removed',
  'Connected', 'Disconnected', 'Imported'
]);

/**
 * Creates an audit log entry safely.
 * @param {Object} params
 * @param {string} params.userId
 * @param {string} params.action - e.g. "Created", "Updated", "Deleted", "Completed"
 * @param {string} params.entityType
 * @param {string} params.entityId
 * @param {string} [params.projectId]
 * @param {Object} [params.metadata]
 */
exports.createAuditLog = async ({ userId, action, entityType, entityId, projectId, metadata }) => {
  try {
    if (!userId || !action || !entityType || !entityId) {
      console.warn('createAuditLog: Missing required fields');
      return null;
    }

    // Ignore noise/insignificant actions
    const normalizedAction = action.trim();
    const isMajor = MAJOR_ACTIONS.has(normalizedAction);
    if (!isMajor && ['Viewed', 'Navigated', 'Filtered', 'Listed'].includes(normalizedAction)) {
      return null;
    }

    let resolvedProjectId = projectId || metadata?.projectId || null;
    if (!resolvedProjectId) {
      if (entityType === 'Project') {
        resolvedProjectId = entityId;
      } else {
        try {
          switch (entityType) {
            case 'Task': {
              const t = await prisma.task.findUnique({ where: { id: entityId }, select: { projectId: true } });
              resolvedProjectId = t?.projectId || null;
              break;
            }
            case 'File': {
              const f = await prisma.file.findUnique({ where: { id: entityId }, select: { projectId: true } });
              resolvedProjectId = f?.projectId || null;
              break;
            }
            case 'Folder': {
              const f = await prisma.folder.findUnique({ where: { id: entityId }, select: { projectId: true } });
              resolvedProjectId = f?.projectId || null;
              break;
            }
            case 'Bug': {
              const b = await prisma.bug.findUnique({ where: { id: entityId }, select: { projectId: true } });
              resolvedProjectId = b?.projectId || null;
              break;
            }
            case 'Repository': {
              const r = await prisma.repository.findUnique({ where: { id: entityId }, select: { projectId: true } });
              resolvedProjectId = r?.projectId || null;
              break;
            }
            case 'PullRequest': {
              const p = await prisma.pullRequest.findUnique({ where: { id: entityId }, select: { projectId: true } });
              resolvedProjectId = p?.projectId || null;
              break;
            }
            case 'Deployment': {
              const d = await prisma.deployment.findUnique({ where: { id: entityId }, select: { projectId: true } });
              resolvedProjectId = d?.projectId || null;
              break;
            }
            case 'TestRun': {
              const tr = await prisma.testRun.findUnique({ where: { id: entityId }, select: { projectId: true } });
              resolvedProjectId = tr?.projectId || null;
              break;
            }
            case 'TestCase': {
              const tc = await prisma.testCase.findUnique({ where: { id: entityId }, select: { projectId: true } });
              resolvedProjectId = tc?.projectId || null;
              break;
            }
            case 'CalendarEvent': {
              const ce = await prisma.calendarEvent.findUnique({ where: { id: entityId }, select: { projectId: true } });
              resolvedProjectId = ce?.projectId || null;
              break;
            }
          }
        } catch (_) {}
      }
    }

    const mergedMetadata = {
      ...(metadata || {}),
      ...(resolvedProjectId ? { projectId: resolvedProjectId } : {})
    };

    let log = null;
    try {
      log = await prisma.auditLog.create({
        data: {
          userId,
          action: normalizedAction,
          entityType,
          entityId,
          projectId: resolvedProjectId,
          metadata: mergedMetadata
        }
      });
    } catch (createErr) {
      log = await prisma.auditLog.create({
        data: {
          userId,
          action: normalizedAction,
          entityType,
          entityId,
          metadata: mergedMetadata
        }
      });
    }
    return log;
  } catch (error) {
    console.error('Failed to create audit log:', error);
    return null;
  }
};
