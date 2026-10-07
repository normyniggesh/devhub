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

class OneDriveProvider extends BaseExternalStorageProvider {
  constructor() {
    super('onedrive');
  }

  async getAuthUrl({ redirectUri, state }) {
    const clientId = process.env.ONEDRIVE_CLIENT_ID;
    if (!clientId) {
      throw new Error('OneDrive OAuth is not configured. Missing ONEDRIVE_CLIENT_ID.');
    }

    const scope = 'files.read offline_access User.Read';
    const params = new URLSearchParams({
      client_id: clientId,
      response_type: 'code',
      redirect_uri: redirectUri,
      response_mode: 'query',
      scope,
      state: state || ''
    });

    return {
      url: `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?${params.toString()}`,
      state
    };
  }

  async handleCallback({ code, redirectUri }) {
    const clientId = process.env.ONEDRIVE_CLIENT_ID;
    const clientSecret = process.env.ONEDRIVE_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      throw new Error('OneDrive OAuth credentials not configured on server.');
    }

    const tokenRes = await fetch('https://login.microsoftonline.com/common/oauth2/v2.0/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code'
      })
    });

    if (!tokenRes.ok) {
      const err = await tokenRes.json().catch(() => ({}));
      throw new Error(err.error_description || 'Failed to exchange OneDrive authorization code.');
    }

    const tokenData = await tokenRes.json();
    const accountInfo = await this.validateToken(tokenData.access_token);

    return {
      accessToken: tokenData.access_token,
      refreshToken: tokenData.refresh_token || null,
      accountName: accountInfo.accountName,
      metadata: {
        ...accountInfo.metadata,
        refreshToken: tokenData.refresh_token || null,
        expiresAt: tokenData.expires_in ? Date.now() + tokenData.expires_in * 1000 : null,
        isSystemStorage: false
      }
    };
  }

  async validateToken(token) {
    const res = await fetch('https://graph.microsoft.com/v1.0/me', {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error?.message || 'Invalid OneDrive access token. Please verify your token.');
    }

    const data = await res.json();
    const email = data.mail || data.userPrincipalName || `${data.displayName || 'OneDrive User'}`;
    return {
      accountName: email,
      metadata: {
        email: data.mail || data.userPrincipalName,
        displayName: data.displayName,
        id: data.id,
        isSystemStorage: false
      }
    };
  }

  async getValidToken(integration) {
    if (!integration || !integration.accessToken) {
      throw new Error('OneDrive integration is not connected.');
    }

    let token = decryptToken(integration.accessToken);
    const metadata = integration.metadata || {};
    const refreshToken = metadata.refreshToken ? decryptToken(metadata.refreshToken) : null;
    const isExpired = metadata.expiresAt && Date.now() > (metadata.expiresAt - 60000);

    if (isExpired && refreshToken && process.env.ONEDRIVE_CLIENT_ID && process.env.ONEDRIVE_CLIENT_SECRET) {
      try {
        const refreshRes = await fetch('https://login.microsoftonline.com/common/oauth2/v2.0/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            client_id: process.env.ONEDRIVE_CLIENT_ID,
            client_secret: process.env.ONEDRIVE_CLIENT_SECRET,
            grant_type: 'refresh_token',
            refresh_token: refreshToken
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
                expiresAt: newTokens.expires_in ? Date.now() + newTokens.expires_in * 1000 : null
              },
              updatedAt: new Date()
            }
          });
        }
      } catch (e) {
        console.warn('[OneDriveProvider] Token refresh error:', e.message);
      }
    }

    return token;
  }

  async listFiles(integration, { folderId, search } = {}) {
    const token = await this.getValidToken(integration);

    let url;
    if (search && search.trim()) {
      url = `https://graph.microsoft.com/v1.0/me/drive/root/search(q='${encodeURIComponent(search.trim())}')`;
    } else if (folderId && folderId !== 'root') {
      url = `https://graph.microsoft.com/v1.0/me/drive/items/${encodeURIComponent(folderId)}/children`;
    } else {
      url = 'https://graph.microsoft.com/v1.0/me/drive/root/children';
    }

    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error?.message || 'Failed to list files from OneDrive');
    }

    const data = await res.json();
    const files = (data.value || []).map(item => {
      const isFolder = !!item.folder;
      return {
        id: item.id,
        name: item.name,
        isFolder,
        mimeType: isFolder ? 'application/vnd.google-apps.folder' : (item.file?.mimeType || guessMimeType(item.name)),
        size: item.size || 0,
        lastModified: item.lastModifiedDateTime,
        webUrl: item.webUrl,
        provider: 'onedrive'
      };
    });

    let currentFolder = { id: folderId || 'root', name: folderId ? 'Folder' : 'OneDrive Root' };
    if (folderId && folderId !== 'root') {
      try {
        const folderMetaRes = await fetch(`https://graph.microsoft.com/v1.0/me/drive/items/${encodeURIComponent(folderId)}?$select=id,name`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (folderMetaRes.ok) {
          const folderMeta = await folderMetaRes.json();
          currentFolder.name = folderMeta.name || 'Folder';
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
    const res = await fetch(`https://graph.microsoft.com/v1.0/me/drive/items/${encodeURIComponent(fileId)}`, {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (!res.ok) {
      throw new Error('File not found on OneDrive');
    }

    const data = await res.json();
    const isFolder = !!data.folder;
    return {
      id: data.id,
      name: data.name,
      isFolder,
      size: data.size || 0,
      lastModified: data.lastModifiedDateTime,
      mimeType: isFolder ? 'application/vnd.google-apps.folder' : (data.file?.mimeType || guessMimeType(data.name)),
      webUrl: data.webUrl,
      provider: 'onedrive'
    };
  }

  async downloadFile(integration, fileId) {
    const token = await this.getValidToken(integration);
    const meta = await this.getMetadata(integration, fileId);

    const downloadRes = await fetch(`https://graph.microsoft.com/v1.0/me/drive/items/${encodeURIComponent(fileId)}/content`, {
      headers: { Authorization: `Bearer ${token}` },
      redirect: 'follow'
    });

    if (!downloadRes.ok) {
      throw new Error(`OneDrive download failed (${downloadRes.statusText})`);
    }

    const arrayBuf = await downloadRes.arrayBuffer();
    const buffer = Buffer.from(arrayBuf);

    return {
      buffer,
      name: meta.name || 'onedrive_download',
      mimeType: meta.mimeType || 'application/octet-stream',
      size: buffer.length
    };
  }

  async getQuota(integration) {
    const token = await this.getValidToken(integration);
    const res = await fetch('https://graph.microsoft.com/v1.0/me/drive', {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (!res.ok) {
      return { connected: true, provider: 'onedrive', name: 'OneDrive', available: false };
    }

    const data = await res.json();
    const quota = data.quota || {};
    const usedBytes = quota.used || 0;
    const totalBytes = quota.total || (5 * 1024 * 1024 * 1024);
    return {
      connected: true,
      provider: 'onedrive',
      name: 'OneDrive',
      accountName: integration.accountName,
      usedBytes,
      totalBytes,
      usedFormatted: `${(usedBytes / 1073741824).toFixed(2)} GB`,
      totalFormatted: `${(totalBytes / 1073741824).toFixed(2)} GB`,
      percentUsed: totalBytes > 0 ? ((usedBytes / totalBytes) * 100).toFixed(1) : '0'
    };
  }
}

module.exports = OneDriveProvider;
