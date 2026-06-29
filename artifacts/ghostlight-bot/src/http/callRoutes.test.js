"use strict";

const assert = require("node:assert/strict");
const http = require("node:http");
const test = require("node:test");
const { createHealthServer } = require("./createHealthServer");
const { buildContextDiagnostics } = require("../context/diagnostics");
const { renderShell } = require("./renderAdminPages/shared");
const { renderCallPage } = require("./callRoutes");

function request(server, pathname, headers = {}) {
  const { port } = server.address();
  return new Promise((resolve, reject) => {
    const req = http.get({ hostname: "127.0.0.1", port, path: pathname, headers }, (res) => {
      let body = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => { body += chunk; });
      res.on("end", () => resolve({ statusCode: res.statusCode, headers: res.headers, body }));
    });
    req.on("error", reject);
  });
}

function postJson(server, pathname, payload = {}) {
  const { port } = server.address();
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(payload);
    const req = http.request({ hostname: "127.0.0.1", port, path: pathname, method: "POST", headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) } }, (res) => {
      let responseBody = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => { responseBody += chunk; });
      res.on("end", () => resolve({ statusCode: res.statusCode, headers: res.headers, body: responseBody, json: JSON.parse(responseBody) }));
    });
    req.on("error", reject);
    req.end(body);
  });
}

function createTestServer(config) {
  return createHealthServer({
    port: 0,
    logger: { info() {}, error() {}, warn() {} },
    appContext: {
      ready: true,
      config: {
        admin: { username: "owner", password: "secret" },
        discord: {},
        chat: { timezone: "UTC", promptBlocks: { personaName: "Dante" } },
        features: {},
        ...config,
      },
      logger: { info() {}, error() {}, warn() {} },
    },
  });
}

test("GET /call/dante returns HTML when CALLS_ENABLED is true", async (t) => {
  const server = createTestServer({ calls: { enabled: true } });
  t.after(() => server.close());

  await new Promise((resolve) => server.on("listening", resolve));
  const response = await request(server, "/call/dante");

  assert.equal(response.statusCode, 200);
  assert.match(response.headers["content-type"], /text\/html/);
  assert.match(response.body, /<h1>Call Dante<\/h1>/);
  assert.match(response.body, /data-call-page="enabled"/);
  assert.doesNotMatch(response.body, /^\s*\{/);
});

test("GET /call/dante returns a disabled HTML page instead of Not found when calls are off", async (t) => {
  const server = createTestServer({ calls: { enabled: false } });
  t.after(() => server.close());

  await new Promise((resolve) => server.on("listening", resolve));
  const response = await request(server, "/call/dante");

  assert.equal(response.statusCode, 200);
  assert.match(response.headers["content-type"], /text\/html/);
  assert.match(response.body, /Calls disabled/);
  assert.match(response.body, /CALLS_ENABLED=true/);
  assert.doesNotMatch(response.body, /Not found\./);
});

test("GET /admin/call/dante returns an authenticated dashboard page connected to the call backend", async (t) => {
  const server = createTestServer({ calls: { enabled: true } });
  t.after(() => server.close());

  await new Promise((resolve) => server.on("listening", resolve));
  const auth = `Basic ${Buffer.from("owner:secret").toString("base64")}`;
  const response = await request(server, "/admin/call/dante", { authorization: auth });

  assert.equal(response.statusCode, 200);
  assert.match(response.headers["content-type"], /text\/html/);
  assert.match(response.body, /Ghostlight AI Admin/);
  assert.match(response.body, /<h1>Call Dante<\/h1>/);
  assert.match(response.body, /href="\/call\/dante"/);
  assert.match(response.body, /data-call-page="enabled"/);
});

test("dashboard sidebar exposes Call Dante inside the authenticated admin surface", () => {
  const html = renderShell({
    currentSection: "call",
    pageBody: "<main>Call body</main>",
    theme: "dark",
    helpers: {
      escapeHtml(value) { return String(value || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\"/g, "&quot;"); },
      buildAdminLocation({ path, theme }) { return `${path}?theme=${theme}`; },
      renderIconImage() { return ""; },
      renderLayout({ body }) { return body; },
    },
  });

  assert.match(html, /Call Dante/);
  assert.match(html, /href="\/admin\/call\/dante\?theme=dark" aria-current="page"/);
});

test("diagnostics includes call route mounted and calls enabled flags", () => {
  const diagnostics = buildContextDiagnostics({
    config: { calls: { enabled: true }, features: {}, chat: { timezone: "UTC" } },
    logger: { warn() {} },
  });

  assert.equal(diagnostics.features.calls.calls_enabled, true);
  assert.equal(diagnostics.features.calls.call_route_mounted, true);
});

test("/call/:companionId page contains mobile call controls and browser STT fallback", () => {
  const html = renderCallPage({ companionId: "dante", enabled: true });
  assert.match(html, /Start call/);
  assert.match(html, /Hands-free mode/);
  assert.match(html, /Push-to-talk mode/);
  assert.match(html, /call-dante\.js/);
  assert.match(html, /call-start/);
  assert.match(html, /call-replay[^>]+disabled/);
});


test("call APIs return usable JSON contracts", async (t) => {
  const server = createTestServer({ calls: { enabled: true } });
  t.after(() => server.close());

  await new Promise((resolve) => server.on("listening", resolve));
  const start = await postJson(server, "/api/call/dante/start", {});
  assert.equal(start.statusCode, 200);
  assert.equal(start.json.ok, true);
  assert.ok(start.json.sessionId);
  assert.equal(start.json.status, "idle");

  const message = await postJson(server, "/api/call/dante/message", { sessionId: start.json.sessionId, text: "hello", mode: "typed" });
  assert.equal(message.statusCode, 200);
  assert.equal(message.json.ok, true);
  assert.equal(message.json.userText, "hello");
  assert.ok(message.json.replyText);
  assert.equal(typeof message.json.fallbackUsed, "boolean");

  const end = await postJson(server, "/api/call/dante/end", { sessionId: start.json.sessionId });
  assert.equal(end.statusCode, 200);
  assert.equal(end.json.ok, true);
});

test("call client script wires all controls without inline JavaScript", async (t) => {
  const server = createTestServer({ calls: { enabled: true } });
  t.after(() => server.close());

  await new Promise((resolve) => server.on("listening", resolve));
  const page = await request(server, "/call/dante");
  assert.match(page.body, /<script src="\/assets\/call-dante\.js" defer><\/script>/);
  assert.doesNotMatch(page.body, /<script>\s*const companionId/);

  const script = await request(server, "/assets/call-dante.js");
  assert.equal(script.statusCode, 200);
  assert.match(script.headers["content-type"], /application\/javascript/);
  for (const token of ["call-start", "call-end", "call-mute", "call-pause", "call-hands-free", "call-ptt-mode", "call-ptt", "call-send-typed", "call-replay", "pointerdown", "pointerup", "speechSynthesis"]) {
    assert.match(script.body, new RegExp(token));
  }
});
