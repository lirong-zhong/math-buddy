// ============================================================
// app.js - main application logic
// ============================================================

const App = (() => {
  const state = {
    questions: [],
    currentQ: 0,
    practiceStep: 1,
    messages: [],
    errorLog: [],
    sessionStats: { done: 0, correct: 0, saved: 0 },
    streak: 0,
    thoughtSent: false,
    selectedError: null,
    isRecording: false,
    recognition: null,
    customQuestion: null
  };

  const greetings = [
    '你好！今天也来做题了，很棒！',
    '欢迎回来！准备好了吗？',
    '今天也一起加油！'
  ];

  function normalizeQuestion(q) {
    q = q || {};
return {
      text: q.text || '',
      type: q.type || '五年级数学',
      answer: q.answer || '',
      explanation: q.explanation || '',
      assets: Array.isArray(q.assets) ? q.assets : [],
      answer_status: q.answer_status || '',
      source: q.source || '',
      grade: q.grade || '',
      subject: q.subject || '数学',
      curriculum: q.curriculum || '',
      chapter: q.chapter || '',
      tags: Array.isArray(q.tags) ? q.tags : [],
      raw: q.raw || q
    };
  }

  function escapeHtml(text = '') {
    return String(text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function normalizeText(text = '') {
    return String(text)
      .replace(/\s+/g, '')
      .replace(/[，,。．\.、；;：:！？?!（）()【】\[\]{}<>＜＞“”"'\-—\u3000]/g, '')
      .toLowerCase();
  }

  function resolveAssetSrc(asset) {
    const value = typeof asset === 'string' ? asset : (asset?.url || asset?.path || '');
    if (!value) return '';
    if (/^https?:\/\//i.test(value) || value.startsWith('data:') || value.startsWith('blob:')) return value;
    const storageBase = window.__MB_CONFIG__?.SUPABASE_STORAGE_BASE;
    if (storageBase) {
      return storageBase.replace(/\/$/, '') + '/' + value.replace(/^\//, '');
    }
    return value;
  }

  function renderQuestionAssets(assets = []) {
    const host = document.getElementById('questionAssets');
    if (!host) return;
    if (!Array.isArray(assets) || !assets.length) {
      host.innerHTML = '';
      host.classList.add('hidden');
      return;
    }
    host.classList.remove('hidden');
    host.innerHTML = assets.map(asset => {
      const src = resolveAssetSrc(asset);
      if (!src) return '';
      const alt = asset.alt || '题目配图';
      return `
        <div class="question-asset">
          <img class="question-asset-img" src="${escapeHtml(src)}" alt="${escapeHtml(alt)}" loading="lazy">
        </div>
      `;
    }).join('');
  }

  function showView(view) {
    ['home', 'practice', 'upload', 'history', 'result', 'qbank'].forEach(name => {
      const el = document.getElementById(`view-${name}`);
      if (el) el.classList.toggle('hidden', name !== view);
    });

    ['nav-home', 'nav-practice', 'nav-history', 'nav-qbank'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.classList.remove('active');
    });

    if (view === 'home') document.getElementById('nav-home')?.classList.add('active');
    if (view === 'practice') document.getElementById('nav-practice')?.classList.add('active');
    if (view === 'history') {
      document.getElementById('nav-history')?.classList.add('active');
      renderHistory();
    }
    if (view === 'qbank') {
      document.getElementById('nav-qbank')?.classList.add('active');
      renderQBank();
    }
  }

  async function init() {
    const greet = document.getElementById('greetText');
    if (greet) greet.textContent = greetings[Math.floor(Math.random() * greetings.length)];

    try {
      const stats = await DB.getStats();
      state.streak = stats.streak || 0;
      state.sessionStats.done = stats.todayDone || 0;
      state.sessionStats.correct = stats.todayCorrect || 0;
      document.getElementById('statStreak').textContent = String(state.streak);
      updateSidebarStats();
      updateErrorSummaryFromData(stats.errorStats || {});
    } catch (error) {
      console.warn('Failed to load stats:', error);
    }
  }

  function resetSession(title) {
    state.currentQ = 0;
    state.messages = [];
    state.errorLog = [];
    state.sessionStats = { done: 0, correct: 0, saved: 0 };
    state.thoughtSent = false;
    state.selectedError = null;
    document.getElementById('practiceTitle').textContent = title;
    document.getElementById('sessionBadge').classList.remove('hidden');
    renderMessages();
    renderQuestionAssets([]);
    updateSidebarStats();
  }

  async function startDaily() {
    showView('practice');
    resetSession('今日练习');
    await generateQuestions();
  }

  async function startWithCustom(text) {
    const value = String(text || '').trim();
    if (!value) {
      alert('请先输入题目内容');
      return;
    }
    showView('practice');
    state.customQuestion = value;
    state.questions = [normalizeQuestion({ text: value, type: '自定义题目', answer: '', explanation: '', assets: [] })];
    resetSession('老师的题目');
    loadQuestion(0);
  }

  function startWithQBank(qbank) {
    const questions = Array.isArray(qbank) ? qbank : (qbank?.questions || []);
    const title = qbank?.title || '题库练习';
    showView('practice');
    state.questions = questions.map(normalizeQuestion);
    resetSession(title);
    loadQuestion(0);
  }

  async function startWithQuestionSource(sourceId, title) {
    try {
      const questions = await DB.getQuestionsBySource(sourceId);
      state.questions = (questions || []).map(normalizeQuestion);
      showView('practice');
      resetSession(title || '题库练习');
      loadQuestion(0);
    } catch (error) {
      console.warn('startWithQuestionSource failed:', error);
      alert('加载题库失败，请稍后再试');
    }
  }

  async function generateQuestions() {
    const questionText = document.getElementById('questionText');
    const questionHint = document.getElementById('questionHint');
    if (questionText) questionText.textContent = '正在出题，稍等一下...';
    if (questionHint) questionHint.textContent = '';

    try {
      const raw = await API.callDeepSeek(
        '你是一个五年级数学出题助手。请生成4道适合五年级的数学题，难度适中，包含应用题（含方程）、分数运算、几何计算、混合运算。每道题要有清晰题目，输出 JSON 数组，每项包含 text、type、answer。只输出 JSON。',
        '请出4道五年级数学练习题。',
        1000
      );
      const clean = String(raw).replace(/```json|```/g, '').trim();
      const parsed = JSON.parse(clean);
      state.questions = Array.isArray(parsed) ? parsed.map(normalizeQuestion) : [];
      if (!state.questions.length) throw new Error('no questions');
    } catch (error) {
      console.warn('AI generate failed, using fallback:', error);
      state.questions = [
        normalizeQuestion({ text: '小明有 60 颗糖果，送给同学 3/5 后，还剩多少颗？', type: '分数应用题', answer: '24颗' }),
        normalizeQuestion({ text: '一个长方形周长是 48 厘米，长是宽的 2 倍，求面积。', type: '几何计算', answer: '108平方厘米' }),
        normalizeQuestion({ text: '学校图书馆有 360 本书，科技类占 1/4，文学类占 1/12，其余是其他类，其他类有多少本？', type: '分数应用题', answer: '120本' }),
        normalizeQuestion({ text: '甲乙两人同时从 A 地出发去 B 地，甲每小时 8 千米，乙每小时 6 千米，乙到达后立即返回，在距 B 地 9 千米处遇到甲。A、B 两地相距多少千米？', type: '行程问题', answer: '9千米' })
      ];
    }

    updateProgress();
    loadQuestion(0);
  }

  function loadQuestion(idx) {
    const q = normalizeQuestion(state.questions[idx] || {});
    if (!q.text) return;

    state.currentQ = idx;
    document.getElementById('qType').textContent = q.type;
    document.getElementById('questionText').textContent = q.text;
    document.getElementById('questionHint').textContent = '提示：先圈出“求什么”，再划出关键数字';
    document.getElementById('sessionNum').textContent = String(idx + 1);
    renderQuestionAssets(q.assets || []);

    state.thoughtSent = false;
    state.selectedError = null;
    state.messages = [];
    renderMessages();

    document.getElementById('answerSection').style.display = 'none';
    document.getElementById('errorSection').style.display = 'none';
    document.getElementById('answerInput').value = '';
    document.getElementById('answerInput').className = 'answer-input';
    document.getElementById('nextBtn').disabled = true;
    document.querySelectorAll('.error-tag').forEach(tag => tag.classList.remove('selected'));

    setStep(1);
    updateProgress();
    addMessage('ai', `这道${escapeHtml(q.type)}，你先看一眼题目，然后告诉我：<br>① 这题<span class="highlight">求什么</span>？<br>② 题目里给了哪些<span class="highlight">关键数字或条件</span>？<br><br>不用担心对不对，想到什么说什么就行。`);
  }

  function updateProgress() {
    const total = state.questions.length;
    const done = Math.min(state.currentQ, total);
    const pct = total ? (done / total) * 100 : 0;
    document.getElementById('progressFill').style.width = `${pct}%`;
    document.getElementById('qCounter').textContent = `${done} / ${total}`;
  }

  function setStep(step) {
    state.practiceStep = step;
    for (let i = 1; i <= 4; i++) {
      const el = document.getElementById(`step${i}`);
      if (!el) continue;
      el.className = `step${i < step ? ' done' : i === step ? ' active' : ''}`;
    }
  }

  function addMessage(role, html) {
    state.messages.push({ role, html });
    renderMessages();
  }

  function renderMessages() {
    const container = document.getElementById('messages');
    if (!container) return;
    container.innerHTML = state.messages.map(message => `
      <div class="msg ${message.role === 'user' ? 'user' : ''}">
        <div class="msg-avatar"></div>
        <div class="msg-bubble">${message.html}</div>
      </div>
    `).join('');
    container.scrollTop = container.scrollHeight;
  }

  function showLoading() {
    state.messages.push({
      role: 'ai',
      html: '<div class="loading"><div class="dot"></div><div class="dot"></div><div class="dot"></div></div>'
    });
    renderMessages();
  }

  function removeLoading() {
    const last = state.messages[state.messages.length - 1];
    if (last?.html?.includes('loading')) state.messages.pop();
    renderMessages();
  }

  async function sendThought() {
    const input = document.getElementById('chatInput');
    const text = input.value.trim();
    if (!text) return;

    input.value = '';
    addMessage('user', escapeHtml(text).replace(/\n/g, '<br>'));
    setStep(2);
    showLoading();

    const q = normalizeQuestion(state.questions[state.currentQ]);
    try {
      const reply = await API.callDeepSeek(
        '你是一位温和、耐心的数学学习搭档，帮助五年级孩子梳理思路。先肯定孩子思路中正确的地方，如果有偏差，用很温和的方式引导，不要直接给答案。最后提醒孩子先看“求什么”，再找条件。',
        `题目：${q.text}\n\n孩子的思路：${text}\n\n请帮他梳理思路。`,
        1000
      );
      removeLoading();
      addMessage('ai', reply || '思路很好，我们继续往下走。');
    } catch (error) {
      removeLoading();
      addMessage('ai', '我刚刚没连上网络，不过没关系，我们继续做下一步。');
    }

    state.thoughtSent = true;
    setStep(3);
    document.getElementById('answerSection').style.display = 'block';
  }

  async function submitAnswer() {
    const input = document.getElementById('answerInput');
    const ans = input.value.trim();
    if (!ans) {
      alert('先写下你的答案');
      return;
    }

    const q = normalizeQuestion(state.questions[state.currentQ]);
    showLoading();
    setStep(4);

    const expected = normalizeText(q.answer);
    const actual = normalizeText(ans);
    let isCorrect = false;
    if (expected && actual) {
      isCorrect = expected === actual || expected.includes(actual) || actual.includes(expected);
    }

    try {
      const reply = await API.callDeepSeek(
        '你是数学答题反馈助手。请根据参考答案和学生答案，给出简短、温和的反馈。如果正确，必须包含“正确”两个字；如果不对，必须包含“不对”两个字，并指出一个最关键的改进点，不要长篇大论。',
        `题目：${q.text}\n参考答案：${q.answer || '无'}\n学生答案：${ans}\n\n请给出反馈。`,
        700
      );
      removeLoading();
      addMessage('ai', reply || (isCorrect ? '正确，我们继续！' : '不对，再看一眼题目条件。'));
    } catch {
      removeLoading();
      addMessage('ai', isCorrect ? '正确，我们继续！' : '不对，再看一眼题目条件。');
    }

    input.className = `answer-input ${isCorrect ? 'correct' : 'wrong'}`;
    state.sessionStats.done += 1;
    if (isCorrect) {
      state.sessionStats.correct += 1;
      state.sessionStats.saved += 1;
    }
    updateSidebarStats();

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
    } catch (error) {
      console.warn('save practice failed:', error);
    }

    document.getElementById('answerSection').style.display = 'none';
    document.getElementById('errorSection').style.display = 'block';
  }

  function tagError(el, code) {
    document.querySelectorAll('.error-tag').forEach(tag => tag.classList.remove('selected'));
    el.classList.add('selected');
    state.selectedError = code;
    document.getElementById('nextBtn').disabled = false;

    const q = normalizeQuestion(state.questions[state.currentQ]);
    state.errorLog.push({
      q: q.text.slice(0, 40),
      type: code,
      time: new Date().toLocaleDateString()
    });

    DB.saveErrorLog(q.text, code).catch(error => console.warn('save error failed:', error));
    updateErrorSummary();
  }

  function nextQuestion() {
    state.currentQ += 1;
    if (state.currentQ >= state.questions.length) {
      showResult();
      return;
    }
    loadQuestion(state.currentQ);
  }

  function showResult() {
    showView('result');
    const { done, correct, saved } = state.sessionStats;
    const pct = done ? Math.round((correct / done) * 100) : 0;

    let title = '今天做完了！';
    let sub = '很棒，先给自己一个大拇指。';
    if (pct >= 80) {
      title = '太棒了！';
      sub = '大部分题你都掌握了，继续保持。';
    } else if (pct >= 60) {
      title = '做得不错！';
      sub = '还有几道题可以再捡回来。';
    } else {
      title = '今天有点难，但没关系！';
      sub = '重要的是你已经开始整理思路了。';
    }

    if (done > 0) {
      state.streak += 1;
      DB.updateStats({ streak: state.streak }).catch(() => {});
      document.getElementById('statStreak').textContent = String(state.streak);
    }

    document.getElementById('resultEmoji').textContent = '🎉';
    document.getElementById('resultTitle').textContent = title;
    document.getElementById('resultSub').textContent = sub;
    document.getElementById('rDone').textContent = String(done);
    document.getElementById('rCorrect').textContent = String(correct);
    document.getElementById('rSaved').textContent = String(saved);
    document.getElementById('errorBreakdown').innerHTML = buildErrorBreakdown();
  }

  function buildErrorBreakdown() {
    const map = {
      A: '看漏条件',
      B: '计算错了',
      C: '抄错数字',
      D: '方法不对',
      E: '单位/格式',
      F: '其实做对了'
    };
    const counts = {};
    state.errorLog.forEach(item => {
      counts[item.type] = (counts[item.type] || 0) + 1;
    });
    const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    if (!entries.length) return '<div style="color:var(--text-muted)">暂无错题记录</div>';
    return entries.map(([key, value]) => `<span style="display:inline-block;margin-right:12px;">${map[key] || key}: <strong>${value}</strong> 次</span>`).join('');
  }

  function updateSidebarStats() {
    document.getElementById('statDone').textContent = String(state.sessionStats.done);
    document.getElementById('statCorrect').textContent = String(state.sessionStats.correct);
    document.getElementById('statSaved').textContent = String(state.sessionStats.saved);
  }

  function updateErrorSummaryFromData(errorStats = {}) {
    const map = {
      A: '看漏条件',
      B: '计算错了',
      C: '抄错数字',
      D: '方法不对',
      E: '单位/格式',
      F: '其实做对了'
    };
    const entries = Object.entries(errorStats).sort((a, b) => b[1] - a[1]).slice(0, 3);
    const el = document.getElementById('errorSummary');
    if (!el) return;
    if (!entries.length) {
      el.textContent = '暂无记录';
      return;
    }
    el.innerHTML = entries.map(([key, value]) => `<span style="display:block;">${map[key] || key}: <strong style="color:var(--primary);">${value}次</strong></span>`).join('');
  }

  async function updateErrorSummary() {
    try {
      const stats = await DB.getErrorStats();
      updateErrorSummaryFromData(stats);
    } catch {
      const counts = {};
      state.errorLog.forEach(item => {
        counts[item.type] = (counts[item.type] || 0) + 1;
      });
      updateErrorSummaryFromData(counts);
    }
  }

  async function renderHistory() {
    const container = document.getElementById('historyList');
    try {
      const logs = await DB.getErrorLogs(30);
      if (!logs.length) {
        container.innerHTML = '<div style="color:var(--text-muted);font-size:15px;padding:24px 0;">还没有记录，完成练习后会显示在这里。</div>';
        return;
      }
      const map = { A: '看漏条件', B: '计算错了', C: '抄错数字', D: '方法不对', E: '单位/格式', F: '其实做对了' };
      container.innerHTML = logs.map(item => `
        <div class="history-item">
          <div class="history-q">${escapeHtml(item.question || '')}</div>
          <div style="display:flex;gap:8px;align-items:center;">
            <span class="badge ${item.error_tag === 'F' ? 'badge-success' : 'badge-warning'}">${map[item.error_tag] || item.error_tag}</span>
            <span class="history-meta">${new Date(item.created_at).toLocaleDateString()}</span>
          </div>
        </div>
      `).join('');
    } catch {
      container.innerHTML = '<div style="color:var(--text-muted);font-size:15px;padding:24px 0;">加载失败，请检查网络。</div>';
    }
  }

  async function renderQBank() {
    const container = document.getElementById('qbankList');
    try {
      const [sources, banks] = await Promise.all([DB.getQuestionSources(), DB.getQuestionBanks()]);
      const sourceHtml = (sources || []).map(source => {
        const title = escapeHtml(source.title || source.source || '未命名题库');
        const date = source.created_at ? new Date(source.created_at).toLocaleDateString() : '';
        return `
          <div class="qbank-item" onclick="App.startWithQuestionSource(${source.id}, ${JSON.stringify(source.title || source.source || '题库练习')})">
            <div>
              <div class="qbank-title">${title}</div>
              <div class="qbank-count">${date}</div>
            </div>
            <button class="btn btn-ghost" onclick="event.stopPropagation();App.startWithQuestionSource(${source.id}, ${JSON.stringify(source.title || source.source || '题库练习')})">开始</button>
          </div>
        `;
      }).join('');

      const legacyHtml = (banks || []).map(bank => {
        const title = escapeHtml(bank.title || '未命名题库');
        const count = Array.isArray(bank.questions) ? bank.questions.length : 0;
        const date = bank.created_at ? new Date(bank.created_at).toLocaleDateString() : '';
        const payload = JSON.stringify({ title: bank.title || '题库练习', questions: Array.isArray(bank.questions) ? bank.questions : [] }).replace(/"/g, '&quot;');
        return `
          <div class="qbank-item" onclick="App.startWithQBank(${payload})">
            <div>
              <div class="qbank-title">${title}</div>
              <div class="qbank-count">${count} 道题 · ${date}</div>
            </div>
            <button class="btn btn-ghost" onclick="event.stopPropagation();App.deleteQBank(${bank.id})">删除</button>
          </div>
        `;
      }).join('');

      if (!sourceHtml && !legacyHtml) {
        container.innerHTML = '<div style="color:var(--text-muted);font-size:15px;padding:24px 0;">还没有上传题库，请家长上传题目。</div>';
        return;
      }
      container.innerHTML = sourceHtml + legacyHtml;
    } catch (error) {
      console.warn('renderQBank failed:', error);
      container.innerHTML = '<div style="color:var(--text-muted);font-size:15px;padding:24px 0;">加载失败，请检查网络。</div>';
    }
  }

  async function saveQBank() {
    const title = prompt('给这套题起个名字：');
    if (!title) return;
    const text = document.getElementById('qbankText').value.trim();
    if (!text) {
      alert('请先输入题目');
      return;
    }

    const lines = text.split('\n').map(line => line.trim()).filter(Boolean);
    const questions = lines.map(line => normalizeQuestion({ text: line, type: '自定义题目', answer: '', explanation: '', assets: [] }));

    if (!questions.length) {
      alert('请至少输入一道题');
      return;
    }

    try {
      await DB.saveQuestionBank(title, questions);
      document.getElementById('qbankText').value = '';
      renderQBank();
      alert('题库已保存！');
    } catch (error) {
      alert('保存失败：' + error.message);
    }
  }

  async function deleteQBank(id) {
    if (!confirm('确定要删除这个题库吗？')) return;
    try {
      await DB.deleteQuestionBank(id);
      renderQBank();
    } catch (error) {
      alert('删除失败：' + error.message);
    }
  }

  function handleKey(event) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      sendThought();
    }
  }

  function toggleVoice() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      alert('当前浏览器不支持语音输入，请使用 Chrome 或 Safari。');
      return;
    }

    const btn = document.getElementById('voiceBtn');
    if (state.isRecording) {
      state.recognition?.stop();
      state.isRecording = false;
      btn.classList.remove('recording');
      return;
    }

    state.recognition = new SR();
    state.recognition.lang = 'zh-CN';
    state.recognition.continuous = false;
    state.recognition.interimResults = true;
    state.recognition.onstart = () => {
      state.isRecording = true;
      btn.classList.add('recording');
    };
    state.recognition.onresult = event => {
      const transcript = Array.from(event.results).map(r => r[0].transcript).join('');
      document.getElementById('chatInput').value = transcript;
    };
    state.recognition.onend = () => {
      state.isRecording = false;
      btn.classList.remove('recording');
    };
    state.recognition.onerror = () => {
      state.isRecording = false;
      btn.classList.remove('recording');
    };
    state.recognition.start();
  }

  function handleFile(event) {
    const file = event.target.files[0];
    if (!file) return;
    document.getElementById('pasteInput').value = '你可以把图片里的题目文字手动输入到这里，然后开始练习。';
  }

  function logout() {
    Auth.logout();
  }

  return {
    init,
    showView,
    startDaily,
    startWithCustom,
    startWithQBank,
    startWithQuestionSource,
    sendThought,
    submitAnswer,
    tagError,
    nextQuestion,
    handleKey,
    toggleVoice,
    handleFile,
    logout,
    saveQBank,
    deleteQBank
  };
})();



