// ============================================================
// api.js — DeepSeek API 代理调用
// API Key 存在服务端（Vercel serverless function），不暴露给客户端
// ============================================================

const API = (() => {

  async function callDeepSeek(systemPrompt, userContent, maxTokens = 1000) {
    const resp = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'chat',
        system: systemPrompt,
        user: userContent,
        max_tokens: maxTokens
      })
    });
    if (!resp.ok) {
      const msg = await resp.text();
      throw new Error(`API error ${resp.status}: ${msg}`);
    }
    const data = await resp.json();
    return data.content || '';
  }

  async function verifyPassword(password) {
    const resp = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'verify_password', password })
    });
    if (!resp.ok) throw new Error('密码错误');
    const data = await resp.json();
    return data.valid === true;
  }

  return { callDeepSeek, verifyPassword };
})();
