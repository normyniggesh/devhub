const prisma = require('../db');
const { checkProjectAccess } = require('../utils/projectAccess');
const { createAuditLog } = require('../utils/audit');

const testCaseInclude = {
  project: { select: { id: true, name: true } },
  creator: { select: { id: true, name: true, email: true } },
  assignee: { select: { id: true, name: true, email: true } },
  results: {
    include: {
      executor: { select: { id: true, name: true } },
      bugs: { select: { id: true, title: true, status: true, severity: true } }
    },
    orderBy: { executedAt: 'desc' }
  },
  bugs: {
    include: {
      assignee: { select: { id: true, name: true } },
      creator: { select: { id: true, name: true } },
      testResult: { select: { id: true, status: true, executedAt: true } }
    },
    orderBy: { createdAt: 'desc' }
  }
};

exports.getTestCases = async (req, res) => {
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

    const testCases = await prisma.testCase.findMany({
      where: whereClause,
      include: testCaseInclude,
      orderBy: { createdAt: 'desc' }
    });

    res.json({ success: true, testCases });
  } catch (error) {
    console.error('getTestCases error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

exports.getTestCaseById = async (req, res) => {
  try {
    const { id } = req.params;
    const testCase = await prisma.testCase.findUnique({
      where: { id },
      include: testCaseInclude
    });

    if (!testCase) return res.status(404).json({ success: false, message: 'Test case not found' });

    const access = await checkProjectAccess(testCase.projectId, req.userId);
    if (!access.accessible) return res.status(403).json({ success: false, message: 'Forbidden' });

    res.json({ success: true, testCase });
  } catch (error) {
    console.error('getTestCaseById error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

exports.createTestCase = async (req, res) => {
  try {
    const { projectId, title, description, module, status, priority, expectedResult, assigneeId } = req.body;
    if (!projectId || !title || typeof title !== 'string' || !title.trim()) {
      return res.status(400).json({ success: false, message: 'projectId and title are required' });
    }

    const access = await checkProjectAccess(projectId, req.userId);
    if (!access.accessible) return res.status(404).json({ success: false, message: 'Project not found' });
    if (access.role === 'Viewer') return res.status(403).json({ success: false, message: 'Viewers cannot create test cases' });

    if (assigneeId) {
      const assigneeAccess = await checkProjectAccess(projectId, assigneeId);
      if (!assigneeAccess.accessible) {
        return res.status(400).json({ success: false, message: 'Assignee must be a member of the project' });
      }
    }

    const testCase = await prisma.testCase.create({
      data: {
        projectId,
        title: title.trim(),
        description: description?.trim() || null,
        module: module?.trim() || null,
        status: status?.trim() || 'Not Tested',
        priority: priority?.trim() || 'Medium',
        expectedResult: expectedResult?.trim() || null,
        actualResult: null,
        assigneeId: assigneeId || null,
        creatorId: req.userId
      },
      include: testCaseInclude
    });

    createAuditLog({
      userId: req.userId,
      action: 'Created',
      entityType: 'TestCase',
      entityId: testCase.id,
      metadata: { title: testCase.title }
    });

    res.status(201).json({ success: true, testCase });
  } catch (error) {
    console.error('createTestCase error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

exports.updateTestCase = async (req, res) => {
  try {
    const { id } = req.params;
    const { title, description, module, status, priority, expectedResult, actualResult, assigneeId } = req.body;

    const testCase = await prisma.testCase.findUnique({ where: { id } });
    if (!testCase) return res.status(404).json({ success: false, message: 'Test case not found' });

    const access = await checkProjectAccess(testCase.projectId, req.userId);
    if (!access.accessible) return res.status(403).json({ success: false, message: 'Forbidden' });
    if (access.role === 'Viewer') return res.status(403).json({ success: false, message: 'Viewers cannot update test cases' });

    if (assigneeId !== undefined && assigneeId !== null && assigneeId !== testCase.assigneeId) {
      const assigneeAccess = await checkProjectAccess(testCase.projectId, assigneeId);
      if (!assigneeAccess.accessible) {
        return res.status(400).json({ success: false, message: 'Assignee must be a member of the project' });
      }
    }

    const updateData = {};
    if (title !== undefined) {
      if (!title || typeof title !== 'string' || !title.trim()) return res.status(400).json({ success: false, message: 'Title is required' });
      updateData.title = title.trim();
    }
    if (description !== undefined) updateData.description = description?.trim() || null;
    if (module !== undefined) updateData.module = module?.trim() || null;
    if (status !== undefined) updateData.status = status?.trim() || 'Not Tested';
    if (priority !== undefined) updateData.priority = priority?.trim() || 'Medium';
    if (expectedResult !== undefined) updateData.expectedResult = expectedResult?.trim() || null;
    if (actualResult !== undefined) updateData.actualResult = actualResult?.trim() || null;
    if (assigneeId !== undefined) updateData.assigneeId = assigneeId || null;

    const updatedTestCase = await prisma.testCase.update({
      where: { id },
      data: updateData,
      include: testCaseInclude
    });

    createAuditLog({
      userId: req.userId,
      action: 'Updated',
      entityType: 'TestCase',
      entityId: id,
      metadata: { title: updatedTestCase.title }
    });

    res.json({ success: true, testCase: updatedTestCase });
  } catch (error) {
    console.error('updateTestCase error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

/**
 * Execute a test run on a specific test case:
 * Creates a TestResult, updates TestCase status and actualResult, records execution history.
 */
exports.runTestCase = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, actualResult, notes, testRunId } = req.body;

    if (!status || typeof status !== 'string') {
      return res.status(400).json({ success: false, message: 'Status is required (e.g. Passed, Failed, Blocked)' });
    }

    const testCase = await prisma.testCase.findUnique({ where: { id } });
    if (!testCase) return res.status(404).json({ success: false, message: 'Test case not found' });

    const access = await checkProjectAccess(testCase.projectId, req.userId);
    if (!access.accessible) return res.status(403).json({ success: false, message: 'Forbidden' });
    if (access.role === 'Viewer') return res.status(403).json({ success: false, message: 'Viewers cannot execute test runs' });

    const runStatus = status.trim();

    // Create the test result execution entry
    const testResult = await prisma.testResult.create({
      data: {
        testCaseId: id,
        testRunId: testRunId || null,
        status: runStatus,
        actualResult: actualResult?.trim() || null,
        notes: notes?.trim() || null,
        executorId: req.userId,
        executedAt: new Date()
      },
      include: {
        executor: { select: { id: true, name: true, email: true } },
        testCase: { select: { id: true, title: true, expectedResult: true } },
        bugs: true
      }
    });

    // Update the test case with the latest run status and actual result
    const updatedTestCase = await prisma.testCase.update({
      where: { id },
      data: {
        status: runStatus,
        actualResult: actualResult?.trim() || testCase.actualResult
      },
      include: testCaseInclude
    });

    createAuditLog({
      userId: req.userId,
      action: 'Executed',
      entityType: 'TestCase',
      entityId: id,
      metadata: { title: testCase.title, status: runStatus, resultId: testResult.id }
    });

    res.status(201).json({
      success: true,
      testResult,
      testCase: updatedTestCase,
      message: `Test executed as ${runStatus}`
    });
  } catch (error) {
    console.error('runTestCase error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

exports.deleteTestCase = async (req, res) => {
  try {
    const { id } = req.params;
    const testCase = await prisma.testCase.findUnique({ where: { id } });
    if (!testCase) return res.status(404).json({ success: false, message: 'Test case not found' });

    const access = await checkProjectAccess(testCase.projectId, req.userId);
    if (!access.accessible) return res.status(403).json({ success: false, message: 'Forbidden' });
    if (access.role !== 'Admin') return res.status(403).json({ success: false, message: 'Only Admins can delete test cases' });

    // Safely delete dependent test results and detach bugs before deleting test case
    await prisma.$transaction([
      prisma.bug.updateMany({ where: { testCaseId: id }, data: { testCaseId: null, testResultId: null } }),
      prisma.testResult.deleteMany({ where: { testCaseId: id } }),
      prisma.testCase.delete({ where: { id } })
    ]);
    
    createAuditLog({
      userId: req.userId,
      action: 'Deleted',
      entityType: 'TestCase',
      entityId: id,
      metadata: { title: testCase.title }
    });

    res.json({ success: true, message: 'Test case deleted successfully' });
  } catch (error) {
    console.error('deleteTestCase error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};
