const express = require('express');
const {
  sendInvite,
  getAdminProjects,
  getMyInvitations,
  respondToInvitation,
  getTeamMembers,
  removeTeamMember,
  updateMemberPermission,
} = require('../controllers/teamscontrollers/teams');
const { protect }    = require('../../../middlewares/auth.middleware');
const isTeamOwner    = require('../../../middlewares/isTeamOwner.middleware');

const invitaionsRouter = express.Router();

// ── Send an invitation (accepts optional sharedProjects array in body) ────────
invitaionsRouter.post('/sendinvitaions', protect, sendInvite);

// ── Agent 2: fetch the admin's own projects for the selector modal ────────────
// Protected to the requesting user only — no cross-developer leakage possible
invitaionsRouter.get('/my-projects', protect, getAdminProjects);

// ── Invitations received by the logged-in developer ──────────────────────────
invitaionsRouter.get('/getallinetations', protect, getMyInvitations);

// ── Respond (accept / reject) ─────────────────────────────────────────────────
invitaionsRouter.post('/respond/:invitationId', protect, respondToInvitation);

// ── Team member management (admin-only operations use isTeamOwner) ────────────
invitaionsRouter.get('/members', protect, getTeamMembers);
invitaionsRouter.delete('/members/:memberId', protect, isTeamOwner, removeTeamMember);
invitaionsRouter.patch('/members/:memberId/permissions', protect, isTeamOwner, updateMemberPermission);

module.exports = { invitaionsRouter };