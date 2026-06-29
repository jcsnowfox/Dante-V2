"use strict";

const assert = require("node:assert/strict");
const http = require("node:http");
const test = require("node:test");
const { createHealthServer } = require("./createHealthServer");
const { buildContextDiagnostics } = require("../context/diagnostics");

function request(server, pathname) {
  const { port } = server.address();
  return new Promise((resolve, reject) => {
    const req = http.get({ hostname: "127.0.0.1", port, path: pathname }, (res) => {
      let body = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => { body += chunk; });
      res.on("end", () => resolve({ statusCode: res.statusCode, headers: res.headers, body }));
    });
    req.on("error", reject);
  });
}

function createTestServer(config) {
  return createHealthServer({
    port: 0,
    logger: { info() {}, error() {}, warn() {} },
    appContext: {
      ready: true,
      config: {
        admin: {},
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

test("diagnostics includes call route mounted and calls enabled flags", () => {
  const diagnostics = buildContextDiagnostics({
    config: { calls: { enabled: true }, features: {}, chat: { timezone: "UTC" } },
    logger: { warn() {} },
  });

  assert.equal(diagnostics.features.calls.calls_enabled, true);
  assert.equal(diagnostics.features.calls.call_route_mounted, true);
const test = require('node:test');
const assert = require('node:assert/strict');
const { renderCallPage } = require('./callRoutes');

test('/call/:companionId page contains mobile call controls and browser STT fallback', () => {
  const html = renderCallPage({ companionId: 'dante' });
  assert.match(html, /Start call/);
  assert.match(html, /Hands-free mode/);
  assert.match(html, /Push-to-talk mode/);
  assert.match(html, /SpeechRecognition/);
  assert.match(html, /Hands-free speech recognition is not available/);
  assert.match(html, /kokoro_web/);
});
