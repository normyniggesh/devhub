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

function isGoogleWorkspaceDoc(mimeType) {
  return mimeType && mimeType.startsWith('application/vnd.google-apps.') && mimeType !== 'application/vnd.google-apps.folder';
}

function getGoogleExportFormat(mimeType) {
  switch (mimeType) {
    case 'application/vnd.google-apps.document':
      return { exportMime: 'application/pdf', ext: '.pdf' };
    case 'application/vnd.google-apps.spreadsheet':
      return { exportMime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', ext: '.xlsx' };
    case 'application/vnd.google-apps.presentation':
      return { exportMime: 'application/pdf', ext: '.pdf' };
    default:
      return { exportMime: 'application/pdf', ext: '.pdf' };
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

/**
 * Check and refresh token if expired (for OAuth providers with refresh tokens)
 */
async function getValidToken(integration) {
  if (!integration) return null;

  if (integration.provider === 'google_drive') {
    const metadata = integration.metadata || {};
    const isExpired = metadata.expiresAt && Date.now() > (metadata.expiresAt - 60000);

    if (isExpired && metadata.refreshToken && process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
      try {
        console.log('[Google Drive] Access token expired, refreshing via refreshToken...');
        const refreshRes = await fetch('https://oauth2.googleapis.com/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            client_id: process.env.GOOGLE_CLIENT_ID,
            client_secret: process.env.GOOGLE_CLIENT_SECRET,
            refresh_token: metadata.refreshToken,
            grant_type: 'refresh_token'
          })
        });

        if (refreshRes.ok) {
          const newTokens = await refreshRes.json();
          const updated = await prisma.userIntegration.update({
            where: { id: integration.id },
            data: {
              accessToken: newTokens.access_token,
              metadata: {
                ...metadata,
                expiresAt: Date.now() + (newTokens.expires_in || 3600) * 1000
              },
              updatedAt: new Date()
            }
          });
          return updated.accessToken;
        } else {
          console.warn('[Google Drive] Refresh failed:', await refreshRes.text());
        }
      } catch (err) {
        console.error('[Google Drive] Token refresh error:', err.message);
      }
    }
  }

  return integration.accessToken;
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
          hasToken: Boolean(item.accessToken),
          isSystemStorage: Boolean(item.metadata?.isSystemStorage)
        };
      }
    });

    res.json({ success: true, integrations: statusMap });
  } catch (error) {
    console.error('Error getting user integrations:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

/**
 * Generate Google OAuth 2.0 Authorization URL
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
    const redirectUri = req.query.redirectUri || process.env.GOOGLE_REDIRECT_URI || `${frontendBase}/files`;

    const stateObj = {
      userId: req.userId,
      ts: Date.now()
    };
    const state = Buffer.from(JSON.stringify(stateObj)).toString('base64');

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: 'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile',
      access_type: 'offline',
      prompt: 'consent',
      include_granted_scopes: 'true',
      state
    });

    const url = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;

    res.json({
      success: true,
      configured: true,
      url,
      redirectUri
    });
  } catch (error) {
    console.error('Error creating Google auth url:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

/**
 * Handle Google OAuth 2.0 Authorization Code callback
 */
exports.handleGoogleCallback = async (req, res) => {
  try {
    const { code, redirectUri } = req.body;

    if (!code) {
      return res.status(400).json({ success: false, message: 'Authorization code is required' });
    }

    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      return res.status(400).json({
        success: false,
        message: 'Google OAuth credentials (GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET) are not configured on the backend.'
      });
    }

    const frontendBase = req.headers.origin || process.env.FRONTEND_URL || 'http://localhost:5173';
    const finalRedirectUri = redirectUri || process.env.GOOGLE_REDIRECT_URI || `${frontendBase}/files`;

    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: finalRedirectUri,
        grant_type: 'authorization_code'
      })
    });

    if (!tokenResponse.ok) {
      const errData = await tokenResponse.json().catch(() => ({}));
      return res.status(400).json({
        success: false,
        message: errData.error_description || errData.error || 'Failed to exchange authorization code with Google'
      });
    }

    const tokenData = await tokenResponse.json();

    // Fetch user profile info to identify the connected account
    const userRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` }
    });
    const userInfo = userRes.ok ? await userRes.json() : {};

    const accountEmail = userInfo.email || 'Google Drive User';
    const existing = await prisma.userIntegration.findFirst({
      where: { userId: req.userId, provider: 'google_drive' }
    });

    const metadata = {
      email: accountEmail,
      displayName: userInfo.name || accountEmail,
      picture: userInfo.picture,
      refreshToken: tokenData.refresh_token || existing?.metadata?.refreshToken,
      expiresAt: Date.now() + (tokenData.expires_in || 3600) * 1000,
      scope: tokenData.scope,
      isSystemStorage: existing?.metadata?.isSystemStorage || false
    };

    let integration;
    try {
      integration = await prisma.userIntegration.upsert({
        where: {
          userId_provider: {
            userId: req.userId,
            provider: 'google_drive'
          }
        },
        update: {
          status: 'connected',
          accountName: accountEmail,
          accessToken: tokenData.access_token,
          metadata,
          updatedAt: new Date()
        },
        create: {
          userId: req.userId,
          provider: 'google_drive',
          status: 'connected',
          accountName: accountEmail,
          accessToken: tokenData.access_token,
          metadata
        }
      });
    } catch (upsertErr) {
      if (existing) {
        integration = await prisma.userIntegration.update({
          where: { id: existing.id },
          data: {
            status: 'connected',
            accountName: accountEmail,
            accessToken: tokenData.access_token,
            metadata,
            updatedAt: new Date()
          }
        });
      } else {
        integration = await prisma.userIntegration.create({
          data: {
            userId: req.userId,
            provider: 'google_drive',
            status: 'connected',
            accountName: accountEmail,
            accessToken: tokenData.access_token,
            metadata
          }
        });
      }
    }

    createAuditLog({
      userId: req.userId,
      action: 'Connected',
      entityType: 'Integration',
      entityId: integration.id,
      metadata: { provider: 'google_drive', accountName: accountEmail }
    });

    res.json({
      success: true,
      message: 'Google Drive connected successfully',
      integration: {
        provider: 'google_drive',
        status: 'connected',
        accountName: accountEmail,
        connectedAt: integration.updatedAt,
        metadata
      }
    });
  } catch (error) {
    console.error('Error exchanging Google OAuth code:', error);
    res.status(500).json({ success: false, message: error.message || 'Internal server error' });
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

    let integration;
    try {
      integration = await prisma.userIntegration.upsert({
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
    } catch (upsertErr) {
      console.warn(`[Integrations] Upsert fallback triggered for ${provider}:`, upsertErr.message);
      const existing = await prisma.userIntegration.findFirst({
        where: {
          userId: req.userId,
          provider
        }
      });

      if (existing) {
        integration = await prisma.userIntegration.update({
          where: { id: existing.id },
          data: {
            status: 'connected',
            accountName: cleanAccountName,
            accessToken: cleanToken,
            metadata: providerMetadata,
            updatedAt: new Date()
          }
        });
      } else {
        integration = await prisma.userIntegration.create({
          data: {
            userId: req.userId,
            provider,
            status: 'connected',
            accountName: cleanAccountName,
            accessToken: cleanToken,
            metadata: providerMetadata
          }
        });
      }
    }

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

    const existing = await prisma.userIntegration.findFirst({
      where: {
        userId: req.userId,
        provider
      }
    });

    if (!existing) {
      return res.json({ success: true, message: 'Integration already disconnected' });
    }

    await prisma.userIntegration.deleteMany({
      where: {
        userId: req.userId,
        provider
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
 * List files and folders from a connected cloud provider
 */
exports.listProviderFiles = async (req, res) => {
  try {
    const { provider } = req.params;
    const { folderId, search } = req.query;

    if (!VALID_PROVIDERS.includes(provider)) {
      return res.status(400).json({ success: false, message: `Unsupported provider: ${provider}` });
    }

    const integration = await prisma.userIntegration.findFirst({
      where: {
        userId: req.userId,
        provider
      }
    });

    if (!integration || integration.status !== 'connected' || !integration.accessToken) {
      return res.status(400).json({
        success: false,
        message: `${provider.replace('_', ' ')} is not connected. Connect your account first.`
      });
    }

    const token = await getValidToken(integration);
    let files = [];
    let currentFolder = { id: folderId || 'root', name: 'My Drive' };

    if (provider === 'google_drive') {
      const targetFolderId = folderId || 'root';

      let q = 'trashed = false';
      if (search && search.trim()) {
        const cleanSearch = search.trim().replace(/'/g, "\\'");
        q += ` and name contains '${cleanSearch}'`;
      } else {
        q += ` and '${targetFolderId}' in parents`;
      }

      const gUrl = `https://www.googleapis.com/drive/v3/files?pageSize=100&fields=files(id,name,mimeType,size,modifiedTime,webViewLink,iconLink,thumbnailLink,parents)&orderBy=folder,name&q=${encodeURIComponent(q)}`;

      const gRes = await fetch(gUrl, {
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

      files = (data.files || []).map(f => {
        const isFolder = f.mimeType === 'application/vnd.google-apps.folder';
        return {
          id: f.id,
          name: f.name,
          isFolder,
          mimeType: f.mimeType,
          size: f.size ? parseInt(f.size, 10) : 0,
          lastModified: f.modifiedTime,
          webViewLink: f.webViewLink,
          iconLink: f.iconLink,
          thumbnailLink: f.thumbnailLink,
          provider: 'google_drive'
        };
      });

      // If we are in a subfolder, fetch its name for breadcrumb display
      if (targetFolderId !== 'root') {
        try {
          const folderRes = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(targetFolderId)}?fields=id,name`, {
            headers: { Authorization: `Bearer ${token}` }
          });
          if (folderRes.ok) {
            const folderData = await folderRes.json();
            currentFolder.name = folderData.name || 'Folder';
          }
        } catch (_) {}
      }
    } else if (provider === 'dropbox') {
      const targetPath = folderId || '';
      const dRes = await fetch('https://api.dropboxapi.com/2/files/list_folder', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ path: targetPath, recursive: false, limit: 100 })
      });

      if (!dRes.ok) {
        const errData = await dRes.json().catch(() => ({}));
        return res.status(dRes.status).json({
          success: false,
          message: errData.error_summary || 'Failed to list files from Dropbox'
        });
      }

      const data = await dRes.json();
      files = (data.entries || []).map(e => ({
        id: e.id,
        name: e.name,
        path: e.path_lower,
        isFolder: e['.tag'] === 'folder',
        mimeType: e['.tag'] === 'folder' ? 'application/vnd.google-apps.folder' : guessMimeType(e.name),
        size: e.size || 0,
        lastModified: e.server_modified || null,
        provider: 'dropbox'
      }));
    } else if (provider === 'onedrive') {
      const endpoint = folderId && folderId !== 'root'
        ? `https://graph.microsoft.com/v1.0/me/drive/items/${encodeURIComponent(folderId)}/children`
        : 'https://graph.microsoft.com/v1.0/me/drive/root/children';

      const oRes = await fetch(endpoint, {
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
      files = (data.value || []).map(item => ({
        id: item.id,
        name: item.name,
        isFolder: Boolean(item.folder),
        mimeType: item.folder ? 'application/vnd.google-apps.folder' : (item.file?.mimeType || guessMimeType(item.name)),
        size: item.size || 0,
        lastModified: item.lastModifiedDateTime,
        webViewLink: item.webUrl,
        provider: 'onedrive'
      }));
    }

    res.json({
      success: true,
      files,
      currentFolder,
      count: files.length
    });
  } catch (error) {
    console.error('Error listing cloud files:', error);
    res.status(500).json({ success: false, message: error.message || 'Internal server error' });
  }
};

/**
 * Direct file download from connected cloud provider
 */
exports.downloadProviderFile = async (req, res) => {
  try {
    const { provider, fileId } = req.params;

    if (!VALID_PROVIDERS.includes(provider)) {
      return res.status(400).json({ success: false, message: `Unsupported provider: ${provider}` });
    }

    const integration = await prisma.userIntegration.findFirst({
      where: { userId: req.userId, provider }
    });

    if (!integration || integration.status !== 'connected' || !integration.accessToken) {
      return res.status(400).json({ success: false, message: 'Provider is not connected' });
    }

    const token = await getValidToken(integration);

    if (provider === 'google_drive') {
      // Fetch metadata to check if it's a Google Workspace Doc
      const metaRes = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?fields=name,mimeType,size`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (!metaRes.ok) {
        return res.status(metaRes.status).json({ success: false, message: 'File not found on Google Drive' });
      }

      const meta = await metaRes.json();
      let downloadUrl = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media`;
      let fileName = meta.name || 'download';
      let contentType = meta.mimeType || 'application/octet-stream';

      if (isGoogleWorkspaceDoc(meta.mimeType)) {
        const exportFormat = getGoogleExportFormat(meta.mimeType);
        downloadUrl = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}/export?mimeType=${encodeURIComponent(exportFormat.exportMime)}`;
        contentType = exportFormat.exportMime;
        if (!fileName.endsWith(exportFormat.ext)) {
          fileName += exportFormat.ext;
        }
      }

      const streamRes = await fetch(downloadUrl, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (!streamRes.ok) {
        return res.status(streamRes.status).json({ success: false, message: 'Failed to download from Google Drive' });
      }

      const arrayBuf = await streamRes.arrayBuffer();
      res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(fileName)}"`);
      res.setHeader('Content-Type', contentType);
      return res.send(Buffer.from(arrayBuf));
    }

    res.status(501).json({ success: false, message: `Direct download not yet supported for ${provider}` });
  } catch (error) {
    console.error('Error downloading provider file:', error);
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
    const integration = await prisma.userIntegration.findFirst({
      where: {
        userId: req.userId,
        provider
      }
    });

    if (!integration || integration.status !== 'connected' || !integration.accessToken) {
      return res.status(400).json({
        success: false,
        message: `${provider.replace('_', ' ')} is not connected. Connect your account first.`
      });
    }

    const token = await getValidToken(integration);
    let fileBuffer = null;
    let actualFileName = fileName ? fileName.trim() : 'cloud_file';
    let mimeType = guessMimeType(actualFileName);

    // Download file content from provider
    if (provider === 'google_drive') {
      const gMetaRes = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?fields=name,mimeType,size`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      let downloadUrl = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media`;

      if (gMetaRes.ok) {
        const meta = await gMetaRes.json();
        if (meta.name && !fileName) actualFileName = meta.name;
        if (meta.mimeType) mimeType = guessMimeType(actualFileName, meta.mimeType);

        if (isGoogleWorkspaceDoc(meta.mimeType)) {
          const exportFormat = getGoogleExportFormat(meta.mimeType);
          downloadUrl = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}/export?mimeType=${encodeURIComponent(exportFormat.exportMime)}`;
          mimeType = exportFormat.exportMime;
          if (!actualFileName.endsWith(exportFormat.ext)) {
            actualFileName += exportFormat.ext;
          }
        }
      }

      const gDownloadRes = await fetch(downloadUrl, {
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

    // Generate safe key and upload to DEVHUB AWS S3
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

/**
 * Fetch storage quota for a single provider
 */
async function fetchSingleProviderQuota(provider, userId) {
  if (provider === 'devhub') {
    const files = await prisma.file.findMany({
      where: {
        project: {
          OR: [
            { ownerId: userId },
            { members: { some: { userId } } }
          ]
        }
      },
      select: { size: true, type: true }
    });

    let totalBytes = 0, documents = 0, images = 0, videos = 0, others = 0;
    files.forEach(f => {
      const s = f.size || 0;
      totalBytes += s;
      const t = (f.type || '').toLowerCase();
      if (t.includes('pdf') || t.includes('doc') || t.includes('txt') || t.includes('csv') || t.includes('xls') || t.includes('ppt')) documents += s;
      else if (t.includes('image') || t.includes('png') || t.includes('jpg') || t.includes('jpeg') || t.includes('svg')) images += s;
      else if (t.includes('video') || t.includes('mp4') || t.includes('mov') || t.includes('avi')) videos += s;
      else others += s;
    });

    const devhubLimit = process.env.DEVHUB_STORAGE_QUOTA_BYTES ? parseInt(process.env.DEVHUB_STORAGE_QUOTA_BYTES, 10) : (5 * 1024 * 1024 * 1024);
    return {
      provider: 'devhub',
      name: 'DEVHUB Storage',
      connected: true,
      used: totalBytes,
      limit: devhubLimit,
      percentage: devhubLimit > 0 ? ((totalBytes / devhubLimit) * 100) : null,
      breakdown: { documents, images, videos, others },
      fileCount: files.length,
      available: true
    };
  }

  if (provider === 'google_drive') {
    const integration = await prisma.userIntegration.findFirst({
      where: { userId, provider: 'google_drive' }
    });
    if (!integration || integration.status !== 'connected' || !integration.accessToken) {
      return {
        provider: 'google_drive',
        name: 'Google Drive',
        connected: false,
        available: false,
        message: 'Google Drive is not connected'
      };
    }
    try {
      const token = await getValidToken(integration);
      const qRes = await fetch('https://www.googleapis.com/drive/v3/about?fields=user,storageQuota', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!qRes.ok) {
        return {
          provider: 'google_drive',
          name: 'Google Drive',
          connected: true,
          account: integration.accountName,
          available: false,
          message: 'Storage unavailable'
        };
      }
      const qData = await qRes.json();
      const quota = qData.storageQuota || {};
      const used = quota.usage ? parseInt(quota.usage, 10) : 0;
      const limit = quota.limit ? parseInt(quota.limit, 10) : null;
      const percentage = limit ? ((used / limit) * 100) : null;
      return {
        provider: 'google_drive',
        name: 'Google Drive',
        connected: true,
        account: integration.accountName || qData.user?.emailAddress || null,
        used,
        limit,
        percentage,
        available: true
      };
    } catch (err) {
      return {
        provider: 'google_drive',
        name: 'Google Drive',
        connected: true,
        account: integration.accountName,
        available: false,
        message: 'Storage unavailable'
      };
    }
  }

  if (provider === 'dropbox') {
    const integration = await prisma.userIntegration.findFirst({
      where: { userId, provider: 'dropbox' }
    });
    if (!integration || integration.status !== 'connected' || !integration.accessToken) {
      return {
        provider: 'dropbox',
        name: 'Dropbox',
        connected: false,
        available: false,
        message: 'Dropbox is not connected'
      };
    }
    try {
      const token = await getValidToken(integration);
      const dRes = await fetch('https://api.dropboxapi.com/2/users/get_space_usage', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!dRes.ok) {
        return {
          provider: 'dropbox',
          name: 'Dropbox',
          connected: true,
          account: integration.accountName,
          available: false,
          message: 'Storage unavailable'
        };
      }
      const dData = await dRes.json();
      const used = dData.used || 0;
      const limit = dData.allocation?.allocated || null;
      const percentage = limit ? ((used / limit) * 100) : null;
      return {
        provider: 'dropbox',
        name: 'Dropbox',
        connected: true,
        account: integration.accountName,
        used,
        limit,
        percentage,
        available: true
      };
    } catch (err) {
      return {
        provider: 'dropbox',
        name: 'Dropbox',
        connected: true,
        account: integration.accountName,
        available: false,
        message: 'Storage unavailable'
      };
    }
  }

  if (provider === 'onedrive') {
    const integration = await prisma.userIntegration.findFirst({
      where: { userId, provider: 'onedrive' }
    });
    if (!integration || integration.status !== 'connected' || !integration.accessToken) {
      return {
        provider: 'onedrive',
        name: 'OneDrive',
        connected: false,
        available: false,
        message: 'OneDrive is not connected'
      };
    }
    try {
      const token = await getValidToken(integration);
      const oRes = await fetch('https://graph.microsoft.com/v1.0/me/drive', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!oRes.ok) {
        return {
          provider: 'onedrive',
          name: 'OneDrive',
          connected: true,
          account: integration.accountName,
          available: false,
          message: 'Storage unavailable'
        };
      }
      const oData = await oRes.json();
      const used = oData.quota?.used || 0;
      const limit = oData.quota?.total || null;
      const percentage = limit ? ((used / limit) * 100) : null;
      return {
        provider: 'onedrive',
        name: 'OneDrive',
        connected: true,
        account: integration.accountName,
        used,
        limit,
        percentage,
        available: true
      };
    } catch (err) {
      return {
        provider: 'onedrive',
        name: 'OneDrive',
        connected: true,
        account: integration.accountName,
        available: false,
        message: 'Storage unavailable'
      };
    }
  }

  throw new Error(`Unsupported provider: ${provider}`);
}

/**
 * Endpoint to retrieve context-aware storage quotas for DEVHUB and connected cloud providers
 */
exports.getProviderQuota = async (req, res) => {
  try {
    const { provider } = req.params;
    const userId = req.userId;

    if (provider) {
      const quota = await fetchSingleProviderQuota(provider, userId);
      return res.json({ success: true, quota });
    }

    // Otherwise return all 4 provider quotas simultaneously
    const [devhub, google_drive, dropbox, onedrive] = await Promise.all([
      fetchSingleProviderQuota('devhub', userId).catch(() => ({ provider: 'devhub', name: 'DEVHUB Storage', available: false })),
      fetchSingleProviderQuota('google_drive', userId).catch(() => ({ provider: 'google_drive', name: 'Google Drive', connected: false, available: false })),
      fetchSingleProviderQuota('dropbox', userId).catch(() => ({ provider: 'dropbox', name: 'Dropbox', connected: false, available: false })),
      fetchSingleProviderQuota('onedrive', userId).catch(() => ({ provider: 'onedrive', name: 'OneDrive', connected: false, available: false }))
    ]);

    res.json({
      success: true,
      quotas: {
        devhub,
        google_drive,
        dropbox,
        onedrive
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

