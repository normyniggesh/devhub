const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');
const { globalSearch } = require('../controllers/search');

router.use(authMiddleware);

router.get('/', globalSearch);

module.exports = router;
