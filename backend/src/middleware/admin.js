const prisma = require('../db');

/**
 * Middleware that restricts route access strictly to users with the 'Admin' role.
 * Must be used in conjunction with or after authMiddleware.
 */
const adminMiddleware = async (req, res, next) => {
  try {
    if (!req.userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const user = await prisma.user.findUnique({
      where: { id: req.userId },
      select: { id: true, role: true, status: true, email: true }
    });

    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }

    if (user.status === 'Deactivated') {
      return res.status(403).json({ error: 'Your account has been deactivated.' });
    }

    if (user.role !== 'Admin') {
      return res.status(403).json({
        error: 'Forbidden: Admin access required. You do not have permission to access this resource.'
      });
    }

    req.adminUser = user;
    next();
  } catch (error) {
    console.error('Admin middleware authorization error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

module.exports = adminMiddleware;
