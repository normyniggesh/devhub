const prisma = require('../db');
const { checkProjectAccess } = require('../utils/projectAccess');
const { createAuditLog } = require('../utils/audit');

const testCaseInclude = {
  project: { select: { id: true, name: true } },
  creator: { select: { id: true, name: true, email: true, avatarUrl: true } },
  assignee: { select: { id: true, name: true, email: true, avatarUrl: true } },
  tester: { select: { id: true, name: true, email: true, avatarUrl: true } },
  results: {
    include: {
      executor: { select: { id: true, name: true, email: true, avatarUrl: true } },
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
    const { projectId, title, description, module, status, priority, expectedResult, assigneeId } = req.body || {};
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
    const { title, description, module, status, priority, expectedResult, actualResult, assigneeId, testerId } = req.body || {};

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
    if (assigneeId !== undefined) {
      if (assigneeId) updateData.assignee = { connect: { id: assigneeId } };
      else updateData.assignee = { disconnect: true };
    }
    if (testerId !== undefined) {
      if (testerId) updateData.tester = { connect: { id: testerId } };
      else updateData.tester = { disconnect: true };
    }

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
 * Claim / Take a test case for testing.
 * Prevents multiple users from conflicting on the same active test claim.
 */
exports.claimTestCase = async (req, res) => {
  try {
    const { id } = req.params;
    const testCase = await prisma.testCase.findUnique({
      where: { id },
      include: { tester: true, project: true }
    });

    if (!testCase) {
      return res.status(404).json({ success: false, message: 'Test case not found' });
    }

    const access = await checkProjectAccess(testCase.projectId, req.userId);
    if (!access.accessible) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }

    // Check if test is currently taken by another member
    if (testCase.testerId && testCase.testerId !== req.userId) {
      return res.status(409).json({
        success: false,
        message: `This test is currently taken by ${testCase.tester?.name || 'another member'}. You cannot take it until it is released.`
      });
    }

    const updated = await prisma.testCase.update({
      where: { id },
      data: {
        tester: { connect: { id: req.userId } }
      },
      include: testCaseInclude
    });

    createAuditLog({
      userId: req.userId,
      action: 'Claimed',
      entityType: 'TestCase',
      entityId: id,
      projectId: testCase.projectId,
      metadata: { title: testCase.title, testerName: updated.tester?.name }
    });

    res.json({
      success: true,
      message: `You have taken test "${updated.title}"`,
      testCase: updated
    });
  } catch (error) {
    console.error('claimTestCase error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

/**
 * Release / Unselect an active test case claim.
 * Returns the test case back to the "Available Tests" pool.
 */
exports.releaseTestCase = async (req, res) => {
  try {
    const { id } = req.params;
    const testCase = await prisma.testCase.findUnique({
      where: { id },
      include: { tester: true, project: true }
    });

    if (!testCase) {
      return res.status(404).json({ success: false, message: 'Test case not found' });
    }

    const access = await checkProjectAccess(testCase.projectId, req.userId);
    if (!access.accessible) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }

    // Only the tester who claimed it or an Admin can release it
    if (testCase.testerId && testCase.testerId !== req.userId && access.role !== 'Admin') {
      return res.status(403).json({
        success: false,
        message: 'Only the current tester or a project admin can release this test.'
      });
    }

    const updated = await prisma.testCase.update({
      where: { id },
      data: {
        tester: { disconnect: true }
      },
      include: testCaseInclude
    });

    createAuditLog({
      userId: req.userId,
      action: 'Released',
      entityType: 'TestCase',
      entityId: id,
      projectId: testCase.projectId,
      metadata: { title: testCase.title }
    });

    res.json({
      success: true,
      message: `Test "${updated.title}" released to available pool`,
      testCase: updated
    });
  } catch (error) {
    console.error('releaseTestCase error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

/**
 * Execute/Update Test Status and Description / Result:
 * Rules:
 *  - PASSED: Description is OPTIONAL.
 *  - FAILED: Description is REQUIRED.
 *  - BLOCKED: Description is REQUIRED.
 *  - NOT TESTED: Description is OPTIONAL.
 * Creates a historical TestResult entry and updates TestCase state.
 */
exports.runTestCase = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, description, actualResult, notes, testRunId } = req.body || {};

    if (!status || typeof status !== 'string') {
      return res.status(400).json({
        success: false,
        message: 'Status is required (Not Tested, Passed, Failed, Blocked)'
      });
    }

    const validStatuses = ['Not Tested', 'Passed', 'Failed', 'Blocked'];
    const normalizedStatus = status.trim();
    if (!validStatuses.includes(normalizedStatus)) {
      return res.status(400).json({
        success: false,
        message: `Invalid status. Must be one of: ${validStatuses.join(', ')}`
      });
    }

    const resultText = (
      description !== undefined ? description : (actualResult !== undefined ? actualResult : notes)
    )?.trim() || '';

    // Enforce required description rule for Failed and Blocked
    if ((normalizedStatus === 'Failed' || normalizedStatus === 'Blocked') && !resultText) {
      return res.status(400).json({
        success: false,
        message: `Description is required when marking a test as ${normalizedStatus}.`
      });
    }

    const testCase = await prisma.testCase.findUnique({
      where: { id },
      include: { tester: true, project: true }
    });

    if (!testCase) {
      return res.status(404).json({ success: false, message: 'Test case not found' });
    }

    const access = await checkProjectAccess(testCase.projectId, req.userId);
    if (!access.accessible) return res.status(403).json({ success: false, message: 'Forbidden' });
    if (access.role === 'Viewer') return res.status(403).json({ success: false, message: 'Viewers cannot execute test runs' });

    // Multi-user conflict protection: if another tester holds active claim, prevent overwrite
    if (testCase.testerId && testCase.testerId !== req.userId && access.role !== 'Admin') {
      return res.status(409).json({
        success: false,
        message: `This test is currently taken by ${testCase.tester?.name || 'another member'}. Only the assigned tester can submit results.`
      });
    }

    // Create execution history entry (TestResult)
    const testResult = await prisma.testResult.create({
      data: {
        testCaseId: id,
        testRunId: testRunId || null,
        status: normalizedStatus,
        actualResult: resultText || null,
        notes: resultText || null,
        executorId: req.userId,
        executedAt: new Date()
      },
      include: {
        executor: { select: { id: true, name: true, email: true, avatarUrl: true } },
        bugs: true
      }
    });

    // Update test case status, actualResult, and ensure current user is connected as tester if not already
    const updatedTestCase = await prisma.testCase.update({
       where: { id },
       data: {
         status: normalizedStatus,
         actualResult: resultText || (normalizedStatus === 'Not Tested' ? null : testCase.actualResult),
         ...(testCase.testerId ? {} : { tester: { connect: { id: req.userId } } })
       },
       include: testCaseInclude
     });

    createAuditLog({
      userId: req.userId,
      action: 'Tested',
      entityType: 'TestCase',
      entityId: id,
      projectId: testCase.projectId,
      metadata: {
        title: testCase.title,
        status: normalizedStatus,
        description: resultText,
        resultId: testResult.id
      }
    });

    res.json({
      success: true,
      testResult,
      testCase: updatedTestCase,
      message: `Test marked as ${normalizedStatus}`
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
