"use strict";

const { OUTCOMES } = require("./index");

const projectAdapter = {
  strategyKeys: ["work_on_project"],

  canExecute({ context = {} }) {
    return Boolean(context.hasActiveProject);
  },

  async execute({ companionId, customerId, need, plan, context = {}, now = new Date() }) {
    const { activeProject } = context;

    if (!activeProject) {
      return {
        outcome:  OUTCOMES.UNAVAILABLE,
        evidence: { reason: "no_active_project" },
        note:     "No active project to work on",
      };
    }

    const progressNote = `Working on "${activeProject.title || "current project"}" — ${need.needType.replace(/_/g, " ")} channel`;

    return {
      outcome:  OUTCOMES.SUCCESS,
      evidence: {
        projectTitle: activeProject.title || "current project",
        projectProgress: activeProject.progress ?? null,
        needType: need.needType,
        reason:   plan.reason ?? "project_fulfills_need",
        workedAt: now.toISOString(),
      },
      note: progressNote,
      followUp: "Project progress noted — check if moment should be shared later",
    };
  },
};

module.exports = { projectAdapter };
