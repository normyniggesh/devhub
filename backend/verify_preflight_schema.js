require('dotenv').config();
const { pool } = require('./src/db');

async function runPreflight() {
  console.log('================================================================');
  console.log('   PHASE 3: PRODUCTION PREFLIGHT SCHEMA VERIFICATION           ');
  console.log('================================================================\n');

  let allPassed = true;

  function report(name, passed, detail) {
    if (passed) {
      console.log(`  ✓ PASS: ${name} (${detail || 'OK'})`);
    } else {
      console.error(`  ❌ FAIL: ${name} (${detail || 'FAILED'})`);
      allPassed = false;
    }
  }

  try {
    async function checkTable(tableName) {
      const r = await pool.query(
        `SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=$1`,
        [tableName]
      );
      return r.rows.length > 0;
    }

    async function checkColumn(tableName, columnName) {
      const r = await pool.query(
        `SELECT data_type, is_nullable FROM information_schema.columns WHERE table_schema='public' AND table_name=$1 AND column_name=$2`,
        [tableName, columnName]
      );
      return r.rows[0] || null;
    }

    // 1. Tables existence
    report('Table "Team"', await checkTable('Team'), 'Exists');
    report('Table "TeamMember"', await checkTable('TeamMember'), 'Exists');
    report('Table "PersonalStorageAllocation"', await checkTable('PersonalStorageAllocation'), 'Exists');
    report('Table "TeamStorageAllocation"', await checkTable('TeamStorageAllocation'), 'Exists');
    report('Table "UserIntegration"', await checkTable('UserIntegration'), 'Exists');
    report('Table "StorageAllocation" (Obsolete)', !(await checkTable('StorageAllocation')), 'Absent');

    // 2. File columns
    const fileScope = await checkColumn('File', 'storageScope');
    report('Column "File.storageScope"', Boolean(fileScope), fileScope?.data_type);
    const fileTeam = await checkColumn('File', 'teamId');
    report('Column "File.teamId"', Boolean(fileTeam), fileTeam?.data_type);
    const fileProj = await checkColumn('File', 'projectId');
    report('Column "File.projectId" is nullable', fileProj?.is_nullable === 'YES', `is_nullable=${fileProj?.is_nullable}`);

    // 3. Folder columns
    const folderScope = await checkColumn('Folder', 'storageScope');
    report('Column "Folder.storageScope"', Boolean(folderScope), folderScope?.data_type);
    const folderTeam = await checkColumn('Folder', 'teamId');
    report('Column "Folder.teamId"', Boolean(folderTeam), folderTeam?.data_type);
    const folderProj = await checkColumn('Folder', 'projectId');
    report('Column "Folder.projectId" is nullable', folderProj?.is_nullable === 'YES', `is_nullable=${folderProj?.is_nullable}`);

    // 4. Foreign Keys & Indexes
    const fksRes = await pool.query(`
      SELECT conname, conrelid::regclass::text as table_name 
      FROM pg_constraint 
      WHERE conname IN (
        'TeamMember_teamId_fkey', 'TeamMember_userId_fkey',
        'PersonalStorageAllocation_userId_fkey',
        'TeamStorageAllocation_teamId_fkey'
      )
    `);
    const foundFks = new Set(fksRes.rows.map(r => r.conname));
    report('FK TeamMember_teamId_fkey', foundFks.has('TeamMember_teamId_fkey'), 'Present');
    report('FK TeamMember_userId_fkey', foundFks.has('TeamMember_userId_fkey'), 'Present');
    report('FK PersonalStorageAllocation_userId_fkey', foundFks.has('PersonalStorageAllocation_userId_fkey'), 'Present');
    report('FK TeamStorageAllocation_teamId_fkey', foundFks.has('TeamStorageAllocation_teamId_fkey'), 'Present');

    console.log('\n================================================================');
    if (allPassed) {
      console.log('   >>> PREFLIGHT VERIFICATION PASSED: PRODUCTION READY! <<<');
    } else {
      console.error('   >>> PREFLIGHT VERIFICATION FAILED: DO NOT PROCEED! <<<');
    }
    console.log('================================================================\n');

  } catch (err) {
    console.error('Preflight error:', err);
    allPassed = false;
  } finally {
    await pool.end();
  }

  if (!allPassed) process.exit(1);
}

runPreflight();
