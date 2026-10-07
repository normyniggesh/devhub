const prisma = require('../db');
const { createAuditLog } = require('../utils/audit');
const { USER_ROLES, STORAGE_SCOPES } = require('../constants/storage');

/**
 * Authoritative Personal File & Folder Sharing Service for DEVHUB
 *
 * Enforces:
 * - Secure sharing for PERSONAL DEVHUB Cloud files and folders.
 * - Private by default, explicit sharing by the resource owner.
 * - Only active DEVHUB users can be shared with.
 * - Admin retains universal access.
 * - Rejects sharing of TEAM resources through personal sharing.
 * - Permissions: VIEW (read/download) and EDIT (read/write/rename/delete).
 * - Folder inheritance: descendants dynamically inherit access through parent folders
 *   without duplicating ACL records.
 * - Prevents duplicate shares.
 * - Never changes physical files, storage quota, or resource ownership.
 * - Full audit logging.
 */
class StorageShareService {
  /**
   * Resolve an active DEVHUB user from email or userId
   */
  async resolveTargetUser(userEmailOrId) {
    if (!userEmailOrId || typeof userEmailOrId !== 'string') {
      throw new Error('Target user identifier or email is required');
    }

    const trimmed = userEmailOrId.trim();
    const user = await prisma.user.findFirst({
      where: {
        OR: [
          { email: { equals: trimmed, mode: 'insensitive' } },
          { id: trimmed }
        ]
      },
      select: {
        id: true,
        name: true,
        email: true,
        status: true,
        avatarUrl: true
      }
    });

    if (!user) {
      throw new Error(`DEVHUB user '${trimmed}' was not found`);
    }

    if (user.status === 'Deactivated') {
      throw new Error(`Cannot share with deactivated user '${user.email}'`);
    }

    return user;
  }

  /**
   * Normalize permission string
   */
  normalizePermission(permission) {
    const perm = (permission || 'VIEW').toUpperCase();
    if (perm !== 'VIEW' && perm !== 'EDIT') {
      throw new Error("Invalid permission level. Must be 'VIEW' or 'EDIT'");
    }
    return perm;
  }

  /**
   * Share a personal file with another DEVHUB user
   */
  async shareFile({ fileId, ownerUser, targetUserEmailOrId, permission = 'VIEW' }) {
    if (!fileId) throw new Error('fileId is required');
    if (!ownerUser) throw new Error('Authenticated owner user is required');

    const file = await prisma.file.findUnique({
      where: { id: fileId },
      include: {
        uploader: { select: { id: true, name: true, email: true } }
      }
    });

    if (!file) throw new Error('File not found');

    // Reject TEAM-owned resources
    if (file.storageScope === STORAGE_SCOPES.TEAM || file.teamId) {
      throw new Error('TEAM resources cannot be shared through personal sharing');
    }

    // Security check: Only owner or Admin can share
    const isOwner = file.uploaderId === ownerUser.id;
    const isAdmin = ownerUser.role === USER_ROLES.ADMIN;
    if (!isOwner && !isAdmin) {
      throw new Error('Only the owner or an Admin can share this personal file');
    }

    const targetUser = await this.resolveTargetUser(targetUserEmailOrId);

    // Prevent sharing with oneself
    if (targetUser.id === file.uploaderId) {
      throw new Error('Cannot share file with yourself');
    }

    const normPermission = this.normalizePermission(permission);

    // Check existing share (prevent duplicate records)
    const existing = await prisma.fileShare.findUnique({
      where: {
        fileId_sharedWithId: {
          fileId,
          sharedWithId: targetUser.id
        }
      }
    });

    let shareRecord;
    let actionType;
    let oldPermission = null;

    if (existing) {
      oldPermission = existing.permission;
      actionType = 'share_permission_changed';
      shareRecord = await prisma.fileShare.update({
        where: { id: existing.id },
        data: {
          permission: normPermission,
          ownerId: file.uploaderId
        },
        include: {
          sharedWith: { select: { id: true, name: true, email: true, avatarUrl: true } }
        }
      });
    } else {
      actionType = 'share_created';
      shareRecord = await prisma.fileShare.create({
        data: {
          fileId,
          ownerId: file.uploaderId,
          sharedWithId: targetUser.id,
          permission: normPermission
        },
        include: {
          sharedWith: { select: { id: true, name: true, email: true, avatarUrl: true } }
        }
      });
    }

    await createAuditLog({
      userId: ownerUser.id,
      action: existing ? 'Updated' : 'Created',
      entityType: 'FileShare',
      entityId: shareRecord.id,
      metadata: {
        actionType,
        resourceType: 'File',
        resourceId: file.id,
        resourceName: file.name,
        ownerId: file.uploaderId,
        targetUserId: targetUser.id,
        targetUserEmail: targetUser.email,
        oldPermission,
        newPermission: normPermission
      }
    });

    return {
      id: shareRecord.id,
      fileId: shareRecord.fileId,
      ownerId: shareRecord.ownerId,
      permission: shareRecord.permission,
      sharedWith: shareRecord.sharedWith,
      createdAt: shareRecord.createdAt,
      updatedAt: shareRecord.updatedAt
    };
  }

  /**
   * Share a personal folder with another DEVHUB user
   */
  async shareFolder({ folderId, ownerUser, targetUserEmailOrId, permission = 'VIEW' }) {
    if (!folderId) throw new Error('folderId is required');
    if (!ownerUser) throw new Error('Authenticated owner user is required');

    const folder = await prisma.folder.findUnique({
      where: { id: folderId },
      include: {
        creator: { select: { id: true, name: true, email: true } }
      }
    });

    if (!folder) throw new Error('Folder not found');

    // Reject TEAM-owned folders
    if (folder.storageScope === STORAGE_SCOPES.TEAM || folder.teamId) {
      throw new Error('TEAM resources cannot be shared through personal sharing');
    }

    // Security check: Only owner or Admin can share
    const isOwner = folder.creatorId === ownerUser.id;
    const isAdmin = ownerUser.role === USER_ROLES.ADMIN;
    if (!isOwner && !isAdmin) {
      throw new Error('Only the owner or an Admin can share this personal folder');
    }

    const targetUser = await this.resolveTargetUser(targetUserEmailOrId);

    // Prevent sharing with oneself
    if (targetUser.id === folder.creatorId) {
      throw new Error('Cannot share folder with yourself');
    }

    const normPermission = this.normalizePermission(permission);

    // Check existing share (prevent duplicate records)
    const existing = await prisma.folderShare.findUnique({
      where: {
        folderId_sharedWithId: {
          folderId,
          sharedWithId: targetUser.id
        }
      }
    });

    let shareRecord;
    let actionType;
    let oldPermission = null;

    if (existing) {
      oldPermission = existing.permission;
      actionType = 'share_permission_changed';
      shareRecord = await prisma.folderShare.update({
        where: { id: existing.id },
        data: {
          permission: normPermission,
          ownerId: folder.creatorId
        },
        include: {
          sharedWith: { select: { id: true, name: true, email: true, avatarUrl: true } }
        }
      });
    } else {
      actionType = 'share_created';
      shareRecord = await prisma.folderShare.create({
        data: {
          folderId,
          ownerId: folder.creatorId,
          sharedWithId: targetUser.id,
          permission: normPermission
        },
        include: {
          sharedWith: { select: { id: true, name: true, email: true, avatarUrl: true } }
        }
      });
    }

    await createAuditLog({
      userId: ownerUser.id,
      action: existing ? 'Updated' : 'Created',
      entityType: 'FolderShare',
      entityId: shareRecord.id,
      metadata: {
        actionType,
        resourceType: 'Folder',
        resourceId: folder.id,
        resourceName: folder.name,
        ownerId: folder.creatorId,
        targetUserId: targetUser.id,
        targetUserEmail: targetUser.email,
        oldPermission,
        newPermission: normPermission
      }
    });

    return {
      id: shareRecord.id,
      folderId: shareRecord.folderId,
      ownerId: shareRecord.ownerId,
      permission: shareRecord.permission,
      sharedWith: shareRecord.sharedWith,
      createdAt: shareRecord.createdAt,
      updatedAt: shareRecord.updatedAt
    };
  }

  /**
   * Revoke an active file share
   */
  async revokeFileShare({ fileId, ownerUser, targetUserId }) {
    if (!fileId) throw new Error('fileId is required');
    if (!targetUserId) throw new Error('targetUserId is required');

    const file = await prisma.file.findUnique({
      where: { id: fileId },
      select: { id: true, name: true, uploaderId: true }
    });

    if (!file) throw new Error('File not found');

    const isOwner = file.uploaderId === ownerUser.id;
    const isAdmin = ownerUser.role === USER_ROLES.ADMIN;
    if (!isOwner && !isAdmin) {
      throw new Error('Only the owner or an Admin can revoke access to this personal file');
    }

    const share = await prisma.fileShare.findUnique({
      where: {
        fileId_sharedWithId: {
          fileId,
          sharedWithId: targetUserId
        }
      }
    });

    if (!share) {
      return false;
    }

    await prisma.fileShare.delete({
      where: { id: share.id }
    });

    await createAuditLog({
      userId: ownerUser.id,
      action: 'Deleted',
      entityType: 'FileShare',
      entityId: share.id,
      metadata: {
        actionType: 'share_revoked',
        resourceType: 'File',
        resourceId: file.id,
        resourceName: file.name,
        ownerId: file.uploaderId,
        targetUserId,
        revokedPermission: share.permission
      }
    });

    return true;
  }

  /**
   * Revoke an active folder share
   */
  async revokeFolderShare({ folderId, ownerUser, targetUserId }) {
    if (!folderId) throw new Error('folderId is required');
    if (!targetUserId) throw new Error('targetUserId is required');

    const folder = await prisma.folder.findUnique({
      where: { id: folderId },
      select: { id: true, name: true, creatorId: true }
    });

    if (!folder) throw new Error('Folder not found');

    const isOwner = folder.creatorId === ownerUser.id;
    const isAdmin = ownerUser.role === USER_ROLES.ADMIN;
    if (!isOwner && !isAdmin) {
      throw new Error('Only the owner or an Admin can revoke access to this personal folder');
    }

    const share = await prisma.folderShare.findUnique({
      where: {
        folderId_sharedWithId: {
          folderId,
          sharedWithId: targetUserId
        }
      }
    });

    if (!share) {
      return false;
    }

    await prisma.folderShare.delete({
      where: { id: share.id }
    });

    await createAuditLog({
      userId: ownerUser.id,
      action: 'Deleted',
      entityType: 'FolderShare',
      entityId: share.id,
      metadata: {
        actionType: 'share_revoked',
        resourceType: 'Folder',
        resourceId: folder.id,
        resourceName: folder.name,
        ownerId: folder.creatorId,
        targetUserId,
        revokedPermission: share.permission
      }
    });

    return true;
  }

  /**
   * List all current shares for a personal file
   */
  async listFileShares(fileId, callerUser) {
    if (!fileId) throw new Error('fileId is required');

    const file = await prisma.file.findUnique({
      where: { id: fileId },
      select: { id: true, name: true, uploaderId: true, storageScope: true }
    });

    if (!file) throw new Error('File not found');

    const shares = await prisma.fileShare.findMany({
      where: { fileId },
      include: {
        sharedWith: {
          select: { id: true, name: true, email: true, avatarUrl: true, role: true }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    return shares.map(s => ({
      id: s.id,
      fileId: s.fileId,
      ownerId: s.ownerId,
      permission: s.permission,
      sharedWith: s.sharedWith,
      createdAt: s.createdAt,
      updatedAt: s.updatedAt
    }));
  }

  /**
   * List all current shares for a personal folder
   */
  async listFolderShares(folderId, callerUser) {
    if (!folderId) throw new Error('folderId is required');

    const folder = await prisma.folder.findUnique({
      where: { id: folderId },
      select: { id: true, name: true, creatorId: true, storageScope: true }
    });

    if (!folder) throw new Error('Folder not found');

    const shares = await prisma.folderShare.findMany({
      where: { folderId },
      include: {
        sharedWith: {
          select: { id: true, name: true, email: true, avatarUrl: true, role: true }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    return shares.map(s => ({
      id: s.id,
      folderId: s.folderId,
      ownerId: s.ownerId,
      permission: s.permission,
      sharedWith: s.sharedWith,
      createdAt: s.createdAt,
      updatedAt: s.updatedAt
    }));
  }

  /**
   * Check if a user can read (VIEW or EDIT) a personal resource,
   * dynamically resolving folder inheritance where applicable.
   *
   * @param {Object} params
   * @param {Object} params.user - { id, role }
   * @param {'file'|'folder'} params.resourceType
   * @param {string} params.resourceId
   * @returns {Promise<{ allowed: boolean, permission?: string, inherited?: boolean, reason?: string }>}
   */
  async canReadSharedResource({ user, resourceType, resourceId }) {
    if (!user || !resourceId) return { allowed: false, reason: 'Authentication and resourceId required' };

    // Admin has global universal access across DEVHUB
    if (user.role === USER_ROLES.ADMIN) {
      return { allowed: true, permission: 'EDIT', inherited: false, reason: 'Admin universal access' };
    }

    if (resourceType === 'file') {
      const file = await prisma.file.findUnique({
        where: { id: resourceId },
        select: { id: true, uploaderId: true, folderId: true, storageScope: true, teamId: true }
      });

      if (!file) return { allowed: false, reason: 'File not found' };

      // Owner always has full access
      if (file.uploaderId === user.id) {
        return { allowed: true, permission: 'EDIT', inherited: false, reason: 'Owner access' };
      }

      // Check explicit direct FileShare
      const directShare = await prisma.fileShare.findUnique({
        where: {
          fileId_sharedWithId: {
            fileId: resourceId,
            sharedWithId: user.id
          }
        }
      });

      if (directShare) {
        return {
          allowed: true,
          permission: directShare.permission,
          inherited: false,
          reason: `Direct ${directShare.permission} file share`
        };
      }

      // Check inherited folder shares upwards through folder hierarchy
      if (file.folderId) {
        let currentFolderId = file.folderId;
        while (currentFolderId) {
          const folderShare = await prisma.folderShare.findUnique({
            where: {
              folderId_sharedWithId: {
                folderId: currentFolderId,
                sharedWithId: user.id
              }
            }
          });

          if (folderShare) {
            return {
              allowed: true,
              permission: folderShare.permission,
              inherited: true,
              folderId: currentFolderId,
              reason: `Inherited ${folderShare.permission} folder share from folder ${currentFolderId}`
            };
          }

          const parent = await prisma.folder.findUnique({
            where: { id: currentFolderId },
            select: { parentId: true }
          });
          currentFolderId = parent?.parentId || null;
        }
      }

      return { allowed: false, reason: 'No shared access granted' };
    }

    if (resourceType === 'folder') {
      const folder = await prisma.folder.findUnique({
        where: { id: resourceId },
        select: { id: true, creatorId: true, parentId: true, storageScope: true, teamId: true }
      });

      if (!folder) return { allowed: false, reason: 'Folder not found' };

      // Owner always has full access
      if (folder.creatorId === user.id) {
        return { allowed: true, permission: 'EDIT', inherited: false, reason: 'Owner access' };
      }

      // Check explicit direct FolderShare
      const directShare = await prisma.folderShare.findUnique({
        where: {
          folderId_sharedWithId: {
            folderId: resourceId,
            sharedWithId: user.id
          }
        }
      });

      if (directShare) {
        return {
          allowed: true,
          permission: directShare.permission,
          inherited: false,
          reason: `Direct ${directShare.permission} folder share`
        };
      }

      // Check inherited parent folders upwards through folder hierarchy
      let currentParentId = folder.parentId;
      while (currentParentId) {
        const parentShare = await prisma.folderShare.findUnique({
          where: {
            folderId_sharedWithId: {
              folderId: currentParentId,
              sharedWithId: user.id
            }
          }
        });

        if (parentShare) {
          return {
            allowed: true,
            permission: parentShare.permission,
            inherited: true,
            folderId: currentParentId,
            reason: `Inherited ${parentShare.permission} folder share from parent ${currentParentId}`
          };
        }

        const parent = await prisma.folder.findUnique({
          where: { id: currentParentId },
          select: { parentId: true }
        });
        currentParentId = parent?.parentId || null;
      }

      return { allowed: false, reason: 'No shared access granted' };
    }

    return { allowed: false, reason: 'Invalid resource type' };
  }

  /**
   * Check if a user can edit (modify/rename/delete) a personal resource
   */
  async canEditSharedResource({ user, resourceType, resourceId }) {
    const readCheck = await this.canReadSharedResource({ user, resourceType, resourceId });
    if (!readCheck.allowed) {
      return readCheck;
    }

    if (readCheck.permission === 'EDIT') {
      return { allowed: true, inherited: readCheck.inherited, reason: 'Edit permission granted' };
    }

    return {
      allowed: false,
      reason: 'View-only share does not permit modifying or deleting this resource'
    };
  }
}

module.exports = new StorageShareService();
