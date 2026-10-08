require('dotenv').config();
const prisma = require('./src/db');
const { encryptToken, decryptToken, sanitizeIntegration } = require('./src/utils/crypto');

async function runTests() {
  console.log('--- Starting Pass 11E GitHub Encryption Tests ---');

  // Test 1: encryptToken and decryptToken behavior
  console.log('\n[Test 1] Testing crypto.js utilities');
  const dummyToken = 'ghp_dummytoken1234567890';
  const encrypted = encryptToken(dummyToken);

  if (encrypted === dummyToken) {
    console.error('❌ encryptToken failed to encrypt (returned plaintext)');
    process.exit(1);
  }
  
  if (!encrypted.startsWith('enc:')) {
    console.error('❌ encrypted token does not start with enc: prefix');
    process.exit(1);
  }

  const decrypted = decryptToken(encrypted);
  if (decrypted !== dummyToken) {
    console.error(`❌ decryptToken failed. Expected ${dummyToken}, got ${decrypted}`);
    process.exit(1);
  }
  console.log('✅ Token encryption and decryption works correctly.');

  // Test 2: Backward compatibility
  console.log('\n[Test 2] Testing backward compatibility');
  const legacyPlaintext = 'ghp_legacyplaintext';
  const legacyDecrypted = decryptToken(legacyPlaintext);
  if (legacyDecrypted !== legacyPlaintext) {
    console.error('❌ decryptToken modified legacy plaintext token!');
    process.exit(1);
  }
  console.log('✅ Backward compatibility for plaintext tokens works.');

  // Test 3: sanitizeIntegration strips tokens
  console.log('\n[Test 3] Testing sanitizeIntegration');
  const mockIntegration = {
    id: 'mock-id-123',
    provider: 'github',
    status: 'connected',
    accountName: 'testuser',
    accessToken: encrypted,
    metadata: {
      accessToken: encrypted,
      refreshToken: 'some_refresh_token',
      email: 'test@example.com'
    }
  };

  const sanitized = sanitizeIntegration(mockIntegration);
  if (sanitized.accessToken || sanitized.metadata.accessToken || sanitized.metadata.refreshToken) {
    console.error('❌ sanitizeIntegration leaked sensitive tokens!', sanitized);
    process.exit(1);
  }
  if (sanitized.hasToken !== undefined) {
      // NOTE: sanitizeIntegration doesn't add hasToken, it's added manually where needed. 
      // Just asserting it doesn't leak raw token.
  }
  console.log('✅ sanitizeIntegration properly strips tokens.');

  // Test 4: Database interaction
  console.log('\n[Test 4] Database Integration Test');
  try {
    const user = await prisma.user.create({
      data: {
        name: 'Pass11E Test User',
        email: `pass11e_${Date.now()}@test.com`,
        passwordHash: 'dummyhash',
        emailVerified: true
      }
    });

    const integration = await prisma.userIntegration.create({
      data: {
        userId: user.id,
        provider: 'github',
        accountName: 'testuser_gh',
        accessToken: encrypted,
        status: 'connected',
        metadata: { login: 'testuser_gh' }
      }
    });

    const fetched = await prisma.userIntegration.findUnique({ where: { id: integration.id } });
    
    if (fetched.accessToken !== encrypted) {
      console.error('❌ Token was not saved correctly to the database');
      process.exit(1);
    }

    const fetchedDecrypted = decryptToken(fetched.accessToken);
    if (fetchedDecrypted !== dummyToken) {
      console.error('❌ Failed to decrypt token fetched from database');
      process.exit(1);
    }
    console.log('✅ Database persistence and retrieval of encrypted tokens works.');

    // Cleanup
    await prisma.userIntegration.delete({ where: { id: integration.id } });
    await prisma.user.delete({ where: { id: user.id } });
    console.log('🧹 Cleanup successful.');

  } catch (err) {
    console.error('❌ Database test failed:', err);
    process.exit(1);
  }

  console.log('\n🎉 All Pass 11E Tests completed successfully!');
  process.exit(0);
}

runTests();
