/* 식장산 풍경 렌더러 — 하늘, 해·달·별, 대전 시내, 산 능선을 캔버스에 그립니다.
   화면 좌표는 (방위각, 고도)를 도 단위로 펼친 파노라마입니다. */
const Scene = (() => {
  'use strict';
  const LAT = 36.2885, LNG = 127.4905; // 식장산 정상 부근
  const rad = Math.PI / 180;
  const CITY_AZ = 305; // 식장산에서 본 대전 도심(둔산) 방향
  const RES = 4;       // 지형 표본: 1도당 4개

  // ---------- 도구 ----------
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  const wrap = (d) => ((d % 360) + 540) % 360 - 180;
  const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  const mix = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
  const shade = (c, k) => [c[0] * k, c[1] * k, c[2] * k];
  const rgba = (c, a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;

  function rng(seed) {
    return () => {
      seed = (seed + 0x6D2B79F5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function gauss(r) {
    let u = 0, v = 0;
    while (!u) u = r();
    while (!v) v = r();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  // ---------- 하늘 색 (해의 고도별 천정·중간·지평선) ----------
  const SKY = [
    [-90, '#02030a', '#03050f', '#060a1a'],
    [-18, '#02030a', '#04071a', '#0a1030'],
    [-12, '#040820', '#0a1236', '#1a2350'],
    [-8, '#0a1438', '#1c2a5e', '#3b3a6e'],
    [-4, '#16285a', '#3a4a86', '#9a6a7a'],
    [-1, '#22407a', '#5a6aa0', '#e08a6a'],
    [2, '#2f5a98', '#6f8fc0', '#f5a96a'],
    [6, '#3a6db0', '#7fa8d8', '#f3c99a'],
    [12, '#3f78c0', '#86b4e2', '#cfe0ee'],
    [30, '#3274c8', '#79afe6', '#cfe5f5'],
    [90, '#2a6cc4', '#6fa6e2', '#c9e2f6'],
  ].map(([a, z, m, h]) => [a, hex(z), hex(m), hex(h)]);

  function skyAt(alt) {
    for (let i = 1; i < SKY.length; i++) {
      if (alt <= SKY[i][0]) {
        const A = SKY[i - 1], B = SKY[i], t = (alt - A[0]) / (B[0] - A[0]);
        return { zen: mix(A[1], B[1], t), mid: mix(A[2], B[2], t), hor: mix(A[3], B[3], t) };
      }
    }
    const L = SKY[SKY.length - 1];
    return { zen: L[1], mid: L[2], hor: L[3] };
  }

  // 계절별 낮 색 [가까운 능선, 중간 능선, 먼 능선]
  const PAL = {
    spring: ['#5b7d45', '#7a9373', '#a3b6c6'],
    summer: ['#355f2e', '#5b7d5c', '#97aec3'],
    autumn: ['#7d5a2f', '#8b7d60', '#a9b2be'],
    winter: ['#5d5a4f', '#7f838b', '#b4bdca'],
  };
  for (const k in PAL) PAL[k] = PAL[k].map(hex);
  const NIGHT_PAL = [[6, 8, 15], [10, 14, 27], [18, 25, 46]];
  const season = (m) => (m >= 3 && m <= 5 ? 'spring' : m >= 6 && m <= 9 ? 'summer' : m >= 10 && m <= 11 ? 'autumn' : 'winter');

  // ---------- 밝은 별 (적경 h, 적위 °, 등급) ----------
  const ORANGE = [255, 200, 150], BLUE = [200, 218, 255];
  const NAMED = [
    ['북극성', 2.530, 89.264, 2.0],
    ['두베', 11.062, 61.751, 1.8], ['메라크', 11.031, 56.382, 2.4], ['페크다', 11.897, 53.695, 2.4], ['메그레즈', 12.257, 57.033, 3.3],
    ['알리오스', 12.900, 55.960, 1.8], ['미자르', 13.399, 54.925, 2.2], ['알카이드', 13.792, 49.313, 1.9],
    ['베텔게우스', 5.919, 7.407, 0.5, ORANGE], ['리겔', 5.242, -8.202, 0.1, BLUE], ['벨라트릭스', 5.419, 6.350, 1.6, BLUE],
    ['민타카', 5.533, -0.299, 2.2], ['알닐람', 5.604, -1.202, 1.7], ['알니탁', 5.679, -1.943, 1.8], ['사이프', 5.796, -9.670, 2.1],
    ['카프', 0.153, 59.150, 2.3], ['쉐다르', 0.675, 56.537, 2.2], ['감마', 0.945, 60.717, 2.5], ['루크바', 1.430, 60.235, 2.7], ['세긴', 1.907, 63.670, 3.4],
    ['시리우스', 6.752, -16.716, -1.46, BLUE], ['베가', 18.616, 38.784, 0.03, BLUE], ['알타이르', 19.846, 8.868, 0.77],
    ['데네브', 20.690, 45.280, 1.25], ['아크투루스', 14.261, 19.182, -0.05, ORANGE], ['안타레스', 16.490, -26.432, 1.0, [255, 170, 130]],
    ['스피카', 13.420, -11.161, 0.97, BLUE], ['카펠라', 5.278, 45.998, 0.08, [255, 240, 205]], ['알데바란', 4.599, 16.509, 0.85, ORANGE],
    ['프로키온', 7.655, 5.225, 0.34], ['폴룩스', 7.755, 28.026, 1.14, [255, 225, 185]], ['카스토르', 7.577, 31.888, 1.58],
    ['레굴루스', 10.140, 11.967, 1.35, BLUE], ['포말하우트', 22.961, -29.622, 1.16],
  ];
  const CONSTELLATIONS = [
    { name: '북두칠성', lines: [[1, 2], [2, 3], [3, 4], [4, 1], [4, 5], [5, 6], [6, 7]] },
    { name: '오리온자리', lines: [[8, 10], [8, 13], [10, 11], [11, 12], [12, 13], [13, 14], [11, 9]] },
    { name: '카시오페이아', lines: [[15, 16], [16, 17], [17, 18], [18, 19]] },
    { name: '여름철 대삼각형', lines: [[21, 23], [23, 22], [22, 21]] },
    { name: '쌍둥이자리', lines: [[30, 31]] },
  ];

  // ---------- 상태 ----------
  let cv, ctx, W = 0, H = 0, DPR = 1, ppd = 20, hy = 0, vAz = 0;
  const T = {};
  let stars = [], milky = [], named = [], lights = [], trees = [], clouds = [], cars = [], meteors = [], drops = [];
  let lanterns = [], fall = [], fallKind = '', fireflies = [];
  let sprites = {}, vignette = null;
  const P = { az: 0, alt: 0 };

  const X = (az) => W / 2 + wrap(az - vAz) * ppd;
  const Y = (alt) => hy - alt * ppd;

  // ---------- 지형 ----------
  function makeSines(r, n, kmin, kmax, amp) {
    const a = [];
    for (let i = 0; i < n; i++) {
      const k = kmin + Math.floor(r() * (kmax - kmin));
      a.push([k, amp * (0.4 + r() * 0.6) / Math.sqrt(k / kmin), r() * Math.PI * 2]);
    }
    return a;
  }
  function sines(az, s) {
    let v = 0;
    for (let i = 0; i < s.length; i++) v += s[i][1] * Math.sin(s[i][0] * az * rad + s[i][2]);
    return v;
  }
  const bump = (az, c, w, h) => { const d = wrap(az - c); return h * Math.exp(-d * d / (2 * w * w)); };
  const cityMask = (az) => 1 - smooth(48, 72, Math.abs(wrap(az - CITY_AZ)));
  function tAt(arr, az) {
    const f = (((az % 360) + 360) % 360) * RES, i = Math.floor(f), t = f - i, n = arr.length;
    return arr[i % n] * (1 - t) + arr[(i + 1) % n] * t;
  }

  function buildTerrain() {
    const r = rng(598);
    const S = {
      far: makeSines(r, 6, 3, 14, 0.35), farF: makeSines(r, 10, 20, 90, 0.07),
      mid: makeSines(r, 6, 4, 20, 0.6), midF: makeSines(r, 10, 25, 110, 0.1), plain: makeSines(r, 4, 6, 30, 0.08),
      near: makeSines(r, 5, 2, 9, 1.3), nearF: makeSines(r, 10, 18, 80, 0.22), near2: makeSines(r, 4, 3, 12, 0.7),
    };
    const n = 360 * RES;
    T.far = new Float32Array(n); T.mid = new Float32Array(n); T.near = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const az = i / RES, m = cityMask(az);
      // 먼 산: 계룡산(서), 서대산(남), 옥천 산줄기(동)
      T.far[i] = 0.55 + sines(az, S.far) + sines(az, S.farF)
        + bump(az, 283, 3, 1.5) + bump(az, 288, 2.2, 0.7) + bump(az, 190, 4, 1.2) + bump(az, 105, 20, 0.6) + bump(az, 60, 8, 0.4);
      // 중간: 동쪽은 산, 서쪽은 대전 분지(평지) + 계족산
      const mt = 0.2 + sines(az, S.mid) + sines(az, S.midF);
      const pl = -1.05 + sines(az, S.plain);
      T.mid[i] = lerp(mt, pl, m) + bump(az, 342, 4.5, 1.7);
      // 가까운 식장산 비탈
      const nm = -3.4 + sines(az, S.near) + sines(az, S.nearF);
      const nc = -9.6 + sines(az, S.near2) * 0.6 + sines(az, S.nearF) * 0.5;
      T.near[i] = Math.min(-0.8, lerp(nm, nc, m));
    }
  }

  const LABELS = [
    { t: '계룡산', az: 283, layer: 'far', up: 0.2 },
    { t: '보문산', az: 276, layer: 'mid', up: 0.1 },
    { t: '대전 도심 · 둔산', az: 305, layer: 'mid', up: 0.15 },
    { t: '대전역', az: 313, alt: -4.2 },
    { t: '계족산', az: 342, layer: 'mid', up: 0.1 },
    { t: '대청호 방면', az: 8, layer: 'far', up: 0.2 },
    { t: '서대산', az: 190, layer: 'far', up: 0.2 },
    { t: '옥천 방면', az: 105, layer: 'far', up: 0.3 },
    { t: '송신탑', az: 42, layer: 'near', up: 7.6 },
  ];

  // ---------- 대전 시내 ----------
  const ROADS = [
    [[258, -9.0], [268, -7.4], [281, -5.6], [294, -4.1], [306, -3.0], [320, -2.2], [336, -1.7]],
    [[322, -9.2], [316, -7.0], [309, -5.2], [303, -3.6], [299, -2.3]],
    [[286, -8.8], [292, -6.6], [300, -4.9], [312, -3.4]],
  ].map((pts) => {
    const len = [0];
    for (let i = 1; i < pts.length; i++) len.push(len[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
    return { pts, len, total: len[len.length - 1] };
  });
  function roadPoint(road, t) {
    const d = t * road.total;
    let i = 1;
    while (i < road.len.length - 1 && road.len[i] < d) i++;
    const a = road.pts[i - 1], b = road.pts[i], k = (d - road.len[i - 1]) / (road.len[i] - road.len[i - 1]);
    P.az = lerp(a[0], b[0], k); P.alt = lerp(a[1], b[1], k);
  }

  const LIGHT_COLS = [[255, 206, 140], [255, 244, 225], [200, 225, 255], [255, 150, 110]];

  function buildCity() {
    const r = rng(42);
    lights = [];
    for (let tries = 0; lights.length < 3200 && tries < 60000; tries++) {
      const az = CITY_AZ + gauss(r) * 26;
      if (r() > cityMask(az)) continue;
      if (Math.abs(wrap(az - 342)) < 5 && r() < 0.85) continue;
      const depth = Math.pow(r(), 1.5); // 0 = 멀리, 1 = 가까이
      const alt = -1.15 - depth * 8.6;
      if (alt > tAt(T.mid, az) - 0.08 || alt < tAt(T.near, az) + 0.05) continue;
      const c = r(), ci = c < 0.55 ? 0 : c < 0.85 ? 1 : c < 0.95 ? 2 : 3;
      lights.push({
        az, alt, depth, ci, css: rgba(LIGHT_COLS[ci]),
        size: 0.7 + depth * 1.6 + r() * 0.5, ph: r() * 6.28, on: r(),
        bld: r() < 0.5, bh: 0.12 + depth * 0.55 * r(), bw: 0.08 + depth * 0.22,
      });
    }
    cars = [];
    ROADS.forEach((road, ri) => {
      for (let i = 0; i < 34; i++) cars.push({ road: ri, t: r(), dir: r() < 0.5 ? 1 : -1, sp: (0.006 + r() * 0.006) * (ri === 0 ? 1.4 : 1) });
    });
  }

  function buildTrees() {
    const r = rng(7);
    trees = [];
    for (let i = 0; i < 300; i++) {
      const az = r() * 360;
      if (Math.abs(wrap(az - 252)) < 5) continue; // 식장루 자리
      const h = (0.5 + r() * 1.1) * (cityMask(az) > 0.5 ? 1.25 : 1);
      const tiers = [];
      for (let k = 1; k <= 4; k++) tiers.push(0.8 + r() * 0.45);
      trees.push({ az, h, w: h * (0.45 + r() * 0.3), tiers });
    }
  }

  // ---------- 하늘 ----------
  function mkStar(ra, dec, mag, col, ph) {
    return { ra, sd: Math.sin(dec), cd: Math.cos(dec), td: Math.tan(dec), mag, col, ph: ph * 6.283, tw: 0.8 + ph * 2.5 };
  }

  function buildSky() {
    const r = rng(2026);
    const COLS = [[255, 255, 255], [205, 222, 255], [255, 240, 214], [255, 214, 170]];
    stars = [];
    for (let i = 0; i < 1500; i++) {
      const s = mkStar(r() * Math.PI * 2, Math.asin(2 * r() - 1), 6.6 - 5 * Math.pow(r(), 3.2), null, r());
      s.css = rgba(COLS[r() < 0.6 ? 0 : 1 + Math.floor(r() * 3)]);
      stars.push(s);
    }
    named = NAMED.map(([name, raH, decD, mag, col]) => {
      const s = mkStar(raH * 15 * rad, decD * rad, mag, col || [255, 255, 255], r());
      s.name = name;
      s.css = rgba(s.col);
      return s;
    });
    // 은하수: 은하 좌표에서 적도 좌표로 변환
    const aG = 192.85948 * rad, dG = 27.12825 * rad, lN = 122.93192 * rad;
    milky = [];
    for (let i = 0; i < 1800; i++) {
      const lDeg = r() < 0.5 ? gauss(r) * 45 : r() * 360;
      const l = lDeg * rad, b = gauss(r) * (3 + 5 * r()) * rad;
      const dec = Math.asin(Math.sin(b) * Math.sin(dG) + Math.cos(b) * Math.cos(dG) * Math.cos(lN - l));
      const ra = aG + Math.atan2(Math.cos(b) * Math.sin(lN - l), Math.sin(b) * Math.cos(dG) - Math.cos(b) * Math.sin(dG) * Math.cos(lN - l));
      const s = mkStar(ra, dec, 0, null, r());
      s.a = (0.03 + 0.07 * Math.exp(-Math.pow(wrap(lDeg) / 60, 2))) * (0.5 + r());
      s.s = 0.8 + r() * 1.6; // 도 단위 크기
      milky.push(s);
    }
    clouds = [];
    for (let i = 0; i < 18; i++) {
      const w = 8 + r() * 22, n = 5 + Math.floor(r() * 7), puffs = [];
      for (let j = 0; j < n; j++) {
        const dx = (r() - 0.5) * w, pr = w * (0.12 + r() * 0.16) * (1 - Math.abs(dx) / w * 0.8);
        puffs.push({ dx, dy: (r() - 0.3) * pr * 0.6, r: pr });
      }
      clouds.push({ az: r() * 360, alt: 6 + r() * 26, puffs, sp: 0.6 + r() * 0.8 });
    }
  }

  function starPos(s, lst, sinP, cosP) {
    const H = lst - s.ra, cH = Math.cos(H);
    const sa = sinP * s.sd + cosP * s.cd * cH;
    if (sa < -0.02) return false;
    P.alt = Math.asin(sa) / rad;
    P.az = Math.atan2(Math.sin(H), cH * sinP - s.td * cosP) / rad + 180;
    return true;
  }

  function makeGlow(c) {
    const s = document.createElement('canvas');
    s.width = s.height = 64;
    const g = s.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, rgba(c, 1)); gr.addColorStop(0.2, rgba(c, 0.5)); gr.addColorStop(1, rgba(c, 0));
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    return s;
  }

  function resize() {
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    W = cv.clientWidth; H = cv.clientHeight;
    cv.width = Math.round(W * DPR); cv.height = Math.round(H * DPR);
    vignette = ctx.createRadialGradient(W / 2, H * 0.55, Math.min(W, H) * 0.35, W / 2, H * 0.55, Math.max(W, H) * 0.85);
    vignette.addColorStop(0, 'rgba(0,0,0,0)'); vignette.addColorStop(1, 'rgba(0,0,0,0.38)');
  }

  function init(canvas) {
    cv = canvas; ctx = cv.getContext('2d');
    buildTerrain(); buildCity(); buildTrees(); buildSky(); buildFireflies();
    sprites = {
      white: makeGlow([255, 255, 255]), milky: makeGlow([195, 205, 255]), lights: LIGHT_COLS.map(makeGlow),
      red: makeGlow([255, 60, 50]), warm: makeGlow([255, 190, 120]), firefly: makeGlow([205, 255, 130]),
    };
    resize();
  }

  // ---------- 그리기 ----------
  function drawSky(sky) {
    const g = ctx.createLinearGradient(0, Y(0), 0, Y(70));
    g.addColorStop(0, rgba(sky.hor)); g.addColorStop(0.22, rgba(sky.mid)); g.addColorStop(1, rgba(sky.zen));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }

  function drawStars(lst, vis, lp, t, opts) {
    const sinP = Math.sin(LAT * rad), cosP = Math.cos(LAT * rad);
    const top = hy / ppd + 3, half = W / 2 / ppd + 3;
    ctx.globalCompositeOperation = 'lighter';
    // 은하수
    for (const s of milky) {
      if (!starPos(s, lst, sinP, cosP) || P.alt > top) continue;
      const dx = wrap(P.az - vAz);
      if (Math.abs(dx) > half) continue;
      const a = s.a * vis * smooth(2, 25, P.alt) * (1 - 0.95 * lp(P.az) * (1 - smooth(5, 45, P.alt)));
      if (a < 0.004) continue;
      const sz = s.s * ppd;
      ctx.globalAlpha = a;
      ctx.drawImage(sprites.milky, W / 2 + dx * ppd - sz, Y(P.alt) - sz, sz * 2, sz * 2);
    }
    // 별
    for (const s of stars) {
      if (!starPos(s, lst, sinP, cosP) || P.alt > top) continue;
      const dx = wrap(P.az - vAz);
      if (Math.abs(dx) > half) continue;
      const pol = lp(P.az) * (1 - smooth(3, 35, P.alt)) * (s.mag > 3.5 ? 1 : 0.5);
      const twk = 0.72 + 0.28 * Math.sin(t * s.tw + s.ph);
      const a = vis * clamp((6.9 - s.mag) / 6, 0, 1) * smooth(-1, 14, P.alt) * (1 - pol) * twk;
      if (a < 0.02) continue;
      const sz = 0.5 + (6.6 - s.mag) * 0.3;
      ctx.globalAlpha = a;
      ctx.fillStyle = s.css;
      ctx.fillRect(W / 2 + dx * ppd - sz / 2, Y(P.alt) - sz / 2, sz, sz);
    }
    // 밝은 별 (반짝임과 빛 번짐)
    const pos = [];
    for (const s of named) {
      if (!starPos(s, lst, sinP, cosP)) { pos.push(null); continue; }
      const dx = wrap(P.az - vAz);
      pos.push({ x: W / 2 + dx * ppd, y: Y(P.alt), alt: P.alt, dx });
      if (Math.abs(dx) > half || P.alt > top) continue;
      const twk = 0.75 + 0.25 * Math.sin(t * s.tw * 1.4 + s.ph);
      const a = vis * clamp((4 - s.mag) / 4.5, 0.25, 1) * smooth(-1, 10, P.alt) * twk;
      if (a < 0.02) continue;
      const x = W / 2 + dx * ppd, y = Y(P.alt), g = 3 + (2.5 - s.mag) * 2.2;
      ctx.globalAlpha = a * 0.7;
      ctx.drawImage(sprites.white, x - g, y - g, g * 2, g * 2);
      ctx.globalAlpha = a;
      ctx.fillStyle = s.css;
      const c = Math.max(1.2, 2.6 - s.mag * 0.45);
      ctx.beginPath(); ctx.arc(x, y, c, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    if (!opts.constellations || vis < 0.15) return;
    // 별자리 선과 이름
    ctx.strokeStyle = `rgba(170,190,255,${0.28 * vis})`;
    ctx.lineWidth = 1;
    ctx.fillStyle = `rgba(210,222,255,${0.75 * vis})`;
    ctx.font = '12px "Noto Sans KR", sans-serif';
    ctx.textAlign = 'center';
    for (const c of CONSTELLATIONS) {
      let sx = 0, sy = 0, n = 0;
      ctx.beginPath();
      for (const [i, j] of c.lines) {
        const a = pos[i], b = pos[j];
        if (!a || !b || a.alt < 1 || b.alt < 1 || Math.abs(a.x - b.x) > W / 2) continue;
        ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
        sx += a.x + b.x; sy += a.y + b.y; n += 2;
      }
      ctx.stroke();
      if (n && sx / n > -50 && sx / n < W + 50) ctx.fillText(c.name, sx / n, sy / n + 22);
    }
    ctx.font = '11px "Noto Sans KR", sans-serif';
    ctx.textAlign = 'left';
    ctx.fillStyle = `rgba(200,212,240,${0.6 * vis})`;
    named.forEach((s, i) => {
      const p = pos[i];
      if (p && s.mag < 1.3 && p.alt > 3 && Math.abs(p.dx) < W / 2 / ppd) ctx.fillText(s.name, p.x + 7, p.y - 6);
    });
  }

  function drawCityGlow(nf, cover) {
    if (nf < 0.01) return;
    const x = X(CITY_AZ), y = Y(-1.2), R = ppd * 18;
    if (x < -R * 3.4 || x > W + R * 3.4) return;
    ctx.save();
    ctx.translate(x, y); ctx.scale(3.2, 1);
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, R);
    g.addColorStop(0, `rgba(255,165,95,${0.3 * nf * (1 + cover * 0.4)})`);
    g.addColorStop(0.5, `rgba(240,140,110,${0.1 * nf})`);
    g.addColorStop(1, 'rgba(200,120,120,0)');
    ctx.fillStyle = g;
    ctx.fillRect(-R, -R, R * 2, R * 2);
    ctx.restore();
  }

  function drawSun(sun, cover) {
    const x = X(sun.az);
    if (Math.abs(x - W / 2) > W / 2 + ppd * 40) return;
    const low = 1 - smooth(0, 14, sun.alt);
    const clear = 1 - cover * 0.75;
    if (sun.alt > -16) {
      const gy = Y(Math.max(sun.alt, -1.5));
      const strength = (sun.alt > 0 ? 0.5 : 0.5 * smooth(-16, 0, sun.alt)) * (0.5 + 0.5 * clear);
      const R = ppd * (sun.alt > 10 ? 22 : 38);
      const c = mix([255, 244, 220], [255, 140, 70], low);
      const g = ctx.createRadialGradient(x, gy, 0, x, gy, R);
      g.addColorStop(0, rgba(c, strength)); g.addColorStop(0.25, rgba(c, strength * 0.35)); g.addColorStop(1, rgba(c, 0));
      ctx.fillStyle = g;
      ctx.fillRect(x - R, gy - R, R * 2, R * 2);
    }
    if (sun.alt > -1.5) {
      const y = Y(sun.alt), r = ppd * 0.55;
      const core = mix([255, 252, 240], [255, 140, 70], low);
      const g = ctx.createRadialGradient(x, y, 0, x, y, r * 5);
      g.addColorStop(0, rgba(core, clear)); g.addColorStop(0.2, rgba(core, clear));
      g.addColorStop(0.28, rgba(core, 0.35 * clear)); g.addColorStop(1, rgba(core, 0));
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(x, y, r * 5, 0, Math.PI * 2); ctx.fill();
    }
  }

  const MARIA = [[-0.25, -0.3, 0.28], [0.2, -0.18, 0.22], [0.05, 0.28, 0.25], [-0.38, 0.12, 0.15], [0.36, 0.25, 0.12]];
  function drawMoon(moon, il, sun, night, cover) {
    if (moon.alt < -2) return;
    const x = X(moon.az), y = Y(moon.alt), R = ppd * 0.62;
    if (x < -R * 30 || x > W + R * 30) return;
    const vis = (0.4 + 0.6 * night) * (1 - cover * 0.55);
    // 달무리
    const hR = R * (5 + 7 * night);
    const hg = ctx.createRadialGradient(x, y, R * 0.8, x, y, hR);
    hg.addColorStop(0, `rgba(205,218,255,${0.28 * il.fraction * vis * night})`); hg.addColorStop(1, 'rgba(205,218,255,0)');
    ctx.fillStyle = hg;
    ctx.fillRect(x - hR, y - hR, hR * 2, hR * 2);
    // 위상: 밝은 쪽이 해를 향하도록 회전
    const ang = Math.atan2(-(sun.alt - moon.alt), wrap(sun.az - moon.az));
    ctx.save();
    ctx.translate(x, y); ctx.rotate(ang);
    ctx.globalAlpha = vis;
    ctx.fillStyle = `rgba(38,44,64,${0.6 * night})`;
    ctx.beginPath(); ctx.arc(0, 0, R, 0, Math.PI * 2); ctx.fill();
    const f = il.fraction, rx = R * Math.abs(1 - 2 * f);
    ctx.beginPath();
    ctx.arc(0, 0, R, -Math.PI / 2, Math.PI / 2, false);
    ctx.ellipse(0, 0, rx, R, 0, Math.PI / 2, -Math.PI / 2, f < 0.5);
    ctx.closePath();
    ctx.fillStyle = rgba(mix([248, 244, 228], [232, 238, 250], 1 - night));
    ctx.fill();
    ctx.clip();
    ctx.rotate(-ang);
    ctx.fillStyle = 'rgba(140,140,132,0.28)';
    for (const [mx, my, mr] of MARIA) { ctx.beginPath(); ctx.arc(mx * R, my * R, mr * R, 0, Math.PI * 2); ctx.fill(); }
    ctx.restore();
  }

  function drawMeteors(vis, dt, onMeteor, rate) {
    const skyTop = Y(14);
    if (vis > 0.5 && skyTop > 60 && Math.random() < dt * 0.045 * rate) {
      const dir = Math.random() < 0.5 ? -1 : 1, sp = 500 + Math.random() * 400, an = (20 + Math.random() * 30) * rad;
      meteors.push({ x: W * (0.15 + Math.random() * 0.7), y: Math.random() * skyTop * 0.7, vx: dir * Math.cos(an) * sp, vy: Math.sin(an) * sp, life: 0, max: 0.6 + Math.random() * 0.6 });
      if (onMeteor) onMeteor();
    }
    ctx.lineCap = 'round';
    meteors = meteors.filter((m) => {
      m.life += dt; m.x += m.vx * dt; m.y += m.vy * dt;
      if (m.life > m.max) return false;
      const k = Math.sin(Math.PI * m.life / m.max), len = 0.18;
      const g = ctx.createLinearGradient(m.x, m.y, m.x - m.vx * len, m.y - m.vy * len);
      g.addColorStop(0, `rgba(255,255,255,${0.9 * k})`); g.addColorStop(1, 'rgba(180,200,255,0)');
      ctx.strokeStyle = g; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.moveTo(m.x, m.y); ctx.lineTo(m.x - m.vx * len, m.y - m.vy * len); ctx.stroke();
      return true;
    });
  }

  function drawClouds(sun, moon, il, cover, L, dt, wind) {
    const n = Math.round(clamp(cover, 0, 1) * clouds.length);
    const sunset = Math.exp(-Math.pow((sun.alt - 1) / 7, 2));
    const dayCol = mix([255, 255, 255], [196, 204, 214], cover * 0.7);
    const nightCol = mix([24, 30, 48], [62, 72, 100], il.fraction * smooth(0, 8, moon.alt));
    for (let i = 0; i < clouds.length; i++) {
      const c = clouds[i];
      c.az = (c.az + dt * c.sp * (0.12 + wind * 0.8)) % 360;
      if (i >= n) continue;
      const sc = 0.45 + c.alt / 35, cx = X(c.az);
      if (cx < -30 * ppd * sc || cx > W + 30 * ppd * sc) continue;
      const toward = (1 + Math.cos(wrap(c.az - sun.az) * rad)) / 2;
      let col = mix(nightCol, dayCol, L);
      col = mix(col, [255, 150, 110], sunset * (0.3 + 0.5 * toward));
      const a = 0.88 * (0.55 + 0.45 * L), edge = shade(col, 0.86);
      for (const p of c.puffs) {
        const x = X(c.az + p.dx * sc), y = Y(c.alt + p.dy * sc), R = p.r * sc * ppd;
        const g = ctx.createRadialGradient(x, y - R * 0.25, R * 0.1, x, y, R);
        g.addColorStop(0, rgba(col, a)); g.addColorStop(0.55, rgba(edge, a * 0.7)); g.addColorStop(1, rgba(edge, 0));
        ctx.fillStyle = g;
        ctx.fillRect(x - R, y - R, R * 2, R * 2);
      }
    }
  }

  // snow: 겨울철 능선을 따라 쌓인 눈의 진하기
  function drawRidge(arr, col, topAlt, snow = 0) {
    const step = 3, pts = [];
    for (let x = -step; x <= W + step; x += step) pts.push(x, Y(tAt(arr, vAz + (x - W / 2) / ppd)));
    ctx.beginPath();
    ctx.moveTo(-step, H + 10);
    for (let i = 0; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
    ctx.lineTo(W + step, H + 10);
    ctx.closePath();
    const g = ctx.createLinearGradient(0, Y(topAlt), 0, Y(topAlt - 9));
    g.addColorStop(0, rgba(col)); g.addColorStop(1, rgba(shade(col, 0.72)));
    ctx.fillStyle = g;
    ctx.fill();
    if (snow < 0.01) return;
    ctx.beginPath();
    ctx.moveTo(pts[0], pts[1] + 1);
    for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1] + 1);
    ctx.strokeStyle = `rgba(236,242,255,${snow})`;
    ctx.lineWidth = Math.max(1.5, ppd * 0.3);
    ctx.lineJoin = 'round';
    ctx.stroke();
  }

  // ---------- 계절 ----------
  // 벚꽃(3월 말~4월 20일), 반딧불이(6월 중순~7월), 낙엽(10월 중순~11월 25일), 눈 덮인 능선(12월 중순~2월)
  function seasonOf(month, day) {
    return {
      petals: (month === 3 && day >= 25) || (month === 4 && day <= 20),
      fireflies: (month === 6 && day >= 10) || month === 7,
      leaves: (month === 10 && day >= 10) || (month === 11 && day <= 25),
      snow: (month === 12 && day >= 10) || month <= 2,
    };
  }

  function buildFireflies() {
    const r = rng(77);
    fireflies = [];
    for (let i = 0; i < 160; i++) fireflies.push({ az: r() * 360, h: 0.2 + r() * 2.6, ph: r() * 6.28, sp: 0.8 + r() * 1.6 });
  }

  const PETAL_COLS = [[255, 214, 227], [255, 194, 212], [255, 240, 245]];
  const LEAF_COLS = [[217, 98, 43], [232, 163, 61], [184, 69, 42], [201, 138, 46]];

  function drawFalling(kind, dt, t, L) {
    if (kind !== fallKind) { fall = []; fallKind = kind; }
    if (!kind) return;
    const want = kind === 'petals' ? 45 : 28, cols = kind === 'petals' ? PETAL_COLS : LEAF_COLS;
    while (fall.length < want) {
      fall.push({ x: Math.random() * W, y: Math.random() * H - H * 0.2, vy: 18 + Math.random() * 26, vx: 8 + Math.random() * 14, rot: Math.random() * 6.28, vr: (Math.random() - 0.5) * 3, size: kind === 'petals' ? 3 + Math.random() * 2.5 : 4 + Math.random() * 3.5, col: cols[Math.floor(Math.random() * cols.length)], ph: Math.random() * 6.28 });
    }
    ctx.globalAlpha = 0.35 + 0.55 * L;
    for (const p of fall) {
      p.y += p.vy * dt;
      p.x += (p.vx + Math.sin(t * 1.3 + p.ph) * 22) * dt;
      p.rot += p.vr * dt;
      if (p.y > H + 10) { p.y = -10; p.x = Math.random() * W; }
      if (p.x > W + 10) p.x = -10;
      ctx.fillStyle = rgba(mix([40, 40, 60], p.col, 0.3 + 0.7 * L));
      ctx.beginPath();
      ctx.ellipse(p.x, p.y, p.size, p.size * 0.55, p.rot, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function drawFireflies(night, t) {
    if (night < 0.2) return;
    const half = W / 2 / ppd + 2;
    ctx.globalCompositeOperation = 'lighter';
    for (const f of fireflies) {
      const az = f.az + Math.sin(t * 0.3 + f.ph) * 0.6;
      if (Math.abs(wrap(az - vAz)) > half) continue;
      const blink = Math.pow(Math.max(0, Math.sin(t * f.sp + f.ph)), 3);
      if (blink < 0.02) continue;
      const x = X(az), y = Y(tAt(T.near, az) + f.h + Math.sin(t * 0.5 + f.ph * 2) * 0.3), g = Math.max(4, ppd * 0.45);
      ctx.globalAlpha = blink * night;
      ctx.drawImage(sprites.firefly, x - g, y - g, g * 2, g * 2);
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  // ---------- 소원 풍등 ----------
  // 약 10분 동안 땅에서 떠올라 멀리 날아감: 처음엔 가까워서 크고 빠르게 올라가고,
  // 멀어질수록 작아지고 느려져 작은 불빛이 되었다가 하늘에 녹아듦
  const LANTERN_LIFE = 600;
  function launchLantern(o = {}) {
    const mine = !!o.mine;
    lanterns.push({
      text: o.text || '', mine,
      az: mine ? vAz + (Math.random() - 0.5) * 6 : CITY_AZ + gauss(Math.random) * 18,
      // 내 풍등은 화면 맨 아래(발밑)에서, 다른 사람 풍등은 대전 시내에서 출발
      alt0: mine ? (hy - H) / ppd - 2 : -2 - Math.random() * 5,
      alt: 0,
      top: mine ? 18 + Math.random() * 4 : 12 + Math.random() * 10, // 멀어지며 머무는 높이
      climb: mine ? 5 : 4,            // 올라가는 빠르기
      dist0: mine ? 1 : 4,            // 처음 거리 (클수록 이미 멀리 있음)
      size: mine ? 3.2 : (0.3 + Math.random() * 0.3) * 4,
      life: LANTERN_LIFE * (mine ? 1 : 0.9 + Math.random() * 0.2),
      drift: (Math.random() - 0.5) * 0.02,
      ph: Math.random() * 6.28, age: 0,
    });
    if (lanterns.length > 40) lanterns.shift();
  }

  function drawLanterns(dt, night, wind, t) {
    lanterns = lanterns.filter((l) => {
      l.age += dt;
      const p = Math.min(1, l.age / l.life);
      // 가까울 때는 빠르게 솟고(처음 30초쯤 화면 가운데), 멀어질수록 거의 제자리에서 작아짐
      l.alt = l.top - (l.top - l.alt0) * Math.exp(-l.climb * Math.sqrt(p));
      l.az += (0.01 + wind * 0.04 + l.drift) * dt + Math.sin(l.age * 0.3 + l.ph) * 0.004;
      return p < 1;
    });
    ctx.textAlign = 'center';
    ctx.font = '13px "Gowun Batang", serif';
    for (const l of lanterns) {
      const x = X(l.az);
      if (x < -200 || x > W + 200) continue;
      const p = l.age / l.life;
      const dist = l.dist0 + 60 * Math.pow(p, 1.3); // 멀어질수록 작게 보임
      const y = Y(l.alt), fade = 1 - smooth(0.8, 1, p);
      const s = Math.max(1.2, l.size / dist * ppd);
      const flicker = 0.85 + 0.15 * Math.sin(t * 7 + l.ph) * Math.sin(t * 3.1 + l.ph);
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = (0.3 + 0.7 * night) * fade * flicker;
      const gs = Math.max(s * 3, 6); // 아주 멀어져도 작은 불빛으로 반짝이도록
      ctx.drawImage(sprites.warm, x - gs, y - gs, gs * 2, gs * 2);
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = fade;
      const g = ctx.createLinearGradient(0, y - s * 0.7, 0, y + s * 0.65);
      g.addColorStop(0, '#ffe9b8'); g.addColorStop(1, '#ff9340');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(x - s * 0.5, y - s * 0.62);
      ctx.quadraticCurveTo(x, y - s * 0.9, x + s * 0.5, y - s * 0.62);
      ctx.lineTo(x + s * 0.36, y + s * 0.62);
      ctx.lineTo(x - s * 0.36, y + s * 0.62);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = `rgba(255,248,210,${flicker})`;
      ctx.beginPath(); ctx.arc(x, y + s * 0.5, Math.max(1, s * 0.12), 0, Math.PI * 2); ctx.fill();
      // 소원 글귀는 떠오르는 동안 잠시 보여줌
      const show = l.mine ? 12 : 9;
      if (l.text && l.age < show) {
        ctx.globalAlpha = fade * Math.min(1, l.age / 1.5) * (1 - smooth(show - 3, show, l.age)) * (l.mine ? 1 : 0.7);
        ctx.shadowColor = 'rgba(0,0,0,0.7)'; ctx.shadowBlur = 4;
        ctx.fillStyle = '#fff5e2';
        ctx.fillText(l.text, x, y + s * 0.65 + 18);
        ctx.shadowBlur = 0;
      }
    }
    ctx.globalAlpha = 1;
  }

  function drawCity(L, nf, t, hour, dt, hor) {
    // 낮: 아파트·건물
    if (L > 0.05) {
      ctx.fillStyle = rgba(mix([214, 214, 206], hor, 0.45));
      for (const p of lights) {
        if (!p.bld || p.depth < 0.12) continue;
        const x = X(p.az);
        if (x < -5 || x > W + 5) continue;
        const w = Math.max(1, p.bw * ppd), h = Math.max(1, p.bh * ppd);
        ctx.globalAlpha = L * (0.05 + 0.3 * p.depth);
        ctx.fillRect(x - w / 2, Y(p.alt) - h, w, h);
      }
    }
    for (const c of cars) c.t = (((c.t + c.dir * c.sp * dt) % 1) + 1) % 1;
    if (nf < 0.01) { ctx.globalAlpha = 1; return; }
    // 밤: 불빛이 하나둘 켜지고, 새벽엔 일부 꺼짐
    const late = hour >= 1 && hour < 5 ? 0.45 : hour < 1 ? 0.2 : 0;
    const zoom = ppd / 23;
    ctx.globalCompositeOperation = 'lighter';
    for (const p of lights) {
      if (p.on > nf * 1.15 || p.on < late) continue;
      const x = X(p.az);
      if (x < -10 || x > W + 10) continue;
      const y = Y(p.alt), a = nf * (0.75 + 0.25 * Math.sin(t * (1.2 + p.ph * 0.3) + p.ph * 5)) * (0.5 + 0.5 * p.depth);
      const s = p.size * zoom;
      if (p.depth > 0.4) {
        ctx.globalAlpha = a * 0.5;
        ctx.drawImage(sprites.lights[p.ci], x - s * 3, y - s * 3, s * 6, s * 6);
      }
      ctx.globalAlpha = a;
      ctx.fillStyle = p.css;
      ctx.fillRect(x - s / 2, y - s / 2, s, s);
    }
    // 도로와 자동차
    ctx.globalAlpha = 1;
    ctx.strokeStyle = `rgba(255,178,92,${0.32 * nf})`;
    ctx.lineWidth = Math.max(1, ppd * 0.06);
    for (const road of ROADS) {
      ctx.beginPath();
      let px = null;
      for (const [az, alt] of road.pts) {
        const x = X(az), y = Y(alt);
        if (px === null || Math.abs(x - px) > W) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        px = x;
      }
      ctx.stroke();
    }
    const cs = Math.max(1.2, 1.6 * zoom);
    for (const c of cars) {
      roadPoint(ROADS[c.road], c.t);
      const x = X(P.az);
      if (x < -5 || x > W + 5) continue;
      ctx.fillStyle = c.dir > 0 ? `rgba(255,246,216,${nf})` : `rgba(255,74,58,${nf})`;
      ctx.fillRect(x - cs / 2, Y(P.alt) - cs / 2, cs, cs);
    }
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
  }

  function drawMist(amt, L, hor) {
    if (amt < 0.02) return;
    const col = mix([55, 64, 90], mix([236, 239, 243], hor, 0.3), L);
    const y0 = Y(0), y1 = Y(-11);
    const g = ctx.createLinearGradient(0, y0, 0, y1);
    g.addColorStop(0, rgba(col, 0)); g.addColorStop(0.3, rgba(col, amt)); g.addColorStop(1, rgba(col, amt * 0.25));
    ctx.fillStyle = g;
    ctx.fillRect(0, y0, W, y1 - y0);
  }

  function drawPine(x, y, h, w, tiers) {
    const n = tiers.length, pts = [];
    for (let i = 1; i <= n; i++) pts.push([w * (i / n) * 0.5 * tiers[i - 1], y - h + h * (i / n) * 0.85]);
    ctx.beginPath();
    ctx.moveTo(x, y - h);
    for (const [tw, ty] of pts) { ctx.lineTo(x + tw, ty); ctx.lineTo(x + tw * 0.3, ty - h * 0.03); }
    ctx.lineTo(x + w * 0.05, y + 2); ctx.lineTo(x - w * 0.05, y + 2);
    for (let i = n - 1; i >= 0; i--) { const [tw, ty] = pts[i]; ctx.lineTo(x - tw * 0.3, ty - h * 0.03); ctx.lineTo(x - tw, ty); }
    ctx.closePath();
    ctx.fill();
  }

  function drawTower(az, hDeg, col, nf, t) {
    const x = X(az);
    if (x < -200 || x > W + 200) return;
    const base = Y(tAt(T.near, az)), top = base - hDeg * ppd, bw = hDeg * ppd * 0.14;
    ctx.strokeStyle = rgba(col);
    ctx.lineWidth = Math.max(1, ppd * 0.05);
    ctx.beginPath();
    ctx.moveTo(x - bw, base); ctx.lineTo(x, top); ctx.lineTo(x + bw, base);
    const seg = 7;
    for (let i = 1; i <= seg; i++) {
      const y0 = base - (base - top) * (i - 1) / seg, y1 = base - (base - top) * i / seg;
      const w0 = bw * (1 - (i - 1) / seg), w1 = bw * (1 - i / seg);
      ctx.moveTo(x - w1, y1); ctx.lineTo(x + w1, y1);
      ctx.moveTo(x - w0, y0); ctx.lineTo(x + w1, y1);
      ctx.moveTo(x + w0, y0); ctx.lineTo(x - w1, y1);
    }
    ctx.moveTo(x, top); ctx.lineTo(x, top - ppd * 0.8);
    ctx.stroke();
    if (nf > 0.05 && Math.sin(t * 2.4 + az) > 0.1) {
      const g = ppd * 0.9;
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = nf;
      ctx.drawImage(sprites.red, x - g, top - ppd * 0.8 - g, g * 2, g * 2);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    }
  }

  // 식장루: 전통 누각 실루엣
  function drawPavilion(col, nf) {
    const az = 252, x = X(az), u = ppd;
    if (x < -8 * u || x > W + 8 * u) return;
    const base = Y(tAt(T.near, az) + 0.15), w = 6.5 * u;
    const floor = base - 0.35 * u, pyTop = floor - 2.0 * u, ry = pyTop - 0.1 * u, eave = w * 0.62, rh = 1.7 * u;
    ctx.fillStyle = rgba(col);
    ctx.fillRect(x - w * 0.46, floor, w * 0.92, 3 * u);           // 기단
    for (let i = 0; i < 5; i++) ctx.fillRect(x - w * 0.38 + i * (w * 0.76 / 4) - 0.09 * u, pyTop, 0.18 * u, 2.0 * u); // 기둥
    ctx.fillRect(x - w * 0.42, floor - 0.6 * u, w * 0.84, 0.09 * u); // 난간
    ctx.fillRect(x - w * 0.42, pyTop - 0.15 * u, w * 0.84, 0.28 * u); // 보
    // 처마가 하늘로 휘어 오르는 지붕
    ctx.beginPath();
    ctx.moveTo(x - eave, ry - 0.55 * u);
    ctx.quadraticCurveTo(x - eave * 0.75, ry + 0.05 * u, x - eave * 0.45, ry);
    ctx.lineTo(x + eave * 0.45, ry);
    ctx.quadraticCurveTo(x + eave * 0.75, ry + 0.05 * u, x + eave, ry - 0.55 * u);
    ctx.quadraticCurveTo(x + w * 0.32, ry - 0.7 * u, x + w * 0.2, ry - rh);
    ctx.lineTo(x + w * 0.24, ry - rh - 0.25 * u);
    ctx.lineTo(x - w * 0.24, ry - rh - 0.25 * u);
    ctx.lineTo(x - w * 0.2, ry - rh);
    ctx.quadraticCurveTo(x - w * 0.32, ry - 0.7 * u, x - eave, ry - 0.55 * u);
    ctx.closePath();
    ctx.fill();
    if (nf > 0.05) { // 처마 아래 등불
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 4; i++) {
        const lx = x - w * 0.285 + i * (w * 0.19), ly = pyTop + 0.45 * u, g = u * 1.4;
        ctx.globalAlpha = nf * 0.8;
        ctx.drawImage(sprites.warm, lx - g, ly - g, g * 2, g * 2);
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    }
  }

  function drawLabels(alpha) {
    ctx.font = '12px "Noto Sans KR", sans-serif';
    ctx.textAlign = 'center';
    ctx.shadowColor = 'rgba(0,0,0,0.6)';
    ctx.shadowBlur = 4;
    for (const l of LABELS) {
      const x = X(l.az);
      if (x < -60 || x > W + 60) continue;
      const alt = l.alt !== undefined ? l.alt : tAt(T[l.layer], l.az) + l.up;
      const y = Y(alt);
      ctx.strokeStyle = `rgba(255,255,255,${0.45 * alpha})`;
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x, y - 3); ctx.lineTo(x, y - 18); ctx.stroke();
      ctx.fillStyle = `rgba(255,255,255,${0.85 * alpha})`;
      ctx.fillText(l.t, x, y - 23);
    }
    ctx.shadowBlur = 0;
  }

  function drawPrecip(rain, snow, dt, wind) {
    const want = Math.round(rain * 260 + snow * 220);
    while (drops.length < want) {
      const isSnow = snow > rain;
      drops.push({ snow: isSnow, x: Math.random() * W, y: Math.random() * H, v: isSnow ? 30 + Math.random() * 50 : 700 + Math.random() * 400, len: 10 + Math.random() * 14, r: 1 + Math.random() * 1.8, ph: Math.random() * 6 });
    }
    drops.length = want;
    if (!want) return;
    const slant = wind * 0.35;
    ctx.strokeStyle = 'rgba(200,212,232,0.35)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    for (const d of drops) {
      d.y += d.v * dt;
      if (d.snow) d.x += Math.sin(d.y * 0.02 + d.ph) * 0.5 + slant * 40 * dt;
      else d.x += slant * d.v * dt;
      if (d.y > H) { d.y = -20; d.x = Math.random() * W; }
      if (d.x > W) d.x -= W; else if (d.x < 0) d.x += W;
      if (d.snow) ctx.fillRect(d.x, d.y, d.r, d.r);
      else { ctx.moveTo(d.x, d.y); ctx.lineTo(d.x - slant * d.len, d.y - d.len); }
    }
    ctx.stroke();
  }

  // ---------- 한 프레임 ----------
  function render(s) {
    if (cv.clientWidth !== W || cv.clientHeight !== H) resize();
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    vAz = s.view.az;
    ppd = Math.min(H / 46, W / (W < H ? 40 : 70)) * s.view.zoom; // 세로 화면은 시야를 좁혀 크게
    hy = H * 0.56 + s.view.pitch * ppd;

    const { sun, moon, illum, fx, t, dt } = s;
    const L = smooth(-10, 8, sun.alt);                  // 지형 밝기
    const night = 1 - smooth(-14, -2, sun.alt);
    const nf = clamp((3 - sun.alt) / 9, 0, 1);          // 도시 불빛
    const tw = Math.exp(-Math.pow((sun.alt + 2) / 7, 2)); // 여명·노을
    const cover = fx.cloud;

    let sky = skyAt(sun.alt);
    const oc = smooth(0.55, 1, cover) * 0.6 + fx.fog * 0.4;
    if (oc > 0) {
      const g = mix([18, 20, 26], [150, 158, 168], L);
      sky = { zen: mix(sky.zen, g, oc), mid: mix(sky.mid, g, oc), hor: mix(sky.hor, g, oc * 0.8) };
    }
    const moonGlow = smooth(0, 10, moon.alt) * illum.fraction * night;
    if (moonGlow > 0) sky = { zen: mix(sky.zen, [22, 34, 66], moonGlow * 0.35), mid: mix(sky.mid, [26, 40, 76], moonGlow * 0.4), hor: mix(sky.hor, [40, 52, 86], moonGlow * 0.35) };

    drawSky(sky);
    const starVis = clamp((-sun.alt - 5) / 10, 0, 1) * (1 - 0.85 * cover) * (1 - fx.fog * 0.9) * (1 - moonGlow * 0.35);
    const lp = (az) => Math.exp(-Math.pow(wrap(az - CITY_AZ) / 50, 2)) * nf;
    if (starVis > 0.01) drawStars(s.lst, starVis, lp, t, s.opts);
    drawCityGlow(nf, cover);
    drawSun(sun, cover);
    drawMoon(moon, illum, sun, night, cover);
    drawMeteors(starVis, dt, s.onMeteor, s.meteorRate || 1);
    drawClouds(sun, moon, illum, cover, L, dt, fx.wind);

    // 산 능선 — 멀수록 하늘빛에 묻힘
    const pal = PAL[season(s.month)];
    const moonL = night * illum.fraction * smooth(0, 8, moon.alt);
    const toward = (az) => 0.4 + 0.6 * (1 + Math.cos(wrap(az - sun.az) * rad)) / 2;
    const terr = (i, haze) => {
      let c = mix(NIGHT_PAL[i], pal[i], L);
      c = mix(c, [32, 44, 76], moonL * 0.3 * (1 - L));
      c = mix(c, sky.hor, haze * (0.2 + 0.8 * L) + tw * 0.18 * toward(vAz));
      return c;
    };
    const nearCol = terr(0, 0.05);
    const sea = seasonOf(s.month, s.day || 1);
    const snowA = sea.snow ? 0.3 + 0.5 * L : 0;
    drawRidge(T.far, terr(2, 0.55), 2, snowA * 0.6);
    drawRidge(T.mid, terr(1, 0.28), 0, snowA * 0.8);
    drawCity(L, nf, t, s.hour, dt, sky.hor);
    const morning = s.hour > 4.5 && s.hour < 9.5 ? Math.sin((s.hour - 4.5) / 5 * Math.PI) : 0;
    drawMist(morning * 0.28 * smooth(-8, 2, sun.alt) + fx.fog * 0.5, L, sky.hor);
    drawRidge(T.near, nearCol, -3, snowA);

    // 가까운 소나무·송신탑·식장루
    const fg = shade(nearCol, 0.6);
    const blossom = rgba(mix([40, 30, 45], [255, 196, 214], 0.25 + 0.75 * L));
    const half = W / 2 / ppd + 3;
    trees.forEach((tr, i) => {
      if (Math.abs(wrap(tr.az - vAz)) > half) return;
      const x = X(tr.az), y = Y(tAt(T.near, tr.az)) + 2, h = tr.h * ppd;
      ctx.fillStyle = rgba(fg);
      drawPine(x, y, h, tr.w * ppd, tr.tiers);
      if (sea.petals && i % 3 === 0) { // 벚나무 꽃송이
        ctx.fillStyle = blossom;
        for (const [dx, dy, r] of [[-0.18, 0.55, 0.22], [0.16, 0.5, 0.2], [0, 0.72, 0.24]]) {
          ctx.beginPath(); ctx.arc(x + dx * h, y - dy * h, r * h, 0, Math.PI * 2); ctx.fill();
        }
      }
    });
    if (sea.fireflies) drawFireflies(night, t);
    drawTower(36, 6.5, shade(fg, 0.9), nf, t);
    drawTower(48, 7.2, shade(fg, 0.9), nf, t + 1.3);
    drawPavilion(shade(fg, 0.75), nf);
    if (s.opts.labels) drawLabels(0.55 + 0.45 * (1 - L * 0.3));

    drawLanterns(dt, night, fx.wind, t);
    drawFalling(sea.petals ? 'petals' : sea.leaves && fx.rain < 0.05 ? 'leaves' : '', dt, t, L);
    drawPrecip(fx.rain, fx.snow, dt, fx.wind);
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, W, H);
  }

  return {
    LAT, LNG, CITY_AZ, init, render, launchLantern, seasonOf,
    ppd: () => ppd,
    skyColor: (alt) => { const s = skyAt(alt); return rgba(mix(s.mid, s.hor, 0.4)); },
  };
})();
