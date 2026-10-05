const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');
const {
  getTeamData,
  getMemberDetails,
  addTeamMember,
  updateMemberRole,
  removeTeamMember,
  getMyTeams,
  createTeam,
  getTeamEntity
} = require('../controllers/team');

router.use(authMiddleware);

// Real Team Entity routes (New Foundation)
router.get('/list', getMyTeams);
router.post('/create', createTeam);
router.get('/entity/:id', getTeamEntity);

// Legacy/Aggregated team data routes
router.get('/', getTeamData);
router.get('/:userId', getMemberDetails);
router.post('/add', addTeamMember);
router.patch('/:userId/role', updateMemberRole);
router.delete('/:userId/projects/:projectId', removeTeamMember);

module.exports = router;
