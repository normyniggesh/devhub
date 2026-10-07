const crypto = require('crypto');

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;

/**
 * Derives a consistent 32-byte key from environment secret
 */
function getEncryptionKey() {
  const secret = process.env.STORAGE_ENCRYPTION_KEY || process.env.JWT_SECRET || 'devhub-default-storage-encryption-key-2026';
  return crypto.createHash('sha256').update(secret).digest();
}

/**
 * Encrypt sensitive string (e.g. OAuth access_token or refresh_token)
 * Format: enc:<iv_hex>:<tag_hex>:<ciphertext_hex>
 */
function encryptToken(plainText) {
  if (!plainText || typeof plainText !== 'string') return plainText;
  try {
    const key = getEncryptionKey();
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    
    let encrypted = cipher.update(plainText, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag().toString('hex');
    
    return `enc:${iv.toString('hex')}:${authTag}:${encrypted}`;
  } catch (err) {
    console.error('[Crypto] Token encryption error:', err.message);
    return plainText;
  }
}

/**
 * Decrypt sensitive string.
 * Backward compatible: if string is not encrypted (e.g. legacy plain text), returns as is.
 */
function decryptToken(encryptedText) {
  if (!encryptedText || typeof encryptedText !== 'string') return encryptedText;
  if (!encryptedText.startsWith('enc:')) {
    return encryptedText; // Legacy plaintext
  }

  try {
    const parts = encryptedText.split(':');
    if (parts.length !== 4) return encryptedText;

    const iv = Buffer.from(parts[1], 'hex');
    const authTag = Buffer.from(parts[2], 'hex');
    const ciphertext = parts[3];

    const key = getEncryptionKey();
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(ciphertext, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (err) {
    console.error('[Crypto] Token decryption error:', err.message);
    return encryptedText;
  }
}

/**
 * Sanitizes an integration object for API responses.
 * Strictly strips accessToken, refreshToken, client secrets, and sensitive tokens.
 */
function sanitizeIntegration(integration) {
  if (!integration) return null;
  const rawMeta = integration.metadata || {};
  const metaCopy = { ...rawMeta };

  // Remove all secret fields from metadata
  delete metaCopy.refreshToken;
  delete metaCopy.clientSecret;
  delete metaCopy.accessToken;
  delete metaCopy.token;

  return {
    id: integration.id,
    provider: integration.provider,
    status: integration.status,
    accountName: integration.accountName,
    connected: integration.status === 'connected',
    connectedAt: integration.updatedAt || integration.createdAt,
    isSystemStorage: Boolean(rawMeta.isSystemStorage),
    metadata: {
      email: metaCopy.email || null,
      displayName: metaCopy.displayName || null,
      picture: metaCopy.picture || null,
      expiresAt: metaCopy.expiresAt || null,
      scope: metaCopy.scope || null
    }
  };
}

module.exports = {
  encryptToken,
  decryptToken,
  sanitizeIntegration
};
