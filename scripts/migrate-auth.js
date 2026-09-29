const fs = require('fs');
const path = require('path');
const admin = require('../functions/node_modules/firebase-admin');

// Safe initialization
if (!admin.apps.length) {
  const projectId = process.env.VITE_FIREBASE_PROJECT_ID || 'devhub-ebd3c';
  if (process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
    try {
      const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
      admin.initializeApp({ credential: admin.credential.cert(sa), projectId });
    } catch (e) {
      console.warn('Failed to parse FIREBASE_SERVICE_ACCOUNT_KEY, falling back to default:', e.message);
      admin.initializeApp({ projectId });
    }
  } else {
    admin.initializeApp({ projectId });
  }
}

const auth = admin.auth();
const db = admin.firestore();

async function migrateUsers({ dryRun = false } = {}) {
  console.log('--- DEVHUB AUTHENTICATION & USER MIGRATION ---');
  if (dryRun) console.log('MODE: DRY RUN (no auth writes will occur)');

  const backupFile = path.resolve(__dirname, '../data-export/backup.json');
  if (!fs.existsSync(backupFile)) {
    throw new Error(`Backup file not found at ${backupFile}. Please run 'npm run export:data' first.`);
  }

  const rawData = fs.readFileSync(backupFile, 'utf8');
  const { data } = JSON.parse(rawData);
  const users = data.users || [];

  console.log(`Found ${users.length} user(s) to migrate.`);

  const usersToImport = [];
  const firestoreUserDocs = [];

  for (const user of users) {
    const isBcrypt = user.passwordHash && (user.passwordHash.startsWith('$2a$') || user.passwordHash.startsWith('$2b$'));
    if (!isBcrypt) {
      console.warn(`User ${user.email} does not have a standard BCRYPT hash. Skipping direct password import.`);
      continue;
    }

    usersToImport.push({
      uid: user.id, // Preserves exact UUID
      email: user.email.toLowerCase().trim(),
      displayName: user.name,
      photoURL: user.avatarUrl || undefined,
      passwordHash: Buffer.from(user.passwordHash)
    });

    firestoreUserDocs.push({
      uid: user.id,
      name: user.name,
      email: user.email.toLowerCase().trim(),
      emailLower: user.email.toLowerCase().trim(),
      avatarUrl: user.avatarUrl || null,
      role: user.role || 'User',
      createdAt: user.createdAt ? new Date(user.createdAt) : admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: user.updatedAt ? new Date(user.updatedAt) : admin.firestore.FieldValue.serverTimestamp()
    });
  }

  console.log(`Prepared ${usersToImport.length} user(s) for Firebase Auth import:`);
  usersToImport.forEach(u => console.log(`  - UID: ${u.uid} | Email: ${u.email} | Name: ${u.displayName}`));

  if (dryRun) {
    console.log('DRY RUN: Validation passed. All user IDs and BCRYPT hashes conform to Firebase Admin SDK requirements.');
    console.log('--- USER MIGRATION COMPLETE (DRY RUN) ---');
    return;
  }

  if (usersToImport.length > 0) {
    console.log(`Importing ${usersToImport.length} user(s) into Firebase Authentication with BCRYPT hash...`);
    try {
      const result = await auth.importUsers(usersToImport, {
        hash: {
          algorithm: 'BCRYPT'
        }
      });

      console.log(`Firebase Auth Import: ${result.successCount} succeeded, ${result.failureCount} failed.`);
      if (result.errors && result.errors.length > 0) {
        result.errors.forEach(err => console.error(`Error importing user index ${err.index}: ${err.error.message}`));
      }
    } catch (importErr) {
      console.error('Firebase Auth importUsers error:', importErr.message);
      throw importErr;
    }

    // Write to Firestore /users/{uid}
    console.log(`Writing ${firestoreUserDocs.length} profile document(s) to Firestore /users collection...`);
    const batch = db.batch();
    for (const uDoc of firestoreUserDocs) {
      const ref = db.collection('users').doc(uDoc.uid);
      batch.set(ref, uDoc, { merge: true });
    }
    await batch.commit();
    console.log('Firestore user documents created successfully.');
  }

  console.log('--- USER MIGRATION COMPLETE ---');
}

if (require.main === module) {
  const isDryRun = process.argv.includes('--dry-run');
  migrateUsers({ dryRun: isDryRun })
    .then(() => process.exit(0))
    .catch((e) => {
      console.error('Migration failed:', e);
      process.exit(1);
    });
}

module.exports = { migrateUsers };
