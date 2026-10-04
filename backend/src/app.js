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
app.use('/api', dashboardRoutes);
app.use('/api/repositories', repositoriesRoutes);
app.use('/api/pull-requests', pullRequestsRoutes);
app.use('/api/deployments', deploymentsRoutes);
app.use('/api/notifications', notificationsRoutes);
app.use('/api/activity', activityRoutes);
app.use('/api/integrations', integrationsRoutes);
app.use('/api/github', githubRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/search', searchRoutes);
app.use('/api/team', teamRoutes);

module.exports = app;
