const prisma = require('../db');
const { createAuditLog } = require('../utils/audit');
const { checkProjectAccess } = require('../utils/projectAccess');
const { uploadFile, generateSafeKey } = require('../services/storageService');

const VALID_PROVIDERS = ['google_drive', 'dropbox', 'onedrive'];

function guessMimeType(fileName, defaultMime = 'application/octet-stream') {
  if (!fileName) return defaultMime;
  const ext = fileName.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'pdf': return 'application/pdf';
    case 'png': return 'image/png';
    case 'jpg':
    case 'jpeg': return 'image/jpeg';
    case 'gif': return 'image/gif';
    case 'svg': return 'image/svg+xml';
    case 'doc':
    case 'docx': return 'application/msword';
    case 'xls':
    case 'xlsx': return 'application/vnd.ms-excel';
    case 'ppt':
    case 'pptx': return 'application/vnd.ms-powerpoint';
    case 'zip': return 'application/zip';
    case 'txt': return 'text/plain';
    case 'csv': return 'text/csv';
    case 'json': return 'application/json';
    default: return defaultMime;
  }
}

/**
 * Validates access token with external provider API.
 * Returns metadata or throws an error.
 */
async function validateProviderToken(provider, token) {
  if (provider === 'google_drive') {
    const res = await fetch('https://www.googleapis.com/drive/v3/about?fields=user', {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error?.message || 'Invalid Google Drive access token. Please verify your token.');
    }
    const data = await res.json();
    return {
      email: data.user?.emailAddress || null,
      displayName: data.user?.displayName || null,
      photoUrl: data.user?.photoLink || null
    };
  }

  if (provider === 'dropbox') {
    const res = await fetch('https://api.dropboxapi.com/2/users/get_current_account', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error_summary || 'Invalid Dropbox access token. Please verify your token.');
    }
    const data = await res.json();
    return {
      accountId: data.account_id,
      email: data.email,
      displayName: data.name?.display_name
    };
  }

  if (provider === 'onedrive') {
    const res = await fetch('https://graph.microsoft.com/v1.0/me', {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error?.message || 'Invalid Microsoft OneDrive access token. Please verify your token.');
    }
    const data = await res.json();
    return {
      email: data.mail || data.userPrincipalName,
      displayName: data.displayName
    };
  }

  throw new Error(`Unsupported provider: ${provider}`);
}

exports.getUserIntegrations = async (req, res) => {
  try {
    const integrations = await prisma.userIntegration.findMany({
      where: { userId: req.userId }
    });

    const statusMap = {
      google_drive: { connected: false },
      dropbox: { connected: false },
      onedrive: { connected: false }
    };

    integrations.forEach(item => {
      if (VALID_PROVIDERS.includes(item.provider)) {
        statusMap[item.provider] = {
          connected: item.status === 'connected',
          accountName: item.accountName,
          connectedAt: item.updatedAt || item.createdAt,
          metadata: item.metadata,
          hasToken: Boolean(item.accessToken)
        };
      }
    });

    res.json({ success: true, integrations: statusMap });
  } catch (error) {
    console.error('Error getting user integrations:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

exports.connectIntegration = async (req, res) => {
  try {
    const { provider, accountName, accessToken } = req.body;

    if (!provider || !VALID_PROVIDERS.includes(provider)) {
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

    const cleanToken = accessToken.trim();
    let cleanAccountName = accountName ? accountName.trim() : '';

    // Validate real token against the provider API
    let providerMetadata = {};
    try {
      providerMetadata = await validateProviderToken(provider, cleanToken);
      if (!cleanAccountName) {
        cleanAccountName = providerMetadata.email || providerMetadata.displayName || `${provider}_user`;
      }
    } catch (valErr) {
      return res.status(401).json({
        success: false,
        message: valErr.message
      });
    }

    const integration = await prisma.userIntegration.upsert({
      where: {
        userId_provider: {
          userId: req.userId,
          provider
        }
      },
      update: {
        status: 'connected',
        accountName: cleanAccountName,
        accessToken: cleanToken,
        metadata: providerMetadata,
        updatedAt: new Date()
      },
      create: {
        userId: req.userId,
        provider,
        status: 'connected',
        accountName: cleanAccountName,
        accessToken: cleanToken,
        metadata: providerMetadata
      }
    });

    createAuditLog({
      userId: req.userId,
      action: 'Connected',
      entityType: 'Integration',
      entityId: integration.id,
      metadata: { provider, accountName: cleanAccountName }
    });

    res.json({
      success: true,
      message: `${provider.replace('_', ' ')} connected successfully`,
      integration: {
        provider: integration.provider,
        status: integration.status,
        accountName: integration.accountName,
        connectedAt: integration.updatedAt,
        metadata: integration.metadata
      }
    });
  } catch (error) {
    console.error('Error connecting integration:', error);
    res.status(500).json({ success: false, message: error.message || 'Internal server error' });
  }
};

exports.disconnectIntegration = async (req, res) => {
  try {
    const { provider } = req.body;

    if (!provider || !VALID_PROVIDERS.includes(provider)) {
      return res.status(400).json({ 
        success: false, 
        message: `Invalid provider. Must be one of: ${VALID_PROVIDERS.join(', ')}` 
      });
    }

    const existing = await prisma.userIntegration.findUnique({
      where: {
        userId_provider: {
          userId: req.userId,
          provider
        }
      }
    });

    if (!existing) {
      return res.json({ success: true, message: 'Integration already disconnected' });
    }

    await prisma.userIntegration.delete({
      where: {
        userId_provider: {
          userId: req.userId,
          provider
        }
      }
    });

    createAuditLog({
      userId: req.userId,
      action: 'Disconnected',
      entityType: 'Integration',
      entityId: existing.id,
      metadata: { provider, accountName: existing.accountName }
    });

    res.json({
      success: true,
      message: `${provider.replace('_', ' ')} disconnected successfully`
    });
  } catch (error) {
    console.error('Error disconnecting integration:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

/**
 * List files from a connected cloud provider
 */
exports.listProviderFiles = async (req, res) => {
  try {
    const { provider } = req.params;

    if (!VALID_PROVIDERS.includes(provider)) {
      return res.status(400).json({ success: false, message: `Unsupported provider: ${provider}` });
    }

    const integration = await prisma.userIntegration.findUnique({
      where: {
        userId_provider: {
          userId: req.userId,
          provider
        }
      }
    });

    if (!integration || integration.status !== 'connected' || !integration.accessToken) {
      return res.status(400).json({
        success: false,
        message: `${provider.replace('_', ' ')} is not connected. Connect your account with an access token first.`
      });
    }

    const token = integration.accessToken;
    let files = [];

    if (provider === 'google_drive') {
      const gRes = await fetch('https://www.googleapis.com/drive/v3/files?pageSize=50&fields=files(id,name,mimeType,size,modifiedTime)&q=trashed%3Dfalse+and+mimeType!%3D%27application%2Fvnd.google-apps.folder%27', {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (!gRes.ok) {
        const errData = await gRes.json().catch(() => ({}));
        return res.status(gRes.status).json({
          success: false,
          message: errData.error?.message || 'Failed to list files from Google Drive'
        });
      }

      const data = await gRes.json();
      files = (data.files || []).map(f => ({
        id: f.id,
        name: f.name,
        mimeType: guessMimeType(f.name, f.mimeType),
        size: f.size ? parseInt(f.size, 10) : 0,
        lastModified: f.modifiedTime,
        provider: 'google_drive'
      }));
    } else if (provider === 'dropbox') {
      const dRes = await fetch('https://api.dropboxapi.com/2/files/list_folder', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ path: '', recursive: false, limit: 50 })
      });

      if (!dRes.ok) {
        const errData = await dRes.json().catch(() => ({}));
        return res.status(dRes.status).json({
          success: false,
          message: errData.error_summary || 'Failed to list files from Dropbox'
        });
      }

      const data = await dRes.json();
      files = (data.entries || [])
        .filter(e => e['.tag'] === 'file')
        .map(f => ({
          id: f.id,
          name: f.name,
          path: f.path_lower,
          mimeType: guessMimeType(f.name),
          size: f.size || 0,
          lastModified: f.client_modified,
          provider: 'dropbox'
        }));
    } else if (provider === 'onedrive') {
      const oRes = await fetch('https://graph.microsoft.com/v1.0/me/drive/root/children', {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (!oRes.ok) {
        const errData = await oRes.json().catch(() => ({}));
        return res.status(oRes.status).json({
          success: false,
          message: errData.error?.message || 'Failed to list files from OneDrive'
        });
      }

      const data = await oRes.json();
      files = (data.value || [])
        .filter(item => !item.folder)
        .map(f => ({
          id: f.id,
          name: f.name,
          mimeType: guessMimeType(f.name, f.file?.mimeType),
          size: f.size || 0,
          lastModified: f.lastModifiedDateTime,
          provider: 'onedrive'
        }));
    }

    res.json({
      success: true,
      provider,
      accountName: integration.accountName,
      files
    });
  } catch (error) {
    console.error('Error listing provider files:', error);
    res.status(500).json({ success: false, message: error.message || 'Internal server error' });
  }
};

/**
 * Import a file from a connected cloud provider into DEVHUB S3 storage and project
 */
exports.importProviderFile = async (req, res) => {
  try {
    const { provider } = req.params;
    const { fileId, filePath, fileName, projectId, folderId } = req.body;

    if (!VALID_PROVIDERS.includes(provider)) {
      return res.status(400).json({ success: false, message: `Unsupported provider: ${provider}` });
    }

    if (!fileId && !filePath) {
      return res.status(400).json({ success: false, message: 'fileId or filePath is required' });
    }

    if (!projectId) {
      return res.status(400).json({ success: false, message: 'projectId is required to import file into a project' });
    }

    // Verify project access
    const access = await checkProjectAccess(projectId, req.userId);
    if (!access.accessible) {
      return res.status(403).json({ success: false, message: 'Forbidden project access' });
    }
    if (access.role === 'Viewer') {
      return res.status(403).json({ success: false, message: 'Viewers cannot add files' });
    }

    // Verify folder if specified
    if (folderId && folderId !== 'null') {
      const folder = await prisma.folder.findUnique({ where: { id: folderId } });
      if (!folder || folder.projectId !== projectId) {
        return res.status(409).json({ success: false, message: 'Folder not found or belongs to a different project' });
      }
    }

    // Retrieve integration token
    const integration = await prisma.userIntegration.findUnique({
      where: {
        userId_provider: {
          userId: req.userId,
          provider
        }
      }
    });

    if (!integration || integration.status !== 'connected' || !integration.accessToken) {
      return res.status(400).json({
        success: false,
        message: `${provider.replace('_', ' ')} is not connected. Connect your account first.`
      });
    }

    const token = integration.accessToken;
    let fileBuffer = null;
    let actualFileName = fileName ? fileName.trim() : 'cloud_file';
    let mimeType = guessMimeType(actualFileName);

    // Download file content from provider
    if (provider === 'google_drive') {
      const gMetaRes = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?fields=name,mimeType,size`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (gMetaRes.ok) {
        const meta = await gMetaRes.json();
        if (meta.name && !fileName) actualFileName = meta.name;
        if (meta.mimeType) mimeType = guessMimeType(actualFileName, meta.mimeType);
      }

      const gDownloadRes = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (!gDownloadRes.ok) {
        const err = await gDownloadRes.json().catch(() => ({}));
        throw new Error(err.error?.message || `Google Drive download failed (${gDownloadRes.status})`);
      }

      const arrayBuf = await gDownloadRes.arrayBuffer();
      fileBuffer = Buffer.from(arrayBuf);
    } else if (provider === 'dropbox') {
      const targetPath = filePath || fileId;
      const dDownloadRes = await fetch('https://content.dropboxapi.com/2/files/download', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Dropbox-API-Arg': JSON.stringify({ path: targetPath })
        }
      });

      if (!dDownloadRes.ok) {
        throw new Error(`Dropbox download failed (${dDownloadRes.statusText})`);
      }

      const headerMeta = dDownloadRes.headers.get('dropbox-api-result');
      if (headerMeta) {
        try {
          const parsed = JSON.parse(headerMeta);
          if (parsed.name && !fileName) actualFileName = parsed.name;
        } catch (_) {}
      }

      mimeType = guessMimeType(actualFileName);
      const arrayBuf = await dDownloadRes.arrayBuffer();
      fileBuffer = Buffer.from(arrayBuf);
    } else if (provider === 'onedrive') {
      const oDownloadRes = await fetch(`https://graph.microsoft.com/v1.0/me/drive/items/${encodeURIComponent(fileId)}/content`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (!oDownloadRes.ok) {
        throw new Error(`OneDrive download failed (${oDownloadRes.statusText})`);
      }

      mimeType = guessMimeType(actualFileName);
      const arrayBuf = await oDownloadRes.arrayBuffer();
      fileBuffer = Buffer.from(arrayBuf);
    }

    if (!fileBuffer || fileBuffer.length === 0) {
      return res.status(400).json({ success: false, message: 'Downloaded file is empty' });
    }

    // Generate safe key and upload to DEVHUB S3
    const s3Key = generateSafeKey(projectId, folderId, actualFileName);
    await uploadFile(fileBuffer, mimeType, s3Key);

    // Save File record in Prisma
    const dbFile = await prisma.file.create({
      data: {
        name: actualFileName,
        type: mimeType,
        size: fileBuffer.length,
        storagePath: s3Key,
        projectId,
        folderId: folderId && folderId !== 'null' ? folderId : null,
        uploaderId: req.userId
      },
      include: {
        project: { select: { id: true, name: true } },
        folder: { select: { id: true, name: true } },
        uploader: { select: { id: true, name: true, avatarUrl: true } }
      }
    });

    createAuditLog({
      userId: req.userId,
      action: 'Created',
      entityType: 'File',
      entityId: dbFile.id,
      projectId,
      metadata: { 
        name: dbFile.name, 
        importedFrom: provider, 
        size: dbFile.size 
      }
    });

    res.status(201).json({
      success: true,
      message: `File "${actualFileName}" successfully imported from ${provider.replace('_', ' ')} into DEVHUB`,
      file: dbFile
    });
  } catch (error) {
    console.error('Error importing provider file:', error);
    res.status(500).json({ success: false, message: error.message || 'Internal server error' });
  }
};
