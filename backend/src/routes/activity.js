const express = require('express');
const router = express.Router();
const controller = require('../controllers/activity');
const authMiddleware = require('../middleware/auth');

router.use(authMiddleware);

router.get('/', controller.getActivity);

module.exports = router;
