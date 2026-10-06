const prisma = require('../db');
const { checkProjectAccess } = require('../utils/projectAccess');
const { createAuditLog } = require('../utils/audit');
const permissionService = require('../services/permissionService');

async function isDescendant(folderId, potentialParentId) {
  let currentParentId = potentialParentId;
  while (currentParentId) {
    if (currentParentId === folderId) {
      return true;
    }
    const parentFolder = await prisma.folder.findUnique({
      where: { id: currentParentId },
      select: { parentId: true }
    });
    if (!parentFolder) break;
    currentParentId = parentFolder.parentId;
  }
  return false;
}

exports.getFolders = async (req, res) => {
  try {
    const { projectId, teamId, scope, storageScope, parentId } = req.query;
    const currentUser = await prisma.user.findUnique({
      where: { id: req.userId },
      select: { id: true, role: true }
    });

    let whereClause = {};

    if (projectId) {
      const access = await checkProjectAccess(projectId, req.userId);
      if (!access.accessible) return res.status(403).json({ success: false, message: 'Forbidden' });
      whereClause.projectId = projectId;
    } else if (teamId) {
      const teamMembers = await prisma.teamMember.findMany({ where: { teamId } });
      if (!permissionService.canAccessTeamFile(currentUser, teamMembers.map(m => m.userId))) {
        return res.status(403).json({ success: false, message: 'Forbidden' });
      }
      whereClause.teamId = teamId;
    } else if (scope === 'PERSONAL' || storageScope === 'PERSONAL') {
      whereClause = { storageScope: 'PERSONAL', creatorId: req.userId };
    } else {
      whereClause = {
        OR: [
          { storageScope: 'PERSONAL', creatorId: req.userId },
          { team: { members: { some: { userId: req.userId } } } },
          { project: { OR: [ { ownerId: req.userId }, { members: { some: { userId: req.userId } } } ] } }
        ]
      };
    }

    if (parentId !== undefined) {
      whereClause.parentId = parentId === 'null' || !parentId ? null : parentId;
    }

    const folders = await prisma.folder.findMany({
      where: whereClause,
      include: {
        project: { select: { id: true, name: true } },
        team: { select: { id: true, name: true } },
        creator: { select: { id: true, name: true } }
      },
      orderBy: { name: 'asc' }
    });

    res.json({ success: true, folders });
  } catch (error) {
    console.error('getFolders error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

exports.getFolderById = async (req, res) => {
  try {
    const { id } = req.params;
    const currentUser = await prisma.user.findUnique({
      where: { id: req.userId },
      select: { id: true, role: true }
    });

    const folder = await prisma.folder.findUnique({
      where: { id },
      include: {
        project: { select: { id: true, name: true } },
        team: { select: { id: true, name: true } },
        creator: { select: { id: true, name: true } },
        children: { select: { id: true, name: true } },
        files: { select: { id: true, name: true, type: true, size: true } }
      }
    });

    if (!folder) return res.status(404).json({ success: false, message: 'Folder not found' });

    if (folder.storageScope === 'PERSONAL' && !folder.projectId) {
      if (!permissionService.canAccessPersonalFile(currentUser, folder.creatorId)) {
        return res.status(403).json({ success: false, message: 'Forbidden' });
      }
    } else if (folder.teamId) {
      const teamMembers = await prisma.teamMember.findMany({ where: { teamId: folder.teamId } });
      if (!permissionService.canAccessTeamFile(currentUser, teamMembers.map(m => m.userId))) {
        return res.status(403).json({ success: false, message: 'Forbidden' });
      }
    } else if (folder.projectId) {
      const access = await checkProjectAccess(folder.projectId, req.userId);
      if (!access.accessible) return res.status(403).json({ success: false, message: 'Forbidden' });
    }

    res.json({ success: true, folder });
  } catch (error) {
    console.error('getFolderById error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

exports.createFolder = async (req, res) => {
  try {
    const { name, projectId, teamId, storageScope, parentId } = req.body || {};
    
    if (!name || typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ success: false, message: 'Folder name is required' });
    }

    const currentUser = await prisma.user.findUnique({
      where: { id: req.userId },
      select: { id: true, role: true }
    });

    const targetScope = storageScope || (teamId ? 'TEAM' : (projectId ? 'PERSONAL' : 'PERSONAL'));

    if (teamId || targetScope === 'TEAM') {
      if (!teamId) return res.status(400).json({ success: false, message: 'teamId is required for team folder' });
      const teamMembers = await prisma.teamMember.findMany({ where: { teamId } });
      if (!permissionService.canAccessTeamFile(currentUser, teamMembers.map(m => m.userId))) {
        return res.status(403).json({ success: false, message: 'Forbidden' });
      }
      if (parentId) {
        const parentFolder = await prisma.folder.findUnique({ where: { id: parentId } });
        if (!parentFolder || parentFolder.teamId !== teamId) {
          return res.status(409).json({ success: false, message: 'Parent folder not found or belongs to a different team' });
        }
      }
    } else if (projectId) {
      const access = await checkProjectAccess(projectId, req.userId);
      if (!access.accessible) return res.status(404).json({ success: false, message: 'Project not found' });
      if (access.role === 'Viewer') return res.status(403).json({ success: false, message: 'Viewers cannot create folders' });
      if (parentId) {
        const parentFolder = await prisma.folder.findUnique({ where: { id: parentId } });
        if (!parentFolder || parentFolder.projectId !== projectId) {
          return res.status(409).json({ success: false, message: 'Parent folder not found or belongs to a different project' });
        }
      }
    } else {
      // Personal scope folder
      if (parentId) {
        const parentFolder = await prisma.folder.findUnique({ where: { id: parentId } });
        if (!parentFolder || parentFolder.creatorId !== req.userId || parentFolder.storageScope !== 'PERSONAL') {
          return res.status(409).json({ success: false, message: 'Parent folder not found or not in personal storage' });
        }
      }
    }

    const folder = await prisma.folder.create({
      data: {
        name: name.trim(),
        storageScope: targetScope,
        projectId: projectId || null,
        teamId: teamId || null,
        parentId: parentId || null,
        creatorId: req.userId
      },
      include: {
        project: { select: { id: true, name: true } },
        team: { select: { id: true, name: true } },
        creator: { select: { id: true, name: true } }
      }
    });

    createAuditLog({
      userId: req.userId,
      action: 'Created',
      entityType: 'Folder',
      entityId: folder.id,
      metadata: { name: folder.name, scope: targetScope }
    });

    res.status(201).json({ success: true, folder });
  } catch (error) {
    console.error('createFolder error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

exports.updateFolder = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, parentId } = req.body;

    const currentUser = await prisma.user.findUnique({
      where: { id: req.userId },
      select: { id: true, role: true }
    });

    const folder = await prisma.folder.findUnique({ where: { id } });
    if (!folder) return res.status(404).json({ success: false, message: 'Folder not found' });

    if (folder.storageScope === 'PERSONAL' && !folder.projectId) {
      if (!permissionService.canAccessPersonalFile(currentUser, folder.creatorId)) {
        return res.status(403).json({ success: false, message: 'Forbidden' });
      }
    } else if (folder.teamId) {
      const teamMembers = await prisma.teamMember.findMany({ where: { teamId: folder.teamId } });
      if (!permissionService.canManageTeam(currentUser, teamMembers)) {
        return res.status(403).json({ success: false, message: 'Only Team Leaders or Admins can update team folders' });
      }
    } else if (folder.projectId) {
      const access = await checkProjectAccess(folder.projectId, req.userId);
      if (!access.accessible) return res.status(403).json({ success: false, message: 'Forbidden' });
      if (access.role === 'Viewer') return res.status(403).json({ success: false, message: 'Viewers cannot update folders' });
    }

    const updateData = {};
    if (name !== undefined) {
      if (!name || typeof name !== 'string' || !name.trim()) return res.status(400).json({ success: false, message: 'Name is required' });
      updateData.name = name.trim();
    }

    if (parentId !== undefined) {
      if (parentId === id) {
        return res.status(409).json({ success: false, message: 'Folder cannot be its own parent' });
      }

      if (parentId) {
        const parentFolder = await prisma.folder.findUnique({ where: { id: parentId } });
        if (!parentFolder) {
          return res.status(409).json({ success: false, message: 'Parent folder not found' });
        }
        if (folder.projectId && parentFolder.projectId !== folder.projectId) {
          return res.status(409).json({ success: false, message: 'Parent folder belongs to a different project' });
        }
        if (folder.teamId && parentFolder.teamId !== folder.teamId) {
          return res.status(409).json({ success: false, message: 'Parent folder belongs to a different team' });
        }
        
        const cyclic = await isDescendant(id, parentId);
        if (cyclic) {
          return res.status(409).json({ success: false, message: 'Cannot move folder into its own descendant' });
        }
      }
      
      updateData.parentId = parentId || null;
    }

    const updatedFolder = await prisma.folder.update({
      where: { id },
      data: updateData,
      include: {
        project: { select: { id: true, name: true } },
        team: { select: { id: true, name: true } },
        creator: { select: { id: true, name: true } }
      }
    });

    createAuditLog({
      userId: req.userId,
      action: 'Updated',
      entityType: 'Folder',
      entityId: id,
      metadata: { name: updatedFolder.name }
    });

    res.json({ success: true, folder: updatedFolder });
  } catch (error) {
    console.error('updateFolder error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

exports.deleteFolder = async (req, res) => {
  try {
    const { id } = req.params;
    const currentUser = await prisma.user.findUnique({
      where: { id: req.userId },
      select: { id: true, role: true }
    });

    const folder = await prisma.folder.findUnique({ 
      where: { id },
      include: { children: { select: { id: true } }, files: { select: { id: true } } }
    });
    
    if (!folder) return res.status(404).json({ success: false, message: 'Folder not found' });

    if (folder.storageScope === 'PERSONAL' && !folder.projectId) {
      if (!permissionService.canAccessPersonalFile(currentUser, folder.creatorId)) {
        return res.status(403).json({ success: false, message: 'Only the creator or Admin can delete personal folders' });
      }
    } else if (folder.teamId) {
      const teamMembers = await prisma.teamMember.findMany({ where: { teamId: folder.teamId } });
      if (!permissionService.canManageTeam(currentUser, teamMembers)) {
        return res.status(403).json({ success: false, message: 'Only Team Leaders or Admins can delete team folders' });
      }
    } else if (folder.projectId) {
      const access = await checkProjectAccess(folder.projectId, req.userId);
      if (!access.accessible) return res.status(403).json({ success: false, message: 'Forbidden' });
      if (access.role !== 'Admin' && access.role !== 'Owner') {
        return res.status(403).json({ success: false, message: 'Only Admins or Owners can delete folders' });
      }
    }

    if (folder.children.length > 0 || folder.files.length > 0) {
      return res.status(409).json({ success: false, message: 'Cannot delete folder because it contains child folders or files' });
    }

    await prisma.folder.delete({ where: { id } });

    createAuditLog({
      userId: req.userId,
      action: 'Deleted',
      entityType: 'Folder',
      entityId: id,
      metadata: { name: folder.name }
    });

    res.json({ success: true, message: 'Folder deleted successfully' });
  } catch (error) {
    console.error('deleteFolder error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};
