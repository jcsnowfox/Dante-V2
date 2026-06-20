const { parseRequestForm } = require("../adminRequestUtils");
const { normalizeTheme, buildReturnLocation } = require("../adminUiHelpers");
const {
  BOOLEAN_FLAGS,
} = require("../../companionSystems/feedbackLearning/feedbackConfigSchema");

const RETURN_PATH = "/admin/feedback-learning";

function fieldValue(fields, key) {
  const raw = fields[key];
  return String(Array.isArray(raw) ? raw[0] : raw || "").trim();
}

function buildConfigFromFields(fields) {
  const config = {};
  for (const flag of BOOLEAN_FLAGS) {
    config[flag] = Boolean(fields[flag]);
  }
  const maxRaw = Number(fieldValue(fields, "max_learning_proposals_per_day"));
  config.max_learning_proposals_per_day = Number.isFinite(maxRaw) ? maxRaw : 20;
  return config;
}

function redirect(innerRes, { returnTo, theme, message, error }) {
  return innerRes.writeHead(303, {
    Location: buildReturnLocation({
      returnTo,
      fallbackPath: RETURN_PATH,
      theme,
      message,
      error,
    }),
  }).end();
}

async function handleFeedbackLearningActions({ req, res, url, context, withAdmin }) {
  if (req.method === "POST" && url.pathname === "/admin/actions/feedback-learning-save") {
    return withAdmin(async (innerReq, innerRes, innerContext) => {
      const { fields } = await parseRequestForm(innerReq);
      const theme = normalizeTheme(fields.theme);
      const returnTo = fieldValue(fields, "returnTo") || RETURN_PATH;
      const engine = innerContext.feedbackLearning || null;

      if (!engine || !engine.store || engine.store.available !== true) {
        return redirect(innerRes, {
          returnTo,
          theme,
          error: "Could not save — no database is configured, so the Feedback & Learning engine stays inert.",
        });
      }

      try {
        await engine.settingsService.saveSettings({
          enabled: Boolean(fields.row_enabled),
          ownerEditable: Boolean(fields.owner_editable),
          config: buildConfigFromFields(fields),
        });
      } catch (error) {
        innerContext.logger?.error?.("[feedback-learning] Failed to save settings from dashboard.", {
          error: error.message,
        });
        return redirect(innerRes, { returnTo, theme, error: "Failed to save Feedback & Learning settings." });
      }

      return redirect(innerRes, { returnTo, theme, message: "Saved Feedback & Learning settings." });
    })(req, res, context);
  }

  if (req.method === "POST" && url.pathname === "/admin/actions/feedback-learning-submit") {
    return withAdmin(async (innerReq, innerRes, innerContext) => {
      const { fields } = await parseRequestForm(innerReq);
      const theme = normalizeTheme(fields.theme);
      const returnTo = fieldValue(fields, "returnTo") || RETURN_PATH;
      const engine = innerContext.feedbackLearning || null;

      if (!engine) {
        return redirect(innerRes, { returnTo, theme, error: "Feedback & Learning engine is not available." });
      }

      const feedbackTypeId = fieldValue(fields, "feedback_type_id");
      const feedbackText = fieldValue(fields, "feedback_text") || null;
      const sourceMessageId = fieldValue(fields, "source_message_id") || null;

      let result = null;
      try {
        result = await engine.submitFeedback({ feedbackTypeId, feedbackText, sourceMessageId });
      } catch (error) {
        innerContext.logger?.error?.("[feedback-learning] Failed to submit feedback from dashboard.", {
          error: error.message,
        });
        return redirect(innerRes, { returnTo, theme, error: "Failed to submit feedback." });
      }

      if (!result || result.accepted !== true) {
        return redirect(innerRes, {
          returnTo,
          theme,
          error: `Feedback not accepted (${result?.reason || "unknown"}).`,
        });
      }

      return redirect(innerRes, { returnTo, theme, message: "Feedback recorded." });
    })(req, res, context);
  }

  if (req.method === "POST" && url.pathname === "/admin/actions/feedback-learning-proposal") {
    return withAdmin(async (innerReq, innerRes, innerContext) => {
      const { fields } = await parseRequestForm(innerReq);
      const theme = normalizeTheme(fields.theme);
      const returnTo = fieldValue(fields, "returnTo") || RETURN_PATH;
      const engine = innerContext.feedbackLearning || null;

      if (!engine) {
        return redirect(innerRes, { returnTo, theme, error: "Feedback & Learning engine is not available." });
      }

      const proposalId = Number(fieldValue(fields, "proposal_id"));
      const decision = fieldValue(fields, "decision");

      if (!Number.isFinite(proposalId)) {
        return redirect(innerRes, { returnTo, theme, error: "Invalid proposal id." });
      }

      try {
        if (decision === "approve") {
          await engine.approveProposal(proposalId);
          return redirect(innerRes, { returnTo, theme, message: "Proposal approved." });
        }
        if (decision === "reject") {
          await engine.rejectProposal(proposalId);
          return redirect(innerRes, { returnTo, theme, message: "Proposal rejected." });
        }
        if (decision === "apply") {
          const applied = await engine.applyProposal(proposalId);
          if (!applied || applied.applied !== true) {
            return redirect(innerRes, {
              returnTo,
              theme,
              error: `Proposal not applied (${applied?.reason || "blocked"}).`,
            });
          }
          return redirect(innerRes, { returnTo, theme, message: "Proposal applied." });
        }
      } catch (error) {
        innerContext.logger?.error?.("[feedback-learning] Proposal action failed.", {
          proposalId,
          decision,
          error: error.message,
        });
        return redirect(innerRes, { returnTo, theme, error: "Proposal action failed." });
      }

      return redirect(innerRes, { returnTo, theme, error: "Unknown proposal action." });
    })(req, res, context);
  }

  return false;
}

module.exports = { handleFeedbackLearningActions };
