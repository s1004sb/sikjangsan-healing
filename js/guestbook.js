/* 방명록 — 글 남기기, 목록 보기, 남겨진 글을 하늘에 잠시 띄우기 */
const Guestbook = (() => {
  'use strict';
  const API = 'api/guestbook';
  const $ = (id) => document.getElementById(id);
  const SKY_LABEL = { dawn: '🌄 새벽에', day: '☀️ 낮에', sunset: '🌇 노을 질 때', night: '🌙 밤에' };
  const fmtDate = new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', month: 'long', day: 'numeric' });

  let entries = [], available = true, isOpen = false, cfg = null;
  let floatIdx = 0, floatTimer = null, pollTimer = null;
  const seen = new Set();

  function ago(ms) {
    const s = (Date.now() - ms) / 1000;
    if (s < 60) return '방금';
    if (s < 3600) return `${Math.floor(s / 60)}분 전`;
    if (s < 86400) return `${Math.floor(s / 3600)}시간 전`;
    if (s < 86400 * 7) return `${Math.floor(s / 86400)}일 전`;
    return fmtDate.format(ms);
  }

  function setStatus(text, error = false) {
    const el = $('guestStatus');
    el.textContent = text;
    el.classList.toggle('error', error);
  }

  function render() {
    const list = $('guestList');
    list.textContent = '';
    $('guestTotal').textContent = entries.length ? `${entries.length}개` : '';
    if (!entries.length) {
      const li = document.createElement('li');
      li.className = 'empty';
      li.textContent = available ? '아직 남겨진 글이 없어요. 첫 마음을 남겨 주세요.' : '';
      list.appendChild(li);
      return;
    }
    for (const e of entries) {
      const li = document.createElement('li');
      if (!seen.has(e.id) && seen.size) li.className = 'fresh';
      const msg = document.createElement('p');
      msg.className = 'msg';
      msg.textContent = e.message;
      const meta = document.createElement('p');
      meta.className = 'meta';
      meta.textContent = `${e.name} · ${SKY_LABEL[e.sky] || ''} · ${ago(e.at)}`;
      li.append(msg, meta);
      list.appendChild(li);
    }
    entries.forEach((e) => seen.add(e.id));
  }

  async function load() {
    try {
      const res = await fetch(API, { cache: 'no-store' });
      if (!res.ok) throw new Error(res.status);
      entries = (await res.json()).entries || [];
      if (!available) { available = true; setForm(true); setStatus(''); }
    } catch (e) {
      available = false;
      setForm(false);
      setStatus('방명록은 node serve.js로 실행한 주소(http://localhost:5173)에서 쓸 수 있어요.', true);
    }
    render();
  }

  function setForm(on) {
    $('guestMsg').disabled = !on;
    $('guestName').disabled = !on;
    $('guestSubmit').disabled = !on;
  }

  async function submit(ev) {
    ev.preventDefault();
    const message = $('guestMsg').value.trim();
    if (!message) { setStatus('남길 말을 적어 주세요', true); return; }
    $('guestSubmit').disabled = true;
    setStatus('남기는 중…');
    try {
      const res = await fetch(API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: $('guestName').value.trim(), message, sky: cfg.getSky() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || '글을 남기지 못했어요');
      try { localStorage.setItem('sikjangsan-name', $('guestName').value.trim()); } catch (e) { /* 무시 */ }
      $('guestMsg').value = '';
      updateCount();
      setStatus('마음이 식장산 하늘에 남겨졌어요 ✨');
      entries.unshift(data.entry);
      render();
      showFloat(data.entry);
    } catch (e) {
      setStatus(e.message, true);
    } finally {
      $('guestSubmit').disabled = !available;
    }
  }

  function updateCount() {
    $('guestCount').textContent = `${$('guestMsg').value.length} / 140`;
  }

  // 남겨진 글을 하늘에 잠시 띄우기
  function showFloat(e) {
    const el = $('floatMsg');
    el.textContent = `“${e.message}”`;
    const who = document.createElement('small');
    who.textContent = `— ${e.name}, ${SKY_LABEL[e.sky] || ''}`;
    el.appendChild(who);
    el.classList.add('show');
    setTimeout(() => el.classList.remove('show'), 9000);
  }

  function floatNext() {
    if (cfg.opts.floatMessages && !isOpen && entries.length && !document.hidden) {
      const pool = entries.slice(0, 30);
      showFloat(pool[floatIdx++ % pool.length]);
    }
    floatTimer = setTimeout(floatNext, 35000);
  }

  function open(on) {
    isOpen = on;
    $('guestbook').classList.toggle('open', on);
    $('guestbook').setAttribute('aria-hidden', String(!on));
    $('btnGuest').setAttribute('aria-pressed', String(on));
    clearInterval(pollTimer);
    if (on) {
      load();
      pollTimer = setInterval(load, 20000);
      if (cfg.onOpen) cfg.onOpen();
    }
  }

  function init(options) {
    cfg = options;
    try { $('guestName').value = localStorage.getItem('sikjangsan-name') || ''; } catch (e) { /* 무시 */ }
    $('guestForm').addEventListener('submit', submit);
    $('guestMsg').addEventListener('input', updateCount);
    $('guestMsg').addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) $('guestForm').requestSubmit();
    });
    $('btnGuest').addEventListener('click', () => open(!isOpen));
    $('guestClose').addEventListener('click', () => open(false));
    load();
    setInterval(() => { if (!isOpen) load(); }, 60000);
    floatTimer = setTimeout(floatNext, 12000);
  }

  return { init, open, isOpen: () => isOpen };
})();
