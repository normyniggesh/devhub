require('dotenv').config();
const jwt = require('jsonwebtoken');
const app = require('./src/app');
const prisma = require('./src/db');
const storageService = require('./src/services/storageService');

async function runTestSuite() {
  console.log('=== STARTING DEVHUB FILE UPLOAD VERIFICATION SUITE ===\n');

  // Find a test project and its owner
  const project = await prisma.project.findFirst({
    include: { owner: true }
  });

  if (!project) throw new Error('No project found in database');
  const user = project.owner;
  console.log(`[PASS] Using Project: "${project.name}" (ID: ${project.id})`);
  console.log(`[PASS] Using User: "${user.name}" (ID: ${user.id})`);

  const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET || 'super-secret-devhub-auth-key');

  // Mock uploadFile, getDownloadUrl, deleteFile in storageService for unit execution against local DB
  const originalUpload = storageService.uploadFile;
  const originalDownload = storageService.getDownloadUrl;
  const originalDelete = storageService.deleteFile;

  let s3UploadedKeys = [];
  let s3DeletedKeys = [];

  storageService.uploadFile = async (buffer, mime, key) => {
    s3UploadedKeys.push(key);
    console.log(`   [S3-Mock] Stored ${buffer.length} bytes as ${mime} at key: ${key}`);
    return key;
  };

  storageService.getDownloadUrl = async (key) => {
    return `https://devhub-s3.s3.us-west-2.amazonaws.com/${key}?X-Amz-Credential=mock`;
  };

  storageService.deleteFile = async (key) => {
    s3DeletedKeys.push(key);
    console.log(`   [S3-Mock] Deleted key: ${key}`);
  };

  const server = app.listen(0);
  const port = server.address().port;
  const baseUrl = `http://localhost:${port}/api`;

  try {
    // -------------------------------------------------------------
    // TEST 1: Upload PNG file (e.g. Screenshot (251).png)
    // -------------------------------------------------------------
    console.log('\n--- 1. Testing PNG Upload (Screenshot (251).png) ---');
    const formPng = new FormData();
    formPng.append('projectId', project.id);
    const pngBlob = new Blob(['PNG_MOCK_BINARY_DATA'], { type: 'image/png' });
    formPng.append('files', pngBlob, 'Screenshot (251).png');

    const resPng = await fetch(`${baseUrl}/files/upload`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` },
      body: formPng
    });

    const dataPng = await resPng.json();
    console.log('PNG Upload Status:', resPng.status);
    if (resPng.status !== 201 || !dataPng.success || !dataPng.files || dataPng.files.length === 0) {
      throw new Error(`PNG upload failed: ${JSON.stringify(dataPng)}`);
    }
    const uploadedPng = dataPng.files[0];
    console.log(`[PASS] Uploaded PNG: id=${uploadedPng.id}, name="${uploadedPng.name}", size=${uploadedPng.size}, path=${uploadedPng.storagePath}`);

    // Verify in DB
    const dbPng = await prisma.file.findUnique({ where: { id: uploadedPng.id } });
    if (!dbPng || dbPng.projectId !== project.id || dbPng.name !== 'Screenshot (251).png') {
      throw new Error('PNG file record not found in PostgreSQL or project mismatch');
    }
    console.log(`[PASS] Verified PNG in PostgreSQL with correct projectId association.`);

    // -------------------------------------------------------------
    // TEST 2: Upload PDF file (e.g. Project_Report.pdf)
    // -------------------------------------------------------------
    console.log('\n--- 2. Testing PDF Upload (Project_Report.pdf) ---');
    const formPdf = new FormData();
    formPdf.append('projectId', project.id);
    const pdfBlob = new Blob(['%PDF-1.4 Mock PDF binary data'], { type: 'application/pdf' });
    formPdf.append('files', pdfBlob, 'Project_Report.pdf');

    const resPdf = await fetch(`${baseUrl}/files/upload`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` },
      body: formPdf
    });

    const dataPdf = await resPdf.json();
    console.log('PDF Upload Status:', resPdf.status);
    if (resPdf.status !== 201 || !dataPdf.success || !dataPdf.files || dataPdf.files.length === 0) {
      throw new Error(`PDF upload failed: ${JSON.stringify(dataPdf)}`);
    }
    const uploadedPdf = dataPdf.files[0];
    console.log(`[PASS] Uploaded PDF: id=${uploadedPdf.id}, name="${uploadedPdf.name}", size=${uploadedPdf.size}`);

    // Verify in DB
    const dbPdf = await prisma.file.findUnique({ where: { id: uploadedPdf.id } });
    if (!dbPdf || dbPdf.type !== 'application/pdf') {
      throw new Error('PDF file record not found in PostgreSQL');
    }
    console.log(`[PASS] Verified PDF in PostgreSQL.`);

    // -------------------------------------------------------------
    // TEST 3: Upload another file (e.g. data_export.csv) to /files root route
    // -------------------------------------------------------------
    console.log('\n--- 3. Testing Third File Upload to POST /files (data_export.csv) ---');
    const formCsv = new FormData();
    formCsv.append('projectId', project.id);
    const csvBlob = new Blob(['id,name,value\n1,Alpha,100\n2,Beta,200'], { type: 'text/csv' });
    formCsv.append('files', csvBlob, 'data_export.csv');

    // Call POST /files to verify root route also accepts multipart uploads
    const resCsv = await fetch(`${baseUrl}/files`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` },
      body: formCsv
    });

    const dataCsv = await resCsv.json();
    console.log('CSV Upload to /files Status:', resCsv.status);
    if (resCsv.status !== 201 || !dataCsv.success) {
      throw new Error(`CSV upload to /files failed: ${JSON.stringify(dataCsv)}`);
    }
    const uploadedCsv = dataCsv.files[0];
    console.log(`[PASS] Uploaded CSV via /files: id=${uploadedCsv.id}, name="${uploadedCsv.name}"`);

    // -------------------------------------------------------------
    // TEST 4: Verify Files appear in GET /api/files?projectId=...
    // -------------------------------------------------------------
    console.log('\n--- 4. Testing GET /api/files ---');
    const resList = await fetch(`${baseUrl}/files?projectId=${project.id}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const dataList = await resList.json();
    console.log('List Status:', resList.status, 'Total Files in Project:', dataList.files.length);
    const foundPng = dataList.files.some(f => f.id === uploadedPng.id);
    const foundPdf = dataList.files.some(f => f.id === uploadedPdf.id);
    const foundCsv = dataList.files.some(f => f.id === uploadedCsv.id);
    if (!foundPng || !foundPdf || !foundCsv) {
      throw new Error('Uploaded files missing from GET /api/files list');
    }
    console.log('[PASS] All uploaded files appear in DEVHUB files list.');

    // -------------------------------------------------------------
    // TEST 5: Verify Download Works (GET /api/files/:id/download)
    // -------------------------------------------------------------
    console.log('\n--- 5. Testing Download URL Generation ---');
    const resDownload = await fetch(`${baseUrl}/files/${uploadedPng.id}/download`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const dataDownload = await resDownload.json();
    console.log('Download Status:', resDownload.status);
    if (resDownload.status !== 200 || !dataDownload.success || !dataDownload.url) {
      throw new Error(`Download URL generation failed: ${JSON.stringify(dataDownload)}`);
    }
    if (!dataDownload.url.includes('us-west-2')) {
      throw new Error(`Download URL region mismatch: ${dataDownload.url}`);
    }
    console.log(`[PASS] Pre-signed download URL generated successfully: ${dataDownload.url}`);

    // -------------------------------------------------------------
    // TEST 6: Verify Delete Works (DELETE /api/files/:id)
    // -------------------------------------------------------------
    console.log('\n--- 6. Testing File Deletion ---');
    const resDelete = await fetch(`${baseUrl}/files/${uploadedPng.id}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const dataDelete = await resDelete.json();
    console.log('Delete Status:', resDelete.status);
    if (resDelete.status !== 200 || !dataDelete.success) {
      throw new Error(`File deletion failed: ${JSON.stringify(dataDelete)}`);
    }

    const checkDeleted = await prisma.file.findUnique({ where: { id: uploadedPng.id } });
    if (checkDeleted) throw new Error('File still exists in PostgreSQL after deletion');
    if (!s3DeletedKeys.includes(uploadedPng.storagePath)) {
      throw new Error('S3 deleteFile was not called during file deletion');
    }
    console.log('[PASS] File deleted from both PostgreSQL and S3.');

    // -------------------------------------------------------------
    // TEST 7: Verify Activity Log (AuditLog)
    // -------------------------------------------------------------
    console.log('\n--- 7. Testing Activity Log Audit ---');
    const auditLogs = await prisma.auditLog.findMany({
      where: {
        entityType: 'File',
        entityId: { in: [uploadedPng.id, uploadedPdf.id, uploadedCsv.id] }
      },
      orderBy: { createdAt: 'desc' }
    });

    console.log('Found Audit Logs:', auditLogs.length);
    for (const log of auditLogs) {
      console.log(`  - Action: ${log.action}, EntityId: ${log.entityId}, User: ${log.userId}`);
    }
    const uploadActions = auditLogs.filter(l => l.action === 'Uploaded');
    const deleteActions = auditLogs.filter(l => l.action === 'Deleted');
    if (uploadActions.length < 3 || deleteActions.length < 1) {
      throw new Error('Expected audit logs for Uploaded and Deleted actions not found');
    }
    console.log('[PASS] Activity logs generated correctly for Upload and Delete operations.');

    // Clean up remaining test files
    await prisma.file.deleteMany({ where: { id: { in: [uploadedPdf.id, uploadedCsv.id] } } });
    await prisma.auditLog.deleteMany({ where: { entityId: { in: [uploadedPng.id, uploadedPdf.id, uploadedCsv.id] } } });

    console.log('\n=== ALL TESTS PASSED SUCCESSFULLY! ===\n');
  } finally {
    storageService.uploadFile = originalUpload;
    storageService.getDownloadUrl = originalDownload;
    storageService.deleteFile = originalDelete;
    server.close();
    await prisma.$disconnect();
  }
}

runTestSuite().catch(err => {
  console.error('\n❌ TEST SUITE FAILED:', err);
  process.exit(1);
});
