const prisma = require('../db');
const { STORAGE_SCOPES, USER_ROLES, TEAM_ROLES } = require('../constants/storage');

/**
 * Authoritative Storage Scope Service for DEVHUB
 *
 * Implements the Final Storage Ownership Rules:
 * - Every DEVHUB Cloud file/folder belongs to exactly one scope: PERSONAL or TEAM.
 * - PERSONAL:
 *     - owner = userId
 *     - private by default
 *     - Admin can access
 * - TEAM:
 *     - owner scope = teamId
 *     - all active TeamMembers can access
 *     - Admin can access
 *     - users outside Team cannot access
 * - Projects are NOT storage owners.
 *     - projectId is optional organizational metadata only.
 */
class StorageScopeService {
  constructor() {
    this.SCOPES = STORAGE_SCOPES;
  }

  /**
   * Resolve and validate storage scope from request context.
   *
   * @param {Object} params
   * @param {string} [params.scope] - Explicit scope ('PERSONAL' | 'TEAM')
   * @param {string} [params.storageScope] - Explicit storageScope ('PERSONAL' | 'TEAM')
   * @param {string} [params.teamId] - Team ID (if targeting team storage)
   * @param {string} [params.projectId] - Optional project ID (organizational metadata only)
   * @returns {string} - 'PERSONAL' | 'TEAM'
   */
  resolveScope({ scope, storageScope, teamId } = {}) {
    const rawScope = (storageScope || scope || '').toUpperCase();
    if (rawScope === this.SCOPES.TEAM || rawScope === this.SCOPES.PERSONAL) {
      return rawScope;
    }

    // Default by context: if teamId is provided, default to TEAM; otherwise PERSONAL
    if (teamId) {
      return this.SCOPES.TEAM;
    }

    return this.SCOPES.PERSONAL;
  }

  /**
   * Determine storage owner details based on scope.
   *
   * @param {Object} params
   * @param {string} params.scope - 'PERSONAL' | 'TEAM'
   * @param {string} [params.userId] - User ID
   * @param {string} [params.teamId] - Team ID
   * @returns {{ scope: string, ownerId: string, ownerType: string }}
   */
  getStorageOwner({ scope, userId, teamId } = {}) {
    const resolvedScope = this.resolveScope({ scope, teamId });
    if (resolvedScope === this.SCOPES.TEAM) {
      if (!teamId) throw new Error('teamId is required for TEAM storage scope');
      return {
        scope: this.SCOPES.TEAM,
        ownerId: teamId,
        ownerType: 'Team'
      };
    }

    if (!userId) throw new Error('userId is required for PERSONAL storage scope');
    return {
      scope: this.SCOPES.PERSONAL,
      ownerId: userId,
      ownerType: 'User'
    };
  }

  /**
   * Check if a user is authorized to access a personal or team resource.
   *
   * Rules:
   * 1. Admin can access everything.
   * 2. PERSONAL: only the owner (userId) can access.
   * 3. TEAM: any active TeamMember can access.
   *
   * @param {Object} params
   * @param {Object} params.user - Authenticated user object ({ id, role })
   * @param {string} params.scope - 'PERSONAL' | 'TEAM'
   * @param {string} [params.ownerId] - User ID for personal resources
   * @param {string} [params.teamId] - Team ID for team resources
   * @returns {Promise<{ allowed: boolean, reason?: string, role?: string }>}
   */
  async canAccess({ user, scope, ownerId, teamId }) {
    if (!user) {
      return { allowed: false, reason: 'Authentication required' };
    }

    // 1. Admin has global access across DEVHUB
    if (user.role === USER_ROLES.ADMIN) {
      return { allowed: true, reason: 'Admin full access', role: 'Admin' };
    }

    const resolvedScope = this.resolveScope({ scope, teamId });

    // 2. Personal scope: private to owner
    if (resolvedScope === this.SCOPES.PERSONAL) {
      const targetUserId = ownerId || user.id;
      if (user.id === targetUserId) {
        return { allowed: true, reason: 'Personal owner access', role: 'Owner' };
      }
      return {
        allowed: false,
        reason: 'Personal storage is private to the owner'
      };
    }

    // 3. Team scope: active team members only
    if (resolvedScope === this.SCOPES.TEAM) {
      if (!teamId) {
        return { allowed: false, reason: 'teamId is required for team storage' };
      }

      const membership = await prisma.teamMember.findUnique({
        where: {
          teamId_userId: {
            teamId,
            userId: user.id
          }
        }
      });

      if (membership) {
        return {
          allowed: true,
          reason: 'Team member access',
          role: membership.role
        };
      }

      return {
        allowed: false,
        reason: 'Access denied: user is not a member of this team'
      };
    }

    return { allowed: false, reason: 'Invalid storage scope' };
  }

  /**
   * Check if a user can manage (modify/delete/rename) a resource.
   *
   * Rules:
   * 1. Admin can manage everything.
   * 2. PERSONAL: only the owner can manage.
   * 3. TEAM: Admin or Team Leader can manage.
   */
  async canManage({ user, scope, ownerId, teamId }) {
    if (!user) return { allowed: false, reason: 'Authentication required' };
    if (user.role === USER_ROLES.ADMIN) return { allowed: true, reason: 'Admin access' };

    const resolvedScope = this.resolveScope({ scope, teamId });

    if (resolvedScope === this.SCOPES.PERSONAL) {
      const targetUserId = ownerId || user.id;
      return {
        allowed: user.id === targetUserId,
        reason: user.id === targetUserId ? 'Owner management' : 'Denied'
      };
    }

    if (resolvedScope === this.SCOPES.TEAM) {
      if (!teamId) return { allowed: false, reason: 'teamId is required' };
      const membership = await prisma.teamMember.findUnique({
        where: { teamId_userId: { teamId, userId: user.id } }
      });
      const isLeader = membership && membership.role === TEAM_ROLES.LEADER;
      return {
        allowed: Boolean(isLeader),
        reason: isLeader ? 'Team leader management' : 'Leader permissions required'
      };
    }

    return { allowed: false, reason: 'Invalid scope' };
  }

  /**
   * Resolve quota source details for quota tracking.
   *
   * @param {Object} params
   * @param {string} params.scope - 'PERSONAL' | 'TEAM'
   * @param {string} [params.userId]
   * @param {string} [params.teamId]
   * @returns {{ scope: string, targetId: string, model: string }}
   */
  getQuotaSource({ scope, userId, teamId } = {}) {
    const resolvedScope = this.resolveScope({ scope, teamId });
    if (resolvedScope === this.SCOPES.TEAM) {
      if (!teamId) throw new Error('teamId required for team quota source');
      return {
        scope: this.SCOPES.TEAM,
        targetId: teamId,
        model: 'TeamStorageAllocation'
      };
    }

    if (!userId) throw new Error('userId required for personal quota source');
    return {
      scope: this.SCOPES.PERSONAL,
      targetId: userId,
      model: 'PersonalStorageAllocation'
    };
  }

  /**
   * Validates and sanitizes a File object for consistent domain shape.
   */
  validateFileShape({ storageScope, teamId, uploaderId, projectId }) {
    const scope = this.resolveScope({ storageScope, teamId });
    if (scope === this.SCOPES.TEAM && !teamId) {
      throw new Error('teamId is required when storageScope is TEAM');
    }
    if (scope === this.SCOPES.PERSONAL && !uploaderId) {
      throw new Error('uploaderId is required when storageScope is PERSONAL');
    }

    return {
      storageScope: scope,
      teamId: scope === this.SCOPES.TEAM ? teamId : null,
      uploaderId,
      projectId: projectId || null // Optional organizational metadata
    };
  }

  /**
   * Validates and sanitizes a Folder object for consistent domain shape.
   */
  validateFolderShape({ storageScope, teamId, creatorId, projectId, parentId }) {
    const scope = this.resolveScope({ storageScope, teamId });
    if (scope === this.SCOPES.TEAM && !teamId) {
      throw new Error('teamId is required when storageScope is TEAM');
    }
    if (scope === this.SCOPES.PERSONAL && !creatorId) {
      throw new Error('creatorId is required when storageScope is PERSONAL');
    }

    return {
      storageScope: scope,
      teamId: scope === this.SCOPES.TEAM ? teamId : null,
      creatorId,
      projectId: projectId || null, // Optional organizational metadata
      parentId: parentId || null
    };
  }
}

module.exports = new StorageScopeService();
