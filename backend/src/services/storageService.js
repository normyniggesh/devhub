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
const { IAMClient, ListAttachedUserPoliciesCommand, ListUserPoliciesCommand, GetUserPolicyCommand } = require('@aws-sdk/client-iam');
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
 */
const generateSafeKey = (projectId, folderId, originalName) => {
  const uniqueId = crypto.randomUUID();
  const safeName = originalName.replace(/[^a-zA-Z0-9.-]/g, '_');
  
  if (folderId && folderId !== 'null') {
    return `projects/${projectId}/folders/${folderId}/${uniqueId}-${safeName}`;
  }
  return `projects/${projectId}/files/${uniqueId}-${safeName}`;
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
 * Comprehensive diagnostic tool to inspect live S3 & IAM status, bucket owner, and test all AWS operations.
 */
const diagnoseS3 = async () => {
  const envRegion = cleanEnv(process.env.AWS_REGION);
  const bucket = cleanEnv(process.env.AWS_S3_BUCKET);
  const accessKeyId = cleanEnv(process.env.AWS_ACCESS_KEY_ID);
  const secret = cleanEnv(process.env.AWS_SECRET_ACCESS_KEY);

  const maskedKey = accessKeyId ? `${accessKeyId.slice(0, 4)}...${accessKeyId.slice(-4)}` : 'MISSING';
  const detectedRegion = await detectBucketRegion(bucket);
  const client = await getS3Client();

  const results = {
    config: {
      envRegion: envRegion || 'MISSING',
      detectedRegion: detectedRegion || 'FAILED',
      activeClientRegion: currentClientRegion,
      bucket: bucket || 'MISSING',
      accessKeyMasked: maskedKey,
      hasSecret: !!secret,
      secretLength: secret ? secret.length : 0
    },
    callerIdentity: {},
    operationsSuite: {},
    bucketSettings: {},
    iamInspection: {}
  };

  // Helper for safe command execution
  const executeSafe = async (fn) => {
    try {
      const res = await fn();
      return {
        success: true,
        statusCode: res?.$metadata?.httpStatusCode,
        requestId: res?.$metadata?.requestId,
        data: res
      };
    } catch (err) {
      return {
        success: false,
        errorName: err.name || err.Code,
        errorMessage: err.message,
        statusCode: err.$metadata?.httpStatusCode,
        requestId: err.$metadata?.requestId,
        extendedRequestId: err.$metadata?.extendedRequestId || err.$response?.headers?.['x-amz-id-2'],
        headers: err.$response?.headers
      };
    }
  };

  // 1. STS Caller Identity
  try {
    const stsClient = new STSClient({
      region: currentClientRegion || 'us-west-2',
      credentials: { accessKeyId, secretAccessKey: secret }
    });
    const callerId = await stsClient.send(new GetCallerIdentityCommand({}));
    results.callerIdentity = {
      success: true,
      arn: callerId.Arn,
      account: callerId.Account,
      userId: callerId.UserId
    };
  } catch (stsErr) {
    results.callerIdentity = {
      success: false,
      errorName: stsErr.name,
      errorMessage: stsErr.message
    };
  }

  // 2. REQUIRED REAL AWS OPERATIONS SUITE (Prompt Section 5)
  // Operation 1: HeadBucket
  results.operationsSuite.headBucket = await executeSafe(() =>
    client.send(new HeadBucketCommand({ Bucket: bucket }))
  );

  // Operation 2: GetBucketLocation
  results.operationsSuite.getBucketLocation = await executeSafe(async () => {
    const locRes = await client.send(new GetBucketLocationCommand({ Bucket: bucket }));
    return { locationConstraint: locRes.LocationConstraint || 'us-east-1 (default)' };
  });

  // Operation 3: PutObject to devhub-test/live-upload-test.txt
  const liveTestKey = 'devhub-test/live-upload-test.txt';
  const livePayload = Buffer.from('DEVHUB live test content generated at ' + new Date().toISOString());
  results.operationsSuite.putObject = await executeSafe(() =>
    client.send(new PutObjectCommand({
      Bucket: bucket,
      Key: liveTestKey,
      Body: livePayload,
      ContentType: 'text/plain'
    }))
  );

  // Operation 4: HeadObject on devhub-test/live-upload-test.txt
  results.operationsSuite.headObject = await executeSafe(() =>
    client.send(new HeadObjectCommand({
      Bucket: bucket,
      Key: liveTestKey
    }))
  );

  // Operation 5: GetObject on devhub-test/live-upload-test.txt
  results.operationsSuite.getObject = await executeSafe(() =>
    client.send(new GetObjectCommand({
      Bucket: bucket,
      Key: liveTestKey
    }))
  );

  // Operation 6: DeleteObject on devhub-test/live-upload-test.txt
  results.operationsSuite.deleteObject = await executeSafe(() =>
    client.send(new DeleteObjectCommand({
      Bucket: bucket,
      Key: liveTestKey
    }))
  );

  // 3. BUCKET OWNERSHIP & LIST BUCKETS INSPECTION (Prompt Section 4)
  results.bucketSettings.listBuckets = await executeSafe(async () => {
    const listRes = await client.send(new ListBucketsCommand({}));
    const bucketNames = (listRes.Buckets || []).map(b => b.Name);
    const ownsTargetBucket = bucketNames.includes(bucket);
    return {
      owner: listRes.Owner,
      totalBuckets: bucketNames.length,
      bucketNames,
      ownsTargetBucket
    };
  });

  if (results.callerIdentity?.account) {
    results.bucketSettings.headBucketExpectedOwner = await executeSafe(() =>
      client.send(new HeadBucketCommand({
        Bucket: bucket,
        ExpectedBucketOwner: results.callerIdentity.account
      }))
    );
  }

  // 4. ENCRYPTION CHECKS (Prompt Section 7)
  results.bucketSettings.getBucketEncryption = await executeSafe(() =>
    client.send(new GetBucketEncryptionCommand({ Bucket: bucket }))
  );

  // Test PutObject with SSE-S3 (AES256)
  const sseTestKey = 'devhub-test/live-upload-sse-test.txt';
  results.operationsSuite.putObjectWithSseS3 = await executeSafe(() =>
    client.send(new PutObjectCommand({
      Bucket: bucket,
      Key: sseTestKey,
      Body: livePayload,
      ContentType: 'text/plain',
      ServerSideEncryption: 'AES256'
    }))
  );
  if (results.operationsSuite.putObjectWithSseS3.success) {
    await executeSafe(() => client.send(new DeleteObjectCommand({ Bucket: bucket, Key: sseTestKey })));
  }

  // 5. OBJECT OWNERSHIP & ACL CHECKS (Prompt Section 8)
  results.bucketSettings.getBucketAcl = await executeSafe(() =>
    client.send(new GetBucketAclCommand({ Bucket: bucket }))
  );
  results.bucketSettings.getOwnershipControls = await executeSafe(() =>
    client.send(new GetBucketOwnershipControlsCommand({ Bucket: bucket }))
  );
  results.bucketSettings.getPublicAccessBlock = await executeSafe(() =>
    client.send(new GetPublicAccessBlockCommand({ Bucket: bucket }))
  );

  // Test PutObject with bucket-owner-full-control ACL
  const aclTestKey = 'devhub-test/live-upload-acl-test.txt';
  results.operationsSuite.putObjectWithAcl = await executeSafe(() =>
    client.send(new PutObjectCommand({
      Bucket: bucket,
      Key: aclTestKey,
      Body: livePayload,
      ContentType: 'text/plain',
      ACL: 'bucket-owner-full-control'
    }))
  );
  if (results.operationsSuite.putObjectWithAcl.success) {
    await executeSafe(() => client.send(new DeleteObjectCommand({ Bucket: bucket, Key: aclTestKey })));
  }

  // 6. BUCKET POLICY INSPECTION (Prompt Section 6)
  results.bucketSettings.getBucketPolicy = await executeSafe(async () => {
    const polRes = await client.send(new GetBucketPolicyCommand({ Bucket: bucket }));
    return { policy: polRes.Policy ? JSON.parse(polRes.Policy) : null };
  });

  // 7. IAM POLICY INSPECTION (Prompt Section 6)
  if (results.callerIdentity?.arn && results.callerIdentity.arn.includes(':user/')) {
    const userName = results.callerIdentity.arn.split('/').pop();
    try {
      const iamClient = new IAMClient({
        region: 'us-east-1', // IAM is global, default endpoint us-east-1
        credentials: { accessKeyId, secretAccessKey: secret }
      });
      const attached = await iamClient.send(new ListAttachedUserPoliciesCommand({ UserName: userName }));
      const inline = await iamClient.send(new ListUserPoliciesCommand({ UserName: userName }));
      results.iamInspection = {
        userName,
        attachedPolicies: attached.AttachedPolicies || [],
        inlinePolicyNames: inline.PolicyNames || []
      };
    } catch (iamErr) {
      results.iamInspection = {
        userName,
        errorName: iamErr.name || iamErr.Code,
        errorMessage: iamErr.message
      };
    }
  }

  results.tests = results.operationsSuite;
  return results;
};

// ============================================================================
// Google Drive Storage Driver & Provider Abstraction (Step 3)
// ============================================================================

const getPrimaryStorageProvider = () => {
  const provider = (process.env.PRIMARY_STORAGE_PROVIDER || 's3').toLowerCase().trim();
  if (provider === 'google_drive' || provider === 'googledrive' || provider === 'drive') {
    return 'google_drive';
  }
  return 's3';
};

function guessMimeType(fileName, defaultMime = 'application/octet-stream') {
  if (!fileName) return defaultMime;
  const ext = fileName.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'pdf': return 'application/pdf';
    case 'png': return 'image/png';
    case 'jpg':
    case 'jpeg': return 'image/jpeg';
    case 'gif': return 'image/gif';
    case 'svg': return 'image/svg+xml';
    case 'doc':
    case 'docx': return 'application/msword';
    case 'xls':
    case 'xlsx': return 'application/vnd.ms-excel';
    case 'ppt':
    case 'pptx': return 'application/vnd.ms-powerpoint';
    case 'zip': return 'application/zip';
    case 'txt': return 'text/plain';
    case 'csv': return 'text/csv';
    case 'json': return 'application/json';
    default: return defaultMime;
  }
}

function isGoogleWorkspaceDoc(mimeType) {
  return mimeType && mimeType.startsWith('application/vnd.google-apps.') && mimeType !== 'application/vnd.google-apps.folder';
}

function getGoogleExportFormat(mimeType) {
  switch (mimeType) {
    case 'application/vnd.google-apps.document':
      return { exportMime: 'application/pdf', ext: '.pdf' };
    case 'application/vnd.google-apps.spreadsheet':
      return { exportMime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', ext: '.xlsx' };
    case 'application/vnd.google-apps.presentation':
      return { exportMime: 'application/pdf', ext: '.pdf' };
    default:
      return { exportMime: 'application/pdf', ext: '.pdf' };
  }
}

/**
 * Retrieves the designated System Storage Google Drive user integration record.
 */
async function getSystemStorageIntegration() {
  const allIntegrations = await prisma.userIntegration.findMany({
    where: { provider: 'google_drive', status: 'connected' }
  });
  const sys = allIntegrations.find(i => i.metadata && i.metadata.isSystemStorage === true);
  if (!sys) {
    throw new Error('Google Drive system storage is not configured or not connected.');
  }
  return sys;
}

/**
 * Retrieves or refreshes the access token for the System Storage Google Drive account.
 */
async function getSystemStorageToken() {
  const sys = await getSystemStorageIntegration();
  const metadata = sys.metadata || {};
  const isExpired = metadata.expiresAt && Date.now() > (metadata.expiresAt - 60000);

  if (isExpired && metadata.refreshToken && process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
    try {
      console.log('[StorageService:GoogleDrive] Refreshing expired system storage token...');
      const refreshRes = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: process.env.GOOGLE_CLIENT_ID,
          client_secret: process.env.GOOGLE_CLIENT_SECRET,
          refresh_token: metadata.refreshToken,
          grant_type: 'refresh_token'
        })
      });

      if (refreshRes.ok) {
        const newTokens = await refreshRes.json();
        const updated = await prisma.userIntegration.update({
          where: { id: sys.id },
          data: {
            accessToken: newTokens.access_token,
            metadata: {
              ...metadata,
              expiresAt: Date.now() + (newTokens.expires_in || 3600) * 1000
            },
            updatedAt: new Date()
          }
        });
        return updated.accessToken;
      } else {
        const errText = await refreshRes.text();
        console.error('[StorageService:GoogleDrive] Refresh failed:', errText);
        throw new Error('Failed to refresh Google Drive system storage access token.');
      }
    } catch (refreshErr) {
      console.error('[StorageService:GoogleDrive] Refresh error:', refreshErr.message);
      throw new Error('Failed to refresh Google Drive system storage access token: ' + refreshErr.message);
    }
  }

  if (!sys.accessToken) {
    throw new Error('Google Drive system storage has no active access token.');
  }

  return sys.accessToken;
}

/**
 * Google Drive Storage Driver
 */
const googleDriveDriver = {
  async getAccessToken() {
    return await getSystemStorageToken();
  },

  async upload(buffer, mimeType, filename, driveFolderId) {
    if (!driveFolderId) {
      throw new Error('Google Drive target folder is not configured yet.');
    }
    if (!buffer || buffer.length === 0) {
      throw new Error('Upload buffer is empty.');
    }

    const token = await this.getAccessToken();
    const effectiveMime = mimeType || guessMimeType(filename) || 'application/octet-stream';
    const effectiveName = filename || 'unnamed_file';

    const boundary = `-------314159265358979323846`;
    const delimiter = `\r\n--${boundary}\r\n`;
    const closeDelimiter = `\r\n--${boundary}--`;

    const metadata = {
      name: effectiveName,
      mimeType: effectiveMime,
      parents: [driveFolderId]
    };

    const fileBuf = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
    const multipartBody = Buffer.concat([
      Buffer.from(
        delimiter +
        'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
        JSON.stringify(metadata) +
        delimiter +
        `Content-Type: ${effectiveMime}\r\n\r\n`
      ),
      fileBuf,
      Buffer.from(closeDelimiter)
    ]);

    const res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,size,mimeType', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': `multipart/related; boundary=${boundary}`,
        'Content-Length': String(multipartBody.length)
      },
      body: multipartBody
    });

    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      const errMsg = errBody.error?.message || `HTTP ${res.status}`;
      if (res.status === 401) {
        throw new Error('Google Drive authentication expired or unauthorized.');
      }
      if (res.status === 403) {
        throw new Error(`Google Drive permission denied or quota exceeded: ${errMsg}`);
      }
      if (res.status === 404) {
        throw new Error(`Google Drive folder not found: ${driveFolderId}`);
      }
      throw new Error(`Google Drive upload failed (${res.status}): ${errMsg}`);
    }

    const data = await res.json();
    return {
      driveFileId: data.id,
      name: data.name || effectiveName,
      size: BigInt(data.size || fileBuf.length),
      mimeType: data.mimeType || effectiveMime
    };
  },

  async downloadStream(driveFileId) {
    if (!driveFileId) {
      throw new Error('Google Drive file ID is required for download.');
    }

    const token = await this.getAccessToken();

    const metaRes = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(driveFileId)}?fields=id,name,mimeType,size`, {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (!metaRes.ok) {
      const errBody = await metaRes.json().catch(() => ({}));
      const errMsg = errBody.error?.message || `HTTP ${metaRes.status}`;
      if (metaRes.status === 404) throw new Error('Google Drive file not found.');
      if (metaRes.status === 401) throw new Error('Google Drive authentication expired or unauthorized.');
      if (metaRes.status === 403) throw new Error(`Google Drive download access denied: ${errMsg}`);
      throw new Error(`Google Drive metadata fetch failed (${metaRes.status}): ${errMsg}`);
    }

    const meta = await metaRes.json();
    let downloadUrl = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(driveFileId)}?alt=media`;
    let effectiveMime = meta.mimeType || 'application/octet-stream';
    let effectiveName = meta.name || 'download';

    if (isGoogleWorkspaceDoc(meta.mimeType)) {
      const exportFormat = getGoogleExportFormat(meta.mimeType);
      downloadUrl = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(driveFileId)}/export?mimeType=${encodeURIComponent(exportFormat.exportMime)}`;
      effectiveMime = exportFormat.exportMime;
      if (!effectiveName.endsWith(exportFormat.ext)) {
        effectiveName += exportFormat.ext;
      }
    }

    const dlRes = await fetch(downloadUrl, {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (!dlRes.ok) {
      const errBody = await dlRes.json().catch(() => ({}));
      const errMsg = errBody.error?.message || `HTTP ${dlRes.status}`;
      if (dlRes.status === 404) throw new Error('Google Drive file not found.');
      if (dlRes.status === 401) throw new Error('Google Drive authentication expired or unauthorized.');
      if (dlRes.status === 403) throw new Error(`Google Drive download access denied: ${errMsg}`);
      throw new Error(`Google Drive download failed (${dlRes.status}): ${errMsg}`);
    }

    const nodeStream = dlRes.body && typeof dlRes.body.pipe === 'function'
      ? dlRes.body
      : Readable.fromWeb(dlRes.body);

    return {
      stream: nodeStream,
      mimeType: effectiveMime,
      name: effectiveName,
      size: meta.size ? parseInt(meta.size, 10) : undefined
    };
  },

  async deleteFile(driveFileId) {
    if (!driveFileId) {
      throw new Error('Google Drive file ID is required for deletion.');
    }

    const token = await this.getAccessToken();

    const res = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(driveFileId)}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` }
    });

    if (!res.ok && res.status !== 404) {
      const errBody = await res.json().catch(() => ({}));
      const errMsg = errBody.error?.message || `HTTP ${res.status}`;
      if (res.status === 401) throw new Error('Google Drive authentication expired or unauthorized.');
      if (res.status === 403) throw new Error(`Google Drive permission denied: ${errMsg}`);
      throw new Error(`Google Drive delete failed (${res.status}): ${errMsg}`);
    }

    return true;
  }
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
