const prisma = require('../db');
const { TEAM_ROLES, DEFAULT_TEAM_STORAGE_BYTES } = require('../constants/storage');
const storageQuotaService = require('./storageQuotaService');

/**
 * Authoritative Team Service
 *
 * Manages:
 * - Team creation (automatically provisions 10 GB TeamStorageAllocation)
 * - Team memberships (Leader / Member roles)
 * - Team queries
 */
class TeamService {
  /**
   * Create a new Team and automatically assign 10 GB storage allocation.
   * Creator is optionally added as initial Leader.
   */
  async createTeam({ name, description, createdById, addCreatorAsLeader = true }) {
    if (!name || !name.trim()) throw new Error('Team name is required');
    if (!createdById) throw new Error('createdById is required');

    const cleanName = name.trim();

    const team = await prisma.team.create({
      data: {
        name: cleanName,
        description: description ? description.trim() : null,
        createdById
      }
    });

    // Automatically create 10 GB team storage allocation
    await storageQuotaService.ensureTeamAllocation(team.id, DEFAULT_TEAM_STORAGE_BYTES);

    // Optionally add creator as initial Team Leader
    if (addCreatorAsLeader) {
      await prisma.teamMember.create({
        data: {
          teamId: team.id,
          userId: createdById,
          role: TEAM_ROLES.LEADER
        }
      });
    }

    return await this.getTeamById(team.id);
  }

  /**
   * Retrieve a team by ID with its members and storage quota
   */
  async getTeamById(teamId) {
    if (!teamId) return null;
    const team = await prisma.team.findUnique({
      where: { id: teamId },
      include: {
        members: {
          include: {
            user: { select: { id: true, name: true, email: true, avatarUrl: true } }
          }
        },
        storageAllocation: true
      }
    });

    if (!team) return null;
    const quota = await storageQuotaService.getTeamQuota(teamId);

    return {
      ...team,
      quota
    };
  }

  /**
   * List all teams a user belongs to
   */
  async getUserTeams(userId) {
    if (!userId) return [];
    const memberships = await prisma.teamMember.findMany({
      where: { userId },
      include: {
        team: {
          include: {
            members: {
              include: { user: { select: { id: true, name: true, email: true } } }
            },
            storageAllocation: true
          }
        }
      }
    });

    return memberships.map(m => ({
      ...m.team,
      myRole: m.role,
      joinedAt: m.joinedAt
    }));
  }

  /**
   * Add a member to a team
   */
  async addMember({ teamId, userId, role = TEAM_ROLES.MEMBER }) {
    if (!teamId || !userId) throw new Error('teamId and userId are required');

    const existing = await prisma.teamMember.findUnique({
      where: { teamId_userId: { teamId, userId } }
    });

    if (existing) {
      return existing;
    }

    return await prisma.teamMember.create({
      data: {
        teamId,
        userId,
        role: role === TEAM_ROLES.LEADER ? TEAM_ROLES.LEADER : TEAM_ROLES.MEMBER
      }
    });
  }

  /**
   * Remove a member from a team
   */
  async removeMember({ teamId, userId }) {
    if (!teamId || !userId) throw new Error('teamId and userId are required');

    return await prisma.teamMember.deleteMany({
      where: { teamId, userId }
    });
  }

  /**
   * Appoint or change member role (e.g. appoint Team Leader)
   */
  async updateMemberRole({ teamId, userId, role }) {
    if (!teamId || !userId || !role) throw new Error('teamId, userId and role are required');

    return await prisma.teamMember.update({
      where: { teamId_userId: { teamId, userId } },
      data: {
        role: role === TEAM_ROLES.LEADER ? TEAM_ROLES.LEADER : TEAM_ROLES.MEMBER
      }
    });
  }

  /**
   * Delete team and its associated files, folders, members, allocation
   */
  async deleteTeam(teamId) {
    if (!teamId) throw new Error('teamId is required');
    await prisma.file.deleteMany({ where: { teamId } });
    await prisma.folder.deleteMany({ where: { teamId } });
    await prisma.teamMember.deleteMany({ where: { teamId } });
    await prisma.teamStorageAllocation.deleteMany({ where: { teamId } });
    return await prisma.team.delete({ where: { id: teamId } });
  }
}

module.exports = new TeamService();
