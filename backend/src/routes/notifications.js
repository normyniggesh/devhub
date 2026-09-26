const express = require('express');
const router = express.Router();
const controller = require('../controllers/notifications');
const authMiddleware = require('../middleware/auth');

router.use(authMiddleware);

router.post('/read-all', controller.markAllAsRead);

router.get('/', controller.getNotifications);
router.get('/:id', controller.getNotificationById);
router.patch('/:id', controller.updateNotification);
router.post('/:id/read', controller.markAsRead);
router.delete('/:id', controller.deleteNotification);

module.exports = router;
