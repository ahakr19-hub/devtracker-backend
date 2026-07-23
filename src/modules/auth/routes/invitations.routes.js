const express = require('express');
const {
  sendInvite,
  getAdminProjects,
  getMyInvitations,
  respondToInvitation,
  getTeamMembers,
  removeTeamMember,
  terminateMember,
  updateMemberPermission,
  assignProjectsToMember,
} = require('../controllers/teamscontrollers/teams');
const { protect }    = require('../../../middlewares/auth.middleware');
const isTeamOwner    = require('../../../middlewares/isTeamOwner.middleware');

const invitaionsRouter = express.Router();

// ── Send an invitation (accepts optional sharedProjects array in body) ────────
invitaionsRouter.post('/sendinvitaions', protect, sendInvite);

// ── Agent 2: fetch the admin's own projects for the selector modal ────────────
invitaionsRouter.get('/my-projects', protect, getAdminProjects);

// ── Invitations received by the logged-in developer ──────────────────────────
invitaionsRouter.get('/getallinetations', protect, getMyInvitations);

// ── Respond (accept / reject) ─────────────────────────────────────────────────
invitaionsRouter.post('/respond/:invitationId', protect, respondToInvitation);

// ── Team member management (admin-only operations use isTeamOwner) ────────────
invitaionsRouter.get('/members', protect, getTeamMembers);
invitaionsRouter.delete('/members/:memberId', protect, isTeamOwner, terminateMember);
invitaionsRouter.patch('/members/:memberId/permissions', protect, isTeamOwner, updateMemberPermission);
invitaionsRouter.patch('/members/:memberId/assign-projects', protect, isTeamOwner, assignProjectsToMember);

// ── Full termination with real-time access revocation (access:revoked socket) ─
invitaionsRouter.post('/terminate/:memberId', protect, isTeamOwner, terminateMember);

module.exports = { invitaionsRouter };