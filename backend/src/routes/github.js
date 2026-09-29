const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');
const {
  getStatus,
  connect,
  disconnect,
  getUserRepositories,
  importRepositories,
  syncRepository
} = require('../controllers/github');

router.use(authMiddleware);

router.get('/status', getStatus);
router.post('/connect', connect);
router.post('/disconnect', disconnect);
router.get('/user-repos', getUserRepositories);
router.post('/import', importRepositories);
router.post('/sync/:repoId', syncRepository);

module.exports = router;
