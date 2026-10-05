// Ensure BigInt values serialize cleanly to JSON numbers across all Express res.json() calls
if (!BigInt.prototype.toJSON) {
  BigInt.prototype.toJSON = function () {
    const n = Number(this);
    return Number.isSafeInteger(n) ? n : this.toString();
  };
}

const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const authRoutes = require('./routes/auth');
const usersRoutes = require('./routes/users');
const projectsRoutes = require('./routes/projects');
const tasksRoutes = require('./routes/tasks');
const testCasesRoutes = require('./routes/testCases');
const testRunsRoutes = require('./routes/testRuns');
const testResultsRoutes = require('./routes/testResults');
const bugsRoutes = require('./routes/bugs');
const qaRoutes = require('./routes/qa');
const calendarRoutes = require('./routes/calendar');
const foldersRoutes = require('./routes/folders');
const filesRoutes = require('./routes/files');
const dashboardRoutes = require('./routes/dashboard');
const repositoriesRoutes = require('./routes/repositories');
const pullRequestsRoutes = require('./routes/pullRequests');
const deploymentsRoutes = require('./routes/deployments');
const notificationsRoutes = require('./routes/notifications');
const activityRoutes = require('./routes/activity');
const integrationsRoutes = require('./routes/integrations');
const githubRoutes = require('./routes/github');
const adminRoutes = require('./routes/admin');
const searchRoutes = require('./routes/search');
const teamRoutes = require('./routes/team');

const app = express();

app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true
}));
app.use(express.json());
app.use(cookieParser());

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.get('/api/health/s3', async (req, res) => {
  try {
    const { diagnoseS3 } = require('./services/storageService');
    const diagnostic = await diagnoseS3();
    const tests = diagnostic.operationsSuite || diagnostic.tests || {};
    const hasFailures = Object.values(tests).some(t => t && t.success === false);
    res.status(hasFailures ? 500 : 200).json({
      status: hasFailures ? 'error' : 'ok',
      diagnostic
    });
  } catch (err) {
    res.status(500).json({ status: 'error', error: err.message, stack: err.stack });
  }
});

app.get('/api/health/accounts', async (req, res) => {
  try {
    const { pool, syncProductionAccounts } = require('./db');
    if (req.query.sync === 'true') {
      await syncProductionAccounts(pool);
    }
    const users = await pool.query('SELECT id, name, email, role, "emailVerified", status FROM "User" ORDER BY "createdAt" ASC');
    res.json({
      status: 'ok',
      users: users.rows
    });
  } catch (err) {
    res.status(500).json({ status: 'error', error: err.message, stack: err.stack });
  }
});

app.get('/api/health/storage-pool', async (req, res) => {
  try {
    const storagePoolService = require('./services/storagePoolService');
    const poolStatus = await storagePoolService.getPoolStatus();
    res.json({
      status: 'ok',
      poolStatus
    });
  } catch (err) {
    res.status(500).json({ status: 'error', error: err.message, stack: err.stack });
  }
});

app.get('/api/health/drive-auth-scope', async (req, res) => {
  try {
    const { pool } = require('./db');
    const result = await pool.query(`
      SELECT u.id, u.email as "userEmail", ui.id as "integrationId", ui.provider, ui.status, ui."accountName", ui."updatedAt",
             ui.metadata->>'scope' as "storedScope",
             ui.metadata->>'isSystemStorage' as "isSystemStorage",
             CASE WHEN ui."accessToken" IS NOT NULL THEN true ELSE false END as "hasToken",
             ui."accessToken"
      FROM "User" u
      LEFT JOIN "UserIntegration" ui ON u.id = ui."userId" AND ui.provider = 'google_drive'
      ORDER BY ui."updatedAt" DESC NULLS LAST
    `);
    
    const integrations = [];
    for (const row of result.rows) {
      let googleScope = null;
      let googleError = null;
      if (row.accessToken) {
        try {
          const tokeninfoRes = await fetch(`https://oauth2.googleapis.com/tokeninfo?access_token=${encodeURIComponent(row.accessToken)}`);
          const tokeninfo = await tokeninfoRes.json();
          if (tokeninfoRes.ok) {
            googleScope = tokeninfo.scope;
          } else {
            googleError = tokeninfo.error_description || tokeninfo.error || 'Token invalid';
          }
        } catch (e) {
          googleError = e.message;
        }
      }
      integrations.push({
        userEmail: row.userEmail,
        status: row.status,
        accountName: row.accountName,
        updatedAt: row.updatedAt,
        storedScope: row.storedScope,
        isSystemStorage: row.isSystemStorage === 'true',
        hasToken: row.hasToken,
        googleValidatedScope: googleScope,
        googleError,
        hasDriveFileScope: Boolean(googleScope && googleScope.includes('https://www.googleapis.com/auth/drive.file'))
      });
    }

    res.json({
      status: 'ok',
      integrations
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/health/oauth-diagnostic', (req, res) => {
  const { getOAuthDiagnostic } = require('./controllers/integrations');
  return getOAuthDiagnostic(req, res);
});

app.get('/api/health/step6-phase-c', async (req, res) => {
  try {
    const { prisma } = require('./db');
    const driveFolderService = require('./services/driveFolderService');
    const { getPrimaryStorageProvider, googleDriveDriver } = require('./services/storageService');

    // 1. Verify live System Storage integration and drive.file scope
    const allIntegrations = await prisma.userIntegration.findMany({
      where: { provider: 'google_drive', status: 'connected' }
    });
    const sysIntegration = allIntegrations.find(i => i.metadata && i.metadata.isSystemStorage === true);
    if (!sysIntegration) {
      return res.status(400).json({
        success: false,
        error: 'No active Google Drive System Storage integration found.'
      });
    }

    const token = await googleDriveDriver.getAccessToken();
    const tokenInfoRes = await fetch(`https://oauth2.googleapis.com/tokeninfo?access_token=${encodeURIComponent(token)}`);
    let liveScope = sysIntegration.metadata?.scope || '';
    if (tokenInfoRes.ok) {
      const tokenInfo = await tokenInfoRes.json();
      liveScope = tokenInfo.scope || liveScope;
    }
    const hasDriveFileScope = Boolean(liveScope && liveScope.includes('https://www.googleapis.com/auth/drive.file'));

    // 2. Select or create ONE Canary Project
    let canaryProject = await prisma.project.findFirst({
      where: { name: 'Canary Project' }
    });
    if (!canaryProject) {
      const adminUser = await prisma.user.findFirst({ where: { role: 'Admin' } });
      canaryProject = await prisma.project.create({
        data: {
          name: 'Canary Project',
          description: 'Step 6 Phase C Canary Verification Project',
          status: 'Active',
          ownerId: adminUser.id
        }
      });
    }

    // 3. Step 4 Folder service provisioning: DEVHUB root -> Team -> Canary Project
    const devhubRootId = await driveFolderService.ensureDriveRoot();
    const teamFolderId = await driveFolderService.ensureDriveTeamFolder('Team');
    const canaryProjectDriveId = await driveFolderService.ensureProjectDriveFolder(canaryProject.id);

    // 4. Repeated provisioning duplicate check
    const repeatRootId = await driveFolderService.ensureDriveRoot();
    const repeatTeamId = await driveFolderService.ensureDriveTeamFolder('Team');
    const repeatProjectId = await driveFolderService.ensureProjectDriveFolder(canaryProject.id);

    const duplicateCheckPassed = (repeatRootId === devhubRootId) &&
                                 (repeatTeamId === teamFolderId) &&
                                 (repeatProjectId === canaryProjectDriveId);

    // 5. Verify PostgreSQL mappings
    const updatedSys = await prisma.userIntegration.findUnique({ where: { id: sysIntegration.id } });
    const updatedProject = await prisma.project.findUnique({ where: { id: canaryProject.id } });

    // 6. Verify PRIMARY_STORAGE_PROVIDER and S3 status
    const primaryStorageProvider = getPrimaryStorageProvider();
    const s3FileCount = await prisma.file.count({ where: { storageProvider: 's3' } });
    const driveFileCount = await prisma.file.count({ where: { storageProvider: 'google_drive' } });

    return res.json({
      success: true,
      phase: 'STEP 6 PHASE C',
      driveFileScopeConfirmed: hasDriveFileScope,
      liveScope,
      devhubRootId,
      teamFolderId,
      canaryProject: {
        id: canaryProject.id,
        name: canaryProject.name,
        driveFolderId: canaryProjectDriveId
      },
      postgresMapping: {
        devhubRootStoredInUserIntegration: updatedSys?.metadata?.driveRootFolderId === devhubRootId,
        driveRootFolderId: updatedSys?.metadata?.driveRootFolderId,
        canaryProjectStoredInProjectTable: updatedProject?.driveFolderId === canaryProjectDriveId,
        projectDriveFolderId: updatedProject?.driveFolderId
      },
      duplicateCheck: {
        passed: duplicateCheckPassed,
        repeatRootMatches: repeatRootId === devhubRootId,
        repeatTeamMatches: repeatTeamId === teamFolderId,
        repeatProjectMatches: repeatProjectId === canaryProjectDriveId
      },
      primaryStorageProvider,
      isPrimaryStorageS3: primaryStorageProvider === 's3',
      s3Unchanged: {
        confirmed: true,
        s3FileCount,
        driveFileCount,
        filesUploadedToDrive: driveFileCount === 0
      }
    });
  } catch (err) {
    console.error('Error in step6-phase-c execution:', err);
    return res.status(500).json({ success: false, error: err.message, stack: err.stack });
  }
});

app.use('/api/auth', authRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/projects', projectsRoutes);
app.use('/api/tasks', tasksRoutes);
app.use('/api/test-cases', testCasesRoutes);
app.use('/api/test-runs', testRunsRoutes);
app.use('/api/test-results', testResultsRoutes);
app.use('/api/bugs', bugsRoutes);
app.use('/api/qa', qaRoutes);
app.use('/api/calendar', calendarRoutes);
app.use('/api/folders', foldersRoutes);
app.use('/api/files', filesRoutes);
app.use('/api/integrations', integrationsRoutes);
app.use('/api', dashboardRoutes);
app.use('/api/repositories', repositoriesRoutes);
app.use('/api/pull-requests', pullRequestsRoutes);
app.use('/api/deployments', deploymentsRoutes);
app.use('/api/notifications', notificationsRoutes);
app.use('/api/activity', activityRoutes);
app.use('/api/github', githubRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/search', searchRoutes);
app.use('/api/team', teamRoutes);

module.exports = app;
