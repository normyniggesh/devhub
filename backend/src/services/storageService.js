const { 
  S3Client, 
  PutObjectCommand, 
  DeleteObjectCommand, 
  GetObjectCommand,
  HeadObjectCommand,
  HeadBucketCommand,
  GetBucketLocationCommand,
  ListObjectsV2Command,
  ListBucketsCommand,
  GetBucketPolicyCommand,
  GetBucketEncryptionCommand,
  GetBucketAclCommand,
  GetBucketOwnershipControlsCommand,
  GetPublicAccessBlockCommand
} = require('@aws-sdk/client-s3');
const { STSClient, GetCallerIdentityCommand } = require('@aws-sdk/client-sts');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const crypto = require('crypto');
const path = require('path');
const { Readable } = require('stream');
const prisma = require('../db');

// Safe initialization that won't crash if env vars are missing
let s3Client = null;
let currentClientRegion = null;
let detectedBucketRegion = null;
let cachedCallerIdentity = null;

const cleanEnv = (val) => val ? val.replace(/^['"]+|['"]+$/g, '').trim() : '';

/**
 * Safely fetches the AWS STS Caller Identity without leaking secrets.
 */
const getCallerIdentitySafe = async () => {
  if (cachedCallerIdentity) return cachedCallerIdentity;
  try {
    const accessKeyId = cleanEnv(process.env.AWS_ACCESS_KEY_ID);
    const secretAccessKey = cleanEnv(process.env.AWS_SECRET_ACCESS_KEY);
    const stsClient = new STSClient({
      region: currentClientRegion || 'us-west-2',
      credentials: { accessKeyId, secretAccessKey }
    });
    const res = await stsClient.send(new GetCallerIdentityCommand({}));
    cachedCallerIdentity = {
      account: res.Account,
      arn: res.Arn,
      userId: res.UserId
    };
    return cachedCallerIdentity;
  } catch (err) {
    return { account: 'UNKNOWN', arn: 'UNKNOWN', error: err.message };
  }
};

/**
 * Proactively auto-detects the physical S3 bucket region via a HEAD request.
 * This automatically corrects any misconfigured AWS_REGION env var (e.g. eu-north-1 vs us-west-2).
 */
const detectBucketRegion = async (bucket) => {
  if (detectedBucketRegion) return detectedBucketRegion;
  try {
    const res = await fetch(`https://${bucket}.s3.amazonaws.com`, { method: 'HEAD' });
    const headerRegion = res.headers.get('x-amz-bucket-region');
    if (headerRegion) {
      console.log(`[S3] Auto-detected physical bucket region: ${headerRegion}`);
      detectedBucketRegion = headerRegion;
      return headerRegion;
    }
  } catch (err) {
    console.warn('[S3] Could not auto-detect bucket region via HEAD request:', err.message);
  }
  return null;
};

const getS3Config = (overrideRegion = null) => {
  const envRegion = cleanEnv(process.env.AWS_REGION);
  const accessKeyId = cleanEnv(process.env.AWS_ACCESS_KEY_ID);
  const secretAccessKey = cleanEnv(process.env.AWS_SECRET_ACCESS_KEY);
  const bucket = cleanEnv(process.env.AWS_S3_BUCKET);

  // Prefer overrideRegion > detected physical region > env region > default us-west-2
  const region = overrideRegion || detectedBucketRegion || envRegion || 'us-west-2';

  const hasAccessKey = !!accessKeyId;
  const hasSecretKey = !!secretAccessKey;

  // SAFE diagnostic log requested by user
  console.log(`S3 config: region=${region || 'MISSING'} (env: ${envRegion || 'NONE'}, detected: ${detectedBucketRegion || 'NONE'}) bucket=${bucket || 'MISSING'} accessKey=${hasAccessKey} secretKey=${hasSecretKey}`);

  // Validation
  if (!bucket) throw new Error('AWS S3 configuration failed: AWS_S3_BUCKET is missing.');
  if (!accessKeyId) throw new Error('AWS S3 configuration failed: AWS_ACCESS_KEY_ID is missing.');
  if (!secretAccessKey) throw new Error('AWS S3 configuration failed: AWS_SECRET_ACCESS_KEY is missing.');

  return { region, accessKeyId, secretAccessKey, bucket };
};

const getS3Client = async (overrideRegion = null) => {
  const bucket = cleanEnv(process.env.AWS_S3_BUCKET);
  if (bucket && !detectedBucketRegion && !overrideRegion) {
    await detectBucketRegion(bucket);
  }

  const { region, accessKeyId, secretAccessKey } = getS3Config(overrideRegion);

  if (!s3Client || currentClientRegion !== region) {
    currentClientRegion = region;
    s3Client = new S3Client({
      region,
      followRegionRedirects: true,
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
    });
  }

  return s3Client;
};

const getBucketName = () => {
  const { bucket } = getS3Config();
  return bucket;
};

/**
 * Executes an S3 operation with automatic PermanentRedirect retry
 */
const executeWithRegionRetry = async (operation) => {
  try {
    const client = await getS3Client();
    return await operation(client);
  } catch (err) {
    const redirectRegion = err.$response?.headers?.['x-amz-bucket-region'] || 
                          (err.name === 'PermanentRedirect' && err.Endpoint ? err.Endpoint.split('.')[1] : null) ||
                          (err.name === 'PermanentRedirect' ? 'us-west-2' : null);

    if (redirectRegion && redirectRegion !== currentClientRegion) {
      console.log(`[S3] PermanentRedirect caught. Retrying with region: ${redirectRegion}`);
      detectedBucketRegion = redirectRegion;
      const retryClient = await getS3Client(redirectRegion);
      return await operation(retryClient);
    }
    throw err;
  }
};

/**
 * Generates a safe and unique S3 object key.
 * Supports personal, team, or project scopes.
 */
const generateSafeKey = (projectId, folderId, originalName, context = {}) => {
  const uniqueId = crypto.randomUUID();
  const safeName = (originalName || 'file').replace(/[^a-zA-Z0-9.-]/g, '_');
  
  if (context.teamId || context.scope === 'TEAM') {
    const tId = context.teamId || 'shared';
    if (folderId && folderId !== 'null') {
      return `teams/${tId}/folders/${folderId}/${uniqueId}-${safeName}`;
    }
    return `teams/${tId}/files/${uniqueId}-${safeName}`;
  }

  if (projectId) {
    if (folderId && folderId !== 'null') {
      return `projects/${projectId}/folders/${folderId}/${uniqueId}-${safeName}`;
    }
    return `projects/${projectId}/files/${uniqueId}-${safeName}`;
  }

  const uId = context.userId || 'personal';
  if (folderId && folderId !== 'null') {
    return `users/${uId}/folders/${folderId}/${uniqueId}-${safeName}`;
  }
  return `users/${uId}/files/${uniqueId}-${safeName}`;
};

/**
 * Uploads a file buffer to S3 with safe structured diagnostic logging.
 */
const uploadFile = async (fileBuffer, mimeType, key) => {
  const bucket = getBucketName();
  const caller = await getCallerIdentitySafe();

  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    Body: fileBuffer,
    ContentType: mimeType,
  });

  try {
    const res = await executeWithRegionRetry((client) => client.send(command));
    console.log('[S3 UPLOAD SUCCESS]', {
      bucket,
      region: currentClientRegion,
      operation: 'PutObject',
      accountId: caller.account,
      iamArn: caller.arn,
      httpStatus: res?.$metadata?.httpStatusCode,
      requestId: res?.$metadata?.requestId,
      key
    });
    return key;
  } catch (err) {
    const diag = {
      bucket,
      region: currentClientRegion,
      operation: 'PutObject',
      accountId: caller.account,
      iamArn: caller.arn,
      errorCode: err.name || err.Code,
      errorMessage: err.message,
      httpStatus: err.$metadata?.httpStatusCode,
      requestId: err.$metadata?.requestId,
      extendedRequestId: err.$metadata?.extendedRequestId || err.$response?.headers?.['x-amz-id-2'],
      key
    };
    console.error('[S3 UPLOAD FAILURE]', diag);
    err.s3Diagnostic = diag;
    throw err;
  }
};

/**
 * Generates a short-lived download URL.
 */
const getDownloadUrl = async (key, expiresIn = 3600) => {
  const bucket = getBucketName();

  const command = new GetObjectCommand({
    Bucket: bucket,
    Key: key,
  });

  return await executeWithRegionRetry((client) => getSignedUrl(client, command, { expiresIn }));
};

/**
 * Deletes an object from S3.
 */
const deleteFile = async (key) => {
  const bucket = getBucketName();

  const command = new DeleteObjectCommand({
    Bucket: bucket,
    Key: key,
  });

  await executeWithRegionRetry((client) => client.send(command));
};

/**
 * Deprecated S3 diagnostic stub (IAM diagnostics removed in Pass 2A hardening).
 */
const diagnoseS3 = async () => {
  return {
    deprecated: true,
    message: 'AWS IAM and live operational diagnostic routines have been decommissioned.'
  };
};

// ============================================================================
// Google Drive Storage Driver & Provider Abstraction (Step 3 / Pass 4)
// ============================================================================

const {
  googleDriveDriver,
  getSystemStorageIntegration,
  getSystemStorageToken,
  guessMimeType,
  isGoogleWorkspaceDoc,
  getGoogleExportFormat
} = require('./googleDriveDriver');

const getPrimaryStorageProvider = () => {
  const provider = (process.env.PRIMARY_STORAGE_PROVIDER || 'google_drive').toLowerCase().trim();
  if (provider === 'google_drive' || provider === 'googledrive' || provider === 'drive' || provider === 'devhub_cloud') {
    return 'google_drive';
  }
  return 'google_drive';
};


/**
 * S3 Storage Driver
 */
const s3Driver = {
  upload: (buffer, mimeType, key) => (module.exports.uploadFile || uploadFile)(buffer, mimeType, key),
  getDownloadUrl: (key, expiresIn) => (module.exports.getDownloadUrl || getDownloadUrl)(key, expiresIn),
  deleteFile: (key) => (module.exports.deleteFile || deleteFile)(key)
};

const driveFolderService = require('./driveFolderService');
const storageQuotaService = require('./storageQuotaService');

module.exports = {
  getPrimaryStorageProvider,
  s3Driver,
  googleDriveDriver,
  uploadFile,
  getDownloadUrl,
  deleteFile,
  generateSafeKey,
  diagnoseS3,
  getCallerIdentitySafe,
  driveFolderService,
  ensureDriveRoot: driveFolderService.ensureDriveRoot,
  ensureDriveTeamFolder: driveFolderService.ensureDriveTeamFolder,
  ensureProjectDriveFolder: driveFolderService.ensureProjectDriveFolder,
  ensureDevhubDriveFolder: driveFolderService.ensureDevhubDriveFolder,
  storageQuotaService
};
