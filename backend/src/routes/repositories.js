const express = require('express');
const router = express.Router();
const controller = require('../controllers/repositories');
const authMiddleware = require('../middleware/auth');

router.use(authMiddleware);

router.get('/', controller.getRepositories);
router.post('/', controller.createRepository);
router.get('/:id', controller.getRepositoryById);
router.patch('/:id', controller.updateRepository);
router.delete('/:id', controller.deleteRepository);

module.exports = router;
