const bcrypt = require('bcryptjs');
const prisma = require('../db');
const { createAuditLog } = require('../utils/audit');

/**
 * Get all registration codes with user counts
 */
exports.getCodes = async (req, res) => {
  try {
    const codes = await prisma.registrationCode.findMany({
      select: {
        id: true,
        name: true,
        hint: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
        _count: {
          select: { users: true }
        }
      },
      orderBy: { createdAt: 'desc' }
    });
    res.json({ success: true, codes });
  } catch (error) {
    console.error('Error fetching registration codes:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

/**
 * Create a new registration code
 */
exports.createCode = async (req, res) => {
  try {
    const { name, code } = req.body;

    if (!name || !code) {
      return res.status(400).json({ success: false, message: 'Name and Code are required.' });
    }

    if (code.length < 6) {
      return res.status(400).json({ success: false, message: 'Code must be at least 6 characters long.' });
    }

    const hint = code.slice(-4).padStart(code.length, '*'); // e.g. ****code
    const codeHash = await bcrypt.hash(code, 10);

    const newCode = await prisma.registrationCode.create({
      data: {
        name: name.trim(),
        codeHash,
        hint,
        isActive: true
      },
      select: {
        id: true,
        name: true,
        hint: true,
        isActive: true,
        createdAt: true,
        _count: {
          select: { users: true }
        }
      }
    });

    createAuditLog({
      userId: req.userId,
      action: 'Created',
      entityType: 'RegistrationCode',
      entityId: newCode.id,
      metadata: { name: newCode.name, hint: newCode.hint }
    });

    res.status(201).json({ success: true, message: 'Registration code created successfully.', code: newCode });
  } catch (error) {
    console.error('Error creating registration code:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

/**
 * Toggle code active status
 */
exports.toggleCodeStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { isActive } = req.body;

    if (typeof isActive !== 'boolean') {
      return res.status(400).json({ success: false, message: 'isActive must be a boolean.' });
    }

    const updated = await prisma.registrationCode.update({
      where: { id },
      data: { isActive },
      select: {
        id: true,
        name: true,
        hint: true,
        isActive: true,
        createdAt: true,
        _count: {
          select: { users: true }
        }
      }
    });

    createAuditLog({
      userId: req.userId,
      action: 'Updated',
      entityType: 'RegistrationCode',
      entityId: updated.id,
      metadata: { name: updated.name, isActive: updated.isActive }
    });

    res.json({ success: true, message: `Code is now ${isActive ? 'active' : 'inactive'}.`, code: updated });
  } catch (error) {
    console.error('Error updating registration code status:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};
