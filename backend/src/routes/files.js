const express = require('express');
const router = express.Router();
const controller = require('../controllers/files');
const authMiddleware = require('../middleware/auth');

router.use(authMiddleware);

router.get('/', controller.getFiles);
router.post('/', controller.createFile);
router.get('/:id', controller.getFileById);
router.patch('/:id', controller.updateFile);
router.delete('/:id', controller.deleteFile);

module.exports = router;
