const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { onDocumentDeleted } = require("firebase-functions/v2/firestore");
const { onRequest } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

/**
 * Health check endpoint for Firebase Functions.
 */
exports.healthCheck = onRequest((req, res) => {
  res.json({ status: "ok", service: "devhub-functions", timestamp: new Date().toISOString() });
});

/**
 * Privileged Project Member Addition
 * Ensures atomic membership creation, user profile denormalization, and project array updates.
 */
exports.addProjectMember = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Authentication required");
  }

  const { projectId, userId, role = "Viewer" } = request.data || {};
  const callerUid = request.auth.uid;

  if (!projectId || !userId) {
    throw new HttpsError("invalid-argument", "projectId and userId are required");
  }

  const projectRef = db.collection("projects").doc(projectId);
  const projectSnap = await projectRef.get();

  if (!projectSnap.exists) {
    throw new HttpsError("not-found", "Project not found");
  }

  const project = projectSnap.data();
  const isOwner = project.ownerId === callerUid;

  // Check if caller is Admin
  const callerMemberSnap = await projectRef.collection("members").doc(callerUid).get();
  const isAdmin = isOwner || (callerMemberSnap.exists && callerMemberSnap.data().role === "Admin");

  if (!isAdmin) {
    throw new HttpsError("permission-denied", "Only Project Admins or Owners can add members");
  }

  // Fetch target user profile
  const targetUserSnap = await db.collection("users").doc(userId).get();
  if (!targetUserSnap.exists) {
    throw new HttpsError("not-found", "User to add was not found");
  }
  const targetUser = targetUserSnap.data();

  const memberRef = projectRef.collection("members").doc(userId);
  const existingMember = await memberRef.get();
  if (existingMember.exists) {
    throw new HttpsError("already-exists", "User is already a member of this project");
  }

  const memberData = {
    id: `${projectId}_${userId}`,
    projectId,
    userId,
    role,
    joinedAt: admin.firestore.FieldValue.serverTimestamp(),
    user: {
      id: userId,
      name: targetUser.name || "Unknown",
      email: targetUser.email || "",
      avatarUrl: targetUser.avatarUrl || null
    }
  };

  const batch = db.batch();
  batch.set(memberRef, memberData);
  batch.update(projectRef, {
    memberUids: admin.firestore.FieldValue.arrayUnion(userId),
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  });

  // Audit log
  const auditRef = db.collection("auditLogs").doc();
  batch.set(auditRef, {
    id: auditRef.id,
    userId: callerUid,
    action: "Added",
    entityType: "ProjectMember",
    entityId: memberRef.id,
    projectId,
    metadata: { projectName: project.name, addedUserName: targetUser.name },
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    user: { id: callerUid, name: request.auth.token.name || "Admin" }
  });

  await batch.commit();

  return { success: true, member: memberData };
});

/**
 * Privileged Project Member Removal
 * Unassigns all tasks assigned to the removed member within this project.
 */
exports.removeProjectMember = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Authentication required");
  }

  const { projectId, userId } = request.data || {};
  const callerUid = request.auth.uid;

  if (!projectId || !userId) {
    throw new HttpsError("invalid-argument", "projectId and userId are required");
  }

  const projectRef = db.collection("projects").doc(projectId);
  const projectSnap = await projectRef.get();

  if (!projectSnap.exists) {
    throw new HttpsError("not-found", "Project not found");
  }

  const project = projectSnap.data();
  const isOwner = project.ownerId === callerUid;
  const callerMemberSnap = await projectRef.collection("members").doc(callerUid).get();
  const isAdmin = isOwner || (callerMemberSnap.exists && callerMemberSnap.data().role === "Admin");
  const isSelf = callerUid === userId;

  if (!isAdmin && !isSelf) {
    throw new HttpsError("permission-denied", "Only Project Admins or Owners can remove other members");
  }

  const memberRef = projectRef.collection("members").doc(userId);
  const memberSnap = await memberRef.get();

  if (!memberSnap.exists) {
    throw new HttpsError("not-found", "Member does not exist in this project");
  }

  const memberData = memberSnap.data();

  // Find all tasks assigned to this user in this project
  const tasksSnap = await db.collection("tasks")
    .where("projectId", "==", projectId)
    .where("assigneeId", "==", userId)
    .get();

  const batch = db.batch();

  // Unassign tasks
  tasksSnap.forEach((taskDoc) => {
    batch.update(taskDoc.ref, {
      assigneeId: null,
      assignee: null,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
  });

  // Remove member doc & array item
  batch.delete(memberRef);
  batch.update(projectRef, {
    memberUids: admin.firestore.FieldValue.arrayRemove(userId),
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  });

  // Audit log
  const auditRef = db.collection("auditLogs").doc();
  batch.set(auditRef, {
    id: auditRef.id,
    userId: callerUid,
    action: "Removed",
    entityType: "ProjectMember",
    entityId: memberRef.id,
    projectId,
    metadata: { projectName: project.name, removedUserName: memberData.user?.name || userId },
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    user: { id: callerUid, name: request.auth.token.name || "User" }
  });

  await batch.commit();

  return { success: true, message: "Member removed and tasks unassigned successfully" };
});

/**
 * Trigger fallback: When a member document is deleted, ensures tasks are unassigned
 */
exports.onMemberDeleted = onDocumentDeleted("projects/{projectId}/members/{userId}", async (event) => {
  const { projectId, userId } = event.params;
  
  const tasksSnap = await db.collection("tasks")
    .where("projectId", "==", projectId)
    .where("assigneeId", "==", userId)
    .get();

  if (tasksSnap.empty) return null;

  const batch = db.batch();
  tasksSnap.forEach((taskDoc) => {
    batch.update(taskDoc.ref, {
      assigneeId: null,
      assignee: null,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
  });

  return batch.commit();
});

/**
 * GitHub Proxy Function
 * Executes GitHub REST API queries securely using server-side token if provided.
 */
exports.githubProxy = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Authentication required");
  }

  const { path: apiPath, method = "GET", body } = request.data || {};
  if (!apiPath) {
    throw new HttpsError("invalid-argument", "path is required");
  }

  const githubToken = process.env.GITHUB_TOKEN;
  const headers = {
    "User-Agent": "DevHub-App",
    "Accept": "application/vnd.github.v3+json"
  };

  if (githubToken) {
    headers["Authorization"] = `Bearer ${githubToken}`;
  }

  try {
    const fetchFn = typeof fetch !== "undefined" ? fetch : (await import("node-fetch")).default;
    const response = await fetchFn(`https://api.github.com${apiPath}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined
    });

    const data = await response.json();
    return { status: response.status, data };
  } catch (err) {
    throw new HttpsError("internal", err.message);
  }
});
