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
router.post('/:id/result', controller.runTestCase);
router.post('/:id/claim', controller.claimTestCase);
router.post('/:id/take', controller.claimTestCase);
router.post('/:id/release', controller.releaseTestCase);
router.post('/:id/unclaim', controller.releaseTestCase);
router.delete('/:id', controller.deleteTestCase);

module.exports = router;
