/**
 * onboarding.controller.js
 * ══════════════════════════════════════════════════════════════════
 * HTTP controller for the Onboarding Bot API endpoints.
 *
 * Endpoints:
 *   POST /api/v1/onboarding/trigger
 *     — Manually trigger onboarding for a developer on a project.
 *       Useful for re-triggering if the original event was missed.
 *       Body: { projectId, memberId }
 *
 * Note: In normal flow, onboarding is triggered automatically inside
 * team.service.js when a developer accepts an invitation.
 * This controller provides a manual override endpoint.
 * ══════════════════════════════════════════════════════════════════
 */

const ApiError = require("../../utils/apiErrors");
const { triggerOnboarding } = require("./onboarding.service");

/**
 * @desc    Manually (re-)trigger the onboarding bot for a developer on a project
 * @route   POST /api/v1/onboarding/trigger
 * @access  Private — Admin only (protect + adminOnly middleware)
 *
 * Body: { projectId: string, memberId: string }
 * Response: 202 Accepted — onboarding runs asynchronously via Socket.io
 */
const triggerOnboardingBot = async (req, res, next) => {
  try {
    const { projectId, memberId } = req.body;

    if (!projectId || !memberId) {
      return next(new ApiError(400, "projectId and memberId are required in the request body."));
    }

    // Always fire-and-forget from the HTTP endpoint — response is instant.
    // Result delivered to developer via Socket.io event "onboarding_message".
    await triggerOnboarding({
      projectId,
      newMemberId: memberId,
      options: { waitForResult: false },
    });

    res.status(202).json({
      status: "accepted",
      message: "Onboarding pipeline triggered. ARIA will deliver the message via Socket.io.",
      data: { projectId, memberId },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Trigger onboarding and wait for the full result (dev/test mode)
 * @route   POST /api/v1/onboarding/trigger/sync
 * @access  Private — Admin only
 *
 * Body: { projectId: string, memberId: string }
 * Response: 200 with the full onboarding message + execution metadata
 */
const triggerOnboardingBotSync = async (req, res, next) => {
  try {
    const { projectId, memberId } = req.body;

    if (!projectId || !memberId) {
      return next(new ApiError(400, "projectId and memberId are required in the request body."));
    }

    const result = await triggerOnboarding({
      projectId,
      newMemberId: memberId,
      options: { waitForResult: true },
    });

    res.status(200).json({
      status: result.success ? "success" : "partial",
      message: result.success
        ? "Onboarding message generated successfully."
        : "Pipeline completed with errors — fallback message returned.",
      data: {
        onboardingMessage: result.message,
        meta: result.meta,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Ask ARIA onboarding assistant a custom question
 * @route   POST /api/v1/onboarding/qa
 * @access  Private
 */
const askAria = async (req, res, next) => {
  try {
    const { question, techStack = [], projectName = 'Unknown Project' } = req.body;

    if (!question) {
      return next(new ApiError(400, "question is required."));
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.status(200).json({
        status: "success",
        answer: "System offline. Offline response: Verify your configuration environment key."
      });
    }

    const { GoogleGenerativeAI } = require("@google/generative-ai");
    const client = new GoogleGenerativeAI(apiKey);
    const model = client.getGenerativeModel({
      model: process.env.GEMINI_MODEL || "gemini-2.5-flash",
      systemInstruction: `
You are ARIA — Automated Repository Intelligence Assistant.
You are helping a developer onboard onto the project "${projectName}" which uses stack: ${techStack.join(', ')}.
Speak like a senior developer: concise, direct, dark-mode/glassmorphic high-contrast aesthetic in tone.
Zero corporate fluff. Max 3 sentences. Get straight to the technical solution or advice.
`
    });

    const prompt = `Developer asks: "${question}"`;
    const result = await model.generateContent(prompt);
    const text = result.response.text().trim();

    res.status(200).json({
      status: "success",
      answer: text
    });
  } catch (error) {
    next(error);
  }
};

module.exports = { triggerOnboardingBot, triggerOnboardingBotSync, askAria };
