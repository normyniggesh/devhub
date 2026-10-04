const express = require('express');
const router = express.Router();
const controller = require('../controllers/dashboard');
const authMiddleware = require('../middleware/auth');

router.get('/dashboard', authMiddleware, controller.getDashboard);
router.get('/my-day', authMiddleware, controller.getMyDay);

module.exports = router;
