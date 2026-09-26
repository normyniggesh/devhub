const express = require('express');
const router = express.Router();
const controller = require('../controllers/calendar');
const authMiddleware = require('../middleware/auth');

router.use(authMiddleware);

router.get('/events', controller.getEvents);
router.post('/events', controller.createEvent);
router.get('/events/:id', controller.getEventById);
router.patch('/events/:id', controller.updateEvent);
router.delete('/events/:id', controller.deleteEvent);

module.exports = router;
