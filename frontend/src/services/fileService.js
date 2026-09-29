import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  serverTimestamp
} from 'firebase/firestore';
import {
  ref,
  uploadBytes,
  getDownloadURL,
  deleteObject
} from 'firebase/storage';
import { db, storage, auth } from '../lib/firebase';
import { logActivity } from './activityService';

const toIso = (timestamp) => {
  if (!timestamp) return null;
  if (timestamp.toDate) return timestamp.toDate().toISOString();
  if (typeof timestamp === 'string') return timestamp;
  return new Date(timestamp).toISOString();
};

const generateSafeFileName = (name) => {
  return name.replace(/[^a-zA-Z0-9.-]/g, '_');
};

/**
 * Fetches files by project and optional folder.
 */
export const getFiles = async (projectId = null, folderId = undefined) => {
  const currentUser = auth.currentUser;
  if (!currentUser) return [];

  let q;
  if (projectId) {
    if (folderId !== undefined) {
      const targetFolder = folderId === 'null' || !folderId ? null : folderId;
      q = query(
        collection(db, 'files'),
        where('projectId', '==', projectId),
        where('folderId', '==', targetFolder)
      );
    } else {
      q = query(
        collection(db, 'files'),
        where('projectId', '==', projectId)
      );
    }
  } else {
    // If no projectId provided, fetch files from all accessible projects
    const userProjectsSnap = await getDocs(query(
      collection(db, 'projects'),
      where('memberUids', 'array-contains', currentUser.uid)
    ));
    const projectIds = userProjectsSnap.docs.map(d => d.id);
    if (projectIds.length === 0) return [];

    const chunks = [];
    for (let i = 0; i < projectIds.length; i += 30) {
      chunks.push(projectIds.slice(i, i + 30));
    }

    const allFiles = [];
    for (const chunk of chunks) {
      const chunkSnap = await getDocs(query(
        collection(db, 'files'),
        where('projectId', 'in', chunk)
      ));
      chunkSnap.forEach(d => allFiles.push({ id: d.id, ...d.data() }));
    }

    return allFiles.map(f => ({
      ...f,
      createdAt: toIso(f.createdAt),
      updatedAt: toIso(f.updatedAt)
    })).sort((a, b) => a.name.localeCompare(b.name));
  }

  const snap = await getDocs(q);
  return snap.docs.map(d => ({
    id: d.id,
    ...d.data(),
    createdAt: toIso(d.data().createdAt),
    updatedAt: toIso(d.data().updatedAt)
  })).sort((a, b) => a.name.localeCompare(b.name));
};

/**
 * Fetches folders by project and optional parent.
 */
export const getFolders = async (projectId = null, parentId = undefined) => {
  const currentUser = auth.currentUser;
  if (!currentUser) return [];

  let q;
  if (projectId) {
    if (parentId !== undefined) {
      const targetParent = parentId === 'null' || !parentId ? null : parentId;
      q = query(
        collection(db, 'folders'),
        where('projectId', '==', projectId),
        where('parentId', '==', targetParent)
      );
    } else {
      q = query(
        collection(db, 'folders'),
        where('projectId', '==', projectId)
      );
    }
  } else {
    q = collection(db, 'folders');
  }

  const snap = await getDocs(q);
  return snap.docs.map(d => ({
    id: d.id,
    ...d.data(),
    createdAt: toIso(d.data().createdAt),
    updatedAt: toIso(d.data().updatedAt)
  })).sort((a, b) => a.name.localeCompare(b.name));
};

/**
 * Creates a folder.
 */
export const createFolder = async ({ name, projectId, parentId }) => {
  const currentUser = auth.currentUser;
  if (!currentUser) throw new Error('Unauthenticated');
  if (!name || !name.trim()) throw new Error('Folder name is required');
  if (!projectId) throw new Error('projectId is required');

  const folderRef = doc(collection(db, 'folders'));
  const folderData = {
    name: name.trim(),
    projectId,
    parentId: parentId || null,
    creatorId: currentUser.uid,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  };

  await setDoc(folderRef, folderData);

  await logActivity({
    action: 'Created',
    entityType: 'Folder',
    entityId: folderRef.id,
    projectId,
    metadata: { name: folderData.name }
  });

  return { id: folderRef.id, ...folderData };
};

/**
 * Updates a folder.
 */
export const updateFolder = async (folderId, { name, parentId }) => {
  const currentUser = auth.currentUser;
  if (!currentUser) throw new Error('Unauthenticated');

  const folderRef = doc(db, 'folders', folderId);
  const snap = await getDoc(folderRef);
  if (!snap.exists()) throw new Error('Folder not found');

  const updateData = { updatedAt: serverTimestamp() };
  if (name !== undefined) updateData.name = name.trim();
  if (parentId !== undefined) updateData.parentId = parentId || null;

  await updateDoc(folderRef, updateData);

  await logActivity({
    action: 'Updated',
    entityType: 'Folder',
    entityId: folderId,
    projectId: snap.data().projectId,
    metadata: { name: updateData.name || snap.data().name }
  });

  return { id: folderId, ...snap.data(), ...updateData };
};

/**
 * Deletes a folder if empty.
 */
export const deleteFolder = async (folderId) => {
  const currentUser = auth.currentUser;
  if (!currentUser) throw new Error('Unauthenticated');

  const folderRef = doc(db, 'folders', folderId);
  const snap = await getDoc(folderRef);
  if (!snap.exists()) throw new Error('Folder not found');
  const data = snap.data();

  // Check children folders
  const childFoldersSnap = await getDocs(query(collection(db, 'folders'), where('parentId', '==', folderId)));
  if (!childFoldersSnap.empty) {
    throw new Error('Cannot delete folder because it contains subfolders');
  }

  // Check files
  const childFilesSnap = await getDocs(query(collection(db, 'files'), where('folderId', '==', folderId)));
  if (!childFilesSnap.empty) {
    throw new Error('Cannot delete folder because it contains files');
  }

  await deleteDoc(folderRef);

  await logActivity({
    action: 'Deleted',
    entityType: 'Folder',
    entityId: folderId,
    projectId: data.projectId,
    metadata: { name: data.name }
  });

  return { success: true };
};

/**
 * Uploads binary files to Firebase Storage and stores metadata in Firestore.
 */
export const uploadFiles = async (projectId, folderId, filesList) => {
  const currentUser = auth.currentUser;
  if (!currentUser) throw new Error('Unauthenticated');
  if (!projectId) throw new Error('projectId is required');
  if (!filesList || filesList.length === 0) throw new Error('No files provided');

  const uploaderInfo = {
    id: currentUser.uid,
    name: currentUser.displayName || 'User',
    email: currentUser.email,
    avatarUrl: currentUser.photoURL || null
  };

  const uploadedRecords = [];

  for (const file of filesList) {
    const fileId = doc(collection(db, 'files')).id;
    const safeName = generateSafeFileName(file.name);
    const storagePath = folderId && folderId !== 'null'
      ? `projects/${projectId}/folders/${folderId}/${fileId}-${safeName}`
      : `projects/${projectId}/files/${fileId}-${safeName}`;

    const storageRef = ref(storage, storagePath);

    // Upload raw binary to Cloud Storage
    await uploadBytes(storageRef, file, {
      contentType: file.type || 'application/octet-stream'
    });

    // Obtain download URL
    const downloadUrl = await getDownloadURL(storageRef);

    const fileDocRef = doc(db, 'files', fileId);
    const fileData = {
      id: fileId,
      name: file.name,
      type: file.type || 'application/octet-stream',
      size: file.size,
      storagePath,
      downloadUrl,
      projectId,
      folderId: folderId && folderId !== 'null' ? folderId : null,
      uploaderId: currentUser.uid,
      uploader: uploaderInfo,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    };

    await setDoc(fileDocRef, fileData);

    await logActivity({
      action: 'Uploaded',
      entityType: 'File',
      entityId: fileId,
      projectId,
      metadata: { name: file.name, size: file.size }
    });

    uploadedRecords.push({
      ...fileData,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
  }

  return uploadedRecords;
};

/**
 * Obtains a direct download URL for a file.
 */
export const downloadFile = async (fileId) => {
  const fileRef = doc(db, 'files', fileId);
  const snap = await getDoc(fileRef);
  if (!snap.exists()) throw new Error('File not found');

  const data = snap.data();
  if (data.downloadUrl) {
    return data.downloadUrl;
  }

  const storageRef = ref(storage, data.storagePath);
  const url = await getDownloadURL(storageRef);
  await updateDoc(fileRef, { downloadUrl: url });
  return url;
};

/**
 * Updates file metadata.
 */
export const updateFile = async (fileId, { name, folderId }) => {
  const currentUser = auth.currentUser;
  if (!currentUser) throw new Error('Unauthenticated');

  const fileRef = doc(db, 'files', fileId);
  const snap = await getDoc(fileRef);
  if (!snap.exists()) throw new Error('File not found');

  const updateData = { updatedAt: serverTimestamp() };
  if (name !== undefined) updateData.name = name.trim();
  if (folderId !== undefined) updateData.folderId = folderId && folderId !== 'null' ? folderId : null;

  await updateDoc(fileRef, updateData);

  await logActivity({
    action: 'Updated',
    entityType: 'File',
    entityId: fileId,
    projectId: snap.data().projectId,
    metadata: { name: updateData.name || snap.data().name }
  });

  return { id: fileId, ...snap.data(), ...updateData };
};

/**
 * Deletes a file from Cloud Storage and Firestore.
 */
export const deleteFile = async (fileId) => {
  const currentUser = auth.currentUser;
  if (!currentUser) throw new Error('Unauthenticated');

  const fileRef = doc(db, 'files', fileId);
  const snap = await getDoc(fileRef);
  if (!snap.exists()) throw new Error('File not found');
  const data = snap.data();

  // Delete from Cloud Storage
  try {
    const storageRef = ref(storage, data.storagePath);
    await deleteObject(storageRef);
  } catch (err) {
    console.warn('Storage object deletion warning:', err.message);
  }

  await deleteDoc(fileRef);

  await logActivity({
    action: 'Deleted',
    entityType: 'File',
    entityId: fileId,
    projectId: data.projectId,
    metadata: { name: data.name }
  });

  return { success: true };
};
