const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');
const {
  getUserIntegrations,
  connectIntegration,
  disconnectIntegration
} = require('../controllers/integrations');

router.use(authMiddleware);

router.get('/', getUserIntegrations);
router.post('/connect', connectIntegration);
router.post('/disconnect', disconnectIntegration);

module.exports = router;
