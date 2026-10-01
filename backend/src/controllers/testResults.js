const prisma = require('../db');
const { checkProjectAccess } = require('../utils/projectAccess');
const { createAuditLog } = require('../utils/audit');

const testResultInclude = {
  testRun: { select: { id: true, name: true, projectId: true } },
  testCase: { select: { id: true, title: true, expectedResult: true, projectId: true } },
  executor: { select: { id: true, name: true, email: true } },
  bugs: { select: { id: true, title: true, status: true, severity: true } }
};

exports.getTestResults = async (req, res) => {
  try {
    const { testRunId, testCaseId } = req.query;
    let whereClause = {};

    if (testCaseId) {
      const testCase = await prisma.testCase.findUnique({ where: { id: testCaseId } });
      if (!testCase) return res.status(404).json({ success: false, message: 'Test case not found' });
      const access = await checkProjectAccess(testCase.projectId, req.userId);
      if (!access.accessible) return res.status(403).json({ success: false, message: 'Forbidden' });
      whereClause.testCaseId = testCaseId;
    } else if (testRunId) {
      const testRun = await prisma.testRun.findUnique({ where: { id: testRunId } });
      if (!testRun) return res.status(404).json({ success: false, message: 'Test run not found' });
      
      const access = await checkProjectAccess(testRun.projectId, req.userId);
      if (!access.accessible) return res.status(403).json({ success: false, message: 'Forbidden' });
      
      whereClause.testRunId = testRunId;
    } else {
      whereClause = {
        testCase: {
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
      include: testResultInclude,
      orderBy: { executedAt: 'desc' }
    });

    res.json({ success: true, testResults });
  } catch (error) {
    console.error('getTestResults error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

exports.getTestResultById = async (req, res) => {
  try {
    const { id } = req.params;
    const testResult = await prisma.testResult.findUnique({
      where: { id },
      include: testResultInclude
    });

    if (!testResult) return res.status(404).json({ success: false, message: 'Test result not found' });

    const projectId = testResult.testCase?.projectId || testResult.testRun?.projectId;
    if (projectId) {
      const access = await checkProjectAccess(projectId, req.userId);
      if (!access.accessible) return res.status(403).json({ success: false, message: 'Forbidden' });
    }

    res.json({ success: true, testResult });
  } catch (error) {
    console.error('getTestResultById error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

exports.createTestResult = async (req, res) => {
  try {
    const { testRunId, testCaseId, status, actualResult, notes } = req.body;
    if (!testCaseId || !status || typeof status !== 'string') {
      return res.status(400).json({ success: false, message: 'testCaseId and status are required' });
    }

    const testCase = await prisma.testCase.findUnique({ where: { id: testCaseId } });
    if (!testCase) {
      return res.status(404).json({ success: false, message: 'Test case not found' });
    }

    if (testRunId) {
      const testRun = await prisma.testRun.findUnique({ where: { id: testRunId } });
      if (!testRun) return res.status(404).json({ success: false, message: 'Test run not found' });
      if (testRun.projectId !== testCase.projectId) {
        return res.status(409).json({ success: false, message: 'Test run and test case must belong to the same project' });
      }
    }

    const access = await checkProjectAccess(testCase.projectId, req.userId);
    if (!access.accessible) return res.status(403).json({ success: false, message: 'Forbidden' });
    if (access.role === 'Viewer') return res.status(403).json({ success: false, message: 'Viewers cannot create test results' });

    const runStatus = status.trim();

    const testResult = await prisma.testResult.create({
      data: {
        testRunId: testRunId || null,
        testCaseId,
        status: runStatus,
        actualResult: actualResult?.trim() || null,
        notes: notes?.trim() || null,
        executorId: req.userId,
        executedAt: new Date()
      },
      include: testResultInclude
    });

    // Keep testCase status and actualResult synchronized with latest run
    await prisma.testCase.update({
      where: { id: testCaseId },
      data: {
        status: runStatus,
        actualResult: actualResult?.trim() || testCase.actualResult
      }
    });

    createAuditLog({
      userId: req.userId,
      action: 'Created',
      entityType: 'TestResult',
      entityId: testResult.id,
      metadata: { status: testResult.status, testCaseId }
    });

    res.status(201).json({ success: true, testResult });
  } catch (error) {
    console.error('createTestResult error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

exports.updateTestResult = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, actualResult, notes } = req.body;

    const testResult = await prisma.testResult.findUnique({
      where: { id },
      include: { testCase: true, testRun: true }
    });
    if (!testResult) return res.status(404).json({ success: false, message: 'Test result not found' });

    const projectId = testResult.testCase?.projectId || testResult.testRun?.projectId;
    if (projectId) {
      const access = await checkProjectAccess(projectId, req.userId);
      if (!access.accessible) return res.status(403).json({ success: false, message: 'Forbidden' });
      if (access.role === 'Viewer') return res.status(403).json({ success: false, message: 'Viewers cannot update test results' });
    }

    const updateData = {};
    if (status !== undefined) {
      if (!status || typeof status !== 'string') return res.status(400).json({ success: false, message: 'Invalid status' });
      updateData.status = status.trim();
    }
    if (actualResult !== undefined) updateData.actualResult = actualResult?.trim() || null;
    if (notes !== undefined) updateData.notes = notes?.trim() || null;
    
    updateData.executedAt = new Date();
    updateData.executorId = req.userId;

    const updatedTestResult = await prisma.testResult.update({
      where: { id },
      data: updateData,
      include: testResultInclude
    });

    if (updateData.status && testResult.testCaseId) {
      await prisma.testCase.update({
        where: { id: testResult.testCaseId },
        data: {
          status: updateData.status,
          actualResult: updateData.actualResult !== undefined ? updateData.actualResult : undefined
        }
      });
    }

    createAuditLog({
      userId: req.userId,
      action: 'Updated',
      entityType: 'TestResult',
      entityId: id,
      metadata: { status: updatedTestResult.status }
    });

    res.json({ success: true, testResult: updatedTestResult });
  } catch (error) {
    console.error('updateTestResult error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};
