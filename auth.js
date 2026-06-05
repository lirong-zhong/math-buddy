// ============================================================
// auth.js - password login helper
// Falls back to local password when the API is unavailable.
// ============================================================

const Auth = (() => {
  const STORAGE_KEY = 'mb_session';
  const LOCAL_PASSWORD = 'math2024';

  function isLoggedIn() {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return false;
    try {
      const data = JSON.parse(raw);
      if (!data?.ts) return false;
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
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      const resp = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'verify_password', password }),
        signal: controller.signal
      });
      clearTimeout(timeout);

      if (resp.ok) {
        const data = await resp.json();
        if (data.valid === true) {
          localStorage.setItem(STORAGE_KEY, JSON.stringify({ ts: Date.now() }));
          return true;
        }
        throw new Error('密码不正确，请再试一次');
      }
    } catch (error) {
      if (error?.message === '密码不正确，请再试一次') throw error;
      console.warn('API unavailable, using local password fallback');
    }

    if (password === LOCAL_PASSWORD) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ ts: Date.now() }));
      return true;
    }
    throw new Error('密码不正确，请再试一次');
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
