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

router.use(authMiddleware);

router.get('/', controller.getFiles);
router.post('/upload', upload.array('files', 10), controller.uploadFiles);
router.post('/', controller.createFile); // Keep for backward compatibility/metadata
router.get('/:id', controller.getFileById);
router.get('/:id/download', controller.downloadFile);
router.patch('/:id', controller.updateFile);
router.delete('/:id', controller.deleteFile);

module.exports = router;
