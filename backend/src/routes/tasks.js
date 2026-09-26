const express = require('express');
const router = express.Router();
const tasksController = require('../controllers/tasks');
const authMiddleware = require('../middleware/auth');

router.use(authMiddleware);

router.get('/', tasksController.getTasks);
router.post('/', tasksController.createTask);
router.get('/:id', tasksController.getTaskById);
router.patch('/:id', tasksController.updateTask);
router.delete('/:id', tasksController.deleteTask);

module.exports = router;
