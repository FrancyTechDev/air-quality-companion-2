import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import router from './ai.js';

const names = ['AI_PROVIDER', 'GROQ_API_KEY', 'XAI_API_KEY', 'OPENAI_API_KEY', 'AI_INTEGRATIONS_OPENAI_API_KEY', 'GROQ_BASE_URL', 'GROQ_MODEL'];
const previous = Object.fromEntries(names.map(name => [name, process.env[name]]));
let appServer, providerServer, base, providerBase, upstreamStatus, upstreamBody, providerCalls;

before(async () => {
  const provider = express();
  provider.use(express.json());
  provider.post('/chat/completions', (req, res) => {
    providerCalls++;
    res.status(upstreamStatus).json(upstreamBody);
  });
  providerServer = provider.listen(0, '127.0.0.1');
  await new Promise(resolve => providerServer.once('listening', resolve));
  providerBase = `http://127.0.0.1:${providerServer.address().port}`;
  const app = express();
  app.use(express.json());
  app.use('/ai', router);
  appServer = app.listen(0, '127.0.0.1');
  await new Promise(resolve => appServer.once('listening', resolve));
  base = `http://127.0.0.1:${appServer.address().port}`;
});

beforeEach(() => {
  names.forEach(name => delete process.env[name]);
  process.env.GROQ_API_KEY = 'test-only-key';
  process.env.GROQ_BASE_URL = providerBase;
  upstreamStatus = 200;
  upstreamBody = { choices: [{ message: { role: 'assistant', content: 'AI_OK' } }] };
  providerCalls = 0;
});

after(async () => {
  for (const name of names) {
    if (previous[name] === undefined) delete process.env[name];
    else process.env[name] = previous[name];
  }
  await Promise.all([appServer, providerServer].map(server => new Promise(resolve => server.close(resolve))));
});

const chat = (body = { messages: [{ role: 'user', content: 'test' }] }) => fetch(`${base}/ai/chat`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
});

test('chat uses the provider and returns its response', async () => {
  const response = await chat({ messages: [{ role: 'user', content: 'test' }], context: null });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).message.content, 'AI_OK');
  assert.equal(providerCalls, 1);
});

test('missing key returns an actionable 503 without calling a provider', async () => {
  delete process.env.GROQ_API_KEY;
  const response = await chat();
  assert.equal(response.status, 503);
  assert.equal((await response.json()).code, 'AI_NOT_CONFIGURED');
  assert.equal(providerCalls, 0);
});

test('provider authentication errors do not expose the upstream message', async () => {
  upstreamStatus = 401;
  upstreamBody = { error: { message: 'private provider error', type: 'authentication_error' } };
  const response = await chat();
  assert.equal(response.status, 502);
  const body = await response.json();
  assert.equal(body.code, 'AI_AUTH_FAILED');
  assert.ok(!JSON.stringify(body).includes('private provider error'));
});

test('rate limits return 429 without repeated billable requests', async () => {
  upstreamStatus = 429;
  upstreamBody = { error: { message: 'rate limit' } };
  const response = await chat();
  assert.equal(response.status, 429);
  assert.equal((await response.json()).code, 'AI_RATE_LIMIT');
  assert.equal(providerCalls, 1);
});

test('invalid messages are rejected before contacting the provider', async () => {
  const response = await chat({ messages: [null, { content: 123 }] });
  assert.equal(response.status, 400);
  assert.equal(providerCalls, 0);
});

test('empty completions are reported as errors', async () => {
  upstreamBody = { choices: [] };
  const response = await chat();
  assert.equal(response.status, 502);
  assert.equal((await response.json()).code, 'AI_EMPTY_RESPONSE');
});

test('status supports the standard OpenAI environment variable without exposing keys', async () => {
  delete process.env.GROQ_API_KEY;
  process.env.OPENAI_API_KEY = 'test-only-standard-key';
  const response = await fetch(`${base}/ai/status`);
  const body = await response.json();
  assert.equal(body.configured, true);
  assert.equal(body.provider, 'openai');
  assert.ok(!JSON.stringify(body).includes('test-only-standard-key'));
});
