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
  serverTimestamp,
  arrayUnion,
  arrayRemove,
  writeBatch
} from 'firebase/firestore';
import { db, auth } from '../lib/firebase';
import { logActivity } from './activityService';

/**
 * Normalizes Firestore date values to ISO string.
 */
const toIso = (timestamp) => {
  if (!timestamp) return null;
  if (timestamp.toDate) return timestamp.toDate().toISOString();
  if (typeof timestamp === 'string') return timestamp;
  return new Date(timestamp).toISOString();
};

/**
 * Fetches all projects the current user belongs to or owns.
 */
export const getProjects = async () => {
  const currentUser = auth.currentUser;
  if (!currentUser) return [];

  // Query projects where memberUids contains the current user
  const q = query(
    collection(db, 'projects'),
    where('memberUids', 'array-contains', currentUser.uid)
  );

  const snap = await getDocs(q);
  const projects = [];

  for (const projectDoc of snap.docs) {
    const data = projectDoc.data();
    
    // Fetch members subcollection
    const membersSnap = await getDocs(collection(db, 'projects', projectDoc.id, 'members'));
    const members = membersSnap.docs.map(mDoc => ({
      id: mDoc.id,
      ...mDoc.data(),
      joinedAt: toIso(mDoc.data().joinedAt)
    }));

    // Fetch tasks for progress calculation
    const tasksSnap = await getDocs(query(collection(db, 'tasks'), where('projectId', '==', projectDoc.id)));
    const tasks = tasksSnap.docs.map(tDoc => ({
      id: tDoc.id,
      status: tDoc.data().status
    }));

    // Fetch open bugs count
    const bugsSnap = await getDocs(query(
      collection(db, 'bugs'), 
      where('projectId', '==', projectDoc.id),
      where('status', 'in', ['Open', 'In Progress'])
    ));

    const isOwner = data.ownerId === currentUser.uid;
    const currentMember = members.find(m => m.userId === currentUser.uid);
    const currentUserRole = isOwner ? 'Admin' : (currentMember?.role || 'Viewer');

    projects.push({
      id: projectDoc.id,
      ...data,
      startDate: toIso(data.startDate),
      dueDate: toIso(data.dueDate),
      createdAt: toIso(data.createdAt),
      updatedAt: toIso(data.updatedAt),
      owner: data.owner || { id: data.ownerId, name: 'Project Owner', email: '' },
      members,
      tasks,
      _count: {
        bugs: bugsSnap.size
      },
      currentUserRole
    });
  }

  return projects;
};

/**
 * Fetches single project detail by ID.
 */
export const getProjectById = async (projectId) => {
  const currentUser = auth.currentUser;
  if (!currentUser) throw new Error('Unauthenticated');

  const projectRef = doc(db, 'projects', projectId);
  const projectSnap = await getDoc(projectRef);

  if (!projectSnap.exists()) {
    throw new Error('Project not found');
  }

  const data = projectSnap.data();

  // Fetch members subcollection
  const membersSnap = await getDocs(collection(db, 'projects', projectId, 'members'));
  const members = membersSnap.docs.map(mDoc => ({
    id: mDoc.id,
    ...mDoc.data(),
    joinedAt: toIso(mDoc.data().joinedAt)
  }));

  const isOwner = data.ownerId === currentUser.uid;
  const currentMember = members.find(m => m.userId === currentUser.uid);

  if (!isOwner && !currentMember) {
    throw new Error('Forbidden: Not a member of this project');
  }

  const currentUserRole = isOwner ? 'Admin' : (currentMember?.role || 'Viewer');

  return {
    id: projectSnap.id,
    ...data,
    startDate: toIso(data.startDate),
    dueDate: toIso(data.dueDate),
    createdAt: toIso(data.createdAt),
    updatedAt: toIso(data.updatedAt),
    owner: data.owner || { id: data.ownerId, name: 'Owner' },
    members,
    currentUserRole
  };
};

/**
 * Creates a new project.
 */
export const createProject = async ({ name, description, status, priority, category, startDate, dueDate }) => {
  const currentUser = auth.currentUser;
  if (!currentUser) throw new Error('Unauthenticated');

  const trimmedName = name.trim();
  const projectRef = doc(collection(db, 'projects'));
  const projectId = projectRef.id;

  const ownerInfo = {
    id: currentUser.uid,
    name: currentUser.displayName || 'Owner',
    email: currentUser.email,
    avatarUrl: currentUser.photoURL || null
  };

  const projectData = {
    name: trimmedName,
    description: description?.trim() || null,
    status: status?.trim() || 'Active',
    priority: priority?.trim() || 'Medium',
    category: category?.trim() || null,
    startDate: startDate ? new Date(startDate) : null,
    dueDate: dueDate ? new Date(dueDate) : null,
    ownerId: currentUser.uid,
    owner: ownerInfo,
    memberUids: [currentUser.uid],
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  };

  const batch = writeBatch(db);
  batch.set(projectRef, projectData);

  // Set owner as Admin in members subcollection
  const memberRef = doc(db, 'projects', projectId, 'members', currentUser.uid);
  batch.set(memberRef, {
    id: `${projectId}_${currentUser.uid}`,
    projectId,
    userId: currentUser.uid,
    role: 'Admin',
    joinedAt: serverTimestamp(),
    user: ownerInfo
  });

  await batch.commit();

  await logActivity({
    action: 'Created',
    entityType: 'Project',
    entityId: projectId,
    projectId,
    metadata: { name: trimmedName }
  });

  return getProjectById(projectId);
};

/**
 * Updates an existing project.
 */
export const updateProject = async (projectId, updateFields) => {
  const currentUser = auth.currentUser;
  if (!currentUser) throw new Error('Unauthenticated');

  const projectRef = doc(db, 'projects', projectId);
  const cleanUpdate = {
    updatedAt: serverTimestamp()
  };

  if (updateFields.name !== undefined) cleanUpdate.name = updateFields.name.trim();
  if (updateFields.description !== undefined) cleanUpdate.description = updateFields.description?.trim() || null;
  if (updateFields.status !== undefined) cleanUpdate.status = updateFields.status?.trim() || 'Active';
  if (updateFields.priority !== undefined) cleanUpdate.priority = updateFields.priority?.trim() || 'Medium';
  if (updateFields.category !== undefined) cleanUpdate.category = updateFields.category?.trim() || null;
  if (updateFields.startDate !== undefined) cleanUpdate.startDate = updateFields.startDate ? new Date(updateFields.startDate) : null;
  if (updateFields.dueDate !== undefined) cleanUpdate.dueDate = updateFields.dueDate ? new Date(updateFields.dueDate) : null;

  await updateDoc(projectRef, cleanUpdate);

  await logActivity({
    action: 'Updated',
    entityType: 'Project',
    entityId: projectId,
    projectId,
    metadata: { name: cleanUpdate.name || projectId }
  });

  return getProjectById(projectId);
};

/**
 * Deletes a project and its subcollections.
 */
export const deleteProject = async (projectId) => {
  const currentUser = auth.currentUser;
  if (!currentUser) throw new Error('Unauthenticated');

  const projectRef = doc(db, 'projects', projectId);
  const snap = await getDoc(projectRef);
  if (!snap.exists()) throw new Error('Project not found');

  const data = snap.data();

  // Delete all project members subcollection
  const membersSnap = await getDocs(collection(db, 'projects', projectId, 'members'));
  const batch = writeBatch(db);
  membersSnap.forEach(mDoc => batch.delete(mDoc.ref));
  batch.delete(projectRef);

  await batch.commit();

  await logActivity({
    action: 'Deleted',
    entityType: 'Project',
    entityId: projectId,
    projectId,
    metadata: { name: data.name }
  });

  return { success: true };
};

/**
 * Adds a member to a project.
 */
export const addProjectMember = async (projectId, userId, role = 'Viewer') => {
  const currentUser = auth.currentUser;
  if (!currentUser) throw new Error('Unauthenticated');

  const targetUserDoc = await getDoc(doc(db, 'users', userId));
  if (!targetUserDoc.exists()) throw new Error('Target user not found');
  const targetUser = targetUserDoc.data();

  const memberRef = doc(db, 'projects', projectId, 'members', userId);
  const projectRef = doc(db, 'projects', projectId);

  const memberData = {
    id: `${projectId}_${userId}`,
    projectId,
    userId,
    role,
    joinedAt: serverTimestamp(),
    user: {
      id: userId,
      name: targetUser.name || 'User',
      email: targetUser.email || '',
      avatarUrl: targetUser.avatarUrl || null
    }
  };

  const batch = writeBatch(db);
  batch.set(memberRef, memberData);
  batch.update(projectRef, {
    memberUids: arrayUnion(userId),
    updatedAt: serverTimestamp()
  });

  await batch.commit();

  await logActivity({
    action: 'Added',
    entityType: 'ProjectMember',
    entityId: memberRef.id,
    projectId,
    metadata: { addedUserName: targetUser.name }
  });

  return memberData;
};

/**
 * Removes a member from a project and safely unassigns their tasks.
 */
export const removeProjectMember = async (projectId, userId) => {
  const currentUser = auth.currentUser;
  if (!currentUser) throw new Error('Unauthenticated');

  const memberRef = doc(db, 'projects', projectId, 'members', userId);
  const projectRef = doc(db, 'projects', projectId);

  // Unassign tasks assigned to this user in this project
  const tasksQuery = query(
    collection(db, 'tasks'),
    where('projectId', '==', projectId),
    where('assigneeId', '==', userId)
  );
  const tasksSnap = await getDocs(tasksQuery);

  const batch = writeBatch(db);
  tasksSnap.forEach(tDoc => {
    batch.update(tDoc.ref, {
      assigneeId: null,
      assignee: null,
      updatedAt: serverTimestamp()
    });
  });

  batch.delete(memberRef);
  batch.update(projectRef, {
    memberUids: arrayRemove(userId),
    updatedAt: serverTimestamp()
  });

  await batch.commit();

  await logActivity({
    action: 'Removed',
    entityType: 'ProjectMember',
    entityId: `${projectId}_${userId}`,
    projectId,
    metadata: { removedUserId: userId }
  });

  return { success: true };
};

/**
 * Search users by name or email.
 */
export const searchUsers = async (searchQuery) => {
  if (!searchQuery || searchQuery.trim().length < 2) return [];
  const qTerm = searchQuery.toLowerCase().trim();

  const usersSnap = await getDocs(collection(db, 'users'));
  const results = [];

  usersSnap.forEach(uDoc => {
    const data = uDoc.data();
    const nameMatch = data.name?.toLowerCase().includes(qTerm);
    const emailMatch = data.email?.toLowerCase().includes(qTerm);
    if (nameMatch || emailMatch) {
      results.push({
        id: uDoc.id,
        name: data.name,
        email: data.email,
        avatarUrl: data.avatarUrl
      });
    }
  });

  return results.slice(0, 10);
};
