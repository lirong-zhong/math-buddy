// ============================================================
// db.js — Supabase 数据库操作封装
// 依赖: config.js (window.__MB_CONFIG__), supabase CDN script
// ============================================================

const DB = (() => {
  let client = null;
  let userId = null;

  function init(uid) {
    userId = uid;
    const cfg = window.__MB_CONFIG__;
    client = supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);
  }

  function isReady() { return !!client; }

  // ── 练习记录 ──
  async function savePractice({ question, qType, userAnswer, isCorrect, errorTag, messages }) {
    if (!client) throw new Error('DB not initialized');
    const { error } = await client.from('practices').insert({
      user_id: userId,
      question,
      q_type: qType,
      user_answer: userAnswer || null,
      is_correct: isCorrect,
      error_tag: errorTag || null,
      messages: messages || []
    });
    if (error) throw error;
  }

  // ── 错题记录 ──
  async function saveErrorLog(question, errorTag) {
    if (!client) return;
    const { error } = await client.from('error_logs').insert({
      user_id: userId,
      question: question.substring(0, 100),
      error_tag: errorTag
    });
    if (error) console.warn('saveErrorLog failed:', error);
  }

  async function getErrorLogs(limit = 50) {
    if (!client) return [];
    const { data, error } = await client.from('error_logs')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) { console.warn('getErrorLogs failed:', error); return []; }
    return data;
  }

  async function getErrorStats() {
    if (!client) return {};
    const { data, error } = await client.from('error_logs')
      .select('error_tag')
      .eq('user_id', userId);
    if (error) return {};
    const counts = {};
    data.forEach(d => { counts[d.error_tag] = (counts[d.error_tag] || 0) + 1; });
    return counts;
  }

  // ── 题库 ──
  async function getQuestionBanks() {
    if (!client) return [];
    const { data, error } = await client.from('question_banks')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    if (error) { console.warn('getQuestionBanks failed:', error); return []; }
    return data;
  }

  async function saveQuestionBank(title, questions) {
    if (!client) throw new Error('DB not initialized');
    const { error } = await client.from('question_banks').insert({
      user_id: userId,
      title,
      questions
    });
    if (error) throw error;
  }

  async function deleteQuestionBank(id) {
    if (!client) return;
    const { error } = await client.from('question_banks').delete().eq('id', id);
    if (error) throw error;
  }

  // ── 用户统计 ──
  async function getStats() {
    if (!client) return { streak: 0, todayDone: 0, todayCorrect: 0, errorStats: {} };

    const today = new Date().toISOString().slice(0, 10);
    const { data: stats, error } = await client.from('user_stats')
      .select('*').eq('user_id', userId).maybeSingle();

    if (error || !stats) {
      await client.from('user_stats').insert({
        user_id: userId,
        streak: 0,
        today_done: 0,
        today_correct: 0,
        last_active_date: today
      });
      return { streak: 0, todayDone: 0, todayCorrect: 0, errorStats: await getErrorStats() };
    }

    if (stats.last_active_date !== today) {
      await client.from('user_stats').update({
        today_done: 0,
        today_correct: 0,
        last_active_date: today
      }).eq('user_id', userId);
    }

    const errorStats = await getErrorStats();
    const isToday = stats.last_active_date === today;
    return {
      streak: stats.streak || 0,
      todayDone: isToday ? (stats.today_done || 0) : 0,
      todayCorrect: isToday ? (stats.today_correct || 0) : 0,
      errorStats
    };
  }

  async function updateStats({ done, correct, streak }) {
    if (!client) return;
    const today = new Date().toISOString().slice(0, 10);
    const update = { last_active_date: today, updated_at: new Date().toISOString() };
    if (done !== undefined) update.today_done = done;
    if (correct !== undefined) update.today_correct = correct;
    if (streak !== undefined) update.streak = streak;

    const { error } = await client.from('user_stats').upsert(
      { user_id: userId, ...update },
      { onConflict: 'user_id' }
    );
    if (error) console.warn('updateStats failed:', error);
  }

  async function getTodayPractices() {
    if (!client) return [];
    const today = new Date().toISOString().slice(0, 10);
    const { data, error } = await client.from('practices')
      .select('*')
      .eq('user_id', userId)
      .gte('created_at', today)
      .order('created_at', { ascending: false });
    if (error) return [];
    return data;
  }

  return {
    init,
    isReady,
    savePractice,
    saveErrorLog,
    getErrorLogs,
    getErrorStats,
    getQuestionBanks,
    saveQuestionBank,
    deleteQuestionBank,
    getStats,
    updateStats,
    getTodayPractices
  };
})();
