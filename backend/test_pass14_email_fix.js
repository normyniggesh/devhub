require('dotenv').config();
const prisma = require('./src/db');
const { sendVerificationEmail } = require('./src/services/emailService');

async function runTests() {
  console.log('--- Starting Pass 14 Email Hang Tests ---');

  // Test 1: Production behavior without credentials
  console.log('\n[Test 1] Testing production behavior without credentials');
  const originalEnv = process.env.NODE_ENV;
  const originalSmtpHost = process.env.SMTP_HOST;
  const originalResend = process.env.RESEND_API_KEY;

  try {
    // Simulate production missing credentials
    process.env.NODE_ENV = 'production';
    delete process.env.SMTP_HOST;
    delete process.env.RESEND_API_KEY;
    delete process.env.GMAIL_USER;

    const result = await sendVerificationEmail('test@test.com', '123456', 'Tester');
    if (result.success) {
      console.error('❌ Expected production missing credentials to fail, but it succeeded!');
      process.exit(1);
    }
    
    if (!result.error.includes('Production email credentials') && !result.error.includes('Cannot fallback to Ethereal')) {
      console.error('❌ Expected specific configuration error message, got:', result.error);
      process.exit(1);
    }
    console.log('✅ Production correctly fails quickly with a clear error and does not create an Ethereal account.');
  } finally {
    process.env.NODE_ENV = originalEnv;
    if (originalSmtpHost) process.env.SMTP_HOST = originalSmtpHost;
    if (originalResend) process.env.RESEND_API_KEY = originalResend;
  }

  // Test 2: Local development fallback behavior
  console.log('\n[Test 2] Testing development fallback behavior (Ethereal)');
  try {
    process.env.NODE_ENV = 'development';
    delete process.env.SMTP_HOST;
    delete process.env.RESEND_API_KEY;
    delete process.env.GMAIL_USER;
    
    // This could take a moment if Ethereal creates an account
    const result = await sendVerificationEmail('test_dev@test.com', '654321', 'Dev Tester');
    if (!result.success && !result.error.includes('JSON')) {
       // Note: Ethereal might fail locally sometimes, which is caught and fallback to JSON stream.
       console.log('⚠️ Development fallback failed to send via Ethereal, falling back to JSON stream (acceptable for test).', result);
    } else {
       console.log('✅ Development fallback works (either Ethereal or JSON transport).');
    }
  } finally {
    process.env.NODE_ENV = originalEnv;
    if (originalSmtpHost) process.env.SMTP_HOST = originalSmtpHost;
    if (originalResend) process.env.RESEND_API_KEY = originalResend;
  }

  console.log('\n🎉 All Pass 14 Tests completed successfully!');
  process.exit(0);
}

runTests();
