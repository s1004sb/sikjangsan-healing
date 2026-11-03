/* 좋아요 — 어떤 점이 좋았는지 고르고 한 줄 남기면, 모두가 좋아한 점을 함께 모아 봐요. */
const Likes = (() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const LIKED_KEY = 'sikjangsan-liked';
  const REASONS = {
    sunset: '🌅 노을·해돋이', night: '🌃 대전 야경', stars: '✨ 별과 달', lantern: '🏮 소원 풍등',
    sound: '🎵 음악·자연의 소리', breath: '🧘 숨 고르기', etc: '💬 그 밖에',
  };
  const fmtDate = new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', month: 'long', day: 'numeric' });

  let summary = null, picked = new Set(), cfg = null;
  const liked = () => { try { return !!localStorage.getItem(LIKED_KEY); } catch (e) { return false; } };
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };

  async function load() {
    try {
      const res = await fetch('api/likes', { cache: 'no-store' });
      if (!res.ok) throw new Error(res.status);
      summary = await res.json();
    } catch (e) { summary = null; }
    renderButton();
    renderSummary();
  }

  function renderButton() {
    const b = $('btnLike');
    b.hidden = !summary;
    if (!summary) return;
    b.classList.toggle('on', liked());
    b.querySelector('.heart').textContent = liked() ? '♥' : '♡';
    b.querySelector('.n').textContent = summary.total;
  }

  function renderPicker() {
    const box = $('likePick');
    box.textContent = '';
    for (const [k, label] of Object.entries(REASONS)) {
      const b = el('button', 'chip' + (picked.has(k) ? ' on' : ''), label);
      b.type = 'button';
      b.setAttribute('aria-pressed', String(picked.has(k)));
      b.addEventListener('click', () => { picked.has(k) ? picked.delete(k) : picked.add(k); renderPicker(); });
      box.appendChild(b);
    }
  }

  // 모두가 좋아한 점 막대그래프와 최근 한 줄
  function renderSummary() {
    const bars = $('likeBars'), list = $('likeComments');
    bars.textContent = '';
    list.textContent = '';
    if (!summary) return;
    $('likeTotal').textContent = summary.total ? `지금까지 ${summary.total}번의 좋아요를 받았어요` : '첫 번째 좋아요를 보내 주세요';
    const max = Math.max(1, ...Object.values(summary.counts));
    const sorted = Object.entries(summary.counts).sort((a, b) => b[1] - a[1]);
    for (const [k, n] of sorted) {
      if (!n && summary.total) continue;
      const row = el('div', 'bar-row');
      const fill = el('span', 'fill');
      fill.style.width = `${(n / max) * 100}%`;
      const track = el('span', 'track');
      track.appendChild(fill);
      row.append(el('span', 'label', REASONS[k]), track, el('span', 'num', n));
      bars.appendChild(row);
    }
    for (const c of summary.comments.slice(0, 12)) {
      const li = el('li');
      li.append(el('p', 'c', c.comment), el('p', 'meta', `${(c.reasons || []).map((r) => REASONS[r]).filter(Boolean).join(' ')} · ${fmtDate.format(c.at)}`));
      if (Admin.isAdmin()) {
        const del = el('button', 'link danger', '삭제');
        del.addEventListener('click', async () => {
          if (!confirm('이 한 줄을 지울까요?')) return;
          try { await Admin.post('api/admin/delete', { kind: 'likes', id: c.id }); load(); } catch (err) { alert(err.message); }
        });
        li.appendChild(del);
      }
      list.appendChild(li);
    }
  }

  function open(on) {
    $('likeModal').hidden = !on;
    if (!on) return;
    $('likeForm').hidden = liked();
    $('likeThanks').hidden = !liked();
    renderPicker();
    load();
  }

  async function submit(e) {
    e.preventDefault();
    if (!picked.size) { $('likeStatus').textContent = '좋았던 점을 하나 이상 골라 주세요'; return; }
    $('likeSend').disabled = true;
    $('likeStatus').textContent = '';
    try {
      const res = await fetch('api/likes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reasons: [...picked], comment: $('likeComment').value.trim() }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok && res.status !== 429) throw new Error(data.error || '좋아요를 보내지 못했어요');
      try { localStorage.setItem(LIKED_KEY, String(Date.now())); } catch (err) { /* 무시 */ }
      if (res.ok) summary = data;
      picked.clear();
      renderPicker();
      $('likeComment').value = '';
      $('likeForm').hidden = true;
      $('likeThanks').hidden = false;
      renderButton();
      renderSummary();
      if (cfg.toast) cfg.toast(res.ok ? '좋아요를 보내 주셔서 고마워요 ♥' : data.error);
    } catch (err) {
      $('likeStatus').textContent = err.message;
    } finally {
      $('likeSend').disabled = false;
    }
  }

  function init(options) {
    cfg = options;
    $('btnLike').addEventListener('click', () => open(true));
    $('likeClose').addEventListener('click', () => open(false));
    $('likeModal').addEventListener('click', (e) => { if (e.target === $('likeModal')) open(false); });
    $('likeForm').addEventListener('submit', submit);
    $('likeAgain').addEventListener('click', () => { $('likeForm').hidden = false; $('likeThanks').hidden = true; });
    document.addEventListener('adminchange', renderSummary);
    load();
    setInterval(load, 120000);
  }

  return { init, open, isOpen: () => !$('likeModal').hidden };
})();
