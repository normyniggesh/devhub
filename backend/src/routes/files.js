const express = require('express');
const router = express.Router();
const controller = require('../controllers/files');
const authMiddleware = require('../middleware/auth');
const multer = require('multer');

const maxFileSizeMB = process.env.MAX_FILE_SIZE_MB || 50;
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: maxFileSizeMB * 1024 * 1024 }
});

const sharesController = require('../controllers/shares');

router.use(authMiddleware);

router.get('/', controller.getFiles);
// Support file uploads on /upload and / routes
router.post('/upload', upload.array('files', 10), controller.uploadFiles);
router.post('/', upload.array('files', 10), (req, res, next) => {
  // If multipart files are present in the request, route directly to uploadFiles
  if (req.files && req.files.length > 0) {
    return controller.uploadFiles(req, res, next);
  }
  // Otherwise, handle as JSON file metadata creation
  return controller.createFile(req, res, next);
});
router.get('/:id', controller.getFileById);
router.get('/:id/download', controller.downloadFile);
router.patch('/:id', controller.updateFile);
router.delete('/:id', controller.deleteFile);

// Personal File Sharing
router.post('/:id/share', sharesController.shareFile);
router.get('/:id/shares', sharesController.listFileShares);
router.delete('/:id/shares/:userId', sharesController.revokeFileShare);

module.exports = router;
