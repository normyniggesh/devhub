const express = require('express');
const router = express.Router();
const controller = require('../controllers/qa');
const authMiddleware = require('../middleware/auth');

router.use(authMiddleware);

router.get('/summary', controller.getSummary);

module.exports = router;
