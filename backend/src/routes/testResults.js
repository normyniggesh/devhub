const express = require('express');
const router = express.Router();
const controller = require('../controllers/testResults');
const authMiddleware = require('../middleware/auth');

router.use(authMiddleware);

router.get('/', controller.getTestResults);
router.post('/', controller.createTestResult);
router.get('/:id', controller.getTestResultById);
router.patch('/:id', controller.updateTestResult);

module.exports = router;
