const prisma = require('../db');

exports.searchUsers = async (req, res) => {
  try {
    const { q } = req.query;
    
    let whereClause = {};
    if (q && q.trim()) {
      whereClause = {
        OR: [
          { name: { contains: q.trim(), mode: 'insensitive' } },
          { email: { contains: q.trim(), mode: 'insensitive' } }
        ]
      };
    }

    const users = await prisma.user.findMany({
      where: whereClause,
      select: {
        id: true,
        name: true,
        email: true,
        avatarUrl: true
      },
      take: 20
    });

    res.json({ success: true, users });
  } catch (error) {
    console.error('searchUsers error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};
