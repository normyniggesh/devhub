const GoogleDrivePersonalProvider = require('./GoogleDrivePersonalProvider');
const DropboxProvider = require('./DropboxProvider');
const OneDriveProvider = require('./OneDriveProvider');

const providers = {
  google_drive: new GoogleDrivePersonalProvider(),
  dropbox: new DropboxProvider(),
  onedrive: new OneDriveProvider()
};

const SUPPORTED_EXTERNAL_PROVIDERS = ['google_drive', 'dropbox', 'onedrive'];

/**
 * Normalizes provider name to canonical key
 */
function normalizeProvider(provider) {
  if (!provider) return null;
  const p = provider.toLowerCase().trim();
  if (p === 'google' || p === 'googledrive' || p === 'gdrive' || p === 'google_drive') return 'google_drive';
  if (p === 'dropbox') return 'dropbox';
  if (p === 'onedrive') return 'onedrive';
  return p;
}

/**
 * Returns provider adapter instance
 * @param {string} providerName
 * @returns {BaseExternalStorageProvider}
 */
function getProvider(providerName) {
  const normalized = normalizeProvider(providerName);
  const provider = providers[normalized];
  if (!provider) {
    throw new Error(`Unsupported external storage provider: ${providerName}. Supported: ${SUPPORTED_EXTERNAL_PROVIDERS.join(', ')}`);
  }
  return provider;
}

module.exports = {
  getProvider,
  normalizeProvider,
  SUPPORTED_EXTERNAL_PROVIDERS,
  GoogleDrivePersonalProvider,
  DropboxProvider,
  OneDriveProvider
};
