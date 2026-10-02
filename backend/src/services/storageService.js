const { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
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

module.exports = {
  uploadFile,
  getDownloadUrl,
  deleteFile,
  generateSafeKey
};

