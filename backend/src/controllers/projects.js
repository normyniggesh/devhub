const prisma = require('../db');
const { createAuditLog } = require('../utils/audit');

exports.getProjects = async (req, res) => {
  try {
    const projects = await prisma.project.findMany({
      where: {
        OR: [
          { ownerId: req.userId },
          { members: { some: { userId: req.userId } } }
        ]
      },
      include: {
        owner: {
          select: { id: true, name: true, email: true, avatarUrl: true }
        },
        members: {
          include: {
            user: { select: { id: true, name: true, avatarUrl: true } }
          }
        },
        tasks: {
          select: { id: true, status: true }
        },
        _count: {
          select: {
            bugs: { where: { status: 'Open' } }
          }
        }
      }
    });

    res.json({ success: true, projects });
  } catch (error) {
    console.error('getProjects error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

exports.getProjectById = async (req, res) => {
  try {
    const { id } = req.params;

    const project = await prisma.project.findUnique({
      where: { id },
      include: {
        owner: {
          select: { id: true, name: true, email: true, avatarUrl: true }
        },
        members: {
          include: {
            user: { select: { id: true, name: true, email: true, avatarUrl: true } }
          }
        }
      }
    });

    if (!project) {
      return res.status(404).json({ success: false, message: 'Project not found' });
    }

    const isOwner = project.ownerId === req.userId;
    const memberRecord = project.members.find(m => m.userId === req.userId);

    if (!isOwner && !memberRecord) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }

    // Attach current user role to response for convenience
    const role = isOwner ? 'Admin' : memberRecord.role;

    res.json({ success: true, project: { ...project, currentUserRole: role } });
  } catch (error) {
    console.error('getProjectById error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

exports.createProject = async (req, res) => {
  try {
    const { name, description, status, priority, category, startDate, dueDate } = req.body;

    if (!name || typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ success: false, message: 'Project name is required' });
    }

    const projectData = {
      name: name.trim(),
      description: description?.trim() || null,
      status: status?.trim() || 'Active',
      priority: priority?.trim() || 'Medium',
      category: category?.trim() || null,
      startDate: startDate ? new Date(startDate) : null,
      dueDate: dueDate ? new Date(dueDate) : null,
      ownerId: req.userId,
      members: {
        create: {
          userId: req.userId,
          role: 'Admin'
        }
      }
    };

    const project = await prisma.project.create({
      data: projectData,
      include: {
        owner: { select: { id: true, name: true, email: true, avatarUrl: true } },
        members: { select: { role: true, userId: true } }
      }
    });

    createAuditLog({
      userId: req.userId,
      action: 'Created',
      entityType: 'Project',
      entityId: project.id,
      metadata: { name: project.name }
    });

    res.status(201).json({ success: true, project });
  } catch (error) {
    console.error('createProject error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

exports.updateProject = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, status, priority, category, startDate, dueDate } = req.body;

    const project = await prisma.project.findUnique({
      where: { id },
      include: { members: { where: { userId: req.userId } } }
    });

    if (!project) {
      return res.status(404).json({ success: false, message: 'Project not found' });
    }

    const isOwner = project.ownerId === req.userId;
    const memberRecord = project.members[0];

    if (!isOwner && !memberRecord) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }

    const role = isOwner ? 'Admin' : memberRecord.role;

    if (role === 'Viewer') {
      return res.status(403).json({ success: false, message: 'Viewers cannot update projects' });
    }

    const updateData = {};
    if (name !== undefined) {
      if (!name || typeof name !== 'string' || !name.trim()) {
        return res.status(400).json({ success: false, message: 'Project name is required' });
      }
      updateData.name = name.trim();
    }
    if (description !== undefined) updateData.description = description?.trim() || null;
    if (status !== undefined) updateData.status = status?.trim() || 'Active';
    if (priority !== undefined) updateData.priority = priority?.trim() || 'Medium';
    if (category !== undefined) updateData.category = category?.trim() || null;
    if (startDate !== undefined) updateData.startDate = startDate ? new Date(startDate) : null;
    if (dueDate !== undefined) updateData.dueDate = dueDate ? new Date(dueDate) : null;

    const updatedProject = await prisma.project.update({
      where: { id },
      data: updateData,
      include: {
        owner: { select: { id: true, name: true, email: true, avatarUrl: true } }
      }
    });

    createAuditLog({
      userId: req.userId,
      action: 'Updated',
      entityType: 'Project',
      entityId: id,
      metadata: { name: updatedProject.name }
    });

    res.json({ success: true, project: updatedProject });
  } catch (error) {
    console.error('updateProject error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

exports.deleteProject = async (req, res) => {
  try {
    const { id } = req.params;

    const project = await prisma.project.findUnique({
      where: { id },
      include: { members: { where: { userId: req.userId } } }
    });

    if (!project) {
      return res.status(404).json({ success: false, message: 'Project not found' });
    }

    const isOwner = project.ownerId === req.userId;
    const memberRecord = project.members[0];

    if (!isOwner && (!memberRecord || memberRecord.role !== 'Admin')) {
      return res.status(403).json({ success: false, message: 'Only Admins can delete projects' });
    }

    // Try deleting. Will fail automatically with P2003 if there are tasks/bugs since cascading isn't set up.
    // However, we MUST delete ProjectMembers first since they are strictly linked to the project and aren't "content" per se.
    await prisma.$transaction(async (tx) => {
      // First, attempt to check if other records exist to give a nice message instead of Prisma error, 
      // but catching P2003 is simpler.
      
      // We manually delete project members as it's safe and required to delete an empty project.
      await tx.projectMember.deleteMany({
        where: { projectId: id }
      });

      await tx.project.delete({
        where: { id }
      });
    });

    createAuditLog({
      userId: req.userId,
      action: 'Deleted',
      entityType: 'Project',
      entityId: id,
      metadata: { name: project.name }
    });

    res.json({ success: true, message: 'Project deleted successfully' });
  } catch (error) {
    if (error.code === 'P2003') {
      return res.status(409).json({ 
        success: false, 
        message: 'Cannot delete project because it still contains dependent records (e.g. tasks, files). Please delete them first.' 
      });
    }
    console.error('deleteProject error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

exports.addProjectMember = async (req, res) => {
  try {
    const { id: projectId } = req.params;
    const { userId, role } = req.body;

    if (!userId) {
      return res.status(400).json({ success: false, message: 'userId is required' });
    }

    const project = await prisma.project.findUnique({
      where: { id: projectId },
      include: { members: { where: { userId: req.userId } } }
    });

    if (!project) {
      return res.status(404).json({ success: false, message: 'Project not found' });
    }

    const isOwner = project.ownerId === req.userId;
    const memberRecord = project.members[0];

    if (!isOwner && (!memberRecord || memberRecord.role !== 'Admin')) {
      return res.status(403).json({ success: false, message: 'Only Admins or Owners can add members' });
    }

    // Check if already member
    const existingMember = await prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId, userId } }
    });

    if (existingMember) {
      return res.status(400).json({ success: false, message: 'User is already a member of this project' });
    }

    if (project.ownerId === userId) {
      return res.status(400).json({ success: false, message: 'User is the owner of this project' });
    }

    const newMember = await prisma.projectMember.create({
      data: {
        projectId,
        userId,
        role: role || 'Viewer'
      },
      include: {
        user: { select: { id: true, name: true, email: true, avatarUrl: true } }
      }
    });

    createAuditLog({
      userId: req.userId,
      action: 'Added',
      entityType: 'ProjectMember',
      entityId: newMember.id,
      metadata: { projectName: project.name, addedUserName: newMember.user.name }
    });

    res.status(201).json({ success: true, member: newMember });
  } catch (error) {
    console.error('addProjectMember error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

exports.removeProjectMember = async (req, res) => {
  try {
    const { id: projectId, userId } = req.params;

    const project = await prisma.project.findUnique({
      where: { id: projectId },
      include: { members: { where: { userId: req.userId } } }
    });

    if (!project) {
      return res.status(404).json({ success: false, message: 'Project not found' });
    }

    const isOwner = project.ownerId === req.userId;
    const memberRecord = project.members[0];

    // Only Admin, Owner, or the user themselves can remove
    if (!isOwner && (!memberRecord || memberRecord.role !== 'Admin') && req.userId !== userId) {
      return res.status(403).json({ success: false, message: 'Only Admins or Owners can remove other members' });
    }

    const existingMember = await prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId, userId } },
      include: { user: { select: { name: true } } }
    });

    if (!existingMember) {
      return res.status(404).json({ success: false, message: 'Member not found in project' });
    }

    // Safely remove assignee from tasks
    await prisma.$transaction(async (tx) => {
      await tx.task.updateMany({
        where: { projectId, assigneeId: userId },
        data: { assigneeId: null }
      });

      await tx.projectMember.delete({
        where: { projectId_userId: { projectId, userId } }
      });
    });

    createAuditLog({
      userId: req.userId,
      action: 'Removed',
      entityType: 'ProjectMember',
      entityId: existingMember.id,
      metadata: { projectName: project.name, removedUserName: existingMember.user.name }
    });

    res.json({ success: true, message: 'Member removed successfully' });
  } catch (error) {
    console.error('removeProjectMember error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};
