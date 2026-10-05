const { USER_ROLES, TEAM_ROLES, STORAGE_SCOPES } = require('../constants/storage');

/**
 * Authoritative Permission Service for DEVHUB
 */
class PermissionService {
  /**
   * Check if a user has the Admin role
   */
  isAdmin(user) {
    return Boolean(user && user.role === USER_ROLES.ADMIN);
  }

  /**
   * Check if user is allowed to alter storage quotas (personal or team).
   * ONLY Admin has authority to set or change storage quotas.
   * Team Leaders DO NOT have authority to alter quotas.
   */
  canModifyStorageQuota(user) {
    return this.isAdmin(user);
  }

  /**
   * Check if user can access a personal file or folder.
   * Admin can access all personal files.
   * Owner can access their own personal files.
   */
  canAccessPersonalFile(user, fileOwnerId) {
    if (!user) return false;
    if (this.isAdmin(user)) return true;
    return user.id === fileOwnerId;
  }

  /**
   * Check if user can access a team file or folder.
   * Admin can access all team files.
   * Active team members can access team files.
   */
  canAccessTeamFile(user, teamMemberUserIds = []) {
    if (!user) return false;
    if (this.isAdmin(user)) return true;
    return teamMemberUserIds.includes(user.id);
  }

  /**
   * Check if user can manage a team's files/folders or manage members.
   * Admin or Team Leader can manage.
   */
  canManageTeam(user, teamMembers = []) {
    if (!user) return false;
    if (this.isAdmin(user)) return true;
    const membership = teamMembers.find(m => m.userId === user.id);
    return Boolean(membership && membership.role === TEAM_ROLES.LEADER);
  }
}

module.exports = new PermissionService();
