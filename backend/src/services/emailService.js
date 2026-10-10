const nodemailer = require('nodemailer');
const crypto = require('crypto');

/**
 * Creates and caches the nodemailer transporter
 */
let cachedTransporter = null;

async function getTransporter() {
  if (cachedTransporter) {
    return cachedTransporter;
  }

  // 1. Check for standard SMTP credentials
  if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
    cachedTransporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT) || 587,
      secure: process.env.SMTP_SECURE === 'true' || Number(process.env.SMTP_PORT) === 465,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
      },
      tls: {
        rejectUnauthorized: false
      },
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 15000
    });
    console.log(`[EmailService] Configured SMTP transporter with host: ${process.env.SMTP_HOST}`);
    return cachedTransporter;
  }

  // 2. Check for common predefined services like Gmail (e.g., GMAIL_USER + GMAIL_APP_PASSWORD)
  if (process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD) {
    cachedTransporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_APP_PASSWORD
      },
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 15000
    });
    console.log('[EmailService] Configured Gmail transporter');
    return cachedTransporter;
  }

  // 3. Prevent Ethereal fallback in production
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Production email credentials (SMTP_HOST or GMAIL_USER or RESEND_API_KEY) are missing. Cannot fallback to Ethereal in production.');
  }

  // 3. Fallback: Ethereal test account or development logger
  try {
    const testAccount = await nodemailer.createTestAccount();
    cachedTransporter = nodemailer.createTransport({
      host: 'smtp.ethereal.email',
      port: 587,
      secure: false,
      auth: {
        user: testAccount.user,
        pass: testAccount.pass
      }
    });
    console.log(`[EmailService] Initialized Ethereal test SMTP account: ${testAccount.user}`);
    return cachedTransporter;
  } catch (err) {
    console.warn('[EmailService] Could not create Ethereal test account, using JSON/stream transporter fallback:', err.message);
    cachedTransporter = nodemailer.createTransport({
      jsonTransport: true
    });
    return cachedTransporter;
  }
}

/**
 * Sends a 6-digit email verification code.
 *
 * @param {string} toEmail - Recipient email address
 * @param {string} code - 6-digit verification code
 * @param {string} userName - User display name
 * @returns {Promise<{success: boolean, messageId?: string, previewUrl?: string}>}
 */
async function sendVerificationEmail(toEmail, code, userName = 'Developer') {
  const fromAddress = process.env.SMTP_FROM || process.env.SMTP_USER || '"DEVHUB" <noreply@devhub.app>';
  
  // HTML Template for DEVHUB verification code
  const html = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Verify your DEVHUB Account</title>
      <style>
        body {
          margin: 0;
          padding: 0;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
          background-color: #0c0e17;
          color: #f1f5f9;
        }
        .container {
          max-width: 520px;
          margin: 40px auto;
          background-color: #121624;
          border: 1px solid #1e2538;
          border-radius: 16px;
          overflow: hidden;
          box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5);
        }
        .header {
          background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%);
          padding: 32px 24px;
          text-align: center;
        }
        .logo-box {
          display: inline-block;
          background: rgba(255, 255, 255, 0.2);
          width: 44px;
          height: 44px;
          line-height: 44px;
          border-radius: 12px;
          font-size: 22px;
          margin-bottom: 8px;
        }
        .brand-title {
          font-size: 22px;
          font-weight: 800;
          letter-spacing: 1.5px;
          color: #ffffff;
          margin: 0;
        }
        .body-content {
          padding: 32px 28px;
        }
        .greeting {
          font-size: 18px;
          font-weight: 600;
          color: #ffffff;
          margin-top: 0;
          margin-bottom: 12px;
        }
        .text {
          font-size: 14px;
          line-height: 1.6;
          color: #94a3b8;
          margin-bottom: 24px;
        }
        .code-box {
          background: #090c14;
          border: 1px solid #312e81;
          border-radius: 12px;
          padding: 20px;
          text-align: center;
          margin: 28px 0;
        }
        .code {
          font-family: 'Courier New', Courier, monospace;
          font-size: 34px;
          font-weight: 800;
          letter-spacing: 10px;
          color: #818cf8;
          margin: 0;
        }
        .code-label {
          font-size: 11px;
          text-transform: uppercase;
          letter-spacing: 1px;
          color: #64748b;
          margin-top: 8px;
        }
        .note {
          font-size: 12px;
          color: #64748b;
          line-height: 1.5;
          margin-top: 24px;
          padding-top: 16px;
          border-top: 1px solid #1e2538;
        }
        .footer {
          padding: 20px 24px;
          background-color: #0c0e17;
          border-top: 1px solid #161a29;
          text-align: center;
          font-size: 11px;
          color: #475569;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <div class="logo-box">⚡</div>
          <h1 class="brand-title">DEVHUB</h1>
        </div>
        <div class="body-content">
          <h2 class="greeting">Verify your email address</h2>
          <p class="text">
            Hello ${userName},<br><br>
            Thank you for creating a DEVHUB account. Please use the 6-digit verification code below to complete your registration:
          </p>
          <div class="code-box">
            <div class="code">${code}</div>
            <div class="code-label">Verification Code</div>
          </div>
          <p class="text">
            This verification code is valid for <strong>10 minutes</strong>. For your security, never share this code with anyone.
          </p>
          <div class="note">
            If you did not request this verification code or didn't create an account with DEVHUB, you can safely ignore this email.
          </div>
        </div>
        <div class="footer">
          &copy; ${new Date().getFullYear()} DEVHUB Platform. All rights reserved.
        </div>
      </div>
    </body>
    </html>
  `;

  const text = `Hello ${userName},\n\nYour DEVHUB verification code is: ${code}\n\nThis code will expire in 10 minutes.\nIf you did not request this, please ignore this email.`;

  // Direct Resend API support if configured
  if (process.env.RESEND_API_KEY) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);
      
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          from: fromAddress || 'DEVHUB <onboarding@resend.dev>',
          to: toEmail,
          subject: `${code} is your DEVHUB verification code`,
          html,
          text
        }),
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      if (res.ok) {
        const data = await res.json();
        console.log(`[EmailService] Email sent via Resend API to ${toEmail}. ID: ${data.id}`);
        return { success: true, messageId: data.id };
      } else {
        const errText = await res.text();
        console.warn('[EmailService] Resend API error, falling back to SMTP transporter:', errText);
      }
    } catch (err) {
      console.warn('[EmailService] Resend API failed, falling back to SMTP transporter:', err.message);
    }
  }

  // Nodemailer transporter delivery
  try {
    const transporter = await getTransporter();
    const info = await transporter.sendMail({
      from: fromAddress,
      to: toEmail,
      subject: `${code} is your DEVHUB verification code`,
      text,
      html
    });

    const previewUrl = nodemailer.getTestMessageUrl(info);
    console.log(`[EmailService] Verification email sent to: ${toEmail}. MessageId: ${info.messageId}`);
    if (previewUrl) {
      console.log(`[EmailService] Ethereal Email Preview URL: ${previewUrl}`);
    }

    return {
      success: true,
      messageId: info.messageId,
      previewUrl: previewUrl || undefined
    };
  } catch (error) {
    console.error(`[EmailService] Error delivering email to ${toEmail}:`, error.message);
    // Don't crash the server, return failure details so caller can handle gracefully
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Generates a cryptographically secure 6-digit numeric verification code
 */
function generateVerificationCode() {
  return crypto.randomInt(100000, 1000000).toString();
}

/**
 * Hashes a verification code using SHA-256 with a salt
 */
function hashCode(code) {
  const salt = process.env.JWT_SECRET || 'devhub_salt_code';
  return crypto.createHash('sha256').update(`${code}_${salt}`).digest('hex');
}

/**
 * Verifies code against stored hash
 */
function verifyCodeHash(inputCode, storedHash) {
  if (!inputCode || !storedHash) return false;
  const inputHash = hashCode(inputCode.trim());
  return crypto.timingSafeEqual(Buffer.from(inputHash), Buffer.from(storedHash));
}

module.exports = {
  sendVerificationEmail,
  generateVerificationCode,
  hashCode,
  verifyCodeHash
};
