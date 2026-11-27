'use strict';
const test = require('node:test');
const assert = require('node:assert');
const g = require('../src/core/gemini');

const TOOLS = [
  { name: 'start_focus', description: 'Start a block', input_schema: { type: 'object', properties: { minutes: { type: 'integer', minimum: 1, maximum: 1440, description: 'Length' } }, required: ['minutes'], additionalProperties: false } },
  { type: 'web_search_20250305', name: 'web_search', max_uses: 3 },
];

test('a plain question becomes a Gemini request', () => {
  const r = g.toGemini({ model: 'x', max_tokens: 900, system: [{ type: 'text', text: 'You are Halyra.', cache_control: { type: 'ephemeral' } }], messages: [{ role: 'user', content: 'hi' }], tools: TOOLS });
  assert.equal(r.systemInstruction.parts[0].text, 'You are Halyra.');
  assert.deepEqual(r.contents, [{ role: 'user', parts: [{ text: 'hi' }] }]);
  assert.equal(r.generationConfig.maxOutputTokens, 900);
  assert.equal(r.tools[0].functionDeclarations[0].name, 'start_focus');
  assert.deepEqual(r.tools[1], { googleSearch: {} });
  // keys Gemini does not accept are dropped, the ones it needs survive
  const params = r.tools[0].functionDeclarations[0].parameters;
  assert.equal('additionalProperties' in params, false);
  assert.deepEqual(params.required, ['minutes']);
  assert.equal(params.properties.minutes.maximum, 1440);
});

test('a tool call and its result survive the round trip', () => {
  const msgs = [
    { role: 'user', content: 'block reddit for an hour' },
    { role: 'assistant', content: [{ type: 'text', text: 'On it.' }, { type: 'tool_use', id: 'abc123', name: 'start_focus', input: { minutes: 60 } }] },
    { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'abc123', content: '{"ok":true}' }] },
  ];
  const r = g.toGemini({ messages: msgs, tools: TOOLS, system: 'S' });
  assert.equal(r.contents.length, 3);
  assert.equal(r.contents[1].role, 'model');
  assert.deepEqual(r.contents[1].parts[1].functionCall, { name: 'start_focus', args: { minutes: 60 } });
  // Gemini answers a call by name, not by the id we gave it
  assert.deepEqual(r.contents[2].parts[0].functionResponse, { name: 'start_focus', response: { ok: true } });
});

test('a tool result that is not JSON still goes through', () => {
  const r = g.toGemini({ messages: [{ role: 'user', content: [{ type: 'tool_result', tool_use_id: 'zzz', name: 'get_status', content: 'not json' }] }] });
  assert.deepEqual(r.contents[0].parts[0].functionResponse, { name: 'get_status', response: { result: 'not json' } });
});

test('two turns from the same side are merged, empty ones dropped', () => {
  const r = g.toGemini({ messages: [
    { role: 'user', content: 'one' },
    { role: 'user', content: 'two' },
    { role: 'assistant', content: [] },
    { role: 'assistant', content: '   ' },
  ] });
  assert.deepEqual(r.contents, [{ role: 'user', parts: [{ text: 'one' }, { text: 'two' }] }]);
});

test("Gemini's answer becomes blocks the assistant loop understands", () => {
  const out = g.fromGemini({ candidates: [{ content: { parts: [{ text: 'Blocking now.' }, { functionCall: { name: 'start_focus', args: { minutes: 25 } } }] }, finishReason: 'STOP' }] });
  assert.equal(out.stop_reason, 'tool_use');
  assert.equal(out.content[0].text, 'Blocking now.');
  assert.equal(out.content[1].type, 'tool_use');
  assert.equal(out.content[1].name, 'start_focus');
  assert.deepEqual(out.content[1].input, { minutes: 25 });
  assert.ok(out.content[1].id, 'a call needs an id so its result can be matched to it');
});

test('a plain answer ends the turn, and web results come back as citations', () => {
  const out = g.fromGemini({ candidates: [{
    content: { parts: [{ text: 'It is 3 degrees.' }] },
    finishReason: 'STOP',
    groundingMetadata: { groundingChunks: [{ web: { uri: 'https://example.com/a', title: 'A' } }, { web: { uri: 'https://example.com/b' } }] },
  }] });
  assert.equal(out.stop_reason, 'end_turn');
  assert.deepEqual(out.content[0].citations, [
    { url: 'https://example.com/a', title: 'A' },
    { url: 'https://example.com/b', title: 'https://example.com/b' },
  ]);
});

test('an empty or blocked answer does not throw', () => {
  assert.deepEqual(g.fromGemini({}).content, []);
  assert.equal(g.fromGemini({}).stop_reason, 'end_turn');
  assert.equal(g.fromGemini({ promptFeedback: { blockReason: 'SAFETY' } }).blocked, true);
  assert.equal(g.fromGemini({ candidates: [{ content: { parts: [{ text: 'x' }] }, finishReason: 'MAX_TOKENS' }] }).stop_reason, 'max_tokens');
});
