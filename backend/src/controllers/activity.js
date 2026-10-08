const prisma = require('../db');
const { checkProjectAccess } = require('../utils/projectAccess');

async function checkEntityAccess(entityType, entityId, userId) {
  if (entityType === 'Project') {
    const access = await checkProjectAccess(entityId, userId);
    return access.accessible;
  }
  
  // For other entities, find their projectId
  let projectId = null;

  switch (entityType) {
    case 'Task':
      const task = await prisma.task.findUnique({ where: { id: entityId }, select: { projectId: true } });
      projectId = task?.projectId;
      break;
    case 'Bug':
      const bug = await prisma.bug.findUnique({ where: { id: entityId }, select: { projectId: true } });
      projectId = bug?.projectId;
      break;
    case 'TestCase':
      const tc = await prisma.testCase.findUnique({ where: { id: entityId }, select: { projectId: true } });
      projectId = tc?.projectId;
      break;
    case 'TestRun':
      const tr = await prisma.testRun.findUnique({ where: { id: entityId }, select: { projectId: true } });
      projectId = tr?.projectId;
      break;
    case 'TestResult':
      const tres = await prisma.testResult.findUnique({
        where: { id: entityId },
        select: { testRun: { select: { projectId: true } } }
      });
      projectId = tres?.testRun?.projectId;
      break;
    case 'CalendarEvent':
      const evt = await prisma.calendarEvent.findUnique({ where: { id: entityId }, select: { projectId: true, creatorId: true } });
      if (evt && !evt.projectId && evt.creatorId === userId) return true; // personal event
      projectId = evt?.projectId;
      break;
    case 'Folder':
      const fldr = await prisma.folder.findUnique({ where: { id: entityId }, select: { projectId: true } });
      projectId = fldr?.projectId;
      break;
    case 'File':
      const file = await prisma.file.findUnique({ where: { id: entityId }, select: { projectId: true } });
      projectId = file?.projectId;
      break;
    case 'Repository':
      const repo = await prisma.repository.findUnique({ where: { id: entityId }, select: { projectId: true } });
      projectId = repo?.projectId;
      break;
    case 'PullRequest':
      const pr = await prisma.pullRequest.findUnique({ where: { id: entityId }, select: { projectId: true } });
      projectId = pr?.projectId;
      break;
    case 'Deployment':
      const dep = await prisma.deployment.findUnique({ where: { id: entityId }, select: { projectId: true } });
      projectId = dep?.projectId;
      break;
    case 'CollegeActivity':
      const involvement = await prisma.activityInvolvement.findFirst({
        where: { activityId: entityId, userId: userId }
      });
      if (involvement) return true;
      break;
  }

  if (projectId) {
    const access = await checkProjectAccess(projectId, userId);
    return access.accessible;
  }

  return false;
}

exports.getActivity = async (req, res) => {
  try {
    const { entityType, entityId, userId, limit = 50, all = 'false' } = req.query;

    const currentUser = await prisma.user.findUnique({
      where: { id: req.userId },
      select: { id: true, role: true }
    });

    const isGlobalAdmin = currentUser?.role === 'Admin';
    const showAll = (all === 'true' || all === true) && isGlobalAdmin;

    // Find all projects where user is owner or member
    const userProjects = await prisma.project.findMany({
      where: {
        OR: [
          { ownerId: req.userId },
          { members: { some: { userId: req.userId } } }
        ]
      },
      select: { id: true, ownerId: true }
    });
    const userProjectIds = userProjects.map(p => p.id);

    let whereClause = {};

    if (showAll) {
      // Global Admin view: show all activities across the platform
      whereClause = {};
    } else if (entityType && entityId) {
      const hasAccess = await checkEntityAccess(entityType, entityId, req.userId);
      if (!hasAccess && !isGlobalAdmin) {
        return res.status(403).json({ success: false, message: 'Forbidden' });
      }
      whereClause.entityType = entityType;
      whereClause.entityId = entityId;

      if (userId) {
        whereClause.userId = userId;
      }
    } else if (userId && userId !== req.userId) {
      if (!isGlobalAdmin) {
        return res.status(403).json({ success: false, message: 'Forbidden to view other users activity without entity context' });
      }
      whereClause.userId = userId;
    } else {
      // Default: show the user's own activity AND all project members' activity for projects they belong to
      whereClause = {
        OR: [
          { userId: req.userId },
          ...(userProjectIds.length > 0 ? [
            { projectId: { in: userProjectIds } },
            { entityType: 'Project', entityId: { in: userProjectIds } }
          ] : [])
        ]
      };
    }

    let activity = [];
    try {
      activity = await prisma.auditLog.findMany({
        where: whereClause,
        orderBy: { createdAt: 'desc' },
        take: parseInt(limit) || 50,
        select: {
          id: true,
          userId: true,
          action: true,
          entityType: true,
          entityId: true,
          projectId: true,
          metadata: true,
          createdAt: true,
          user: { select: { id: true, name: true, avatarUrl: true } }
        }
      });
    } catch (auditErr) {
      console.error('[Activity] AuditLog query failed, falling back:', auditErr.message);
      try {
        activity = await prisma.auditLog.findMany({
          where: showAll ? {} : { userId: req.userId },
          orderBy: { createdAt: 'desc' },
          take: parseInt(limit) || 50,
          select: {
            id: true,
            userId: true,
            action: true,
            entityType: true,
            entityId: true,
            metadata: true,
            createdAt: true,
            user: { select: { id: true, name: true, avatarUrl: true } }
          }
        });
      } catch (innerErr) {
        console.error('[Activity] Fallback query failed:', innerErr.message);
        activity = [];
      }
    }

    res.json({
      success: true,
      activity,
      canViewAll: isGlobalAdmin,
      isViewingAll: showAll
    });
  } catch (error) {
    console.error('getActivity error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};
