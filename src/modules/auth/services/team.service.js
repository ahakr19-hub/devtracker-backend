const Developer    = require("../repositories/auth.repository");
const ApiError     = require("../../../utils/apiErrors");
const InvitationRepo = require("../repositories/invitations.repository");
const Project      = require("../schemas/project.schema");
const { triggerOnboarding } = require("../../onboarding/onboarding.service");

// ── Plan limits (mirrors frontend FREE_LIMIT constant) ───────────────────────
const FREE_PROJECT_LIMIT = 3;

/**
 * sendInvite
 *
 * @param {ObjectId} adminId
 * @param {string}   recipientEmail
 * @param {string[]} sharedProjectIds  — array of Project ObjectIds the admin chose.
 *                                       Empty array = team-only invite (no project sharing).
 */
const sendInvite = async (adminId, recipientEmail, sharedProjectIds = []) => {
  const emailLower = recipientEmail.toLowerCase().trim();

  // ── 1. Basic validation ──────────────────────────────────────────────────
  if (!adminId || !emailLower) {
    throw new ApiError(400, "Admin ID and developer email are required");
  }

  const admin = await Developer.findUserById(adminId);
  if (admin.email === emailLower) {
    throw new ApiError(400, "You cannot send an invitation to yourself");
  }

  // ── 2. Verify recipient exists ───────────────────────────────────────────
  const recipient = await Developer.findUserByEmail(emailLower);
  if (!recipient) {
    throw new ApiError(404, "Cannot find user with this email");
  }

  // ── 3. Already a member? ─────────────────────────────────────────────────
  const isAlreadyMember = recipient.teams.some(
    (t) => t.adminId.toString() === adminId.toString()
  );
  if (isAlreadyMember) {
    throw new ApiError(400, "This developer is already in your team");
  }

  // ── 4. Duplicate pending invite? ─────────────────────────────────────────
  const existingInvite = await InvitationRepo.findPendingInvite(adminId, emailLower);
  if (existingInvite) {
    throw new ApiError(400, "An invitation is already pending for this developer");
  }

  // ── 5. Agent 1 — IDOR Guard: admin must own every selected project ───────
  //    Never trust client IDs. We verify ownership server-side before storing.
  let validatedProjectIds = [];
  if (sharedProjectIds && sharedProjectIds.length > 0) {
    const adminOwnedProjects = await Project.find(
      { _id: { $in: sharedProjectIds }, owner: adminId, isArchived: false },
      { _id: 1 }         // minimal projection — just need the IDs
    ).lean();

    if (adminOwnedProjects.length !== sharedProjectIds.length) {
      throw new ApiError(
        403,
        "One or more selected projects do not belong to you or are archived."
      );
    }
    validatedProjectIds = adminOwnedProjects.map((p) => p._id);
  }

  // ── 6. Agent 1 — Plan-Limit Gate ─────────────────────────────────────────
  //    Only relevant when the admin is sharing specific projects.
  //    We check the invitee's current project load before granting access.
  if (validatedProjectIds.length > 0) {
    const isPremiumInvitee = recipient.subscription?.isPremium === true &&
      ["active", "trialing"].includes(recipient.subscription?.status);

    if (!isPremiumInvitee) {
      const currentCount = await InvitationRepo.getInviteeProjectCount(
        recipient._id,
        emailLower
      );

      const wouldExceed = currentCount + validatedProjectIds.length > FREE_PROJECT_LIMIT;

      if (wouldExceed) {
        // ── 6a. Block the invite ───────────────────────────────────────────
        // Insert an in-app notification for the invitee so they see the
        // upgrade prompt the next time they log in (fire-and-forget).
        if (global.io) {
          global.io.to(recipient._id.toString()).emit("project_limit_exceeded", {
            adminName: admin.name,
            currentCount,
            limit: FREE_PROJECT_LIMIT,
            message: `${admin.name} tried to share ${validatedProjectIds.length} project(s) with you, but you have reached your FREE plan limit of ${FREE_PROJECT_LIMIT} projects. Upgrade to PRO for unlimited access.`,
          });
        }

        throw new ApiError(
          422,
          `The invitee has reached the FREE plan limit (${FREE_PROJECT_LIMIT} projects). ` +
          `They currently control ${currentCount} project(s). ` +
          `Ask them to upgrade to PRO or share fewer projects.`
        );
      }
    }
  }

  // ── 7. Create the invitation (with or without project sharing) ───────────
  const invitation = validatedProjectIds.length > 0
    ? await InvitationRepo.createInvitationWithProjects(adminId, emailLower, validatedProjectIds)
    : await InvitationRepo.createInvitation(adminId, emailLower);

  // ── 8. Real-time notification via Socket.io ──────────────────────────────
  if (global.io) {
    global.io.to(recipient._id.toString()).emit("new_invitation", {
      message: `You have been invited to join ${admin.name}'s team`,
      invitationId: invitation._id,
      senderName: admin.name,
      sharedProjectCount: validatedProjectIds.length,
      sentAt: invitation.createdAt,
    });
  }

  return invitation;
};


const respondToInvite = async (userId, invitationId, decision) => {
  if (!decision || !invitationId) {
    throw new ApiError(400, "Decision and Invitation ID are required");
  }

  // 1. البحث عن الدعوة
  const invitation = await InvitationRepo.findInviteById(invitationId);
  if (!invitation || invitation.status !== "pending") {
    throw new ApiError(400, "This invitation is no longer valid or has already been processed.");
  }

  // 2. التأكد أن المطور الحالي هو صاحب الدعوة
  const user = await Developer.findUserById(userId);
  if (user.email !== invitation.recipientEmail) {
    throw new ApiError(403, "You are not authorized to respond to this invitation.");
  }

  if (decision === "accept") {
    // 3. إضافة المطور لفريق الأدمن (بناءً على خطتك: صلاحيات لإدارة المشاريع)
    const alreadyInTeam = user.teams.some(t => t.adminId.toString() === invitation.sender.toString());
    
    if (!alreadyInTeam) {
      user.teams.push({ 
        adminId: invitation.sender,

      });
      await user.save();
    }

    await InvitationRepo.updateInvitationStatus(invitationId, "accepted");

    // --- ⚡ إشعار للأدمن إن الدعوة اتقبلت ⚡ ---
    if (global.io) {
      global.io.to(invitation.sender.toString()).emit("invitation_accepted", {
        developerName: user.name,
        developerId: user._id,
        message: `${user.name} has joined your team!`
      });
    }

    // --- 🤖 Automated Onboarding Bot: triggers if invitation has a projectId ---
    // Fire-and-forget — does NOT block the accept response.
    // The bot delivers the onboarding message via Socket.io asynchronously.
    if (invitation.projectId) {
      triggerOnboarding({
        projectId: invitation.projectId.toString(),
        newMemberId: user._id.toString(),
      }).catch((err) =>
        console.error(`[TeamService] Onboarding trigger failed: ${err.message}`)
      );
    }

    return { message: "Invitation accepted. You are now part of the team!" };
  } 
  
  else if (decision === "reject") {
    await InvitationRepo.updateInvitationStatus(invitationId, "rejected");

    // --- ⚡ إشعار للأدمن بالرفض ⚡ ---
    if (global.io) {
      global.io.to(invitation.sender.toString()).emit("invitation_rejected", {
        developerEmail: user.email,
        message: `${user.name} declined your invitation.`
      });
    }

    return { message: "Invitation rejected." };
  }

  throw new ApiError(400, "Invalid decision. Must be 'accept' or 'reject'.");
};

const getTeamMembers = async (adminId) => {
  // 1. التأكد من وجود الأدمن (خطوة اختيارية لزيادة الأمان)
  const admin = await Developer.findUserById(adminId);
  if (!admin) {
    throw new ApiError(404, "Admin not found");
  }

  // 2. جلب الأعضاء من الريبوزيتوري
  const members = await InvitationRepo.findTeamMembers(adminId);

  // 3. تنسيق البيانات (اختياري) عشان نرجع الصلاحيات بشكل أوضح
  const formattedMembers = members.map(member => ({
    id: member._id,
    name: member.name,
    email: member.email,
    joinedAt: member.teams[0].joinedAt,
    permissions: member.teams[0].permissions
  }));

  return formattedMembers;
};

const getMyInvitations = async (userId) => {
  const user = await Developer.findUserById(userId);
  if (!user) {
    throw new ApiError(404, "user not found");
  }

  const invitations = await InvitationRepo.findInvitesForUser(user.email);

  return invitations;
};

const removeMember = async (adminId , memberId) => {
  if(!adminId , !memberId){
    throw new ApiError(400, "Admin ID and Member ID are required");
  }

  const member = await Developer.findUserById(memberId);
  const isInTeam = member.teams.some(
    (t) => t.adminId.toString() === adminId.toString()
  );

  if (!isInTeam) {
    throw new ApiError(400, "This developer is not a member of your team");
  }
  await InvitationRepo.removeMemberFromTeam(adminId, memberId);

  if (global.io) {
    global.io.to(memberId.toString()).emit("removed_from_team", {
      message: "You have been removed from the team by the admin.",
      adminId: adminId,
    });
  }

  return { message: "Member removed successfully from your team" };
}

// بدل newPermissions، هنستقبل key (اسم الصلاحية) و value (true/false)
const changeMemberPermissions = async (adminId, memberId, key, value) => {
  
  // 1. Validation: نتأكد إن الـ key والـ value مبعوتين
  // خلي بالك الـ value ممكن تبقى false، فبنختبر إنها مش undefined
  if (!memberId || !key || value === undefined) {
    throw new ApiError(400, "Member ID, permission key, and value are required");
  }

  const allowedKeys = ["canCreateProjects", "canEditProjects", "canDeleteProjects", "canManageTasks", "canSeeFinancials"];

if (!allowedKeys.includes(key)) {
  throw new ApiError(400, "Invalid permission key");
}

  // 2. تحديث الصلاحية الواحدة في الـ Repository
  // لاحظ إننا بنبعت الـ 4 parameters بالترتيب الصح
  const updatedMember = await InvitationRepo.updateSinglePermission(adminId, memberId, key, value);

  if (!updatedMember) {
    throw new ApiError(404, "Member not found in your team or you are not the admin");
  }

  // 3. التنبيه بالـ Socket
  if (global.io) {
    global.io.to(memberId.toString()).emit("permissions_updated", {
      adminId: adminId,
      updatedKey: key, 
      newValue: value,
      message: `Your permission '${key}' has been updated to ${value}.`
    });
  }

  return { 
    message: "Permission updated successfully", 
    updated: { [key]: value } // بنرجع الصلاحية اللي اتعدلت بس
  };
};
module.exports = {sendInvite , getMyInvitations , respondToInvite , getTeamMembers , removeMember , changeMemberPermissions}