const prisma = require('../db');
const { checkProjectAccess } = require('../utils/projectAccess');
const { createAuditLog } = require('../utils/audit');
const storageService = require('../services/storageService');
const { generateSafeKey } = storageService;

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
    const { name, type, size, storagePath, projectId, folderId } = req.body || {};

    if (!name || typeof name !== 'string' || !name.trim()) return res.status(400).json({ success: false, message: 'Name is required' });
    if (!type || typeof type !== 'string' || !type.trim()) return res.status(400).json({ success: false, message: 'Type is required' });
    if (size === undefined || (typeof size !== 'number' && typeof size !== 'bigint' && typeof size !== 'string') || isNaN(Number(size)) || Number(size) < 0) return res.status(400).json({ success: false, message: 'Valid size is required' });
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
        size: BigInt(size),
        storagePath: storagePath.trim(),
        storageProvider: 's3',
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
    console.error('CreateFile Error:', error);
    res.status(500).json({ success: false, message: error.message || 'Internal server error' });
  }
};

exports.uploadFiles = async (req, res) => {
  try {
    const { projectId, folderId, driveFolderId } = req.body || {};
    const files = req.files;

    if (!files || files.length === 0) return res.status(400).json({ success: false, message: 'No files uploaded' });
    if (!projectId) return res.status(400).json({ success: false, message: 'projectId is required' });

    const access = await checkProjectAccess(projectId, req.userId);
    if (!access.accessible) return res.status(403).json({ success: false, message: 'Forbidden' });
    if (access.role === 'Viewer') return res.status(403).json({ success: false, message: 'Viewers cannot upload files' });

    let folderRecord = null;
    if (folderId && folderId !== 'null') {
      folderRecord = await prisma.folder.findUnique({ where: { id: folderId } });
      if (!folderRecord || folderRecord.projectId !== projectId) {
        return res.status(409).json({ success: false, message: 'Folder not found or belongs to a different project' });
      }
    }

    const primaryProvider = storageService.getPrimaryStorageProvider();
    let targetDriveFolderId = null;

    if (primaryProvider === 'google_drive') {
      if (driveFolderId) {
        targetDriveFolderId = driveFolderId;
      } else if (folderRecord?.driveFolderId) {
        targetDriveFolderId = folderRecord.driveFolderId;
      } else {
        const projectRecord = await prisma.project.findUnique({ where: { id: projectId } });
        if (projectRecord?.driveFolderId) {
          targetDriveFolderId = projectRecord.driveFolderId;
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
        key = generateSafeKey(projectId, folderId, file.originalname);
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
            projectId,
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
          metadata: { name: dbFile.name }
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

    res.status(201).json({ success: true, files: uploadedRecords });
  } catch (error) {
    console.error('Upload Error:', error);
    res.status(500).json({ success: false, message: error.message || 'Internal server error' });
  }
};

exports.downloadFile = async (req, res) => {
  try {
    const { id } = req.params;
    const file = await prisma.file.findUnique({ where: { id } });
    if (!file) return res.status(404).json({ success: false, message: 'File not found' });

    const access = await checkProjectAccess(file.projectId, req.userId);
    if (!access.accessible) return res.status(403).json({ success: false, message: 'Forbidden' });

    if (file.storageProvider === 'google_drive') {
      if (!file.driveFileId) {
        return res.status(400).json({ success: false, message: 'Missing Google Drive file ID' });
      }

      // If stream explicitly requested or accessed via browser stream link
      if (req.query.stream === 'true' || req.query.stream === '1') {
        const { stream, mimeType, name, size } = await storageService.googleDriveDriver.downloadStream(file.driveFileId);
        res.setHeader('Content-Type', mimeType || file.type || 'application/octet-stream');
        res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(name || file.name)}"`);
        if (size) res.setHeader('Content-Length', size.toString());
        return stream.pipe(res);
      }

      // Return download endpoint URL for client
      return res.json({
        success: true,
        url: `/api/files/${file.id}/download?stream=true`
      });
    }

    // Default S3 presigned URL
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
      if (folderId && folderId !== 'null') {
        const folder = await prisma.folder.findUnique({ where: { id: folderId } });
        if (!folder || folder.projectId !== file.projectId) {
          return res.status(409).json({ success: false, message: 'Folder not found or belongs to a different project' });
        }
      }
      updateData.folderId = folderId && folderId !== 'null' ? folderId : null;
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
    const isUploader = file.uploaderId === req.userId;
    const isProjectAdmin = access.role === 'Admin' || access.role === 'Owner';
    if (!isUploader && !isProjectAdmin) {
      return res.status(403).json({ success: false, message: 'Only the uploader or project Admins/Owners can delete files' });
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
