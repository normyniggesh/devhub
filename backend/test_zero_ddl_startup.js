require('dotenv').config();
const { pool, bootstrapAdminAccount } = require('./src/db');
const { execSync } = require('child_process');

async function testZeroDdlStartup() {
  console.log('================================================================');
  console.log('   DEVHUB PASS 9A — ZERO-DDL STARTUP ARCHITECTURE VERIFICATION  ');
  console.log('================================================================\n');

  let allPassed = true;
  function report(num, passed, desc) {
    if (passed) {
      console.log(`  ✓ PASS: [Check ${num}] ${desc}`);
    } else {
      console.error(`  ❌ FAIL: [Check ${num}] ${desc}`);
      allPassed = false;
    }
  }

  try {
    // 1. Intercept pool queries during bootstrapAdminAccount
    const interceptedQueries = [];
    const origQuery = pool.query.bind(pool);
    pool.query = function (text, ...args) {
      const qStr = (typeof text === 'string' ? text : text?.text || '').trim();
      interceptedQueries.push(qStr);
      return origQuery(text, ...args);
    };

    // Run startup account synchronization
    await bootstrapAdminAccount(pool);

    // Restore pool.query
    pool.query = origQuery;

    // Check if any query contains DDL statements
    const ddlKeywords = ['CREATE TABLE', 'ALTER TABLE', 'DROP TABLE', 'CREATE INDEX', 'DROP INDEX', 'CREATE UNIQUE INDEX'];
    const executedDdl = interceptedQueries.filter(q =>
      ddlKeywords.some(kw => q.toUpperCase().includes(kw))
    );

    report(1, executedDdl.length === 0,
      `ensureSchema() executes ZERO schema DDL on startup (DDL count: ${executedDdl.length})`);

    // 2. Verify FileShare and FolderShare exist in database
    const tablesRes = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_name IN ('FileShare', 'FolderShare')
      ORDER BY table_name ASC
    `);
    const existingTables = tablesRes.rows.map(r => r.table_name);
    report(2, existingTables.length === 2,
      `FileShare and FolderShare tables exist and are accessible (Found: ${existingTables.join(', ')})`);

    // 3. Verify Prisma migration status is clean
    const statusOutput = execSync('cmd.exe /c "npx prisma migrate status"', {
      encoding: 'utf8',
      env: process.env
    });
    const isClean = statusOutput.includes('Database schema is up to date');
    report(3, isClean,
      `Prisma migration status is authoritative ("Database schema is up to date!")`);

    console.log('\n================================================================');
    if (allPassed) {
      console.log('  >>> ZERO-DDL STARTUP VERIFICATION 100% SUCCESSFUL! <<<');
    } else {
      console.error('  >>> ZERO-DDL STARTUP VERIFICATION FAILED <<<');
    }
    console.log('================================================================\n');

  } catch (err) {
    console.error('Zero-DDL verification error:', err);
    allPassed = false;
  } finally {
    await pool.end();
  }

  if (!allPassed) process.exit(1);
}

testZeroDdlStartup();
