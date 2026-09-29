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
import { db, auth } from '../lib/firebase';
import { logActivity } from './activityService';

const toIso = (timestamp) => {
  if (!timestamp) return null;
  if (timestamp.toDate) return timestamp.toDate().toISOString();
  if (typeof timestamp === 'string') return timestamp;
  return new Date(timestamp).toISOString();
};

/**
 * Fetches tasks. If projectId is provided, filters by that project.
 * Otherwise, fetches tasks belonging to projects the user is a member of.
 */
export const getTasks = async (filter = {}) => {
  const currentUser = auth.currentUser;
  if (!currentUser) return [];

  const { projectId, assigneeId } = filter;
  let q;

  if (projectId) {
    q = query(
      collection(db, 'tasks'),
      where('projectId', '==', projectId)
    );
  } else if (assigneeId) {
    q = query(
      collection(db, 'tasks'),
      where('assigneeId', '==', assigneeId)
    );
  } else {
    // Fetch all tasks for projects the user has access to
    // First get accessible project IDs
    const userProjectsSnap = await getDocs(query(
      collection(db, 'projects'),
      where('memberUids', 'array-contains', currentUser.uid)
    ));
    const projectIds = userProjectsSnap.docs.map(d => d.id);
    if (projectIds.length === 0) return [];

    // Firestore 'in' query supports up to 30 elements
    const chunks = [];
    for (let i = 0; i < projectIds.length; i += 30) {
      chunks.push(projectIds.slice(i, i + 30));
    }

    const allTasks = [];
    for (const chunk of chunks) {
      const chunkQuery = query(
        collection(db, 'tasks'),
        where('projectId', 'in', chunk)
      );
      const chunkSnap = await getDocs(chunkQuery);
      chunkSnap.forEach(docSnap => {
        allTasks.push({ id: docSnap.id, ...docSnap.data() });
      });
    }

    return allTasks.map(t => ({
      ...t,
      startDate: toIso(t.startDate),
      dueDate: toIso(t.dueDate),
      completedAt: toIso(t.completedAt),
      createdAt: toIso(t.createdAt),
      updatedAt: toIso(t.updatedAt)
    })).sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
  }

  const snap = await getDocs(q);
  const tasks = snap.docs.map(docSnap => {
    const data = docSnap.data();
    return {
      id: docSnap.id,
      ...data,
      startDate: toIso(data.startDate),
      dueDate: toIso(data.dueDate),
      completedAt: toIso(data.completedAt),
      createdAt: toIso(data.createdAt),
      updatedAt: toIso(data.updatedAt)
    };
  });

  return tasks.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
};

/**
 * Fetches a single task by ID.
 */
export const getTaskById = async (taskId) => {
  const taskRef = doc(db, 'tasks', taskId);
  const snap = await getDoc(taskRef);
  if (!snap.exists()) throw new Error('Task not found');
  const data = snap.data();
  return {
    id: snap.id,
    ...data,
    startDate: toIso(data.startDate),
    dueDate: toIso(data.dueDate),
    completedAt: toIso(data.completedAt),
    createdAt: toIso(data.createdAt),
    updatedAt: toIso(data.updatedAt)
  };
};

/**
 * Creates a new task.
 */
export const createTask = async ({ projectId, title, description, status, priority, assigneeId, startDate, dueDate }) => {
  const currentUser = auth.currentUser;
  if (!currentUser) throw new Error('Unauthenticated');
  if (!projectId || !title || !title.trim()) throw new Error('projectId and title are required');

  // Fetch project details for denormalization
  const projectSnap = await getDoc(doc(db, 'projects', projectId));
  if (!projectSnap.exists()) throw new Error('Project not found');
  const projectData = projectSnap.data();

  // If assigneeId provided, fetch user details
  let assigneeData = null;
  if (assigneeId) {
    const assigneeSnap = await getDoc(doc(db, 'users', assigneeId));
    if (assigneeSnap.exists()) {
      const u = assigneeSnap.data();
      assigneeData = {
        id: assigneeSnap.id,
        name: u.name,
        email: u.email,
        avatarUrl: u.avatarUrl || null
      };
    }
  }

  const taskRef = doc(collection(db, 'tasks'));
  const taskStatus = status?.trim() || 'To Do';
  const isDone = taskStatus === 'Done' || taskStatus === 'Completed';

  const taskData = {
    projectId,
    title: title.trim(),
    description: description?.trim() || null,
    status: taskStatus,
    priority: priority?.trim() || 'Medium',
    assigneeId: assigneeId || null,
    creatorId: currentUser.uid,
    startDate: startDate ? new Date(startDate) : null,
    dueDate: dueDate ? new Date(dueDate) : null,
    completedAt: isDone ? new Date() : null,
    project: { id: projectId, name: projectData.name },
    creator: {
      id: currentUser.uid,
      name: currentUser.displayName || 'User',
      email: currentUser.email,
      avatarUrl: currentUser.photoURL || null
    },
    assignee: assigneeData,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  };

  await setDoc(taskRef, taskData);

  await logActivity({
    action: 'Created',
    entityType: 'Task',
    entityId: taskRef.id,
    projectId,
    metadata: { title: taskData.title, status: taskData.status }
  });

  return getTaskById(taskRef.id);
};

/**
 * Updates an existing task.
 */
export const updateTask = async (taskId, updateFields) => {
  const currentUser = auth.currentUser;
  if (!currentUser) throw new Error('Unauthenticated');

  const taskRef = doc(db, 'tasks', taskId);
  const snap = await getDoc(taskRef);
  if (!snap.exists()) throw new Error('Task not found');
  const currentTask = snap.data();

  const cleanUpdate = {
    updatedAt: serverTimestamp()
  };

  if (updateFields.title !== undefined) cleanUpdate.title = updateFields.title.trim();
  if (updateFields.description !== undefined) cleanUpdate.description = updateFields.description?.trim() || null;
  if (updateFields.priority !== undefined) cleanUpdate.priority = updateFields.priority?.trim() || 'Medium';
  if (updateFields.startDate !== undefined) cleanUpdate.startDate = updateFields.startDate ? new Date(updateFields.startDate) : null;
  if (updateFields.dueDate !== undefined) cleanUpdate.dueDate = updateFields.dueDate ? new Date(updateFields.dueDate) : null;

  if (updateFields.assigneeId !== undefined) {
    if (updateFields.assigneeId) {
      const uSnap = await getDoc(doc(db, 'users', updateFields.assigneeId));
      if (uSnap.exists()) {
        const u = uSnap.data();
        cleanUpdate.assigneeId = updateFields.assigneeId;
        cleanUpdate.assignee = { id: uSnap.id, name: u.name, email: u.email, avatarUrl: u.avatarUrl || null };
      }
    } else {
      cleanUpdate.assigneeId = null;
      cleanUpdate.assignee = null;
    }
  }

  if (updateFields.status !== undefined) {
    const newStatus = updateFields.status.trim();
    const isDone = newStatus === 'Done' || newStatus === 'Completed';
    const wasDone = currentTask.status === 'Done' || currentTask.status === 'Completed';

    cleanUpdate.status = newStatus;
    if (isDone && !wasDone) {
      cleanUpdate.completedAt = new Date();
    } else if (!isDone && wasDone) {
      cleanUpdate.completedAt = null;
    }
  }

  await updateDoc(taskRef, cleanUpdate);

  const action = cleanUpdate.status === 'Done' && currentTask.status !== 'Done' ? 'Completed' : 'Updated';
  await logActivity({
    action,
    entityType: 'Task',
    entityId: taskId,
    projectId: currentTask.projectId,
    metadata: { title: cleanUpdate.title || currentTask.title, status: cleanUpdate.status || currentTask.status }
  });

  return getTaskById(taskId);
};

/**
 * Deletes a task.
 */
export const deleteTask = async (taskId) => {
  const currentUser = auth.currentUser;
  if (!currentUser) throw new Error('Unauthenticated');

  const taskRef = doc(db, 'tasks', taskId);
  const snap = await getDoc(taskRef);
  if (!snap.exists()) throw new Error('Task not found');
  const data = snap.data();

  await deleteDoc(taskRef);

  await logActivity({
    action: 'Deleted',
    entityType: 'Task',
    entityId: taskId,
    projectId: data.projectId,
    metadata: { title: data.title }
  });

  return { success: true };
};
