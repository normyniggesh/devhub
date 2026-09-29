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
      // Repositories belonging to this user, OR associated with projects the user is a member/owner of
      whereClause = {
        OR: [
          { userId: req.userId },
          {
            projectId: { not: null },
            project: {
              OR: [
                { ownerId: req.userId },
                { members: { some: { userId: req.userId } } }
              ]
            }
          }
        ]
      };
    }

    const repositories = await prisma.repository.findMany({
      where: whereClause,
      include: {
        project: { select: { id: true, name: true } },
        user: { select: { id: true, name: true, avatarUrl: true } }
      },
      orderBy: { createdAt: 'desc' }
    }).catch(async () => {
      // Fallback without orderBy createdAt if createdAt not in schema
      return await prisma.repository.findMany({
        where: whereClause,
        include: {
          project: { select: { id: true, name: true } },
          user: { select: { id: true, name: true, avatarUrl: true } }
        }
      });
    });

    res.json({ success: true, repositories });
  } catch (error) {
    console.error('Error getting repositories:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

exports.getRepositoryById = async (req, res) => {
  try {
    const { id } = req.params;
    const repository = await prisma.repository.findUnique({
      where: { id },
      include: {
        project: { select: { id: true, name: true } },
        user: { select: { id: true, name: true, avatarUrl: true } }
      }
    });

    if (!repository) return res.status(404).json({ success: false, message: 'Repository not found' });

    if (repository.userId && repository.userId === req.userId) {
      return res.json({ success: true, repository });
    }

    if (repository.projectId) {
      const access = await checkProjectAccess(repository.projectId, req.userId);
      if (!access.accessible) return res.status(403).json({ success: false, message: 'Forbidden' });
    } else if (repository.userId !== req.userId) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }

    res.json({ success: true, repository });
  } catch (error) {
    console.error('Error getting repository by id:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

exports.createRepository = async (req, res) => {
  try {
    const { name, owner, url, projectId, defaultBranch, description } = req.body;

    if (!name || typeof name !== 'string' || !name.trim()) return res.status(400).json({ success: false, message: 'Name is required' });
    if (!owner || typeof owner !== 'string' || !owner.trim()) return res.status(400).json({ success: false, message: 'Owner is required' });
    if (!url || !isValidHttpUrl(url)) return res.status(400).json({ success: false, message: 'Valid URL is required' });

    if (projectId) {
      const access = await checkProjectAccess(projectId, req.userId);
      if (!access.accessible) return res.status(404).json({ success: false, message: 'Project not found' });
      if (access.role === 'Viewer') return res.status(403).json({ success: false, message: 'Viewers cannot create repositories' });
    }

    const repository = await prisma.repository.create({
      data: {
        name: name.trim(),
        owner: owner.trim(),
        url: url.trim(),
        projectId: projectId || null,
        userId: req.userId,
        defaultBranch: defaultBranch?.trim() || 'main',
        description: description?.trim() || null
      },
      include: {
        project: { select: { id: true, name: true } },
        user: { select: { id: true, name: true, avatarUrl: true } }
      }
    });

    createAuditLog({
      userId: req.userId,
      action: 'Created',
      entityType: 'Repository',
      entityId: repository.id,
      projectId: repository.projectId,
      metadata: { name: repository.name, url: repository.url }
    });

    res.status(201).json({ success: true, repository });
  } catch (error) {
    console.error('Error creating repository:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

exports.updateRepository = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, owner, url, defaultBranch, description, projectId } = req.body;

    const repository = await prisma.repository.findUnique({ where: { id } });
    if (!repository) return res.status(404).json({ success: false, message: 'Repository not found' });

    const isOwner = repository.userId === req.userId;
    let hasEditAccess = isOwner;

    if (!hasEditAccess && repository.projectId) {
      const access = await checkProjectAccess(repository.projectId, req.userId);
      if (access.accessible && access.role !== 'Viewer') {
        hasEditAccess = true;
      }
    }

    if (!hasEditAccess) return res.status(403).json({ success: false, message: 'Forbidden' });

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
    if (description !== undefined) updateData.description = description?.trim() || null;
    if (projectId !== undefined) {
      if (projectId) {
        const access = await checkProjectAccess(projectId, req.userId);
        if (!access.accessible) return res.status(403).json({ success: false, message: 'Forbidden project' });
        updateData.projectId = projectId;
      } else {
        updateData.projectId = null;
      }
    }

    const updatedRepository = await prisma.repository.update({
      where: { id },
      data: updateData,
      include: {
        project: { select: { id: true, name: true } },
        user: { select: { id: true, name: true, avatarUrl: true } }
      }
    });

    createAuditLog({
      userId: req.userId,
      action: 'Updated',
      entityType: 'Repository',
      entityId: id,
      projectId: updatedRepository.projectId,
      metadata: { name: updatedRepository.name }
    });

    res.json({ success: true, repository: updatedRepository });
  } catch (error) {
    console.error('Error updating repository:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

exports.deleteRepository = async (req, res) => {
  try {
    const { id } = req.params;

    const repository = await prisma.repository.findUnique({ where: { id } });
    if (!repository) return res.status(404).json({ success: false, message: 'Repository not found' });

    const isOwner = repository.userId === req.userId;
    let isProjectAdmin = false;

    if (repository.projectId) {
      const access = await checkProjectAccess(repository.projectId, req.userId);
      if (access.accessible && (access.role === 'Admin' || access.role === 'Owner')) {
        isProjectAdmin = true;
      }
    }

    if (!isOwner && !isProjectAdmin) {
      return res.status(403).json({ success: false, message: 'Only the repository owner or project Admin can delete this repository' });
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
      projectId: repository.projectId,
      metadata: { name: repository.name }
    });

    res.json({ success: true, message: 'Repository disconnected and deleted successfully' });
  } catch (error) {
    console.error('Error deleting repository:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};
