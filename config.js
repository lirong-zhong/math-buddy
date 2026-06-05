// ============================================================
// config.js — 部署时加载真实的 config.local.js（不提交到 git）
// ============================================================
(function() {
  var s = document.createElement('script');
  s.src = '/config.local.js';
  s.onerror = function() {
    console.warn('config.local.js not found, using placeholder');
    window.__MB_CONFIG__ = {
      SUPABASE_URL: 'https://your-project.supabase.co',
      SUPABASE_ANON_KEY: 'your-anon-key'
    };
  };
  document.head.appendChild(s);
})();
