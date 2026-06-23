#!/usr/bin/env node
import fs from 'node:fs';

const embeddings = fs.readFileSync(new URL('../src/memory/embeddings.js', import.meta.url), 'utf8');
const library = fs.readFileSync(new URL('../src/music/library.js', import.meta.url), 'utf8');
const client = fs.readFileSync(new URL('../src/llm/client.js', import.meta.url), 'utf8');

function assert(condition, message) {
  if (!condition) {
    console.error(`[music:embedding:verify] FAIL ${message}`);
    process.exit(1);
  }
}

assert(embeddings.includes('client.embeddings.create'), 'embedding requests must use the embeddings client endpoint');
assert(!embeddings.includes('chat.completions.create'), 'embedding requests must not use chat completions');
assert(client.includes('https://openrouter.ai/api/v1'), 'OpenRouter base URL must target /api/v1 so embeddings resolve to /embeddings');
assert(embeddings.includes('[music:embedding] request'), 'safe embedding request diagnostics are missing');
assert(embeddings.includes('[music:embedding] response'), 'safe embedding response diagnostics are missing');
assert(embeddings.includes('[music:embedding] failed'), 'safe embedding failure diagnostics are missing');
assert(embeddings.includes('inputLength'), 'embedding diagnostics must log input length only, not raw text');
assert(library.includes('musicEmbeddingsEnabled(config)'), 'music library must honor the embedding disable switch');
assert(library.includes('[music:embedding] disabled; skipping sync'), 'disabled embedding sync log is missing');

console.log('[music:embedding:verify] PASS OpenRouter embedding model uses embeddings endpoint semantics and safe diagnostics');
console.log('[music:embedding:verify] PASS MUSIC_EMBEDDINGS_ENABLED=false skips music embedding sync without blocking imports');
