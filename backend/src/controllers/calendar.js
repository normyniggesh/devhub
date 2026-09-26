const prisma = require('../db');
const { checkProjectAccess } = require('../utils/projectAccess');
const { createAuditLog } = require('../utils/audit');

exports.getEvents = async (req, res) => {
  try {
    const { projectId, start, end } = req.query;
    let whereClause = {};
    let accessibleProjectIds = [];

    if (projectId) {
      const access = await checkProjectAccess(projectId, req.userId);
      if (!access.accessible) return res.status(403).json({ success: false, message: 'Forbidden' });
      whereClause.projectId = projectId;
      accessibleProjectIds = [projectId];
    } else {
      const userProjects = await prisma.project.findMany({
        where: {
          OR: [
            { ownerId: req.userId },
            { members: { some: { userId: req.userId } } }
          ]
        },
        select: { id: true }
      });
      accessibleProjectIds = userProjects.map(p => p.id);

      whereClause = {
        OR: [
          { projectId: null, creatorId: req.userId },
          { projectId: { in: accessibleProjectIds } }
        ]
      };
    }

    if (start || end) {
      whereClause.startDateTime = {};
      if (start) whereClause.startDateTime.gte = new Date(start);
      if (end) whereClause.startDateTime.lte = new Date(end);
    }

    const events = await prisma.calendarEvent.findMany({
      where: whereClause,
      include: {
        project: { select: { id: true, name: true } },
        task: { select: { id: true, title: true } },
        creator: { select: { id: true, name: true, email: true } }
      },
      orderBy: { startDateTime: 'asc' }
    });

    const derivedEvents = [];

    if (accessibleProjectIds.length > 0) {
      // 1. Derived Projects
      const projects = await prisma.project.findMany({
        where: { id: { in: accessibleProjectIds } },
        select: { id: true, name: true, startDate: true, dueDate: true }
      });

      for (const proj of projects) {
        if (proj.startDate) {
          derivedEvents.push({
            id: `derived-project-${proj.id}-start`,
            title: `${proj.name} — Start`,
            startDateTime: proj.startDate,
            endDateTime: proj.startDate,
            allDay: true,
            projectId: proj.id,
            project: { id: proj.id, name: proj.name },
            type: 'Project Start',
            derived: true,
            readOnly: true,
            sourceType: 'project',
            sourceId: proj.id
          });
        }
        if (proj.dueDate) {
          derivedEvents.push({
            id: `derived-project-${proj.id}-due`,
            title: `${proj.name} — Deadline`,
            startDateTime: proj.dueDate,
            endDateTime: proj.dueDate,
            allDay: true,
            projectId: proj.id,
            project: { id: proj.id, name: proj.name },
            type: 'Project Deadline',
            derived: true,
            readOnly: true,
            sourceType: 'project',
            sourceId: proj.id
          });
        }
      }

      // 2. Derived Tasks
      const tasks = await prisma.task.findMany({
        where: { projectId: { in: accessibleProjectIds } },
        select: { id: true, title: true, startDate: true, dueDate: true, projectId: true, project: { select: { id: true, name: true } } }
      });

      for (const task of tasks) {
        if (task.startDate) {
          derivedEvents.push({
            id: `derived-task-${task.id}-start`,
            title: `${task.title}`,
            startDateTime: task.startDate,
            endDateTime: task.startDate,
            allDay: true,
            projectId: task.projectId,
            project: task.project,
            type: 'Task Start',
            derived: true,
            readOnly: true,
            sourceType: 'task',
            sourceId: task.id
          });
        }
        if (task.dueDate) {
          derivedEvents.push({
            id: `derived-task-${task.id}-due`,
            title: `${task.title} — Due`,
            startDateTime: task.dueDate,
            endDateTime: task.dueDate,
            allDay: true,
            projectId: task.projectId,
            project: task.project,
            type: 'Task Due',
            derived: true,
            readOnly: true,
            sourceType: 'task',
            sourceId: task.id
          });
        }
      }

    }

    let allEvents = [...events, ...derivedEvents];

    if (start || end) {
      const s = start ? new Date(start) : null;
      const e = end ? new Date(end) : null;
      allEvents = allEvents.filter(ev => {
        const evStart = new Date(ev.startDateTime);
        if (s && evStart < s) return false;
        if (e && evStart > e) return false;
        return true;
      });
    }

    allEvents.sort((a, b) => new Date(a.startDateTime) - new Date(b.startDateTime));

    res.json({ success: true, events: allEvents });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

exports.getEventById = async (req, res) => {
  try {
    const { id } = req.params;
    if (id.startsWith('derived-')) {
      return res.status(400).json({ success: false, message: 'Cannot fetch derived calendar entries directly' });
    }

    const event = await prisma.calendarEvent.findUnique({
      where: { id },
      include: {
        project: { select: { id: true, name: true } },
        task: { select: { id: true, title: true } },
        creator: { select: { id: true, name: true, email: true } }
      }
    });

    if (!event) return res.status(404).json({ success: false, message: 'Event not found' });

    if (event.projectId) {
      const access = await checkProjectAccess(event.projectId, req.userId);
      if (!access.accessible) return res.status(403).json({ success: false, message: 'Forbidden' });
    } else {
      if (event.creatorId !== req.userId) return res.status(403).json({ success: false, message: 'Forbidden' });
    }

    res.json({ success: true, event });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

exports.createEvent = async (req, res) => {
  try {
    const { title, description, type, start, end, allDay, projectId, taskId, location } = req.body;

    if (!title || typeof title !== 'string' || !title.trim()) {
      return res.status(400).json({ success: false, message: 'Title is required' });
    }

    if (!start || isNaN(Date.parse(start))) {
      return res.status(400).json({ success: false, message: 'Valid start date/time is required' });
    }

    if (!end || isNaN(Date.parse(end))) {
      return res.status(400).json({ success: false, message: 'Valid end date/time is required' });
    }

    const startDateTime = new Date(start);
    const endDateTime = new Date(end);

    if (endDateTime < startDateTime) {
      return res.status(400).json({ success: false, message: 'End time cannot be earlier than start time' });
    }

    if (projectId) {
      const access = await checkProjectAccess(projectId, req.userId);
      if (!access.accessible) return res.status(403).json({ success: false, message: 'Forbidden' });
      if (access.role === 'Viewer') return res.status(403).json({ success: false, message: 'Viewers cannot create events' });
    }

    if (taskId) {
      const task = await prisma.task.findUnique({ where: { id: taskId } });
      if (!task) return res.status(409).json({ success: false, message: 'Task not found' });

      if (projectId) {
        if (task.projectId !== projectId) {
          return res.status(409).json({ success: false, message: 'Task belongs to a different project' });
        }
      } else {
        const taskAccess = await checkProjectAccess(task.projectId, req.userId);
        if (!taskAccess.accessible) return res.status(403).json({ success: false, message: 'Forbidden: Cannot access task project' });
      }
    }

    const event = await prisma.calendarEvent.create({
      data: {
        title: title.trim(),
        description: description?.trim() || null,
        type: type?.trim() || 'Meeting',
        startDateTime,
        endDateTime,
        allDay: Boolean(allDay),
        location: location?.trim() || null,
        projectId: projectId || null,
        taskId: taskId || null,
        creatorId: req.userId
      },
      include: {
        project: { select: { id: true, name: true } },
        task: { select: { id: true, title: true } },
        creator: { select: { id: true, name: true } }
      }
    });

    createAuditLog({
      userId: req.userId,
      action: 'Created',
      entityType: 'CalendarEvent',
      entityId: event.id,
      metadata: { title: event.title }
    });

    res.status(201).json({ success: true, event });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

exports.updateEvent = async (req, res) => {
  try {
    const { id } = req.params;
    if (id.startsWith('derived-')) {
      return res.status(400).json({ success: false, message: 'Cannot modify derived calendar entries' });
    }

    const { title, description, type, start, end, allDay, taskId, location } = req.body;

    const event = await prisma.calendarEvent.findUnique({ where: { id } });
    if (!event) return res.status(404).json({ success: false, message: 'Event not found' });

    if (event.projectId) {
      const access = await checkProjectAccess(event.projectId, req.userId);
      if (!access.accessible) return res.status(403).json({ success: false, message: 'Forbidden' });
      if (access.role === 'Viewer') return res.status(403).json({ success: false, message: 'Viewers cannot update events' });
    } else {
      if (event.creatorId !== req.userId) return res.status(403).json({ success: false, message: 'Forbidden' });
    }

    const updateData = {};

    if (title !== undefined) {
      if (!title || typeof title !== 'string' || !title.trim()) return res.status(400).json({ success: false, message: 'Title is required' });
      updateData.title = title.trim();
    }

    if (start !== undefined || end !== undefined) {
      const newStart = start !== undefined ? start : event.startDateTime;
      const newEnd = end !== undefined ? end : event.endDateTime;

      if (isNaN(Date.parse(newStart)) || isNaN(Date.parse(newEnd))) {
        return res.status(400).json({ success: false, message: 'Valid dates are required' });
      }

      const startDateTime = new Date(newStart);
      const endDateTime = new Date(newEnd);

      if (endDateTime < startDateTime) {
        return res.status(400).json({ success: false, message: 'End time cannot be earlier than start time' });
      }

      updateData.startDateTime = startDateTime;
      updateData.endDateTime = endDateTime;
    }

    if (description !== undefined) updateData.description = description?.trim() || null;
    if (type !== undefined) updateData.type = type?.trim() || 'Meeting';
    if (allDay !== undefined) updateData.allDay = Boolean(allDay);
    if (location !== undefined) updateData.location = location?.trim() || null;

    if (taskId !== undefined) {
      if (taskId) {
        const task = await prisma.task.findUnique({ where: { id: taskId } });
        if (!task) return res.status(409).json({ success: false, message: 'Task not found' });

        if (event.projectId) {
          if (task.projectId !== event.projectId) {
            return res.status(409).json({ success: false, message: 'Task belongs to a different project' });
          }
        } else {
          const taskAccess = await checkProjectAccess(task.projectId, req.userId);
          if (!taskAccess.accessible) return res.status(403).json({ success: false, message: 'Forbidden: Cannot access task project' });
        }
      }
      updateData.taskId = taskId || null;
    }

    const updatedEvent = await prisma.calendarEvent.update({
      where: { id },
      data: updateData,
      include: {
        project: { select: { id: true, name: true } },
        task: { select: { id: true, title: true } },
        creator: { select: { id: true, name: true } }
      }
    });

    createAuditLog({
      userId: req.userId,
      action: 'Updated',
      entityType: 'CalendarEvent',
      entityId: id,
      metadata: { title: updatedEvent.title }
    });

    res.json({ success: true, event: updatedEvent });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

exports.deleteEvent = async (req, res) => {
  try {
    const { id } = req.params;
    if (id.startsWith('derived-')) {
      return res.status(400).json({ success: false, message: 'Cannot modify derived calendar entries' });
    }

    const event = await prisma.calendarEvent.findUnique({ where: { id } });
    if (!event) return res.status(404).json({ success: false, message: 'Event not found' });

    if (event.projectId) {
      const access = await checkProjectAccess(event.projectId, req.userId);
      if (!access.accessible) return res.status(403).json({ success: false, message: 'Forbidden' });
      if (access.role !== 'Admin' && access.role !== 'Owner') {
        return res.status(403).json({ success: false, message: 'Only Admins or Owners can delete project events' });
      }
    } else {
      if (event.creatorId !== req.userId) return res.status(403).json({ success: false, message: 'Forbidden' });
    }

    await prisma.calendarEvent.delete({ where: { id } });

    createAuditLog({
      userId: req.userId,
      action: 'Deleted',
      entityType: 'CalendarEvent',
      entityId: id,
      metadata: { title: event.title }
    });

    res.json({ success: true, message: 'Event deleted successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};
