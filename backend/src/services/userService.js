const prisma = require('../db');
const { USER_ROLES, DEFAULT_PERSONAL_STORAGE_BYTES } = require('../constants/storage');
const storageQuotaService = require('./storageQuotaService');

/**
 * Authoritative User Service
 *
 * Rules:
 * 1. Default role = User.
 * 2. New user is NOT automatically added to any team.
 * 3. Automatically creates PersonalStorageAllocation with 5 GB default.
 */
class UserService {
  /**
   * Initialize personal storage for a newly created or existing user
   */
  async initializeUserStorage(userId) {
    if (!userId) throw new Error('userId is required');
    return await storageQuotaService.ensurePersonalAllocation(userId, DEFAULT_PERSONAL_STORAGE_BYTES);
  }

  /**
   * Retrieve user with their personal storage quota summary
   */
  async getUserProfile(userId) {
    if (!userId) return null;
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        status: true,
        avatarUrl: true,
        emailVerified: true,
        createdAt: true,
        personalStorage: true
      }
    });

    if (!user) return null;
    const storageQuota = await storageQuotaService.getPersonalQuota(userId);

    return {
      ...user,
      storageQuota
    };
  }
}

module.exports = new UserService();
