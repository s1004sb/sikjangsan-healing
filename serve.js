// 로컬 서버: node serve.js → http://localhost:5173
// 정적 파일과 방명록·풍등·접속 신호 API를 함께 제공합니다. 글은 data/ 폴더의 JSON 파일에 저장돼요.
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

const ROOT = __dirname;
const PORT = process.env.PORT || 5173;
const DATA_DIR = path.join(ROOT, 'data');
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.json': 'application/json; charset=utf-8', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.m4a': 'audio/mp4', '.wav': 'audio/wav', '.webmanifest': 'application/manifest+json', '.txt': 'text/plain; charset=utf-8', '.xml': 'application/xml; charset=utf-8' };

// ---------- 공통 ----------
// data/<name>.json에 최근 maxKeep개를 보관하는 저장소
function createStore(name, maxKeep) {
  const file = path.join(DATA_DIR, name + '.json');
  let items = [];
  try { items = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { items = []; }
  return {
    all: () => items,
    add(item) {
      items.push(item);
      if (items.length > maxKeep) items = items.slice(-maxKeep);
      try {
        fs.mkdirSync(DATA_DIR, { recursive: true });
        const tmp = file + '.tmp';
        fs.writeFileSync(tmp, JSON.stringify(items, null, 1));
        fs.renameSync(tmp, file);
      } catch (e) { console.error(`${name} 저장 실패:`, e.message); }
    },
  };
}

// 제어 문자 제거, 공백 정리
const clean = (s, max) => String(s || '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

function send(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
}

// 요청 본문을 JSON으로 읽기 (limit 바이트 초과·형식 오류는 거절)
function readJson(req, res, limit, done) {
  let raw = '';
  req.on('data', (chunk) => {
    raw += chunk;
    if (raw.length > limit) { send(res, 413, { error: '글이 너무 길어요' }); req.destroy(); }
  });
  req.on('end', () => {
    if (res.writableEnded) return;
    let body;
    try { body = JSON.parse(raw); } catch (e) { send(res, 400, { error: '잘못된 요청이에요' }); return; }
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

// ---------- 방명록 ----------
const guestbook = createStore('guestbook', 500);
const guestCooldown = cooldown(30 * 1000);
const SKIES = ['dawn', 'day', 'sunset', 'night'];

function handleGuestbook(req, res) {
  if (req.method === 'GET') { send(res, 200, { entries: guestbook.all().slice(-100).reverse() }); return; }
  if (req.method !== 'POST') { send(res, 405, { error: '지원하지 않는 요청이에요' }); return; }
  readJson(req, res, 4096, (body) => {
    const message = clean(body.message, 140);
    if (!message) { send(res, 400, { error: '남길 말을 적어 주세요' }); return; }
    if (!guestCooldown(req)) { send(res, 429, { error: '잠시 후에 다시 남겨 주세요' }); return; }
    const entry = { id: newId(), name: clean(body.name, 12) || '익명의 산책자', message, sky: SKIES.includes(body.sky) ? body.sky : 'day', at: Date.now() };
    guestbook.add(entry);
    send(res, 201, { entry });
  });
}

// ---------- 소원 풍등 ----------
const lanterns = createStore('lanterns', 1000);
const lanternCooldown = cooldown(20 * 1000);

function handleLanterns(req, res) {
  if (req.method === 'GET') {
    const since = Date.now() - 24 * 3600 * 1000;
    const today = lanterns.all().filter((l) => l.at > since);
    send(res, 200, { lanterns: today.slice(-80).reverse(), today: today.length });
    return;
  }
  if (req.method !== 'POST') { send(res, 405, { error: '지원하지 않는 요청이에요' }); return; }
  readJson(req, res, 1024, (body) => {
    const wish = clean(body.wish, 40);
    if (!wish) { send(res, 400, { error: '소원을 적어 주세요' }); return; }
    if (!lanternCooldown(req)) { send(res, 429, { error: '풍등은 잠시 후에 다시 띄울 수 있어요' }); return; }
    const lantern = { id: newId(), wish, at: Date.now() };
    lanterns.add(lantern);
    send(res, 201, { lantern });
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
  if (req.method !== 'POST') { send(res, 405, { error: '지원하지 않는 요청이에요' }); return; }
  readJson(req, res, 256, (body) => {
    const id = String(body.id || '');
    if (!/^[a-z0-9-]{8,40}$/i.test(id)) { send(res, 400, { error: '잘못된 요청이에요' }); return; }
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
  '/api/presence': (req, res) => handlePresence(req, res, false),
  '/api/presence/leave': (req, res) => handlePresence(req, res, true),
};

http.createServer((req, res) => {
  let url;
  try { url = decodeURIComponent(req.url.split('?')[0]); } catch (e) { res.writeHead(400); res.end(); return; } // 잘못된 주소에 서버가 꺼지지 않도록
  if (ROUTES[url]) { ROUTES[url](req, res); return; }

  const file = path.join(ROOT, url === '/' ? 'index.html' : url);
  // 저장된 기록(data), 숨김 파일(.git 등), 서버 코드는 내려주지 않음
  const hidden = url.split('/').some((p) => p.startsWith('.')) || ['/serve.js', '/package.json', '/render.yaml'].includes(url);
  if (!file.startsWith(ROOT) || file.startsWith(DATA_DIR) || hidden) { res.writeHead(403); res.end(); return; }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); res.end('Not found'); return; }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
    res.end(data);
  });
}).listen(PORT, () => {
  console.log(`식장산 힐링 전망대: http://localhost:${PORT}`);
  for (const u of lanUrls()) console.log(`휴대폰에서 (같은 와이파이): ${u}`);
});
