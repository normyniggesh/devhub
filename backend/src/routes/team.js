const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');
const {
  getTeamData,
  getMemberDetails,
  addTeamMember,
  updateMemberRole,
  removeTeamMember
} = require('../controllers/team');

router.use(authMiddleware);

router.get('/', getTeamData);
router.get('/:userId', getMemberDetails);
router.post('/add', addTeamMember);
router.patch('/:userId/role', updateMemberRole);
router.delete('/:userId/projects/:projectId', removeTeamMember);

module.exports = router;
