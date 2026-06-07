// ============================================================
// EdgeOne Pages Edge Function: /api/chat
// 代理 DeepSeek API 调用，保护 API Key 安全
// 同时处理密码验证
// ============================================================

export default async function onRequest(context) {
  const { request, env } = context;

  // CORS
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  };

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  const body = await request.json().catch(() => ({}));
  const { action, password, system, user, max_tokens } = body;

  // ── 密码验证 ──
  if (action === 'verify_password') {
    const valid = password === env.APP_PASSWORD;
    return new Response(JSON.stringify({ valid }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  // ── DeepSeek 代理 ──
  if (action === 'chat') {
    const apiKey = env.DEEPSEEK_API_KEY;
    const model = env.DEEPSEEK_MODEL || 'deepseek-chat';

    if (!apiKey) {
      return new Response(JSON.stringify({ error: 'DeepSeek API key not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    try {
      const resp = await fetch('https://api.deepseek.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model,
          max_tokens: max_tokens || 1000,
          temperature: 0.4,
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: user }
          ]
        })
      });

      if (!resp.ok) {
        const text = await resp.text();
        return new Response(JSON.stringify({ error: text }), {
          status: resp.status,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      const data = await resp.json();
      const content = data?.choices?.[0]?.message?.content || '';
      return new Response(JSON.stringify({ content }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    } catch (e) {
      return new Response(JSON.stringify({ error: e.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
  }

  return new Response(JSON.stringify({ error: 'Unknown action' }), {
    status: 400,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
}
