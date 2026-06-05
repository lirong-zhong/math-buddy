// ============================================================
// auth.js — 密码登录
// 支持两种模式：服务端密码验证（生产）+ 本地密码验证（回退）
// ============================================================

const Auth = (() => {
  const STORAGE_KEY = 'mb_session';
  // 本地回退密码：当 Vercel API 不可用时使用
  const LOCAL_PASSWORD = 'math2024';

  function isLoggedIn() {
    const s = localStorage.getItem(STORAGE_KEY);
    if (!s) return false;
    try {
      const data = JSON.parse(s);
      if (Date.now() - data.ts > 7 * 24 * 60 * 60 * 1000) {
        localStorage.removeItem(STORAGE_KEY);
        return false;
      }
      return true;
    } catch {
      return false;
    }
  }

  async function login(password) {
    // 先尝试通过后端 API 验证
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      const r = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'verify_password', password }),
        signal: controller.signal
      });
      clearTimeout(timeout);
      if (r.ok) {
        const data = await r.json();
        if (data.valid) {
          localStorage.setItem(STORAGE_KEY, JSON.stringify({ ts: Date.now() }));
          return true;
        }
        throw new Error('密码不正确，再试一次');
      }
    } catch (e) {
      // 区分密码错误和网络错误
      if (e.message === '密码不正确，再试一次') throw e;
      console.warn('API unavailable, trying local password fallback');
    }

    // 回退：本地密码验证（当 Vercel API 不可用时）
    if (password === LOCAL_PASSWORD) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ ts: Date.now() }));
      return true;
    }
    throw new Error('密码不正确，再试一次');
  }

  function logout() {
    localStorage.removeItem(STORAGE_KEY);
    location.reload();
  }

  function getUserId() {
    return 'math-buddy-user';
  }

  return { isLoggedIn, login, logout, getUserId };
})();