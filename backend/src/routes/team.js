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
  getTeamEntity,
  deleteTeam
} = require('../controllers/team');

router.use(authMiddleware);

// Real Team Entity routes (New Foundation)
router.get('/list', getMyTeams);
router.post('/create', createTeam);
router.get('/entity/:id', getTeamEntity);
router.delete('/entity/:id', deleteTeam);

// Legacy/Aggregated team data routes
router.get('/', getTeamData);
router.get('/:userId', getMemberDetails);
router.post('/add', addTeamMember);
router.patch('/:userId/role', updateMemberRole);
router.delete('/:userId/teams/:teamId', removeTeamMember);
router.delete('/:userId/projects/:projectId', removeTeamMember);

module.exports = router;
