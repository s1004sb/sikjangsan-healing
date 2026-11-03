/* 함께 보는 사람 수 — 이 창이 열려 있다는 신호를 서버에 보내고, 지금 함께 있는 사람 수를 받아옵니다. */
const Presence = (() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const BEAT_MS = 25000;
  const id = (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
  let count = 0, cfg = null, lastJoinToast = 0;

  function text(n) {
    if (n <= 1) return '지금 이 하늘은 당신만의 것이에요. 고요함을 누려 보세요.';
    return `지금 ${n}명이 함께 식장산 하늘을 보고 있어요`;
  }

  function show(n) {
    const el = $('together');
    if (n > count && count > 0 && Date.now() - lastJoinToast > 60000 && cfg.toast) {
      lastJoinToast = Date.now();
      cfg.toast(n - count > 1 ? `${n - count}명이 식장산에 올라왔어요` : '누군가 식장산에 올라왔어요 🌿');
    }
    count = n;
    el.hidden = false;
    el.querySelector('span').textContent = text(n);
    el.classList.toggle('many', n > 1);
  }

  async function beat() {
    try {
      const res = await fetch('api/presence', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) });
      if (!res.ok) throw new Error(res.status);
      show((await res.json()).count);
    } catch (e) {
      $('together').hidden = true; // 서버 없이 열었을 때는 숨김
    }
  }

  function init(options) {
    cfg = options;
    beat();
    setInterval(beat, BEAT_MS);
    // 다시 돌아왔을 때 바로 갱신
    document.addEventListener('visibilitychange', () => { if (!document.hidden) beat(); });
    // 창을 닫으면 바로 빠지도록
    window.addEventListener('pagehide', () => {
      const body = new Blob([JSON.stringify({ id })], { type: 'text/plain' }); // sendBeacon이 막지 않는 형식
      if (navigator.sendBeacon) navigator.sendBeacon('api/presence/leave', body);
    });
  }

  return { init, count: () => count };
})();
