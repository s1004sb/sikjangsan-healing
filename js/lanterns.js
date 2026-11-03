/* 소원 풍등 — 소원을 적으면 풍등이 하늘로 올라가고, 다른 사람들이 띄운 풍등도 대전 시내 위로 떠오릅니다. */
const Lanterns = (() => {
  'use strict';
  const API = 'api/lanterns';
  const $ = (id) => document.getElementById(id);
  const shorten = (s) => (s.length > 24 ? s.slice(0, 23) + '…' : s);

  let cfg = null, available = true, queue = [], today = 0;
  const shown = new Set();

  async function load() {
    try {
      const res = await fetch(API, { cache: 'no-store' });
      if (!res.ok) throw new Error(res.status);
      const data = await res.json();
      available = true;
      today = data.today || 0;
      for (const l of data.lanterns || []) if (!shown.has(l.id) && !queue.some((q) => q.id === l.id)) queue.push(l);
      queue = queue.slice(0, 30);
    } catch (e) {
      available = false;
    }
    renderCount();
  }

  function renderCount() {
    $('lanternCount').textContent = !available
      ? '풍등은 node serve.js로 실행한 주소에서 띄울 수 있어요.'
      : today ? `오늘 ${today}개의 풍등이 식장산 하늘로 올라갔어요.` : '오늘 첫 번째 풍등을 띄워 주세요.';
    $('lanternSend').disabled = !available;
  }

  // 다른 사람의 풍등을 하나씩 천천히 띄움
  function releaseNext() {
    if (queue.length && !document.hidden) {
      const l = queue.shift();
      shown.add(l.id);
      Scene.launchLantern({ text: shorten(l.wish) });
    }
    setTimeout(releaseNext, 18000 + Math.random() * 14000);
  }

  function open(on) {
    $('lanternModal').hidden = !on;
    if (on) {
      load();
      setTimeout(() => $('lanternWish').focus(), 50);
    }
  }

  async function submit(e) {
    e.preventDefault();
    const wish = $('lanternWish').value.trim();
    if (!wish) { $('lanternStatus').textContent = '소원을 적어 주세요'; return; }
    $('lanternSend').disabled = true;
    $('lanternStatus').textContent = '';
    try {
      const res = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ wish }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || '풍등을 띄우지 못했어요');
      shown.add(data.lantern.id);
      $('lanternWish').value = '';
      open(false);
      Scene.launchLantern({ text: shorten(wish), mine: true });
      today++;
      if (cfg.toast) cfg.toast('당신의 소원이 식장산 하늘로 올라가요 🏮', 4500);
    } catch (err) {
      $('lanternStatus').textContent = err.message;
    } finally {
      $('lanternSend').disabled = !available;
    }
  }

  function init(options) {
    cfg = options;
    $('btnLantern').addEventListener('click', () => open(true));
    $('lanternCancel').addEventListener('click', () => open(false));
    $('lanternModal').addEventListener('click', (e) => { if (e.target === $('lanternModal')) open(false); });
    $('lanternForm').addEventListener('submit', submit);
    load().then(() => setTimeout(releaseNext, 4000));
    setInterval(load, 60000);
  }

  return { init, open, isOpen: () => !$('lanternModal').hidden };
})();
