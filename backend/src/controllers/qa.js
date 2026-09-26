const prisma = require('../db');
const { checkProjectAccess } = require('../utils/projectAccess');

exports.getSummary = async (req, res) => {
  try {
    const { projectId } = req.query;
    if (!projectId) {
      return res.status(400).json({ success: false, message: 'projectId is required' });
    }

    const access = await checkProjectAccess(projectId, req.userId);
    if (!access.accessible) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }

    const [
      totalTestCases,
      activeTestCases,
      totalTestRuns,
      completedTestRuns,
      passedResults,
      failedResults,
      blockedResults,
      skippedResults,
      openBugs,
      resolvedBugs
    ] = await Promise.all([
      prisma.testCase.count({ where: { projectId } }),
      prisma.testCase.count({ where: { projectId, status: 'Active' } }),
      prisma.testRun.count({ where: { projectId } }),
      prisma.testRun.count({ where: { projectId, status: 'Completed' } }), // Assuming Completed covers passed/failed, but we can query by 'Completed' or 'Done'
      prisma.testResult.count({ where: { testRun: { projectId }, status: 'Passed' } }),
      prisma.testResult.count({ where: { testRun: { projectId }, status: 'Failed' } }),
      prisma.testResult.count({ where: { testRun: { projectId }, status: 'Blocked' } }),
      prisma.testResult.count({ where: { testRun: { projectId }, status: 'Skipped' } }),
      prisma.bug.count({ where: { projectId, status: { notIn: ['Resolved', 'Closed', 'Done'] } } }),
      prisma.bug.count({ where: { projectId, status: { in: ['Resolved', 'Closed', 'Done'] } } })
    ]);

    const totalResults = passedResults + failedResults + blockedResults + skippedResults;
    const passRate = totalResults > 0 ? ((passedResults / totalResults) * 100).toFixed(2) : 0;

    res.json({
      success: true,
      summary: {
        totalTestCases,
        activeTestCases,
        totalTestRuns,
        completedTestRuns,
        passedResults,
        failedResults,
        blockedResults,
        skippedResults,
        passRate: parseFloat(passRate),
        openBugs,
        resolvedBugs
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};
