const express = require('express');
const router = express.Router();
const controller = require('../controllers/folders');
const authMiddleware = require('../middleware/auth');

router.use(authMiddleware);

router.get('/', controller.getFolders);
router.post('/', controller.createFolder);
router.get('/:id', controller.getFolderById);
router.patch('/:id', controller.updateFolder);
router.delete('/:id', controller.deleteFolder);

module.exports = router;
