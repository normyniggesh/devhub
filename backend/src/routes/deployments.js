const express = require('express');
const router = express.Router();
const controller = require('../controllers/deployments');
const authMiddleware = require('../middleware/auth');

router.use(authMiddleware);

router.get('/', controller.getDeployments);
router.post('/', controller.createDeployment);
router.get('/:id', controller.getDeploymentById);
router.patch('/:id', controller.updateDeployment);
router.delete('/:id', controller.deleteDeployment);

module.exports = router;
