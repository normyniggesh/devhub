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

exports.getDeployments = async (req, res) => {
  try {
    const { projectId, repositoryId } = req.query;
    let whereClause = {};

    if (projectId) {
      const access = await checkProjectAccess(projectId, req.userId);
      if (!access.accessible) return res.status(403).json({ success: false, message: 'Forbidden' });
      whereClause.projectId = projectId;
    } else {
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

    const deployments = await prisma.deployment.findMany({
      where: whereClause,
      include: {
        repository: { select: { id: true, name: true, projectId: true } }
      },
      orderBy: { deployedAt: 'desc' }
    });

    res.json({ success: true, deployments });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

exports.getDeploymentById = async (req, res) => {
  try {
    const { id } = req.params;
    const deployment = await prisma.deployment.findUnique({
      where: { id },
      include: {
        repository: { select: { id: true, name: true } }
      }
    });

    if (!deployment) return res.status(404).json({ success: false, message: 'Deployment not found' });

    const access = await checkProjectAccess(deployment.projectId, req.userId);
    if (!access.accessible) return res.status(403).json({ success: false, message: 'Forbidden' });

    res.json({ success: true, deployment });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

exports.createDeployment = async (req, res) => {
  try {
    const { repositoryId, projectId, environment, status, url, deployerGithubUsername, deployerId } = req.body;

    if (!repositoryId) return res.status(400).json({ success: false, message: 'repositoryId is required' });
    if (!projectId) return res.status(400).json({ success: false, message: 'projectId is required' });
    if (!environment || typeof environment !== 'string' || !environment.trim()) return res.status(400).json({ success: false, message: 'Environment is required' });
    if (url && !isValidHttpUrl(url)) return res.status(400).json({ success: false, message: 'Valid URL is required when provided' });

    const access = await checkProjectAccess(projectId, req.userId);
    if (!access.accessible) return res.status(404).json({ success: false, message: 'Project not found' });
    if (access.role === 'Viewer') return res.status(403).json({ success: false, message: 'Viewers cannot create deployment records' });

    const repository = await prisma.repository.findUnique({ where: { id: repositoryId } });
    if (!repository) return res.status(404).json({ success: false, message: 'Repository not found' });
    
    if (repository.projectId !== projectId) {
      return res.status(409).json({ success: false, message: 'Repository belongs to a different project' });
    }

    const deployment = await prisma.deployment.create({
      data: {
        repositoryId,
        projectId,
        environment: environment.trim(),
        status: status?.trim() || 'Pending',
        url: url?.trim() || null,
        deployerGithubUsername: deployerGithubUsername?.trim() || null,
        deployerId: deployerId || null,
        deployedAt: new Date()
      },
      include: {
        repository: { select: { id: true, name: true } }
      }
    });

    createAuditLog({
      userId: req.userId,
      action: 'Created',
      entityType: 'Deployment',
      entityId: deployment.id,
      metadata: { environment: deployment.environment, status: deployment.status }
    });

    res.status(201).json({ success: true, deployment });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

exports.updateDeployment = async (req, res) => {
  try {
    const { id } = req.params;
    const { environment, status, url, deployerGithubUsername, deployerId } = req.body;

    const deployment = await prisma.deployment.findUnique({ where: { id } });
    if (!deployment) return res.status(404).json({ success: false, message: 'Deployment not found' });

    const access = await checkProjectAccess(deployment.projectId, req.userId);
    if (!access.accessible) return res.status(403).json({ success: false, message: 'Forbidden' });
    if (access.role === 'Viewer') return res.status(403).json({ success: false, message: 'Viewers cannot update deployment records' });

    const updateData = {};
    if (environment !== undefined) {
      if (!environment || typeof environment !== 'string' || !environment.trim()) return res.status(400).json({ success: false, message: 'Environment is required' });
      updateData.environment = environment.trim();
    }
    if (status !== undefined) updateData.status = status.trim();
    if (url !== undefined) {
      if (url && !isValidHttpUrl(url)) return res.status(400).json({ success: false, message: 'Valid URL is required when provided' });
      updateData.url = url ? url.trim() : null;
    }
    if (deployerGithubUsername !== undefined) updateData.deployerGithubUsername = deployerGithubUsername?.trim() || null;
    if (deployerId !== undefined) updateData.deployerId = deployerId || null;

    const updatedDeployment = await prisma.deployment.update({
      where: { id },
      data: updateData,
      include: {
        repository: { select: { id: true, name: true } }
      }
    });

    const action = (updatedDeployment.status === 'Success' || updatedDeployment.status === 'Failed') && deployment.status !== updatedDeployment.status
      ? 'Completed'
      : 'Updated';

    createAuditLog({
      userId: req.userId,
      action,
      entityType: 'Deployment',
      entityId: id,
      metadata: { environment: updatedDeployment.environment, status: updatedDeployment.status }
    });

    res.json({ success: true, deployment: updatedDeployment });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

exports.deleteDeployment = async (req, res) => {
  try {
    const { id } = req.params;

    const deployment = await prisma.deployment.findUnique({ where: { id } });
    if (!deployment) return res.status(404).json({ success: false, message: 'Deployment not found' });

    const access = await checkProjectAccess(deployment.projectId, req.userId);
    if (!access.accessible) return res.status(403).json({ success: false, message: 'Forbidden' });
    if (access.role !== 'Admin' && access.role !== 'Owner') {
      return res.status(403).json({ success: false, message: 'Only Admins or Owners can delete deployment records' });
    }

    await prisma.deployment.delete({ where: { id } });

    createAuditLog({
      userId: req.userId,
      action: 'Deleted',
      entityType: 'Deployment',
      entityId: id,
      metadata: { environment: deployment.environment }
    });

    res.json({ success: true, message: 'Deployment deleted successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};
