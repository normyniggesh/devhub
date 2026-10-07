const express = require('express');
const router = express.Router();
const controller = require('../controllers/folders');
const sharesController = require('../controllers/shares');
const authMiddleware = require('../middleware/auth');

router.use(authMiddleware);

router.get('/', controller.getFolders);
router.post('/', controller.createFolder);
router.get('/:id', controller.getFolderById);
router.patch('/:id', controller.updateFolder);
router.delete('/:id', controller.deleteFolder);

// Personal Folder Sharing
router.post('/:id/share', sharesController.shareFolder);
router.get('/:id/shares', sharesController.listFolderShares);
router.delete('/:id/shares/:userId', sharesController.revokeFolderShare);

module.exports = router;
