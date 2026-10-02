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

module.exports = {
  uploadFile,
  getDownloadUrl,
  deleteFile,
  generateSafeKey,
  diagnoseS3,
  getCallerIdentitySafe
};
