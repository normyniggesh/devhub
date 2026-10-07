const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');
const adminMiddleware = require('../middleware/admin');
const adminController = require('../controllers/admin');

// All admin routes require authentication and Admin role
router.use(authMiddleware);
router.use(adminMiddleware);

// Admin Overview
router.get('/overview', adminController.getOverview);

// User Management
router.get('/users', adminController.getUsers);
router.post('/users', adminController.createUser);
router.patch('/users/:id/verify', adminController.verifyUser);
router.patch('/users/:id/role', adminController.updateUserRole);
router.patch('/users/:id/status', adminController.updateUserStatus);
router.delete('/users/:id', adminController.deleteUser);

// Project & Team Management
router.get('/projects', adminController.getProjects);
router.post('/projects/:id/members', adminController.addProjectMember);
router.delete('/projects/:id/members/:userId', adminController.removeProjectMember);
router.patch('/projects/:id/members/:userId', adminController.updateProjectMemberRole);

// Cloud Connections Monitoring
router.get('/cloud-connections', adminController.getCloudConnections);

// Storage Quota Allocations Management (New User/Team Foundation)
const quotaController = require('../controllers/adminQuotas');
router.get('/quotas', quotaController.listAllocations);
router.get('/quotas/user/:userId', quotaController.getUserQuota);
router.post('/quotas/user', quotaController.setUserQuota);
router.get('/quotas/team/:teamId', quotaController.getTeamQuota);
router.post('/quotas/team', quotaController.setTeamQuota);

// Admin Activity Feed
router.get('/activity', adminController.getActivity);

module.exports = router;
