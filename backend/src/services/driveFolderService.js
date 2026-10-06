const prisma = require('../db');
const { STORAGE_SCOPES } = require('../constants/storage');

/**
 * Authoritative Google Drive Folder Service for DEVHUB
 *
 * Implements the Final Google Drive Storage Hierarchy:
 *
 * Google Drive
 * └── DEVHUB
 *     ├── Users
 *     │   └── <user> (email or email_id)
 *     │
 *     └── Teams
 *         └── <team> (teamName or teamName_id)
 *
 * Reusable functions:
 * - ensureDevhubRoot()
 * - ensureUsersRoot()
 * - ensureTeamsRoot()
 * - ensureUserDriveFolder(userId)
 * - ensureTeamDriveFolder(teamId)
 *
 * Invariants:
 * 1. Repeated calls return existing folders (idempotent, zero duplicate folders).
 * 2. Drive IDs are stored in database fields (metadata mapping and Folder.driveFolderId).
 * 3. Drive IDs are never exposed to regular users.
 */

/**
 * Resolves Google Drive access token, avoiding circular require at startup.
 */
async function getDriveAccessToken(token) {
  if (token) return token;
  const storageService = require('./storageService');
  return await storageService.googleDriveDriver.getAccessToken();
}

/**
 * Escapes characters for Google Drive v3 search queries (q parameter)
 */
function escapeDriveQueryString(str) {
  if (!str) return '';
  return str.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

/**
 * Search for an active (non-trashed) Google Drive folder by exact name and parent ID.
 *
 * @param {string} name - Name of folder
 * @param {string} parentId - Parent folder ID (e.g. 'root' or another folder ID)
 * @param {string} [token] - Optional Google access token
 * @returns {Promise<string|null>} - Returns folder ID or null if not found
 */
async function findDriveFolder(name, parentId, token) {
  if (!name || !parentId) return null;
  const accessToken = await getDriveAccessToken(token);
  const safeName = escapeDriveQueryString(name.trim());
  const query = `name = '${safeName}' and mimeType = 'application/vnd.google-apps.folder' and '${parentId}' in parents and trashed = false`;

  const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,name,parents)&spaces=drive`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });

  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    const errMsg = errBody.error?.message || `HTTP ${res.status}`;
    if (res.status === 401) throw new Error('Google Drive authentication expired or unauthorized.');
    if (res.status === 403) throw new Error(`Google Drive permission denied: ${errMsg}`);
    throw new Error(`Google Drive search failed (${res.status}): ${errMsg}`);
  }

  const data = await res.json();
  if (data.files && data.files.length > 0) {
    return data.files[0].id;
  }
  return null;
}

/**
 * Creates a new Google Drive folder under a parent ID.
 *
 * @param {string} name - Folder name
 * @param {string} parentId - Parent folder ID
 * @param {string} [token] - Optional Google access token
 * @returns {Promise<string>} - Returns created folder ID
 */
async function createDriveFolder(name, parentId, token) {
  if (!name || !parentId) {
    throw new Error('Folder name and parent ID are required to create a Drive folder.');
  }
  const accessToken = await getDriveAccessToken(token);
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
      parents: [parentId]
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
}

/**
 * Idempotently finds an existing Drive folder or creates it if not found.
 */
async function findOrCreateDriveFolder(name, parentId, token) {
  const existingId = await findDriveFolder(name, parentId, token);
  if (existingId) return existingId;
  return await createDriveFolder(name, parentId, token);
}

/**
 * Checks if a specific folder ID still exists and is not trashed in Google Drive.
 */
async function verifyDriveFolderExists(folderId, token) {
  if (!folderId) return false;
  try {
    const accessToken = await getDriveAccessToken(token);
    const res = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(folderId)}?fields=id,trashed,mimeType`, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    if (!res.ok) return false;
    const data = await res.json();
    return !data.trashed && data.mimeType === 'application/vnd.google-apps.folder';
  } catch (_) {
    return false;
  }
}

/**
 * Helper to fetch and cache system storage integration metadata
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
 * 1. ENSURE DEVHUB ROOT FOLDER
 * Hierarchy: Google Drive -> 'DEVHUB'
 */
async function ensureDevhubRoot(customToken) {
  const sys = await getSystemStorageIntegration();
  const token = await getDriveAccessToken(customToken);
  const metadata = sys.metadata || {};

  // Check cached folder ID
  if (metadata.driveRootFolderId) {
    const valid = await verifyDriveFolderExists(metadata.driveRootFolderId, token);
    if (valid) return metadata.driveRootFolderId;
  }

  // Idempotently find or create 'DEVHUB' under 'root'
  const rootId = await findOrCreateDriveFolder('DEVHUB', 'root', token);

  // Persist in system integration metadata
  await prisma.userIntegration.update({
    where: { id: sys.id },
    data: {
      metadata: {
        ...metadata,
        driveRootFolderId: rootId
      },
      updatedAt: new Date()
    }
  });

  return rootId;
}

/**
 * 2. ENSURE USERS ROOT FOLDER
 * Hierarchy: Google Drive -> DEVHUB -> 'Users'
 */
async function ensureUsersRoot(customToken) {
  const sys = await getSystemStorageIntegration();
  const token = await getDriveAccessToken(customToken);
  const metadata = sys.metadata || {};

  if (metadata.usersRootFolderId) {
    const valid = await verifyDriveFolderExists(metadata.usersRootFolderId, token);
    if (valid) return metadata.usersRootFolderId;
  }

  const devhubRootId = await ensureDevhubRoot(token);
  const usersRootId = await findOrCreateDriveFolder('Users', devhubRootId, token);

  await prisma.userIntegration.update({
    where: { id: sys.id },
    data: {
      metadata: {
        ...metadata,
        usersRootFolderId: usersRootId
      },
      updatedAt: new Date()
    }
  });

  return usersRootId;
}

/**
 * 3. ENSURE TEAMS ROOT FOLDER
 * Hierarchy: Google Drive -> DEVHUB -> 'Teams'
 */
async function ensureTeamsRoot(customToken) {
  const sys = await getSystemStorageIntegration();
  const token = await getDriveAccessToken(customToken);
  const metadata = sys.metadata || {};

  if (metadata.teamsRootFolderId) {
    const valid = await verifyDriveFolderExists(metadata.teamsRootFolderId, token);
    if (valid) return metadata.teamsRootFolderId;
  }

  const devhubRootId = await ensureDevhubRoot(token);
  const teamsRootId = await findOrCreateDriveFolder('Teams', devhubRootId, token);

  await prisma.userIntegration.update({
    where: { id: sys.id },
    data: {
      metadata: {
        ...metadata,
        teamsRootFolderId: teamsRootId
      },
      updatedAt: new Date()
    }
  });

  return teamsRootId;
}

/**
 * 4. ENSURE USER DRIVE FOLDER
 * Hierarchy: Google Drive -> DEVHUB -> Users -> <user>
 *
 * @param {string} userId - DEVHUB user ID
 * @param {string} [customToken]
 * @returns {Promise<string>} - Google Drive folder ID for user
 */
async function ensureUserDriveFolder(userId, customToken) {
  if (!userId) throw new Error('userId is required');

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, name: true }
  });
  if (!user) throw new Error(`User not found: ${userId}`);

  const sys = await getSystemStorageIntegration();
  const token = await getDriveAccessToken(customToken);
  const metadata = sys.metadata || {};
  const userFolderMap = metadata.userFolders || {};

  // Check cached folder ID
  if (userFolderMap[userId]) {
    const valid = await verifyDriveFolderExists(userFolderMap[userId], token);
    if (valid) return userFolderMap[userId];
  }

  const usersRootId = await ensureUsersRoot(token);
  // Folder name: user.email (fallback name)
  const folderName = user.email || `user_${user.id.slice(0, 8)}`;
  const userDriveId = await findOrCreateDriveFolder(folderName, usersRootId, token);

  // Persist in system metadata map
  await prisma.userIntegration.update({
    where: { id: sys.id },
    data: {
      metadata: {
        ...metadata,
        userFolders: {
          ...userFolderMap,
          [userId]: userDriveId
        }
      },
      updatedAt: new Date()
    }
  });

  return userDriveId;
}

/**
 * 5. ENSURE TEAM DRIVE FOLDER
 * Hierarchy: Google Drive -> DEVHUB -> Teams -> <team>
 *
 * @param {string} teamId - DEVHUB team ID
 * @param {string} [customToken]
 * @returns {Promise<string>} - Google Drive folder ID for team
 */
async function ensureTeamDriveFolder(teamId, customToken) {
  if (!teamId) throw new Error('teamId is required');

  const team = await prisma.team.findUnique({
    where: { id: teamId },
    select: { id: true, name: true }
  });
  if (!team) throw new Error(`Team not found: ${teamId}`);

  const sys = await getSystemStorageIntegration();
  const token = await getDriveAccessToken(customToken);
  const metadata = sys.metadata || {};
  const teamFolderMap = metadata.teamFolders || {};

  // Check cached folder ID
  if (teamFolderMap[teamId]) {
    const valid = await verifyDriveFolderExists(teamFolderMap[teamId], token);
    if (valid) return teamFolderMap[teamId];
  }

  const teamsRootId = await ensureTeamsRoot(token);
  // Folder name: team.name
  const folderName = team.name ? `${team.name.trim()} (${team.id.slice(0, 8)})` : `team_${team.id.slice(0, 8)}`;
  const teamDriveId = await findOrCreateDriveFolder(folderName, teamsRootId, token);

  // Persist in system metadata map
  await prisma.userIntegration.update({
    where: { id: sys.id },
    data: {
      metadata: {
        ...metadata,
        teamFolders: {
          ...teamFolderMap,
          [teamId]: teamDriveId
        }
      },
      updatedAt: new Date()
    }
  });

  return teamDriveId;
}

/**
 * 6. ENSURE DEVHUB APPLICATION FOLDER MAPPING
 * Ensures any application Folder record maps to a Google Drive folder
 * respecting PERSONAL vs TEAM hierarchy.
 * Supports arbitrary nested subfolders.
 * Persists result in Folder.driveFolderId in PostgreSQL.
 *
 * @param {string} folderId
 * @param {string} [customToken]
 * @returns {Promise<string>} - Drive folder ID
 */
async function ensureDevhubDriveFolder(folderId, customToken) {
  if (!folderId) throw new Error('folderId is required');

  const folder = await prisma.folder.findUnique({
    where: { id: folderId }
  });
  if (!folder) throw new Error(`Folder not found: ${folderId}`);

  const token = await getDriveAccessToken(customToken);

  // If already mapped and valid, return it
  if (folder.driveFolderId) {
    const valid = await verifyDriveFolderExists(folder.driveFolderId, token);
    if (valid) return folder.driveFolderId;
  }

  // Determine parent Drive folder
  let parentDriveId;
  if (folder.parentId) {
    parentDriveId = await ensureDevhubDriveFolder(folder.parentId, token);
  } else if (folder.storageScope === STORAGE_SCOPES.TEAM && folder.teamId) {
    parentDriveId = await ensureTeamDriveFolder(folder.teamId, token);
  } else {
    // PERSONAL scope default
    parentDriveId = await ensureUserDriveFolder(folder.creatorId, token);
  }

  const safeFolderName = folder.name?.trim() || `folder_${folder.id.slice(0, 8)}`;
  const driveId = await findOrCreateDriveFolder(safeFolderName, parentDriveId, token);

  // Persist in database
  await prisma.folder.update({
    where: { id: folderId },
    data: { driveFolderId: driveId }
  });

  return driveId;
}

/**
 * Sanitizes folder objects before returning to regular users (strips internal Drive IDs)
 */
function sanitizeFolderForClient(folder, user) {
  if (!folder) return null;
  const isPrivileged = user && user.role === 'Admin';
  if (isPrivileged) return folder;

  const copy = { ...folder };
  delete copy.driveFolderId;
  return copy;
}

module.exports = {
  findDriveFolder,
  createDriveFolder,
  findOrCreateDriveFolder,
  verifyDriveFolderExists,
  ensureDevhubRoot,
  ensureDriveRoot: ensureDevhubRoot, // Backwards compatible alias
  ensureUsersRoot,
  ensureTeamsRoot,
  ensureUserDriveFolder,
  ensureTeamDriveFolder,
  ensureDevhubDriveFolder,
  sanitizeFolderForClient
};
