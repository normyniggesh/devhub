const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');
const {
  getUserIntegrations,
  getGoogleAuthUrl,
  handleGoogleCallback,
  connectIntegration,
  disconnectIntegration,
  listProviderFiles,
  downloadProviderFile,
  importProviderFile,
  getProviderQuota
} = require('../controllers/integrations');

router.use(authMiddleware);

router.get('/', getUserIntegrations);
router.get('/quota', getProviderQuota);
router.get('/google/auth-url', getGoogleAuthUrl);
router.post('/google/callback', handleGoogleCallback);
router.post('/connect', connectIntegration);
router.post('/disconnect', disconnectIntegration);
router.get('/:provider/quota', getProviderQuota);
router.get('/:provider/files', listProviderFiles);
router.get('/:provider/download/:fileId', downloadProviderFile);
router.post('/:provider/import', importProviderFile);

module.exports = router;
