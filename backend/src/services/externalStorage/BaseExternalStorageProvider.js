/**
 * Abstract Base Class for Personal External Cloud Storage Providers.
 * Centralizes standard lifecycle and file operations.
 */
class BaseExternalStorageProvider {
  constructor(providerName) {
    if (!providerName) throw new Error('Provider name is required');
    this.name = providerName;
  }

  /**
   * Generates OAuth authorization URL
   * @param {Object} params - { redirectUri, state }
   * @returns {Promise<{ url: string, state: string }>}
   */
  async getAuthUrl(params) {
    throw new Error(`getAuthUrl not implemented for ${this.name}`);
  }

  /**
   * Exchanges OAuth authorization code for credentials
   * @param {Object} params - { code, redirectUri }
   * @returns {Promise<{ accessToken: string, refreshToken?: string, expiresAt?: number, accountName?: string, metadata?: Object }>}
   */
  async handleCallback(params) {
    throw new Error(`handleCallback not implemented for ${this.name}`);
  }

  /**
   * Validates and verifies an API access token
   * @param {string} token
   * @returns {Promise<{ accountName: string, metadata: Object }>}
   */
  async validateToken(token) {
    throw new Error(`validateToken not implemented for ${this.name}`);
  }

  /**
   * Refreshes or returns a valid token for an existing integration record
   * @param {Object} integration - UserIntegration database row
   * @returns {Promise<string>} - valid accessToken
   */
  async getValidToken(integration) {
    throw new Error(`getValidToken not implemented for ${this.name}`);
  }

  /**
   * Lists files and folders from the external cloud provider
   * @param {Object} integration
   * @param {Object} options - { folderId, search, limit }
   * @returns {Promise<{ files: Array, currentFolder: Object, count: number }>}
   */
  async listFiles(integration, options = {}) {
    throw new Error(`listFiles not implemented for ${this.name}`);
  }

  /**
   * Fetches metadata for a specific external file
   * @param {Object} integration
   * @param {string} fileId
   * @returns {Promise<Object>}
   */
  async getMetadata(integration, fileId) {
    throw new Error(`getMetadata not implemented for ${this.name}`);
  }

  /**
   * Downloads an external file
   * @param {Object} integration
   * @param {string} fileId
   * @returns {Promise<{ buffer: Buffer, stream?: any, name: string, mimeType: string, size: number }>}
   */
  async downloadFile(integration, fileId) {
    throw new Error(`downloadFile not implemented for ${this.name}`);
  }

  /**
   * Queries external storage space usage / quota
   * @param {Object} integration
   * @returns {Promise<{ usedBytes: number, totalBytes: number, accountName: string }>}
   */
  async getQuota(integration) {
    throw new Error(`getQuota not implemented for ${this.name}`);
  }
}

module.exports = BaseExternalStorageProvider;
