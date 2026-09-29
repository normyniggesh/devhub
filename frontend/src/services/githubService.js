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

// ================= REPOSITORIES =================
export const getRepositories = async (projectId = null) => {
  let q;
  if (projectId) {
    q = query(collection(db, 'repositories'), where('projectId', '==', projectId));
  } else {
    q = collection(db, 'repositories');
  }

  const snap = await getDocs(q);
  return snap.docs.map(d => ({
    id: d.id,
    ...d.data(),
    createdAt: toIso(d.data().createdAt)
  }));
};

export const createRepository = async ({ name, owner, url, projectId, defaultBranch }) => {
  const currentUser = auth.currentUser;
  if (!currentUser) throw new Error('Unauthenticated');

  const pSnap = await getDoc(doc(db, 'projects', projectId));
  const projectName = pSnap.exists() ? pSnap.data().name : 'Project';

  const repoRef = doc(collection(db, 'repositories'));
  const data = {
    name: name.trim(),
    owner: owner.trim(),
    url: url.trim(),
    projectId,
    defaultBranch: defaultBranch?.trim() || 'main',
    project: { id: projectId, name: projectName },
    createdAt: serverTimestamp()
  };

  await setDoc(repoRef, data);

  await logActivity({
    action: 'Created',
    entityType: 'Repository',
    entityId: repoRef.id,
    projectId,
    metadata: { name: data.name, url: data.url }
  });

  return { id: repoRef.id, ...data };
};

export const updateRepository = async (id, updateFields) => {
  const currentUser = auth.currentUser;
  if (!currentUser) throw new Error('Unauthenticated');

  const repoRef = doc(db, 'repositories', id);
  const snap = await getDoc(repoRef);
  if (!snap.exists()) throw new Error('Repository not found');

  const updateData = {};
  if (updateFields.name !== undefined) updateData.name = updateFields.name.trim();
  if (updateFields.owner !== undefined) updateData.owner = updateFields.owner.trim();
  if (updateFields.url !== undefined) updateData.url = updateFields.url.trim();
  if (updateFields.defaultBranch !== undefined) updateData.defaultBranch = updateFields.defaultBranch?.trim() || 'main';

  await updateDoc(repoRef, updateData);

  await logActivity({
    action: 'Updated',
    entityType: 'Repository',
    entityId: id,
    projectId: snap.data().projectId,
    metadata: { name: updateData.name || snap.data().name }
  });

  return { id, ...snap.data(), ...updateData };
};

export const deleteRepository = async (id) => {
  const currentUser = auth.currentUser;
  if (!currentUser) throw new Error('Unauthenticated');

  const repoRef = doc(db, 'repositories', id);
  const snap = await getDoc(repoRef);
  if (!snap.exists()) throw new Error('Repository not found');
  const data = snap.data();

  // Cascade delete PRs and deployments associated with this repository
  const prsSnap = await getDocs(query(collection(db, 'pullRequests'), where('repositoryId', '==', id)));
  prsSnap.forEach(async (d) => await deleteDoc(d.ref));

  const depsSnap = await getDocs(query(collection(db, 'deployments'), where('repositoryId', '==', id)));
  depsSnap.forEach(async (d) => await deleteDoc(d.ref));

  await deleteDoc(repoRef);

  await logActivity({
    action: 'Deleted',
    entityType: 'Repository',
    entityId: id,
    projectId: data.projectId,
    metadata: { name: data.name }
  });

  return { success: true };
};

// ================= PULL REQUESTS =================
export const getPullRequests = async (projectId = null, repositoryId = null) => {
  let q;
  if (projectId && repositoryId) {
    q = query(
      collection(db, 'pullRequests'),
      where('projectId', '==', projectId),
      where('repositoryId', '==', repositoryId)
    );
  } else if (projectId) {
    q = query(collection(db, 'pullRequests'), where('projectId', '==', projectId));
  } else if (repositoryId) {
    q = query(collection(db, 'pullRequests'), where('repositoryId', '==', repositoryId));
  } else {
    q = collection(db, 'pullRequests');
  }

  const snap = await getDocs(q);
  return snap.docs.map(d => ({
    id: d.id,
    ...d.data(),
    createdAt: toIso(d.data().createdAt),
    updatedAt: toIso(d.data().updatedAt)
  }));
};

export const createPullRequest = async ({ repositoryId, projectId, title, number, status, authorGithubUsername, authorId }) => {
  const currentUser = auth.currentUser;
  if (!currentUser) throw new Error('Unauthenticated');

  const repoSnap = await getDoc(doc(db, 'repositories', repositoryId));
  const repoName = repoSnap.exists() ? repoSnap.data().name : 'Repository';

  const prRef = doc(collection(db, 'pullRequests'));
  const data = {
    repositoryId,
    projectId,
    title: title.trim(),
    number: parseInt(number, 10),
    status: status?.trim() || 'Open',
    authorGithubUsername: authorGithubUsername?.trim() || null,
    authorId: authorId || currentUser.uid,
    repository: { id: repositoryId, name: repoName },
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  };

  await setDoc(prRef, data);

  await logActivity({
    action: 'Created',
    entityType: 'PullRequest',
    entityId: prRef.id,
    projectId,
    metadata: { title: data.title, number: data.number }
  });

  return { id: prRef.id, ...data };
};

export const updatePullRequest = async (id, updateFields) => {
  const currentUser = auth.currentUser;
  if (!currentUser) throw new Error('Unauthenticated');

  const prRef = doc(db, 'pullRequests', id);
  const snap = await getDoc(prRef);
  if (!snap.exists()) throw new Error('Pull request not found');

  const updateData = { updatedAt: serverTimestamp() };
  if (updateFields.title !== undefined) updateData.title = updateFields.title.trim();
  if (updateFields.status !== undefined) updateData.status = updateFields.status.trim();
  if (updateFields.authorGithubUsername !== undefined) updateData.authorGithubUsername = updateFields.authorGithubUsername?.trim() || null;

  await updateDoc(prRef, updateData);

  const action = (updateData.status === 'Merged' || updateData.status === 'Closed') ? 'Completed' : 'Updated';
  await logActivity({
    action,
    entityType: 'PullRequest',
    entityId: id,
    projectId: snap.data().projectId,
    metadata: { title: updateData.title || snap.data().title, status: updateData.status || snap.data().status }
  });

  return { id, ...snap.data(), ...updateData };
};

export const deletePullRequest = async (id) => {
  const currentUser = auth.currentUser;
  if (!currentUser) throw new Error('Unauthenticated');

  const prRef = doc(db, 'pullRequests', id);
  const snap = await getDoc(prRef);
  if (!snap.exists()) throw new Error('Pull request not found');
  const data = snap.data();

  await deleteDoc(prRef);

  await logActivity({
    action: 'Deleted',
    entityType: 'PullRequest',
    entityId: id,
    projectId: data.projectId,
    metadata: { title: data.title }
  });

  return { success: true };
};

// ================= DEPLOYMENTS =================
export const getDeployments = async (projectId = null, repositoryId = null) => {
  let q;
  if (projectId && repositoryId) {
    q = query(
      collection(db, 'deployments'),
      where('projectId', '==', projectId),
      where('repositoryId', '==', repositoryId)
    );
  } else if (projectId) {
    q = query(collection(db, 'deployments'), where('projectId', '==', projectId));
  } else if (repositoryId) {
    q = query(collection(db, 'deployments'), where('repositoryId', '==', repositoryId));
  } else {
    q = collection(db, 'deployments');
  }

  const snap = await getDocs(q);
  return snap.docs.map(d => ({
    id: d.id,
    ...d.data(),
    deployedAt: toIso(d.data().deployedAt)
  })).sort((a, b) => new Date(b.deployedAt || 0) - new Date(a.deployedAt || 0));
};

export const createDeployment = async ({ repositoryId, projectId, environment, status, url, deployerGithubUsername, deployerId }) => {
  const currentUser = auth.currentUser;
  if (!currentUser) throw new Error('Unauthenticated');

  const repoSnap = await getDoc(doc(db, 'repositories', repositoryId));
  const repoName = repoSnap.exists() ? repoSnap.data().name : 'Repository';

  const depRef = doc(collection(db, 'deployments'));
  const data = {
    repositoryId,
    projectId,
    environment: environment.trim(),
    status: status?.trim() || 'Pending',
    url: url?.trim() || null,
    deployerGithubUsername: deployerGithubUsername?.trim() || null,
    deployerId: deployerId || currentUser.uid,
    repository: { id: repositoryId, name: repoName },
    deployedAt: serverTimestamp()
  };

  await setDoc(depRef, data);

  await logActivity({
    action: 'Created',
    entityType: 'Deployment',
    entityId: depRef.id,
    projectId,
    metadata: { environment: data.environment, status: data.status }
  });

  return { id: depRef.id, ...data };
};

export const updateDeployment = async (id, updateFields) => {
  const currentUser = auth.currentUser;
  if (!currentUser) throw new Error('Unauthenticated');

  const depRef = doc(db, 'deployments', id);
  const snap = await getDoc(depRef);
  if (!snap.exists()) throw new Error('Deployment not found');

  const updateData = {};
  if (updateFields.environment !== undefined) updateData.environment = updateFields.environment.trim();
  if (updateFields.status !== undefined) updateData.status = updateFields.status.trim();
  if (updateFields.url !== undefined) updateData.url = updateFields.url?.trim() || null;
  if (updateFields.deployerGithubUsername !== undefined) updateData.deployerGithubUsername = updateFields.deployerGithubUsername?.trim() || null;

  await updateDoc(depRef, updateData);

  const action = (updateData.status === 'Success' || updateData.status === 'Failed') ? 'Completed' : 'Updated';
  await logActivity({
    action,
    entityType: 'Deployment',
    entityId: id,
    projectId: snap.data().projectId,
    metadata: { environment: updateData.environment || snap.data().environment, status: updateData.status || snap.data().status }
  });

  return { id, ...snap.data(), ...updateData };
};

export const deleteDeployment = async (id) => {
  const currentUser = auth.currentUser;
  if (!currentUser) throw new Error('Unauthenticated');

  const depRef = doc(db, 'deployments', id);
  const snap = await getDoc(depRef);
  if (!snap.exists()) throw new Error('Deployment not found');
  const data = snap.data();

  await deleteDoc(depRef);

  await logActivity({
    action: 'Deleted',
    entityType: 'Deployment',
    entityId: id,
    projectId: data.projectId,
    metadata: { environment: data.environment }
  });

  return { success: true };
};
