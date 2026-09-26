const prisma = require('../db');

exports.getNotifications = async (req, res) => {
  try {
    const userId = req.userId;
    const { page = 1, limit = 50, read } = req.query;

    const whereClause = { userId };

    if (read !== undefined) {
      whereClause.read = read === 'true';
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const take = parseInt(limit);

    const notifications = await prisma.notification.findMany({
      where: whereClause,
      orderBy: { createdAt: 'desc' },
      skip,
      take,
      select: {
        id: true,
        type: true,
        title: true,
        message: true,
        read: true,
        relatedEntityType: true,
        relatedEntityId: true,
        createdAt: true
      }
    });

    const total = await prisma.notification.count({ where: whereClause });

    res.json({
      success: true,
      notifications,
      pagination: { total, page: parseInt(page), limit: take }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

exports.getNotificationById = async (req, res) => {
  try {
    const { id } = req.params;
    const notification = await prisma.notification.findUnique({
      where: { id }
    });

    if (!notification) return res.status(404).json({ success: false, message: 'Notification not found' });
    if (notification.userId !== req.userId) return res.status(403).json({ success: false, message: 'Forbidden' });

    res.json({ success: true, notification });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

exports.updateNotification = async (req, res) => {
  try {
    const { id } = req.params;
    const { read } = req.body;

    const notification = await prisma.notification.findUnique({ where: { id } });
    if (!notification) return res.status(404).json({ success: false, message: 'Notification not found' });
    if (notification.userId !== req.userId) return res.status(403).json({ success: false, message: 'Forbidden' });

    const updateData = {};
    if (read !== undefined) updateData.read = Boolean(read);

    const updated = await prisma.notification.update({
      where: { id },
      data: updateData
    });

    res.json({ success: true, notification: updated });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

exports.markAsRead = async (req, res) => {
  try {
    const { id } = req.params;

    const notification = await prisma.notification.findUnique({ where: { id } });
    if (!notification) return res.status(404).json({ success: false, message: 'Notification not found' });
    if (notification.userId !== req.userId) return res.status(403).json({ success: false, message: 'Forbidden' });

    const updated = await prisma.notification.update({
      where: { id },
      data: { read: true }
    });

    res.json({ success: true, notification: updated });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

exports.markAllAsRead = async (req, res) => {
  try {
    await prisma.notification.updateMany({
      where: { userId: req.userId, read: false },
      data: { read: true }
    });

    res.json({ success: true, message: 'All notifications marked as read' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

exports.deleteNotification = async (req, res) => {
  try {
    const { id } = req.params;

    const notification = await prisma.notification.findUnique({ where: { id } });
    if (!notification) return res.status(404).json({ success: false, message: 'Notification not found' });
    if (notification.userId !== req.userId) return res.status(403).json({ success: false, message: 'Forbidden' });

    await prisma.notification.delete({ where: { id } });

    res.json({ success: true, message: 'Notification deleted successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};
