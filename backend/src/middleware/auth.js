const jwt = require('jsonwebtoken');
const prisma = require('../db');

// In-memory cache of lastSeen updates to avoid database spam (key: userId, val: timestamp)
const lastSeenCache = new Map();

const authMiddleware = async (req, res, next) => {
  let token = req.cookies.devhub_auth_token;

  // Support Bearer token header if cookie is absent
  if (!token && req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
    token = req.headers.authorization.split(' ')[1];
  }

  // Support query parameter token (for direct stream downloads / window popups)
  if (!token && req.query.token) {
    token = req.query.token;
  }


  if (!token) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.userId = decoded.userId;

    // Background throttled lastSeen update (at most once every 2 minutes per user)
    const now = Date.now();
    const lastUpdate = lastSeenCache.get(req.userId) || 0;
    if (now - lastUpdate > 2 * 60 * 1000) {
      lastSeenCache.set(req.userId, now);
      prisma.user.update({
        where: { id: req.userId },
        data: { lastSeen: new Date() }
      }).catch(err => {
        // non-fatal background error
      });
    }

    next();
  } catch (error) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
};

module.exports = authMiddleware;
