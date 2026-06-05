const fs = require('fs');
const path = require('path');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://your-project.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'your-anon-key';

if (!process.env.SUPABASE_URL) {
  console.warn('⚠️  环境变量 SUPABASE_URL 未设置，使用占位值');
}
if (!process.env.SUPABASE_ANON_KEY) {
  console.warn('⚠️  环境变量 SUPABASE_ANON_KEY 未设置，使用占位值');
}

const content = `// 由 build.js 从环境变量自动生成
window.__MB_CONFIG__ = ${JSON.stringify({ SUPABASE_URL, SUPABASE_ANON_KEY }, null, 2)};
`;

fs.writeFileSync(path.join(__dirname, 'config.local.js'), content);
console.log('✅ config.local.js 已从环境变量生成');
