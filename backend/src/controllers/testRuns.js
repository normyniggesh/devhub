const prisma = require('../db');
const { checkProjectAccess } = require('../utils/projectAccess');
const { createAuditLog } = require('../utils/audit');

exports.getTestRuns = async (req, res) => {
  try {
    const { projectId } = req.query;
    let whereClause = {};

    if (projectId) {
      const access = await checkProjectAccess(projectId, req.userId);
      if (!access.accessible) return res.status(403).json({ success: false, message: 'Forbidden' });
      whereClause.projectId = projectId;
    } else {
      whereClause = {
        project: {
          OR: [
            { ownerId: req.userId },
            { members: { some: { userId: req.userId } } }
          ]
        }
      };
    }

    const testRuns = await prisma.testRun.findMany({
      where: whereClause,
      include: {
        project: { select: { id: true, name: true } },
        executor: { select: { id: true, name: true, email: true } }
      },
      orderBy: { createdAt: 'desc' }
    });

    res.json({ success: true, testRuns });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

exports.getTestRunById = async (req, res) => {
  try {
    const { id } = req.params;
    const testRun = await prisma.testRun.findUnique({
      where: { id },
      include: {
        project: { select: { id: true, name: true } },
        executor: { select: { id: true, name: true, email: true } }
      }
    });

    if (!testRun) return res.status(404).json({ success: false, message: 'Test run not found' });

    const access = await checkProjectAccess(testRun.projectId, req.userId);
    if (!access.accessible) return res.status(403).json({ success: false, message: 'Forbidden' });

    res.json({ success: true, testRun });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

exports.createTestRun = async (req, res) => {
  try {
    const { projectId, name, status } = req.body;
    if (!projectId || !name || typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ success: false, message: 'projectId and name are required' });
    }

    const access = await checkProjectAccess(projectId, req.userId);
    if (!access.accessible) return res.status(404).json({ success: false, message: 'Project not found' });
    if (access.role === 'Viewer') return res.status(403).json({ success: false, message: 'Viewers cannot create test runs' });

    const runStatus = status?.trim() || 'Pending';
    const isStarted = runStatus === 'In Progress' || runStatus === 'Running';
    const isCompleted = runStatus === 'Completed' || runStatus === 'Done' || runStatus === 'Passed' || runStatus === 'Failed';

    const testRun = await prisma.testRun.create({
      data: {
        projectId,
        name: name.trim(),
        status: runStatus,
        startedAt: isStarted || isCompleted ? new Date() : null,
        completedAt: isCompleted ? new Date() : null,
        executorId: req.userId
      },
      include: {
        project: { select: { id: true, name: true } },
        executor: { select: { id: true, name: true } }
      }
    });

    createAuditLog({
      userId: req.userId,
      action: 'Created',
      entityType: 'TestRun',
      entityId: testRun.id,
      metadata: { name: testRun.name }
    });

    res.status(201).json({ success: true, testRun });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

exports.updateTestRun = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, status } = req.body;

    const testRun = await prisma.testRun.findUnique({ where: { id } });
    if (!testRun) return res.status(404).json({ success: false, message: 'Test run not found' });

    const access = await checkProjectAccess(testRun.projectId, req.userId);
    if (!access.accessible) return res.status(403).json({ success: false, message: 'Forbidden' });
    if (access.role === 'Viewer') return res.status(403).json({ success: false, message: 'Viewers cannot update test runs' });

    const updateData = {};
    if (name !== undefined) {
      if (!name || typeof name !== 'string' || !name.trim()) return res.status(400).json({ success: false, message: 'Name is required' });
      updateData.name = name.trim();
    }
    
    if (status !== undefined) {
      const runStatus = status.trim();
      updateData.status = runStatus;
      const isStarted = runStatus === 'In Progress' || runStatus === 'Running';
      const isCompleted = runStatus === 'Completed' || runStatus === 'Done' || runStatus === 'Passed' || runStatus === 'Failed';

      if ((isStarted || isCompleted) && !testRun.startedAt) {
        updateData.startedAt = new Date();
      }
      
      if (isCompleted && !testRun.completedAt) {
        updateData.completedAt = new Date();
      } else if (!isCompleted && testRun.completedAt) {
        updateData.completedAt = null;
      }
    }

    const updatedTestRun = await prisma.testRun.update({
      where: { id },
      data: updateData,
      include: {
        project: { select: { id: true, name: true } },
        executor: { select: { id: true, name: true } }
      }
    });

    createAuditLog({
      userId: req.userId,
      action: 'Updated',
      entityType: 'TestRun',
      entityId: id,
      metadata: { name: updatedTestRun.name, status: updatedTestRun.status }
    });

    res.json({ success: true, testRun: updatedTestRun });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};
