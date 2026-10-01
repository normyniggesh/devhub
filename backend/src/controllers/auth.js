const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const prisma = require('../db');
const { createAuditLog } = require('../utils/audit');
const {
  sendVerificationEmail,
  generateVerificationCode,
  hashCode,
  verifyCodeHash
} = require('../services/emailService');

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
 * Register a new user account (created as UNVERIFIED)
 */
exports.register = async (req, res) => {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ error: 'All fields are required' });
    }

    const normalizedEmail = email.toLowerCase().trim();

    if (!isValidEmail(normalizedEmail)) {
      return res.status(400).json({ error: 'Please enter a valid email address (e.g. name@example.com)' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters long' });
    }

    const existingUser = await prisma.user.findUnique({
      where: { email: normalizedEmail }
    });

    // Generate 6-digit verification code and hash
    const rawCode = generateVerificationCode();
    const codeHash = hashCode(rawCode);
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    let user;

    if (existingUser) {
      if (existingUser.emailVerified) {
        return res.status(409).json({ error: 'An account with this email already exists' });
      }

      // Existing unverified user re-attempting registration: update password and send fresh code
      const passwordHash = await bcrypt.hash(password, 10);
      user = await prisma.user.update({
        where: { id: existingUser.id },
        data: {
          name: name.trim(),
          passwordHash,
          verificationCodeHash: codeHash,
          verificationCodeExpiresAt: expiresAt,
          verificationAttempts: 0,
          verificationLastSentAt: new Date()
        }
      });
    } else {
      const passwordHash = await bcrypt.hash(password, 10);
      user = await prisma.user.create({
        data: {
          name: name.trim(),
          email: normalizedEmail,
          passwordHash,
          emailVerified: false,
          verificationCodeHash: codeHash,
          verificationCodeExpiresAt: expiresAt,
          verificationAttempts: 0,
          verificationLastSentAt: new Date(),
          status: 'Active'
        }
      });
    }

    // Send the real 6-digit verification code via email
    await sendVerificationEmail(normalizedEmail, rawCode, user.name);

    createAuditLog({
      userId: user.id,
      action: 'Created',
      entityType: 'User',
      entityId: user.id,
      metadata: { email: normalizedEmail, event: 'User registered (Pending Email Verification)' }
    });

    // DO NOT set auth cookie until email is verified
    res.status(201).json({
      success: true,
      requiresVerification: true,
      message: 'Account created! Please enter the 6-digit verification code sent to your email.',
      email: normalizedEmail
    });
  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * Verify 6-digit email verification code
 */
exports.verifyEmail = async (req, res) => {
  try {
    const { email, code } = req.body;

    if (!email || !code) {
      return res.status(400).json({ error: 'Email and 6-digit verification code are required' });
    }

    const normalizedEmail = email.toLowerCase().trim();
    const cleanCode = code.toString().trim();

    const user = await prisma.user.findUnique({
      where: { email: normalizedEmail }
    });

    if (!user) {
      return res.status(404).json({ error: 'Account not found' });
    }

    if (user.emailVerified) {
      // Account is already verified, log in if not logged in
      const token = generateToken(user.id);
      setAuthCookie(res, token);
      const { passwordHash: _, verificationCodeHash: __, ...safeUser } = user;
      return res.json({
        success: true,
        alreadyVerified: true,
        message: 'Account is already verified.',
        user: safeUser
      });
    }

    // Check attempt limits (max 5)
    if (user.verificationAttempts >= 5) {
      return res.status(400).json({
        error: 'Too many failed verification attempts. Please request a new verification code.',
        requiresResend: true
      });
    }

    // Check expiration (10 minutes)
    if (!user.verificationCodeExpiresAt || new Date() > user.verificationCodeExpiresAt) {
      return res.status(400).json({
        error: 'Verification code has expired. Please request a new code.',
        requiresResend: true
      });
    }

    // Verify code securely
    const isValid = verifyCodeHash(cleanCode, user.verificationCodeHash);

    if (!isValid) {
      const updatedAttempts = user.verificationAttempts + 1;
      await prisma.user.update({
        where: { id: user.id },
        data: { verificationAttempts: updatedAttempts }
      });

      const remaining = Math.max(0, 5 - updatedAttempts);
      return res.status(400).json({
        error: `Invalid verification code. ${remaining > 0 ? `${remaining} attempts remaining.` : 'Please request a new code.'}`,
        remainingAttempts: remaining
      });
    }

    // Mark user verified and clear code hash
    const verifiedUser = await prisma.user.update({
      where: { id: user.id },
      data: {
        emailVerified: true,
        verificationCodeHash: null,
        verificationCodeExpiresAt: null,
        verificationAttempts: 0,
        lastSeen: new Date()
      }
    });

    // Issue JWT cookie session
    const token = generateToken(verifiedUser.id);
    setAuthCookie(res, token);

    createAuditLog({
      userId: verifiedUser.id,
      action: 'Updated',
      entityType: 'User',
      entityId: verifiedUser.id,
      metadata: { email: normalizedEmail, event: 'Email address verified successfully' }
    });

    const { passwordHash: _, verificationCodeHash: __, ...safeUser } = verifiedUser;
    res.json({
      success: true,
      message: 'Email successfully verified! Welcome to DEVHUB.',
      user: safeUser
    });
  } catch (error) {
    console.error('Verify email error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * Resend a new 6-digit verification code with 60-second cooldown
 */
exports.resendVerificationCode = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'Email address is required' });
    }

    const normalizedEmail = email.toLowerCase().trim();

    const user = await prisma.user.findUnique({
      where: { email: normalizedEmail }
    });

    if (!user) {
      return res.status(404).json({ error: 'Account not found' });
    }

    if (user.emailVerified) {
      return res.status(400).json({ error: 'Account email is already verified' });
    }

    // Cooldown check (60 seconds)
    if (user.verificationLastSentAt) {
      const elapsedSeconds = Math.floor((Date.now() - new Date(user.verificationLastSentAt).getTime()) / 1000);
      if (elapsedSeconds < 60) {
        const remaining = 60 - elapsedSeconds;
        return res.status(429).json({
          error: `Please wait ${remaining} second${remaining === 1 ? '' : 's'} before requesting another code.`,
          retryAfter: remaining
        });
      }
    }

    // Generate new code and invalidate previous code
    const rawCode = generateVerificationCode();
    const codeHash = hashCode(rawCode);
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    await prisma.user.update({
      where: { id: user.id },
      data: {
        verificationCodeHash: codeHash,
        verificationCodeExpiresAt: expiresAt,
        verificationAttempts: 0,
        verificationLastSentAt: new Date()
      }
    });

    // Send new email
    await sendVerificationEmail(normalizedEmail, rawCode, user.name);

    res.json({
      success: true,
      message: 'A new 6-digit verification code has been sent to your email.'
    });
  } catch (error) {
    console.error('Resend verification code error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

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

    // Check if email has been verified
    if (!user.emailVerified) {
      return res.status(403).json({
        error: 'Please verify your email before signing in.',
        requiresVerification: true,
        email: normalizedEmail
      });
    }

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
