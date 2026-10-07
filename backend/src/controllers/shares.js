const prisma = require('../db');
const storageShareService = require('../services/storageShareService');

function handleError(res, error, defaultMessage = 'An error occurred') {
  console.error('[SharesController Error]:', error);
  const msg = error.message || defaultMessage;
  if (msg.includes('not found') || msg.includes('File not found') || msg.includes('Folder not found')) {
    return res.status(404).json({ success: false, message: msg });
  }
  if (msg.includes('Only the owner') || msg.includes('access denied') || msg.includes('Forbidden')) {
    return res.status(403).json({ success: false, message: msg });
  }
  return res.status(400).json({ success: false, message: msg });
}

async function getCurrentUser(req) {
  if (!req.userId) return null;
  return await prisma.user.findUnique({
    where: { id: req.userId },
    select: { id: true, name: true, email: true, role: true, status: true }
  });
}

/**
 * POST /api/files/:id/share
 */
exports.shareFile = async (req, res) => {
  try {
    const { id } = req.params;
    const { email, userId, targetUser, permission = 'VIEW' } = req.body || {};
    const targetIdentifier = email || userId || targetUser;

    if (!targetIdentifier) {
      return res.status(400).json({ success: false, message: 'Target user email or ID is required' });
    }

    const currentUser = await getCurrentUser(req);
    if (!currentUser) return res.status(401).json({ success: false, message: 'Authentication required' });

    const share = await storageShareService.shareFile({
      fileId: id,
      ownerUser: currentUser,
      targetUserEmailOrId: targetIdentifier,
      permission
    });

    res.status(201).json({ success: true, share });
  } catch (error) {
    handleError(res, error, 'Failed to share file');
  }
};

/**
 * GET /api/files/:id/shares
 */
exports.listFileShares = async (req, res) => {
  try {
    const { id } = req.params;
    const currentUser = await getCurrentUser(req);
    if (!currentUser) return res.status(401).json({ success: false, message: 'Authentication required' });

    const shares = await storageShareService.listFileShares(id, currentUser);
    res.json({ success: true, shares });
  } catch (error) {
    handleError(res, error, 'Failed to list file shares');
  }
};

/**
 * DELETE /api/files/:id/shares/:userId
 */
exports.revokeFileShare = async (req, res) => {
  try {
    const { id, userId } = req.params;
    const currentUser = await getCurrentUser(req);
    if (!currentUser) return res.status(401).json({ success: false, message: 'Authentication required' });

    const revoked = await storageShareService.revokeFileShare({
      fileId: id,
      ownerUser: currentUser,
      targetUserId: userId
    });

    res.json({ success: true, message: 'Share revoked successfully', revoked });
  } catch (error) {
    handleError(res, error, 'Failed to revoke file share');
  }
};

/**
 * POST /api/folders/:id/share
 */
exports.shareFolder = async (req, res) => {
  try {
    const { id } = req.params;
    const { email, userId, targetUser, permission = 'VIEW' } = req.body || {};
    const targetIdentifier = email || userId || targetUser;

    if (!targetIdentifier) {
      return res.status(400).json({ success: false, message: 'Target user email or ID is required' });
    }

    const currentUser = await getCurrentUser(req);
    if (!currentUser) return res.status(401).json({ success: false, message: 'Authentication required' });

    const share = await storageShareService.shareFolder({
      folderId: id,
      ownerUser: currentUser,
      targetUserEmailOrId: targetIdentifier,
      permission
    });

    res.status(201).json({ success: true, share });
  } catch (error) {
    handleError(res, error, 'Failed to share folder');
  }
};

/**
 * GET /api/folders/:id/shares
 */
exports.listFolderShares = async (req, res) => {
  try {
    const { id } = req.params;
    const currentUser = await getCurrentUser(req);
    if (!currentUser) return res.status(401).json({ success: false, message: 'Authentication required' });

    const shares = await storageShareService.listFolderShares(id, currentUser);
    res.json({ success: true, shares });
  } catch (error) {
    handleError(res, error, 'Failed to list folder shares');
  }
};

/**
 * DELETE /api/folders/:id/shares/:userId
 */
exports.revokeFolderShare = async (req, res) => {
  try {
    const { id, userId } = req.params;
    const currentUser = await getCurrentUser(req);
    if (!currentUser) return res.status(401).json({ success: false, message: 'Authentication required' });

    const revoked = await storageShareService.revokeFolderShare({
      folderId: id,
      ownerUser: currentUser,
      targetUserId: userId
    });

    res.json({ success: true, message: 'Share revoked successfully', revoked });
  } catch (error) {
    handleError(res, error, 'Failed to revoke folder share');
  }
};
