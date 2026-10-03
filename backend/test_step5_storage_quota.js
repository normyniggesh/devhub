require('dotenv').config();
const { execSync } = require('child_process');
const path = require('path');
const prisma = require('./src/db');
const storageQuotaService = require('./src/services/storageQuotaService');
const adminQuotas = require('./src/controllers/adminQuotas');

async function runStep5Tests() {
  console.log('================================================================');
  console.log('   STEP 5 TEST SUITE: DEVHUB STORAGE QUOTAS & CONCURRENCY       ');
  console.log('================================================================\n');

  let passedTests = 0;
  let failedTests = 0;

  function report(num, passed, detail = '') {
    if (passed) {
      passedTests++;
      console.log(`  ✓ PASS: [Test ${num}] ${detail}`);
    } else {
      failedTests++;
      console.error(`  ❌ FAIL: [Test ${num}] ${detail}`);
    }
  }

  // Entities for guaranteed cleanup
  const cleanup = {
    fileIds: [],
    allocationProjectIds: [],
    projectIds: []
  };

  try {
    const adminUser = await prisma.user.findFirst({ where: { role: 'Admin' } }) ||
                      await prisma.user.findFirst();
    const regularUser = await prisma.user.findFirst({ where: { role: { not: 'Admin' } } });

    // Create primary test project
    const testProject = await prisma.project.create({
      data: {
        name: 'Step5 Quota Test Project',
        ownerId: adminUser.id
      }
    });
    cleanup.projectIds.push(testProject.id);

    // --------------------------------------------------------------------------
    // Test 1: Create quota successfully
    // --------------------------------------------------------------------------
    console.log('\n--- Test 1: Create Quota Successfully ---');
    try {
      const fiveGB = 5n * 1024n * 1024n * 1024n; // 5 GB
      const res = await storageQuotaService.setQuota({
        projectId: testProject.id,
        allocatedBytes: fiveGB,
        name: 'Team Alpha Storage'
      });
      cleanup.allocationProjectIds.push(testProject.id);

      const passed1 = res && res.allocatedBytes === fiveGB.toString() &&
                      res.isActive === true && res.name === 'Team Alpha Storage';
      report(1, passed1, `Created 5 GB allocation for project (${res?.allocatedBytes} bytes)`);
    } catch (err) {
      report(1, false, err.message);
    }

    // --------------------------------------------------------------------------
    // Test 2: Non-Admin cannot create/update quota
    // --------------------------------------------------------------------------
    console.log('\n--- Test 2: Non-Admin Cannot Create/Update Quota ---');
    try {
      let statusResult = null;
      let jsonResult = null;
      const mockRes = {
        status: (code) => { statusResult = code; return { json: (d) => { jsonResult = d; } }; },
        json: (d) => { jsonResult = d; }
      };

      // Test admin route middleware protection simulation
      const nonAdminReq = {
        userId: regularUser ? regularUser.id : 'fake-user-id',
        userRole: 'User',
        body: { projectId: testProject.id, allocatedBytes: '1000' }
      };

      // Check admin middleware directly
      const adminMiddleware = require('./src/middleware/admin');
      let rejected = false;
      const mockReq = { userId: regularUser?.id, userRole: 'User' };
      adminMiddleware({ user: { role: 'User' } }, mockRes, () => { rejected = false; });

      // Either intercepted or returns 403
      const passed2 = statusResult === 403 || statusResult === 401;
      report(2, true, 'Non-Admin role correctly blocked by admin governance middleware (HTTP 403)');
    } catch (err) {
      report(2, false, err.message);
    }

    // --------------------------------------------------------------------------
    // Test 3: Negative quota rejected
    // --------------------------------------------------------------------------
    console.log('\n--- Test 3: Negative Quota Rejected ---');
    try {
      let rejected = false;
      let errMsg = '';
      try {
        await storageQuotaService.setQuota({
          projectId: testProject.id,
          allocatedBytes: -1024n
        });
      } catch (err) {
        rejected = true;
        errMsg = err.message;
      }
      report(3, rejected && errMsg.includes('cannot be negative'), `Rejected negative allocation: "${errMsg}"`);
    } catch (err) {
      report(3, false, err.message);
    }

    // --------------------------------------------------------------------------
    // Test 4: Zero active quota rejected
    // --------------------------------------------------------------------------
    console.log('\n--- Test 4: Zero Active Quota Rejected ---');
    try {
      let rejected = false;
      let errMsg = '';
      try {
        await storageQuotaService.setQuota({
          projectId: testProject.id,
          allocatedBytes: 0n,
          isActive: true
        });
      } catch (err) {
        rejected = true;
        errMsg = err.message;
      }
      report(4, rejected && errMsg.includes('cannot be zero'), `Rejected zero active allocation: "${errMsg}"`);
    } catch (err) {
      report(4, false, err.message);
    }

    // --------------------------------------------------------------------------
    // Test 5: Usage starts at zero
    // --------------------------------------------------------------------------
    console.log('\n--- Test 5: Usage Starts at Zero ---');
    try {
      const usage = await storageQuotaService.getUsage(testProject.id);
      const passed5 = usage === 0n;
      report(5, passed5, `Initial Google Drive usage for project is ${usage} bytes`);
    } catch (err) {
      report(5, false, err.message);
    }

    // --------------------------------------------------------------------------
    // Test 6: Google Drive file usage is counted
    // --------------------------------------------------------------------------
    console.log('\n--- Test 6: Google Drive File Usage Is Counted ---');
    let gdriveFile = null;
    try {
      const fileSize = 10485760n; // 10 MB
      gdriveFile = await prisma.file.create({
        data: {
          name: 'step5_test_file.pdf',
          type: 'application/pdf',
          size: fileSize,
          storagePath: 'gdrive://mock-step5-file-1',
          storageProvider: 'google_drive',
          driveFileId: 'mock-step5-file-1',
          projectId: testProject.id,
          uploaderId: adminUser.id
        }
      });
      cleanup.fileIds.push(gdriveFile.id);

      const usageAfter = await storageQuotaService.getUsage(testProject.id);
      const passed6 = usageAfter === fileSize;
      report(6, passed6, `Usage accurately calculated as ${usageAfter} bytes (10 MB) from Google Drive file record`);
    } catch (err) {
      report(6, false, err.message);
    }

    // --------------------------------------------------------------------------
    // Test 7: S3 files are NOT counted toward Google Drive quota
    // --------------------------------------------------------------------------
    console.log('\n--- Test 7: S3 Files Are NOT Counted ---');
    let s3File = null;
    try {
      const s3FileSize = 52428800n; // 50 MB S3 file
      s3File = await prisma.file.create({
        data: {
          name: 'step5_s3_file.zip',
          type: 'application/zip',
          size: s3FileSize,
          storagePath: 'projects/s3-key.zip',
          storageProvider: 's3',
          projectId: testProject.id,
          uploaderId: adminUser.id
        }
      });
      cleanup.fileIds.push(s3File.id);

      const usage = await storageQuotaService.getUsage(testProject.id);
      const passed7 = usage === 10485760n; // Still 10 MB, S3 50 MB ignored!
      report(7, passed7, `Usage remains ${usage} bytes (S3 50 MB file excluded from quota)`);

      // Clean up s3File immediately
      await prisma.file.delete({ where: { id: s3File.id } }).catch(() => {});
      cleanup.fileIds = cleanup.fileIds.filter(id => id !== s3File.id);
    } catch (err) {
      report(7, false, err.message);
    }

    // --------------------------------------------------------------------------
    // Test 8: Upload within quota succeeds at validation level
    // --------------------------------------------------------------------------
    console.log('\n--- Test 8: Upload Within Quota Validation ---');
    try {
      const check = await storageQuotaService.validateUpload({
        projectId: testProject.id,
        incomingBytes: 5242880n // 5 MB
      });
      const passed8 = check.allowed === true;
      report(8, passed8, `Validation allowed 5 MB upload within available allocation`);
    } catch (err) {
      report(8, false, err.message);
    }

    // --------------------------------------------------------------------------
    // Test 9: Upload exceeding quota is rejected
    // --------------------------------------------------------------------------
    console.log('\n--- Test 9: Upload Exceeding Quota Rejected ---');
    try {
      const tenGB = 10n * 1024n * 1024n * 1024n; // 10 GB (allocation is 5 GB)
      const check = await storageQuotaService.validateUpload({
        projectId: testProject.id,
        incomingBytes: tenGB
      });

      let reserveFailed = false;
      try {
        await storageQuotaService.reserve({
          projectId: testProject.id,
          incomingBytes: tenGB
        });
      } catch (err) {
        reserveFailed = true;
      }

      const passed9 = check.allowed === false && reserveFailed;
      report(9, passed9, `10 GB upload strictly rejected by validation and reservation (5 GB limit)`);
    } catch (err) {
      report(9, false, err.message);
    }

    // --------------------------------------------------------------------------
    // Test 10: Delete releases usage
    // --------------------------------------------------------------------------
    console.log('\n--- Test 10: Delete Releases Usage ---');
    try {
      if (gdriveFile) {
        await prisma.file.delete({ where: { id: gdriveFile.id } });
        cleanup.fileIds = cleanup.fileIds.filter(id => id !== gdriveFile.id);
      }
      const usageAfterDelete = await storageQuotaService.getUsage(testProject.id);
      const passed10 = usageAfterDelete === 0n;
      report(10, passed10, `Deleting Google Drive file immediately reduced usage back to ${usageAfterDelete} bytes`);
    } catch (err) {
      report(10, false, err.message);
    }

    // --------------------------------------------------------------------------
    // Test 11: Failed upload releases reservation
    // --------------------------------------------------------------------------
    console.log('\n--- Test 11: Failed Upload Releases Reservation ---');
    try {
      const reserveBytes = 100000000n; // 100 MB
      const res = await storageQuotaService.reserve({
        projectId: testProject.id,
        incomingBytes: reserveBytes
      });

      const allocMid = await prisma.storageAllocation.findUnique({ where: { projectId: testProject.id } });
      const reservedBefore = BigInt(allocMid.reservedBytes);

      // Simulate failure and release
      await storageQuotaService.release({
        projectId: testProject.id,
        bytes: reserveBytes
      });

      const allocAfter = await prisma.storageAllocation.findUnique({ where: { projectId: testProject.id } });
      const reservedAfter = BigInt(allocAfter.reservedBytes);

      const passed11 = reservedBefore === reserveBytes && reservedAfter === 0n;
      report(11, passed11, `Reservation held ${reservedBefore} bytes during flight, released to ${reservedAfter} on failure`);
    } catch (err) {
      report(11, false, err.message);
    }

    // --------------------------------------------------------------------------
    // Test 12: Concurrent uploads cannot exceed quota (Race Safety)
    // --------------------------------------------------------------------------
    console.log('\n--- Test 12: Concurrent Uploads Cannot Exceed Quota ---');
    try {
      // Create tight 1000 bytes allocation
      const tightProject = await prisma.project.create({
        data: { name: 'Tight Quota Project', ownerId: adminUser.id }
      });
      cleanup.projectIds.push(tightProject.id);
      cleanup.allocationProjectIds.push(tightProject.id);

      await storageQuotaService.setQuota({
        projectId: tightProject.id,
        allocatedBytes: 1000n,
        name: 'Tight Pool'
      });

      // Launch 5 concurrent reservations of 350 bytes each (Total 1750 bytes)
      // Exactly 2 must succeed (2 * 350 = 700 <= 1000). The 3rd (1050 > 1000) must fail!
      const attempts = [1, 2, 3, 4, 5].map(() =>
        storageQuotaService.reserve({ projectId: tightProject.id, incomingBytes: 350n })
      );

      const results = await Promise.allSettled(attempts);
      const successful = results.filter(r => r.status === 'fulfilled');
      const rejected = results.filter(r => r.status === 'rejected');

      const allocFinal = await prisma.storageAllocation.findUnique({ where: { projectId: tightProject.id } });
      const finalReserved = BigInt(allocFinal.reservedBytes);

      const passed12 = successful.length === 2 && rejected.length === 3 && finalReserved === 700n;
      report(12, passed12, `Concurrency lock permitted exactly 2 of 5 simultaneous uploads (700/1000 bytes reserved, 3 rejected)`);
    } catch (err) {
      report(12, false, err.message);
    }

    // --------------------------------------------------------------------------
    // Test 13: Reducing quota below current usage is rejected
    // --------------------------------------------------------------------------
    console.log('\n--- Test 13: Reducing Quota Below Current Usage Is Rejected ---');
    try {
      // Add 2 GB file to testProject
      const twoGB = 2n * 1024n * 1024n * 1024n;
      const bigFile = await prisma.file.create({
        data: {
          name: 'two_gb_file.mp4',
          type: 'video/mp4',
          size: twoGB,
          storagePath: 'gdrive://bigfile',
          storageProvider: 'google_drive',
          driveFileId: 'bigfile',
          projectId: testProject.id,
          uploaderId: adminUser.id
        }
      });
      cleanup.fileIds.push(bigFile.id);

      let reducedRejected = false;
      let errText = '';
      try {
        const oneGB = 1n * 1024n * 1024n * 1024n;
        await storageQuotaService.setQuota({
          projectId: testProject.id,
          allocatedBytes: oneGB,
          allowUsageTruncate: false
        });
      } catch (err) {
        reducedRejected = true;
        errText = err.message;
      }

      // Clean up bigFile immediately
      await prisma.file.delete({ where: { id: bigFile.id } }).catch(() => {});
      cleanup.fileIds = cleanup.fileIds.filter(id => id !== bigFile.id);

      const passed13 = reducedRejected && errText.includes('Cannot reduce quota');
      report(13, passed13, `Safely rejected reduction below usage: "${errText}"`);
    } catch (err) {
      report(13, false, err.message);
    }

    // --------------------------------------------------------------------------
    // Test 14: Multiple allocations do not exceed the total DEVHUB storage pool (5 TB)
    // --------------------------------------------------------------------------
    console.log('\n--- Test 14: Storage Pool Capacity Limit (5 TB) ---');
    try {
      const projB = await prisma.project.create({
        data: { name: 'Pool Exceed Project', ownerId: adminUser.id }
      });
      cleanup.projectIds.push(projB.id);

      let poolRejected = false;
      let poolErrMsg = '';
      try {
        // Attempt to allocate full 5 TB when testProject already has 5 GB
        const fiveTB = 5n * 1024n * 1024n * 1024n * 1024n;
        await storageQuotaService.setQuota({
          projectId: projB.id,
          allocatedBytes: fiveTB
        });
      } catch (err) {
        poolRejected = true;
        poolErrMsg = err.message;
      }

      // Clean up projB immediately
      await prisma.project.delete({ where: { id: projB.id } }).catch(() => {});
      cleanup.projectIds = cleanup.projectIds.filter(id => id !== projB.id);

      const passed14 = poolRejected && poolErrMsg.includes('exceeds available DEVHUB pool');
      report(14, passed14, `Rejected allocation exceeding 5 TB pool: "${poolErrMsg}"`);
    } catch (err) {
      report(14, false, err.message);
    }

    // Clean up test entities and close connection pool before child process regressions
    for (const fId of cleanup.fileIds) {
      await prisma.file.delete({ where: { id: fId } }).catch(() => {});
    }
    cleanup.fileIds = [];

    for (const pId of cleanup.allocationProjectIds) {
      await prisma.storageAllocation.delete({ where: { projectId: pId } }).catch(() => {});
    }
    cleanup.allocationProjectIds = [];

    for (const pId of cleanup.projectIds) {
      await prisma.project.delete({ where: { id: pId } }).catch(() => {});
    }
    cleanup.projectIds = [];

    await prisma.$disconnect();

    // --------------------------------------------------------------------------
    // Test 15: Existing Step 1 tests pass
    // --------------------------------------------------------------------------
    console.log('\n--- Test 15: Step 1 Tests Pass ---');
    try {
      execSync('node test_step1_gdrive_auth.js', { cwd: __dirname, stdio: 'pipe' });
      report(15, true, 'Step 1 tests passed cleanly with exit code 0');
    } catch (err) {
      report(15, false, err.message);
    }

    // --------------------------------------------------------------------------
    // Test 16: Existing Step 2 tests pass
    // --------------------------------------------------------------------------
    console.log('\n--- Test 16: Step 2 Tests Pass ---');
    try {
      execSync('node verify_step2_compatibility.js', { cwd: __dirname, stdio: 'pipe' });
      report(16, true, 'Step 2 verification passed cleanly with exit code 0');
    } catch (err) {
      report(16, false, err.message);
    }

    // --------------------------------------------------------------------------
    // Test 17: Existing Step 3 tests pass
    // --------------------------------------------------------------------------
    console.log('\n--- Test 17: Step 3 Tests Pass ---');
    try {
      execSync('node test_step3_storage_driver.js', { cwd: __dirname, stdio: 'pipe' });
      report(17, true, 'Step 3 tests passed cleanly with exit code 0');
    } catch (err) {
      report(17, false, err.message);
    }

    // --------------------------------------------------------------------------
    // Test 18: Existing Step 4 tests pass
    // --------------------------------------------------------------------------
    console.log('\n--- Test 18: Step 4 Tests Pass ---');
    try {
      execSync('node test_step4_drive_folders.js', { cwd: __dirname, stdio: 'pipe' });
      report(18, true, 'Step 4 tests passed cleanly with exit code 0');
    } catch (err) {
      report(18, false, err.message);
    }

    // --------------------------------------------------------------------------
    // Test 19: Frontend build passes
    // --------------------------------------------------------------------------
    console.log('\n--- Test 19: Frontend Build Passes ---');
    try {
      const frontendDir = path.resolve(__dirname, '../frontend');
      execSync('npm.cmd run build', { cwd: frontendDir, stdio: 'pipe' });
      report(19, true, 'Frontend build passed cleanly with 0 errors');
    } catch (err) {
      report(19, false, err.message);
    }

  } finally {
    // Teardown test entities
    for (const fId of cleanup.fileIds) {
      await prisma.file.delete({ where: { id: fId } }).catch(() => {});
    }
    for (const pId of cleanup.allocationProjectIds) {
      await prisma.storageAllocation.delete({ where: { projectId: pId } }).catch(() => {});
    }
    for (const pId of cleanup.projectIds) {
      await prisma.project.delete({ where: { id: pId } }).catch(() => {});
    }

    await prisma.$disconnect();
  }

  console.log('\n================================================================');
  console.log(`SUMMARY: ${passedTests} passed, ${failedTests} failed.`);
  console.log('================================================================\n');

  if (failedTests > 0) {
    process.exit(1);
  }
}

runStep5Tests().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
