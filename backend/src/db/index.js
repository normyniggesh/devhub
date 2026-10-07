const { Pool } = require('pg');
const { PrismaPg } = require('@prisma/adapter-pg');
const { PrismaClient } = require('@prisma/client');

let poolConfig = { connectionString: process.env.DATABASE_URL };
if (process.env.DATABASE_URL) {
  try {
    const parsed = new URL(process.env.DATABASE_URL);
    poolConfig = {
      user: decodeURIComponent(parsed.username),
      password: decodeURIComponent(parsed.password),
      host: parsed.hostname,
      port: parsed.port ? parseInt(parsed.port, 10) : 5432,
      database: parsed.pathname.replace(/^\//, ''),
      ssl: (parsed.searchParams.get('sslmode') === 'require' || parsed.hostname.includes('neon.tech') || parsed.hostname.includes('render.com')) ? { rejectUnauthorized: false } : undefined
    };
  } catch (_) {
    poolConfig = { connectionString: process.env.DATABASE_URL };
  }
}

const pool = new Pool(poolConfig);
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

// Ensure BigInt values serialize cleanly to JSON numbers across all Express res.json() calls
if (!BigInt.prototype.toJSON) {
  BigInt.prototype.toJSON = function () {
    const n = Number(this);
    return Number.isSafeInteger(n) ? n : this.toString();
  };
}

// Ensure database connection and bootstrap administrator account
let schemaPromise = null;
function ensureSchema() {
  if (schemaPromise) return schemaPromise;
  schemaPromise = (async () => {
    if (!process.env.DATABASE_URL) return;
    try {
      // Bootstrap single admin account (schema is now authoritative via Prisma migrations)
      await bootstrapAdminAccount(pool);
    } catch (err) {
      console.error('[DB] Startup bootstrap error (non-fatal):', err.message);
    }
  })();
  return schemaPromise;
}

async function bootstrapAdminAccount(dbPool) {
  const p = dbPool || pool;
  if (!p) return;
  const bcrypt = require('bcryptjs');
  const { DEFAULT_PERSONAL_STORAGE_BYTES } = require('../constants/storage');
  const client = await p.connect();
  try {
    await client.query('BEGIN');
    const defaultPasswordHash = bcrypt.hashSync('123456', 10);

    // 1. Ensure admin@devhub.test exists with password 123456 and role Admin
    const adminCheck = await client.query(`SELECT id FROM "User" WHERE LOWER(email) = 'admin@devhub.test'`);
    let adminId;
    if (adminCheck.rows.length > 0) {
      adminId = adminCheck.rows[0].id;
      await client.query(`
        UPDATE "User"
        SET name = 'Admin',
            "passwordHash" = $1,
            role = 'Admin',
            "emailVerified" = true,
            status = 'Active',
            "verificationCodeHash" = NULL,
            "verificationCodeExpiresAt" = NULL,
            "verificationAttempts" = 0,
            "updatedAt" = NOW()
        WHERE id = $2
      `, [defaultPasswordHash, adminId]);
    } else {
      const newAdmin = await client.query(`
        INSERT INTO "User" (
          id, name, email, "passwordHash", role, "emailVerified", status, "createdAt", "updatedAt"
        ) VALUES (
          gen_random_uuid(), 'Admin', 'admin@devhub.test', $1, 'Admin', true, 'Active', NOW(), NOW()
        ) RETURNING id
      `, [defaultPasswordHash]);
      adminId = newAdmin.rows[0].id;
    }

    // 2. Ensure admin@devhub.test is the ONLY admin account (demote any other admin to User)
    await client.query(`
      UPDATE "User"
      SET role = 'User'
      WHERE id != $1 AND role = 'Admin'
    `, [adminId]);

    // 3. Ensure Admin has 5 GB personal storage allocation
    await client.query(`
      INSERT INTO "PersonalStorageAllocation" ("id", "userId", "allocatedBytes", "usedBytes", "createdAt", "updatedAt")
      VALUES (gen_random_uuid(), $1, $2, 0, NOW(), NOW())
      ON CONFLICT ("userId") DO UPDATE
      SET "updatedAt" = NOW();
    `, [adminId, DEFAULT_PERSONAL_STORAGE_BYTES.toString()]);

    await client.query('COMMIT');
    console.log('[DB] Bootstrap complete: admin@devhub.test is sole Admin with 5 GB personal storage.');
    return {
      success: true,
      adminId
    };
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[DB] Account synchronization error (non-fatal):', err.message);
    throw err;
  } finally {
    client.release();
  }
}

ensureSchema();

module.exports = prisma;
module.exports.prisma = prisma;
module.exports.pool = pool;
module.exports.ensureSchema = ensureSchema;
module.exports.bootstrapAdminAccount = bootstrapAdminAccount;
module.exports.syncProductionAccounts = bootstrapAdminAccount; // Backwards compatible alias


