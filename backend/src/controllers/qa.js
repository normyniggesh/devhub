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
      passedTestCases,
      failedTestCases,
      blockedTestCases,
      notTestedTestCases,
      openBugs,
      resolvedBugs,
      totalBugs,
      recentlyFailedTests,
      recentResults
    ] = await Promise.all([
      prisma.testCase.count({ where: { projectId } }),
      prisma.testCase.count({ where: { projectId, status: 'Passed' } }),
      prisma.testCase.count({ where: { projectId, status: 'Failed' } }),
      prisma.testCase.count({ where: { projectId, status: 'Blocked' } }),
      prisma.testCase.count({ where: { projectId, status: { in: ['Not Tested', 'Draft', 'Pending'] } } }),
      prisma.bug.count({ where: { projectId, status: { notIn: ['Resolved', 'Closed', 'Done'] } } }),
      prisma.bug.count({ where: { projectId, status: { in: ['Resolved', 'Closed', 'Done'] } } }),
      prisma.bug.count({ where: { projectId } }),
      prisma.testResult.findMany({
        where: { testCase: { projectId }, status: 'Failed' },
        include: {
          testCase: { select: { id: true, title: true, priority: true, expectedResult: true } },
          executor: { select: { id: true, name: true, email: true } },
          bugs: { select: { id: true, title: true, status: true, severity: true } }
        },
        orderBy: { executedAt: 'desc' },
        take: 5
      }),
      prisma.testResult.findMany({
        where: { testCase: { projectId } },
        include: {
          testCase: { select: { id: true, title: true, priority: true } },
          executor: { select: { id: true, name: true } },
          bugs: { select: { id: true, title: true, status: true } }
        },
        orderBy: { executedAt: 'desc' },
        take: 10
      })
    ]);

    const passRate = totalTestCases > 0 ? Math.round((passedTestCases / totalTestCases) * 100) : 0;
    const failRate = totalTestCases > 0 ? Math.round((failedTestCases / totalTestCases) * 100) : 0;

    res.json({
      success: true,
      summary: {
        totalTestCases,
        passedTestCases,
        failedTestCases,
        blockedTestCases,
        notTestedTestCases,
        passRate,
        failRate,
        openBugs,
        resolvedBugs,
        totalBugs,
        recentlyFailedTests,
        recentResults
      }
    });
  } catch (error) {
    console.error('getSummary error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};
