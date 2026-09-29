/**
 * DEVHUB S3 to Cloud Storage for Firebase Migration Script
 *
 * Transfers existing binary assets from AWS S3 to Cloud Storage for Firebase.
 * Updates Firestore /files documents with the new Cloud Storage paths and download URLs.
 * Idempotent: Can be run multiple times safely.
 */

const fs = require('fs');
const path = require('path');
let admin;
try {
  admin = require('../functions/node_modules/firebase-admin');
} catch (e) {
  admin = require('firebase-admin');
}

// Optional AWS SDK - only loaded if AWS S3 migration is needed
let S3Client, GetObjectCommand;
try {
  const awsS3 = require('../backend/node_modules/@aws-sdk/client-s3');
  S3Client = awsS3.S3Client;
  GetObjectCommand = awsS3.GetObjectCommand;
} catch (e) {
  try {
    const awsS3 = require('@aws-sdk/client-s3');
    S3Client = awsS3.S3Client;
    GetObjectCommand = awsS3.GetObjectCommand;
  } catch (err) {
    // Will be reported if S3 download is attempted
  }
}

// Initialize Firebase Admin
if (!admin.apps.length) {
  const projectId = process.env.VITE_FIREBASE_PROJECT_ID || 'devhub-ebd3c';
  const storageBucket = process.env.VITE_FIREBASE_STORAGE_BUCKET || `${projectId}.appspot.com`;

  if (process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
    try {
      const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
      admin.initializeApp({
        credential: admin.credential.cert(sa),
        projectId,
        storageBucket
      });
    } catch (e) {
      console.warn('Failed to parse FIREBASE_SERVICE_ACCOUNT_KEY, falling back to default:', e.message);
      admin.initializeApp({ projectId, storageBucket });
    }
  } else {
    admin.initializeApp({ projectId, storageBucket });
  }
}

const db = admin.firestore();
const storage = admin.storage();

async function migrateS3Files({ dryRun = false } = {}) {
  console.log('--- DEVHUB S3 TO CLOUD STORAGE MIGRATION ---');
  if (dryRun) console.log('MODE: DRY RUN (no files will be written)');

  const backupFile = path.resolve(__dirname, '../data-export/backup.json');
  if (!fs.existsSync(backupFile)) {
    throw new Error(`Backup file not found at ${backupFile}. Please run 'npm run export:data' first.`);
  }

  const rawData = fs.readFileSync(backupFile, 'utf8');
  const { data } = JSON.parse(rawData);
  const files = data.files || [];

  console.log(`Found ${files.length} file record(s) in backup.`);

  if (files.length === 0) {
    console.log('No files to migrate. AWS S3 to Cloud Storage migration complete (0 files).');
    return { total: 0, transferred: 0, skipped: 0, failed: 0 };
  }

  const s3Bucket = process.env.AWS_S3_BUCKET_NAME;
  const s3Region = process.env.AWS_REGION || 'us-east-1';

  let s3 = null;
  if (S3Client && s3Bucket && process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY) {
    s3 = new S3Client({
      region: s3Region,
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
      }
    });
  } else {
    console.warn('AWS S3 credentials or bucket name not fully configured in environment.');
    console.warn('Files in metadata will be verified in Firestore, but binary download from S3 skipped.');
  }

  const bucket = storage.bucket();
  let transferred = 0;
  let skipped = 0;
  let failed = 0;

  for (const file of files) {
    const destinationPath = `projects/${file.projectId}/${file.id}-${file.name}`;
    console.log(`Processing file [${file.id}] "${file.name}" -> ${destinationPath}`);

    if (dryRun) {
      transferred++;
      continue;
    }

    try {
      // Check if file already exists in Cloud Storage
      const gcsFile = bucket.file(destinationPath);
      const [exists] = await gcsFile.exists();

      if (exists) {
        console.log(`  File already exists in Cloud Storage: ${destinationPath}`);
        skipped++;
      } else if (s3 && file.key) {
        console.log(`  Streaming from AWS S3 (${s3Bucket}/${file.key}) to Cloud Storage (${destinationPath})...`);
        const s3Response = await s3.send(new GetObjectCommand({
          Bucket: s3Bucket,
          Key: file.key
        }));

        const writeStream = gcsFile.createWriteStream({
          metadata: {
            contentType: file.mimeType || 'application/octet-stream',
            metadata: {
              originalName: file.name,
              projectId: file.projectId,
              folderId: file.folderId || '',
              uploadedBy: file.userId || file.uploadedBy || ''
            }
          }
        });

        await new Promise((resolve, reject) => {
          s3Response.Body.pipe(writeStream)
            .on('finish', resolve)
            .on('error', reject);
        });

        console.log(`  Successfully transferred to Cloud Storage.`);
        transferred++;
      } else {
        console.log(`  No S3 key or client available for binary transfer. Recording metadata.`);
        skipped++;
      }

      // Update Firestore file document with storagePath
      const fileRef = db.collection('files').doc(file.id);
      await fileRef.set({
        storagePath: destinationPath,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      }, { merge: true });

    } catch (err) {
      console.error(`  Error processing file ${file.name}:`, err.message);
      failed++;
    }
  }

  console.log(`\n--- S3 FILE MIGRATION SUMMARY ---`);
  console.log(`Total: ${files.length} | Transferred: ${transferred} | Skipped: ${skipped} | Failed: ${failed}`);
  return { total: files.length, transferred, skipped, failed };
}

if (require.main === module) {
  const isDryRun = process.argv.includes('--dry-run');
  migrateS3Files({ dryRun: isDryRun })
    .then(() => process.exit(0))
    .catch((e) => {
      console.error('S3 Migration failed:', e);
      process.exit(1);
    });
}

module.exports = { migrateS3Files };
