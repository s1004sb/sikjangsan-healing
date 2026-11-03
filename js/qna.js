/* 묻고 답하기 — 방문자는 질문(비밀글 가능)을 남기고, 주인은 답변을 달아요.
   내가 쓴 질문의 열쇠는 이 브라우저에 기억해 두었다가 비밀글 보기·지우기·답변 알림에 써요. */
const QnA = (() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const MINE_KEY = 'sikjangsan-qna-mine';
  const fmtDate = new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', month: 'long', day: 'numeric' });
  const CATEGORY = { question: '❓ 질문', idea: '💡 아이디어', report: '🛠️ 불편해요' };

  let questions = [], available = true, isOpen = false, cfg = null, unanswered = 0, editing = null;
  let mine = {}; // { id: { key, seen: 답변을 확인했는지 } }

  try { mine = JSON.parse(localStorage.getItem(MINE_KEY) || '{}') || {}; } catch (e) { mine = {}; }
  const saveMine = () => { try { localStorage.setItem(MINE_KEY, JSON.stringify(mine)); } catch (e) { /* 무시 */ } };
  const keysHeader = () => ({ 'x-qna-keys': Object.entries(mine).slice(-50).map(([id, m]) => `${id}.${m.key}`).join(',') });

  function ago(ms) {
    const s = (Date.now() - ms) / 1000;
    if (s < 60) return '방금';
    if (s < 3600) return `${Math.floor(s / 60)}분 전`;
    if (s < 86400) return `${Math.floor(s / 3600)}시간 전`;
    if (s < 86400 * 7) return `${Math.floor(s / 86400)}일 전`;
    return fmtDate.format(ms);
  }

  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  function setStatus(id, text, error = false) { $(id).textContent = text; $(id).classList.toggle('error', error); }

  // ---------- 불러오기 · 알림 ----------
  async function load() {
    try {
      const res = await fetch('api/qna', { cache: 'no-store', headers: { ...keysHeader(), ...Admin.auth() } });
      if (!res.ok) throw new Error(res.status);
      const data = await res.json();
      questions = data.questions || [];
      unanswered = data.unanswered || 0;
      available = true;
      // 서버에서 지워진 내 질문은 잊기
      const ids = new Set(questions.map((q) => q.id));
      for (const id of Object.keys(mine)) if (!ids.has(id) && questions.length < 100) delete mine[id];
      saveMine();
    } catch (e) {
      available = false;
    }
    $('qnaSend').disabled = !available;
    if (!available) setStatus('qnaStatus', '주인에게 묻기는 node serve.js로 실행한 주소에서 쓸 수 있어요.', true);
    notify();
    render();
  }

  // 내 질문에 새 답변이 달렸으면 알려 주고, 관리자에게는 답변을 기다리는 질문 수를 보여 줌
  function notify() {
    const fresh = questions.filter((q) => q.mine && q.answered && mine[q.id] && !mine[q.id].seen);
    const dot = fresh.length > 0 || (Admin.isAdmin() && unanswered > 0);
    for (const id of ['btnQna', 'moreQna', 'tabMore']) { const b = $(id); if (b) b.classList.toggle('has-dot', dot); }
    if (fresh.length && !isOpen && cfg.toast) cfg.toast('💌 내가 남긴 글에 주인의 답변이 달렸어요! 💬 주인에게 묻기를 열어 보세요', 6000);
    if (isOpen) { for (const q of fresh) mine[q.id].seen = true; saveMine(); }
  }

  // ---------- 그리기 ----------
  function render() {
    const list = $('qnaList'), admin = Admin.isAdmin();
    list.textContent = '';
    $('qnaTotal').textContent = questions.length ? `${questions.length}개` + (admin && unanswered ? ` · 답변 기다리는 질문 ${unanswered}개` : '') : '';
    if (!questions.length) {
      list.appendChild(el('li', 'empty', available ? '아직 질문이 없어요. 첫 질문을 남겨 주세요.' : ''));
    }
    for (const q of questions) list.appendChild(card(q, admin));
    renderAdminBar();
  }

  function card(q, admin) {
    const li = el('li', 'qna-item' + (q.mine ? ' mine' : '') + (q.answered ? '' : ' waiting'));
    const meta = el('p', 'meta');
    meta.append(el('span', 'tag ' + q.category, CATEGORY[q.category] || CATEGORY.question), ` ${q.name} · ${ago(q.at)}${q.private ? ' · 🔒 비밀글' : ''}${q.mine ? ' · 내 글' : ''}`);
    li.appendChild(meta);
    li.appendChild(el('p', 'q', q.question == null ? '🔒 비밀글이에요. 질문한 사람과 주인만 볼 수 있어요.' : q.question));

    if (editing === q.id) {
      const form = el('form', 'answer-form');
      const ta = el('textarea');
      ta.rows = 4; ta.maxLength = 1000; ta.value = q.answer || ''; ta.placeholder = '방문자에게 전할 답변';
      const row = el('div', 'row');
      const cancel = el('button', 'ghost', '취소'); cancel.type = 'button';
      const save = el('button', 'send', '답변 저장'); save.type = 'submit';
      cancel.addEventListener('click', () => { editing = null; render(); });
      row.append(cancel, save);
      form.append(ta, row);
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        save.disabled = true;
        try {
          await Admin.post('api/admin/answer', { id: q.id, answer: ta.value });
          editing = null;
          await load();
          if (cfg.toast) cfg.toast(ta.value.trim() ? '답변을 남겼어요. 질문한 분에게 알림이 가요 💌' : '답변을 지웠어요');
        } catch (err) { save.disabled = false; alert(err.message); }
      });
      li.appendChild(form);
      setTimeout(() => ta.focus(), 30);
    } else if (q.answered) {
      const a = el('div', 'answer');
      a.appendChild(el('p', 'a-head', `🌙 주인의 답변 · ${ago(q.answeredAt)}`));
      a.appendChild(el('p', 'a-body', q.answer == null ? '🔒 비밀글의 답변이에요.' : q.answer));
      li.appendChild(a);
    } else {
      li.appendChild(el('p', 'wait', '답변을 기다리고 있어요'));
    }

    const actions = el('div', 'actions');
    if (admin && editing !== q.id) {
      const b = el('button', 'link', q.answered ? '답변 고치기' : '답변 쓰기');
      b.addEventListener('click', () => { editing = q.id; render(); });
      actions.appendChild(b);
    }
    if (admin || q.mine) {
      const d = el('button', 'link danger', '삭제');
      d.addEventListener('click', () => remove(q));
      actions.appendChild(d);
    }
    if (actions.childNodes.length) li.appendChild(actions);
    return li;
  }

  async function remove(q) {
    if (!confirm('이 질문을 지울까요? 지운 질문은 되돌릴 수 없어요.')) return;
    try {
      if (Admin.isAdmin()) await Admin.post('api/qna/delete', { id: q.id });
      else {
        const res = await fetch('api/qna/delete', { method: 'POST', headers: { 'Content-Type': 'application/json', ...keysHeader() }, body: JSON.stringify({ id: q.id }) });
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || '지우지 못했어요');
      }
      delete mine[q.id];
      saveMine();
      await load();
    } catch (err) { alert(err.message); }
  }

  // ---------- 관리자 출입 ----------
  function renderAdminBar() {
    const admin = Admin.isAdmin();
    $('adminLogin').hidden = admin || !$('adminLogin').classList.contains('show');
    $('adminOn').hidden = !admin;
    $('adminOpen').hidden = admin;
  }

  async function adminLogin(e) {
    e.preventDefault();
    const pw = $('adminPw').value;
    if (!pw) return;
    setStatus('adminStatus', '확인하는 중…');
    try {
      await Admin.login(pw);
      $('adminPw').value = '';
      setStatus('adminStatus', '');
      $('adminLogin').classList.remove('show');
      if (cfg.toast) cfg.toast('관리자로 들어왔어요. 답변을 달거나 글을 지울 수 있어요');
    } catch (err) {
      setStatus('adminStatus', err.message, true);
    }
  }

  // ---------- 질문 쓰기 ----------
  async function submit(e) {
    e.preventDefault();
    const question = $('qnaText').value.trim();
    if (question.length < 2) { setStatus('qnaStatus', '궁금한 점을 적어 주세요', true); return; }
    $('qnaSend').disabled = true;
    setStatus('qnaStatus', '남기는 중…');
    try {
      const res = await fetch('api/qna', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: $('qnaName').value.trim(), question, private: $('qnaPrivate').checked, category: document.querySelector('input[name="qnaCat"]:checked').value }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || '질문을 남기지 못했어요');
      mine[data.question.id] = { key: data.key, seen: false };
      saveMine();
      try { localStorage.setItem('sikjangsan-name', $('qnaName').value.trim()); } catch (err) { /* 무시 */ }
      $('qnaText').value = '';
      $('qnaPrivate').checked = false;
      updateCount();
      setStatus('qnaStatus', '잘 전했어요. 주인의 답변이 달리면 이 브라우저에서 알려 드릴게요 💌');
      await load();
    } catch (err) {
      setStatus('qnaStatus', err.message, true);
    } finally {
      $('qnaSend').disabled = !available;
    }
  }

  const updateCount = () => { $('qnaCount').textContent = `${$('qnaText').value.length} / 500`; };

  function open(on) {
    isOpen = on;
    $('qnaPanel').classList.toggle('open', on);
    $('qnaPanel').setAttribute('aria-hidden', String(!on));
    $('btnQna').setAttribute('aria-pressed', String(on));
    if (on) { load(); if (cfg.onOpen) cfg.onOpen(); }
  }

  function init(options) {
    cfg = options;
    try { $('qnaName').value = localStorage.getItem('sikjangsan-name') || ''; } catch (e) { /* 무시 */ }
    $('btnQna').addEventListener('click', () => open(!isOpen));
    $('qnaClose').addEventListener('click', () => open(false));
    $('qnaForm').addEventListener('submit', submit);
    $('qnaText').addEventListener('input', updateCount);
    $('adminOpen').addEventListener('click', () => { $('adminLogin').classList.add('show'); renderAdminBar(); $('adminPw').focus(); });
    $('adminLogin').addEventListener('submit', adminLogin);
    $('adminOff').addEventListener('click', () => { Admin.logout(); if (cfg.toast) cfg.toast('관리자에서 나왔어요'); });
    document.addEventListener('adminchange', () => { editing = null; load(); });
    Admin.verify().then(load);
    setInterval(() => load(), 60000);
  }

  return { init, open, isOpen: () => isOpen };
})();
