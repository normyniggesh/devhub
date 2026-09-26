const prisma = require('../db');
const { checkProjectAccess } = require('../utils/projectAccess');
const { createAuditLog } = require('../utils/audit');

exports.getTasks = async (req, res) => {
  try {
    const { projectId } = req.query;

    let whereClause = {};

    if (projectId) {
      const access = await checkProjectAccess(projectId, req.userId);
      if (!access.accessible) {
        return res.status(403).json({ success: false, message: 'Forbidden' });
      }
      whereClause.projectId = projectId;
    } else {
      // If no projectId is provided, fetch all tasks for projects the user has access to
      whereClause = {
        project: {
          OR: [
            { ownerId: req.userId },
            { members: { some: { userId: req.userId } } }
          ]
        }
      };
    }

    const tasks = await prisma.task.findMany({
      where: whereClause,
      include: {
        project: { select: { id: true, name: true } },
        assignee: { select: { id: true, name: true, email: true, avatarUrl: true } },
        creator: { select: { id: true, name: true, email: true, avatarUrl: true } }
      },
      orderBy: { createdAt: 'desc' }
    });

    res.json({ success: true, tasks });
  } catch (error) {
    console.error('getTasks error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

exports.getTaskById = async (req, res) => {
  try {
    const { id } = req.params;

    const task = await prisma.task.findUnique({
      where: { id },
      include: {
        project: { select: { id: true, name: true } },
        assignee: { select: { id: true, name: true, email: true, avatarUrl: true } },
        creator: { select: { id: true, name: true, email: true, avatarUrl: true } }
      }
    });

    if (!task) {
      return res.status(404).json({ success: false, message: 'Task not found' });
    }

    const access = await checkProjectAccess(task.projectId, req.userId);
    if (!access.accessible) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }

    res.json({ success: true, task: { ...task, currentUserRole: access.role } });
  } catch (error) {
    console.error('getTaskById error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

exports.createTask = async (req, res) => {
  try {
    const { projectId, title, description, status, priority, assigneeId, startDate, dueDate } = req.body;

    if (!projectId || !title || typeof title !== 'string' || !title.trim()) {
      return res.status(400).json({ success: false, message: 'projectId and title are required' });
    }

    const access = await checkProjectAccess(projectId, req.userId);
    if (!access.accessible) {
      return res.status(404).json({ success: false, message: 'Project not found or inaccessible' });
    }

    if (access.role === 'Viewer') {
      return res.status(403).json({ success: false, message: 'Viewers cannot create tasks' });
    }

    if (assigneeId) {
      // Check if assignee is in project
      const assigneeAccess = await checkProjectAccess(projectId, assigneeId);
      if (!assigneeAccess.accessible) {
        return res.status(400).json({ success: false, message: 'Assignee must be a member of the project' });
      }
    }

    const taskStatus = status?.trim() || 'To Do';
    const isDone = taskStatus === 'Done' || taskStatus === 'Completed';

    const taskData = {
      projectId,
      title: title.trim(),
      description: description?.trim() || null,
      status: taskStatus,
      priority: priority?.trim() || 'Medium',
      assigneeId: assigneeId || null,
      creatorId: req.userId,
      startDate: startDate ? new Date(startDate) : null,
      dueDate: dueDate ? new Date(dueDate) : null,
      completedAt: isDone ? new Date() : null
    };

    const task = await prisma.task.create({
      data: taskData,
      include: {
        project: { select: { id: true, name: true } },
        assignee: { select: { id: true, name: true, email: true, avatarUrl: true } },
        creator: { select: { id: true, name: true, email: true, avatarUrl: true } }
      }
    });

    createAuditLog({
      userId: req.userId,
      action: 'Created',
      entityType: 'Task',
      entityId: task.id,
      metadata: { title: task.title, status: task.status }
    });

    res.status(201).json({ success: true, task });
  } catch (error) {
    console.error('createTask error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

exports.updateTask = async (req, res) => {
  try {
    const { id } = req.params;
    const { title, description, status, priority, assigneeId, startDate, dueDate } = req.body;

    const task = await prisma.task.findUnique({ where: { id } });
    if (!task) {
      return res.status(404).json({ success: false, message: 'Task not found' });
    }

    const access = await checkProjectAccess(task.projectId, req.userId);
    if (!access.accessible) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }

    if (access.role === 'Viewer') {
      return res.status(403).json({ success: false, message: 'Viewers cannot update tasks' });
    }

    if (assigneeId !== undefined && assigneeId !== null && assigneeId !== task.assigneeId) {
      const assigneeAccess = await checkProjectAccess(task.projectId, assigneeId);
      if (!assigneeAccess.accessible) {
        return res.status(400).json({ success: false, message: 'Assignee must be a member of the project' });
      }
    }

    const updateData = {};
    if (title !== undefined) {
      if (!title || typeof title !== 'string' || !title.trim()) {
        return res.status(400).json({ success: false, message: 'Title is required' });
      }
      updateData.title = title.trim();
    }

    if (description !== undefined) updateData.description = description?.trim() || null;
    if (priority !== undefined) updateData.priority = priority?.trim() || 'Medium';
    if (assigneeId !== undefined) updateData.assigneeId = assigneeId || null;
    if (startDate !== undefined) updateData.startDate = startDate ? new Date(startDate) : null;
    if (dueDate !== undefined) updateData.dueDate = dueDate ? new Date(dueDate) : null;

    if (status !== undefined) {
      const taskStatus = status?.trim() || 'To Do';
      updateData.status = taskStatus;
      const isDone = taskStatus === 'Done' || taskStatus === 'Completed';

      if (isDone && !task.completedAt) {
        updateData.completedAt = new Date();
      } else if (!isDone && task.completedAt) {
        updateData.completedAt = null;
      }
    }

    const updatedTask = await prisma.task.update({
      where: { id },
      data: updateData,
      include: {
        project: { select: { id: true, name: true } },
        assignee: { select: { id: true, name: true, email: true, avatarUrl: true } },
        creator: { select: { id: true, name: true, email: true, avatarUrl: true } }
      }
    });

    const action = (updatedTask.status === 'Done' || updatedTask.status === 'Completed') && task.status !== updatedTask.status
      ? 'Completed'
      : 'Updated';

    createAuditLog({
      userId: req.userId,
      action,
      entityType: 'Task',
      entityId: id,
      metadata: { title: updatedTask.title, status: updatedTask.status }
    });

    res.json({ success: true, task: updatedTask });
  } catch (error) {
    console.error('updateTask error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

exports.deleteTask = async (req, res) => {
  try {
    const { id } = req.params;

    const task = await prisma.task.findUnique({ where: { id } });
    if (!task) {
      return res.status(404).json({ success: false, message: 'Task not found' });
    }

    const access = await checkProjectAccess(task.projectId, req.userId);
    if (!access.accessible) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }

    if (access.role !== 'Admin') {
      return res.status(403).json({ success: false, message: 'Only Admins can delete tasks' });
    }

    await prisma.task.delete({ where: { id } });

    createAuditLog({
      userId: req.userId,
      action: 'Deleted',
      entityType: 'Task',
      entityId: id,
      metadata: { title: task.title }
    });

    res.json({ success: true, message: 'Task deleted successfully' });
  } catch (error) {
    // If we later add foreign key checks for things depending on tasks (e.g. bugs/calendar), handle P2003
    if (error.code === 'P2003') {
      return res.status(409).json({
        success: false,
        message: 'Cannot delete task due to existing dependent records.'
      });
    }
    console.error('deleteTask error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};
