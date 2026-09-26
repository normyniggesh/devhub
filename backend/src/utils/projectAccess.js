const prisma = require('../db');

async function checkProjectAccess(projectId, userId) {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: {
      members: { where: { userId } }
    }
  });

  if (!project) return { accessible: false, role: null };

  if (project.ownerId === userId) {
    return { accessible: true, role: 'Admin', project };
  }

  const member = project.members[0];
  if (member) {
    return { accessible: true, role: member.role, project };
  }

  return { accessible: false, role: null };
}

module.exports = { checkProjectAccess };
