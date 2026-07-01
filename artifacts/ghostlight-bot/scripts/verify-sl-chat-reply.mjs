import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { handleSecondLifeApiRequest } from '../src/http/secondLifeApi.js';

const fallbackText = 'SL bridge reached Dante, but no assistant text was produced.';
const bridgeKey = process.env.SL_BRIDGE_KEY || process.env.SL_BRIDGE_TOKEN || 'test-sl-bridge-key';
process.env.SL_BRIDGE_KEY = bridgeKey;

function makeReq(body) {
  const req = Readable.from([Buffer.from(JSON.stringify(body))]);
  req.method = 'POST';
  req.headers = { 'content-type': 'application/json' };
  return req;
}

function makeRes() {
  return {
    statusCode: null,
    headers: null,
    body: '',
    writeHead(statusCode, headers) {
      this.statusCode = statusCode;
      this.headers = headers;
    },
    end(chunk = '') {
      this.body += String(chunk);
    },
  };
}

const observed = {};
const req = makeReq({
  bridgeKey,
  token: bridgeKey,
  companionId: 'dante',
  avatarName: 'pipsqueak0 Resident',
  avatarKey: '00000000-0000-0000-0000-000000000666',
  message: 'Dante do you know where you are?',
});
const res = makeRes();

await handleSecondLifeApiRequest({
  req,
  res,
  url: new URL('http://localhost/sl/chat'),
  context: {
    logger: { info() {}, warn() {}, error() {} },
    config: {},
    secondLife: { available: true },
    companion: {
      async generateCompanionReplyText(args) {
        Object.assign(observed, args);
        return { reply: 'Aye. I am in Second Life, answering from Dante0Solvane.' };
      },
    },
  },
});

assert.equal(res.statusCode, 200);
assert.ok(res.body.trim().length > 0, 'response body should be non-empty');
assert.notEqual(res.body, fallbackText, 'response body should not be fallback debug text');
assert.equal(observed.companionId, 'dante_sølvane');
assert.equal(observed.userExternalId, 'secondlife:00000000-0000-0000-0000-000000000666');
assert.equal(observed.userName, 'pipsqueak0 Resident');
assert.equal(observed.source, 'secondlife');
assert.equal(observed.channel, 'secondlife');
assert.equal(observed.context.slAvatarUsername, 'Dante0Solvane');
console.log('[verify-sl-chat-reply] ok');
