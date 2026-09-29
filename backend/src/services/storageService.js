const { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const crypto = require('crypto');
const path = require('path');

// Safe initialization that won't crash if env vars are missing
let s3Client = null;

const cleanEnv = (val) => val ? val.replace(/^['"]+|['"]+$/g, '').trim() : '';

const getS3Config = () => {
  const region = cleanEnv(process.env.AWS_REGION);
  const accessKeyId = cleanEnv(process.env.AWS_ACCESS_KEY_ID);
  const secretAccessKey = cleanEnv(process.env.AWS_SECRET_ACCESS_KEY);
  const bucket = cleanEnv(process.env.AWS_S3_BUCKET);

  const hasAccessKey = !!accessKeyId;
  const hasSecretKey = !!secretAccessKey;

  // SAFE diagnostic log requested by user
  console.log(`S3 config: region=${region || 'MISSING'} bucket=${bucket || 'MISSING'} accessKey=${hasAccessKey} secretKey=${hasSecretKey}`);

  // Validation
  if (!region) throw new Error('AWS S3 configuration failed: AWS_REGION is missing.');
  if (!bucket) throw new Error('AWS S3 configuration failed: AWS_S3_BUCKET is missing.');
  if (!accessKeyId) throw new Error('AWS S3 configuration failed: AWS_ACCESS_KEY_ID is missing.');
  if (!secretAccessKey) throw new Error('AWS S3 configuration failed: AWS_SECRET_ACCESS_KEY is missing.');

  return { region, accessKeyId, secretAccessKey, bucket };
};

const getS3Client = () => {
  if (s3Client) return s3Client;
  
  const { region, accessKeyId, secretAccessKey } = getS3Config();

  s3Client = new S3Client({
    region,
    credentials: {
      accessKeyId,
      secretAccessKey,
    },
  });

  return s3Client;
};

const getBucketName = () => {
  const { bucket } = getS3Config();
  return bucket;
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
  const client = getS3Client();
  const bucket = getBucketName();

  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    Body: fileBuffer,
    ContentType: mimeType,
  });

  await client.send(command);
  return key;
};

/**
 * Generates a short-lived download URL.
 */
const getDownloadUrl = async (key, expiresIn = 3600) => {
  const client = getS3Client();
  const bucket = getBucketName();

  const command = new GetObjectCommand({
    Bucket: bucket,
    Key: key,
  });

  // Generates a pre-signed URL valid for `expiresIn` seconds
  const url = await getSignedUrl(client, command, { expiresIn });
  return url;
};

/**
 * Deletes an object from S3.
 */
const deleteFile = async (key) => {
  const client = getS3Client();
  const bucket = getBucketName();

  const command = new DeleteObjectCommand({
    Bucket: bucket,
    Key: key,
  });

  await client.send(command);
};

module.exports = {
  uploadFile,
  getDownloadUrl,
  deleteFile,
  generateSafeKey
};
