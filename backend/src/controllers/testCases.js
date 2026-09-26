const prisma = require('../db');
const { checkProjectAccess } = require('../utils/projectAccess');
const { createAuditLog } = require('../utils/audit');

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
      include: {
        project: { select: { id: true, name: true } },
        creator: { select: { id: true, name: true, email: true } }
      },
      orderBy: { createdAt: 'desc' }
    });

    res.json({ success: true, testCases });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

exports.getTestCaseById = async (req, res) => {
  try {
    const { id } = req.params;
    const testCase = await prisma.testCase.findUnique({
      where: { id },
      include: {
        project: { select: { id: true, name: true } },
        creator: { select: { id: true, name: true, email: true } }
      }
    });

    if (!testCase) return res.status(404).json({ success: false, message: 'Test case not found' });

    const access = await checkProjectAccess(testCase.projectId, req.userId);
    if (!access.accessible) return res.status(403).json({ success: false, message: 'Forbidden' });

    res.json({ success: true, testCase });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

exports.createTestCase = async (req, res) => {
  try {
    const { projectId, title, description, module, status, priority, expectedResult } = req.body;
    if (!projectId || !title || typeof title !== 'string' || !title.trim()) {
      return res.status(400).json({ success: false, message: 'projectId and title are required' });
    }

    const access = await checkProjectAccess(projectId, req.userId);
    if (!access.accessible) return res.status(404).json({ success: false, message: 'Project not found' });
    if (access.role === 'Viewer') return res.status(403).json({ success: false, message: 'Viewers cannot create test cases' });

    const testCase = await prisma.testCase.create({
      data: {
        projectId,
        title: title.trim(),
        description: description?.trim() || null,
        module: module?.trim() || null,
        status: status?.trim() || 'Draft',
        priority: priority?.trim() || null,
        expectedResult: expectedResult?.trim() || null,
        creatorId: req.userId
      },
      include: {
        project: { select: { id: true, name: true } },
        creator: { select: { id: true, name: true } }
      }
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
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

exports.updateTestCase = async (req, res) => {
  try {
    const { id } = req.params;
    const { title, description, module, status, priority, expectedResult } = req.body;

    const testCase = await prisma.testCase.findUnique({ where: { id } });
    if (!testCase) return res.status(404).json({ success: false, message: 'Test case not found' });

    const access = await checkProjectAccess(testCase.projectId, req.userId);
    if (!access.accessible) return res.status(403).json({ success: false, message: 'Forbidden' });
    if (access.role === 'Viewer') return res.status(403).json({ success: false, message: 'Viewers cannot update test cases' });

    const updateData = {};
    if (title !== undefined) {
      if (!title || typeof title !== 'string' || !title.trim()) return res.status(400).json({ success: false, message: 'Title is required' });
      updateData.title = title.trim();
    }
    if (description !== undefined) updateData.description = description?.trim() || null;
    if (module !== undefined) updateData.module = module?.trim() || null;
    if (status !== undefined) updateData.status = status?.trim() || 'Draft';
    if (priority !== undefined) updateData.priority = priority?.trim() || null;
    if (expectedResult !== undefined) updateData.expectedResult = expectedResult?.trim() || null;

    const updatedTestCase = await prisma.testCase.update({
      where: { id },
      data: updateData,
      include: {
        project: { select: { id: true, name: true } },
        creator: { select: { id: true, name: true } }
      }
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

    await prisma.testCase.delete({ where: { id } });
    
    createAuditLog({
      userId: req.userId,
      action: 'Deleted',
      entityType: 'TestCase',
      entityId: id,
      metadata: { title: testCase.title }
    });

    res.json({ success: true, message: 'Test case deleted successfully' });
  } catch (error) {
    if (error.code === 'P2003') {
      return res.status(409).json({ success: false, message: 'Cannot delete test case due to existing dependent records.' });
    }
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};
