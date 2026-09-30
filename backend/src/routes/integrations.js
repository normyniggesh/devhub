const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');
const {
  getUserIntegrations,
  connectIntegration,
  disconnectIntegration,
  listProviderFiles,
  importProviderFile
} = require('../controllers/integrations');

router.use(authMiddleware);

router.get('/', getUserIntegrations);
router.post('/connect', connectIntegration);
router.post('/disconnect', disconnectIntegration);
router.get('/:provider/files', listProviderFiles);
router.post('/:provider/import', importProviderFile);

module.exports = router;
