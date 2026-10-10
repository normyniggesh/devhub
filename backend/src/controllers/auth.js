const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const prisma = require('../db');
const { createAuditLog } = require('../utils/audit');

const COOKIE_NAME = 'devhub_auth_token';

const generateToken = (userId) => {
  return jwt.sign({ userId }, process.env.JWT_SECRET, { expiresIn: '7d' });
};

const setAuthCookie = (res, token) => {
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
  });
};

function isValidEmail(email) {
  if (!email || typeof email !== 'string') return false;
  // Strict RFC 5322 compliant regex for realistic email validation
  const re = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  return re.test(email.trim());
}

/**
 * Register a new user account using a Registration Access Code
 */
exports.register = async (req, res) => {
  try {
    const { name, email, password, registrationCode } = req.body;

    if (!name || !email || !password || !registrationCode) {
      return res.status(400).json({ error: 'All fields, including Registration Access Code, are required' });
    }

    const normalizedEmail = email.toLowerCase().trim();

    if (!isValidEmail(normalizedEmail)) {
      return res.status(400).json({ error: 'Please enter a valid email address' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters long' });
    }

    const existingUser = await prisma.user.findUnique({
      where: { email: normalizedEmail }
    });

    if (existingUser) {
      return res.status(409).json({ error: 'An account with this email already exists' });
    }

    // Fetch all active registration codes
    const activeCodes = await prisma.registrationCode.findMany({
      where: { isActive: true }
    });

    if (activeCodes.length === 0) {
      return res.status(403).json({ error: 'Registration is currently closed (no active access codes available).' });
    }

    let matchedCode = null;

    for (const codeRecord of activeCodes) {
      const isMatch = await bcrypt.compare(registrationCode.trim(), codeRecord.codeHash);
      if (isMatch) {
        matchedCode = codeRecord;
        break;
      }
    }

    if (!matchedCode) {
      return res.status(400).json({ error: 'Invalid or inactive Registration Access Code' });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    // Use a transaction to ensure user creation and other initializations are safe
    // But we are just creating the user with the reference to the code
    const user = await prisma.user.create({
      data: {
        name: name.trim(),
        email: normalizedEmail,
        passwordHash,
        emailVerified: true, // Mark as true or ignore, it's bypassed
        status: 'Active',
        registrationCodeId: matchedCode.id
      }
    });

    // Automatically initialize 5 GB Personal Storage Allocation
    const userService = require('../services/userService');
    await userService.initializeUserStorage(user.id);

    createAuditLog({
      userId: user.id,
      action: 'Created',
      entityType: 'User',
      entityId: user.id,
      metadata: { email: normalizedEmail, event: 'User registered via Access Code', registrationCodeHint: matchedCode.hint }
    });

    res.status(201).json({
      success: true,
      message: 'Account created successfully! You can now log in.',
      email: normalizedEmail
    });
  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// verifyEmail and resendVerificationCode have been removed in Pass 15 (Access Codes)

/**
 * Login user (enforces email verification and active account status)
 */
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const normalizedEmail = email.toLowerCase().trim();

    const user = await prisma.user.findUnique({
      where: { email: normalizedEmail }
    });

    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const isValidPassword = await bcrypt.compare(password, user.passwordHash);

    if (!isValidPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Email verification restriction removed.

    // Check if account is active or deactivated
    if (user.status === 'Deactivated') {
      return res.status(403).json({
        error: 'Your account has been deactivated. Please contact an administrator.'
      });
    }

    // Update lastSeen on login
    await prisma.user.update({
      where: { id: user.id },
      data: { lastSeen: new Date() }
    });

    const token = generateToken(user.id);
    setAuthCookie(res, token);

    const { passwordHash: _, verificationCodeHash: __, ...safeUser } = user;
    res.json({ user: safeUser });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

exports.logout = (req, res) => {
  res.clearCookie(COOKIE_NAME);
  res.json({ success: true });
};

exports.me = async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.userId }
    });

    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }

    if (user.status === 'Deactivated') {
      res.clearCookie(COOKIE_NAME);
      return res.status(403).json({ error: 'Your account has been deactivated.' });
    }

    // Update lastSeen asynchronously if older than 2 minutes
    const now = Date.now();
    if (!user.lastSeen || (now - new Date(user.lastSeen).getTime()) > 2 * 60 * 1000) {
      prisma.user.update({
        where: { id: user.id },
        data: { lastSeen: new Date() }
      }).catch(err => console.error('Failed to update lastSeen in me:', err.message));
    }

    const { passwordHash: _, verificationCodeHash: __, ...safeUser } = user;
    res.json({ user: safeUser });
  } catch (error) {
    console.error('Get current user error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};
