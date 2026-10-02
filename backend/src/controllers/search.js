const prisma = require('../db');

exports.globalSearch = async (req, res) => {
  try {
    const query = (req.query.q || '').trim();
    if (!query || query.length < 2) {
      return res.json({
        success: true,
        results: {
          projects: [],
          tasks: [],
          files: [],
          users: [],
          testCases: [],
          repositories: [],
          calendarEvents: []
        }
      });
    }

    const userId = req.userId;
    const userRole = req.user?.role;
    const isAdmin = userRole === 'Admin';

    // 1. Find accessible project IDs for the user
    let accessibleProjectIds = [];
    if (!isAdmin) {
      const userProjects = await prisma.project.findMany({
        where: {
          OR: [
            { ownerId: userId },
            { members: { some: { userId } } }
          ]
        },
        select: { id: true }
      });
      accessibleProjectIds = userProjects.map(p => p.id);
    }

    const projectFilter = isAdmin ? {} : { id: { in: accessibleProjectIds } };
    const itemProjectFilter = isAdmin ? {} : { projectId: { in: accessibleProjectIds } };

    // Run parallel queries across DEVHUB entities
    const [projects, tasks, files, users, testCases, repositories, calendarEvents] = await Promise.all([
      // Projects
      prisma.project.findMany({
        where: {
          AND: [
            projectFilter,
            {
              OR: [
                { name: { contains: query, mode: 'insensitive' } },
                { description: { contains: query, mode: 'insensitive' } },
                { category: { contains: query, mode: 'insensitive' } }
              ]
            }
          ]
        },
        select: { id: true, name: true, description: true, status: true, category: true },
        take: 6
      }),

      // Tasks
      prisma.task.findMany({
        where: {
          AND: [
            itemProjectFilter,
            {
              OR: [
                { title: { contains: query, mode: 'insensitive' } },
                { description: { contains: query, mode: 'insensitive' } }
              ]
            }
          ]
        },
        select: {
          id: true,
          title: true,
          status: true,
          priority: true,
          projectId: true,
          project: { select: { id: true, name: true } }
        },
        take: 6
      }),

      // Files
      prisma.file.findMany({
        where: {
          AND: [
            itemProjectFilter,
            { name: { contains: query, mode: 'insensitive' } }
          ]
        },
        select: {
          id: true,
          name: true,
          type: true,
          size: true,
          projectId: true,
          project: { select: { id: true, name: true } }
        },
        take: 6
      }),

      // Team Members
      prisma.user.findMany({
        where: {
          OR: [
            { name: { contains: query, mode: 'insensitive' } },
            { email: { contains: query, mode: 'insensitive' } }
          ]
        },
        select: { id: true, name: true, email: true, role: true, avatarUrl: true },
        take: 6
      }),

      // QA Test Cases
      prisma.testCase.findMany({
        where: {
          AND: [
            itemProjectFilter,
            {
              OR: [
                { title: { contains: query, mode: 'insensitive' } },
                { module: { contains: query, mode: 'insensitive' } }
              ]
            }
          ]
        },
        select: {
          id: true,
          title: true,
          status: true,
          module: true,
          projectId: true,
          project: { select: { id: true, name: true } }
        },
        take: 6
      }),

      // GitHub Repositories
      prisma.repository.findMany({
        where: {
          OR: [
            { name: { contains: query, mode: 'insensitive' } },
            { owner: { contains: query, mode: 'insensitive' } },
            { description: { contains: query, mode: 'insensitive' } }
          ]
        },
        select: { id: true, name: true, owner: true, url: true, description: true },
        take: 6
      }),

      // Calendar Events
      prisma.calendarEvent.findMany({
        where: {
          AND: [
            isAdmin ? {} : {
              OR: [
                { creatorId: userId },
                { projectId: { in: accessibleProjectIds } }
              ]
            },
            {
              OR: [
                { title: { contains: query, mode: 'insensitive' } },
                { description: { contains: query, mode: 'insensitive' } },
                { location: { contains: query, mode: 'insensitive' } }
              ]
            }
          ]
        },
        select: {
          id: true,
          title: true,
          type: true,
          startDateTime: true,
          endDateTime: true,
          location: true
        },
        take: 6
      })
    ]);

    res.json({
      success: true,
      query,
      results: {
        projects,
        tasks,
        files,
        users,
        testCases,
        repositories,
        calendarEvents
      }
    });
  } catch (error) {
    console.error('Global search error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};
