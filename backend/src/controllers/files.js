const prisma = require('../db');
const { checkProjectAccess } = require('../utils/projectAccess');
const { createAuditLog } = require('../utils/audit');

exports.getFiles = async (req, res) => {
  try {
    const { projectId, folderId } = req.query;
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

    if (folderId !== undefined) {
      // Need to verify access if folderId is provided and projectId isn't explicitly provided,
      // but Prisma takes care of returning nothing if folder is in an inaccessible project given the base whereClause.
      // However, if we want to ensure the folder itself exists and is valid, we can check it.
      // Let's just trust the base where clause + folder filter to be safe.
      whereClause.folderId = folderId === 'null' || !folderId ? null : folderId;
    }

    const files = await prisma.file.findMany({
      where: whereClause,
      include: {
        project: { select: { id: true, name: true } },
        folder: { select: { id: true, name: true } },
        uploader: { select: { id: true, name: true } }
      },
      orderBy: { name: 'asc' }
    });

    res.json({ success: true, files });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

exports.getFileById = async (req, res) => {
  try {
    const { id } = req.params;
    const file = await prisma.file.findUnique({
      where: { id },
      include: {
        project: { select: { id: true, name: true } },
        folder: { select: { id: true, name: true } },
        uploader: { select: { id: true, name: true, email: true } }
      }
    });

    if (!file) return res.status(404).json({ success: false, message: 'File not found' });

    const access = await checkProjectAccess(file.projectId, req.userId);
    if (!access.accessible) return res.status(403).json({ success: false, message: 'Forbidden' });

    res.json({ success: true, file });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

exports.createFile = async (req, res) => {
  try {
    const { name, type, size, storagePath, projectId, folderId } = req.body;

    if (!name || typeof name !== 'string' || !name.trim()) return res.status(400).json({ success: false, message: 'Name is required' });
    if (!type || typeof type !== 'string' || !type.trim()) return res.status(400).json({ success: false, message: 'Type is required' });
    if (size === undefined || typeof size !== 'number' || size < 0) return res.status(400).json({ success: false, message: 'Valid size is required' });
    if (!storagePath || typeof storagePath !== 'string' || !storagePath.trim()) return res.status(400).json({ success: false, message: 'Storage path is required' });
    if (!projectId) return res.status(400).json({ success: false, message: 'projectId is required' });

    // Reject suspicious storagePath traversing
    if (storagePath.includes('..')) {
      return res.status(400).json({ success: false, message: 'Invalid storagePath format' });
    }

    const access = await checkProjectAccess(projectId, req.userId);
    if (!access.accessible) return res.status(404).json({ success: false, message: 'Project not found' });
    if (access.role === 'Viewer') return res.status(403).json({ success: false, message: 'Viewers cannot create files' });

    if (folderId) {
      const folder = await prisma.folder.findUnique({ where: { id: folderId } });
      if (!folder || folder.projectId !== projectId) {
        return res.status(409).json({ success: false, message: 'Folder not found or belongs to a different project' });
      }
    }

    const file = await prisma.file.create({
      data: {
        name: name.trim(),
        type: type.trim(),
        size,
        storagePath: storagePath.trim(),
        projectId,
        folderId: folderId || null,
        uploaderId: req.userId
      },
      include: {
        project: { select: { id: true, name: true } },
        folder: { select: { id: true, name: true } },
        uploader: { select: { id: true, name: true } }
      }
    });

    createAuditLog({
      userId: req.userId,
      action: 'Created',
      entityType: 'File',
      entityId: file.id,
      metadata: { name: file.name }
    });

    res.status(201).json({ success: true, file });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

exports.updateFile = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, folderId } = req.body;

    const file = await prisma.file.findUnique({ where: { id } });
    if (!file) return res.status(404).json({ success: false, message: 'File not found' });

    const access = await checkProjectAccess(file.projectId, req.userId);
    if (!access.accessible) return res.status(403).json({ success: false, message: 'Forbidden' });
    if (access.role === 'Viewer') return res.status(403).json({ success: false, message: 'Viewers cannot update files' });

    const updateData = {};
    if (name !== undefined) {
      if (!name || typeof name !== 'string' || !name.trim()) return res.status(400).json({ success: false, message: 'Name is required' });
      updateData.name = name.trim();
    }

    if (folderId !== undefined) {
      if (folderId) {
        const folder = await prisma.folder.findUnique({ where: { id: folderId } });
        if (!folder || folder.projectId !== file.projectId) {
          return res.status(409).json({ success: false, message: 'Folder not found or belongs to a different project' });
        }
      }
      updateData.folderId = folderId || null;
    }

    const updatedFile = await prisma.file.update({
      where: { id },
      data: updateData,
      include: {
        project: { select: { id: true, name: true } },
        folder: { select: { id: true, name: true } },
        uploader: { select: { id: true, name: true } }
      }
    });

    createAuditLog({
      userId: req.userId,
      action: 'Updated',
      entityType: 'File',
      entityId: id,
      metadata: { name: updatedFile.name }
    });

    res.json({ success: true, file: updatedFile });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

exports.deleteFile = async (req, res) => {
  try {
    const { id } = req.params;

    const file = await prisma.file.findUnique({ where: { id } });
    if (!file) return res.status(404).json({ success: false, message: 'File not found' });

    const access = await checkProjectAccess(file.projectId, req.userId);
    if (!access.accessible) return res.status(403).json({ success: false, message: 'Forbidden' });
    if (access.role !== 'Admin' && access.role !== 'Owner') {
      return res.status(403).json({ success: false, message: 'Only Admins or Owners can delete files' });
    }

    await prisma.file.delete({ where: { id } });

    createAuditLog({
      userId: req.userId,
      action: 'Deleted',
      entityType: 'File',
      entityId: id,
      metadata: { name: file.name }
    });

    // Note: We are deleting DB metadata only. Real storage deletion happens here when provider is chosen.

    res.json({ success: true, message: 'File deleted successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};
