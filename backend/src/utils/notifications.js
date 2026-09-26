const prisma = require('../db');

/**
 * Creates a notification safely.
 * @param {Object} params
 * @param {string} params.userId
 * @param {string} params.type - e.g. "Mention", "Assignment", "System"
 * @param {string} params.title
 * @param {string} params.message
 * @param {string} [params.relatedEntityType]
 * @param {string} [params.relatedEntityId]
 */
exports.createNotification = async ({ userId, type, title, message, relatedEntityType, relatedEntityId }) => {
  try {
    if (!userId || !type || !title || !message) {
      console.warn('createNotification: Missing required fields');
      return null;
    }

    const notification = await prisma.notification.create({
      data: {
        userId,
        type,
        title,
        message,
        relatedEntityType: relatedEntityType || null,
        relatedEntityId: relatedEntityId || null
      }
    });
    return notification;
  } catch (error) {
    console.error('Failed to create notification:', error);
    // Non-blocking, return null on error
    return null;
  }
};
