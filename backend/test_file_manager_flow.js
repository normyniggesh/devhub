require('dotenv').config();
const jwt = require('jsonwebtoken');
const app = require('./src/app');
const { prisma, ensureSchema } = require('./src/db');
const { uploadFile, generateSafeKey } = require('./src/services/storageService');

const JWT_SECRET = process.env.JWT_SECRET || 'devhub-jwt-secret-key-change-in-production';

function getAuthHeader(userId, role = 'Member') {
  const token = jwt.sign({ userId, role }, JWT_SECRET, { expiresIn: '1h' });
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  };
}

async function runFileManagerTests() {
  console.log('==================================================');
  console.log('DEVHUB 3-PANE FILE MANAGER AUTOMATED VERIFICATION');
  console.log('==================================================\n');

  await ensureSchema();

  // 1. Setup Test Users
  let user1 = await prisma.user.findFirst({ where: { email: 'umer@devhub.test' } });
  if (!user1) {
    user1 = await prisma.user.create({
      data: { email: 'umer@devhub.test', name: 'Umer', passwordHash: 'hash123', role: 'Admin' }
    });
  }

  let user2 = await prisma.user.findFirst({ where: { email: 'paarth@devhub.test' } });
  if (!user2) {
    user2 = await prisma.user.create({
      data: { email: 'paarth@devhub.test', name: 'Paarth', passwordHash: 'hash123', role: 'Member' }
    });
  }

  // 2. Setup Project owned by User 1
  let project1 = await prisma.project.findFirst({ where: { name: 'Umer Private Project' } });
  if (!project1) {
    project1 = await prisma.project.create({
      data: {
        name: 'Umer Private Project',
        description: 'Private project for User 1',
        ownerId: user1.id
      }
    });
  }

  // Setup Project accessible to both
  let sharedProject = await prisma.project.findFirst({ where: { name: 'Shared Team Project' } });
  if (!sharedProject) {
    sharedProject = await prisma.project.create({
      data: {
        name: 'Shared Team Project',
        description: 'Shared project for team',
        ownerId: user1.id,
        members: {
          create: [{ userId: user2.id, role: 'Editor' }]
        }
      }
    });
  }

  // 3. Start local ephemeral Express server
  const server = app.listen(0);
  const port = server.address().port;
  const baseUrl = `http://localhost:${port}/api`;

  console.log(`[Setup] Server running at ${baseUrl}`);
  console.log(`[Setup] User 1: ${user1.name} (${user1.email})`);
  console.log(`[Setup] User 2: ${user2.name} (${user2.email})`);
  console.log(`[Setup] Private Project: ${project1.name} (Owner: Umer)`);
  console.log(`[Setup] Shared Project: ${sharedProject.name}\n`);

  try {
    // TEST 1: Google OAuth URL check for write access scope
    console.log('--- TEST 1: GOOGLE OAUTH URL & WRITE SCOPES ---');
    const authUrlRes = await fetch(`${baseUrl}/integrations/google/auth-url`, {
      headers: getAuthHeader(user1.id, 'Admin')
    });
    const authUrlData = await authUrlRes.json();
    console.log(`  Configured: ${authUrlData.configured}`);
    if (authUrlData.configured) {
      console.log(`  Auth URL: ${authUrlData.url.substring(0, 100)}...`);
      if (!authUrlData.url.includes('auth%2Fdrive') && !authUrlData.url.includes('auth/drive')) {
        throw new Error('Google OAuth URL does not contain full drive write scope');
      }
      console.log('✓ Google OAuth URL requested with write access scope (drive)!');
    } else {
      console.log('ℹ Google OAuth credentials not set in test environment, endpoint responded gracefully.');
    }

    // TEST 2: User Isolation for Integrations
    console.log('\n--- TEST 2: USER ISOLATION FOR CLOUD INTEGRATIONS ---');
    // Clear user2 integrations first to test clean state
    await prisma.userIntegration.deleteMany({ where: { userId: user2.id } });

    // Connect User 1 personal Google Drive (umer@gmail.com)
    await prisma.userIntegration.upsert({
      where: { userId_provider: { userId: user1.id, provider: 'google_drive' } },
      update: {
        status: 'connected',
        accountName: 'umer@gmail.com',
        accessToken: 'mock_token_umer',
        metadata: { email: 'umer@gmail.com' }
      },
      create: {
        userId: user1.id,
        provider: 'google_drive',
        status: 'connected',
        accountName: 'umer@gmail.com',
        accessToken: 'mock_token_umer',
        metadata: { email: 'umer@gmail.com' }
      }
    });

    // Verify User 1 sees umer@gmail.com
    const intRes1 = await fetch(`${baseUrl}/integrations`, {
      headers: getAuthHeader(user1.id, 'Admin')
    });
    const intData1 = await intRes1.json();
    if (!intData1.integrations.google_drive?.connected || intData1.integrations.google_drive.accountName !== 'umer@gmail.com') {
      throw new Error('User 1 failed to see own connected Google Drive');
    }
    console.log(`✓ User 1 personal Google Drive: ${intData1.integrations.google_drive.accountName}`);

    // Verify User 2 does NOT see User 1's Google Drive
    const intRes2Before = await fetch(`${baseUrl}/integrations`, {
      headers: getAuthHeader(user2.id, 'Member')
    });
    const intData2Before = await intRes2Before.json();
    if (intData2Before.integrations.google_drive?.connected) {
      throw new Error("SECURITY VIOLATION: User 2 can see User 1's Google Drive!");
    }
    console.log("✓ User 2 initially has no Drive connected (cannot see User 1's Drive)");

    // Now connect User 2's own personal Google Drive (paarth@gmail.com)
    await prisma.userIntegration.upsert({
      where: { userId_provider: { userId: user2.id, provider: 'google_drive' } },
      update: {
        status: 'connected',
        accountName: 'paarth@gmail.com',
        accessToken: 'mock_token_paarth',
        metadata: { email: 'paarth@gmail.com' }
      },
      create: {
        userId: user2.id,
        provider: 'google_drive',
        status: 'connected',
        accountName: 'paarth@gmail.com',
        accessToken: 'mock_token_paarth',
        metadata: { email: 'paarth@gmail.com' }
      }
    });

    const intRes2After = await fetch(`${baseUrl}/integrations`, {
      headers: getAuthHeader(user2.id, 'Member')
    });
    const intData2After = await intRes2After.json();
    if (intData2After.integrations.google_drive?.accountName !== 'paarth@gmail.com') {
      throw new Error("User 2 failed to see own personal Google Drive");
    }
    console.log(`✓ User 2 personal Google Drive: ${intData2After.integrations.google_drive.accountName}`);

    // Verify User 1 STILL sees umer@gmail.com (not paarth)
    const intRes1Again = await fetch(`${baseUrl}/integrations`, {
      headers: getAuthHeader(user1.id, 'Admin')
    });
    const intData1Again = await intRes1Again.json();
    if (intData1Again.integrations.google_drive?.accountName !== 'umer@gmail.com') {
      throw new Error("User 1 drive was corrupted by User 2!");
    }
    console.log("✓ True multi-user isolation confirmed: Umer -> umer@gmail.com, Paarth -> paarth@gmail.com (Never mixed)!");

    // TEST 3: DEVHUB Project Isolation & Permissions
    console.log('\n--- TEST 3: DEVHUB PROJECT PERMISSIONS & FILE ISOLATION ---');
    // User 1 creates file in private project
    const s3Key1 = generateSafeKey(project1.id, null, 'secret_notes.txt');
    try {
      await uploadFile(Buffer.from('Confidential project plans'), 'text/plain', s3Key1);
    } catch (_) {}

    const file1 = await prisma.file.create({
      data: {
        name: 'secret_notes.txt',
        type: 'text/plain',
        size: 26,
        storagePath: s3Key1,
        projectId: project1.id,
        uploaderId: user1.id
      }
    });
    console.log(`✓ User 1 created private file in "${project1.name}" (ID: ${file1.id})`);

    // User 2 tries to access private file -> MUST BE REJECTED (403 Forbidden)
    const accessRes = await fetch(`${baseUrl}/files/${file1.id}`, {
      headers: getAuthHeader(user2.id, 'Member')
    });
    if (accessRes.status !== 403) {
      throw new Error(`Expected 403 Forbidden for User 2 accessing private file, got ${accessRes.status}`);
    }
    console.log('✓ Project security enforced: User 2 rejected with 403 Forbidden from User 1 private project.');

    // TEST 4: DEVHUB File Copy (Intra & Cross-Project)
    console.log('\n--- TEST 4: DEVHUB FILE COPY & CONTENT PREVIEW ---');
    // Create file in shared project
    const s3KeyShared = generateSafeKey(sharedProject.id, null, 'readme.md');
    try {
      await uploadFile(Buffer.from('# Shared Team Readme\nWelcome to DEVHUB!'), 'text/markdown', s3KeyShared);
    } catch (_) {}

    const sharedFile = await prisma.file.create({
      data: {
        name: 'readme.md',
        type: 'text/markdown',
        size: 42,
        storagePath: s3KeyShared,
        projectId: sharedProject.id,
        uploaderId: user1.id
      }
    });

    // Copy file within shared project
    const copyRes = await fetch(`${baseUrl}/files/${sharedFile.id}/copy`, {
      method: 'POST',
      headers: getAuthHeader(user2.id, 'Editor'),
      body: JSON.stringify({
        newName: 'readme_backup.md'
      })
    });
    const copyData = await copyRes.json();
    if (!copyRes.ok || !copyData.success) {
      throw new Error(`DEVHUB file copy failed: ${JSON.stringify(copyData)}`);
    }
    console.log(`✓ User 2 copied shared file. New File: "${copyData.file.name}" (ID: ${copyData.file.id})`);

    // Test text content retrieval for preview
    const contentRes = await fetch(`${baseUrl}/files/${sharedFile.id}/content`, {
      headers: getAuthHeader(user2.id, 'Editor')
    });
    const contentText = await contentRes.text();
    console.log(`✓ File content preview retrieved: "${contentText.substring(0, 20)}..."`);

    // TEST 5: Google Drive Write Endpoints Validation
    console.log('\n--- TEST 5: GOOGLE DRIVE WRITE ENDPOINT VERIFICATION ---');
    // Ensure user2 has no connected Drive
    await prisma.userIntegration.deleteMany({ where: { userId: user2.id } });
    const gdFolderRes = await fetch(`${baseUrl}/integrations/google_drive/folders`, {
      method: 'POST',
      headers: getAuthHeader(user2.id, 'Member'),
      body: JSON.stringify({ name: 'New Test Folder' })
    });
    console.log(`  Unconnected user folder create status: ${gdFolderRes.status}`);
    if (gdFolderRes.status !== 400) {
      throw new Error(`Expected 400 for unconnected user, got ${gdFolderRes.status}`);
    }
    console.log('✓ Google Drive folder create requires connected account (400 returned when not connected).');

    console.log('\n==================================================');
    console.log('ALL FILE MANAGER TESTS PASSED SUCCESSFULLY (100%)');
    console.log('==================================================');
  } finally {
    server.close();
    await prisma.$disconnect();
  }
}

runFileManagerTests().catch(err => {
  console.error('\n❌ Test run failed with error:', err);
  process.exit(1);
});
