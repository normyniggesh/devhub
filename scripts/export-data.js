require('../backend/node_modules/dotenv').config({ path: require('path').resolve(__dirname, '../backend/.env') });
const prisma = require('../backend/src/db');
const fs = require('fs');
const path = require('path');

async function exportPostgresData() {
  console.log('--- DEVHUB DATABASE EXPORT ---');
  console.log('Connecting to PostgreSQL database...');

  try {
    const [
      users,
      projects,
      projectMembers,
      tasks,
      testCases,
      testRuns,
      testResults,
      bugs,
      calendarEvents,
      folders,
      files,
      repositories,
      pullRequests,
      deployments,
      notifications,
      auditLogs,
      milestones
    ] = await Promise.all([
      prisma.user.findMany(),
      prisma.project.findMany(),
      prisma.projectMember.findMany({ include: { user: { select: { id: true, name: true, email: true, avatarUrl: true } } } }),
      prisma.task.findMany(),
      prisma.testCase.findMany(),
      prisma.testRun.findMany(),
      prisma.testResult.findMany(),
      prisma.bug.findMany(),
      prisma.calendarEvent.findMany(),
      prisma.folder.findMany(),
      prisma.file.findMany(),
      prisma.repository.findMany(),
      prisma.pullRequest.findMany(),
      prisma.deployment.findMany(),
      prisma.notification.findMany(),
      prisma.auditLog.findMany(),
      prisma.milestone.findMany()
    ]);

    const exportData = {
      metadata: {
        exportedAt: new Date().toISOString(),
        counts: {
          users: users.length,
          projects: projects.length,
          projectMembers: projectMembers.length,
          tasks: tasks.length,
          testCases: testCases.length,
          testRuns: testRuns.length,
          testResults: testResults.length,
          bugs: bugs.length,
          calendarEvents: calendarEvents.length,
          folders: folders.length,
          files: files.length,
          repositories: repositories.length,
          pullRequests: pullRequests.length,
          deployments: deployments.length,
          notifications: notifications.length,
          auditLogs: auditLogs.length,
          milestones: milestones.length
        }
      },
      data: {
        users,
        projects,
        projectMembers,
        tasks,
        testCases,
        testRuns,
        testResults,
        bugs,
        calendarEvents,
        folders,
        files,
        repositories,
        pullRequests,
        deployments,
        notifications,
        auditLogs,
        milestones
      }
    };

    const outDir = path.resolve(__dirname, '../data-export');
    if (!fs.existsSync(outDir)) {
      fs.mkdirSync(outDir, { recursive: true });
    }

    const outFile = path.join(outDir, 'backup.json');
    fs.writeFileSync(outFile, JSON.stringify(exportData, null, 2), 'utf8');

    console.log(`\nExport complete! File saved to: ${outFile}`);
    console.log('Record Counts Summary:');
    console.table(exportData.metadata.counts);

    return exportData;
  } catch (err) {
    console.error('Export failed:', err.message);
    throw err;
  } finally {
    await prisma.$disconnect().catch(() => {});
  }
}

if (require.main === module) {
  exportPostgresData()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

module.exports = { exportPostgresData };
