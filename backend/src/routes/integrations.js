const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');
const multer = require('multer');
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }
});

const {
  getUserIntegrations,
  getGoogleAuthUrl,
  handleGoogleCallback,
  connectIntegration,
  disconnectIntegration,
  listProviderFiles,
  downloadProviderFile,
  importProviderFile,
  createGoogleDriveFolder,
  uploadGoogleDriveFile,
  deleteGoogleDriveFile,
  moveGoogleDriveFile,
  exportToGoogleDrive
} = require('../controllers/integrations');

router.use(authMiddleware);

router.get('/', getUserIntegrations);
router.get('/google/auth-url', getGoogleAuthUrl);
router.post('/google/callback', handleGoogleCallback);
router.post('/connect', connectIntegration);
router.post('/disconnect', disconnectIntegration);

// Google Drive write operations
router.post('/google_drive/folders', createGoogleDriveFolder);
router.post('/google_drive/upload', upload.single('file'), uploadGoogleDriveFile);
router.delete('/google_drive/files/:fileId', deleteGoogleDriveFile);
router.post('/google_drive/move', moveGoogleDriveFile);
router.post('/google_drive/export', exportToGoogleDrive);

router.get('/:provider/files', listProviderFiles);
router.get('/:provider/download/:fileId', downloadProviderFile);
router.post('/:provider/import', importProviderFile);

module.exports = router;
