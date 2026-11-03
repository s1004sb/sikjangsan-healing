/* 관리자(주인) 출입 — 비밀번호로 받은 출입증을 이 탭에만 기억하고, 관리자 요청에 붙여 보냅니다. */
const Admin = (() => {
  'use strict';
  const KEY = 'sikjangsan-admin';
  let token = null;
  try { token = sessionStorage.getItem(KEY); } catch (e) { /* 저장소 없음 */ }

  const changed = () => document.dispatchEvent(new CustomEvent('adminchange'));
  const auth = () => (token ? { Authorization: 'Bearer ' + token } : {});

  function setToken(t) {
    token = t;
    try { if (t) sessionStorage.setItem(KEY, t); else sessionStorage.removeItem(KEY); } catch (e) { /* 무시 */ }
    changed();
  }

  async function login(password) {
    const res = await fetch('api/admin/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password }) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || '들어가지 못했어요');
    setToken(data.token);
  }

  // 관리자 요청 보내기. 출입증이 만료됐으면 자동으로 나가기
  async function post(url, body) {
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...auth() }, body: JSON.stringify(body) });
    const data = await res.json().catch(() => ({}));
    if (res.status === 401) setToken(null);
    if (!res.ok) throw new Error(data.error || '처리하지 못했어요');
    return data;
  }

  // 새로고침 뒤에도 출입증이 아직 유효한지 확인
  async function verify() {
    if (!token) return;
    try {
      const res = await fetch('api/admin/check', { headers: auth() });
      if (!res.ok) setToken(null);
    } catch (e) { /* 서버 없음 */ }
  }

  return { login, logout: () => setToken(null), isAdmin: () => !!token, auth, post, verify };
})();
