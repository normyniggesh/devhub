const express = require('express');
const router = express.Router();
const controller = require('../controllers/bugs');
const authMiddleware = require('../middleware/auth');

router.use(authMiddleware);

router.get('/', controller.getBugs);
router.post('/', controller.createBug);
router.get('/:id', controller.getBugById);
router.patch('/:id', controller.updateBug);
router.delete('/:id', controller.deleteBug);

module.exports = router;
