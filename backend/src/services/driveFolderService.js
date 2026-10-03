const prisma = require('../db');

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
 * TASK 1: DEVHUB ROOT FOLDER
 * Ensures the root 'DEVHUB' folder exists in the Owner's Drive at 'root'.
 * Persists the resulting ID in the System Storage integration metadata.
 *
 * @returns {Promise<string>} - Google Drive folder ID for DEVHUB root
 */
async function ensureDriveRoot() {
  const allIntegrations = await prisma.userIntegration.findMany({
    where: { provider: 'google_drive', status: 'connected' }
  });
  const sys = allIntegrations.find(i => i.metadata && i.metadata.isSystemStorage === true);
  if (!sys) {
    throw new Error('Google Drive system storage is not configured or not connected.');
  }

  const token = await getDriveAccessToken();
  const metadata = sys.metadata || {};

  // Check if we already have a cached root folder ID and it's valid in Drive
  if (metadata.driveRootFolderId) {
    const stillValid = await verifyDriveFolderExists(metadata.driveRootFolderId, token);
    if (stillValid) {
      return metadata.driveRootFolderId;
    }
  }

  // Idempotently search or create 'DEVHUB' under 'root'
  const rootId = await findOrCreateDriveFolder('DEVHUB', 'root', token);

  // Persist the root folder ID in System Storage integration metadata
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
 * TASK 2: TEAM MAPPING
 * Ensures the Team folder exists under DEVHUB root.
 * Default name: 'Team'
 *
 * @param {string} [teamName='Team']
 * @returns {Promise<string>} - Google Drive folder ID for the Team folder
 */
async function ensureDriveTeamFolder(teamName = 'Team') {
  const rootId = await ensureDriveRoot();
  const token = await getDriveAccessToken();
  return await findOrCreateDriveFolder(teamName, rootId, token);
}

/**
 * TASK 3: PROJECT FOLDER PROVISIONING
 * Ensures the project folder exists under DEVHUB/Team/<Project Name>.
 * Stores and returns Project.driveFolderId in PostgreSQL.
 *
 * @param {string} projectId
 * @returns {Promise<string>} - Google Drive folder ID for the Project
 */
async function ensureProjectDriveFolder(projectId) {
  if (!projectId) throw new Error('projectId is required');

  const project = await prisma.project.findUnique({
    where: { id: projectId }
  });
  if (!project) throw new Error(`Project not found: ${projectId}`);

  const token = await getDriveAccessToken();

  // If already set, verify it still exists in Drive
  if (project.driveFolderId) {
    const exists = await verifyDriveFolderExists(project.driveFolderId, token);
    if (exists) return project.driveFolderId;
  }

  // Ensure parent Team folder under DEVHUB root
  const teamFolderId = await ensureDriveTeamFolder('Team');

  // Idempotently find or create project folder
  const projectName = project.name.trim() || `project_${project.id.slice(0, 8)}`;
  const projectDriveId = await findOrCreateDriveFolder(projectName, teamFolderId, token);

  // Persist in Project.driveFolderId
  await prisma.project.update({
    where: { id: projectId },
    data: { driveFolderId: projectDriveId }
  });

  return projectDriveId;
}

/**
 * TASK 4: DEVHUB INTERNAL FOLDER MAPPING
 * Ensures a DEVHUB Folder record maps to a Google Drive folder under its project or parent folder.
 * Supports nested Folder.parentId relationships.
 * Stores and returns Folder.driveFolderId in PostgreSQL.
 *
 * @param {string} folderId
 * @returns {Promise<string>} - Google Drive folder ID for the Folder
 */
async function ensureDevhubDriveFolder(folderId) {
  if (!folderId) throw new Error('folderId is required');

  const folder = await prisma.folder.findUnique({
    where: { id: folderId }
  });
  if (!folder) throw new Error(`Folder not found: ${folderId}`);

  const token = await getDriveAccessToken();

  // If already set, verify it still exists in Drive
  if (folder.driveFolderId) {
    const exists = await verifyDriveFolderExists(folder.driveFolderId, token);
    if (exists) return folder.driveFolderId;
  }

  // Determine parent Drive folder:
  // If nested inside a parent DEVHUB folder, ensure parent folder recursively
  // Otherwise, ensure project Drive folder
  let parentDriveFolderId;
  if (folder.parentId) {
    parentDriveFolderId = await ensureDevhubDriveFolder(folder.parentId);
  } else {
    parentDriveFolderId = await ensureProjectDriveFolder(folder.projectId);
  }

  const folderName = folder.name.trim() || `folder_${folder.id.slice(0, 8)}`;
  const folderDriveId = await findOrCreateDriveFolder(folderName, parentDriveFolderId, token);

  // Persist in Folder.driveFolderId
  await prisma.folder.update({
    where: { id: folderId },
    data: { driveFolderId: folderDriveId }
  });

  return folderDriveId;
}

module.exports = {
  findDriveFolder,
  createDriveFolder,
  findOrCreateDriveFolder,
  verifyDriveFolderExists,
  ensureDriveRoot,
  ensureDriveTeamFolder,
  ensureProjectDriveFolder,
  ensureDevhubDriveFolder
};
