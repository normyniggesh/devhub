const prisma = require('../db');
const { checkProjectAccess } = require('../utils/projectAccess');
const { createAuditLog } = require('../utils/audit');

exports.getTestResults = async (req, res) => {
  try {
    const { testRunId } = req.query;
    let whereClause = {};

    if (testRunId) {
      const testRun = await prisma.testRun.findUnique({ where: { id: testRunId } });
      if (!testRun) return res.status(404).json({ success: false, message: 'Test run not found' });
      
      const access = await checkProjectAccess(testRun.projectId, req.userId);
      if (!access.accessible) return res.status(403).json({ success: false, message: 'Forbidden' });
      
      whereClause.testRunId = testRunId;
    } else {
      whereClause = {
        testRun: {
          project: {
            OR: [
              { ownerId: req.userId },
              { members: { some: { userId: req.userId } } }
            ]
          }
        }
      };
    }

    const testResults = await prisma.testResult.findMany({
      where: whereClause,
      include: {
        testCase: { select: { id: true, title: true } },
        executor: { select: { id: true, name: true } }
      },
      orderBy: { executedAt: 'desc' }
    });

    res.json({ success: true, testResults });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

exports.getTestResultById = async (req, res) => {
  try {
    const { id } = req.params;
    const testResult = await prisma.testResult.findUnique({
      where: { id },
      include: {
        testRun: { select: { id: true, projectId: true } },
        testCase: { select: { id: true, title: true } },
        executor: { select: { id: true, name: true } }
      }
    });

    if (!testResult) return res.status(404).json({ success: false, message: 'Test result not found' });

    const access = await checkProjectAccess(testResult.testRun.projectId, req.userId);
    if (!access.accessible) return res.status(403).json({ success: false, message: 'Forbidden' });

    res.json({ success: true, testResult });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

exports.createTestResult = async (req, res) => {
  try {
    const { testRunId, testCaseId, status, actualResult } = req.body;
    if (!testRunId || !testCaseId || !status || typeof status !== 'string') {
      return res.status(400).json({ success: false, message: 'testRunId, testCaseId, and status are required' });
    }

    const testRun = await prisma.testRun.findUnique({ where: { id: testRunId } });
    const testCase = await prisma.testCase.findUnique({ where: { id: testCaseId } });

    if (!testRun || !testCase) {
      return res.status(404).json({ success: false, message: 'Test run or test case not found' });
    }

    if (testRun.projectId !== testCase.projectId) {
      return res.status(409).json({ success: false, message: 'Test run and test case must belong to the same project' });
    }

    const access = await checkProjectAccess(testRun.projectId, req.userId);
    if (!access.accessible) return res.status(403).json({ success: false, message: 'Forbidden' });
    if (access.role === 'Viewer') return res.status(403).json({ success: false, message: 'Viewers cannot create test results' });

    const testResult = await prisma.testResult.create({
      data: {
        testRunId,
        testCaseId,
        status: status.trim(),
        actualResult: actualResult?.trim() || null,
        executorId: req.userId,
        executedAt: new Date()
      },
      include: {
        testCase: { select: { id: true, title: true } },
        executor: { select: { id: true, name: true } }
      }
    });

    createAuditLog({
      userId: req.userId,
      action: 'Created',
      entityType: 'TestResult',
      entityId: testResult.id,
      metadata: { status: testResult.status }
    });

    res.status(201).json({ success: true, testResult });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

exports.updateTestResult = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, actualResult } = req.body;

    const testResult = await prisma.testResult.findUnique({
      where: { id },
      include: { testRun: true }
    });
    if (!testResult) return res.status(404).json({ success: false, message: 'Test result not found' });

    const access = await checkProjectAccess(testResult.testRun.projectId, req.userId);
    if (!access.accessible) return res.status(403).json({ success: false, message: 'Forbidden' });
    if (access.role === 'Viewer') return res.status(403).json({ success: false, message: 'Viewers cannot update test results' });

    const updateData = {};
    if (status !== undefined) {
      if (!status || typeof status !== 'string') return res.status(400).json({ success: false, message: 'Invalid status' });
      updateData.status = status.trim();
    }
    if (actualResult !== undefined) updateData.actualResult = actualResult?.trim() || null;
    
    // Always update executedAt and executorId on modification as it represents the latest action
    updateData.executedAt = new Date();
    updateData.executorId = req.userId;

    const updatedTestResult = await prisma.testResult.update({
      where: { id },
      data: updateData,
      include: {
        testCase: { select: { id: true, title: true } },
        executor: { select: { id: true, name: true } }
      }
    });

    createAuditLog({
      userId: req.userId,
      action: 'Updated',
      entityType: 'TestResult',
      entityId: id,
      metadata: { status: updatedTestResult.status }
    });

    res.json({ success: true, testResult: updatedTestResult });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};
