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
      const ca = await prisma.collegeActivity.findUnique({ where: { id: entityId }, select: { userId: true } });
      if (ca && ca.userId === userId) return true;
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
    const { entityType, entityId, userId, limit = 50 } = req.query;

    let whereClause = {};

    // If requesting specific entity, verify access
    if (entityType && entityId) {
      const hasAccess = await checkEntityAccess(entityType, entityId, req.userId);
      if (!hasAccess) {
        return res.status(403).json({ success: false, message: 'Forbidden' });
      }
      whereClause.entityType = entityType;
      whereClause.entityId = entityId;

      if (userId) {
        whereClause.userId = userId;
      }
    } else if (userId) {
      // If querying a specific user's activity, only allow if it's the current user
      if (userId !== req.userId) {
        return res.status(403).json({ success: false, message: 'Forbidden to view other users activity without entity context' });
      }
      whereClause.userId = req.userId;
    } else {
      // Default: show the user's own activity
      whereClause.userId = req.userId;
    }

    const activity = await prisma.auditLog.findMany({
      where: whereClause,
      orderBy: { createdAt: 'desc' },
      take: parseInt(limit),
      select: {
        id: true,
        userId: true,
        action: true,
        entityType: true,
        entityId: true,
        metadata: true,
        createdAt: true,
        user: { select: { id: true, name: true } }
      }
    });

    res.json({ success: true, activity });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};
