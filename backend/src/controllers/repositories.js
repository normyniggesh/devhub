const prisma = require('../db');
const { checkProjectAccess } = require('../utils/projectAccess');
const { createAuditLog } = require('../utils/audit');

function isValidHttpUrl(string) {
  try {
    const url = new URL(string);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch (_) {
    return false;
  }
}

exports.getRepositories = async (req, res) => {
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

    const repositories = await prisma.repository.findMany({
      where: whereClause,
      include: {
        project: { select: { id: true, name: true } }
      }
    });

    res.json({ success: true, repositories });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

exports.getRepositoryById = async (req, res) => {
  try {
    const { id } = req.params;
    const repository = await prisma.repository.findUnique({
      where: { id },
      include: {
        project: { select: { id: true, name: true } }
      }
    });

    if (!repository) return res.status(404).json({ success: false, message: 'Repository not found' });

    const access = await checkProjectAccess(repository.projectId, req.userId);
    if (!access.accessible) return res.status(403).json({ success: false, message: 'Forbidden' });

    res.json({ success: true, repository });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

exports.createRepository = async (req, res) => {
  try {
    const { name, owner, url, projectId, defaultBranch } = req.body;

    if (!name || typeof name !== 'string' || !name.trim()) return res.status(400).json({ success: false, message: 'Name is required' });
    if (!owner || typeof owner !== 'string' || !owner.trim()) return res.status(400).json({ success: false, message: 'Owner is required' });
    if (!url || !isValidHttpUrl(url)) return res.status(400).json({ success: false, message: 'Valid URL is required' });
    if (!projectId) return res.status(400).json({ success: false, message: 'projectId is required' });

    const access = await checkProjectAccess(projectId, req.userId);
    if (!access.accessible) return res.status(404).json({ success: false, message: 'Project not found' });
    if (access.role === 'Viewer') return res.status(403).json({ success: false, message: 'Viewers cannot create repositories' });

    const repository = await prisma.repository.create({
      data: {
        name: name.trim(),
        owner: owner.trim(),
        url: url.trim(),
        projectId,
        defaultBranch: defaultBranch?.trim() || null
      },
      include: {
        project: { select: { id: true, name: true } }
      }
    });

    createAuditLog({
      userId: req.userId,
      action: 'Created',
      entityType: 'Repository',
      entityId: repository.id,
      metadata: { name: repository.name, url: repository.url }
    });

    res.status(201).json({ success: true, repository });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

exports.updateRepository = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, owner, url, defaultBranch } = req.body;

    const repository = await prisma.repository.findUnique({ where: { id } });
    if (!repository) return res.status(404).json({ success: false, message: 'Repository not found' });

    const access = await checkProjectAccess(repository.projectId, req.userId);
    if (!access.accessible) return res.status(403).json({ success: false, message: 'Forbidden' });
    if (access.role === 'Viewer') return res.status(403).json({ success: false, message: 'Viewers cannot update repositories' });

    const updateData = {};
    if (name !== undefined) {
      if (!name || typeof name !== 'string' || !name.trim()) return res.status(400).json({ success: false, message: 'Name is required' });
      updateData.name = name.trim();
    }
    if (owner !== undefined) {
      if (!owner || typeof owner !== 'string' || !owner.trim()) return res.status(400).json({ success: false, message: 'Owner is required' });
      updateData.owner = owner.trim();
    }
    if (url !== undefined) {
      if (!url || !isValidHttpUrl(url)) return res.status(400).json({ success: false, message: 'Valid URL is required' });
      updateData.url = url.trim();
    }
    if (defaultBranch !== undefined) updateData.defaultBranch = defaultBranch?.trim() || null;

    const updatedRepository = await prisma.repository.update({
      where: { id },
      data: updateData,
      include: {
        project: { select: { id: true, name: true } }
      }
    });

    createAuditLog({
      userId: req.userId,
      action: 'Updated',
      entityType: 'Repository',
      entityId: id,
      metadata: { name: updatedRepository.name }
    });

    res.json({ success: true, repository: updatedRepository });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

exports.deleteRepository = async (req, res) => {
  try {
    const { id } = req.params;

    const repository = await prisma.repository.findUnique({ where: { id } });
    if (!repository) return res.status(404).json({ success: false, message: 'Repository not found' });

    const access = await checkProjectAccess(repository.projectId, req.userId);
    if (!access.accessible) return res.status(403).json({ success: false, message: 'Forbidden' });
    if (access.role !== 'Admin' && access.role !== 'Owner') {
      return res.status(403).json({ success: false, message: 'Only Admins or Owners can delete repositories' });
    }

    // Delete associated PullRequests and Deployments
    await prisma.pullRequest.deleteMany({ where: { repositoryId: id } });
    await prisma.deployment.deleteMany({ where: { repositoryId: id } });

    await prisma.repository.delete({ where: { id } });

    createAuditLog({
      userId: req.userId,
      action: 'Deleted',
      entityType: 'Repository',
      entityId: id,
      metadata: { name: repository.name }
    });

    res.json({ success: true, message: 'Repository deleted successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};
