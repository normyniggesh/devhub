require('dotenv').config();
const { prisma, ensureSchema } = require('./src/db');

async function runQaFlowTest() {
  console.log('--- STARTING QA INTEGRATED WORKFLOW TEST ---');
  await ensureSchema();

  // Isolated test users: User A and User B
  const userAEmail = `test_qa_userA_${Date.now()}@devhub.test`;
  const userBEmail = `test_qa_userB_${Date.now()}@devhub.test`;

  const userA = await prisma.user.create({
    data: {
      email: userAEmail,
      name: 'Umer (QA Tester)',
      passwordHash: 'dummyhash',
      role: 'Admin',
      emailVerified: true
    }
  });

  const userB = await prisma.user.create({
    data: {
      email: userBEmail,
      name: 'Paarth (QA Tester)',
      passwordHash: 'dummyhash',
      role: 'Member',
      emailVerified: true
    }
  });

  // Find or create test project
  let project = await prisma.project.findFirst({ where: { name: 'DevHub QA Suite Project' } });
  if (!project) {
    project = await prisma.project.create({
      data: {
        name: 'DevHub QA Suite Project',
        description: 'Project for testing unified QA system',
        ownerId: userA.id,
        members: {
          create: [
            { userId: userB.id, role: 'Editor' }
          ]
        }
      }
    });
  }

  console.log(`[Setup] Project: "${project.name}" (ID: ${project.id})`);
  console.log(`[Setup] User A: "${userA.name}", User B: "${userB.name}"`);

  // Step 1: Create Test
  console.log('\nStep 1: Create Test');
  const testCase = await prisma.testCase.create({
    data: {
      projectId: project.id,
      title: 'Login Test',
      description: 'Verify that users can log in with valid credentials.',
      expectedResult: 'User reaches Dashboard.',
      priority: 'High',
      status: 'Not Tested',
      creatorId: userA.id
    }
  });
  console.log(`✓ Created Test Case: "${testCase.title}" (ID: ${testCase.id}, Status: ${testCase.status})`);

  // Step 2: Assign Test to User B (Paarth)
  console.log('\nStep 2: Assign Test');
  const assignedTest = await prisma.testCase.update({
    where: { id: testCase.id },
    data: { assigneeId: userB.id },
    include: { assignee: true }
  });
  console.log(`✓ Assigned Test to: ${assignedTest.assignee.name}`);

  // Step 3: Open Test & Step 4: Run Test & Step 5: Mark Passed by User B
  console.log('\nStep 3-5: Run Test -> Mark Passed (Run 1)');
  const run1 = await prisma.testResult.create({
    data: {
      testCaseId: testCase.id,
      status: 'Passed',
      actualResult: 'User landed on /dashboard promptly',
      executorId: userB.id
    }
  });
  // Update TestCase status & actual result
  await prisma.testCase.update({
    where: { id: testCase.id },
    data: {
      status: 'Passed',
      actualResult: run1.actualResult
    }
  });
  console.log(`✓ Run 1 recorded by ${userB.name}: Status=${run1.status}, Actual="${run1.actualResult}"`);

  // Step 6: Run again & Step 7: Mark Failed by User A (Umer)
  console.log('\nStep 6-7: Run again -> Mark Failed (Run 2)');
  const run2 = await prisma.testResult.create({
    data: {
      testCaseId: testCase.id,
      status: 'Failed',
      actualResult: '500 Server Error on submit button click',
      executorId: userA.id
    }
  });
  await prisma.testCase.update({
    where: { id: testCase.id },
    data: {
      status: 'Failed',
      actualResult: run2.actualResult
    }
  });
  console.log(`✓ Run 2 recorded by ${userA.name}: Status=${run2.status}, Actual="${run2.actualResult}"`);

  // Step 8: Create Bug from failed run
  console.log('\nStep 8: Create Bug from failed run');
  const bug = await prisma.bug.create({
    data: {
      projectId: project.id,
      testCaseId: testCase.id,
      testResultId: run2.id,
      title: 'Login fails with valid password (500 Error)',
      description: 'Login form returns 500 when valid credentials are submitted.',
      expectedResult: testCase.expectedResult,
      actualResult: run2.actualResult,
      severity: 'High',
      status: 'Open',
      creatorId: userA.id,
      assigneeId: userB.id // Step 9: Assign Bug to Paarth
    },
    include: {
      testCase: true,
      testResult: true,
      assignee: true,
      creator: true
    }
  });
  console.log(`✓ Created Bug: "${bug.title}"`);
  console.log(`  Linked TestCase: ${bug.testCase.title} (ID: ${bug.testCase.id})`);
  console.log(`  Linked TestResult: ${bug.testResult.id} (Status: ${bug.testResult.status})`);
  console.log(`  Assigned To: ${bug.assignee.name}`);

  // Step 10: Change Bug status (In Progress)
  console.log('\nStep 10: Change Bug status to In Progress');
  const bugInProgress = await prisma.bug.update({
    where: { id: bug.id },
    data: { status: 'In Progress' }
  });
  console.log(`✓ Bug Status updated to: ${bugInProgress.status}`);

  // Step 11: Fix Bug (Resolved)
  console.log('\nStep 11: Fix Bug -> Status Resolved');
  const bugResolved = await prisma.bug.update({
    where: { id: bug.id },
    data: { status: 'Resolved' }
  });
  console.log(`✓ Bug Status updated to: ${bugResolved.status}`);

  // Step 12: Run Test again & Step 13: Mark Passed by User B
  console.log('\nStep 12-13: Run Test again -> Mark Passed (Run 3)');
  const run3 = await prisma.testResult.create({
    data: {
      testCaseId: testCase.id,
      status: 'Passed',
      actualResult: 'User lands on /dashboard seamlessly after bug fix',
      executorId: userB.id
    }
  });
  await prisma.testCase.update({
    where: { id: testCase.id },
    data: {
      status: 'Passed',
      actualResult: run3.actualResult
    }
  });
  console.log(`✓ Run 3 recorded by ${userB.name}: Status=${run3.status}, Actual="${run3.actualResult}"`);

  // Step 14: Confirm test/run/bug history remains permanently linked
  console.log('\nStep 14: Confirm test/run/bug history remains linked');
  const finalTestCase = await prisma.testCase.findUnique({
    where: { id: testCase.id },
    include: {
      assignee: true,
      results: {
        orderBy: { executedAt: 'asc' },
        include: {
          executor: true,
          bugs: true
        }
      },
      bugs: {
        include: {
          assignee: true,
          creator: true
        }
      }
    }
  });

  console.log(`\n--- FINAL VERIFICATION SUMMARY ---`);
  console.log(`Test: ${finalTestCase.title}`);
  console.log(`Current Status: ${finalTestCase.status}`);
  console.log(`Current Actual Result: ${finalTestCase.actualResult}`);
  console.log(`Assignee: ${finalTestCase.assignee?.name}`);
  console.log(`Total Runs: ${finalTestCase.results.length}`);
  finalTestCase.results.forEach((r, i) => {
    console.log(`  Run ${i + 1}: ${r.status} by ${r.executor?.name} | Notes: "${r.actualResult}" | Linked Bugs: ${r.bugs.length}`);
  });
  console.log(`Total Linked Bugs: ${finalTestCase.bugs.length}`);
  finalTestCase.bugs.forEach((b, i) => {
    console.log(`  Bug ${i + 1}: "${b.title}" [${b.status}] | Assigned: ${b.assignee?.name} | Creator: ${b.creator?.name}`);
  });

  const passed =
    finalTestCase.results.length === 3 &&
    finalTestCase.bugs.length === 1 &&
    finalTestCase.bugs[0].testResultId === run2.id &&
    finalTestCase.status === 'Passed';

  try {
    if (passed) {
      console.log('\n>>> ALL 14 STEPS PASSED SUCCESSFULLY! REAL FLOW VERIFIED IN POSTGRESQL! <<<');
    } else {
      throw new Error('Verification assertions failed');
    }
  } finally {
    if (project?.id) {
      await prisma.bug.deleteMany({ where: { projectId: project.id } }).catch(() => {});
      await prisma.testResult.deleteMany({ where: { testCase: { projectId: project.id } } }).catch(() => {});
      await prisma.testRun.deleteMany({ where: { projectId: project.id } }).catch(() => {});
      await prisma.testCase.deleteMany({ where: { projectId: project.id } }).catch(() => {});
      await prisma.projectMember.deleteMany({ where: { projectId: project.id } }).catch(() => {});
      await prisma.project.delete({ where: { id: project.id } }).catch(() => {});
    }
    if (userA?.id || userB?.id) {
      const uids = [userA?.id, userB?.id].filter(Boolean);
      await prisma.user.deleteMany({ where: { id: { in: uids } } }).catch(() => {});
    }
  }
}

runQaFlowTest()
  .catch((err) => {
    console.error('Test failed:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
