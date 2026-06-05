// ============================================================
// app.js — 数学搭档 主应用逻辑
// ============================================================

const App = (() => {
  // ── State ──
  const state = {
    questions: [],
    currentQ: 0,
    practiceStep: 1,
    messages: [],
    errorLog: [],        // 本次 session 的错因记录
    sessionStats: { done: 0, correct: 0, saved: 0 },
    streak: 0,
    thoughtSent: false,
    selectedError: null,
    isRecording: false,
    recognition: null,
    customQuestion: null
  };

  // ── Greetings ──
  const greetings = ['你好！今天也来做题了，很棒！', '欢迎回来！准备好了吗？', '今天也一起加油！'];

  // ── Init ──
  async function init() {
    document.getElementById('greetText').textContent = greetings[Math.floor(Math.random() * greetings.length)];

    // Load stats from Supabase
    try {
      const stats = await DB.getStats();
      state.streak = stats.streak;
      state.sessionStats.done = stats.todayDone;
      state.sessionStats.correct = stats.todayCorrect;
      updateSidebarStats();
      updateErrorSummaryFromData(stats.errorStats || {});
      document.getElementById('statStreak').textContent = state.streak;
    } catch (e) {
      console.warn('Failed to load stats:', e);
    }
  }

  // ── View switching ──
  function showView(v) {
    ['home','practice','upload','history','result','qbank'].forEach(x => {
      const el = document.getElementById('view-'+x);
      if (el) el.classList.toggle('hidden', x !== v);
    });
    ['nav-home','nav-practice','nav-history','nav-qbank'].forEach(x => {
      const el = document.getElementById(x);
      if (el) el.classList.remove('active');
    });
    if (v === 'home') document.getElementById('nav-home').classList.add('active');
    if (v === 'practice') document.getElementById('nav-practice').classList.add('active');
    if (v === 'history') { document.getElementById('nav-history').classList.add('active'); renderHistory(); }
    if (v === 'qbank') { document.getElementById('nav-qbank').classList.add('active'); renderQBank(); }
  }

  // ── Start daily practice ──
  async function startDaily() {
    showView('practice');
    document.getElementById('practiceTitle').textContent = '今日练习';
    document.getElementById('sessionBadge').classList.remove('hidden');
    state.messages = [];
    state.currentQ = 0;
    state.sessionStats = { done: 0, correct: 0, saved: 0 };
    state.customQuestion = null;
    state.errorLog = [];
    renderMessages();
    await generateQuestions();
  }

  // ── Start with custom question ──
  async function startWithCustom(text) {
    if (!text) { alert('请先输入题目内容'); return; }
    state.customQuestion = text;
    state.questions = [{ text, type: '自定义题目', answer: null }];
    state.currentQ = 0;
    state.messages = [];
    state.errorLog = [];
    state.sessionStats = { done: 0, correct: 0, saved: 0 };
    showView('practice');
    document.getElementById('practiceTitle').textContent = '老师的题目';
    loadQuestion(0);
  }

  // ── Start with question bank ──
  function startWithQBank(qbank) {
    state.questions = qbank.questions;
    state.currentQ = 0;
    state.messages = [];
    state.errorLog = [];
    state.sessionStats = { done: 0, correct: 0, saved: 0 };
    state.customQuestion = null;
    showView('practice');
    document.getElementById('practiceTitle').textContent = qbank.title;
    loadQuestion(0);
  }

  // ── Generate questions via DeepSeek ──
  async function generateQuestions() {
    document.getElementById('questionText').textContent = '正在出题，稍等一下…';
    document.getElementById('questionHint').textContent = '';
    try {
      const raw = await API.callDeepSeek(
        `你是一个五年级数学出题助手。请出4道适合五年级的数学题，难度适中，涵盖：应用题（含方程）、分数运算、几何计算、混合运算。
要求：每道题目清晰，有实际生活场景，不要太难也不要太简单（80-90分水平）。
输出格式为JSON数组，每项有：text（题目文字）、type（题目类型）、answer（参考答案，字符串）。
只输出JSON数组，不要任何其他文字或markdown。`,
        '请出4道五年级数学练习题',
        1000
      );
      const clean = raw.replace(/```json|```/g,'').trim();
      state.questions = JSON.parse(clean);
    } catch(e) {
      console.warn('AI generate failed, using fallback:', e);
      state.questions = [
        { text: '小明有一些糖果，他把糖果的3/5分给了同学，还剩24颗。小明原来有多少颗糖果？', type: '方程应用题', answer: '60颗' },
        { text: '一个长方形的周长是48厘米，长是宽的3倍，求这个长方形的面积。', type: '几何计算', answer: '108平方厘米' },
        { text: '学校图书馆有360本书，科技类占1/4，文学类占5/12，其余是其他类。其他类有多少本？', type: '分数应用题', answer: '120本' },
        { text: '甲乙两人同时从A地出发去B地，甲每小时走4千米，乙每小时走6千米，乙到达B地后立即返回，在距B地3千米处遇到甲。A、B两地相距多少千米？', type: '行程问题', answer: '9千米' }
      ];
    }
    updateProgress();
    loadQuestion(0);
  }

  // ── Load a question ──
  function loadQuestion(idx) {
    const q = state.questions[idx];
    if (!q) return;
    document.getElementById('qType').textContent = q.type;
    document.getElementById('questionText').textContent = q.text;
    document.getElementById('questionHint').textContent = '提示：先圈出"求什么"，再划出关键数字';
    document.getElementById('sessionNum').textContent = idx + 1;

    state.thoughtSent = false;
    state.selectedError = null;
    state.messages = [];
    renderMessages();

    document.getElementById('answerSection').style.display = 'none';
    document.getElementById('errorSection').style.display = 'none';
    const answerInput = document.getElementById('answerInput');
    answerInput.value = '';
    answerInput.className = 'answer-input';
    document.getElementById('nextBtn').disabled = true;
    document.querySelectorAll('.error-tag').forEach(t => t.classList.remove('selected'));

    setStep(1);
    updateProgress();

    addMessage('ai', `这道${q.type}，你先看一看题目，然后告诉我：<br>① 这题<span class="highlight">求什么</span>？<br>② 题目里给了哪些<span class="highlight">关键数字或条件</span>？<br><br>不用担心对不对，想到什么说什么就行。`);
  }

  function updateProgress() {
    const total = state.questions.length;
    const done = state.currentQ;
    const pct = total ? (done / total * 100) : 0;
    document.getElementById('progressFill').style.width = pct + '%';
    document.getElementById('qCounter').textContent = `${done} / ${total}`;
  }

  function setStep(n) {
    state.practiceStep = n;
    for(let i=1;i<=4;i++){
      const el = document.getElementById('step'+i);
      el.className = 'step' + (i < n ? ' done' : i === n ? ' active' : '');
    }
  }

  // ── Messages ──
  function addMessage(role, html) {
    state.messages.push({ role, html });
    renderMessages();
  }

  function renderMessages() {
    const container = document.getElementById('messages');
    container.innerHTML = state.messages.map(m => `
      <div class="msg ${m.role === 'user' ? 'user' : ''}">
        <div class="msg-avatar">${m.role === 'user' ? '' : ''}</div>
        <div class="msg-bubble">${m.html}</div>
      </div>
    `).join('');
    container.scrollTop = container.scrollHeight;
  }

  function showLoading() {
    state.messages.push({ role: 'ai', html: '<div class="loading"><div class="dot"></div><div class="dot"></div><div class="dot"></div></div>' });
    renderMessages();
  }

  function removeLoading() {
    if (state.messages.length && state.messages[state.messages.length-1].html.includes('loading')) {
      state.messages.pop();
    }
  }

  // ── Send thought ──
  async function sendThought() {
    const input = document.getElementById('chatInput');
    const text = input.value.trim();
    if (!text) return;
    input.value = '';

    addMessage('user', text);
    setStep(2);
    showLoading();

    const q = state.questions[state.currentQ];
    try {
      const reply = await API.callDeepSeek(
        `你是一个温和耐心的数学学习搭档，专门帮助五年级小朋友建立解题思路。
你的角色不是直接告诉答案，而是：
1. 先肯定孩子说的思路中正确的部分（一定要先肯定）
2. 如果思路有偏差，温和地引导，不批评
3. 帮孩子梳理解题步骤，特别强调"先看求什么，再找条件"
4. 如果涉及方程，先承认算术法也对，然后引导"我们把你的想法翻译成方程格式"
5. 回复要简洁，用口语，不要说教
6. 最后告诉孩子：思路梳理好了，现在可以动笔写答案了
用HTML格式回复，可以用<span class="highlight">文字</span>高亮关键词，可以用<ul><li>列表。`,
        `题目：${q.text}\n\n孩子的思路：${text}\n\n请帮他梳理思路。`,
        1000
      );
      removeLoading();
      addMessage('ai', reply);
      setStep(3);
      state.thoughtSent = true;
      document.getElementById('answerSection').style.display = 'block';
    } catch(e) {
      removeLoading();
      addMessage('ai', '网络好像有点问题，但没关系！你的思路说完了吗？准备好就可以写答案了。');
      state.thoughtSent = true;
      document.getElementById('answerSection').style.display = 'block';
      setStep(3);
    }
  }

  // ── Submit answer ──
  async function submitAnswer() {
    const ans = document.getElementById('answerInput').value.trim();
    if (!ans) { alert('先写下你的答案'); return; }

    const q = state.questions[state.currentQ];
    const answerInput = document.getElementById('answerInput');
    showLoading();
    setStep(4);

    try {
      const reply = await API.callDeepSeek(
        `你是数学答案评判助手。判断孩子的答案是否正确。
如果正确：热情鼓励，说一句"这道题你掌握了！" 回复里必须包含"正确"两个字。
如果错误：回复里包含"不对"两个字，温和指出哪里不对，不要直接给答案，给一个提示让孩子再想想。
回复简短，口语化，用HTML。可以用<span class="highlight">高亮关键信息。`,
        `题目：${q.text}\n参考答案：${q.answer}\n孩子的答案：${ans}\n\n请判断对错并给反馈。`,
        800
      );
      removeLoading();

      const isCorrect = reply.includes('正确') && !reply.includes('不对');
      answerInput.className = 'answer-input ' + (isCorrect ? 'correct' : 'wrong');
      addMessage('ai', reply);

      if (isCorrect) { state.sessionStats.correct++; state.sessionStats.saved++; }
      state.sessionStats.done++;
      updateSidebarStats();

      // Save to Supabase
      try {
        await DB.savePractice({
          question: q.text,
          qType: q.type,
          userAnswer: ans,
          isCorrect,
          errorTag: null,
          messages: state.messages
        });
        await DB.updateStats({
          done: state.sessionStats.done,
          correct: state.sessionStats.correct,
          streak: state.streak
        });
      } catch (dbErr) { console.warn('save practice failed:', dbErr); }

      document.getElementById('answerSection').style.display = 'none';
      document.getElementById('errorSection').style.display = 'block';

    } catch(e) {
      removeLoading();
      addMessage('ai', '没能连上网络，但不要紧！下一题继续。');
      document.getElementById('answerSection').style.display = 'none';
      document.getElementById('errorSection').style.display = 'block';
      state.sessionStats.done++;
      updateSidebarStats();
    }
  }

  // ── Error tagging ──
  function tagError(el, code) {
    document.querySelectorAll('.error-tag').forEach(t => t.classList.remove('selected'));
    el.classList.add('selected');
    state.selectedError = code;
    document.getElementById('nextBtn').disabled = false;

    const q = state.questions[state.currentQ];
    state.errorLog.push({
      q: q.text.substring(0, 40) + (q.text.length > 40 ? '…' : ''),
      type: code,
      time: new Date().toLocaleDateString()
    });

    // Save error log to Supabase
    DB.saveErrorLog(q.text, code).catch(e => console.warn('save error failed:', e));

    updateErrorSummary();
  }

  // ── Next question ──
  function nextQuestion() {
    state.currentQ++;
    if (state.currentQ >= state.questions.length) {
      showResult();
      return;
    }
    loadQuestion(state.currentQ);
  }

  // ── Show result ──
  function showResult() {
    showView('result');
    const { done, correct, saved } = state.sessionStats;
    const pct = done ? Math.round(correct/done*100) : 0;

    let emoji = '', title = '今天做完了！', sub = '';
    if (pct >= 80) { emoji=''; title='太棒了！'; sub='大部分题你都做对了，继续保持！'; }
    else if (pct >= 60) { emoji=''; title='做得不错！'; sub='还有几道题有小失误，看看错因记录。'; }
    else { emoji=''; title='今天有点难，没关系！'; sub='重要的是你说出了思路，这就是进步。'; }

    if (done > 0) {
      state.streak++;
      DB.updateStats({ streak: state.streak }).catch(() => {});
      document.getElementById('statStreak').textContent = state.streak;
    }

    document.getElementById('resultEmoji').textContent = emoji;
    document.getElementById('resultTitle').textContent = title;
    document.getElementById('resultSub').textContent = sub;
    document.getElementById('rDone').textContent = done;
    document.getElementById('rCorrect').textContent = correct;
    document.getElementById('rSaved').textContent = saved;

    const breakdown = buildErrorBreakdown();
    document.getElementById('errorBreakdown').innerHTML = breakdown;
  }

  function buildErrorBreakdown() {
    const map = { A:' 看漏条件', B:' 计算错', C:' 抄错数字', D:' 方法不对', E:' 单位/格式', F:' 做对了' };
    const counts = {};
    state.errorLog.forEach(e => { counts[e.type] = (counts[e.type]||0)+1; });
    if (!Object.keys(counts).length) return '<div style="color:var(--text-muted)">暂无错题记录</div>';
    const sorted = Object.entries(counts).sort((a,b) => b[1]-a[1]);
    let html = '<strong style="font-size:13px;">今日错误类型</strong><br>';
    sorted.forEach(([k,v]) => {
      html += `<span style="display:inline-block;margin-right:12px;">${map[k] || k}: <strong>${v}</strong> 次</span>`;
    });
    const top = sorted[0];
    if (top && top[0] !== 'F') {
      const tips = { A:'下次先圈出题目里的每个条件再动笔', B:'做完后挑一道重算一遍', C:'抄数字前再看一眼原题', D:'遇到不熟的类型先说思路', E:'写答案时检查一下单位' };
      html += `<br><span style="color:var(--primary);font-size:13px;"> 重点改进：${tips[top[0]] || ''}</span>`;
    }
    return html;
  }

  function updateSidebarStats() {
    document.getElementById('statDone').textContent = state.sessionStats.done;
    document.getElementById('statCorrect').textContent = state.sessionStats.correct;
    document.getElementById('statSaved').textContent = state.sessionStats.saved;
  }

  function updateErrorSummaryFromData(errorStats) {
    const map = { A:'看漏条件', B:'计算错', C:'抄错数字', D:'方法不对', E:'单位/格式', F:'做对了' };
    const entries = Object.entries(errorStats);
    if (!entries.length) { document.getElementById('errorSummary').textContent = '暂无记录'; return; }
    const sorted = entries.sort((a,b)=>b[1]-a[1]).slice(0, 3);
    document.getElementById('errorSummary').innerHTML = sorted.map(([k,v]) =>
      `<span style="display:block;">${map[k]||k}：<strong style="color:var(--primary);">${v}次</strong></span>`
    ).join('');
  }

  async function updateErrorSummary() {
    try {
      const stats = await DB.getErrorStats();
      updateErrorSummaryFromData(stats);
    } catch (e) {
      // fallback to session data
      const map = { A:'看漏条件', B:'计算错', C:'抄错数字', D:'方法不对', E:'单位/格式', F:'做对了' };
      const counts = {};
      state.errorLog.forEach(e => { counts[e.type] = (counts[e.type]||0)+1; });
      if (!Object.keys(counts).length) { document.getElementById('errorSummary').textContent = '暂无记录'; return; }
      const sorted = Object.entries(counts).sort((a,b)=>b[1]-a[1]).slice(0,3);
      document.getElementById('errorSummary').innerHTML = sorted.map(([k,v]) =>
        `<span style="display:block;">${map[k]||k}：<strong style="color:var(--primary);">${v}次</strong></span>`
      ).join('');
    }
  }

  // ── History ──
  async function renderHistory() {
    const container = document.getElementById('historyList');
    try {
      const logs = await DB.getErrorLogs(30);
      if (!logs.length) {
        container.innerHTML = '<div style="color:var(--text-muted);font-size:15px;padding:24px 0;">还没有记录，完成练习后会显示在这里。</div>';
        return;
      }
      const map = { A:'看漏条件', B:'计算错', C:'抄错数字', D:'方法不对', E:'单位/格式', F:'做对了' };
      container.innerHTML = logs.map(e => `
        <div class="history-item">
          <div class="history-q">${e.question}</div>
          <div style="display:flex;gap:8px;align-items:center;">
            <span class="badge ${e.error_tag==='F'?'badge-success':'badge-warning'}">${map[e.error_tag]||e.error_tag}</span>
            <span class="history-meta">${new Date(e.created_at).toLocaleDateString()}</span>
          </div>
        </div>
      `).join('');
    } catch (e) {
      container.innerHTML = '<div style="color:var(--text-muted);font-size:15px;padding:24px 0;">加载失败，请检查网络。</div>';
    }
  }

  // ── Question Bank ──
  async function renderQBank() {
    const container = document.getElementById('qbankList');
    try {
      const banks = await DB.getQuestionBanks();
      if (!banks.length) {
        container.innerHTML = '<div style="color:var(--text-muted);font-size:15px;padding:24px 0;">还没有上传题库，请家长上传题目。</div>';
        return;
      }
      container.innerHTML = banks.map(b => `
        <div class="qbank-item" onclick="App.startWithQBank(${JSON.stringify(b.questions).replace(/"/g, '&quot;')})">
          <div>
            <div class="qbank-title">${b.title}</div>
            <div class="qbank-count">${b.questions.length} 道题 · ${new Date(b.created_at).toLocaleDateString()}</div>
          </div>
          <button class="btn btn-ghost" onclick="event.stopPropagation();App.deleteQBank(${b.id})">删除</button>
        </div>
      `).join('');
    } catch (e) {
      container.innerHTML = '<div style="color:var(--text-muted);font-size:15px;padding:24px 0;">加载失败，请检查网络。</div>';
    }
  }

  async function saveQBank() {
    const title = prompt('给这套题起个名字：');
    if (!title) return;
    const text = document.getElementById('qbankText').value.trim();
    if (!text) { alert('请先输入题目'); return; }
    // Split by newlines, each line is a question
    const lines = text.split('\n').filter(l => l.trim());
    const questions = lines.map((line, i) => ({
      text: line.trim(),
      type: '自定义题目',
      answer: null
    }));
    if (!questions.length) { alert('请至少输入一道题'); return; }

    try {
      await DB.saveQuestionBank(title, questions);
      document.getElementById('qbankText').value = '';
      renderQBank();
      alert('题库已保存！');
    } catch (e) {
      alert('保存失败: ' + e.message);
    }
  }

  async function deleteQBank(id) {
    if (!confirm('确定要删除这个题库吗？')) return;
    try {
      await DB.deleteQuestionBank(id);
      renderQBank();
    } catch (e) {
      alert('删除失败: ' + e.message);
    }
  }

  // ── Keyboard ──
  function handleKey(e) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendThought(); }
  }

  // ── Voice input ──
  function toggleVoice() {
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
      alert('您的浏览器不支持语音输入，请使用Chrome或Safari浏览器。');
      return;
    }
    const btn = document.getElementById('voiceBtn');
    if (state.isRecording) {
      state.recognition?.stop();
      state.isRecording = false;
      btn.classList.remove('recording');
      btn.textContent = '';
      return;
    }
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    state.recognition = new SR();
    state.recognition.lang = 'zh-CN';
    state.recognition.continuous = false;
    state.recognition.interimResults = true;
    state.recognition.onstart = () => { state.isRecording = true; btn.classList.add('recording'); btn.textContent = ''; };
    state.recognition.onresult = (e) => {
      const transcript = Array.from(e.results).map(r=>r[0].transcript).join('');
      document.getElementById('chatInput').value = transcript;
    };
    state.recognition.onend = () => { state.isRecording = false; btn.classList.remove('recording'); btn.textContent = ''; };
    state.recognition.onerror = () => { state.isRecording = false; btn.classList.remove('recording'); btn.textContent = ''; };
    state.recognition.start();
  }

  // ── File upload ──
  function handleFile(e) {
    const file = e.target.files[0];
    if (!file) return;
    document.getElementById('pasteInput').value =
      '请把图片里的题目文字手动输入到这里再开始练习。';
  }

  // ── Logout ──
  function logout() {
    Auth.logout();
  }

  return {
    init, showView, startDaily, startWithCustom, startWithQBank,
    sendThought, submitAnswer, tagError, nextQuestion,
    handleKey, toggleVoice, handleFile, logout,
    saveQBank, deleteQBank
  };
})();
