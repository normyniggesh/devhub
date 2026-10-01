const prisma = require('../db');
const { checkProjectAccess } = require('../utils/projectAccess');
const { createAuditLog } = require('../utils/audit');

const bugInclude = {
  project: { select: { id: true, name: true } },
  assignee: { select: { id: true, name: true, email: true } },
  creator: { select: { id: true, name: true, email: true } },
  task: { select: { id: true, title: true } },
  testCase: { select: { id: true, title: true, expectedResult: true } },
  testResult: { select: { id: true, status: true, actualResult: true, executedAt: true } }
};

exports.getBugs = async (req, res) => {
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

    const bugs = await prisma.bug.findMany({
      where: whereClause,
      include: bugInclude,
      orderBy: { createdAt: 'desc' }
    });

    res.json({ success: true, bugs });
  } catch (error) {
    console.error('getBugs error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

exports.getBugById = async (req, res) => {
  try {
    const { id } = req.params;
    const bug = await prisma.bug.findUnique({
      where: { id },
      include: bugInclude
    });

    if (!bug) return res.status(404).json({ success: false, message: 'Bug not found' });

    const access = await checkProjectAccess(bug.projectId, req.userId);
    if (!access.accessible) return res.status(403).json({ success: false, message: 'Forbidden' });

    res.json({ success: true, bug });
  } catch (error) {
    console.error('getBugById error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

exports.createBug = async (req, res) => {
  try {
    const {
      projectId,
      taskId,
      testCaseId,
      testResultId,
      title,
      description,
      type,
      severity,
      status,
      assigneeId,
      expectedResult,
      actualResult
    } = req.body;

    if (!projectId || !title || typeof title !== 'string' || !title.trim()) {
      return res.status(400).json({ success: false, message: 'projectId and title are required' });
    }

    const access = await checkProjectAccess(projectId, req.userId);
    if (!access.accessible) return res.status(404).json({ success: false, message: 'Project not found' });
    if (access.role === 'Viewer') return res.status(403).json({ success: false, message: 'Viewers cannot create bugs' });

    // Validate relations if provided
    if (taskId) {
      const task = await prisma.task.findUnique({ where: { id: taskId } });
      if (!task || task.projectId !== projectId) return res.status(409).json({ success: false, message: 'Task not found or belongs to another project' });
    }
    
    let resolvedTestCaseId = testCaseId || null;

    if (testResultId) {
      const testResult = await prisma.testResult.findUnique({
        where: { id: testResultId },
        include: { testCase: true }
      });
      if (!testResult || testResult.testCase.projectId !== projectId) {
        return res.status(409).json({ success: false, message: 'Test result not found or belongs to another project' });
      }
      if (!resolvedTestCaseId) {
        resolvedTestCaseId = testResult.testCaseId;
      }
    }

    if (resolvedTestCaseId) {
      const testCase = await prisma.testCase.findUnique({ where: { id: resolvedTestCaseId } });
      if (!testCase || testCase.projectId !== projectId) {
        return res.status(409).json({ success: false, message: 'Test case not found or belongs to another project' });
      }
    }
    
    if (assigneeId) {
      const assigneeAccess = await checkProjectAccess(projectId, assigneeId);
      if (!assigneeAccess.accessible) return res.status(400).json({ success: false, message: 'Assignee must be a member of the project' });
    }

    const bugStatus = status?.trim() || 'Open';
    const isResolved = bugStatus === 'Resolved' || bugStatus === 'Closed' || bugStatus === 'Done';

    const bug = await prisma.bug.create({
      data: {
        projectId,
        taskId: taskId || null,
        testCaseId: resolvedTestCaseId,
        testResultId: testResultId || null,
        title: title.trim(),
        description: description?.trim() || null,
        type: type?.trim() || 'Bug',
        severity: severity?.trim() || 'Medium',
        status: bugStatus,
        expectedResult: expectedResult?.trim() || null,
        actualResult: actualResult?.trim() || null,
        assigneeId: assigneeId || null,
        creatorId: req.userId,
        resolvedAt: isResolved ? new Date() : null
      },
      include: bugInclude
    });

    createAuditLog({
      userId: req.userId,
      action: 'Created',
      entityType: 'Bug',
      entityId: bug.id,
      metadata: { title: bug.title, status: bug.status, testCaseId: resolvedTestCaseId }
    });

    res.status(201).json({ success: true, bug });
  } catch (error) {
    console.error('createBug error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

exports.updateBug = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      title,
      description,
      type,
      severity,
      status,
      assigneeId,
      taskId,
      testCaseId,
      testResultId,
      expectedResult,
      actualResult
    } = req.body;

    const bug = await prisma.bug.findUnique({ where: { id } });
    if (!bug) return res.status(404).json({ success: false, message: 'Bug not found' });

    const access = await checkProjectAccess(bug.projectId, req.userId);
    if (!access.accessible) return res.status(403).json({ success: false, message: 'Forbidden' });
    if (access.role === 'Viewer') return res.status(403).json({ success: false, message: 'Viewers cannot update bugs' });

    if (taskId !== undefined && taskId !== null && taskId !== bug.taskId) {
      const task = await prisma.task.findUnique({ where: { id: taskId } });
      if (!task || task.projectId !== bug.projectId) return res.status(409).json({ success: false, message: 'Task not found or belongs to another project' });
    }
    
    if (testCaseId !== undefined && testCaseId !== null && testCaseId !== bug.testCaseId) {
      const testCase = await prisma.testCase.findUnique({ where: { id: testCaseId } });
      if (!testCase || testCase.projectId !== bug.projectId) return res.status(409).json({ success: false, message: 'Test case not found or belongs to another project' });
    }

    if (assigneeId !== undefined && assigneeId !== null && assigneeId !== bug.assigneeId) {
      const assigneeAccess = await checkProjectAccess(bug.projectId, assigneeId);
      if (!assigneeAccess.accessible) return res.status(400).json({ success: false, message: 'Assignee must be a member of the project' });
    }

    const updateData = {};
    if (title !== undefined) {
      if (!title || typeof title !== 'string' || !title.trim()) return res.status(400).json({ success: false, message: 'Title is required' });
      updateData.title = title.trim();
    }
    if (description !== undefined) updateData.description = description?.trim() || null;
    if (type !== undefined) updateData.type = type?.trim() || 'Bug';
    if (severity !== undefined) updateData.severity = severity?.trim() || 'Medium';
    if (taskId !== undefined) updateData.taskId = taskId || null;
    if (testCaseId !== undefined) updateData.testCaseId = testCaseId || null;
    if (testResultId !== undefined) updateData.testResultId = testResultId || null;
    if (expectedResult !== undefined) updateData.expectedResult = expectedResult?.trim() || null;
    if (actualResult !== undefined) updateData.actualResult = actualResult?.trim() || null;
    if (assigneeId !== undefined) updateData.assigneeId = assigneeId || null;

    if (status !== undefined) {
      const bugStatus = status.trim();
      updateData.status = bugStatus;
      const isResolved = bugStatus === 'Resolved' || bugStatus === 'Closed' || bugStatus === 'Done';
      
      if (isResolved && !bug.resolvedAt) {
        updateData.resolvedAt = new Date();
      } else if (!isResolved && bug.resolvedAt) {
        updateData.resolvedAt = null;
      }
    }

    const updatedBug = await prisma.bug.update({
      where: { id },
      data: updateData,
      include: bugInclude
    });

    const action = (updatedBug.status === 'Resolved' || updatedBug.status === 'Closed' || updatedBug.status === 'Done') && bug.status !== updatedBug.status
      ? 'Completed'
      : 'Updated';

    createAuditLog({
      userId: req.userId,
      action,
      entityType: 'Bug',
      entityId: id,
      metadata: { title: updatedBug.title, status: updatedBug.status }
    });

    res.json({ success: true, bug: updatedBug });
  } catch (error) {
    console.error('updateBug error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

exports.deleteBug = async (req, res) => {
  try {
    const { id } = req.params;
    const bug = await prisma.bug.findUnique({ where: { id } });
    if (!bug) return res.status(404).json({ success: false, message: 'Bug not found' });

    const access = await checkProjectAccess(bug.projectId, req.userId);
    if (!access.accessible) return res.status(403).json({ success: false, message: 'Forbidden' });
    if (access.role !== 'Admin') return res.status(403).json({ success: false, message: 'Only Admins can delete bugs' });

    await prisma.bug.delete({ where: { id } });
    
    createAuditLog({
      userId: req.userId,
      action: 'Deleted',
      entityType: 'Bug',
      entityId: id,
      metadata: { title: bug.title }
    });

    res.json({ success: true, message: 'Bug deleted successfully' });
  } catch (error) {
    console.error('deleteBug error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};
