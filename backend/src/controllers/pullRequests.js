const prisma = require('../db');
const { checkProjectAccess } = require('../utils/projectAccess');
const { createAuditLog } = require('../utils/audit');

exports.getPullRequests = async (req, res) => {
  try {
    const { projectId, repositoryId } = req.query;
    let whereClause = {};

    if (projectId) {
      const access = await checkProjectAccess(projectId, req.userId);
      if (!access.accessible) return res.status(403).json({ success: false, message: 'Forbidden' });
      whereClause.projectId = projectId;
    } else {
      // Find all projects the user can access
      const projects = await prisma.project.findMany({
        where: {
          OR: [
            { ownerId: req.userId },
            { members: { some: { userId: req.userId } } }
          ]
        },
        select: { id: true }
      });
      whereClause.projectId = { in: projects.map(p => p.id) };
    }

    if (repositoryId) {
      whereClause.repositoryId = repositoryId;
    }

    const pullRequests = await prisma.pullRequest.findMany({
      where: whereClause,
      include: {
        repository: { select: { id: true, name: true, projectId: true } }
      }
    });

    res.json({ success: true, pullRequests });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

exports.getPullRequestById = async (req, res) => {
  try {
    const { id } = req.params;
    const pr = await prisma.pullRequest.findUnique({
      where: { id },
      include: {
        repository: { select: { id: true, name: true } }
      }
    });

    if (!pr) return res.status(404).json({ success: false, message: 'Pull request not found' });

    const access = await checkProjectAccess(pr.projectId, req.userId);
    if (!access.accessible) return res.status(403).json({ success: false, message: 'Forbidden' });

    res.json({ success: true, pullRequest: pr });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

exports.createPullRequest = async (req, res) => {
  try {
    const { repositoryId, projectId, title, number, status, authorGithubUsername, authorId } = req.body;

    if (!repositoryId) return res.status(400).json({ success: false, message: 'repositoryId is required' });
    if (!projectId) return res.status(400).json({ success: false, message: 'projectId is required' });
    if (!title || typeof title !== 'string' || !title.trim()) return res.status(400).json({ success: false, message: 'Title is required' });
    if (number === undefined || typeof number !== 'number') return res.status(400).json({ success: false, message: 'Valid number is required' });

    const access = await checkProjectAccess(projectId, req.userId);
    if (!access.accessible) return res.status(404).json({ success: false, message: 'Project not found' });
    if (access.role === 'Viewer') return res.status(403).json({ success: false, message: 'Viewers cannot create PR records' });

    const repository = await prisma.repository.findUnique({ where: { id: repositoryId } });
    if (!repository) return res.status(404).json({ success: false, message: 'Repository not found' });
    
    if (repository.projectId !== projectId) {
      return res.status(409).json({ success: false, message: 'Repository belongs to a different project' });
    }

    const pr = await prisma.pullRequest.create({
      data: {
        repositoryId,
        projectId,
        title: title.trim(),
        number,
        status: status?.trim() || 'Open',
        authorGithubUsername: authorGithubUsername?.trim() || null,
        authorId: authorId || null
      },
      include: {
        repository: { select: { id: true, name: true } }
      }
    });

    createAuditLog({
      userId: req.userId,
      action: 'Created',
      entityType: 'PullRequest',
      entityId: pr.id,
      metadata: { title: pr.title, number: pr.number }
    });

    res.status(201).json({ success: true, pullRequest: pr });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

exports.updatePullRequest = async (req, res) => {
  try {
    const { id } = req.params;
    const { title, status, authorGithubUsername, authorId } = req.body;

    const pr = await prisma.pullRequest.findUnique({ where: { id } });
    if (!pr) return res.status(404).json({ success: false, message: 'Pull request not found' });

    const access = await checkProjectAccess(pr.projectId, req.userId);
    if (!access.accessible) return res.status(403).json({ success: false, message: 'Forbidden' });
    if (access.role === 'Viewer') return res.status(403).json({ success: false, message: 'Viewers cannot update PR records' });

    const updateData = {};
    if (title !== undefined) {
      if (!title || typeof title !== 'string' || !title.trim()) return res.status(400).json({ success: false, message: 'Title is required' });
      updateData.title = title.trim();
    }
    if (status !== undefined) updateData.status = status.trim();
    if (authorGithubUsername !== undefined) updateData.authorGithubUsername = authorGithubUsername?.trim() || null;
    if (authorId !== undefined) updateData.authorId = authorId || null;

    const updatedPr = await prisma.pullRequest.update({
      where: { id },
      data: updateData,
      include: {
        repository: { select: { id: true, name: true } }
      }
    });

    const action = (updatedPr.status === 'Merged' || updatedPr.status === 'Closed') && pr.status !== updatedPr.status
      ? 'Completed'
      : 'Updated';

    createAuditLog({
      userId: req.userId,
      action,
      entityType: 'PullRequest',
      entityId: id,
      metadata: { title: updatedPr.title, status: updatedPr.status }
    });

    res.json({ success: true, pullRequest: updatedPr });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

exports.deletePullRequest = async (req, res) => {
  try {
    const { id } = req.params;

    const pr = await prisma.pullRequest.findUnique({ where: { id } });
    if (!pr) return res.status(404).json({ success: false, message: 'Pull request not found' });

    const access = await checkProjectAccess(pr.projectId, req.userId);
    if (!access.accessible) return res.status(403).json({ success: false, message: 'Forbidden' });
    if (access.role !== 'Admin' && access.role !== 'Owner') {
      return res.status(403).json({ success: false, message: 'Only Admins or Owners can delete PR records' });
    }

    await prisma.pullRequest.delete({ where: { id } });

    createAuditLog({
      userId: req.userId,
      action: 'Deleted',
      entityType: 'PullRequest',
      entityId: id,
      metadata: { title: pr.title }
    });

    res.json({ success: true, message: 'Pull request deleted successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};
