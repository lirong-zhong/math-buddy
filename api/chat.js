// ============================================================
// /api/chat.js — Vercel Serverless Function
// 代理 DeepSeek API 调用，保护 API Key 安全
// 同时处理密码验证
// ============================================================

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { action, password, system, user, max_tokens } = req.body;

  // ── 密码验证 ──
  if (action === 'verify_password') {
    const valid = password === process.env.APP_PASSWORD;
    return res.status(200).json({ valid });
  }

  // ── DeepSeek 代理 ──
  if (action === 'chat') {
    const apiKey = process.env.DEEPSEEK_API_KEY;
    const model = process.env.DEEPSEEK_MODEL || 'deepseek-v4-flash';

    if (!apiKey) {
      return res.status(500).json({ error: 'DeepSeek API key not configured on server' });
    }

    try {
      const resp = await fetch('https://api.deepseek.com/chat/completions', {
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
        return res.status(resp.status).json({ error: text });
      }

      const data = await resp.json();
      const content = data?.choices?.[0]?.message?.content || '';
      return res.status(200).json({ content });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  return res.status(400).json({ error: 'Unknown action' });
}
