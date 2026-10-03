const storageQuotaService = require('../services/storageQuotaService');
const { checkProjectAccess } = require('../utils/projectAccess');
const { createAuditLog } = require('../utils/audit');

/**
 * List all storage allocations and total DEVHUB storage pool summary (Admin only)
 */
exports.listAllocations = async (req, res) => {
  try {
    const data = await storageQuotaService.listAllocations();
    res.json({ success: true, ...data });
  } catch (err) {
    console.error('[AdminQuotas] listAllocations error:', err);
    res.status(500).json({ success: false, message: err.message || 'Internal server error' });
  }
};

/**
 * Get quota for a specific project (Admin only)
 */
exports.getQuota = async (req, res) => {
  try {
    const { projectId } = req.params;
    const quota = await storageQuotaService.getQuota(projectId);
    if (!quota) {
      return res.status(404).json({ success: false, message: 'No storage allocation found for this project' });
    }
    res.json({ success: true, quota });
  } catch (err) {
    console.error('[AdminQuotas] getQuota error:', err);
    res.status(500).json({ success: false, message: err.message || 'Internal server error' });
  }
};

/**
 * Create or set quota for a project (Admin only)
 */
exports.setQuota = async (req, res) => {
  try {
    const { projectId, allocatedBytes, name, isActive, allowUsageTruncate } = req.body || {};

    if (!projectId) {
      return res.status(400).json({ success: false, message: 'projectId is required' });
    }
    if (allocatedBytes === undefined || allocatedBytes === null) {
      return res.status(400).json({ success: false, message: 'allocatedBytes is required' });
    }

    let parsedBytes;
    try {
      parsedBytes = BigInt(allocatedBytes);
    } catch (_) {
      return res.status(400).json({ success: false, message: 'allocatedBytes must be a valid integer or BigInt string' });
    }

    if (parsedBytes < 0n) {
      return res.status(400).json({ success: false, message: 'Storage quota cannot be negative.' });
    }

    if ((isActive === undefined || isActive === true) && parsedBytes === 0n) {
      return res.status(400).json({ success: false, message: 'Storage quota cannot be zero for an active allocation.' });
    }

    const quota = await storageQuotaService.setQuota({
      projectId,
      allocatedBytes: parsedBytes,
      name,
      isActive: isActive !== undefined ? Boolean(isActive) : true,
      allowUsageTruncate: Boolean(allowUsageTruncate)
    });

    createAuditLog({
      userId: req.userId,
      action: 'Updated',
      entityType: 'StorageAllocation',
      entityId: quota.id,
      metadata: { projectId, allocatedBytes: quota.allocatedBytes }
    });

    res.json({
      success: true,
      message: 'Storage allocation configured successfully.',
      quota
    });
  } catch (err) {
    console.error('[AdminQuotas] setQuota error:', err);
    const status = err.message.includes('exceeds available') || err.message.includes('Cannot reduce quota') ? 400 : 500;
    res.status(status).json({ success: false, message: err.message || 'Internal server error' });
  }
};

/**
 * Update an existing quota for a project (Admin only)
 */
exports.updateQuota = async (req, res) => {
  try {
    const { projectId } = req.params;
    const { allocatedBytes, name, isActive, allowUsageTruncate } = req.body || {};

    const existing = await storageQuotaService.getQuota(projectId);
    if (!existing) {
      return res.status(404).json({ success: false, message: 'No storage allocation found for this project' });
    }

    const targetBytes = allocatedBytes !== undefined ? BigInt(allocatedBytes) : BigInt(existing.allocatedBytes);
    const targetActive = isActive !== undefined ? Boolean(isActive) : existing.isActive;

    if (targetBytes < 0n) {
      return res.status(400).json({ success: false, message: 'Storage quota cannot be negative.' });
    }
    if (targetActive && targetBytes === 0n) {
      return res.status(400).json({ success: false, message: 'Storage quota cannot be zero for an active allocation.' });
    }

    const quota = await storageQuotaService.setQuota({
      projectId,
      allocatedBytes: targetBytes,
      name: name !== undefined ? name : existing.name,
      isActive: targetActive,
      allowUsageTruncate: Boolean(allowUsageTruncate)
    });

    createAuditLog({
      userId: req.userId,
      action: 'Updated',
      entityType: 'StorageAllocation',
      entityId: quota.id,
      metadata: { projectId, allocatedBytes: quota.allocatedBytes, isActive: targetActive }
    });

    res.json({
      success: true,
      message: 'Storage allocation updated successfully.',
      quota
    });
  } catch (err) {
    console.error('[AdminQuotas] updateQuota error:', err);
    const status = err.message.includes('exceeds available') || err.message.includes('Cannot reduce quota') ? 400 : 500;
    res.status(status).json({ success: false, message: err.message || 'Internal server error' });
  }
};

/**
 * Deactivate a project storage quota allocation (Admin only)
 */
exports.deactivateQuota = async (req, res) => {
  try {
    const { projectId } = req.params;
    const quota = await storageQuotaService.deactivateQuota(projectId);

    createAuditLog({
      userId: req.userId,
      action: 'Deactivated',
      entityType: 'StorageAllocation',
      entityId: quota.id,
      metadata: { projectId }
    });

    res.json({
      success: true,
      message: 'Storage allocation deactivated successfully.',
      quota
    });
  } catch (err) {
    console.error('[AdminQuotas] deactivateQuota error:', err);
    res.status(500).json({ success: false, message: err.message || 'Internal server error' });
  }
};

/**
 * Get quota for a project for current member (Authenticated project members)
 */
exports.getProjectQuotaForUser = async (req, res) => {
  try {
    const { projectId } = req.query;
    if (!projectId) {
      return res.status(400).json({ success: false, message: 'projectId is required' });
    }

    const access = await checkProjectAccess(projectId, req.userId);
    if (!access.accessible) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }

    const quota = await storageQuotaService.getQuota(projectId);
    res.json({
      success: true,
      hasQuota: !!quota,
      quota: quota || null
    });
  } catch (err) {
    console.error('[AdminQuotas] getProjectQuotaForUser error:', err);
    res.status(500).json({ success: false, message: err.message || 'Internal server error' });
  }
};
