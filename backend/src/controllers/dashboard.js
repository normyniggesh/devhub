const prisma = require('../db');

exports.getDashboard = async (req, res) => {
  try {
    const userId = req.userId;

    const projectWhereClause = {
      OR: [
        { ownerId: userId },
        { members: { some: { userId } } }
      ]
    };

    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

    const [
      totalTasks,
      dueToday,
      inProgressTasks,
      completedTasks,
      projects,
      qaResults,
      openBugs,
      recentActivity
    ] = await Promise.all([
      // 1. Total tasks
      prisma.task.count({ where: { project: projectWhereClause } }),
      // 2. Due today
      prisma.task.count({
        where: {
          project: projectWhereClause,
          status: { notIn: ['Done', 'Completed'] },
          dueDate: { gte: startOfToday, lte: endOfToday }
        }
      }),
      // 3. In Progress
      prisma.task.count({
        where: { project: projectWhereClause, status: 'In Progress' }
      }),
      // 4. Completed
      prisma.task.count({
        where: { project: projectWhereClause, status: { in: ['Done', 'Completed'] } }
      }),
      // 5. Projects with tasks for progress
      prisma.project.findMany({
        where: projectWhereClause,
        select: {
          id: true,
          name: true,
          category: true,
          status: true,
          priority: true,
          dueDate: true,
          tasks: { select: { status: true } }
        },
        orderBy: { dueDate: 'asc' }
      }),
      // 6. QA Test Results
      prisma.testResult.findMany({
        where: { testRun: { project: projectWhereClause } },
        select: { status: true }
      }),
      // 7. QA Open Bugs
      prisma.bug.count({
        where: { project: projectWhereClause, status: { notIn: ['Resolved', 'Closed', 'Done'] } }
      }),
      // 8. Recent Activity
      prisma.auditLog.findMany({
        where: { userId }, // Get activity from authenticated user
        orderBy: { createdAt: 'desc' },
        take: 10,
        include: { user: { select: { name: true, avatarUrl: true } } }
      })
    ]);

    // To Do Tasks for Breakdown
    const toDoTasks = totalTasks - inProgressTasks - completedTasks;

    // Map projects with progress
    const projectOverview = projects.map(p => {
      const total = p.tasks.length;
      const done = p.tasks.filter(t => t.status === 'Done' || t.status === 'Completed').length;
      const progress = total > 0 ? Math.round((done / total) * 100) : 0;
      const { tasks, ...rest } = p;
      return { ...rest, progress };
    });

    // Aggregate QA Status
    const qaStatus = { Passed: 0, Failed: 0, Blocked: 0, Skipped: 0, OpenBugs: openBugs };
    qaResults.forEach(r => {
      if (qaStatus[r.status] !== undefined) {
        qaStatus[r.status]++;
      }
    });

    res.json({
      success: true,
      dashboard: {
        totalProjects: projects.length,
        totalTasks,
        dueToday,
        inProgressTasks,
        completedTasks,
        toDoTasks,
        projectOverview,
        qaStatus,
        recentActivity
      }
    });
  } catch (error) {
    console.error('Dashboard error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

exports.getMyDay = async (req, res) => {
  try {
    const userId = req.userId;
    
    // Calculate "today" boundaries
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
    
    // Calculate "upcoming" boundary (next 7 days)
    const upcomingLimit = new Date(endOfToday);
    upcomingLimit.setDate(upcomingLimit.getDate() + 7);

    const projectWhereClause = {
      OR: [
        { ownerId: userId },
        { members: { some: { userId } } }
      ]
    };

    const [todayTasks, overdueTasks, completedTasks, todayEvents, upcomingTasks, upcomingMilestones, upcomingProjects, upcomingEvents, openBugs] = await Promise.all([
      // Today Tasks
      prisma.task.findMany({
        where: {
          assigneeId: userId,
          status: { notIn: ['Done', 'Completed'] },
          OR: [
            { dueDate: { gte: startOfToday, lte: endOfToday } },
            { startDate: { gte: startOfToday, lte: endOfToday } }
          ]
        },
        select: { id: true, title: true, status: true, priority: true, dueDate: true, project: { select: { id: true, name: true } } },
        orderBy: { dueDate: 'asc' }
      }),

      // Overdue Tasks
      prisma.task.findMany({
        where: {
          assigneeId: userId,
          status: { notIn: ['Done', 'Completed'] },
          dueDate: { lt: startOfToday }
        },
        select: { id: true, title: true, status: true, priority: true, dueDate: true, project: { select: { id: true, name: true } } },
        orderBy: { dueDate: 'asc' }
      }),

      // Completed Tasks (Today)
      prisma.task.findMany({
        where: {
          assigneeId: userId,
          status: { in: ['Done', 'Completed'] },
          completedAt: { gte: startOfToday }
        },
        select: { id: true, title: true, status: true, priority: true, completedAt: true, project: { select: { id: true, name: true } } },
        orderBy: { completedAt: 'desc' }
      }),

      // Today Events
      prisma.calendarEvent.findMany({
        where: {
          OR: [
            { projectId: null, creatorId: userId },
            { project: projectWhereClause }
          ],
          startDateTime: { lte: endOfToday },
          endDateTime: { gte: startOfToday }
        },
        orderBy: { startDateTime: 'asc' }
      }),

      // Upcoming Deadlines - Tasks
      prisma.task.findMany({
        where: {
          assigneeId: userId,
          status: { notIn: ['Done', 'Completed'] },
          dueDate: { gt: endOfToday, lte: upcomingLimit }
        },
        select: { id: true, title: true, dueDate: true, project: { select: { id: true, name: true } } }
      }),

      // Upcoming Deadlines - Milestones
      prisma.milestone.findMany({
        where: {
          project: projectWhereClause,
          status: { notIn: ['Completed', 'Done'] },
          dueDate: { gt: endOfToday, lte: upcomingLimit }
        },
        select: { id: true, title: true, dueDate: true, project: { select: { id: true, name: true } } }
      }),

      // Upcoming Deadlines - Projects
      prisma.project.findMany({
        where: {
          ...projectWhereClause,
          status: { notIn: ['Completed', 'Done', 'Archived'] },
          dueDate: { gt: endOfToday, lte: upcomingLimit }
        },
        select: { id: true, name: true, dueDate: true }
      }),

      // Upcoming Deadlines - Calendar Events (Type: Deadline)
      prisma.calendarEvent.findMany({
        where: {
          type: 'Deadline',
          OR: [
            { projectId: null, creatorId: userId },
            { project: projectWhereClause }
          ],
          endDateTime: { gt: endOfToday, lte: upcomingLimit }
        },
        select: { id: true, title: true, endDateTime: true, project: { select: { id: true, name: true } } }
      }),

      // QA Items: Open Bugs assigned to user
      prisma.bug.findMany({
        where: {
          assigneeId: userId,
          status: { notIn: ['Resolved', 'Closed', 'Done'] }
        },
        select: { id: true, title: true, severity: true, status: true, project: { select: { id: true, name: true } } }
      })
    ]);

    // Aggregate upcoming deadlines into a simple list
    const upcomingDeadlines = [
      ...upcomingTasks.map(t => ({ id: t.id, type: 'Task', title: t.title, date: t.dueDate, projectName: t.project?.name })),
      ...upcomingMilestones.map(m => ({ id: m.id, type: 'Milestone', title: m.title, date: m.dueDate, projectName: m.project?.name })),
      ...upcomingProjects.map(p => ({ id: p.id, type: 'Project', title: p.name, date: p.dueDate, projectName: p.name })),
      ...upcomingEvents.map(e => ({ id: e.id, type: 'Event', title: e.title, date: e.endDateTime, projectName: e.project?.name }))
    ].sort((a, b) => new Date(a.date) - new Date(b.date));

    res.json({
      success: true,
      myDay: {
        todayTasks,
        overdueTasks,
        completedTasks,
        todayEvents,
        upcomingDeadlines,
        qaItems: {
          openBugs
        }
      }
    });
  } catch (error) {
    console.error('My Day error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};
