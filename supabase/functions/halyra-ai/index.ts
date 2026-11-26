// Halyra AI proxy (Supabase Edge Function).
// Lets signed-in users use Halyra AI without their own API key: checks the user's
// login, counts their messages per day (free / pro limits), and forwards the
// request to Anthropic with the project's key. The key never reaches the app.
//
// Deploy:  supabase functions deploy halyra-ai --project-ref <ref>
// Secrets: supabase secrets set ANTHROPIC_API_KEY=sk-ant-... [FREE_MONTHLY=10] [PRO_DAILY=50]
// Needs the SQL in docs/supabase-ai.sql (usage counter + plans).

const ANTHROPIC = 'https://api.anthropic.com/v1/messages';
const MODELS = new Set(['claude-sonnet-5-5', 'claude-haiku-5-5']);
const TOOL_NAMES = new Set(['get_status', 'start_focus', 'extend_focus', 'stop_focus', 'block_sites', 'unblock_sites', 'block_apps', 'create_list', 'create_schedule', 'set_schedule_enabled', 'set_daily_limit', 'set_grow', 'set_theme', 'get_stats']);

const cors = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, apikey, content-type',
  'access-control-allow-methods': 'POST, OPTIONS',
};
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'content-type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (req.method !== 'POST') return json(405, { error: 'method' });

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
  const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const KEY = Deno.env.get('ANTHROPIC_API_KEY');
  if (!KEY) return json(503, { error: 'AI is not configured on the server' });

  // 1. who is asking
  const auth = req.headers.get('authorization') || '';
  const userRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { authorization: auth, apikey: req.headers.get('apikey') || SERVICE } });
  if (!userRes.ok) return json(401, { error: 'sign in again' });
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
  if (!allowed || allowed.ok !== true) return json(429, { code: allowed && allowed.pro ? 'quota' : 'quotaFree', error: 'limit reached', limit: allowed && allowed.limit });

  // 3. forward a cleaned-up request
  let body: any;
  try { body = await req.json(); } catch { return json(400, { error: 'bad json' }); }
  const tools = (Array.isArray(body.tools) ? body.tools : []).filter((t: any) =>
    (t && TOOL_NAMES.has(t.name) && t.input_schema) || (t && t.type === 'web_search_20250305' && t.name === 'web_search'))
    .map((t: any) => (t.type === 'web_search_20250305' ? { type: t.type, name: t.name, max_uses: Math.min(3, Number(t.max_uses) || 3) } : t));
  const clean = {
    model: MODELS.has(body.model) ? body.model : 'claude-sonnet-5-5',
    max_tokens: Math.min(2000, Number(body.max_tokens) || 1200),
    system: typeof body.system === 'string' ? body.system.slice(0, 8000)
      : Array.isArray(body.system) ? body.system.filter((b: any) => b && b.type === 'text').slice(0, 4).map((b: any) => ({ type: 'text', text: String(b.text).slice(0, 8000), ...(b.cache_control ? { cache_control: { type: 'ephemeral' } } : {}) }))
        : undefined,
    messages: Array.isArray(body.messages) ? body.messages.slice(-40) : [],
    tools,
  };
  const res = await fetch(ANTHROPIC, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify(clean),
  });
  const text = await res.text();
  return new Response(text, { status: res.status, headers: { ...cors, 'content-type': 'application/json' } });
});
