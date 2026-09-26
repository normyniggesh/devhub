const express = require('express');
const router = express.Router();
const controller = require('../controllers/dashboard');
const authMiddleware = require('../middleware/auth');

router.use(authMiddleware);

router.get('/dashboard', controller.getDashboard);
router.get('/my-day', controller.getMyDay);

module.exports = router;
