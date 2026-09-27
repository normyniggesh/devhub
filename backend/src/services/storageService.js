const { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const crypto = require('crypto');
const path = require('path');

// Safe initialization that won't crash if env vars are missing
let s3Client = null;

const getS3Client = () => {
  if (s3Client) return s3Client;
  
  if (!process.env.AWS_REGION || !process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
    throw new Error('AWS S3 credentials are not configured.');
  }

  s3Client = new S3Client({
    region: process.env.AWS_REGION,
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    },
  });

  return s3Client;
};

const getBucketName = () => {
  const bucket = process.env.AWS_S3_BUCKET;
  if (!bucket) throw new Error('AWS_S3_BUCKET is not configured.');
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
