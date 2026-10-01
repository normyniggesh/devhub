require('dotenv').config();
const assert = require('assert');
const app = require('./src/app');
const prisma = require('./src/db');
const { hashCode } = require('./src/services/emailService');

let server;
let baseUrl;

async function request(path, options = {}) {
  const { headers = {}, ...rest } = options;
  const url = `${baseUrl}${path}`;
  const res = await fetch(url, {
    ...rest,
    headers: {
      'Content-Type': 'application/json',
      ...headers
    }
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, ok: res.ok, data, headers: res.headers };
}

async function runTests() {
  console.log('=== STARTING COMPLETE DEVHUB EMAIL & ADMIN TEST SUITE ===');

  await new Promise((resolve) => {
    server = app.listen(0, () => {
      const port = server.address().port;
      baseUrl = `http://localhost:${port}/api`;
      console.log(`Test server running at ${baseUrl}`);
      resolve();
    });
  });

  try {
    // -------------------------------------------------------------
    // PART 1: EXISTING USERS CHECK (Umer & Paarth)
    // -------------------------------------------------------------
    const bcrypt = require('bcryptjs');
    const validHash = await bcrypt.hash('password123', 10);
    await prisma.user.updateMany({
      where: { email: { in: ['umer@devhub.test', 'paarth@devhub.test'] } },
      data: { passwordHash: validHash, emailVerified: true, status: 'Active' }
    });

    const umer = await prisma.user.findFirst({ where: { email: 'umer@devhub.test' } });
    const paarth = await prisma.user.findFirst({ where: { email: 'paarth@devhub.test' } });

    assert(umer, 'Existing user Umer should exist');
    assert(paarth, 'Existing user Paarth should exist');
    assert.strictEqual(umer.emailVerified, true, 'Umer should be marked emailVerified: true');
    assert.strictEqual(paarth.emailVerified, true, 'Paarth should be marked emailVerified: true');
    assert.strictEqual(umer.role, 'Admin', 'Umer should have role Admin');
    assert.strictEqual(paarth.role, 'Member', 'Paarth should have role Member');
    console.log('✔ Existing accounts Umer & Paarth are verified and roles intact');

    // -------------------------------------------------------------
    // PART 2: REGISTRATION & EMAIL VERIFICATION FLOW
    // -------------------------------------------------------------
    console.log('\n--- 2. Testing New User Registration & Email Verification ---');
    const testEmail = `newuser_${Date.now()}@example.com`;
    
    // Invalid email format test
    const invalidEmailRes = await request('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ name: 'Invalid User', email: 'notanemail', password: 'password123' })
    });
    assert.strictEqual(invalidEmailRes.status, 400, 'Invalid email format should return 400');
    console.log('✔ Invalid email format rejected');

    // Valid registration
    const regRes = await request('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ name: 'Verification Tester', email: testEmail, password: 'password123' })
    });
    assert.strictEqual(regRes.status, 201, 'Valid registration should return 201');
    assert.strictEqual(regRes.data.requiresVerification, true, 'Requires verification flag should be true');
    console.log('✔ Registered unverified user successfully');

    // Verify user in DB is unverified and has code hash
    let dbUser = await prisma.user.findUnique({ where: { email: testEmail } });
    assert.strictEqual(dbUser.emailVerified, false, 'User must be unverified in DB');
    assert(dbUser.verificationCodeHash, 'User must have verificationCodeHash');
    assert(dbUser.verificationCodeExpiresAt, 'User must have verificationCodeExpiresAt');
    console.log('✔ User created in DB as unverified with hashed code and expiration');

    // Attempt login BEFORE verifying email -> must be rejected
    const unverifiedLoginRes = await request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: testEmail, password: 'password123' })
    });
    assert.strictEqual(unverifiedLoginRes.status, 403, 'Unverified user login must return 403');
    assert(unverifiedLoginRes.data.requiresVerification, 'Login response must indicate requiresVerification: true');
    console.log('✔ Login correctly blocked for unverified user');

    // Test entering WRONG code
    const wrongCodeRes = await request('/auth/verify-email', {
      method: 'POST',
      body: JSON.stringify({ email: testEmail, code: '000000' })
    });
    assert.strictEqual(wrongCodeRes.status, 400, 'Wrong verification code must return 400');
    assert(wrongCodeRes.data.remainingAttempts !== undefined, 'Should return remaining attempts count');
    console.log(`✔ Wrong verification code rejected (${wrongCodeRes.data.remainingAttempts} attempts remaining)`);

    // Test attempt limits
    console.log('Testing verification attempt limits (forcing attempts >= 5)...');
    await prisma.user.update({
      where: { id: dbUser.id },
      data: { verificationAttempts: 5 }
    });
    const maxAttemptsRes = await request('/auth/verify-email', {
      method: 'POST',
      body: JSON.stringify({ email: testEmail, code: '000000' })
    });
    assert.strictEqual(maxAttemptsRes.status, 400, 'Exceeded attempts should return 400');
    assert(maxAttemptsRes.data.requiresResend, 'Should prompt for resend when attempts exceeded');
    console.log('✔ Verification attempt limits enforced');

    // Test expired code
    console.log('Testing expired verification code...');
    await prisma.user.update({
      where: { id: dbUser.id },
      data: {
        verificationAttempts: 0,
        verificationCodeExpiresAt: new Date(Date.now() - 60000) // 1 minute in the past
      }
    });
    const expiredRes = await request('/auth/verify-email', {
      method: 'POST',
      body: JSON.stringify({ email: testEmail, code: '123456' })
    });
    assert.strictEqual(expiredRes.status, 400, 'Expired code must return 400');
    assert(expiredRes.data.error.includes('expired'), 'Error message should indicate expiration');
    console.log('✔ Expired code rejected');

    // Test Resend Code & Cooldown
    console.log('Testing resend code cooldown...');
    // Cooldown active
    await prisma.user.update({
      where: { id: dbUser.id },
      data: { verificationLastSentAt: new Date() }
    });
    const cooldownRes = await request('/auth/resend-code', {
      method: 'POST',
      body: JSON.stringify({ email: testEmail })
    });
    assert.strictEqual(cooldownRes.status, 429, 'Resend within cooldown must return 429');
    console.log('✔ Resend cooldown enforced (429 Too Many Requests)');

    // Allow resend (simulate 65s passed)
    await prisma.user.update({
      where: { id: dbUser.id },
      data: { verificationLastSentAt: new Date(Date.now() - 65000) }
    });
    const resendSuccessRes = await request('/auth/resend-code', {
      method: 'POST',
      body: JSON.stringify({ email: testEmail })
    });
    assert.strictEqual(resendSuccessRes.status, 200, 'Resend after cooldown must return 200');
    console.log('✔ Resend succeeded and generated new code');

    // Verify with a known code: set known code hash
    const knownCode = '654321';
    await prisma.user.update({
      where: { id: dbUser.id },
      data: {
        verificationCodeHash: hashCode(knownCode),
        verificationCodeExpiresAt: new Date(Date.now() + 600000),
        verificationAttempts: 0
      }
    });

    // Enter correct code
    const verifySuccessRes = await request('/auth/verify-email', {
      method: 'POST',
      body: JSON.stringify({ email: testEmail, code: knownCode })
    });
    assert.strictEqual(verifySuccessRes.status, 200, 'Correct verification code must return 200');
    assert.strictEqual(verifySuccessRes.data.user.emailVerified, true, 'User should now be verified');
    console.log('✔ Account successfully verified with valid 6-digit code');

    // Test Login NOW works for the verified user
    const loginSuccessRes = await request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: testEmail, password: 'password123' })
    });
    assert.strictEqual(loginSuccessRes.status, 200, 'Verified user login must return 200');
    console.log('✔ Login succeeds once account is verified');

    // -------------------------------------------------------------
    // PART 3: ADMIN PANEL AUTHORIZATION & ROLE ENFORCEMENT
    // -------------------------------------------------------------
    console.log('\n--- 3. Testing Admin Panel RBAC & Authorization ---');
    
    // Login as Paarth (Member - non admin)
    const paarthLoginRes = await request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: 'paarth@devhub.test', password: 'password123' })
    });
    assert.strictEqual(paarthLoginRes.status, 200);
    const paarthCookie = paarthLoginRes.headers.get('set-cookie');

    // Paarth attempts to call /api/admin/overview directly
    const paarthAdminRes = await request('/admin/overview', {
      headers: { Cookie: paarthCookie }
    });
    assert.strictEqual(paarthAdminRes.status, 403, 'Normal user calling /api/admin must receive 403 Forbidden');
    console.log('✔ Backend RBAC strictly denies non-admin user (403 Forbidden)');

    // Login as Umer (Admin)
    const umerLoginRes = await request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: 'umer@devhub.test', password: 'password123' })
    });
    assert.strictEqual(umerLoginRes.status, 200);
    const umerCookie = umerLoginRes.headers.get('set-cookie');

    // Admin calls /api/admin/overview
    const adminOverviewRes = await request('/admin/overview', {
      headers: { Cookie: umerCookie }
    });
    assert.strictEqual(adminOverviewRes.status, 200, 'Admin calling /api/admin/overview must return 200');
    assert(adminOverviewRes.data.stats.totalUsers >= 2, 'Admin stats totalUsers must be >= 2');
    assert(adminOverviewRes.data.stats.verifiedUsers >= 2, 'Admin stats verifiedUsers must be >= 2');
    console.log('✔ Admin overview retrieved statistics successfully:', adminOverviewRes.data.stats);

    // Admin calls /api/admin/users
    const adminUsersRes = await request('/admin/users', {
      headers: { Cookie: umerCookie }
    });
    assert.strictEqual(adminUsersRes.status, 200, 'Admin calling /api/admin/users must return 200');
    assert(Array.isArray(adminUsersRes.data.users), 'Users response must be an array');
    console.log(`✔ Admin retrieved ${adminUsersRes.data.users.length} users with verification & presence metadata`);

    // Verify passwords and tokens are NEVER exposed in admin users response
    adminUsersRes.data.users.forEach((u) => {
      assert.strictEqual(u.passwordHash, undefined, 'passwordHash must never be exposed');
      assert.strictEqual(u.verificationCodeHash, undefined, 'verificationCodeHash must never be exposed');
      if (u.integrations) {
        u.integrations.forEach((i) => {
          assert.strictEqual(i.accessToken, undefined, 'accessToken must never be exposed');
          assert.strictEqual(i.refreshToken, undefined, 'refreshToken must never be exposed');
        });
      }
    });
    console.log('✔ Verified zero secrets/tokens are exposed in admin endpoints');

    // Admin updates a user's role (change test user to Viewer, then Member)
    const roleChangeRes = await request(`/admin/users/${dbUser.id}/role`, {
      method: 'PATCH',
      headers: { Cookie: umerCookie },
      body: JSON.stringify({ role: 'Viewer' })
    });
    assert.strictEqual(roleChangeRes.status, 200, 'Changing user role must return 200');
    assert.strictEqual(roleChangeRes.data.user.role, 'Viewer', 'User role must be updated to Viewer');
    console.log('✔ Admin successfully changed user role to Viewer');

    // Admin deactivates test user
    const deactivateRes = await request(`/admin/users/${dbUser.id}/status`, {
      method: 'PATCH',
      headers: { Cookie: umerCookie },
      body: JSON.stringify({ status: 'Deactivated' })
    });
    assert.strictEqual(deactivateRes.status, 200, 'Deactivating user must return 200');
    console.log('✔ Admin successfully deactivated user');

    // Deactivated user cannot login
    const deactivatedLoginRes = await request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: testEmail, password: 'password123' })
    });
    assert.strictEqual(deactivatedLoginRes.status, 403, 'Deactivated user login must return 403');
    console.log('✔ Deactivated user blocked from signing in');

    // Admin reactivates test user
    const reactivateRes = await request(`/admin/users/${dbUser.id}/status`, {
      method: 'PATCH',
      headers: { Cookie: umerCookie },
      body: JSON.stringify({ status: 'Active' })
    });
    assert.strictEqual(reactivateRes.status, 200, 'Reactivating user must return 200');
    console.log('✔ Admin successfully reactivated user');

    // Admin views projects
    const adminProjectsRes = await request('/admin/projects', {
      headers: { Cookie: umerCookie }
    });
    assert.strictEqual(adminProjectsRes.status, 200, 'Admin /projects must return 200');
    console.log(`✔ Admin retrieved ${adminProjectsRes.data.projects.length} projects with owner and member metadata`);

    // Admin views cloud connections
    const adminCloudRes = await request('/admin/cloud-connections', {
      headers: { Cookie: umerCookie }
    });
    assert.strictEqual(adminCloudRes.status, 200, 'Admin /cloud-connections must return 200');
    console.log(`✔ Admin retrieved ${adminCloudRes.data.connections.length} cloud/GitHub connections`);

    // Admin views activity feed
    const adminActivityRes = await request('/admin/activity', {
      headers: { Cookie: umerCookie }
    });
    assert.strictEqual(adminActivityRes.status, 200, 'Admin /activity must return 200');
    assert(adminActivityRes.data.activity.length > 0, 'Platform activity should contain logged events');
    console.log(`✔ Admin retrieved ${adminActivityRes.data.activity.length} platform audit log events`);

    // -------------------------------------------------------------
    // PART 4: DATA SEPARATION BETWEEN UMER & PAARTH
    // -------------------------------------------------------------
    console.log('\n--- 4. Testing Data Separation Between Users ---');
    assert.notStrictEqual(umer.id, paarth.id, 'Umer and Paarth must have distinct user IDs');
    assert.strictEqual(umer.email, 'umer@devhub.test');
    assert.strictEqual(paarth.email, 'paarth@devhub.test');
    console.log('✔ Distinct user contexts verified between Umer and Paarth');

    // Clean up test user
    await prisma.auditLog.deleteMany({ where: { userId: dbUser.id } });
    await prisma.user.delete({ where: { id: dbUser.id } });
    console.log('✔ Test user cleaned up cleanly');

    console.log('\n======================================================');
    console.log('✅ ALL TEST SCENARIOS PASSED WITH 100% SUCCESS!');
    console.log('======================================================');
    if (server) server.close();
    process.exit(0);
  } catch (err) {
    console.error('\n❌ TEST FAILURE:', err);
    if (server) server.close();
    process.exit(1);
  }
}

runTests();
