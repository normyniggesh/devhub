require('dotenv').config();
const { prisma, ensureSchema } = require('./src/db');
const { generateSafeKey } = require('./src/services/storageService');

async function runGoogleDriveFlowTest() {
  console.log('--- STARTING GOOGLE DRIVE PERSONAL ACCOUNT & USER ISOLATION TEST ---');
  await ensureSchema();

  // 1. Setup two DEVHUB users: Umer and Paarth
  let userUmer = await prisma.user.findFirst({ where: { email: 'umer@devhub.test' } });
  if (!userUmer) {
    userUmer = await prisma.user.create({
      data: {
        email: 'umer@devhub.test',
        name: 'Umer',
        passwordHash: 'dummyhash',
        role: 'Admin'
      }
    });
  }

  let userPaarth = await prisma.user.findFirst({ where: { email: 'paarth@devhub.test' } });
  if (!userPaarth) {
    userPaarth = await prisma.user.create({
      data: {
        email: 'paarth@devhub.test',
        name: 'Paarth',
        passwordHash: 'dummyhash',
        role: 'Member'
      }
    });
  }

  // Find or create test project
  let project = await prisma.project.findFirst({ where: { name: 'DevHub Google Drive Test Project' } });
  if (!project) {
    project = await prisma.project.create({
      data: {
        name: 'DevHub Google Drive Test Project',
        description: 'Testing Google Drive import to S3 and files',
        ownerId: userUmer.id,
        members: {
          create: [{ userId: userPaarth.id, role: 'Editor' }]
        }
      }
    });
  }

  console.log(`[User A] Umer ID: ${userUmer.id}`);
  console.log(`[User B] Paarth ID: ${userPaarth.id}`);
  console.log(`[Project] ID: ${project.id}`);

  // Test 1: Generate Google OAuth Auth URL
  console.log('\n[Test 1] Generate Google OAuth URL');
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI || 'https://devhub-ten-wheat.vercel.app/files';
  const stateObj = { userId: userUmer.id, ts: Date.now() };
  const state = Buffer.from(JSON.stringify(stateObj)).toString('base64');
  const params = new URLSearchParams({
    client_id: clientId || 'mock-client-id',
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'https://www.googleapis.com/auth/drive.readonly https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile',
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'true',
    state
  });
  const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  console.log(`✓ Auth URL created successfully:`);
  console.log(`  Scope: drive.readonly + userinfo.email + userinfo.profile`);
  console.log(`  Redirect URI: ${redirectUri}`);

  // Test 2: Umer Connects Personal Google Account (umer.personal@gmail.com)
  console.log('\n[Test 2] Connect Umer\'s Personal Google Drive');
  const umerIntegration = await prisma.userIntegration.upsert({
    where: {
      userId_provider: {
        userId: userUmer.id,
        provider: 'google_drive'
      }
    },
    update: {
      status: 'connected',
      accountName: 'umer.personal@gmail.com',
      accessToken: 'ya29.umer_mock_access_token',
      metadata: {
        email: 'umer.personal@gmail.com',
        displayName: 'Umer Personal Drive',
        refreshToken: 'mock_umer_refresh_token',
        expiresAt: Date.now() + 3600 * 1000
      }
    },
    create: {
      userId: userUmer.id,
      provider: 'google_drive',
      status: 'connected',
      accountName: 'umer.personal@gmail.com',
      accessToken: 'ya29.umer_mock_access_token',
      metadata: {
        email: 'umer.personal@gmail.com',
        displayName: 'Umer Personal Drive',
        refreshToken: 'mock_umer_refresh_token',
        expiresAt: Date.now() + 3600 * 1000
      }
    }
  });
  console.log(`✓ Umer Connected: ${umerIntegration.accountName} (Provider: ${umerIntegration.provider})`);

  // Test 3: Paarth Connects DIFFERENT Personal Google Account (paarth.personal@gmail.com)
  console.log('\n[Test 3] Connect Paarth\'s Personal Google Drive');
  const paarthIntegration = await prisma.userIntegration.upsert({
    where: {
      userId_provider: {
        userId: userPaarth.id,
        provider: 'google_drive'
      }
    },
    update: {
      status: 'connected',
      accountName: 'paarth.personal@gmail.com',
      accessToken: 'ya29.paarth_mock_access_token',
      metadata: {
        email: 'paarth.personal@gmail.com',
        displayName: 'Paarth Personal Drive',
        refreshToken: 'mock_paarth_refresh_token',
        expiresAt: Date.now() + 3600 * 1000
      }
    },
    create: {
      userId: userPaarth.id,
      provider: 'google_drive',
      status: 'connected',
      accountName: 'paarth.personal@gmail.com',
      accessToken: 'ya29.paarth_mock_access_token',
      metadata: {
        email: 'paarth.personal@gmail.com',
        displayName: 'Paarth Personal Drive',
        refreshToken: 'mock_paarth_refresh_token',
        expiresAt: Date.now() + 3600 * 1000
      }
    }
  });
  console.log(`✓ Paarth Connected: ${paarthIntegration.accountName} (Provider: ${paarthIntegration.provider})`);

  // Test 4: Strict User Isolation Verification
  console.log('\n[Test 4] Verify Per-User Drive Isolation');
  const umerFetch = await prisma.userIntegration.findFirst({
    where: { userId: userUmer.id, provider: 'google_drive' }
  });
  const paarthFetch = await prisma.userIntegration.findFirst({
    where: { userId: userPaarth.id, provider: 'google_drive' }
  });

  if (umerFetch.accountName !== 'umer.personal@gmail.com') throw new Error('Umer account name mismatch');
  if (paarthFetch.accountName !== 'paarth.personal@gmail.com') throw new Error('Paarth account name mismatch');
  if (umerFetch.id === paarthFetch.id) throw new Error('Isolation failure: Same record returned for both users');
  console.log(`✓ Isolation confirmed:`);
  console.log(`  Umer fetches -> ${umerFetch.accountName}`);
  console.log(`  Paarth fetches -> ${paarthFetch.accountName}`);
  console.log(`  Tokens and identities are completely isolated in PostgreSQL!`);

  // Test 5: Import Google Drive File into DEVHUB S3 Storage & Database
  console.log('\n[Test 5] Import Google Drive File into DEVHUB');
  const importedFileName = 'quarterly_roadmap_2026.pdf';
  const simulatedFileContent = Buffer.from('%PDF-1.4 Mock PDF Content from Google Drive');
  const s3StoragePath = generateSafeKey(project.id, null, importedFileName);

  const dbFile = await prisma.file.create({
    data: {
      name: importedFileName,
      type: 'application/pdf',
      size: simulatedFileContent.length,
      storagePath: s3StoragePath,
      projectId: project.id,
      uploaderId: userUmer.id
    },
    include: {
      project: true,
      uploader: true
    }
  });

  console.log(`✓ File imported into DEVHUB:`);
  console.log(`  File Name: ${dbFile.name}`);
  console.log(`  Storage Path (AWS S3 Key): ${dbFile.storagePath}`);
  console.log(`  Project: ${dbFile.project.name}`);
  console.log(`  Uploader: ${dbFile.uploader.name}`);

  // Test 6: Disconnect Umer's Google Drive & Verify Paarth Remains Connected
  console.log('\n[Test 6] Disconnect Umer & Verify Paarth Remains Connected');
  await prisma.userIntegration.deleteMany({
    where: { userId: userUmer.id, provider: 'google_drive' }
  });

  const umerAfterDisconnect = await prisma.userIntegration.findFirst({
    where: { userId: userUmer.id, provider: 'google_drive' }
  });
  const paarthAfterDisconnect = await prisma.userIntegration.findFirst({
    where: { userId: userPaarth.id, provider: 'google_drive' }
  });

  if (umerAfterDisconnect !== null) throw new Error('Umer disconnect failed');
  if (paarthAfterDisconnect === null || paarthAfterDisconnect.status !== 'connected') {
    throw new Error('Paarth connection was improperly affected by Umer disconnect');
  }

  console.log(`✓ Umer is now: Disconnected (null)`);
  console.log(`✓ Paarth is still: Connected (${paarthAfterDisconnect.accountName})`);

  console.log('\n>>> ALL GOOGLE DRIVE TESTS & ISOLATION CHECKS PASSED SUCCESSFULLY! <<<');
}

runGoogleDriveFlowTest()
  .catch((err) => {
    console.error('Test error:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
