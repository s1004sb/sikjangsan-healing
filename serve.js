// 서버: node serve.js → http://localhost:5173
// 정적 파일과 방명록·풍등·묻고 답하기·관리자·접속 신호 API를 함께 제공합니다.
// 글은 DATABASE_URL이 있으면 데이터베이스에, 없으면 data/ 폴더의 JSON 파일에 저장돼요 (db.js).
// 관리자 기능은 환경 변수 ADMIN_PASSWORD를 정해야 켜져요.
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const db = require('./db');

const ROOT = __dirname;
const PORT = process.env.PORT || 5173;
const DATA_DIR = path.join(ROOT, 'data');
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.json': 'application/json; charset=utf-8', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.m4a': 'audio/mp4', '.wav': 'audio/wav', '.webmanifest': 'application/manifest+json', '.txt': 'text/plain; charset=utf-8', '.xml': 'application/xml; charset=utf-8' };
// 밖에서 내려받으면 안 되는 서버 쪽 파일
const PRIVATE_FILES = ['/serve.js', '/db.js', '/package.json', '/package-lock.json', '/render.yaml'];

// ---------- 공통 ----------
// 제어 문자 제거, 공백 정리 (줄바꿈을 살릴 땐 keepLines)
function clean(s, max, keepLines = false) {
  let t = String(s || '').replace(/\r\n?/g, '\n');
  t = keepLines
    ? t.replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, ' ').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n')
    : t.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ');
  return t.trim().slice(0, max);
}
const newId = () => Date.now().toString(36) + crypto.randomBytes(3).toString('hex');

function send(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
}
const fail = (res, status, error) => send(res, status, { error });

// 요청 본문을 JSON으로 읽기 (limit 바이트 초과·형식 오류는 거절)
function readJson(req, res, limit, done) {
  let raw = '';
  req.on('data', (chunk) => {
    raw += chunk;
    if (raw.length > limit) { fail(res, 413, '글이 너무 길어요'); req.destroy(); }
  });
  req.on('end', () => {
    if (res.writableEnded) return;
    let body;
    try { body = JSON.parse(raw); } catch (e) { fail(res, 400, '잘못된 요청이에요'); return; }
    done(body || {});
  });
}

// Render 같은 인터넷 서버에서는 요청이 중간 서버(프록시)를 거쳐 오므로, 실제 방문자 주소는 x-forwarded-for에 있음
const BEHIND_PROXY = !!process.env.RENDER;
function clientIp(req) {
  const fwd = BEHIND_PROXY && req.headers['x-forwarded-for'];
  return fwd ? String(fwd).split(',')[0].trim() : req.socket.remoteAddress || '';
}

// 같은 접속 주소에서 연달아 쓰는 것 방지
function cooldown(ms) {
  const last = new Map();
  return (req) => {
    const ip = clientIp(req), now = Date.now();
    if (now - (last.get(ip) || 0) < ms) return false;
    last.set(ip, now);
    return true;
  };
}

// ---------- 관리자 ----------
// 비밀번호가 맞으면 12시간짜리 출입증(토큰)을 줌. 출입증은 비밀번호로 서명해서 위조할 수 없음
const sign = (exp) => crypto.createHmac('sha256', ADMIN_PASSWORD).update('admin:' + exp).digest('hex');
const sameHash = (a, b) => crypto.timingSafeEqual(crypto.createHash('sha256').update(String(a)).digest(), crypto.createHash('sha256').update(String(b)).digest());

function isAdmin(req) {
  if (!ADMIN_PASSWORD) return false;
  const m = /^Bearer (\d{13})\.([0-9a-f]{64})$/.exec(req.headers.authorization || '');
  return !!m && +m[1] > Date.now() && sameHash(m[2], sign(m[1]));
}

// 비밀번호를 틀리면 10분 동안 5번까지만
const loginFails = new Map();
function handleAdminLogin(req, res) {
  if (req.method !== 'POST') return fail(res, 405, '지원하지 않는 요청이에요');
  if (!ADMIN_PASSWORD) return fail(res, 503, '관리자 비밀번호가 아직 정해지지 않았어요 (서버 환경 변수 ADMIN_PASSWORD)');
  const ip = clientIp(req), f = loginFails.get(ip);
  if (f && f.count >= 5 && Date.now() < f.until) return fail(res, 429, '비밀번호를 여러 번 틀렸어요. 10분 뒤에 다시 해 주세요');
  readJson(req, res, 512, (body) => {
    if (!sameHash(body.password || '', ADMIN_PASSWORD)) {
      const n = f && Date.now() < f.until ? f.count + 1 : 1;
      loginFails.set(ip, { count: n, until: Date.now() + 10 * 60 * 1000 });
      return setTimeout(() => fail(res, 401, '비밀번호가 맞지 않아요'), 600);
    }
    loginFails.delete(ip);
    const exp = Date.now() + 12 * 3600 * 1000;
    send(res, 200, { token: `${exp}.${sign(exp)}` });
  });
}

// ---------- 방명록 ----------
let guestbook, lanterns, qna;
const guestCooldown = cooldown(30 * 1000);
const SKIES = ['dawn', 'day', 'sunset', 'night'];

function handleGuestbook(req, res) {
  if (req.method === 'GET') return send(res, 200, { entries: guestbook.all().slice(-100).reverse() });
  if (req.method !== 'POST') return fail(res, 405, '지원하지 않는 요청이에요');
  readJson(req, res, 4096, (body) => {
    const message = clean(body.message, 140);
    if (!message) return fail(res, 400, '남길 말을 적어 주세요');
    if (!guestCooldown(req)) return fail(res, 429, '잠시 후에 다시 남겨 주세요');
    const entry = { id: newId(), name: clean(body.name, 12) || '익명의 산책자', message, sky: SKIES.includes(body.sky) ? body.sky : 'day', at: Date.now() };
    guestbook.add(entry);
    send(res, 201, { entry });
  });
}

// ---------- 소원 풍등 ----------
const lanternCooldown = cooldown(20 * 1000);

function handleLanterns(req, res) {
  if (req.method === 'GET') {
    const since = Date.now() - 24 * 3600 * 1000;
    const today = lanterns.all().filter((l) => l.at > since);
    return send(res, 200, { lanterns: today.slice(-80).reverse(), today: today.length });
  }
  if (req.method !== 'POST') return fail(res, 405, '지원하지 않는 요청이에요');
  readJson(req, res, 1024, (body) => {
    const wish = clean(body.wish, 40);
    if (!wish) return fail(res, 400, '소원을 적어 주세요');
    if (!lanternCooldown(req)) return fail(res, 429, '풍등은 잠시 후에 다시 띄울 수 있어요');
    const lantern = { id: newId(), wish, at: Date.now() };
    lanterns.add(lantern);
    send(res, 201, { lantern });
  });
}

// ---------- 좋아요 ----------
// 어떤 점이 좋았는지(여러 개)와 한 줄 메모. 같은 사람은 6시간에 한 번
let likes;
const likeCooldown = cooldown(6 * 3600 * 1000);
const LIKE_REASONS = ['sunset', 'night', 'stars', 'lantern', 'sound', 'breath', 'etc'];

function likeSummary() {
  const all = likes.all(), counts = Object.fromEntries(LIKE_REASONS.map((r) => [r, 0]));
  for (const l of all) for (const r of l.reasons || []) if (r in counts) counts[r]++;
  const comments = all.filter((l) => l.comment).slice(-30).reverse().map((l) => ({ id: l.id, reasons: l.reasons, comment: l.comment, at: l.at }));
  return { total: all.length, counts, comments };
}

function handleLikes(req, res) {
  if (req.method === 'GET') return send(res, 200, likeSummary());
  if (req.method !== 'POST') return fail(res, 405, '지원하지 않는 요청이에요');
  readJson(req, res, 1024, (body) => {
    const reasons = [...new Set(Array.isArray(body.reasons) ? body.reasons : [])].filter((r) => LIKE_REASONS.includes(r));
    if (!reasons.length) return fail(res, 400, '좋았던 점을 하나 이상 골라 주세요');
    if (!likeCooldown(req)) return fail(res, 429, '이미 좋아요를 보내 주셨어요. 고마워요!');
    likes.add({ id: newId(), reasons, comment: clean(body.comment, 60), at: Date.now() });
    send(res, 201, likeSummary());
  });
}

// ---------- 묻고 답하기 ----------
// 질문을 쓰면 그 사람만 아는 열쇠(key)를 돌려줌. 브라우저가 열쇠를 기억해 두었다가
// 비밀글을 볼 때, 내 질문을 지울 때, 답변 알림을 받을 때 씀
const qnaCooldown = cooldown(60 * 1000);
const CATEGORIES = ['question', 'idea', 'report']; // 질문 · 아이디어 제안 · 불편해요

// 요청 헤더 x-qna-keys: "id.key,id.key" → 이 사람이 가진 질문 id 목록
function ownedIds(req) {
  const owned = new Set();
  for (const pair of String(req.headers['x-qna-keys'] || '').split(',').slice(0, 50)) {
    const [id, key] = pair.trim().split('.');
    const q = id && key && qna.find(id);
    if (q && sameHash(key, q.key)) owned.add(id);
  }
  return owned;
}

// 밖으로 내보낼 모양 (열쇠는 절대 내보내지 않고, 비밀글은 주인과 글쓴이에게만 보임)
function publicQ(q, owned, admin) {
  const mine = owned.has(q.id), visible = !q.private || mine || admin;
  return {
    id: q.id, name: q.name, at: q.at, private: !!q.private, mine, category: q.category || 'question',
    question: visible ? q.question : null,
    answer: q.answer ? (visible ? q.answer : null) : null,
    answered: !!q.answer, answeredAt: q.answeredAt || null,
  };
}

function handleQna(req, res) {
  if (req.method === 'GET') {
    const owned = ownedIds(req), admin = isAdmin(req);
    const list = qna.all().slice(-100).reverse().map((q) => publicQ(q, owned, admin));
    return send(res, 200, { questions: list, unanswered: admin ? qna.all().filter((q) => !q.answer).length : undefined });
  }
  if (req.method !== 'POST') return fail(res, 405, '지원하지 않는 요청이에요');
  readJson(req, res, 4096, (body) => {
    const question = clean(body.question, 500, true);
    if (question.length < 2) return fail(res, 400, '궁금한 점을 적어 주세요');
    if (!qnaCooldown(req)) return fail(res, 429, '질문은 1분에 한 번 남길 수 있어요');
    const key = crypto.randomBytes(16).toString('hex');
    const category = CATEGORIES.includes(body.category) ? body.category : 'question';
    const q = { id: newId(), name: clean(body.name, 12) || '익명의 산책자', category, question, private: !!body.private, key, at: Date.now() };
    qna.add(q);
    send(res, 201, { question: publicQ(q, new Set([q.id]), false), key });
  });
}

// 내 질문 지우기(열쇠) 또는 관리자 삭제
function handleQnaDelete(req, res) {
  if (req.method !== 'POST') return fail(res, 405, '지원하지 않는 요청이에요');
  readJson(req, res, 512, (body) => {
    const id = String(body.id || '');
    if (!isAdmin(req) && !ownedIds(req).has(id)) return fail(res, 403, '내가 쓴 질문만 지울 수 있어요');
    if (!qna.remove(id)) return fail(res, 404, '이미 지워진 질문이에요');
    send(res, 200, { ok: true });
  });
}

// 관리자 전용: 출입증이 없으면 401
function adminOnly(handler) {
  return (req, res) => (isAdmin(req) ? handler(req, res) : fail(res, 401, '관리자만 할 수 있어요. 다시 들어와 주세요'));
}

function handleAdminAnswer(req, res) {
  if (req.method !== 'POST') return fail(res, 405, '지원하지 않는 요청이에요');
  readJson(req, res, 8192, (body) => {
    const answer = clean(body.answer, 1000, true);
    const q = qna.update(String(body.id || ''), answer ? { answer, answeredAt: Date.now() } : { answer: undefined, answeredAt: undefined });
    if (!q) return fail(res, 404, '질문을 찾을 수 없어요');
    send(res, 200, { question: publicQ(q, new Set(), true) });
  });
}

function handleAdminDelete(req, res) {
  if (req.method !== 'POST') return fail(res, 405, '지원하지 않는 요청이에요');
  readJson(req, res, 512, (body) => {
    const store = { guestbook, lanterns, qna, likes }[body.kind];
    if (!store) return fail(res, 400, '잘못된 요청이에요');
    if (!store.remove(String(body.id || ''))) return fail(res, 404, '이미 지워진 글이에요');
    send(res, 200, { ok: true });
  });
}

// ---------- 함께 보는 사람 수 ----------
// 열려 있는 창마다 25초 간격으로 신호를 보내고, 90초 안에 신호가 온 창을 '함께 보는 사람'으로 셉니다.
const PRESENCE_WINDOW_MS = 90 * 1000;
const PRESENCE_MAX = 10000;
const visitors = new Map(); // 창 id → 마지막 신호 시각

function countVisitors() {
  const now = Date.now();
  for (const [id, at] of visitors) if (now - at > PRESENCE_WINDOW_MS) visitors.delete(id);
  return visitors.size;
}

function handlePresence(req, res, leave) {
  if (req.method !== 'POST') return fail(res, 405, '지원하지 않는 요청이에요');
  readJson(req, res, 256, (body) => {
    const id = String(body.id || '');
    if (!/^[a-z0-9-]{8,40}$/i.test(id)) return fail(res, 400, '잘못된 요청이에요');
    if (leave) visitors.delete(id);
    else if (visitors.has(id) || countVisitors() < PRESENCE_MAX) visitors.set(id, Date.now());
    send(res, 200, { count: countVisitors() });
  });
}

// ---------- 휴대폰 접속 주소 ----------
// 같은 와이파이에 연결된 휴대폰에서 이 컴퓨터로 들어올 수 있는 주소
function lanUrls() {
  const urls = [];
  if (BEHIND_PROXY) return urls; // 인터넷 서버에서는 내부 주소가 의미 없음
  for (const list of Object.values(os.networkInterfaces())) {
    for (const a of list || []) if (a.family === 'IPv4' && !a.internal) urls.push(`http://${a.address}:${PORT}`);
  }
  return urls;
}

// ---------- 서버 ----------
const ROUTES = {
  '/api/info': (req, res) => send(res, 200, { urls: lanUrls() }),
  '/api/guestbook': handleGuestbook,
  '/api/lanterns': handleLanterns,
  '/api/likes': handleLikes,
  '/api/qna': handleQna,
  '/api/qna/delete': handleQnaDelete,
  '/api/admin/login': handleAdminLogin,
  '/api/admin/check': adminOnly((req, res) => send(res, 200, { ok: true })),
  '/api/admin/answer': adminOnly(handleAdminAnswer),
  '/api/admin/delete': adminOnly(handleAdminDelete),
  '/api/presence': (req, res) => handlePresence(req, res, false),
  '/api/presence/leave': (req, res) => handlePresence(req, res, true),
};

function handle(req, res) {
  let url;
  try { url = decodeURIComponent(req.url.split('?')[0]); } catch (e) { res.writeHead(400); res.end(); return; } // 잘못된 주소에 서버가 꺼지지 않도록
  if (ROUTES[url]) { ROUTES[url](req, res); return; }

  const file = path.join(ROOT, url === '/' ? 'index.html' : url);
  // 저장된 기록(data), 숨김 파일(.git 등), 서버 코드, 설치된 패키지는 내려주지 않음
  const hidden = url.split('/').some((p) => p.startsWith('.')) || PRIVATE_FILES.includes(url) || url.startsWith('/node_modules');
  if (!file.startsWith(ROOT) || file.startsWith(DATA_DIR) || hidden) { res.writeHead(403); res.end(); return; }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); res.end('Not found'); return; }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
    res.end(data);
  });
}

async function start() {
  const mode = await db.init(DATA_DIR);
  [guestbook, lanterns, qna, likes] = await Promise.all([
    db.createStore('guestbook', 500),
    db.createStore('lanterns', 1000),
    db.createStore('qna', 1000),
    db.createStore('likes', 5000),
  ]);
  http.createServer(handle).listen(PORT, () => {
    console.log(`식장산 힐링 전망대: http://localhost:${PORT}`);
    console.log(`저장 방식: ${mode === 'database' ? '데이터베이스 (오래 보관)' : 'data 폴더 파일'} · 관리자 기능: ${ADMIN_PASSWORD ? '켜짐' : '꺼짐 (ADMIN_PASSWORD 없음)'}`);
    for (const u of lanUrls()) console.log(`휴대폰에서 (같은 와이파이): ${u}`);
  });
}

start().catch((e) => {
  console.error('서버를 시작하지 못했어요:', e.message);
  process.exit(1);
});
