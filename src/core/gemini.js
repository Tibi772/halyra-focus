'use strict';
// Talking to Gemini while the rest of the app keeps its own shape.
//
// Everything above this file — the assistant loop, the tool list, the chat
// history — speaks in blocks: a message is text, a tool call, or a tool result.
// Gemini wants `contents` with `parts`, functions declared separately, and tool
// results addressed by tool *name* rather than by call id. Rather than spread
// that difference through the app, it lives here: `toGemini` on the way out,
// `fromGemini` on the way back, and nothing else has to know which model
// answered. Pure functions, so the conversion is tested without a network.

/** Gemini rejects schemas with keys it does not know, so only the ones it takes survive. */
const SCHEMA_KEYS = ['type', 'format', 'description', 'nullable', 'enum', 'items', 'properties', 'required', 'minimum', 'maximum'];

function cleanSchema(node) {
  if (!node || typeof node !== 'object') return node;
  if (Array.isArray(node)) return node.map(cleanSchema);
  const out = {};
  for (const k of SCHEMA_KEYS) {
    if (!(k in node)) continue;
    if (k === 'properties') {
      const props = {};
      for (const [name, v] of Object.entries(node[k] || {})) props[name] = cleanSchema(v);
      if (Object.keys(props).length) out[k] = props;
    } else if (k === 'items') out[k] = cleanSchema(node[k]);
    else out[k] = node[k];
  }
  // An object with no properties is invalid for Gemini; a bare type is fine.
  if (out.type === 'object' && !out.properties) delete out.required;
  return out;
}

const textOf = (c) => (typeof c === 'string' ? c : '');

/**
 * Our request shape → Gemini's. `body` is {model, max_tokens, system, tools, messages},
 * where system may be a string or a list of text blocks (the cache markers we
 * send to other providers are simply dropped: Gemini caches on its own).
 */
function toGemini(body) {
  const system = Array.isArray(body.system)
    ? body.system.map((b) => (b && b.text) || '').filter(Boolean).join('\n\n')
    : String(body.system || '');

  // A tool result carries the id of the call it answers; Gemini wants the name,
  // so remember what each id was called as the history is walked.
  const nameOfId = new Map();
  const contents = [];
  for (const m of body.messages || []) {
    const role = m.role === 'assistant' ? 'model' : 'user';
    const parts = [];
    if (typeof m.content === 'string') {
      if (m.content.trim()) parts.push({ text: m.content });
    } else {
      for (const b of m.content || []) {
        if (!b) continue;
        if (b.type === 'text' && String(b.text || '').trim()) parts.push({ text: b.text });
        else if (b.type === 'tool_use') {
          nameOfId.set(b.id, b.name);
          parts.push({ functionCall: { name: b.name, args: b.input || {} } });
        } else if (b.type === 'tool_result') {
          const name = nameOfId.get(b.tool_use_id) || b.name || 'tool';
          let response;
          try { response = JSON.parse(textOf(b.content)); } catch (_) { response = { result: textOf(b.content) }; }
          if (!response || typeof response !== 'object' || Array.isArray(response)) response = { result: response };
          parts.push({ functionResponse: { name, response } });
        }
      }
    }
    if (!parts.length) continue;
    // Gemini wants the sides to alternate; merge anything that would repeat.
    const last = contents[contents.length - 1];
    if (last && last.role === role) last.parts.push(...parts);
    else contents.push({ role, parts });
  }

  const fns = [];
  let wantsSearch = false;
  for (const t of body.tools || []) {
    if (!t) continue;
    if (t.type === 'web_search_20250305' || t.googleSearch || t.name === 'web_search') { wantsSearch = true; continue; }
    if (!t.name) continue;
    fns.push({ name: t.name, description: t.description || '', parameters: cleanSchema(t.input_schema || { type: 'object' }) });
  }
  const tools = [];
  if (fns.length) tools.push({ functionDeclarations: fns });
  if (wantsSearch) tools.push({ googleSearch: {} });

  const out = {
    contents,
    generationConfig: { maxOutputTokens: Math.min(8192, Number(body.max_tokens) || 1600), temperature: 0.7 },
  };
  if (system) out.systemInstruction = { parts: [{ text: system }] };
  if (tools.length) out.tools = tools;
  return out;
}

/**
 * Gemini's answer → our blocks. Web results arrive as grounding metadata rather
 * than inline citations, so they are attached to the first piece of text, which
 * is where the rest of the app looks for them.
 */
function fromGemini(data) {
  const cand = (data && Array.isArray(data.candidates) && data.candidates[0]) || null;
  const parts = (cand && cand.content && Array.isArray(cand.content.parts) && cand.content.parts) || [];
  const content = [];
  let calls = 0;
  for (const p of parts) {
    if (!p) continue;
    if (typeof p.text === 'string' && p.text) content.push({ type: 'text', text: p.text });
    else if (p.functionCall && p.functionCall.name) {
      calls += 1;
      content.push({
        type: 'tool_use',
        id: `call_${calls}_${p.functionCall.name}`,
        name: p.functionCall.name,
        input: p.functionCall.args || {},
      });
    }
  }

  const chunks = (cand && cand.groundingMetadata && cand.groundingMetadata.groundingChunks) || [];
  const citations = [];
  for (const c of chunks) {
    const w = (c && (c.web || c.retrievedContext)) || null;
    if (w && w.uri) citations.push({ url: w.uri, title: w.title || w.uri });
  }
  if (citations.length) {
    const firstText = content.find((b) => b.type === 'text');
    if (firstText) firstText.citations = citations;
    else content.push({ type: 'text', text: '', citations });
  }

  const finish = String((cand && cand.finishReason) || '');
  return {
    content,
    stop_reason: calls ? 'tool_use' : finish === 'MAX_TOKENS' ? 'max_tokens' : 'end_turn',
    blocked: !cand && Boolean(data && data.promptFeedback && data.promptFeedback.blockReason),
  };
}

module.exports = { toGemini, fromGemini, cleanSchema };
