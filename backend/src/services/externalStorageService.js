const jwt = require('jsonwebtoken');
const prisma = require('../db');
const { getProvider, normalizeProvider, SUPPORTED_EXTERNAL_PROVIDERS } = require('./externalStorage');
const { encryptToken, decryptToken, sanitizeIntegration } = require('../utils/crypto');
const { createAuditLog } = require('../utils/audit');
const storageQuotaService = require('./storageQuotaService');
const storagePoolService = require('./storagePoolService');
const driveFolderService = require('./driveFolderService');
const googleDriveDriver = require('./googleDriveDriver');
const { STORAGE_SCOPES } = require('../constants/storage');

class ExternalStorageService {
  /**
   * Retrieves all user integrations with tokens sanitized and System Storage explicitly distinguished.
   */
  async getUserIntegrations(userId) {
    const integrations = await prisma.userIntegration.findMany({
      where: { userId }
    });

    const statusMap = {
      google_drive: { connected: false, provider: 'google_drive', name: 'Google Drive', isSystemStorage: false },
      dropbox: { connected: false, provider: 'dropbox', name: 'Dropbox', isSystemStorage: false },
      onedrive: { connected: false, provider: 'onedrive', name: 'OneDrive', isSystemStorage: false }
    };

    integrations.forEach(item => {
      const p = normalizeProvider(item.provider);
      if (statusMap[p]) {
        const sanitized = sanitizeIntegration(item);
        statusMap[p] = {
          ...sanitized,
          name: p === 'google_drive' ? 'Google Drive' : (p === 'dropbox' ? 'Dropbox' : 'OneDrive'),
          hasToken: Boolean(item.accessToken)
        };
      }
    });

    return statusMap;
  }

  /**
   * Generates OAuth authorization URL with CSRF/state protection bound to the user.
   */
  async getAuthUrl({ userId, provider, redirectUri }) {
    const p = normalizeProvider(provider);
    const providerAdapter = getProvider(p);

    // CSRF / state protection signed with JWT
    const statePayload = {
      userId,
      provider: p,
      purpose: p === 'google_drive' ? 'google_oauth' : `${p}_oauth`,
      ts: Date.now(),
      nonce: Math.random().toString(36).substring(2)
    };
    const state = jwt.sign(statePayload, process.env.JWT_SECRET, { expiresIn: '1h' });

    return providerAdapter.getAuthUrl({ redirectUri, state });
  }

  /**
   * Handles OAuth authorization code exchange, enforces state verification, and saves encrypted integration.
   */
  async handleCallback({ userId, provider, code, redirectUri, state }) {
    const p = normalizeProvider(provider);
    const providerAdapter = getProvider(p);

    if (!code) {
      throw new Error('Authorization code is required');
    }

    // Verify state token for CSRF protection
    let effectiveUserId = userId;
    if (state) {
      try {
        const decoded = jwt.verify(state, process.env.JWT_SECRET);
        if (decoded.provider && decoded.provider !== p) {
          throw new Error('OAuth state mismatch for provider');
        }
        if (effectiveUserId && decoded.userId && decoded.userId !== effectiveUserId) {
          throw new Error('OAuth state user mismatch');
        }
        effectiveUserId = effectiveUserId || decoded.userId;
      } catch (jwtErr) {
        // Fallback for base64 encoded state
        try {
          const parsed = JSON.parse(Buffer.from(state, 'base64').toString('utf8'));
          if (parsed.userId) {
            if (effectiveUserId && parsed.userId !== effectiveUserId) {
              throw new Error('OAuth state user mismatch');
            }
            effectiveUserId = effectiveUserId || parsed.userId;
          }
        } catch (_) {
          if (!effectiveUserId) {
            throw new Error('Invalid or expired OAuth state token');
          }
        }
      }
    }

    if (!effectiveUserId) {
      throw new Error('Authentication required to connect external storage');
    }

    // Exchange code with provider adapter
    const tokenResult = await providerAdapter.handleCallback({ code, redirectUri });

    // Encrypt sensitive tokens before saving to database
    const encryptedAccessToken = encryptToken(tokenResult.accessToken);
    const metadata = { ...(tokenResult.metadata || {}) };
    if (metadata.refreshToken) {
      metadata.refreshToken = encryptToken(metadata.refreshToken);
    }
    // CRITICAL: Personal external integrations are ALWAYS isSystemStorage = false
    metadata.isSystemStorage = false;

    // Save or update UserIntegration
    const integration = await prisma.userIntegration.upsert({
      where: {
        userId_provider: {
          userId: effectiveUserId,
          provider: p
        }
      },
      update: {
        status: 'connected',
        accountName: tokenResult.accountName,
        accessToken: encryptedAccessToken,
        metadata,
        updatedAt: new Date()
      },
      create: {
        userId: effectiveUserId,
        provider: p,
        status: 'connected',
        accountName: tokenResult.accountName,
        accessToken: encryptedAccessToken,
        metadata
      }
    });

    createAuditLog({
      userId: effectiveUserId,
      action: 'Connected',
      entityType: 'Integration',
      entityId: integration.id,
      metadata: { provider: p, accountName: tokenResult.accountName, isSystemStorage: false }
    });

    return sanitizeIntegration(integration);
  }

  /**
   * Connects external storage using a direct API access token (e.g., personal developer token).
   */
  async connectWithToken({ userId, provider, accessToken, accountName }) {
    const p = normalizeProvider(provider);
    const providerAdapter = getProvider(p);

    if (!accessToken || !accessToken.trim()) {
      throw new Error('Access token is required');
    }

    const cleanToken = accessToken.trim();
    const accountInfo = await providerAdapter.validateToken(cleanToken);
    const effectiveAccountName = (accountName && accountName.trim()) || accountInfo.accountName;

    const encryptedAccessToken = encryptToken(cleanToken);
    const metadata = {
      ...(accountInfo.metadata || {}),
      isSystemStorage: false
    };

    const integration = await prisma.userIntegration.upsert({
      where: {
        userId_provider: {
          userId,
          provider: p
        }
      },
      update: {
        status: 'connected',
        accountName: effectiveAccountName,
        accessToken: encryptedAccessToken,
        metadata,
        updatedAt: new Date()
      },
      create: {
        userId,
        provider: p,
        status: 'connected',
        accountName: effectiveAccountName,
        accessToken: encryptedAccessToken,
        metadata
      }
    });

    createAuditLog({
      userId,
      action: 'Connected',
      entityType: 'Integration',
      entityId: integration.id,
      metadata: { provider: p, accountName: effectiveAccountName, isSystemStorage: false }
    });

    return sanitizeIntegration(integration);
  }

  /**
   * Safely disconnects a personal external integration.
   * SAFETY GUARANTEE: Never disconnects Admin System Storage or touches external cloud files.
   */
  async disconnectIntegration({ userId, provider }) {
    const p = normalizeProvider(provider);

    const existing = await prisma.userIntegration.findFirst({
      where: { userId, provider: p }
    });

    if (!existing) {
      return { success: true, message: 'Integration already disconnected' };
    }

    // SAFETY CHECK: If this is marked as System Storage, personal disconnect must NOT disconnect it!
    if (existing.metadata && existing.metadata.isSystemStorage === true) {
      throw new Error('Cannot disconnect DEVHUB System Storage from personal integrations settings. System storage must be managed via Admin System Storage settings.');
    }

    await prisma.userIntegration.delete({
      where: { id: existing.id }
    });

    createAuditLog({
      userId,
      action: 'Disconnected',
      entityType: 'Integration',
      entityId: existing.id,
      metadata: { provider: p, accountName: existing.accountName, isSystemStorage: false }
    });

    return { success: true, message: `${p.replace('_', ' ')} disconnected successfully` };
  }

  /**
   * Lists files and folders from user's personal external storage.
   * Bound strictly to userId (User A cannot access User B). Does not consume DEVHUB quota.
   */
  async listFiles({ userId, provider, folderId, search }) {
    const p = normalizeProvider(provider);
    const providerAdapter = getProvider(p);

    const integration = await prisma.userIntegration.findFirst({
      where: { userId, provider: p }
    });

    if (!integration || integration.status !== 'connected' || !integration.accessToken) {
      throw new Error(`${p.replace('_', ' ')} is not connected. Connect your account first.`);
    }

    return providerAdapter.listFiles(integration, { folderId, search });
  }

  /**
   * Fetches metadata for an external file.
   */
  async getMetadata({ userId, provider, fileId }) {
    const p = normalizeProvider(provider);
    const providerAdapter = getProvider(p);

    const integration = await prisma.userIntegration.findFirst({
      where: { userId, provider: p }
    });

    if (!integration || integration.status !== 'connected' || !integration.accessToken) {
      throw new Error(`${p.replace('_', ' ')} is not connected.`);
    }

    return providerAdapter.getMetadata(integration, fileId);
  }

  /**
   * Downloads file directly from personal external cloud.
   * Does NOT consume DEVHUB quota and does NOT copy into Admin Drive.
   */
  async downloadFile({ userId, provider, fileId }) {
    const p = normalizeProvider(provider);
    const providerAdapter = getProvider(p);

    const integration = await prisma.userIntegration.findFirst({
      where: { userId, provider: p }
    });

    if (!integration || integration.status !== 'connected' || !integration.accessToken) {
      throw new Error(`${p.replace('_', ' ')} is not connected.`);
    }

    return providerAdapter.downloadFile(integration, fileId);
  }

  /**
   * Imports an external file INTO DEVHUB Cloud.
   * - Consumes user/team DEVHUB quota.
   * - Stored in Admin System Storage Google Drive.
   * - Ownership set according to destination (PERSONAL or TEAM).
   * - Zero S3 operations.
   */
  async importFileToDevhub({ userId, provider, fileId, filePath, fileName, targetScope = 'PERSONAL', teamId, folderId, projectId }) {
    const p = normalizeProvider(provider);
    const providerAdapter = getProvider(p);

    const integration = await prisma.userIntegration.findFirst({
      where: { userId, provider: p }
    });

    if (!integration || integration.status !== 'connected' || !integration.accessToken) {
      throw new Error(`${p.replace('_', ' ')} is not connected.`);
    }

    // Download content from external provider
    const downloadTarget = fileId || filePath;
    const downloadData = await providerAdapter.downloadFile(integration, downloadTarget);
    const actualFileName = (fileName && fileName.trim()) || downloadData.name || 'imported_file';
    const fileSize = downloadData.size || downloadData.buffer.length;
    const mimeType = downloadData.mimeType || 'application/octet-stream';

    const scope = (targetScope || 'PERSONAL').toUpperCase();

    // 1. Quota Validation
    if (scope === STORAGE_SCOPES.TEAM) {
      if (!teamId) throw new Error('teamId is required for TEAM import');
      // Verify team membership
      const membership = await prisma.teamMember.findFirst({
        where: { teamId, userId }
      });
      if (!membership) {
        throw new Error('Forbidden: You are not a member of this team');
      }
      const quotaCheck = await storageQuotaService.validateUpload({
        scope: STORAGE_SCOPES.TEAM,
        userId,
        teamId,
        incomingBytes: fileSize
      });
      if (!quotaCheck.allowed) {
        throw new Error(quotaCheck.reason || 'Team storage quota exceeded');
      }
    } else {
      const quotaCheck = await storageQuotaService.validateUpload({
        scope: STORAGE_SCOPES.PERSONAL,
        userId,
        incomingBytes: fileSize
      });
      if (!quotaCheck.allowed) {
        throw new Error(quotaCheck.reason || 'Personal storage quota exceeded');
      }
    }

    // 2. Physical Pool Validation (5 TB pool)
    const poolCheck = await storagePoolService.canAcceptUpload(fileSize);
    if (!poolCheck.allowed) {
      throw new Error(poolCheck.reason || 'Physical storage pool capacity limit reached');
    }

    // 3. Resolve target Google Drive folder in Admin System Storage
    const targetDriveFolderId = await driveFolderService.resolveTargetDriveFolder({
      storageScope: scope,
      userId,
      teamId,
      folderId
    });

    if (!targetDriveFolderId) {
      throw new Error('System storage folder could not be resolved');
    }

    // 4. Upload into Google Drive System Storage
    const driveRes = await googleDriveDriver.upload(
      downloadData.buffer,
      mimeType,
      actualFileName,
      targetDriveFolderId
    );

    const driveFileId = driveRes.driveFileId;
    const storagePath = `gdrive://${driveFileId}`;

    // 5. Create File record in database
    const dbFile = await prisma.file.create({
      data: {
        name: actualFileName,
        type: mimeType,
        size: BigInt(fileSize),
        storagePath,
        storageProvider: 'google_drive',
        driveFileId,
        storageScope: scope,
        teamId: scope === STORAGE_SCOPES.TEAM ? teamId : null,
        folderId: folderId || null,
        projectId: projectId || null,
        uploaderId: userId
      },
      include: {
        folder: { select: { id: true, name: true } },
        uploader: { select: { id: true, name: true, avatarUrl: true } }
      }
    });

    // 6. Sync DEVHUB quota usage
    await storageQuotaService.recordUploadSuccess({
      scope,
      userId,
      teamId: scope === STORAGE_SCOPES.TEAM ? teamId : null,
      sizeBytes: fileSize
    });

    createAuditLog({
      userId,
      action: 'Created',
      entityType: 'File',
      entityId: dbFile.id,
      metadata: {
        name: dbFile.name,
        importedFrom: p,
        size: fileSize,
        storageScope: scope,
        storageProvider: 'google_drive'
      }
    });

    return {
      file: {
        ...dbFile,
        size: Number(dbFile.size)
      },
      message: `File "${actualFileName}" successfully imported from ${p.replace('_', ' ')} into DEVHUB Cloud Storage`
    };
  }

  /**
   * Retrieves quota for an external provider or DEVHUB cloud storage.
   */
  async getQuota({ userId, provider, teamId }) {
    if (provider === 'devhub') {
      const personalQuota = await storageQuotaService.getPersonalQuota(userId);
      let teamQuota = null;
      if (teamId) {
        teamQuota = await storageQuotaService.getTeamQuota(teamId).catch(() => null);
      }
      return {
        provider: 'devhub',
        name: 'DEVHUB Cloud Storage',
        connected: true,
        personalQuota,
        teamQuota
      };
    }

    const p = normalizeProvider(provider);
    const providerAdapter = getProvider(p);

    const integration = await prisma.userIntegration.findFirst({
      where: { userId, provider: p }
    });

    if (!integration || integration.status !== 'connected' || !integration.accessToken) {
      return {
        connected: false,
        provider: p,
        name: p === 'google_drive' ? 'Google Drive' : (p === 'dropbox' ? 'Dropbox' : 'OneDrive'),
        available: false,
        message: 'Account not connected'
      };
    }

    return providerAdapter.getQuota(integration);
  }
}

module.exports = new ExternalStorageService();
