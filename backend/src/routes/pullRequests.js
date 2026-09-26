const express = require('express');
const router = express.Router();
const controller = require('../controllers/pullRequests');
const authMiddleware = require('../middleware/auth');

router.use(authMiddleware);

router.get('/', controller.getPullRequests);
router.post('/', controller.createPullRequest);
router.get('/:id', controller.getPullRequestById);
router.patch('/:id', controller.updatePullRequest);
router.delete('/:id', controller.deletePullRequest);

module.exports = router;
