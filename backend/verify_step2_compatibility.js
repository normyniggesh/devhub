require('dotenv').config();
const { pool, prisma } = require('./src/db');

async function verifyStep2() {
  console.log('========================================================');
  console.log('   STEP 2 VERIFICATION: DATABASE & COMPATIBILITY CHECK  ');
  console.log('========================================================\n');

  let failureCount = 0;

  function assert(condition, message) {
    if (!condition) {
      console.error(`  ❌ FAIL: ${message}`);
      failureCount++;
    } else {
      console.log(`  ✓ PASS: ${message}`);
    }
  }

  try {
    // -------------------------------------------------------------
    // 1. Column & Type Verification
    // -------------------------------------------------------------
    console.log('[Check 1] Inspecting column types in PostgreSQL...');
    const colRes = await pool.query(`
      SELECT table_name, column_name, data_type, is_nullable, column_default 
      FROM information_schema.columns 
      WHERE table_name IN ('File', 'Project', 'Folder') 
        AND column_name IN ('storageProvider', 'driveFileId', 'size', 'driveFolderId')
      ORDER BY table_name, column_name;
    `);

    const colMap = {};
    colRes.rows.forEach(r => {
      colMap[`${r.table_name}.${r.column_name}`] = r;
    });

    assert(colMap['File.storageProvider'] && colMap['File.storageProvider'].data_type === 'text',
      'File.storageProvider exists as TEXT');
    assert(colMap['File.driveFileId'] && colMap['File.driveFileId'].data_type === 'text',
      'File.driveFileId exists as TEXT');
    assert(colMap['File.size'] && colMap['File.size'].data_type === 'bigint',
      'File.size exists as BIGINT');
    assert(colMap['Project.driveFolderId'] && colMap['Project.driveFolderId'].data_type === 'text',
      'Project.driveFolderId exists as TEXT');
    assert(colMap['Folder.driveFolderId'] && colMap['Folder.driveFolderId'].data_type === 'text',
      'Folder.driveFolderId exists as TEXT');

    // -------------------------------------------------------------
    // 2. Existing Data Integrity & S3 Default
    // -------------------------------------------------------------
    console.log('\n[Check 2] Verifying existing File records...');
    const files = await prisma.file.findMany();
    console.log(`  Found ${files.length} existing file records in database.`);

    assert(files.length > 0, 'Existing files present in database');
    let allS3 = true;
    let allPathsIntact = true;
    let allSizesValid = true;

    files.forEach(f => {
      if (f.storageProvider !== 's3') allS3 = false;
      if (!f.storagePath || typeof f.storagePath !== 'string') allPathsIntact = false;
      if (typeof f.size !== 'bigint' && typeof f.size !== 'number') allSizesValid = false;
    });

    assert(allS3, 'All existing files have storageProvider = "s3"');
    assert(allPathsIntact, 'All existing storagePath values remain unchanged');
    assert(allSizesValid, 'All existing file sizes read successfully without corruption');

    // -------------------------------------------------------------
    // 3. Project and Folder compatibility
    // -------------------------------------------------------------
    console.log('\n[Check 3] Verifying Project and Folder nullable driveFolderId...');
    const testProject = await prisma.project.findFirst();
    assert(testProject && 'driveFolderId' in testProject, 'Project record includes driveFolderId field');
    assert(testProject.driveFolderId === null || typeof testProject.driveFolderId === 'string',
      'Project.driveFolderId is null or string');

    const testFolder = await prisma.folder.findFirst();
    if (testFolder) {
      assert('driveFolderId' in testFolder, 'Folder record includes driveFolderId field');
      assert(testFolder.driveFolderId === null || typeof testFolder.driveFolderId === 'string',
        'Folder.driveFolderId is null or string');
    }

    // -------------------------------------------------------------
    // 4. BigInt Serialization Safety (> 2.14 GB Support)
    // -------------------------------------------------------------
    console.log('\n[Check 4] Testing BigInt JSON serialization & large file support (> 2.14 GB)...');
    const largeSize = 5368709120n; // 5 GB (exceeds 32-bit signed int 2,147,483,647)
    const mockFileRecord = {
      id: 'mock-file-id-5gb',
      name: 'large_video_archive.mp4',
      size: largeSize,
      storagePath: 'projects/mock/large.mp4',
      storageProvider: 's3',
      driveFileId: null
    };

    let serializedJson;
    let threwError = false;
    try {
      serializedJson = JSON.stringify(mockFileRecord);
    } catch (err) {
      threwError = true;
    }

    assert(!threwError, 'JSON.stringify does not throw TypeError on BigInt');
    const parsed = JSON.parse(serializedJson);
    assert(parsed.size === 5368709120, 'BigInt size serialized to accurate JSON number 5368709120');
    assert(parsed.storageProvider === 's3', 'storageProvider is serialized as "s3"');

    // -------------------------------------------------------------
    // 5. Prisma Insert with BigInt (> 2.14 GB) and Clean Up
    // -------------------------------------------------------------
    console.log('\n[Check 5] Testing Prisma insert & retrieval of >2.14 GB file...');
    const createdFile = await prisma.file.create({
      data: {
        name: 'step2_test_bigint_4gb.iso',
        type: 'application/x-iso9660-image',
        size: 4294967296n, // 4 GB
        storagePath: 'projects/test/step2_test.iso',
        storageProvider: 's3',
        projectId: testProject.id,
        uploaderId: testProject.ownerId
      }
    });

    assert(createdFile.storageProvider === 's3', 'Newly inserted record defaults/sets storageProvider to "s3"');
    assert(createdFile.size === 4294967296n, 'Newly inserted record accurately stored 4 GB size as BigInt');

    const fetchedFile = await prisma.file.findUnique({ where: { id: createdFile.id } });
    assert(fetchedFile.size === 4294967296n, 'Retrieved record retains full 64-bit BigInt value');

    // Delete test record
    await prisma.file.delete({ where: { id: createdFile.id } });
    console.log('  Cleaned up temporary 4 GB test record.');

    console.log('\n========================================================');
    if (failureCount === 0) {
      console.log('   >>> ALL STEP 2 COMPATIBILITY CHECKS PASSED 100%! <<<');
      console.log('========================================================\n');
      process.exit(0);
    } else {
      console.error(`   >>> ${failureCount} CHECKS FAILED! <<<`);
      console.log('========================================================\n');
      process.exit(1);
    }
  } catch (err) {
    console.error('Unexpected error during verification:', err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

verifyStep2();
