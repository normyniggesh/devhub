const prisma = require('../db');
const { checkProjectAccess } = require('../utils/projectAccess');
const { createAuditLog } = require('../utils/audit');
const storageService = require('../services/storageService');
const permissionService = require('../services/permissionService');
const { generateSafeKey } = storageService;

exports.getFiles = async (req, res) => {
  try {
    const { projectId, teamId, scope, storageScope, folderId } = req.query;
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
      whereClause = { storageScope: 'PERSONAL', uploaderId: req.userId };
    } else {
      whereClause = {
        OR: [
          { storageScope: 'PERSONAL', uploaderId: req.userId },
          { team: { members: { some: { userId: req.userId } } } },
          { project: { OR: [ { ownerId: req.userId }, { members: { some: { userId: req.userId } } } ] } }
        ]
      };
    }

    if (folderId !== undefined) {
      whereClause.folderId = folderId === 'null' || !folderId ? null : folderId;
    }

    const files = await prisma.file.findMany({
      where: whereClause,
      include: {
        project: { select: { id: true, name: true } },
        team: { select: { id: true, name: true } },
        folder: { select: { id: true, name: true } },
        uploader: { select: { id: true, name: true } }
      },
      orderBy: { name: 'asc' }
    });

    res.json({ success: true, files });
  } catch (error) {
    console.error('getFiles Error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

exports.getFileById = async (req, res) => {
  try {
    const { id } = req.params;
    const currentUser = await prisma.user.findUnique({
      where: { id: req.userId },
      select: { id: true, role: true }
    });

    const file = await prisma.file.findUnique({
      where: { id },
      include: {
        project: { select: { id: true, name: true } },
        team: { select: { id: true, name: true } },
        folder: { select: { id: true, name: true } },
        uploader: { select: { id: true, name: true, email: true } }
      }
    });

    if (!file) return res.status(404).json({ success: false, message: 'File not found' });

    if (file.storageScope === 'PERSONAL' && !file.projectId) {
      if (!permissionService.canAccessPersonalFile(currentUser, file.uploaderId)) {
        return res.status(403).json({ success: false, message: 'Forbidden' });
      }
    } else if (file.teamId) {
      const teamMembers = await prisma.teamMember.findMany({ where: { teamId: file.teamId } });
      if (!permissionService.canAccessTeamFile(currentUser, teamMembers.map(m => m.userId))) {
        return res.status(403).json({ success: false, message: 'Forbidden' });
      }
    } else if (file.projectId) {
      const access = await checkProjectAccess(file.projectId, req.userId);
      if (!access.accessible) return res.status(403).json({ success: false, message: 'Forbidden' });
    }

    res.json({ success: true, file });
  } catch (error) {
    console.error('getFileById Error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

exports.createFile = async (req, res) => {
  try {
    const { name, type, size, storagePath, projectId, teamId, storageScope, folderId } = req.body || {};

    if (!name || typeof name !== 'string' || !name.trim()) return res.status(400).json({ success: false, message: 'Name is required' });
    if (!type || typeof type !== 'string' || !type.trim()) return res.status(400).json({ success: false, message: 'Type is required' });
    if (size === undefined || (typeof size !== 'number' && typeof size !== 'bigint' && typeof size !== 'string') || isNaN(Number(size)) || Number(size) < 0) return res.status(400).json({ success: false, message: 'Valid size is required' });
    if (!storagePath || typeof storagePath !== 'string' || !storagePath.trim()) return res.status(400).json({ success: false, message: 'Storage path is required' });

    // Reject suspicious storagePath traversing
    if (storagePath.includes('..')) {
      return res.status(400).json({ success: false, message: 'Invalid storagePath format' });
    }

    const currentUser = await prisma.user.findUnique({
      where: { id: req.userId },
      select: { id: true, role: true }
    });

    const targetScope = storageScope || (teamId ? 'TEAM' : (projectId ? 'PERSONAL' : 'PERSONAL'));

    if (teamId || targetScope === 'TEAM') {
      if (!teamId) return res.status(400).json({ success: false, message: 'teamId is required for team file' });
      const teamMembers = await prisma.teamMember.findMany({ where: { teamId } });
      if (!permissionService.canAccessTeamFile(currentUser, teamMembers.map(m => m.userId))) {
        return res.status(403).json({ success: false, message: 'Forbidden' });
      }
      if (folderId) {
        const folder = await prisma.folder.findUnique({ where: { id: folderId } });
        if (!folder || folder.teamId !== teamId) {
          return res.status(409).json({ success: false, message: 'Folder not found or belongs to a different team' });
        }
      }
    } else if (projectId) {
      const access = await checkProjectAccess(projectId, req.userId);
      if (!access.accessible) return res.status(404).json({ success: false, message: 'Project not found' });
      if (access.role === 'Viewer') return res.status(403).json({ success: false, message: 'Viewers cannot create files' });
      if (folderId) {
        const folder = await prisma.folder.findUnique({ where: { id: folderId } });
        if (!folder || folder.projectId !== projectId) {
          return res.status(409).json({ success: false, message: 'Folder not found or belongs to a different project' });
        }
      }
    } else {
      if (folderId) {
        const folder = await prisma.folder.findUnique({ where: { id: folderId } });
        if (!folder || folder.creatorId !== req.userId || folder.storageScope !== 'PERSONAL') {
          return res.status(409).json({ success: false, message: 'Folder not found or not in personal storage' });
        }
      }
    }

    const file = await prisma.file.create({
      data: {
        name: name.trim(),
        type: type.trim(),
        size: BigInt(size),
        storagePath: storagePath.trim(),
        storageProvider: 's3',
        storageScope: targetScope,
        projectId: projectId || null,
        teamId: teamId || null,
        folderId: folderId || null,
        uploaderId: req.userId
      },
      include: {
        project: { select: { id: true, name: true } },
        team: { select: { id: true, name: true } },
        folder: { select: { id: true, name: true } },
        uploader: { select: { id: true, name: true } }
      }
    });

    createAuditLog({
      userId: req.userId,
      action: 'Created',
      entityType: 'File',
      entityId: file.id,
      metadata: { name: file.name, scope: targetScope }
    });

    res.status(201).json({ success: true, file });
  } catch (error) {
    console.error('CreateFile Error:', error);
    res.status(500).json({ success: false, message: error.message || 'Internal server error' });
  }
};

exports.uploadFiles = async (req, res) => {
  try {
    const { projectId, teamId, storageScope, folderId, driveFolderId } = req.body || {};
    const files = req.files;

    if (!files || files.length === 0) return res.status(400).json({ success: false, message: 'No files uploaded' });

    const currentUser = await prisma.user.findUnique({
      where: { id: req.userId },
      select: { id: true, role: true }
    });

    const targetScope = storageScope || (teamId ? 'TEAM' : (projectId ? 'PERSONAL' : 'PERSONAL'));

    let folderRecord = null;
    if (folderId && folderId !== 'null') {
      folderRecord = await prisma.folder.findUnique({ where: { id: folderId } });
      if (!folderRecord) {
        return res.status(409).json({ success: false, message: 'Folder not found' });
      }
    }

    if (teamId || targetScope === 'TEAM') {
      if (!teamId) return res.status(400).json({ success: false, message: 'teamId is required for team upload' });
      const teamMembers = await prisma.teamMember.findMany({ where: { teamId } });
      if (!permissionService.canAccessTeamFile(currentUser, teamMembers.map(m => m.userId))) {
        return res.status(403).json({ success: false, message: 'Forbidden' });
      }
      if (folderRecord && folderRecord.teamId !== teamId) {
        return res.status(409).json({ success: false, message: 'Folder belongs to a different team' });
      }
    } else if (projectId) {
      const access = await checkProjectAccess(projectId, req.userId);
      if (!access.accessible) return res.status(403).json({ success: false, message: 'Forbidden' });
      if (access.role === 'Viewer') return res.status(403).json({ success: false, message: 'Viewers cannot upload files' });
      if (folderRecord && folderRecord.projectId !== projectId) {
        return res.status(409).json({ success: false, message: 'Folder belongs to a different project' });
      }
    } else {
      // Personal scope
      if (folderRecord && (folderRecord.creatorId !== req.userId || folderRecord.storageScope !== 'PERSONAL')) {
        return res.status(409).json({ success: false, message: 'Folder not in personal storage' });
      }
    }

    const primaryProvider = storageService.getPrimaryStorageProvider();
    let targetDriveFolderId = null;

    if (primaryProvider === 'google_drive') {
      const storageQuotaService = require('../services/storageQuotaService');
      const totalIncomingBytes = files.reduce((sum, f) => sum + BigInt(f.size || 0), 0n);

      const quotaCheck = await storageQuotaService.validateUpload({
        scope: targetScope,
        userId: req.userId,
        teamId: teamId || folderRecord?.teamId,
        incomingBytes: totalIncomingBytes
      });

      if (!quotaCheck.allowed) {
        return res.status(400).json({
          success: false,
          message: quotaCheck.reason || 'Storage quota exceeded'
        });
      }

      if (driveFolderId) {
        targetDriveFolderId = driveFolderId;
      } else if (folderRecord?.driveFolderId) {
        targetDriveFolderId = folderRecord.driveFolderId;
      } else if (folderRecord && (req.body?.autoProvision || req.body?.provisionFolder)) {
        targetDriveFolderId = await storageService.ensureDevhubDriveFolder(folderRecord.id);
      } else if (projectId) {
        const projectRecord = await prisma.project.findUnique({ where: { id: projectId } });
        if (projectRecord?.driveFolderId) {
          targetDriveFolderId = projectRecord.driveFolderId;
        } else if (req.body?.autoProvision || req.body?.provisionFolder) {
          targetDriveFolderId = await storageService.ensureProjectDriveFolder(projectId);
        }
      }

      if (!targetDriveFolderId) {
        return res.status(400).json({
          success: false,
          message: 'Google Drive target folder is not configured yet.'
        });
      }
    }

    const uploadedRecords = [];

    try {
      for (const file of files) {
        let key, driveFileId = null, storageProvider = 's3', fileMime = file.mimetype, fileSize = BigInt(file.size);

        if (primaryProvider === 'google_drive') {
          try {
            const driveRes = await storageService.googleDriveDriver.upload(
              file.buffer,
              file.mimetype,
              file.originalname,
              targetDriveFolderId
            );
            driveFileId = driveRes.driveFileId;
            key = `gdrive://${driveFileId}`;
            storageProvider = 'google_drive';
            if (driveRes.size) fileSize = BigInt(driveRes.size);
            if (driveRes.mimeType) fileMime = driveRes.mimeType;
          } catch (uploadErr) {
            console.error(`Google Drive upload error for ${file.originalname}:`, uploadErr);
            throw new Error(`Google Drive upload error for ${file.originalname}: ` + uploadErr.message);
          }
        } else {
          key = generateSafeKey(projectId, folderId, file.originalname, {
            userId: req.userId,
            teamId,
            scope: targetScope
          });
          try {
            await storageService.s3Driver.upload(file.buffer, file.mimetype, key);
            storageProvider = 's3';
          } catch (uploadErr) {
            console.error(`Storage error for ${file.originalname}:`, uploadErr);
            throw new Error(`Storage error for ${file.originalname}: ` + uploadErr.message);
          }
        }

        try {
          const dbFile = await prisma.file.create({
            data: {
              name: file.originalname,
              type: fileMime,
              size: fileSize,
              storagePath: key,
              storageProvider,
              driveFileId,
              storageScope: targetScope,
              projectId: projectId || null,
              teamId: teamId || null,
              folderId: folderId && folderId !== 'null' ? folderId : null,
              uploaderId: req.userId
            },
            include: {
              uploader: { select: { id: true, name: true, avatarUrl: true } }
            }
          });
          uploadedRecords.push(dbFile);

          createAuditLog({
            userId: req.userId,
            action: 'Uploaded',
            entityType: 'File',
            entityId: dbFile.id,
            metadata: { name: dbFile.name, scope: targetScope }
          });
        } catch (dbErr) {
          console.error(`Database error creating File record for ${file.originalname}:`, dbErr);
          if (storageProvider === 'google_drive' && driveFileId) {
            await storageService.googleDriveDriver.deleteFile(driveFileId).catch(e => console.error("Failed to cleanup orphaned Drive file:", e));
          } else {
            await storageService.s3Driver.deleteFile(key).catch(e => console.error("Failed to cleanup orphaned S3 object:", e));
          }
          throw dbErr;
        }
      }
    } catch (err) {
      throw err;
    }

    res.status(201).json({ success: true, files: uploadedRecords });
  } catch (error) {
    console.error('Upload Error:', error);
    res.status(500).json({ success: false, message: error.message || 'Internal server error' });
  }
};

exports.downloadFile = async (req, res) => {
  try {
    const { id } = req.params;
    const currentUser = await prisma.user.findUnique({
      where: { id: req.userId },
      select: { id: true, role: true }
    });

    const file = await prisma.file.findUnique({ where: { id } });
    if (!file) return res.status(404).json({ success: false, message: 'File not found' });

    if (file.storageScope === 'PERSONAL' && !file.projectId) {
      if (!permissionService.canAccessPersonalFile(currentUser, file.uploaderId)) {
        return res.status(403).json({ success: false, message: 'Forbidden' });
      }
    } else if (file.teamId) {
      const teamMembers = await prisma.teamMember.findMany({ where: { teamId: file.teamId } });
      if (!permissionService.canAccessTeamFile(currentUser, teamMembers.map(m => m.userId))) {
        return res.status(403).json({ success: false, message: 'Forbidden' });
      }
    } else if (file.projectId) {
      const access = await checkProjectAccess(file.projectId, req.userId);
      if (!access.accessible) return res.status(403).json({ success: false, message: 'Forbidden' });
    }

    if (file.storageProvider === 'google_drive') {
      if (!file.driveFileId) {
        return res.status(400).json({ success: false, message: 'Missing Google Drive file ID' });
      }

      if (req.query.stream === 'true' || req.query.stream === '1') {
        const { stream, mimeType, name, size } = await storageService.googleDriveDriver.downloadStream(file.driveFileId);
        res.setHeader('Content-Type', mimeType || file.type || 'application/octet-stream');
        res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(name || file.name)}"`);
        if (size) res.setHeader('Content-Length', size.toString());
        return stream.pipe(res);
      }

      return res.json({
        success: true,
        url: `/api/files/${file.id}/download?stream=true`
      });
    }

    const downloadUrl = await storageService.s3Driver.getDownloadUrl(file.storagePath);
    res.json({ success: true, url: downloadUrl });
  } catch (error) {
    console.error('Download Error:', error);
    res.status(500).json({ success: false, message: error.message || 'Internal server error' });
  }
};

exports.updateFile = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, folderId } = req.body;
    const currentUser = await prisma.user.findUnique({
      where: { id: req.userId },
      select: { id: true, role: true }
    });

    const file = await prisma.file.findUnique({ where: { id } });
    if (!file) return res.status(404).json({ success: false, message: 'File not found' });

    if (file.storageScope === 'PERSONAL' && !file.projectId) {
      if (!permissionService.canAccessPersonalFile(currentUser, file.uploaderId)) {
        return res.status(403).json({ success: false, message: 'Forbidden' });
      }
    } else if (file.teamId) {
      const teamMembers = await prisma.teamMember.findMany({ where: { teamId: file.teamId } });
      if (!permissionService.canAccessTeamFile(currentUser, teamMembers.map(m => m.userId))) {
        return res.status(403).json({ success: false, message: 'Forbidden' });
      }
    } else if (file.projectId) {
      const access = await checkProjectAccess(file.projectId, req.userId);
      if (!access.accessible) return res.status(403).json({ success: false, message: 'Forbidden' });
      if (access.role === 'Viewer') return res.status(403).json({ success: false, message: 'Viewers cannot update files' });
    }

    const updateData = {};
    if (name !== undefined) {
      if (!name || typeof name !== 'string' || !name.trim()) return res.status(400).json({ success: false, message: 'Name is required' });
      updateData.name = name.trim();
    }

    if (folderId !== undefined) {
      if (folderId && folderId !== 'null') {
        const folder = await prisma.folder.findUnique({ where: { id: folderId } });
        if (!folder) {
          return res.status(409).json({ success: false, message: 'Folder not found' });
        }
        if (file.projectId && folder.projectId !== file.projectId) {
          return res.status(409).json({ success: false, message: 'Folder belongs to a different project' });
        }
        if (file.teamId && folder.teamId !== file.teamId) {
          return res.status(409).json({ success: false, message: 'Folder belongs to a different team' });
        }
      }
      updateData.folderId = folderId && folderId !== 'null' ? folderId : null;
    }

    const updatedFile = await prisma.file.update({
      where: { id },
      data: updateData,
      include: {
        project: { select: { id: true, name: true } },
        team: { select: { id: true, name: true } },
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
    console.error('UpdateFile Error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

exports.deleteFile = async (req, res) => {
  try {
    const { id } = req.params;
    const currentUser = await prisma.user.findUnique({
      where: { id: req.userId },
      select: { id: true, role: true }
    });

    const file = await prisma.file.findUnique({ where: { id } });
    if (!file) return res.status(404).json({ success: false, message: 'File not found' });

    let canDelete = false;
    if (file.storageScope === 'PERSONAL' && !file.projectId) {
      canDelete = file.uploaderId === req.userId || permissionService.isAdmin(currentUser);
    } else if (file.teamId) {
      const teamMembers = await prisma.teamMember.findMany({ where: { teamId: file.teamId } });
      canDelete = file.uploaderId === req.userId || permissionService.canManageTeam(currentUser, teamMembers);
    } else if (file.projectId) {
      const access = await checkProjectAccess(file.projectId, req.userId);
      if (!access.accessible) return res.status(403).json({ success: false, message: 'Forbidden' });
      canDelete = file.uploaderId === req.userId || access.role === 'Admin' || access.role === 'Owner';
    }

    if (!canDelete) {
      return res.status(403).json({ success: false, message: 'Only the uploader or authorized admin can delete files' });
    }

    try {
      if (file.storageProvider === 'google_drive') {
        if (file.driveFileId) {
          await storageService.googleDriveDriver.deleteFile(file.driveFileId);
        }
      } else {
        await storageService.s3Driver.deleteFile(file.storagePath);
      }
    } catch (e) {
      console.error('Failed to delete file from storage:', e);
      return res.status(500).json({ success: false, message: 'Failed to delete file from storage: ' + e.message });
    }

    await prisma.file.delete({ where: { id } });

    createAuditLog({
      userId: req.userId,
      action: 'Deleted',
      entityType: 'File',
      entityId: id,
      metadata: { name: file.name }
    });

    res.json({ success: true, message: 'File deleted successfully' });
  } catch (error) {
    console.error('Delete Error:', error);
    res.status(500).json({ success: false, message: error.message || 'Internal server error' });
  }
};
