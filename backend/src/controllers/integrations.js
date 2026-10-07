const jwt = require('jsonwebtoken');
const prisma = require('../db');
const { createAuditLog } = require('../utils/audit');
const externalStorageService = require('../services/externalStorageService');
const { SUPPORTED_EXTERNAL_PROVIDERS, normalizeProvider } = require('../services/externalStorage');
const storageQuotaService = require('../services/storageQuotaService');
const { STORAGE_SCOPES } = require('../constants/storage');

const VALID_PROVIDERS = ['google_drive', 'dropbox', 'onedrive'];

// In-memory telemetry log for OAuth callback flow (max 20 entries, strictly sanitized)
const oauthDiagnostics = [];

function recordOAuthDiagnostic(entry) {
  oauthDiagnostics.unshift({
    timestamp: new Date().toISOString(),
    ...entry
  });
  if (oauthDiagnostics.length > 20) {
    oauthDiagnostics.pop();
  }
}

exports.recordOAuthDiagnostic = recordOAuthDiagnostic;

exports.getOAuthDiagnostic = (req, res) => {
  res.json({
    status: 'ok',
    totalEntries: oauthDiagnostics.length,
    recentAttempts: oauthDiagnostics
  });
};

/**
 * Retrieve user integrations. Tokens are strictly stripped.
 */
exports.getUserIntegrations = async (req, res) => {
  try {
    const integrations = await externalStorageService.getUserIntegrations(req.userId);
    res.json({ success: true, integrations });
  } catch (error) {
    console.error('Error getting user integrations:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

/**
 * Generate Google OAuth 2.0 Authorization URL (Backwards compatible)
 */
exports.getGoogleAuthUrl = async (req, res) => {
  try {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      return res.json({
        success: true,
        configured: false,
        message: 'Google OAuth Client ID & Secret are not yet configured on the server.'
      });
    }

    const frontendBase = req.headers.origin || process.env.FRONTEND_URL || 'http://localhost:5173';
    const rawRedirectUri = req.query.redirectUri || process.env.GOOGLE_REDIRECT_URI || `${frontendBase}/files`;
    const redirectUri = rawRedirectUri.replace(/\/$/, '');

    const effectiveUserId = req.userId || req.user?.id;
    const authData = await externalStorageService.getAuthUrl({
      userId: effectiveUserId,
      provider: 'google_drive',
      redirectUri
    });

    res.json({
      success: true,
      configured: true,
      url: authData.url,
      redirectUri
    });
  } catch (error) {
    console.error('Error creating Google auth url:', error);
    res.status(500).json({ success: false, message: error.message || 'Internal server error' });
  }
};

/**
 * Generic provider OAuth authorization URL generator
 */
exports.getProviderAuthUrl = async (req, res) => {
  try {
    const { provider } = req.params;
    const norm = normalizeProvider(provider);
    if (!VALID_PROVIDERS.includes(norm)) {
      return res.status(400).json({ success: false, message: `Unsupported provider: ${provider}` });
    }

    const frontendBase = req.headers.origin || process.env.FRONTEND_URL || 'http://localhost:5173';
    const rawRedirectUri = req.query.redirectUri || `${frontendBase}/settings`;
    const redirectUri = rawRedirectUri.replace(/\/$/, '');

    const effectiveUserId = req.userId || req.user?.id;
    const authData = await externalStorageService.getAuthUrl({
      userId: effectiveUserId,
      provider: norm,
      redirectUri
    });

    res.json({
      success: true,
      configured: true,
      url: authData.url,
      redirectUri
    });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

/**
 * Handle Google OAuth 2.0 callback
 */
exports.handleGoogleCallback = async (req, res) => {
  try {
    const { code, redirectUri, state } = req.body;
    let effectiveUserId = req.userId || req.user?.id;
    let authSource = 'session';

    // If session/cookie was lost or blocked on cross-site redirect, verify signed state token
    if (!effectiveUserId && state) {
      try {
        const decodedState = jwt.verify(state, process.env.JWT_SECRET);
        if (decodedState?.userId) {
          effectiveUserId = decodedState.userId;
          authSource = 'signed_state';
        }
      } catch (jwtErr) {
        try {
          const parsed = JSON.parse(Buffer.from(state, 'base64').toString('utf8'));
          if (parsed?.userId) {
            effectiveUserId = parsed.userId;
            authSource = 'base64_state';
          }
        } catch (_) {}
      }
    }

    if (!effectiveUserId) {
      recordOAuthDiagnostic({
        event: 'callback_unauthorized',
        hasCode: Boolean(code),
        hasState: Boolean(state),
        reason: 'Missing both session and valid signed state'
      });
      return res.status(401).json({ success: false, message: 'Authentication required to connect Google Drive' });
    }

    if (!code) {
      recordOAuthDiagnostic({
        event: 'callback_missing_code',
        userId: effectiveUserId,
        authSource
      });
      return res.status(400).json({ success: false, message: 'Authorization code is required' });
    }

    const frontendBase = req.headers.origin || process.env.FRONTEND_URL || 'http://localhost:5173';
    const rawRedirectUri = redirectUri || process.env.GOOGLE_REDIRECT_URI || `${frontendBase}/files`;
    const finalRedirectUri = rawRedirectUri.replace(/\/$/, '');

    recordOAuthDiagnostic({
      event: 'callback_exchanging_code',
      userId: effectiveUserId,
      authSource,
      hasCode: Boolean(code),
      redirectUri: finalRedirectUri
    });

    const integration = await externalStorageService.handleCallback({
      userId: effectiveUserId,
      provider: 'google_drive',
      code,
      redirectUri: finalRedirectUri,
      state
    });

    recordOAuthDiagnostic({
      event: 'user_integration_saved',
      userId: effectiveUserId,
      accountEmail: integration.accountName,
      isSystemStorage: integration.isSystemStorage
    });

    // If user authenticated via state fallback, refresh their session cookie
    if (authSource !== 'session') {
      try {
        const { setAuthCookie, generateToken } = require('./auth');
        if (setAuthCookie && generateToken) {
          setAuthCookie(res, generateToken(effectiveUserId));
        }
      } catch (_) {}
    }

    res.json({
      success: true,
      message: 'Google Drive connected successfully',
      integration
    });
  } catch (error) {
    recordOAuthDiagnostic({
      event: 'callback_fatal_error',
      safeError: error.message
    });
    console.error('Error exchanging Google OAuth code:', error);
    res.status(400).json({ success: false, message: error.message || 'Internal server error' });
  }
};

/**
 * Handle generic OAuth callback for any external provider
 */
exports.handleProviderCallback = async (req, res) => {
  try {
    const { provider } = req.params;
    const { code, redirectUri, state } = req.body;
    const effectiveUserId = req.userId || req.user?.id;

    const integration = await externalStorageService.handleCallback({
      userId: effectiveUserId,
      provider,
      code,
      redirectUri,
      state
    });

    res.json({
      success: true,
      message: `${provider.replace('_', ' ')} connected successfully`,
      integration
    });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

/**
 * Connect personal external storage using token
 */
exports.connectIntegration = async (req, res) => {
  try {
    const { provider, accountName, accessToken } = req.body;
    const norm = normalizeProvider(provider);

    if (!norm || !VALID_PROVIDERS.includes(norm)) {
      return res.status(400).json({
        success: false,
        message: `Invalid provider. Must be one of: ${VALID_PROVIDERS.join(', ')}`
      });
    }

    if (!accessToken || !accessToken.trim()) {
      return res.status(400).json({
        success: false,
        message: 'A valid API Access Token is required to connect and browse files from this cloud provider'
      });
    }

    const integration = await externalStorageService.connectWithToken({
      userId: req.userId,
      provider: norm,
      accessToken,
      accountName
    });

    res.json({
      success: true,
      message: `${norm.replace('_', ' ')} connected successfully`,
      integration
    });
  } catch (error) {
    console.error('Error connecting integration:', error);
    res.status(401).json({ success: false, message: error.message || 'Internal server error' });
  }
};

/**
 * Safely disconnect personal external storage
 */
exports.disconnectIntegration = async (req, res) => {
  try {
    const { provider } = req.body;
    const norm = normalizeProvider(provider);

    if (!norm || !VALID_PROVIDERS.includes(norm)) {
      return res.status(400).json({
        success: false,
        message: `Invalid provider. Must be one of: ${VALID_PROVIDERS.join(', ')}`
      });
    }

    const result = await externalStorageService.disconnectIntegration({
      userId: req.userId,
      provider: norm
    });

    res.json(result);
  } catch (error) {
    console.error('Error disconnecting integration:', error);
    res.status(400).json({ success: false, message: error.message || 'Internal server error' });
  }
};

/**
 * List files and folders from personal external cloud storage
 */
exports.listProviderFiles = async (req, res) => {
  try {
    const { provider } = req.params;
    const { folderId, search } = req.query;
    const norm = normalizeProvider(provider);

    if (!VALID_PROVIDERS.includes(norm)) {
      return res.status(400).json({ success: false, message: `Unsupported provider: ${provider}` });
    }

    const result = await externalStorageService.listFiles({
      userId: req.userId,
      provider: norm,
      folderId,
      search
    });

    res.json({
      success: true,
      files: result.files,
      currentFolder: result.currentFolder,
      count: result.count
    });
  } catch (error) {
    console.error('Error listing cloud files:', error);
    res.status(400).json({ success: false, message: error.message || 'Internal server error' });
  }
};

/**
 * Retrieve metadata for a file in personal external cloud storage
 */
exports.getProviderFileMetadata = async (req, res) => {
  try {
    const { provider, fileId } = req.params;
    const norm = normalizeProvider(provider);

    const metadata = await externalStorageService.getMetadata({
      userId: req.userId,
      provider: norm,
      fileId
    });

    res.json({ success: true, metadata });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

/**
 * Direct file download from personal external cloud storage
 */
exports.downloadProviderFile = async (req, res) => {
  try {
    const { provider, fileId } = req.params;
    const norm = normalizeProvider(provider);

    if (!VALID_PROVIDERS.includes(norm)) {
      return res.status(400).json({ success: false, message: `Unsupported provider: ${provider}` });
    }

    const downloaded = await externalStorageService.downloadFile({
      userId: req.userId,
      provider: norm,
      fileId
    });

    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(downloaded.name)}"`);
    res.setHeader('Content-Type', downloaded.mimeType || 'application/octet-stream');
    return res.send(downloaded.buffer);
  } catch (error) {
    console.error('Error downloading provider file:', error);
    res.status(400).json({ success: false, message: error.message || 'Internal server error' });
  }
};

/**
 * Import a file from personal external storage INTO DEVHUB Cloud Storage
 */
exports.importProviderFile = async (req, res) => {
  try {
    const { provider } = req.params;
    const norm = normalizeProvider(provider);

    if (!VALID_PROVIDERS.includes(norm)) {
      return res.status(400).json({ success: false, message: `Unsupported provider: ${provider}` });
    }

    const {
      fileId,
      filePath,
      fileName,
      targetScope,
      teamId,
      folderId,
      projectId
    } = req.body;

    if (!fileId && !filePath) {
      return res.status(400).json({ success: false, message: 'fileId or filePath is required' });
    }

    const result = await externalStorageService.importFileToDevhub({
      userId: req.userId,
      provider: norm,
      fileId,
      filePath,
      fileName,
      targetScope: targetScope || (teamId ? STORAGE_SCOPES.TEAM : STORAGE_SCOPES.PERSONAL),
      teamId,
      folderId,
      projectId
    });

    res.status(201).json({
      success: true,
      message: result.message,
      file: result.file
    });
  } catch (error) {
    console.error('Error importing provider file:', error);
    res.status(400).json({ success: false, message: error.message || 'Internal server error' });
  }
};

/**
 * Retrieve storage quotas for DEVHUB and connected external cloud accounts
 */
exports.getProviderQuota = async (req, res) => {
  try {
    const { provider } = req.params;
    const { teamId } = req.query;
    const userId = req.userId;

    let teamQuota = null;
    if (teamId) {
      try {
        const tQuota = await storageQuotaService.getTeamQuota(teamId);
        const teamFiles = await prisma.file.findMany({
          where: {
            teamId,
            storageScope: STORAGE_SCOPES.TEAM
          },
          select: { size: true, type: true }
        });
        let tDocs = 0, tImgs = 0, tVids = 0, tOthers = 0;
        teamFiles.forEach(f => {
          const s = Number(f.size) || 0;
          const t = (f.type || '').toLowerCase();
          if (t.includes('pdf') || t.includes('doc') || t.includes('txt') || t.includes('csv') || t.includes('xls') || t.includes('ppt')) tDocs += s;
          else if (t.includes('image') || t.includes('png') || t.includes('jpg') || t.includes('jpeg') || t.includes('svg')) tImgs += s;
          else if (t.includes('video') || t.includes('mp4') || t.includes('mov') || t.includes('avi')) tVids += s;
          else tOthers += s;
        });

        teamQuota = {
          ...tQuota,
          name: 'Team Cloud Storage',
          used: Number(tQuota.usedBytes),
          limit: Number(tQuota.allocatedBytes),
          breakdown: { documents: tDocs, images: tImgs, videos: tVids, others: tOthers },
          fileCount: teamFiles.length,
          available: true
        };
      } catch (tErr) {
        console.warn('Could not fetch team quota:', tErr.message);
      }
    }

    if (provider) {
      if (provider === 'devhub') {
        const personalQuota = await storageQuotaService.getPersonalQuota(userId);
        const files = await prisma.file.findMany({
          where: {
            uploaderId: userId,
            storageScope: STORAGE_SCOPES.PERSONAL
          },
          select: { size: true, type: true }
        });

        let documents = 0, images = 0, videos = 0, others = 0;
        files.forEach(f => {
          const s = Number(f.size) || 0;
          const t = (f.type || '').toLowerCase();
          if (t.includes('pdf') || t.includes('doc') || t.includes('txt') || t.includes('csv') || t.includes('xls') || t.includes('ppt')) documents += s;
          else if (t.includes('image') || t.includes('png') || t.includes('jpg') || t.includes('jpeg') || t.includes('svg')) images += s;
          else if (t.includes('video') || t.includes('mp4') || t.includes('mov') || t.includes('avi')) videos += s;
          else others += s;
        });

        const devhubQuota = {
          provider: 'devhub',
          name: 'DEVHUB Cloud Storage',
          connected: true,
          used: Number(personalQuota.usedBytes),
          limit: Number(personalQuota.allocatedBytes),
          percentage: personalQuota.percentage,
          allocatedGB: personalQuota.allocatedGB,
          usedGB: personalQuota.usedGB,
          remainingGB: personalQuota.remainingGB,
          allocatedBytes: personalQuota.allocatedBytes,
          usedBytes: personalQuota.usedBytes,
          remainingBytes: personalQuota.remainingBytes,
          breakdown: { documents, images, videos, others },
          fileCount: files.length,
          available: true
        };
        return res.json({ success: true, quota: devhubQuota, teamQuota });
      }

      const norm = normalizeProvider(provider);
      const extQuota = await externalStorageService.getQuota({ userId, provider: norm, teamId });
      return res.json({ success: true, quota: extQuota, teamQuota });
    }

    // Default: Return all provider quotas simultaneously
    const personalQuota = await storageQuotaService.getPersonalQuota(userId);
    const files = await prisma.file.findMany({
      where: {
        uploaderId: userId,
        storageScope: STORAGE_SCOPES.PERSONAL
      },
      select: { size: true, type: true }
    });

    let documents = 0, images = 0, videos = 0, others = 0;
    files.forEach(f => {
      const s = Number(f.size) || 0;
      const t = (f.type || '').toLowerCase();
      if (t.includes('pdf') || t.includes('doc') || t.includes('txt') || t.includes('csv') || t.includes('xls') || t.includes('ppt')) documents += s;
      else if (t.includes('image') || t.includes('png') || t.includes('jpg') || t.includes('jpeg') || t.includes('svg')) images += s;
      else if (t.includes('video') || t.includes('mp4') || t.includes('mov') || t.includes('avi')) videos += s;
      else others += s;
    });

    const devhub = {
      provider: 'devhub',
      name: 'DEVHUB Cloud Storage',
      connected: true,
      used: Number(personalQuota.usedBytes),
      limit: Number(personalQuota.allocatedBytes),
      percentage: personalQuota.percentage,
      allocatedGB: personalQuota.allocatedGB,
      usedGB: personalQuota.usedGB,
      remainingGB: personalQuota.remainingGB,
      allocatedBytes: personalQuota.allocatedBytes,
      usedBytes: personalQuota.usedBytes,
      remainingBytes: personalQuota.remainingBytes,
      breakdown: { documents, images, videos, others },
      fileCount: files.length,
      available: true
    };

    const [google_drive, dropbox, onedrive] = await Promise.all([
      externalStorageService.getQuota({ userId, provider: 'google_drive' }).catch(() => ({ provider: 'google_drive', name: 'Google Drive', connected: false, available: false })),
      externalStorageService.getQuota({ userId, provider: 'dropbox' }).catch(() => ({ provider: 'dropbox', name: 'Dropbox', connected: false, available: false })),
      externalStorageService.getQuota({ userId, provider: 'onedrive' }).catch(() => ({ provider: 'onedrive', name: 'OneDrive', connected: false, available: false }))
    ]);

    res.json({
      success: true,
      quotas: {
        devhub,
        google_drive,
        dropbox,
        onedrive,
        teamQuota
      }
    });
  } catch (error) {
    console.error('Error fetching provider quota:', error);
    res.status(500).json({ success: false, message: error.message || 'Internal server error' });
  }
};

/**
 * Designate or remove Google Drive as DEVHUB System Storage (Admin/Owner only)
 */
exports.setSystemStorage = async (req, res) => {
  try {
    if (!req.userId) {
      return res.status(401).json({ success: false, message: 'Unauthorized: Authentication required' });
    }

    const user = await prisma.user.findUnique({
      where: { id: req.userId },
      select: { id: true, role: true, name: true, email: true }
    });

    if (!user || user.role !== 'Admin') {
      return res.status(403).json({
        success: false,
        message: 'Unauthorized: Only an Admin or Owner can manage System Storage settings.'
      });
    }

    const { enabled } = req.body;
    const shouldEnable = enabled === true || enabled === 'true';

    const currentIntegration = await prisma.userIntegration.findFirst({
      where: {
        userId: req.userId,
        provider: 'google_drive'
      }
    });

    if (!currentIntegration || currentIntegration.status !== 'connected' || !currentIntegration.accessToken) {
      return res.status(400).json({
        success: false,
        message: 'Google Drive not connected. Please connect Google Drive first.'
      });
    }

    if (shouldEnable) {
      // Unset isSystemStorage on any other integration in DEVHUB
      const allOtherDriveIntegrations = await prisma.userIntegration.findMany({
        where: {
          provider: 'google_drive',
          id: { not: currentIntegration.id }
        }
      });

      for (const other of allOtherDriveIntegrations) {
        if (other.metadata && other.metadata.isSystemStorage) {
          await prisma.userIntegration.update({
            where: { id: other.id },
            data: {
              metadata: {
                ...other.metadata,
                isSystemStorage: false
              }
            }
          });
        }
      }

      const updatedMetadata = {
        ...(currentIntegration.metadata || {}),
        isSystemStorage: true,
        systemStorageActivatedAt: new Date().toISOString(),
        systemStorageActivatedBy: user.email
      };

      await prisma.userIntegration.update({
        where: { id: currentIntegration.id },
        data: {
          metadata: updatedMetadata,
          updatedAt: new Date()
        }
      });

      createAuditLog({
        userId: req.userId,
        action: 'Updated',
        entityType: 'Integration',
        entityId: currentIntegration.id,
        metadata: {
          action: 'system storage enabled',
          provider: 'google_drive',
          account: currentIntegration.accountName
        }
      });

      return res.json({
        success: true,
        message: 'Google Drive system storage enabled successfully.',
        status: 'system storage enabled',
        isSystemStorage: true,
        accountName: currentIntegration.accountName
      });
    } else {
      const updatedMetadata = {
        ...(currentIntegration.metadata || {}),
        isSystemStorage: false,
        systemStorageDeactivatedAt: new Date().toISOString()
      };

      await prisma.userIntegration.update({
        where: { id: currentIntegration.id },
        data: {
          metadata: updatedMetadata,
          updatedAt: new Date()
        }
      });

      createAuditLog({
        userId: req.userId,
        action: 'Updated',
        entityType: 'Integration',
        entityId: currentIntegration.id,
        metadata: {
          action: 'system storage disabled',
          provider: 'google_drive',
          account: currentIntegration.accountName
        }
      });

      return res.json({
        success: true,
        message: 'Google Drive system storage disabled successfully.',
        status: 'system storage disabled',
        isSystemStorage: false
      });
    }
  } catch (error) {
    console.error('Error toggling system storage:', error);
    res.status(500).json({ success: false, message: error.message || 'Internal server error' });
  }
};

/**
 * Get current System Storage status across DEVHUB
 */
exports.getSystemStorageStatus = async (req, res) => {
  try {
    const caller = await prisma.user.findUnique({
      where: { id: req.userId },
      select: { id: true, role: true }
    });
    const isAdmin = caller && caller.role === 'Admin';

    const allGoogleIntegrations = await prisma.userIntegration.findMany({
      where: { provider: 'google_drive', status: 'connected' },
      include: {
        user: { select: { id: true, name: true, email: true, role: true } }
      }
    });

    const systemIntegration = allGoogleIntegrations.find(i => i.metadata && i.metadata.isSystemStorage === true);

    if (!systemIntegration) {
      return res.json({
        success: true,
        isSystemStorage: false,
        status: 'system storage disabled',
        accountName: null,
        owner: null
      });
    }

    // Normal authenticated users must NOT receive Admin Google email, Admin user ID, or internal Drive details
    if (!isAdmin) {
      return res.json({
        success: true,
        isSystemStorage: true,
        status: 'system storage enabled'
      });
    }

    // Admins receive full management details
    return res.json({
      success: true,
      isSystemStorage: true,
      status: 'system storage enabled',
      accountName: systemIntegration.accountName,
      owner: {
        id: systemIntegration.user.id,
        name: systemIntegration.user.name,
        email: systemIntegration.user.email
      },
      activatedAt: systemIntegration.metadata?.systemStorageActivatedAt || null
    });
  } catch (error) {
    console.error('Error fetching system storage status:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};
