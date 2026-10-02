require('dotenv').config();
const jwt = require('jsonwebtoken');
const app = require('./src/app');
const { prisma, ensureSchema } = require('./src/db');

const JWT_SECRET = process.env.JWT_SECRET || 'devhub-jwt-secret-key-change-in-production';

function getAuthHeader(userId, role = 'Member') {
  const token = jwt.sign({ userId, role }, JWT_SECRET, { expiresIn: '1h' });
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  };
}

async function runTwoUserQaFlowTest() {
  console.log('==================================================');
  console.log('SIMPLIFIED QA WORKFLOW — TWO-USER AUTOMATED TEST');
  console.log('==================================================\n');

  await ensureSchema();

  // 1. Setup Test Users: User 1 (Umer) and User 2 (Paarth)
  let user1 = await prisma.user.findFirst({ where: { email: 'umer@devhub.test' } });
  if (!user1) {
    user1 = await prisma.user.create({
      data: { email: 'umer@devhub.test', name: 'Umer', passwordHash: 'hash123', role: 'Admin' }
    });
  }

  let user2 = await prisma.user.findFirst({ where: { email: 'paarth@devhub.test' } });
  if (!user2) {
    user2 = await prisma.user.create({
      data: { email: 'paarth@devhub.test', name: 'Paarth', passwordHash: 'hash123', role: 'Member' }
    });
  }

  // 2. Setup Project with both users
  let project = await prisma.project.findFirst({ where: { name: 'DevHub QA Suite Project' } });
  if (!project) {
    project = await prisma.project.create({
      data: {
        name: 'DevHub QA Suite Project',
        description: 'Testing two-user simplified QA claiming flow',
        ownerId: user1.id,
        members: {
          create: [{ userId: user2.id, role: 'Editor' }]
        }
      }
    });
  } else {
    // Ensure user2 is an Editor
    const isMember = await prisma.projectMember.findFirst({
      where: { projectId: project.id, userId: user2.id }
    });
    if (!isMember) {
      await prisma.projectMember.create({
        data: { projectId: project.id, userId: user2.id, role: 'Editor' }
      });
    }
  }

  // 3. Start local ephemeral Express server
  const server = app.listen(0);
  const port = server.address().port;
  const baseUrl = `http://localhost:${port}/api`;

  console.log(`[Setup] Server running at ${baseUrl}`);
  console.log(`[Setup] User 1 (Admin/Tester): ${user1.name} (${user1.email})`);
  console.log(`[Setup] User 2 (Member/Tester): ${user2.name} (${user2.email})`);
  console.log(`[Setup] Project: ${project.name} (${project.id})\n`);

  try {
    // Step 1: Create a fresh Available Test Case
    const testCase = await prisma.testCase.create({
      data: {
        project: { connect: { id: project.id } },
        creator: { connect: { id: user1.id } },
        title: 'User Login & Session Persistence',
        description: 'Ensure user can log in and retain valid token after reload.',
        expectedResult: 'Dashboard loads with auth token in storage.',
        priority: 'High',
        status: 'Not Tested'
      }
    });
    console.log(`✓ [Test Case Created] ID: ${testCase.id}, Title: "${testCase.title}", TesterId: ${testCase.testerId || 'None (Available)'}`);

    // Step 2: User 1 sees available test and claims it ([Take Test])
    console.log('\n--- STEP 2: USER 1 (Umer) TAKES THE TEST ---');
    const claimRes1 = await fetch(`${baseUrl}/test-cases/${testCase.id}/claim`, {
      method: 'POST',
      headers: getAuthHeader(user1.id, 'Admin')
    });
    const claimData1 = await claimRes1.json();
    if (!claimRes1.ok || !claimData1.success) {
      throw new Error(`User 1 failed to claim test: ${JSON.stringify(claimData1)}`);
    }
    console.log(`✓ User 1 claimed test. Response: ${claimData1.message}`);
    console.log(`  Current Tester: ${claimData1.testCase.tester?.name} (ID: ${claimData1.testCase.testerId})`);

    // Step 3: User 2 sees test is taken and attempts to take it -> MUST BE REJECTED (409 CONFLICT)
    console.log('\n--- STEP 3: USER 2 (Paarth) ATTEMPTS TO TAKE TEST WHILE CLAIMED BY USER 1 ---');
    const claimRes2 = await fetch(`${baseUrl}/test-cases/${testCase.id}/claim`, {
      method: 'POST',
      headers: getAuthHeader(user2.id, 'Member')
    });
    const claimData2 = await claimRes2.json();
    console.log(`  Response Status Code: ${claimRes2.status}`);
    console.log(`  Response Message: "${claimData2.message}"`);
    if (claimRes2.status !== 409) {
      throw new Error(`Expected 409 Conflict, got ${claimRes2.status}`);
    }
    console.log('✓ Mutual exclusion enforced! User 2 cannot take a test currently claimed by User 1.');

    // Step 4: User 1 tests Passed with NO description -> MUST SUCCEED (Optional description)
    console.log('\n--- STEP 4: PASSED WITH NO DESCRIPTION (OPTIONAL) ---');
    const passRes = await fetch(`${baseUrl}/test-cases/${testCase.id}/result`, {
      method: 'POST',
      headers: getAuthHeader(user1.id, 'Admin'),
      body: JSON.stringify({ status: 'Passed', description: '' })
    });
    const passData = await passRes.json();
    if (!passRes.ok || !passData.success) {
      throw new Error(`Passed with no description failed: ${JSON.stringify(passData)}`);
    }
    console.log(`✓ Passed with empty description accepted. Status=${passData.testCase.status}`);

    // Step 5: Failed WITHOUT description -> MUST BE REJECTED (400 Bad Request)
    console.log('\n--- STEP 5: FAILED WITHOUT DESCRIPTION (MUST BE REJECTED) ---');
    const failNoDescRes = await fetch(`${baseUrl}/test-cases/${testCase.id}/result`, {
      method: 'POST',
      headers: getAuthHeader(user1.id, 'Admin'),
      body: JSON.stringify({ status: 'Failed', description: '   ' })
    });
    const failNoDescData = await failNoDescRes.json();
    console.log(`  Response Status Code: ${failNoDescRes.status}`);
    console.log(`  Response Message: "${failNoDescData.message}"`);
    if (failNoDescRes.status !== 400) {
      throw new Error(`Expected 400 Bad Request, got ${failNoDescRes.status}`);
    }
    console.log('✓ Validation enforced! Failed status rejected without description.');

    // Step 6: Failed WITH description -> MUST SUCCEED
    console.log('\n--- STEP 6: FAILED WITH DESCRIPTION (MUST SUCCEED) ---');
    const failWithDescRes = await fetch(`${baseUrl}/test-cases/${testCase.id}/result`, {
      method: 'POST',
      headers: getAuthHeader(user1.id, 'Admin'),
      body: JSON.stringify({
        status: 'Failed',
        description: 'Login button returns a 500 error after entering valid credentials.'
      })
    });
    const failWithDescData = await failWithDescRes.json();
    if (!failWithDescRes.ok || !failWithDescData.success) {
      throw new Error(`Failed with description failed: ${JSON.stringify(failWithDescData)}`);
    }
    console.log(`✓ Failed with description accepted. Status=${failWithDescData.testCase.status}`);
    console.log(`  Recorded actualResult: "${failWithDescData.testCase.actualResult}"`);

    // Step 7: Blocked WITHOUT description -> MUST BE REJECTED (400 Bad Request)
    console.log('\n--- STEP 7: BLOCKED WITHOUT DESCRIPTION (MUST BE REJECTED) ---');
    const blockedNoDescRes = await fetch(`${baseUrl}/test-cases/${testCase.id}/result`, {
      method: 'POST',
      headers: getAuthHeader(user1.id, 'Admin'),
      body: JSON.stringify({ status: 'Blocked', description: '' })
    });
    const blockedNoDescData = await blockedNoDescRes.json();
    console.log(`  Response Status Code: ${blockedNoDescRes.status}`);
    console.log(`  Response Message: "${blockedNoDescData.message}"`);
    if (blockedNoDescRes.status !== 400) {
      throw new Error(`Expected 400 Bad Request, got ${blockedNoDescRes.status}`);
    }
    console.log('✓ Validation enforced! Blocked status rejected without description.');

    // Step 8: Blocked WITH description -> MUST SUCCEED
    console.log('\n--- STEP 8: BLOCKED WITH DESCRIPTION (MUST SUCCEED) ---');
    const blockedWithDescRes = await fetch(`${baseUrl}/test-cases/${testCase.id}/result`, {
      method: 'POST',
      headers: getAuthHeader(user1.id, 'Admin'),
      body: JSON.stringify({
        status: 'Blocked',
        description: 'Staging environment database connection timed out.'
      })
    });
    const blockedWithDescData = await blockedWithDescRes.json();
    if (!blockedWithDescRes.ok || !blockedWithDescData.success) {
      throw new Error(`Blocked with description failed: ${JSON.stringify(blockedWithDescData)}`);
    }
    console.log(`✓ Blocked with description accepted. Status=${blockedWithDescData.testCase.status}`);

    // Step 9: Create Bug linked to the Failed/Blocked test
    console.log('\n--- STEP 9: CREATE BUG LINKED TO TEST CASE ---');
    const bugRes = await fetch(`${baseUrl}/bugs`, {
      method: 'POST',
      headers: getAuthHeader(user1.id, 'Admin'),
      body: JSON.stringify({
        projectId: project.id,
        testCaseId: testCase.id,
        testResultId: blockedWithDescData.testResult.id,
        title: `[Bug] ${testCase.title} execution failure`,
        description: `Test Case: ${testCase.title}\nTester: Umer\nActual Result: ${blockedWithDescData.testCase.actualResult}`,
        expectedResult: testCase.expectedResult,
        actualResult: blockedWithDescData.testCase.actualResult,
        severity: 'High',
        status: 'Open'
      })
    });
    const bugData = await bugRes.json();
    if (!bugRes.ok || !bugData.success) {
      throw new Error(`Bug creation failed: ${JSON.stringify(bugData)}`);
    }
    console.log(`✓ Bug created successfully! ID: ${bugData.bug.id}, Linked TestCase: ${bugData.bug.testCaseId}`);

    // Step 10: User 1 unselects/releases test -> returns to Available Tests
    console.log('\n--- STEP 10: USER 1 RELEASES TEST ---');
    const releaseRes = await fetch(`${baseUrl}/test-cases/${testCase.id}/release`, {
      method: 'POST',
      headers: getAuthHeader(user1.id, 'Admin')
    });
    const releaseData = await releaseRes.json();
    if (!releaseRes.ok || !releaseData.success) {
      throw new Error(`Release test failed: ${JSON.stringify(releaseData)}`);
    }
    console.log(`✓ Test released. Message: "${releaseData.message}"`);
    console.log(`  TesterId is now: ${releaseData.testCase.testerId || 'null (Available)'}`);

    // Step 11: User 2 can now claim the test!
    console.log('\n--- STEP 11: USER 2 CLAIMS THE RELEASED TEST ---');
    const claimRes2Success = await fetch(`${baseUrl}/test-cases/${testCase.id}/claim`, {
      method: 'POST',
      headers: getAuthHeader(user2.id, 'Member')
    });
    const claimData2Success = await claimRes2Success.json();
    if (!claimRes2Success.ok || !claimData2Success.success) {
      throw new Error(`User 2 failed to claim released test: ${JSON.stringify(claimData2Success)}`);
    }
    console.log(`✓ User 2 successfully claimed test after release! Tester: ${claimData2Success.testCase.tester?.name}`);

    // Step 12: Verify test history contains all executions attached directly to the test case
    console.log('\n--- STEP 12: VERIFY ATTACHED TEST HISTORY ---');
    const finalTc = await prisma.testCase.findUnique({
      where: { id: testCase.id },
      include: {
        results: {
          include: { executor: true },
          orderBy: { executedAt: 'desc' }
        },
        bugs: true
      }
    });

    console.log(`✓ Total Historical Results Attached: ${finalTc.results.length}`);
    finalTc.results.forEach((r, i) => {
      console.log(`   [Run ${i + 1}] ${r.status} — ${r.executor?.name} — "${r.actualResult || 'No desc'}"`);
    });
    console.log(`✓ Total Linked Bugs Attached: ${finalTc.bugs.length}`);

    console.log('\n==================================================');
    console.log('ALL TWO-USER QA WORKFLOW VERIFICATIONS PASSED 100%');
    console.log('==================================================');
  } finally {
    server.close();
    await prisma.$disconnect();
  }
}

runTwoUserQaFlowTest().catch(err => {
  console.error('\n❌ Test failed with error:', err);
  process.exit(1);
});
