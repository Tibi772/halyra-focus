// Halyra AI proxy (Supabase Edge Function).
//
// Lets signed-in users use Halyra AI without their own API key: it checks the
// user's login, counts their messages against the free/pro allowance, and
// forwards the request to Google Gemini with the project's key, which never
// reaches the app.
//
// The app sends a request that is already in Gemini's shape (src/core/gemini.js
// does the translation on the client), so this is a forwarder with a gate on
// it, not a second place where the format is understood. It still refuses to
// pass anything through unchecked: the model has to be one of ours, the size is
// capped, and only tools the app actually declares are allowed.
//
// Secrets: GEMINI_API_KEY=AIza... [FREE_MONTHLY=10] [PRO_DAILY=50]
// Needs the SQL in docs/supabase-ai.sql (usage counter + plans).

const GOOGLE = 'https://generativelanguage.googleapis.com/v1beta/models';
const MODELS = new Set(['gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-2.5-pro']);
const TOOL_NAMES = new Set([
  'get_status', 'start_focus', 'extend_focus', 'stop_focus', 'block_sites', 'unblock_sites',
  'block_apps', 'create_list', 'create_schedule', 'set_schedule_enabled', 'set_daily_limit',
  'set_grow', 'set_theme', 'get_stats', 'get_weather', 'get_time', 'customize_app',
  'remember_about_me', 'get_level',
]);

const cors = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, apikey, content-type',
  'access-control-allow-methods': 'POST, OPTIONS',
};
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'content-type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (req.method !== 'POST') return json(405, { error: 'method' });

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
  const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const KEY = Deno.env.get('GEMINI_API_KEY') || Deno.env.get('GOOGLE_API_KEY');
  if (!KEY) return json(503, { error: { message: 'AI is not configured on the server' } });

  // 1. who is asking
  const auth = req.headers.get('authorization') || '';
  const userRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { authorization: auth, apikey: req.headers.get('apikey') || SERVICE },
  });
  if (!userRes.ok) return json(401, { error: { message: 'sign in again' } });
  const user = await userRes.json();

  // 2. allowance (atomic counter in the database): free = per month, pro = per day
  const free = Number(Deno.env.get('FREE_MONTHLY') || 10);
  const pro = Number(Deno.env.get('PRO_DAILY') || 50);
  const bump = await fetch(`${SUPABASE_URL}/rest/v1/rpc/halyra_ai_bump`, {
    method: 'POST',
    headers: { apikey: SERVICE, authorization: `Bearer ${SERVICE}`, 'content-type': 'application/json' },
    body: JSON.stringify({ uid: user.id, free_limit: free, pro_limit: pro }),
  });
  const allowed = bump.ok ? await bump.json() : null;
  if (!allowed || allowed.ok !== true) {
    return json(429, { code: allowed && allowed.pro ? 'quota' : 'quotaFree', error: { message: 'limit reached' }, limit: allowed && allowed.limit });
  }

  // 3. forward a cleaned-up request
  let body: any;
  try { body = await req.json(); } catch { return json(400, { error: { message: 'bad json' } }); }

  const model = MODELS.has(body.model) ? body.model : 'gemini-2.5-flash';
  const tools: any[] = [];
  for (const t of Array.isArray(body.tools) ? body.tools : []) {
    if (!t) continue;
    if (t.googleSearch) { tools.push({ googleSearch: {} }); continue; }
    const fns = (Array.isArray(t.functionDeclarations) ? t.functionDeclarations : [])
      .filter((f: any) => f && TOOL_NAMES.has(f.name))
      .slice(0, 40);
    if (fns.length) tools.push({ functionDeclarations: fns });
  }

  const sys = body.systemInstruction;
  const clean: Record<string, unknown> = {
    contents: Array.isArray(body.contents) ? body.contents.slice(-60) : [],
    generationConfig: {
      maxOutputTokens: Math.min(4096, Number(body.generationConfig?.maxOutputTokens) || 1600),
      temperature: Math.min(2, Math.max(0, Number(body.generationConfig?.temperature ?? 0.7))),
    },
  };
  if (sys && Array.isArray(sys.parts)) {
    clean.systemInstruction = { parts: sys.parts.slice(0, 4).map((p: any) => ({ text: String(p?.text ?? '').slice(0, 8000) })) };
  }
  if (tools.length) clean.tools = tools;

  const res = await fetch(`${GOOGLE}/${encodeURIComponent(model)}:generateContent`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-goog-api-key': KEY },
    body: JSON.stringify(clean),
  });
  const text = await res.text();
  return new Response(text, { status: res.status, headers: { ...cors, 'content-type': 'application/json' } });
});
