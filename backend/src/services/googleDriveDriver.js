const prisma = require('../db');
const { Readable } = require('stream');
const { decryptToken, encryptToken } = require('../utils/crypto');

/**
 * Authoritative Google Drive Storage Driver for DEVHUB Cloud Storage
 *
 * Interacts with the connected Admin Google Drive System Storage.
 * Provides:
 * - uploadFile
 * - downloadFile / downloadStream
 * - deleteFile
 * - listFiles
 * - createFolder
 * - getMetadata
 * - fileExists
 * - moveFile
 * - renameFile
 * - getAccessToken
 */

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
 * Retrieves the designated System Storage Google Drive user integration record.
 */
async function getSystemStorageIntegration() {
  const allIntegrations = await prisma.userIntegration.findMany({
    where: { provider: 'google_drive', status: 'connected' }
  });
  const sys = allIntegrations.find(i => i.metadata && i.metadata.isSystemStorage === true);
  if (!sys) {
    throw new Error('Google Drive system storage is not configured or not connected.');
  }
  return sys;
}

/**
 * Retrieves or refreshes the access token for the System Storage Google Drive account.
 */
async function getSystemStorageToken(customToken) {
  if (customToken) return decryptToken(customToken);

  const sys = await getSystemStorageIntegration();
  const metadata = sys.metadata || {};
  const isExpired = metadata.expiresAt && Date.now() > (metadata.expiresAt - 60000);

  const rawRefreshToken = metadata.refreshToken;
  const refreshToken = decryptToken(rawRefreshToken);
  const rawAccessToken = sys.accessToken;
  const accessToken = decryptToken(rawAccessToken);

  if (isExpired && refreshToken && process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
    try {
      console.log('[GoogleDriveDriver] Refreshing expired system storage token...');
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
        const updated = await prisma.userIntegration.update({
          where: { id: sys.id },
          data: {
            accessToken: encryptToken(newTokens.access_token),
            metadata: {
              ...metadata,
              expiresAt: Date.now() + (newTokens.expires_in || 3600) * 1000
            },
            updatedAt: new Date()
          }
        });
        return newTokens.access_token;
      } else {
        const errText = await refreshRes.text();
        console.error('[GoogleDriveDriver] Refresh failed:', errText);
        // Fall back to existing decrypted accessToken if refresh response was not ok
      }
    } catch (refreshErr) {
      console.error('[GoogleDriveDriver] Refresh error:', refreshErr.message);
    }
  }

  if (!accessToken) {
    throw new Error('Google Drive system storage has no active access token.');
  }

  return accessToken;
}

const googleDriveDriver = {
  /**
   * Retrieve active Google Drive access token.
   */
  async getAccessToken(customToken) {
    return await getSystemStorageToken(customToken);
  },

  /**
   * Upload file to Google Drive.
   * Supports both object parameters: ({ buffer, mimeType, filename, driveFolderId, token })
   * and positional arguments: (buffer, mimeType, filename, driveFolderId, token)
   */
  async uploadFile(arg1, arg2, arg3, arg4, arg5) {
    let buffer, mimeType, filename, driveFolderId, token;

    if (arg1 && typeof arg1 === 'object' && !Buffer.isBuffer(arg1) && !(arg1 instanceof Uint8Array)) {
      ({ buffer, mimeType, filename, driveFolderId, token } = arg1);
    } else {
      buffer = arg1;
      mimeType = arg2;
      filename = arg3;
      driveFolderId = arg4;
      token = arg5;
    }

    if (!driveFolderId) {
      throw new Error('Google Drive target folder ID is required.');
    }
    if (!buffer || buffer.length === 0) {
      throw new Error('Upload file buffer is empty.');
    }

    const accessToken = await this.getAccessToken(token);
    const effectiveMime = mimeType || guessMimeType(filename) || 'application/octet-stream';
    const effectiveName = filename || 'unnamed_file';

    const boundary = '-------314159265358979323846';
    const delimiter = `\r\n--${boundary}\r\n`;
    const closeDelimiter = `\r\n--${boundary}--`;

    const metadata = {
      name: effectiveName,
      mimeType: effectiveMime,
      parents: [driveFolderId]
    };

    const fileBuf = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
    const multipartBody = Buffer.concat([
      Buffer.from(
        delimiter +
        'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
        JSON.stringify(metadata) +
        delimiter +
        `Content-Type: ${effectiveMime}\r\n\r\n`
      ),
      fileBuf,
      Buffer.from(closeDelimiter)
    ]);

    const res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,size,mimeType,parents', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': `multipart/related; boundary=${boundary}`,
        'Content-Length': String(multipartBody.length)
      },
      body: multipartBody
    });

    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      const errMsg = errBody.error?.message || `HTTP ${res.status}`;
      if (res.status === 401) throw new Error('Google Drive authentication expired or unauthorized.');
      if (res.status === 403) throw new Error(`Google Drive permission denied or quota exceeded: ${errMsg}`);
      if (res.status === 404) throw new Error(`Google Drive folder not found: ${driveFolderId}`);
      throw new Error(`Google Drive upload failed (${res.status}): ${errMsg}`);
    }

    const data = await res.json();
    return {
      driveFileId: data.id,
      name: data.name || effectiveName,
      size: BigInt(data.size || fileBuf.length),
      mimeType: data.mimeType || effectiveMime,
      parents: data.parents || [driveFolderId]
    };
  },

  // Alias for backward compatibility
  async upload(buffer, mimeType, filename, driveFolderId, token) {
    return await this.uploadFile(buffer, mimeType, filename, driveFolderId, token);
  },

  /**
   * Download a file from Google Drive as a Readable stream.
   *
   * @param {string} driveFileId
   * @param {string} [token]
   * @returns {Promise<{ stream: Readable, mimeType: string, name: string, size?: number }>}
   */
  async downloadFile(driveFileId, token) {
    if (!driveFileId) {
      throw new Error('Google Drive file ID is required for download.');
    }

    const accessToken = await this.getAccessToken(token);

    const metaRes = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(driveFileId)}?fields=id,name,mimeType,size,trashed`, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });

    if (!metaRes.ok) {
      const errBody = await metaRes.json().catch(() => ({}));
      const errMsg = errBody.error?.message || `HTTP ${metaRes.status}`;
      if (metaRes.status === 404) throw new Error('Google Drive file not found.');
      if (metaRes.status === 401) throw new Error('Google Drive authentication expired or unauthorized.');
      if (metaRes.status === 403) throw new Error(`Google Drive download access denied: ${errMsg}`);
      throw new Error(`Google Drive metadata fetch failed (${metaRes.status}): ${errMsg}`);
    }

    const meta = await metaRes.json();
    if (meta.trashed) {
      throw new Error('Google Drive file is in trash and cannot be downloaded.');
    }

    let downloadUrl = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(driveFileId)}?alt=media`;
    let effectiveMime = meta.mimeType || 'application/octet-stream';
    let effectiveName = meta.name || 'download';

    if (isGoogleWorkspaceDoc(meta.mimeType)) {
      const exportFormat = getGoogleExportFormat(meta.mimeType);
      downloadUrl = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(driveFileId)}/export?mimeType=${encodeURIComponent(exportFormat.exportMime)}`;
      effectiveMime = exportFormat.exportMime;
      if (!effectiveName.endsWith(exportFormat.ext)) {
        effectiveName += exportFormat.ext;
      }
    }

    const dlRes = await fetch(downloadUrl, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });

    if (!dlRes.ok) {
      const errBody = await dlRes.json().catch(() => ({}));
      const errMsg = errBody.error?.message || `HTTP ${dlRes.status}`;
      if (dlRes.status === 404) throw new Error('Google Drive file not found.');
      if (dlRes.status === 401) throw new Error('Google Drive authentication expired or unauthorized.');
      if (dlRes.status === 403) throw new Error(`Google Drive download access denied: ${errMsg}`);
      throw new Error(`Google Drive download failed (${dlRes.status}): ${errMsg}`);
    }

    const nodeStream = dlRes.body && typeof dlRes.body.pipe === 'function'
      ? dlRes.body
      : Readable.fromWeb(dlRes.body);

    return {
      stream: nodeStream,
      mimeType: effectiveMime,
      name: effectiveName,
      size: meta.size ? parseInt(meta.size, 10) : undefined
    };
  },

  // Alias for downloadFile
  async downloadStream(driveFileId, token) {
    return await this.downloadFile(driveFileId, token);
  },

  /**
   * Delete a file or folder from Google Drive.
   * Idempotent: returns true if already deleted (404).
   *
   * @param {string} driveFileId
   * @param {string} [token]
   * @returns {Promise<boolean>}
   */
  async deleteFile(driveFileId, token) {
    if (!driveFileId) {
      throw new Error('Google Drive file ID is required for deletion.');
    }

    const accessToken = await this.getAccessToken(token);

    const res = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(driveFileId)}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${accessToken}` }
    });

    if (!res.ok && res.status !== 404) {
      const errBody = await res.json().catch(() => ({}));
      const errMsg = errBody.error?.message || `HTTP ${res.status}`;
      if (res.status === 401) throw new Error('Google Drive authentication expired or unauthorized.');
      if (res.status === 403) throw new Error(`Google Drive permission denied: ${errMsg}`);
      throw new Error(`Google Drive delete failed (${res.status}): ${errMsg}`);
    }

    return true;
  },

  /**
   * List files located directly inside a Google Drive folder.
   *
   * @param {string} driveFolderId
   * @param {Object} [options]
   * @param {string} [options.token]
   * @param {number} [options.pageSize=100]
   * @returns {Promise<Array>}
   */
  async listFiles(driveFolderId, { token, pageSize = 100 } = {}) {
    if (!driveFolderId) {
      throw new Error('driveFolderId is required to list files.');
    }

    const accessToken = await this.getAccessToken(token);
    const query = `'${driveFolderId}' in parents and trashed = false`;
    const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&pageSize=${pageSize}&fields=files(id,name,mimeType,size,modifiedTime,createdTime,parents)&spaces=drive`;

    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });

    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      const errMsg = errBody.error?.message || `HTTP ${res.status}`;
      if (res.status === 401) throw new Error('Google Drive authentication expired or unauthorized.');
      if (res.status === 403) throw new Error(`Google Drive permission denied: ${errMsg}`);
      throw new Error(`Google Drive listFiles failed (${res.status}): ${errMsg}`);
    }

    const data = await res.json();
    return data.files || [];
  },

  /**
   * Create a folder inside a parent Drive folder.
   *
   * @param {string} name
   * @param {string} parentFolderId
   * @param {string} [token]
   * @returns {Promise<string>} - Created folder ID
   */
  async createFolder(name, parentFolderId, token) {
    if (!name || !parentFolderId) {
      throw new Error('Folder name and parentFolderId are required.');
    }

    const accessToken = await this.getAccessToken(token);
    const safeName = name.trim() || 'unnamed_folder';

    const res = await fetch('https://www.googleapis.com/drive/v3/files?fields=id,name,parents', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        name: safeName,
        mimeType: 'application/vnd.google-apps.folder',
        parents: [parentFolderId]
      })
    });

    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      const errMsg = errBody.error?.message || `HTTP ${res.status}`;
      if (res.status === 401) throw new Error('Google Drive authentication expired or unauthorized.');
      if (res.status === 403) throw new Error(`Google Drive permission denied: ${errMsg}`);
      throw new Error(`Google Drive folder creation failed (${res.status}): ${errMsg}`);
    }

    const data = await res.json();
    return data.id;
  },

  /**
   * Retrieve metadata for a file or folder in Google Drive.
   *
   * @param {string} driveFileId
   * @param {string} [token]
   * @returns {Promise<Object|null>} - Metadata object or null if 404
   */
  async getMetadata(driveFileId, token) {
    if (!driveFileId) return null;

    try {
      const accessToken = await this.getAccessToken(token);
      const res = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(driveFileId)}?fields=id,name,mimeType,size,trashed,parents,createdTime,modifiedTime`, {
        headers: { Authorization: `Bearer ${accessToken}` }
      });

      if (res.status === 404) return null;
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        const errMsg = errBody.error?.message || `HTTP ${res.status}`;
        throw new Error(`Google Drive metadata fetch failed (${res.status}): ${errMsg}`);
      }

      return await res.json();
    } catch (err) {
      if (err.message && err.message.includes('404')) return null;
      throw err;
    }
  },

  /**
   * Check if a file or folder exists in Google Drive and is not trashed.
   *
   * @param {string} driveFileId
   * @param {string} [token]
   * @returns {Promise<boolean>}
   */
  async fileExists(driveFileId, token) {
    if (!driveFileId) return false;
    try {
      const meta = await this.getMetadata(driveFileId, token);
      return Boolean(meta && !meta.trashed);
    } catch (_) {
      return false;
    }
  },

  /**
   * Move a file or folder to a new parent in Google Drive.
   *
   * @param {string} driveFileId
   * @param {string} newParentId
   * @param {string} oldParentId
   * @param {string} [token]
   * @returns {Promise<Object>}
   */
  async moveFile(driveFileId, newParentId, oldParentId, token) {
    if (!driveFileId || !newParentId) {
      throw new Error('driveFileId and newParentId are required to move file.');
    }

    const accessToken = await this.getAccessToken(token);
    let url = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(driveFileId)}?addParents=${encodeURIComponent(newParentId)}&fields=id,parents`;
    if (oldParentId) {
      url += `&removeParents=${encodeURIComponent(oldParentId)}`;
    }

    const res = await fetch(url, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${accessToken}` }
    });

    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      const errMsg = errBody.error?.message || `HTTP ${res.status}`;
      throw new Error(`Google Drive move failed (${res.status}): ${errMsg}`);
    }

    return await res.json();
  },

  /**
   * Rename a file or folder in Google Drive.
   *
   * @param {string} driveFileId
   * @param {string} newName
   * @param {string} [token]
   * @returns {Promise<Object>}
   */
  async renameFile(driveFileId, newName, token) {
    if (!driveFileId || !newName) {
      throw new Error('driveFileId and newName are required to rename file.');
    }

    const accessToken = await this.getAccessToken(token);
    const res = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(driveFileId)}?fields=id,name`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ name: newName.trim() })
    });

    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      const errMsg = errBody.error?.message || `HTTP ${res.status}`;
      throw new Error(`Google Drive rename failed (${res.status}): ${errMsg}`);
    }

    return await res.json();
  }
};

module.exports = {
  googleDriveDriver,
  getSystemStorageIntegration,
  getSystemStorageToken,
  guessMimeType,
  isGoogleWorkspaceDoc,
  getGoogleExportFormat
};
