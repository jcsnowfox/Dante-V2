// Production launcher for the single Railway deploy, because Railway's start
// command invokes `pnpm --filter @workspace/api-server start`.
//
// Design goals:
//  - The process that owns the admin web UI binds the public PORT so the admin
//    UI is reachable at the Railway URL and Railway health checks pass.
//      * With DISCORD_TOKEN set: the Ghostlight bot binds the public PORT. The bot
//        "runs both" — its HTTP server serves the admin UI AND it connects to
//        the Discord gateway, all in one process.
//      * Without DISCORD_TOKEN (fresh template deploy / local dev): the
//        lightweight template API server binds the public PORT instead, so
//        Railway still has a healthy listener and stays "online".
//  - The chosen process is supervised with exponential backoff: if it crashes
//    (e.g. DATABASE_URL unreachable), it is retried until its environment is
//    correct. A full shutdown only happens on SIGTERM/SIGINT.
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));

const railwayPort = process.env.PORT && process.env.PORT.trim() ? process.env.PORT.trim() : "8080";

const BASE_DELAY_MS = 5000;
const MAX_DELAY_MS = 30000;
const STABLE_UPTIME_MS = 30000; // how long a child must stay up before backoff resets
const SHUTDOWN_GRACE_MS = 5000;

let shuttingDown = false;
const supervised = [];

function supervise({ name, command, args, env }) {
  const state = {
    name,
    command,
    args,
    env,
    child: null,
    restartDelay: BASE_DELAY_MS,
    restartTimer: null,
    stableTimer: null,
  };
  supervised.push(state);

  const launch = () => {
    if (shuttingDown) return;
    console.log(`[launcher] starting ${name}`);
    const child = spawn(command, args, { stdio: "inherit", env: { ...process.env, ...env } });
    state.child = child;

    // Reset backoff only after the child has stayed up for a stable window,
    // not on spawn (which fires immediately and would defeat the backoff).
    state.stableTimer = setTimeout(() => {
      state.restartDelay = BASE_DELAY_MS;
    }, STABLE_UPTIME_MS);

    child.on("exit", (code, signal) => {
      state.child = null;
      if (state.stableTimer) {
        clearTimeout(state.stableTimer);
        state.stableTimer = null;
      }
      if (shuttingDown) return;
      const delay = state.restartDelay;
      console.error(
        `[launcher] ${name} exited (code=${code}, signal=${signal}); restarting in ${Math.round(delay / 1000)}s`,
      );
      state.restartDelay = Math.min(delay * 2, MAX_DELAY_MS);
      state.restartTimer = setTimeout(launch, delay);
    });
    child.on("error", (err) => {
      console.error(`[launcher] ${name} failed to spawn:`, err);
    });
  };

  launch();
}

function shutdown(code) {
  if (shuttingDown) return;
  shuttingDown = true;

  for (const state of supervised) {
    if (state.restartTimer) clearTimeout(state.restartTimer);
    if (state.stableTimer) clearTimeout(state.stableTimer);
    const child = state.child;
    if (child && child.exitCode === null && !child.killed) {
      child.kill("SIGTERM");
    }
  }

  // Grace period, then force-kill any survivors and exit.
  const timer = setTimeout(() => {
    for (const state of supervised) {
      const child = state.child;
      if (child && child.exitCode === null && !child.killed) {
        child.kill("SIGKILL");
      }
    }
    process.exit(code);
  }, SHUTDOWN_GRACE_MS);
  if (typeof timer.unref === "function") timer.unref();
}

process.on("SIGTERM", () => shutdown(0));
process.on("SIGINT", () => shutdown(0));

// The Ghostlight bot "runs both": its HTTP server serves the admin web UI on the
// port it is given AND it connects to the Discord gateway, all in one process.
//
//  - When DISCORD_TOKEN is configured we run the bot directly on the public PORT
//    so the admin UI is reachable at the Railway URL (and Discord is online).
//  - When it is NOT configured (e.g. a fresh template deploy or local dev) we
//    fall back to the lightweight template API server on the public PORT so
//    Railway still has a healthy listener and stays "online".
if (process.env.DISCORD_TOKEN && process.env.DISCORD_TOKEN.trim()) {
  supervise({
    name: "ghostlight-bot",
    command: "node",
    args: [resolve(here, "../ghostlight-bot/src/index.js")],
    env: { PORT: railwayPort },
  });
} else {
  console.warn(
    "[launcher] DISCORD_TOKEN not set — serving the template API server on the " +
      "public port and skipping the Discord bot. Set DISCORD_TOKEN (and DATABASE_URL, " +
      "DISCORD_CLIENT_ID, DISCORD_GUILD_ID, DISCORD_ALLOWED_CHANNEL_ID, OPENROUTER_API_KEY) " +
      "to run the full bot + admin UI.",
  );
  supervise({
    name: "api-server",
    command: "node",
    args: ["--enable-source-maps", resolve(here, "dist/index.mjs")],
    env: { PORT: railwayPort },
  });
}
