const express = require('express');
const router = express.Router();
const projectsController = require('../controllers/projects');
const authMiddleware = require('../middleware/auth');

router.use(authMiddleware);

router.get('/', projectsController.getProjects);
router.post('/', projectsController.createProject);
router.get('/:id', projectsController.getProjectById);
router.patch('/:id', projectsController.updateProject);
router.delete('/:id', projectsController.deleteProject);

// Project Members
router.post('/:id/members', projectsController.addProjectMember);
router.delete('/:id/members/:userId', projectsController.removeProjectMember);

module.exports = router;
