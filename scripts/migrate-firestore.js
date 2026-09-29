const fs = require('fs');
const path = require('path');
let admin;
try {
  admin = require('../functions/node_modules/firebase-admin');
} catch (e) {
  admin = require('firebase-admin');
}

// Safe initialization
if (!admin.apps.length) {
  const projectId = process.env.VITE_FIREBASE_PROJECT_ID || 'devhub-ebd3c';
  if (process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
    try {
      const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
      admin.initializeApp({ credential: admin.credential.cert(sa), projectId });
    } catch (e) {
      console.warn('Failed to parse FIREBASE_SERVICE_ACCOUNT_KEY, falling back to default:', e.message);
      admin.initializeApp({ projectId });
    }
  } else {
    admin.initializeApp({ projectId });
  }
}

const db = admin.firestore();

const toTimestamp = (dateVal) => {
  if (!dateVal) return null;
  return admin.firestore.Timestamp.fromDate(new Date(dateVal));
};

async function migrateFirestoreData({ dryRun = false } = {}) {
  console.log('--- DEVHUB FIRESTORE DATA MIGRATION ---');
  if (dryRun) console.log('MODE: DRY RUN (no documents will be written to Firestore)');

  const backupFile = path.resolve(__dirname, '../data-export/backup.json');
  if (!fs.existsSync(backupFile)) {
    throw new Error(`Backup file not found at ${backupFile}. Please run 'npm run export:data' first.`);
  }

  const rawData = fs.readFileSync(backupFile, 'utf8');
  const { data } = JSON.parse(rawData);

  // Helper for writes
  const setDoc = async (colRef, docId, docData) => {
    if (!dryRun) {
      await colRef.doc(docId).set(docData, { merge: true });
    }
  };

  // Helper for batch commit
  const commitBatch = async (batch) => {
    if (!dryRun) {
      await batch.commit();
    }
  };

  // Cache user profiles for denormalization
  const userMap = new Map();
  (data.users || []).forEach(u => {
    userMap.set(u.id, {
      id: u.id,
      name: u.name,
      email: u.email,
      avatarUrl: u.avatarUrl || null
    });
  });

  // 1. Projects and Project Members
  console.log(`Migrating ${(data.projects || []).length} project(s) and ${(data.projectMembers || []).length} member(s)...`);
  for (const proj of (data.projects || [])) {
    const projMembers = (data.projectMembers || []).filter(m => m.projectId === proj.id);
    const memberUids = Array.from(new Set([proj.ownerId, ...projMembers.map(m => m.userId)]));

    const projDoc = {
      name: proj.name,
      description: proj.description || null,
      status: proj.status || 'Active',
      priority: proj.priority || 'Medium',
      category: proj.category || null,
      startDate: toTimestamp(proj.startDate),
      dueDate: toTimestamp(proj.dueDate),
      ownerId: proj.ownerId,
      owner: userMap.get(proj.ownerId) || { id: proj.ownerId, name: 'Owner' },
      memberUids,
      createdAt: toTimestamp(proj.createdAt),
      updatedAt: toTimestamp(proj.updatedAt)
    };

    await setDoc(db.collection('projects'), proj.id, projDoc);

    // Also populate top-level projectMembers collection for unified querying
    for (const m of projMembers) {
      const pmDoc = {
        projectId: proj.id,
        userId: m.userId,
        role: m.role || 'Viewer',
        joinedAt: toTimestamp(m.joinedAt),
        user: userMap.get(m.userId) || { id: m.userId, name: 'User' }
      };
      await setDoc(db.collection('projectMembers'), m.id || `${proj.id}_${m.userId}`, pmDoc);
    }

    // Write members subcollection
    const batch = db.batch();
    for (const m of projMembers) {
      const memberRef = db.collection('projects').doc(proj.id).collection('members').doc(m.userId);
      batch.set(memberRef, {
        id: m.id,
        projectId: proj.id,
        userId: m.userId,
        role: m.role || 'Viewer',
        joinedAt: toTimestamp(m.joinedAt),
        user: userMap.get(m.userId) || { id: m.userId, name: 'User' }
      }, { merge: true });
    }
    // Ensure owner is represented in members if not already present
    if (!projMembers.some(m => m.userId === proj.ownerId)) {
      const ownerMemberRef = db.collection('projects').doc(proj.id).collection('members').doc(proj.ownerId);
      batch.set(ownerMemberRef, {
        id: `${proj.id}_${proj.ownerId}`,
        projectId: proj.id,
        userId: proj.ownerId,
        role: 'Admin',
        joinedAt: toTimestamp(proj.createdAt),
        user: userMap.get(proj.ownerId) || { id: proj.ownerId, name: 'Owner' }
      }, { merge: true });

      // And top-level
      await setDoc(db.collection('projectMembers'), `${proj.id}_${proj.ownerId}`, {
        projectId: proj.id,
        userId: proj.ownerId,
        role: 'Admin',
        joinedAt: toTimestamp(proj.createdAt),
        user: userMap.get(proj.ownerId) || { id: proj.ownerId, name: 'Owner' }
      });
    }
    await commitBatch(batch);
  }

  // Helper for project map
  const projectMap = new Map();
  (data.projects || []).forEach(p => projectMap.set(p.id, { id: p.id, name: p.name }));

  // 2. Tasks
  console.log(`Migrating ${(data.tasks || []).length} task(s)...`);
  for (const t of (data.tasks || [])) {
    const taskDoc = {
      projectId: t.projectId,
      title: t.title,
      description: t.description || null,
      status: t.status || 'To Do',
      priority: t.priority || 'Medium',
      assigneeId: t.assigneeId || null,
      creatorId: t.creatorId,
      startDate: toTimestamp(t.startDate),
      dueDate: toTimestamp(t.dueDate),
      completedAt: toTimestamp(t.completedAt),
      project: projectMap.get(t.projectId) || { id: t.projectId, name: 'Project' },
      creator: userMap.get(t.creatorId) || { id: t.creatorId, name: 'Creator' },
      assignee: t.assigneeId ? (userMap.get(t.assigneeId) || { id: t.assigneeId, name: 'Assignee' }) : null,
      createdAt: toTimestamp(t.createdAt),
      updatedAt: toTimestamp(t.updatedAt)
    };
    await setDoc(db.collection('tasks'), t.id, taskDoc);
  }

  // 3. Test Cases
  console.log(`Migrating ${(data.testCases || []).length} test case(s)...`);
  for (const tc of (data.testCases || [])) {
    const tcDoc = {
      projectId: tc.projectId,
      title: tc.title,
      description: tc.description || null,
      status: tc.status || 'Draft',
      priority: tc.priority || 'Medium',
      type: tc.type || 'Functional',
      preconditions: tc.preconditions || null,
      steps: tc.steps || null,
      expectedResult: tc.expectedResult || null,
      creatorId: tc.creatorId,
      creator: userMap.get(tc.creatorId) || { id: tc.creatorId, name: 'Creator' },
      createdAt: toTimestamp(tc.createdAt),
      updatedAt: toTimestamp(tc.updatedAt)
    };
    await setDoc(db.collection('testCases'), tc.id, tcDoc);
  }

  // 4. Test Runs
  console.log(`Migrating ${(data.testRuns || []).length} test run(s)...`);
  for (const tr of (data.testRuns || [])) {
    const trDoc = {
      projectId: tr.projectId,
      name: tr.name,
      description: tr.description || null,
      status: tr.status || 'In Progress',
      environment: tr.environment || null,
      creatorId: tr.creatorId,
      creator: userMap.get(tr.creatorId) || { id: tr.creatorId, name: 'Creator' },
      createdAt: toTimestamp(tr.createdAt),
      updatedAt: toTimestamp(tr.updatedAt)
    };
    await setDoc(db.collection('testRuns'), tr.id, trDoc);
  }

  // 5. Test Results
  console.log(`Migrating ${(data.testResults || []).length} test result(s)...`);
  for (const trs of (data.testResults || [])) {
    const trsDoc = {
      testRunId: trs.testRunId,
      testCaseId: trs.testCaseId,
      status: trs.status || 'Pending',
      notes: trs.notes || null,
      executedById: trs.executedById || null,
      executedBy: trs.executedById ? (userMap.get(trs.executedById) || { id: trs.executedById, name: 'Tester' }) : null,
      executedAt: toTimestamp(trs.executedAt),
      createdAt: toTimestamp(trs.createdAt),
      updatedAt: toTimestamp(trs.updatedAt)
    };
    await setDoc(db.collection('testResults'), trs.id, trsDoc);
  }

  // 6. Bugs
  console.log(`Migrating ${(data.bugs || []).length} bug(s)...`);
  for (const b of (data.bugs || [])) {
    const bDoc = {
      projectId: b.projectId,
      title: b.title,
      description: b.description || null,
      status: b.status || 'Open',
      severity: b.severity || 'Medium',
      stepsToReproduce: b.stepsToReproduce || null,
      expectedBehavior: b.expectedBehavior || null,
      actualBehavior: b.actualBehavior || null,
      testResultId: b.testResultId || null,
      assigneeId: b.assigneeId || null,
      reporterId: b.reporterId,
      project: projectMap.get(b.projectId) || { id: b.projectId, name: 'Project' },
      reporter: userMap.get(b.reporterId) || { id: b.reporterId, name: 'Reporter' },
      assignee: b.assigneeId ? (userMap.get(b.assigneeId) || { id: b.assigneeId, name: 'Assignee' }) : null,
      createdAt: toTimestamp(b.createdAt),
      updatedAt: toTimestamp(b.updatedAt)
    };
    await setDoc(db.collection('bugs'), b.id, bDoc);
  }

  // 7. Task Comments & Attachments
  console.log(`Migrating ${(data.taskComments || []).length} task comment(s)...`);
  for (const tc of (data.taskComments || [])) {
    const tcDoc = {
      taskId: tc.taskId,
      userId: tc.userId,
      content: tc.content,
      user: userMap.get(tc.userId) || { id: tc.userId, name: 'User' },
      createdAt: toTimestamp(tc.createdAt),
      updatedAt: toTimestamp(tc.updatedAt)
    };
    await setDoc(db.collection('taskComments'), tc.id, tcDoc);
  }

  console.log(`Migrating ${(data.taskAttachments || []).length} task attachment(s)...`);
  for (const ta of (data.taskAttachments || [])) {
    const taDoc = {
      taskId: ta.taskId,
      name: ta.name,
      url: ta.url,
      storagePath: ta.url || null,
      size: ta.size || null,
      mimeType: ta.mimeType || null,
      userId: ta.userId,
      createdAt: toTimestamp(ta.createdAt)
    };
    await setDoc(db.collection('taskAttachments'), ta.id, taDoc);
  }

  // 8. Folders and Files
  console.log(`Migrating ${(data.folders || []).length} folder(s)...`);
  for (const f of (data.folders || [])) {
    const fDoc = {
      projectId: f.projectId,
      name: f.name,
      parentId: f.parentId || null,
      createdAt: toTimestamp(f.createdAt),
      updatedAt: toTimestamp(f.updatedAt)
    };
    await setDoc(db.collection('folders'), f.id, fDoc);
  }

  console.log(`Migrating ${(data.files || []).length} file record(s)...`);
  for (const f of (data.files || [])) {
    const fDoc = {
      projectId: f.projectId,
      folderId: f.folderId || null,
      name: f.name,
      storagePath: `projects/${f.projectId}/${f.id}-${f.name}`,
      url: f.url || null,
      size: f.size || null,
      mimeType: f.mimeType || null,
      uploadedById: f.uploadedById || f.userId || null,
      uploadedBy: (f.uploadedById || f.userId) ? (userMap.get(f.uploadedById || f.userId) || { id: f.uploadedById, name: 'Uploader' }) : null,
      createdAt: toTimestamp(f.createdAt),
      updatedAt: toTimestamp(f.updatedAt)
    };
    await setDoc(db.collection('files'), f.id, fDoc);
  }

  // 9. Calendar Events
  console.log(`Migrating ${(data.calendarEvents || []).length} calendar event(s)...`);
  for (const ce of (data.calendarEvents || [])) {
    const ceDoc = {
      projectId: ce.projectId,
      title: ce.title,
      description: ce.description || null,
      startDate: toTimestamp(ce.startDate),
      endDate: toTimestamp(ce.endDate),
      allDay: ce.allDay || false,
      color: ce.color || null,
      creatorId: ce.creatorId,
      createdAt: toTimestamp(ce.createdAt),
      updatedAt: toTimestamp(ce.updatedAt)
    };
    await setDoc(db.collection('calendarEvents'), ce.id, ceDoc);
  }

  // 10. Notifications
  console.log(`Migrating ${(data.notifications || []).length} notification(s)...`);
  for (const n of (data.notifications || [])) {
    const nDoc = {
      userId: n.userId,
      title: n.title,
      message: n.message,
      type: n.type || 'info',
      read: n.read || false,
      link: n.link || null,
      createdAt: toTimestamp(n.createdAt)
    };
    await setDoc(db.collection('notifications'), n.id, nDoc);
  }

  // 11. Audit Logs
  console.log(`Migrating ${(data.auditLogs || []).length} audit log(s)...`);
  for (const al of (data.auditLogs || [])) {
    const alDoc = {
      projectId: al.projectId || null,
      userId: al.userId || null,
      action: al.action,
      entityType: al.entityType,
      entityId: al.entityId || null,
      details: al.details || null,
      user: al.userId ? (userMap.get(al.userId) || { id: al.userId, name: 'User' }) : null,
      createdAt: toTimestamp(al.createdAt)
    };
    await setDoc(db.collection('auditLogs'), al.id, alDoc);
  }

  // 12. GitHub Entities
  console.log(`Migrating ${(data.repositories || []).length} repo(s), ${(data.pullRequests || []).length} PR(s), ${(data.deployments || []).length} deployment(s)...`);
  for (const r of (data.repositories || [])) {
    const rDoc = {
      projectId: r.projectId,
      name: r.name,
      fullName: r.fullName,
      url: r.url,
      defaultBranch: r.defaultBranch || 'main',
      createdAt: toTimestamp(r.createdAt),
      updatedAt: toTimestamp(r.updatedAt)
    };
    await setDoc(db.collection('repositories'), r.id, rDoc);
  }

  for (const pr of (data.pullRequests || [])) {
    const prDoc = {
      repositoryId: pr.repositoryId,
      number: pr.number,
      title: pr.title,
      state: pr.state || 'open',
      url: pr.url,
      authorName: pr.authorName || null,
      authorAvatarUrl: pr.authorAvatarUrl || null,
      createdAt: toTimestamp(pr.createdAt),
      updatedAt: toTimestamp(pr.updatedAt)
    };
    await setDoc(db.collection('pullRequests'), pr.id, prDoc);
  }

  for (const dep of (data.deployments || [])) {
    const depDoc = {
      repositoryId: dep.repositoryId,
      environment: dep.environment || 'production',
      state: dep.state || 'success',
      url: dep.url || null,
      creatorName: dep.creatorName || null,
      createdAt: toTimestamp(dep.createdAt)
    };
    await setDoc(db.collection('deployments'), dep.id, depDoc);
  }

  // 13. Milestones
  console.log(`Migrating ${(data.milestones || []).length} milestone(s)...`);
  for (const m of (data.milestones || [])) {
    const mDoc = {
      projectId: m.projectId,
      title: m.title,
      description: m.description || null,
      dueDate: toTimestamp(m.dueDate),
      status: m.status || 'Upcoming',
      creatorId: m.creatorId,
      completedAt: toTimestamp(m.completedAt),
      createdAt: toTimestamp(m.createdAt),
      updatedAt: toTimestamp(m.updatedAt)
    };
    await setDoc(db.collection('milestones'), m.id, mDoc);
  }

  console.log(`\n--- ALL FIRESTORE DATA MIGRATED IDEMPOTENTLY ${dryRun ? '(DRY RUN COMPLETED)' : ''} ---`);
}

if (require.main === module) {
  const isDryRun = process.argv.includes('--dry-run');
  migrateFirestoreData({ dryRun: isDryRun })
    .then(() => process.exit(0))
    .catch((e) => {
      console.error('Migration failed:', e);
      process.exit(1);
    });
}

module.exports = { migrateFirestoreData };
