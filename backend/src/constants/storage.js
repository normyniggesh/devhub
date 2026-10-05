/**
 * Authoritative Single Source of Truth for DEVHUB Storage & Team Architecture
 */

// Byte multipliers (BigInt)
const ONE_KB = 1024n;
const ONE_MB = 1024n * ONE_KB;
const ONE_GB = 1024n * ONE_MB;
const ONE_TB = 1024n * ONE_GB;

const STORAGE_CONSTANTS = {
  // Quota Defaults (Bytes as BigInt for database precision)
  DEFAULT_PERSONAL_STORAGE_BYTES: 5n * ONE_GB,        // 5 GB
  DEFAULT_TEAM_STORAGE_BYTES: 10n * ONE_GB,           // 10 GB
  GLOBAL_PHYSICAL_CAPACITY_BYTES: 5n * ONE_TB,        // 5 TB
  GLOBAL_SAFETY_BUFFER_BYTES: 50n * ONE_GB,           // 50 GB safety buffer

  // Human-readable numerical values
  DEFAULT_PERSONAL_STORAGE_GB: 5,
  DEFAULT_TEAM_STORAGE_GB: 10,
  GLOBAL_PHYSICAL_CAPACITY_TB: 5,
  GLOBAL_SAFETY_BUFFER_GB: 50,

  // Storage Scopes
  STORAGE_SCOPES: {
    PERSONAL: 'PERSONAL',
    TEAM: 'TEAM'
  },

  // Team Roles
  TEAM_ROLES: {
    LEADER: 'Leader',
    MEMBER: 'Member'
  },

  // System Roles
  USER_ROLES: {
    ADMIN: 'Admin',
    USER: 'User'
  },

  // Storage Providers
  STORAGE_PROVIDERS: {
    DEVHUB_CLOUD: 'google_drive',
    S3: 's3'
  }
};

module.exports = STORAGE_CONSTANTS;
