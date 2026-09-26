const prisma = require('../db');
const { checkProjectAccess } = require('../utils/projectAccess');
const { createAuditLog } = require('../utils/audit');

exports.getEvents = async (req, res) => {
  try {
    const { projectId, start, end } = req.query;
    let whereClause = {};

    if (projectId) {
      const access = await checkProjectAccess(projectId, req.userId);
      if (!access.accessible) return res.status(403).json({ success: false, message: 'Forbidden' });
      whereClause.projectId = projectId;
    } else {
      whereClause = {
        OR: [
          // Personal events (no project) created by user
          { projectId: null, creatorId: req.userId },
          // Project events accessible by user
          {
            project: {
              OR: [
                { ownerId: req.userId },
                { members: { some: { userId: req.userId } } }
              ]
            }
          }
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

    res.json({ success: true, events });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

exports.getEventById = async (req, res) => {
  try {
    const { id } = req.params;
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
      if (!access.accessible) return res.status(403).json({ success: false, message: 'Forbidden: Cannot access project' });
      // Viewers cannot create events
      if (access.role === 'Viewer') return res.status(403).json({ success: false, message: 'Viewers cannot create project events' });

      if (taskId) {
        const task = await prisma.task.findUnique({ where: { id: taskId } });
        if (!task || task.projectId !== projectId) {
          return res.status(409).json({ success: false, message: 'Task not found or belongs to a different project' });
        }
      }
    } else {
      // Personal event
      // If taskId is provided without projectId, we should verify the task exists and the user has access to its project.
      // But typically, a task-specific event should have projectId populated.
      // The instructions: "if taskId is supplied without projectId, determine whether the existing schema/business model safely allows this"
      // If we allow it, we must verify user has access to task's project. Let's enforce that taskId requires projectId for simplicity and data integrity, or verify it.
      if (taskId) {
        const task = await prisma.task.findUnique({ where: { id: taskId } });
        if (!task) return res.status(409).json({ success: false, message: 'Task not found' });
        
        const access = await checkProjectAccess(task.projectId, req.userId);
        if (!access.accessible) return res.status(403).json({ success: false, message: 'Forbidden: Cannot access task project' });
        
        // Let's auto-fill the projectId for consistency since the schema allows it, and logically tasks belong to projects.
        // Actually, the requirements say: "If the current schema requires projectId whenever taskId is used, enforce that." The schema doesn't strictly require it at DB level, but logically it's better. We'll leave projectId null if client sent null, but still verify task access.
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
        projectId: projectId || null,
        taskId: taskId || null,
        location: location?.trim() || null,
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
