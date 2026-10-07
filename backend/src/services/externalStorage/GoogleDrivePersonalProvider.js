const BaseExternalStorageProvider = require('./BaseExternalStorageProvider');
const { decryptToken } = require('../../utils/crypto');

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

class GoogleDrivePersonalProvider extends BaseExternalStorageProvider {
  constructor() {
    super('google_drive');
  }

  async getAuthUrl({ redirectUri, state }) {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    if (!clientId) {
      throw new Error('Google OAuth is not configured. Missing GOOGLE_CLIENT_ID.');
    }

    const scope = [
      'https://www.googleapis.com/auth/drive.file',
      'https://www.googleapis.com/auth/userinfo.email',
      'https://www.googleapis.com/auth/userinfo.profile'
    ].join(' ');

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope,
      access_type: 'offline',
      prompt: 'consent',
      include_granted_scopes: 'true',
      state: state || ''
    });

    return {
      url: `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`,
      state
    };
  }

  async handleCallback({ code, redirectUri }) {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      throw new Error('Google OAuth credentials not configured on server.');
    }

    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code'
      })
    });

    if (!tokenRes.ok) {
      const errData = await tokenRes.json().catch(() => ({}));
      throw new Error(errData.error_description || 'Failed to exchange Google OAuth authorization code.');
    }

    const tokenData = await tokenRes.json();

    // Fetch user profile info
    const userRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` }
    });
    const userInfo = userRes.ok ? await userRes.json() : {};

    const accountEmail = userInfo.email || 'Google Drive User';
    const metadata = {
      email: accountEmail,
      displayName: userInfo.name || accountEmail,
      picture: userInfo.picture || null,
      refreshToken: tokenData.refresh_token || null,
      expiresAt: Date.now() + (tokenData.expires_in || 3600) * 1000,
      scope: tokenData.scope || null,
      isSystemStorage: false // Explicitly personal external storage
    };

    return {
      accessToken: tokenData.access_token,
      refreshToken: tokenData.refresh_token,
      accountName: accountEmail,
      metadata
    };
  }

  async validateToken(token) {
    const userRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!userRes.ok) {
      throw new Error('Invalid Google Drive token.');
    }
    const info = await userRes.json();
    return {
      accountName: info.email || 'Google Drive User',
      metadata: {
        email: info.email,
        displayName: info.name,
        picture: info.picture,
        isSystemStorage: false
      }
    };
  }

  async getValidToken(integration) {
    if (!integration || !integration.accessToken) {
      throw new Error('Google Drive integration is not connected.');
    }

    let token = decryptToken(integration.accessToken);
    const metadata = integration.metadata || {};
    const refreshToken = metadata.refreshToken ? decryptToken(metadata.refreshToken) : null;
    const isExpired = metadata.expiresAt && Date.now() > (metadata.expiresAt - 60000);

    if (isExpired && refreshToken && process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
      try {
        const refreshRes = await fetch('https://oauth2.googleapis.com/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            client_id: process.env.GOOGLE_CLIENT_ID,
            client_secret: process.env.GOOGLE_CLIENT_SECRET,
            refresh_token: refreshToken,
            grant_type: 'refresh_token'
          })
        });

        if (refreshRes.ok) {
          const newTokens = await refreshRes.json();
          token = newTokens.access_token;
          const { encryptToken } = require('../../utils/crypto');
          const prisma = require('../../db');
          await prisma.userIntegration.update({
            where: { id: integration.id },
            data: {
              accessToken: encryptToken(newTokens.access_token),
              metadata: {
                ...metadata,
                expiresAt: Date.now() + (newTokens.expires_in || 3600) * 1000
              },
              updatedAt: new Date()
            }
          });
        }
      } catch (e) {
        console.warn('[GoogleDrivePersonalProvider] Token refresh failed:', e.message);
      }
    }

    return token;
  }

  async listFiles(integration, { folderId, search } = {}) {
    const token = await this.getValidToken(integration);
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
      throw new Error(errData.error?.message || 'Failed to list files from Google Drive');
    }

    const data = await gRes.json();
    const files = (data.files || []).map(f => {
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

    let currentFolder = { id: targetFolderId, name: 'My Drive' };
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

    return {
      files,
      currentFolder,
      count: files.length
    };
  }

  async getMetadata(integration, fileId) {
    const token = await this.getValidToken(integration);
    const metaRes = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?fields=id,name,mimeType,size,modifiedTime,webViewLink`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!metaRes.ok) {
      throw new Error('File not found on Google Drive');
    }
    const meta = await metaRes.json();
    return {
      id: meta.id,
      name: meta.name,
      mimeType: meta.mimeType,
      size: meta.size ? parseInt(meta.size, 10) : 0,
      lastModified: meta.modifiedTime,
      webViewLink: meta.webViewLink,
      provider: 'google_drive'
    };
  }

  async downloadFile(integration, fileId) {
    const token = await this.getValidToken(integration);
    const meta = await this.getMetadata(integration, fileId);

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
      throw new Error(`Failed to download file from Google Drive (Status: ${streamRes.status})`);
    }

    const arrayBuf = await streamRes.arrayBuffer();
    const buffer = Buffer.from(arrayBuf);

    return {
      buffer,
      name: fileName,
      mimeType: contentType,
      size: buffer.length
    };
  }

  async getQuota(integration) {
    const token = await this.getValidToken(integration);
    const aboutRes = await fetch('https://www.googleapis.com/drive/v3/about?fields=storageQuota,user', {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!aboutRes.ok) {
      return { connected: true, provider: 'google_drive', name: 'Google Drive', available: false };
    }
    const data = await aboutRes.json();
    const q = data.storageQuota || {};
    const usedBytes = q.usage ? parseInt(q.usage, 10) : 0;
    const totalBytes = q.limit ? parseInt(q.limit, 10) : 15 * 1024 * 1024 * 1024;
    return {
      connected: true,
      provider: 'google_drive',
      name: 'Google Drive',
      accountName: data.user?.emailAddress || integration.accountName,
      usedBytes,
      totalBytes,
      usedFormatted: `${(usedBytes / 1073741824).toFixed(2)} GB`,
      totalFormatted: `${(totalBytes / 1073741824).toFixed(2)} GB`,
      percentUsed: totalBytes > 0 ? ((usedBytes / totalBytes) * 100).toFixed(1) : '0'
    };
  }
}

module.exports = GoogleDrivePersonalProvider;
