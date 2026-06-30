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

function postRaw(server, pathname, body = "", headers = {}) {
  const { port } = server.address();
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: "127.0.0.1",
      port,
      path: pathname,
      method: "POST",
      headers: {
        "Content-Type": "text/plain",
        "Content-Length": Buffer.byteLength(body),
        ...headers,
      },
    }, (res) => {
      let responseBody = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => { responseBody += chunk; });
      res.on("end", () => resolve({ statusCode: res.statusCode, headers: res.headers, body: responseBody }));
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

test("GET /sl/ping returns Second Life bridge health text at root", async (t) => {
  const logs = [];
  const server = createHealthServer({
    port: 0,
    logger: { info() {}, error() {}, warn() {} },
    appContext: {
      ready: true,
      config: { admin: { username: "owner", password: "secret" }, discord: {}, chat: { timezone: "UTC" }, features: {} },
      logger: { info(message) { logs.push(message); }, error() {}, warn() {} },
    },
  });
  t.after(() => server.close());

  await new Promise((resolve) => server.on("listening", resolve));
  const response = await request(server, "/sl/ping");

  assert.equal(response.statusCode, 200);
  assert.match(response.headers["content-type"], /text\/plain/);
  assert.equal(response.body, "secondlife bridge alive");
  assert.ok(logs.some((message) => message.includes("GET /sl/ping")));
});

test("GET /sl/chat returns Second Life chat route method hint without changing POST", async (t) => {
  const logs = [];
  const server = createHealthServer({
    port: 0,
    logger: { info() {}, error() {}, warn() {} },
    appContext: {
      ready: true,
      config: { admin: { username: "owner", password: "secret" }, discord: {}, chat: { timezone: "UTC" }, features: {} },
      logger: { info(message) { logs.push(message); }, error() {}, warn() {} },
    },
  });
  t.after(() => server.close());

  await new Promise((resolve) => server.on("listening", resolve));
  const response = await request(server, "/sl/chat");

  assert.equal(response.statusCode, 200);
  assert.match(response.headers["content-type"], /text\/plain/);
  assert.equal(response.body, "secondlife chat route alive - use POST");
  assert.ok(logs.some((message) => message.includes("GET /sl/chat")));
});

test("POST /sl/debug accepts any body and returns plain text at root", async (t) => {
  const server = createTestServer({});
  t.after(() => server.close());

  await new Promise((resolve) => server.on("listening", resolve));
  const response = await postRaw(server, "/sl/debug", "anything from lsl");

  assert.equal(response.statusCode, 200);
  assert.match(response.headers["content-type"], /text\/plain/);
  assert.equal(response.body, "secondlife post received");
});

test("POST /sl/chat is mounted beside GET /sl/chat at root and returns plain text", async (t) => {
  const logs = [];
  const handledEvents = [];
  const server = createHealthServer({
    port: 0,
    logger: { info() {}, error() {}, warn() {} },
    appContext: {
      ready: true,
      config: { admin: { username: "owner", password: "secret" }, discord: {}, chat: { timezone: "UTC" }, features: {} },
      logger: { info(message) { logs.push(message); }, error() {}, warn() {} },
      secondLife: {
        available: true,
        async verifySharedSecret() { return true; },
      },
      secondLifeAdapter: {
        async handleEvent(payload) {
          handledEvents.push(payload);
          return { replyText: "hello from dante" };
        },
      },
    },
  });
  t.after(() => server.close());

  const previousBridgeKey = process.env.SL_BRIDGE_KEY;
  process.env.SL_BRIDGE_KEY = "test-bridge-key";
  t.after(() => {
    if (previousBridgeKey === undefined) {
      delete process.env.SL_BRIDGE_KEY;
    } else {
      process.env.SL_BRIDGE_KEY = previousBridgeKey;
    }
  });

  await new Promise((resolve) => server.on("listening", resolve));
  const response = await postRaw(
    server,
    "/sl/chat",
    "message=hello&speaker_name=Tester&speaker_key=avatar-1&bridgeKey=test-bridge-key",
    { "Content-Type": "application/x-www-form-urlencoded" },
  );

  assert.equal(response.statusCode, 200);
  assert.match(response.headers["content-type"], /text\/plain/);
  assert.equal(response.body, "hello from dante");
  assert.ok(logs.some((message) => message.includes("[sl-bridge] POST /sl/chat hit")));
  assert.ok(logs.some((message) => message.includes("[sl-bridge] auth accepted")));
  assert.equal(handledEvents[0].event.messageText, "hello");
  assert.equal(handledEvents[0].event.eventType, "local_chat");
  assert.equal(handledEvents[0].event.avatarName, "Tester");
  assert.equal(handledEvents[0].event.source, "secondlife");
  assert.equal(handledEvents[0].event.platform, "secondlife");
  assert.equal(handledEvents[0].event.slAvatarUsername, "Dante0Solvane");
});

test("POST /sl/chat resolves Dante companion id aliases and caps plain text reply", async (t) => {
  const handledEvents = [];
  const previousBridgeKey = process.env.SL_BRIDGE_KEY;
  process.env.SL_BRIDGE_KEY = "alias-bridge-key";
  t.after(() => {
    if (previousBridgeKey === undefined) {
      delete process.env.SL_BRIDGE_KEY;
    } else {
      process.env.SL_BRIDGE_KEY = previousBridgeKey;
    }
  });

  const server = createHealthServer({
    port: 0,
    logger: { info() {}, error() {}, warn() {} },
    appContext: {
      ready: true,
      config: { admin: { username: "owner", password: "secret" }, discord: {}, chat: { timezone: "UTC" }, features: {} },
      logger: { info() {}, error() {}, warn() {} },
      secondLife: { available: true },
      secondLifeAdapter: {
        async handleEvent(payload) {
          handledEvents.push(payload);
          return { responseText: "x".repeat(950) };
        },
      },
    },
  });
  t.after(() => server.close());

  await new Promise((resolve) => server.on("listening", resolve));
  const response = await postRaw(
    server,
    "/sl/chat",
    JSON.stringify({
      companionId: "dante",
      message: "actual user message",
      avatarName: "Tester Resident",
      avatarKey: "avatar-key-123",
      region: "Ravenhurst",
      channel: "666",
      bridgeKey: "alias-bridge-key",
    }),
    { "Content-Type": "application/json" },
  );

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.length, 900);
  assert.equal(handledEvents[0].companionId, "dante_sølvane");
  assert.equal(handledEvents[0].event.messageText, "actual user message");
  assert.equal(handledEvents[0].event.avatarName, "Tester Resident");
  assert.equal(handledEvents[0].event.avatarKey, "avatar-key-123");
  assert.equal(handledEvents[0].event.region, "Ravenhurst");
  assert.equal(handledEvents[0].event.channel, "666");

  const directResponse = await postRaw(
    server,
    "/sl/chat",
    JSON.stringify({ companionId: "dante_sølvane", message: "direct", bridgeKey: "alias-bridge-key" }),
    { "Content-Type": "application/json" },
  );
  assert.equal(directResponse.statusCode, 200);
  assert.equal(handledEvents[1].companionId, "dante_sølvane");

  const usernameResponse = await postRaw(
    server,
    "/sl/chat",
    JSON.stringify({ companionId: "Dante0Solvane", message: "username is context only", bridgeKey: "alias-bridge-key" }),
    { "Content-Type": "application/json" },
  );
  assert.equal(usernameResponse.statusCode, 200);
  assert.equal(handledEvents[2].companionId, "dante_sølvane");
  assert.equal(handledEvents[2].event.slAvatarUsername, "Dante0Solvane");
});

test("POST /sl/chat accepts token from query string and rejects bad secrets as plain text", async (t) => {
  const logs = [];
  const handledEvents = [];
  const previousBridgeKey = process.env.SL_BRIDGE_KEY;
  process.env.SL_BRIDGE_KEY = "query-bridge-key";
  t.after(() => {
    if (previousBridgeKey === undefined) {
      delete process.env.SL_BRIDGE_KEY;
    } else {
      process.env.SL_BRIDGE_KEY = previousBridgeKey;
    }
  });

  const server = createHealthServer({
    port: 0,
    logger: { info() {}, error() {}, warn() {} },
    appContext: {
      ready: true,
      config: { admin: { username: "owner", password: "secret" }, discord: {}, chat: { timezone: "UTC" }, features: {} },
      logger: { info(message) { logs.push(message); }, error() {}, warn() {} },
      secondLife: { available: true },
      secondLifeAdapter: {
        async handleEvent(payload) {
          handledEvents.push(payload);
          return { replyText: "query ok" };
        },
      },
    },
  });
  t.after(() => server.close());

  await new Promise((resolve) => server.on("listening", resolve));

  const accepted = await postRaw(
    server,
    "/sl/chat?token=query-bridge-key",
    "message=query%20hello",
    { "Content-Type": "application/x-www-form-urlencoded" },
  );
  assert.equal(accepted.statusCode, 200);
  assert.equal(accepted.body, "query ok");

  const denied = await postRaw(
    server,
    "/sl/chat?bridgeKey=wrong-key",
    "message=bad",
    { "Content-Type": "application/x-www-form-urlencoded" },
  );
  assert.equal(denied.statusCode, 401);
  assert.match(denied.headers["content-type"], /text\/plain/);
  assert.equal(denied.body, "unauthorized");
  assert.equal(handledEvents.length, 1);
  assert.ok(logs.some((message) => message.includes("[sl-bridge] auth accepted")));
  assert.ok(logs.some((message) => message.includes("[sl-bridge] auth denied")));
});
