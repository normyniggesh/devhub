const { 
  S3Client, 
  PutObjectCommand, 
  DeleteObjectCommand, 
  GetObjectCommand,
  HeadBucketCommand,
  GetBucketLocationCommand,
  ListObjectsV2Command
} = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const crypto = require('crypto');
const path = require('path');

// Safe initialization that won't crash if env vars are missing
let s3Client = null;
let currentClientRegion = null;
let detectedBucketRegion = null;

const cleanEnv = (val) => val ? val.replace(/^['"]+|['"]+$/g, '').trim() : '';

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
  // Sanitize filename to remove weird characters and prevent traversal
  const safeName = originalName.replace(/[^a-zA-Z0-9.-]/g, '_');
  
  if (folderId && folderId !== 'null') {
    return `projects/${projectId}/folders/${folderId}/${uniqueId}-${safeName}`;
  }
  return `projects/${projectId}/files/${uniqueId}-${safeName}`;
};

/**
 * Uploads a file buffer to S3.
 */
const uploadFile = async (fileBuffer, mimeType, key) => {
  const bucket = getBucketName();

  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    Body: fileBuffer,
    ContentType: mimeType,
  });

  await executeWithRegionRetry((client) => client.send(command));
  return key;
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

  // Generates a pre-signed URL valid for `expiresIn` seconds
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
 * Diagnostic tool to inspect S3 permissions, bucket status, and configuration live.
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
    tests: {}
  };

  // 0. STS Caller Identity (identifies IAM user ARN and Account ID)
  try {
    const { STSClient, GetCallerIdentityCommand } = require('@aws-sdk/client-sts');
    const stsClient = new STSClient({
      region: currentClientRegion || 'us-west-2',
      credentials: {
        accessKeyId,
        secretAccessKey: secret,
      }
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

  // 1. HeadBucket (tests s3:ListBucket / bucket existence)
  try {
    const headRes = await client.send(new HeadBucketCommand({ Bucket: bucket }));
    results.tests.headBucket = { success: true, status: headRes.$metadata.httpStatusCode };
  } catch (err) {
    results.tests.headBucket = {
      success: false,
      errorName: err.name,
      errorMessage: err.message,
      statusCode: err.$metadata?.httpStatusCode,
      requestId: err.$metadata?.requestId,
      regionHeader: err.$response?.headers?.['x-amz-bucket-region']
    };
  }

  // 2. GetBucketLocation
  try {
    const locRes = await client.send(new GetBucketLocationCommand({ Bucket: bucket }));
    results.tests.getBucketLocation = { success: true, locationConstraint: locRes.LocationConstraint || 'us-east-1 (default)' };
  } catch (err) {
    results.tests.getBucketLocation = {
      success: false,
      errorName: err.name,
      errorMessage: err.message,
      statusCode: err.$metadata?.httpStatusCode
    };
  }

  // 3. ListObjects (tests s3:ListBucket on arn:aws:s3:::devhub-s3)
  try {
    const listRes = await client.send(new ListObjectsV2Command({ Bucket: bucket, MaxKeys: 5 }));
    results.tests.listObjects = {
      success: true,
      keyCount: listRes.KeyCount,
      sampleKeys: (listRes.Contents || []).map(c => c.Key)
    };
  } catch (err) {
    results.tests.listObjects = {
      success: false,
      errorName: err.name,
      errorMessage: err.message,
      statusCode: err.$metadata?.httpStatusCode,
      requestId: err.$metadata?.requestId
    };
  }

  // 4. PutObject (tests s3:PutObject on arn:aws:s3:::devhub-s3/*)
  const testKey = `diagnostics/health-check-${Date.now()}.txt`;
  try {
    const putRes = await client.send(new PutObjectCommand({
      Bucket: bucket,
      Key: testKey,
      Body: Buffer.from('DEVHUB S3 diagnostic health check test payload'),
      ContentType: 'text/plain'
    }));
    results.tests.putObject = { success: true, key: testKey, status: putRes.$metadata.httpStatusCode };

    // 5. GetObject (tests s3:GetObject on arn:aws:s3:::devhub-s3/*)
    try {
      const getRes = await client.send(new GetObjectCommand({ Bucket: bucket, Key: testKey }));
      results.tests.getObject = { success: true, status: getRes.$metadata.httpStatusCode };
    } catch (getErr) {
      results.tests.getObject = {
        success: false,
        errorName: getErr.name,
        errorMessage: getErr.message,
        statusCode: getErr.$metadata?.httpStatusCode
      };
    }

    // 6. DeleteObject (tests s3:DeleteObject on arn:aws:s3:::devhub-s3/*)
    try {
      const delRes = await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: testKey }));
      results.tests.deleteObject = { success: true, status: delRes.$metadata.httpStatusCode };
    } catch (delErr) {
      results.tests.deleteObject = {
        success: false,
        errorName: delErr.name,
        errorMessage: delErr.message,
        statusCode: delErr.$metadata?.httpStatusCode
      };
    }
  } catch (putErr) {
    results.tests.putObject = {
      success: false,
      key: testKey,
      errorName: putErr.name,
      errorMessage: putErr.message,
      statusCode: putErr.$metadata?.httpStatusCode,
      requestId: putErr.$metadata?.requestId,
      extendedRequestId: putErr.$metadata?.extendedRequestId || putErr.$response?.headers?.['x-amz-id-2'],
      headers: putErr.$response?.headers
    };
  }

  return results;
};

module.exports = {
  uploadFile,
  getDownloadUrl,
  deleteFile,
  generateSafeKey,
  diagnoseS3
};

