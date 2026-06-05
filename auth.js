// ============================================================
// auth.js — 简单的密码登录，不依赖 Supabase Auth
// 家长在环境变量中设置 APP_PASSWORD，小朋友用这个密码登录
// ============================================================

const Auth = (() => {
  const STORAGE_KEY = 'mb_session';

  function isLoggedIn() {
    const s = localStorage.getItem(STORAGE_KEY);
    if (!s) return false;
    try {
      const data = JSON.parse(s);
      // Session 7天过期
      if (Date.now() - data.ts > 7 * 24 * 60 * 60 * 1000) {
        localStorage.removeItem(STORAGE_KEY);
        return false;
      }
      return true;
    } catch {
      return false;
    }
  }

  function login(password) {
    // 通过后端 API 验证密码
    return fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'verify_password', password })
    }).then(r => {
      if (!r.ok) throw new Error('密码错误');
      return r.json();
    }).then(data => {
      if (data.valid) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ ts: Date.now() }));
        return true;
      }
      throw new Error('密码错误');
    });
  }

  function logout() {
    localStorage.removeItem(STORAGE_KEY);
    location.reload();
  }

  function getUserId() {
    // 简单方案：用固定 ID，因为我们通过共享密码保护
    return 'math-buddy-user';
  }

  return { isLoggedIn, login, logout, getUserId };
})();
