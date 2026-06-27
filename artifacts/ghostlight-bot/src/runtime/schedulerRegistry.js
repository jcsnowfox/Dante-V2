"use strict";

/**
 * Scheduler Registry — single place to register, start, stop, and inspect
 * all recurring engines in the Ghostlight runtime.
 *
 * Two phases preserve the startup ordering in index.js:
 *   background  — started before Discord login (aliveEngine)
 *   postLogin   — started after Discord login (automations, heartbeat, life, emotionalArc)
 *
 * Usage:
 *   const registry = createSchedulerRegistry({ logger });
 *   registry.registerBackground("aliveEngine", () => aliveEngine.start());
 *   await registry.startBackground();          // pre-login
 *   registry.registerPostLogin("heartbeat", () => heartbeat.start());
 *   await registry.startPostLogin();           // post-login
 *   registry.status();                         // [{ name, phase, running }]
 */
function createSchedulerRegistry({ logger } = {}) {
  const entries = [];

  function registerBackground(name, startFn) {
    entries.push({ name, phase: "background", startFn, running: false });
  }

  function registerPostLogin(name, startFn) {
    entries.push({ name, phase: "postLogin", startFn, running: false });
  }

  async function startPhase(phase) {
    for (const entry of entries.filter((e) => e.phase === phase)) {
      try {
        await Promise.resolve(entry.startFn());
        entry.running = true;
        logger?.info(`[scheduler] ${entry.name} started`);
      } catch (err) {
        logger?.error(`[scheduler] ${entry.name} failed to start`, { error: err?.message });
      }
    }
  }

  async function startBackground() {
    await startPhase("background");
  }

  async function startPostLogin() {
    await startPhase("postLogin");
  }

  function status() {
    return entries.map(({ name, phase, running }) => ({ name, phase, running }));
  }

  return { registerBackground, registerPostLogin, startBackground, startPostLogin, status };
}

module.exports = { createSchedulerRegistry };
