const express = require('express');
const router = express.Router();
const usersController = require('../controllers/users');
const authMiddleware = require('../middleware/auth');

router.use(authMiddleware);

router.get('/search', usersController.searchUsers);

module.exports = router;
