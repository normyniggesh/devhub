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

class DropboxProvider extends BaseExternalStorageProvider {
  constructor() {
    super('dropbox');
  }

  async getAuthUrl({ redirectUri, state }) {
    const clientId = process.env.DROPBOX_CLIENT_ID;
    if (!clientId) {
      throw new Error('Dropbox OAuth is not configured. Missing DROPBOX_CLIENT_ID.');
    }

    const params = new URLSearchParams({
      client_id: clientId,
      response_type: 'code',
      redirect_uri: redirectUri,
      token_access_type: 'offline',
      state: state || ''
    });

    return {
      url: `https://www.dropbox.com/oauth2/authorize?${params.toString()}`,
      state
    };
  }

  async handleCallback({ code, redirectUri }) {
    const clientId = process.env.DROPBOX_CLIENT_ID;
    const clientSecret = process.env.DROPBOX_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      throw new Error('Dropbox OAuth credentials not configured on server.');
    }

    const tokenRes = await fetch('https://api.dropboxapi.com/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        grant_type: 'authorization_code',
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri
      })
    });

    if (!tokenRes.ok) {
      const err = await tokenRes.json().catch(() => ({}));
      throw new Error(err.error_description || 'Failed to exchange Dropbox authorization code.');
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
    const res = await fetch('https://api.dropboxapi.com/2/users/get_current_account', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` }
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error_summary || 'Invalid Dropbox access token. Please verify your token.');
    }

    const data = await res.json();
    const email = data.email || `${data.name?.display_name || 'Dropbox User'}`;
    return {
      accountName: email,
      metadata: {
        email: data.email,
        displayName: data.name?.display_name,
        accountId: data.account_id,
        isSystemStorage: false
      }
    };
  }

  async getValidToken(integration) {
    if (!integration || !integration.accessToken) {
      throw new Error('Dropbox integration is not connected.');
    }

    let token = decryptToken(integration.accessToken);
    const metadata = integration.metadata || {};
    const refreshToken = metadata.refreshToken ? decryptToken(metadata.refreshToken) : null;
    const isExpired = metadata.expiresAt && Date.now() > (metadata.expiresAt - 60000);

    if (isExpired && refreshToken && process.env.DROPBOX_CLIENT_ID && process.env.DROPBOX_CLIENT_SECRET) {
      try {
        const refreshRes = await fetch('https://api.dropboxapi.com/oauth2/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            grant_type: 'refresh_token',
            refresh_token: refreshToken,
            client_id: process.env.DROPBOX_CLIENT_ID,
            client_secret: process.env.DROPBOX_CLIENT_SECRET
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
        console.warn('[DropboxProvider] Token refresh error:', e.message);
      }
    }

    return token;
  }

  async listFiles(integration, { folderId, search } = {}) {
    const token = await this.getValidToken(integration);
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
      throw new Error(errData.error_summary || 'Failed to list files from Dropbox');
    }

    const data = await dRes.json();
    const files = (data.entries || []).map(e => ({
      id: e.id || e.path_lower,
      name: e.name,
      path: e.path_lower,
      isFolder: e['.tag'] === 'folder',
      mimeType: e['.tag'] === 'folder' ? 'application/vnd.google-apps.folder' : guessMimeType(e.name),
      size: e.size || 0,
      lastModified: e.server_modified || null,
      provider: 'dropbox'
    }));

    return {
      files,
      currentFolder: { id: targetPath || '', name: targetPath ? targetPath.split('/').pop() : 'Dropbox Root' },
      count: files.length
    };
  }

  async getMetadata(integration, fileId) {
    const token = await this.getValidToken(integration);
    const res = await fetch('https://api.dropboxapi.com/2/files/get_metadata', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ path: fileId })
    });

    if (!res.ok) {
      throw new Error('File not found on Dropbox');
    }

    const data = await res.json();
    return {
      id: data.id || data.path_lower,
      name: data.name,
      isFolder: data['.tag'] === 'folder',
      size: data.size || 0,
      lastModified: data.server_modified || null,
      mimeType: guessMimeType(data.name),
      provider: 'dropbox'
    };
  }

  async downloadFile(integration, fileId) {
    const token = await this.getValidToken(integration);
    const dDownloadRes = await fetch('https://content.dropboxapi.com/2/files/download', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Dropbox-API-Arg': JSON.stringify({ path: fileId })
      }
    });

    if (!dDownloadRes.ok) {
      throw new Error(`Dropbox download failed (${dDownloadRes.statusText})`);
    }

    let actualFileName = 'dropbox_download';
    const headerMeta = dDownloadRes.headers.get('dropbox-api-result');
    if (headerMeta) {
      try {
        const parsed = JSON.parse(headerMeta);
        if (parsed.name) actualFileName = parsed.name;
      } catch (_) {}
    }

    const arrayBuf = await dDownloadRes.arrayBuffer();
    const buffer = Buffer.from(arrayBuf);
    return {
      buffer,
      name: actualFileName,
      mimeType: guessMimeType(actualFileName),
      size: buffer.length
    };
  }

  async getQuota(integration) {
    const token = await this.getValidToken(integration);
    const dRes = await fetch('https://api.dropboxapi.com/2/users/get_space_usage', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` }
    });

    if (!dRes.ok) {
      return { connected: true, provider: 'dropbox', name: 'Dropbox', available: false };
    }

    const data = await dRes.json();
    const usedBytes = data.used || 0;
    const totalBytes = data.allocation?.allocated || (2 * 1024 * 1024 * 1024);
    return {
      connected: true,
      provider: 'dropbox',
      name: 'Dropbox',
      accountName: integration.accountName,
      usedBytes,
      totalBytes,
      usedFormatted: `${(usedBytes / 1073741824).toFixed(2)} GB`,
      totalFormatted: `${(totalBytes / 1073741824).toFixed(2)} GB`,
      percentUsed: totalBytes > 0 ? ((usedBytes / totalBytes) * 100).toFixed(1) : '0'
    };
  }
}

module.exports = DropboxProvider;
