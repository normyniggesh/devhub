const prisma = require('../db');
const { checkProjectAccess } = require('../utils/projectAccess');
const { createAuditLog } = require('../utils/audit');
const storageService = require('../services/storageService');
const storageScopeService = require('../services/storageScopeService');
const driveFolderService = require('../services/driveFolderService');
const storageQuotaService = require('../services/storageQuotaService');
const permissionService = require('../services/permissionService');

/**
 * Sanitizes File records for client API responses.
 * Hides raw Google Drive file IDs and provider details from regular users.
 */
function sanitizeFileForClient(file, user) {
  if (!file) return null;
  const isPrivileged = user && user.role === 'Admin';
  if (isPrivileged) return file;

  const copy = { ...file };
  delete copy.driveFileId;
  delete copy.storagePath;
  if (copy.storageProvider === 'google_drive') {
    copy.storageProvider = 'devhub_cloud';
  }
  return copy;
}

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
      const accessCheck = await storageScopeService.canAccess({
        user: currentUser,
        scope: 'TEAM',
        teamId
      });
      if (!accessCheck.allowed) {
        return res.status(403).json({ success: false, message: accessCheck.reason || 'Forbidden' });
      }
      whereClause.teamId = teamId;
      whereClause.storageScope = 'TEAM';
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

    res.json({
      success: true,
      files: files.map(f => sanitizeFileForClient(f, currentUser))
    });
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

    const accessCheck = await storageScopeService.canAccess({
      user: currentUser,
      scope: file.storageScope,
      ownerId: file.uploaderId,
      teamId: file.teamId
    });

    if (!accessCheck.allowed) {
      return res.status(403).json({ success: false, message: accessCheck.reason || 'Forbidden' });
    }

    if (file.projectId) {
      const access = await checkProjectAccess(file.projectId, req.userId);
      if (!access.accessible) return res.status(403).json({ success: false, message: 'Forbidden' });
    }

    res.json({ success: true, file: sanitizeFileForClient(file, currentUser) });
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

    if (storagePath.includes('..')) {
      return res.status(400).json({ success: false, message: 'Invalid storagePath format' });
    }

    const currentUser = await prisma.user.findUnique({
      where: { id: req.userId },
      select: { id: true, role: true }
    });

    const targetScope = storageScopeService.resolveScope({ storageScope, teamId });

    const accessCheck = await storageScopeService.canAccess({
      user: currentUser,
      scope: targetScope,
      ownerId: req.userId,
      teamId
    });

    if (!accessCheck.allowed) {
      return res.status(403).json({ success: false, message: accessCheck.reason || 'Forbidden' });
    }

    if (folderId) {
      const folder = await prisma.folder.findUnique({ where: { id: folderId } });
      if (!folder) return res.status(409).json({ success: false, message: 'Folder not found' });
      if (targetScope === 'TEAM' && folder.teamId !== teamId) {
        return res.status(409).json({ success: false, message: 'Folder belongs to a different team' });
      }
      if (targetScope === 'PERSONAL' && (folder.creatorId !== req.userId || folder.storageScope !== 'PERSONAL')) {
        return res.status(409).json({ success: false, message: 'Folder not found or not in personal storage' });
      }
    }

    const file = await prisma.file.create({
      data: {
        name: name.trim(),
        type: type.trim(),
        size: BigInt(size),
        storagePath: storagePath.trim(),
        storageProvider: 'google_drive',
        storageScope: targetScope,
        projectId: projectId || null,
        teamId: targetScope === 'TEAM' ? teamId : null,
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

    await storageQuotaService.syncUsage(targetScope, targetScope === 'TEAM' ? teamId : req.userId);

    createAuditLog({
      userId: req.userId,
      action: 'Created',
      entityType: 'File',
      entityId: file.id,
      metadata: { name: file.name, scope: targetScope }
    });

    res.status(201).json({ success: true, file: sanitizeFileForClient(file, currentUser) });
  } catch (error) {
    console.error('CreateFile Error:', error);
    res.status(500).json({ success: false, message: error.message || 'Internal server error' });
  }
};

/**
 * Upload one or more files directly into DEVHUB Cloud Storage (Admin Google Drive System Storage).
 */
exports.uploadFiles = async (req, res) => {
  try {
    const { projectId, teamId, storageScope, scope, folderId } = req.body || {};
    const files = req.files;

    if (!files || files.length === 0) {
      return res.status(400).json({ success: false, message: 'No files uploaded' });
    }

    const currentUser = await prisma.user.findUnique({
      where: { id: req.userId },
      select: { id: true, role: true }
    });

    const targetScope = storageScopeService.resolveScope({
      scope,
      storageScope,
      teamId
    });

    // 1. Permission verification
    const accessCheck = await storageScopeService.canAccess({
      user: currentUser,
      scope: targetScope,
      ownerId: req.userId,
      teamId
    });

    if (!accessCheck.allowed) {
      return res.status(403).json({ success: false, message: accessCheck.reason || 'Forbidden' });
    }

    // 2. Folder validation
    let folderRecord = null;
    if (folderId && folderId !== 'null') {
      folderRecord = await prisma.folder.findUnique({ where: { id: folderId } });
      if (!folderRecord) {
        return res.status(409).json({ success: false, message: 'Folder not found' });
      }

      if (targetScope === 'TEAM' && folderRecord.teamId !== teamId) {
        return res.status(409).json({ success: false, message: 'Folder belongs to a different team' });
      }

      if (targetScope === 'PERSONAL' && (folderRecord.creatorId !== req.userId || folderRecord.storageScope !== 'PERSONAL')) {
        return res.status(409).json({ success: false, message: 'Folder not found or not in personal storage' });
      }
    }

    if (projectId) {
      const access = await checkProjectAccess(projectId, req.userId);
      if (!access.accessible) return res.status(403).json({ success: false, message: 'Forbidden' });
      if (access.role === 'Viewer') return res.status(403).json({ success: false, message: 'Viewers cannot upload files' });
    }

    // 3. Pre-upload Quota Enforcement (Logical Quota + Global Physical Pool + 50 GB buffer)
    const totalIncomingBytes = files.reduce((sum, f) => sum + BigInt(f.size || 0), 0n);
    const quotaCheck = await storageQuotaService.validateUpload({
      scope: targetScope,
      userId: req.userId,
      teamId: targetScope === 'TEAM' ? teamId : undefined,
      incomingBytes: totalIncomingBytes
    });

    if (!quotaCheck.allowed) {
      return res.status(400).json({
        success: false,
        message: quotaCheck.reason || 'Storage quota exceeded'
      });
    }

    // 4. Resolve Target Google Drive Parent Folder (Hierarchy: DEVHUB/Users/<user> or DEVHUB/Teams/<team>)
    let targetDriveFolderId;
    try {
      targetDriveFolderId = await driveFolderService.resolveTargetDriveFolder({
        scope: targetScope,
        storageScope: targetScope,
        userId: req.userId,
        teamId: targetScope === 'TEAM' ? teamId : undefined,
        folderId: folderRecord?.id
      });
    } catch (folderErr) {
      console.error('Target Drive folder resolution failed:', folderErr);
      return res.status(500).json({
        success: false,
        message: 'Could not resolve DEVHUB Cloud Storage target folder: ' + folderErr.message
      });
    }

    if (!targetDriveFolderId) {
      return res.status(500).json({
        success: false,
        message: 'Target Google Drive storage folder could not be located.'
      });
    }

    // 5. Upload files to Google Drive & create Database File records
    const uploadedRecords = [];

    for (const file of files) {
      let driveRes;
      try {
        driveRes = await storageService.googleDriveDriver.uploadFile({
          buffer: file.buffer,
          mimeType: file.mimetype,
          filename: file.originalname,
          driveFolderId: targetDriveFolderId
        });
      } catch (uploadErr) {
        console.error(`Google Drive upload error for ${file.originalname}:`, uploadErr);
        return res.status(500).json({
          success: false,
          message: `Storage upload failed for ${file.originalname}: ${uploadErr.message}`
        });
      }

      const driveFileId = driveRes.driveFileId;
      const key = `gdrive://${driveFileId}`;
      const effectiveSize = BigInt(driveRes.size || file.size);
      const effectiveMime = driveRes.mimeType || file.mimetype;

      try {
        const dbFile = await prisma.file.create({
          data: {
            name: file.originalname,
            type: effectiveMime,
            size: effectiveSize,
            storagePath: key,
            storageProvider: 'google_drive',
            driveFileId,
            storageScope: targetScope,
            projectId: projectId || null,
            teamId: targetScope === 'TEAM' ? teamId : null,
            folderId: folderRecord ? folderRecord.id : null,
            uploaderId: req.userId
          },
          include: {
            project: { select: { id: true, name: true } },
            team: { select: { id: true, name: true } },
            folder: { select: { id: true, name: true } },
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
        // Clean up orphaned Drive object so state remains consistent
        await storageService.googleDriveDriver.deleteFile(driveFileId).catch(cleanErr => {
          console.error('Failed to cleanup orphaned Drive file:', cleanErr);
        });
        return res.status(500).json({
          success: false,
          message: `Failed to persist file record for ${file.originalname}: ${dbErr.message}`
        });
      }
    }

    // 6. Post-upload Usage Accounting Synchronization
    await storageQuotaService.syncUsage(
      targetScope,
      targetScope === 'TEAM' ? teamId : req.userId
    );

    res.status(201).json({
      success: true,
      files: uploadedRecords.map(f => sanitizeFileForClient(f, currentUser))
    });
  } catch (error) {
    console.error('Upload Error:', error);
    res.status(500).json({ success: false, message: error.message || 'Internal server error' });
  }
};

/**
 * Download a file.
 * Streams content directly from Google Drive or returns a streaming URL.
 */
exports.downloadFile = async (req, res) => {
  try {
    const { id } = req.params;
    const currentUser = await prisma.user.findUnique({
      where: { id: req.userId },
      select: { id: true, role: true }
    });

    const file = await prisma.file.findUnique({ where: { id } });
    if (!file) return res.status(404).json({ success: false, message: 'File not found' });

    const accessCheck = await storageScopeService.canAccess({
      user: currentUser,
      scope: file.storageScope,
      ownerId: file.uploaderId,
      teamId: file.teamId
    });

    if (!accessCheck.allowed) {
      return res.status(403).json({ success: false, message: accessCheck.reason || 'Forbidden' });
    }

    if (file.projectId) {
      const access = await checkProjectAccess(file.projectId, req.userId);
      if (!access.accessible) return res.status(403).json({ success: false, message: 'Forbidden' });
    }

    // Google Drive-backed download
    if (file.storageProvider === 'google_drive' || file.driveFileId) {
      if (!file.driveFileId) {
        return res.status(400).json({ success: false, message: 'Missing Google Drive file ID' });
      }

      if (req.query.stream === 'true' || req.query.stream === '1') {
        const { stream, mimeType, name, size } = await storageService.googleDriveDriver.downloadFile(file.driveFileId);
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

    // Legacy S3 download fallback
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

    const manageCheck = await storageScopeService.canManageFile({ user: currentUser, file });
    if (!manageCheck.allowed) {
      return res.status(403).json({ success: false, message: manageCheck.reason || 'Forbidden' });
    }

    const updateData = {};
    if (name !== undefined) {
      if (!name || typeof name !== 'string' || !name.trim()) {
        return res.status(400).json({ success: false, message: 'Name is required' });
      }
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

    res.json({ success: true, file: sanitizeFileForClient(updatedFile, currentUser) });
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

    const manageCheck = await storageScopeService.canManageFile({ user: currentUser, file });
    if (!manageCheck.allowed) {
      return res.status(403).json({ success: false, message: manageCheck.reason || 'Forbidden' });
    }

    try {
      if (file.storageProvider === 'google_drive' || file.driveFileId) {
        if (file.driveFileId) {
          await storageService.googleDriveDriver.deleteFile(file.driveFileId);
        }
      } else if (file.storageProvider === 's3') {
        await storageService.s3Driver.deleteFile(file.storagePath);
      }
    } catch (e) {
      console.error('Failed to delete file from storage:', e);
      return res.status(500).json({ success: false, message: 'Failed to delete file from storage: ' + e.message });
    }

    await prisma.file.delete({ where: { id } });

    // Update usage accounting post-deletion
    await storageQuotaService.syncUsage(
      file.storageScope,
      file.storageScope === 'TEAM' ? file.teamId : file.uploaderId
    );

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
