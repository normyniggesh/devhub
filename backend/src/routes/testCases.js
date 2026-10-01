const express = require('express');
const router = express.Router();
const controller = require('../controllers/testCases');
const authMiddleware = require('../middleware/auth');

router.use(authMiddleware);

router.get('/', controller.getTestCases);
router.post('/', controller.createTestCase);
router.get('/:id', controller.getTestCaseById);
router.patch('/:id', controller.updateTestCase);
router.post('/:id/run', controller.runTestCase);
router.delete('/:id', controller.deleteTestCase);

module.exports = router;
