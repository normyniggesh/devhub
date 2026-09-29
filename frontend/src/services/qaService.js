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

// ================= TEST CASES =================
export const getTestCases = async (projectId) => {
  if (!projectId) return [];
  const q = query(
    collection(db, 'testCases'),
    where('projectId', '==', projectId)
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => ({
    id: d.id,
    ...d.data(),
    createdAt: toIso(d.data().createdAt),
    updatedAt: toIso(d.data().updatedAt)
  })).sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
};

export const createTestCase = async (tcData) => {
  const currentUser = auth.currentUser;
  if (!currentUser) throw new Error('Unauthenticated');

  const tcRef = doc(collection(db, 'testCases'));
  const data = {
    ...tcData,
    title: tcData.title.trim(),
    status: tcData.status?.trim() || 'Draft',
    creatorId: currentUser.uid,
    creator: { id: currentUser.uid, name: currentUser.displayName || 'User', email: currentUser.email },
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  };

  await setDoc(tcRef, data);

  await logActivity({
    action: 'Created',
    entityType: 'TestCase',
    entityId: tcRef.id,
    projectId: data.projectId,
    metadata: { title: data.title }
  });

  return { id: tcRef.id, ...data };
};

export const updateTestCase = async (id, updateFields) => {
  const currentUser = auth.currentUser;
  if (!currentUser) throw new Error('Unauthenticated');

  const tcRef = doc(db, 'testCases', id);
  const snap = await getDoc(tcRef);
  if (!snap.exists()) throw new Error('Test case not found');

  const updateData = { ...updateFields, updatedAt: serverTimestamp() };
  await updateDoc(tcRef, updateData);

  await logActivity({
    action: 'Updated',
    entityType: 'TestCase',
    entityId: id,
    projectId: snap.data().projectId,
    metadata: { title: updateFields.title || snap.data().title }
  });

  return { id, ...snap.data(), ...updateData };
};

export const deleteTestCase = async (id) => {
  const currentUser = auth.currentUser;
  if (!currentUser) throw new Error('Unauthenticated');

  const tcRef = doc(db, 'testCases', id);
  const snap = await getDoc(tcRef);
  if (!snap.exists()) throw new Error('Test case not found');
  const data = snap.data();

  await deleteDoc(tcRef);

  await logActivity({
    action: 'Deleted',
    entityType: 'TestCase',
    entityId: id,
    projectId: data.projectId,
    metadata: { title: data.title }
  });

  return { success: true };
};

// ================= TEST RUNS =================
export const getTestRuns = async (projectId) => {
  if (!projectId) return [];
  const q = query(
    collection(db, 'testRuns'),
    where('projectId', '==', projectId)
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => ({
    id: d.id,
    ...d.data(),
    startedAt: toIso(d.data().startedAt),
    completedAt: toIso(d.data().completedAt),
    createdAt: toIso(d.data().createdAt),
    updatedAt: toIso(d.data().updatedAt)
  })).sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
};

export const createTestRun = async ({ projectId, name, status }) => {
  const currentUser = auth.currentUser;
  if (!currentUser) throw new Error('Unauthenticated');

  const trRef = doc(collection(db, 'testRuns'));
  const runStatus = status?.trim() || 'Pending';
  const isStarted = runStatus === 'In Progress' || runStatus === 'Running';
  const isCompleted = runStatus === 'Completed' || runStatus === 'Done';

  const data = {
    projectId,
    name: name.trim(),
    status: runStatus,
    startedAt: isStarted || isCompleted ? new Date() : null,
    completedAt: isCompleted ? new Date() : null,
    executorId: currentUser.uid,
    executor: { id: currentUser.uid, name: currentUser.displayName || 'User', email: currentUser.email },
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  };

  await setDoc(trRef, data);

  await logActivity({
    action: 'Created',
    entityType: 'TestRun',
    entityId: trRef.id,
    projectId,
    metadata: { name: data.name }
  });

  return { id: trRef.id, ...data };
};

export const updateTestRun = async (id, { name, status }) => {
  const currentUser = auth.currentUser;
  if (!currentUser) throw new Error('Unauthenticated');

  const trRef = doc(db, 'testRuns', id);
  const snap = await getDoc(trRef);
  if (!snap.exists()) throw new Error('Test run not found');
  const current = snap.data();

  const updateData = { updatedAt: serverTimestamp() };
  if (name !== undefined) updateData.name = name.trim();
  if (status !== undefined) {
    const runStatus = status.trim();
    updateData.status = runStatus;
    const isStarted = runStatus === 'In Progress' || runStatus === 'Running';
    const isCompleted = runStatus === 'Completed' || runStatus === 'Done' || runStatus === 'Passed' || runStatus === 'Failed';

    if ((isStarted || isCompleted) && !current.startedAt) {
      updateData.startedAt = new Date();
    }
    if (isCompleted && !current.completedAt) {
      updateData.completedAt = new Date();
    } else if (!isCompleted && current.completedAt) {
      updateData.completedAt = null;
    }
  }

  await updateDoc(trRef, updateData);

  await logActivity({
    action: 'Updated',
    entityType: 'TestRun',
    entityId: id,
    projectId: current.projectId,
    metadata: { name: updateData.name || current.name, status: updateData.status || current.status }
  });

  return { id, ...current, ...updateData };
};

// ================= TEST RESULTS =================
export const getTestResults = async (testRunId) => {
  if (!testRunId) return [];
  const q = query(
    collection(db, 'testResults'),
    where('testRunId', '==', testRunId)
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => ({
    id: d.id,
    ...d.data(),
    executedAt: toIso(d.data().executedAt)
  })).sort((a, b) => new Date(b.executedAt || 0) - new Date(a.executedAt || 0));
};

export const createTestResult = async ({ testRunId, testCaseId, status, actualResult }) => {
  const currentUser = auth.currentUser;
  if (!currentUser) throw new Error('Unauthenticated');

  const tcSnap = await getDoc(doc(db, 'testCases', testCaseId));
  const tcTitle = tcSnap.exists() ? tcSnap.data().title : 'Test Case';
  const projectId = tcSnap.exists() ? tcSnap.data().projectId : null;

  const resRef = doc(collection(db, 'testResults'));
  const data = {
    testRunId,
    testCaseId,
    projectId,
    status: status.trim(),
    actualResult: actualResult?.trim() || null,
    executorId: currentUser.uid,
    executor: { id: currentUser.uid, name: currentUser.displayName || 'User' },
    testCase: { id: testCaseId, title: tcTitle },
    executedAt: serverTimestamp()
  };

  await setDoc(resRef, data);

  await logActivity({
    action: 'Created',
    entityType: 'TestResult',
    entityId: resRef.id,
    projectId,
    metadata: { status: data.status }
  });

  return { id: resRef.id, ...data };
};

export const updateTestResult = async (id, { status, actualResult }) => {
  const currentUser = auth.currentUser;
  if (!currentUser) throw new Error('Unauthenticated');

  const resRef = doc(db, 'testResults', id);
  const snap = await getDoc(resRef);
  if (!snap.exists()) throw new Error('Test result not found');

  const updateData = {
    executedAt: serverTimestamp(),
    executorId: currentUser.uid,
    executor: { id: currentUser.uid, name: currentUser.displayName || 'User' }
  };
  if (status !== undefined) updateData.status = status.trim();
  if (actualResult !== undefined) updateData.actualResult = actualResult?.trim() || null;

  await updateDoc(resRef, updateData);

  await logActivity({
    action: 'Updated',
    entityType: 'TestResult',
    entityId: id,
    projectId: snap.data().projectId,
    metadata: { status: updateData.status || snap.data().status }
  });

  return { id, ...snap.data(), ...updateData };
};

// ================= BUGS =================
export const getBugs = async (projectId = null) => {
  let q;
  if (projectId) {
    q = query(collection(db, 'bugs'), where('projectId', '==', projectId));
  } else {
    q = collection(db, 'bugs');
  }

  const snap = await getDocs(q);
  return snap.docs.map(d => ({
    id: d.id,
    ...d.data(),
    resolvedAt: toIso(d.data().resolvedAt),
    createdAt: toIso(d.data().createdAt),
    updatedAt: toIso(d.data().updatedAt)
  })).sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
};

export const createBug = async ({ projectId, taskId, testCaseId, title, description, type, severity, status, assigneeId }) => {
  const currentUser = auth.currentUser;
  if (!currentUser) throw new Error('Unauthenticated');

  const pSnap = await getDoc(doc(db, 'projects', projectId));
  const projectName = pSnap.exists() ? pSnap.data().name : 'Project';

  let assigneeData = null;
  if (assigneeId) {
    const uSnap = await getDoc(doc(db, 'users', assigneeId));
    if (uSnap.exists()) {
      assigneeData = { id: assigneeId, name: uSnap.data().name, email: uSnap.data().email };
    }
  }

  const bugRef = doc(collection(db, 'bugs'));
  const bugStatus = status?.trim() || 'Open';
  const isResolved = ['Resolved', 'Closed', 'Done'].includes(bugStatus);

  const bugData = {
    projectId,
    taskId: taskId || null,
    testCaseId: testCaseId || null,
    title: title.trim(),
    description: description?.trim() || null,
    type: type?.trim() || null,
    severity: severity?.trim() || 'Medium',
    status: bugStatus,
    assigneeId: assigneeId || null,
    creatorId: currentUser.uid,
    project: { id: projectId, name: projectName },
    assignee: assigneeData,
    creator: { id: currentUser.uid, name: currentUser.displayName || 'User', email: currentUser.email },
    resolvedAt: isResolved ? new Date() : null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  };

  await setDoc(bugRef, bugData);

  await logActivity({
    action: 'Created',
    entityType: 'Bug',
    entityId: bugRef.id,
    projectId,
    metadata: { title: bugData.title, status: bugData.status }
  });

  return { id: bugRef.id, ...bugData };
};

export const updateBug = async (id, updateFields) => {
  const currentUser = auth.currentUser;
  if (!currentUser) throw new Error('Unauthenticated');

  const bugRef = doc(db, 'bugs', id);
  const snap = await getDoc(bugRef);
  if (!snap.exists()) throw new Error('Bug not found');
  const current = snap.data();

  const updateData = { updatedAt: serverTimestamp() };
  if (updateFields.title !== undefined) updateData.title = updateFields.title.trim();
  if (updateFields.description !== undefined) updateData.description = updateFields.description?.trim() || null;
  if (updateFields.type !== undefined) updateData.type = updateFields.type?.trim() || null;
  if (updateFields.severity !== undefined) updateData.severity = updateFields.severity?.trim() || 'Medium';
  if (updateFields.taskId !== undefined) updateData.taskId = updateFields.taskId || null;
  if (updateFields.testCaseId !== undefined) updateData.testCaseId = updateFields.testCaseId || null;

  if (updateFields.assigneeId !== undefined) {
    updateData.assigneeId = updateFields.assigneeId || null;
    if (updateFields.assigneeId) {
      const uSnap = await getDoc(doc(db, 'users', updateFields.assigneeId));
      if (uSnap.exists()) updateData.assignee = { id: uSnap.id, name: uSnap.data().name };
    } else {
      updateData.assignee = null;
    }
  }

  if (updateFields.status !== undefined) {
    const bugStatus = updateFields.status.trim();
    updateData.status = bugStatus;
    const isResolved = ['Resolved', 'Closed', 'Done'].includes(bugStatus);
    if (isResolved && !current.resolvedAt) {
      updateData.resolvedAt = new Date();
    } else if (!isResolved && current.resolvedAt) {
      updateData.resolvedAt = null;
    }
  }

  await updateDoc(bugRef, updateData);

  const action = updateData.status && ['Resolved', 'Closed', 'Done'].includes(updateData.status) ? 'Completed' : 'Updated';
  await logActivity({
    action,
    entityType: 'Bug',
    entityId: id,
    projectId: current.projectId,
    metadata: { title: updateData.title || current.title, status: updateData.status || current.status }
  });

  return { id, ...current, ...updateData };
};

export const deleteBug = async (id) => {
  const currentUser = auth.currentUser;
  if (!currentUser) throw new Error('Unauthenticated');

  const bugRef = doc(db, 'bugs', id);
  const snap = await getDoc(bugRef);
  if (!snap.exists()) throw new Error('Bug not found');
  const data = snap.data();

  await deleteDoc(bugRef);

  await logActivity({
    action: 'Deleted',
    entityType: 'Bug',
    entityId: id,
    projectId: data.projectId,
    metadata: { title: data.title }
  });

  return { success: true };
};

// ================= QA SUMMARY =================
export const getSummary = async (projectId) => {
  if (!projectId) return null;

  const [tcSnap, trSnap, resSnap, bugsSnap] = await Promise.all([
    getDocs(query(collection(db, 'testCases'), where('projectId', '==', projectId))),
    getDocs(query(collection(db, 'testRuns'), where('projectId', '==', projectId))),
    getDocs(query(collection(db, 'testResults'), where('projectId', '==', projectId))),
    getDocs(query(collection(db, 'bugs'), where('projectId', '==', projectId)))
  ]);

  let totalTestCases = tcSnap.size;
  let activeTestCases = 0;
  tcSnap.forEach(d => { if (d.data().status === 'Active') activeTestCases++; });

  let totalTestRuns = trSnap.size;
  let completedTestRuns = 0;
  trSnap.forEach(d => { if (['Completed', 'Done'].includes(d.data().status)) completedTestRuns++; });

  let passedResults = 0;
  let failedResults = 0;
  let blockedResults = 0;
  let skippedResults = 0;
  resSnap.forEach(d => {
    const s = d.data().status;
    if (s === 'Passed') passedResults++;
    else if (s === 'Failed') failedResults++;
    else if (s === 'Blocked') blockedResults++;
    else if (s === 'Skipped') skippedResults++;
  });

  let openBugs = 0;
  let resolvedBugs = 0;
  bugsSnap.forEach(d => {
    const s = d.data().status;
    if (['Resolved', 'Closed', 'Done'].includes(s)) resolvedBugs++;
    else openBugs++;
  });

  const totalResults = passedResults + failedResults + blockedResults + skippedResults;
  const passRate = totalResults > 0 ? parseFloat(((passedResults / totalResults) * 100).toFixed(2)) : 0;

  return {
    totalTestCases,
    activeTestCases,
    totalTestRuns,
    completedTestRuns,
    passedResults,
    failedResults,
    blockedResults,
    skippedResults,
    passRate,
    openBugs,
    resolvedBugs
  };
};
