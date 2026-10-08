const prisma = require('../db');
const storageScopeService = require('../services/storageScopeService');

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
    const [projects, tasks, rawFiles, rawFolders, users, testCases, repositories, calendarEvents] = await Promise.all([
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

      // Files (Overfetch to allow post-filtering by storage scope)
      prisma.file.findMany({
        where: { name: { contains: query, mode: 'insensitive' } },
        select: {
          id: true,
          name: true,
          type: true,
          size: true,
          projectId: true,
          teamId: true,
          uploaderId: true,
          storageScope: true,
          project: { select: { id: true, name: true } }
        },
        take: isAdmin ? 6 : 100
      }),

      // Folders
      prisma.folder.findMany({
        where: { name: { contains: query, mode: 'insensitive' } },
        select: {
          id: true,
          name: true,
          projectId: true,
          teamId: true,
          creatorId: true,
          storageScope: true,
          project: { select: { id: true, name: true } }
        },
        take: isAdmin ? 6 : 100
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

    let files = rawFiles;
    let folders = rawFolders;

    if (!isAdmin) {
      files = [];
      for (const f of rawFiles) {
        const access = await storageScopeService.canAccess({
          user: { id: userId, role: userRole },
          scope: f.storageScope,
          ownerId: f.uploaderId,
          teamId: f.teamId,
          fileId: f.id
        });
        if (access.allowed) {
          files.push({
             id: f.id,
             name: f.name,
             type: f.type,
             size: f.size !== null && f.size !== undefined ? f.size.toString() : '0',
             projectId: f.projectId,
             project: f.project
          });
          if (files.length >= 6) break;
        }
      }

      folders = [];
      for (const f of rawFolders) {
        const access = await storageScopeService.canAccess({
          user: { id: userId, role: userRole },
          scope: f.storageScope,
          ownerId: f.creatorId,
          teamId: f.teamId,
          folderId: f.id
        });
        if (access.allowed) {
          folders.push({
             id: f.id,
             name: f.name,
             projectId: f.projectId,
             project: f.project
          });
          if (folders.length >= 6) break;
        }
      }
    } else {
      files = rawFiles.map(f => ({ id: f.id, name: f.name, type: f.type, size: f.size !== null && f.size !== undefined ? f.size.toString() : '0', projectId: f.projectId, project: f.project })).slice(0, 6);
      folders = rawFolders.map(f => ({ id: f.id, name: f.name, projectId: f.projectId, project: f.project })).slice(0, 6);
    }

    res.json({
      success: true,
      query,
      results: {
        projects,
        tasks,
        files,
        folders,
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
