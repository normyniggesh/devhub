const express = require('express');
const router = express.Router();
const controller = require('../controllers/testRuns');
const authMiddleware = require('../middleware/auth');

router.use(authMiddleware);

router.get('/', controller.getTestRuns);
router.post('/', controller.createTestRun);
router.get('/:id', controller.getTestRunById);
router.patch('/:id', controller.updateTestRun);

module.exports = router;
