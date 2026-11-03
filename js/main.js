/* 화면 조작, 시간 흐름, 날씨 연결 */
(() => {
  'use strict';
  const LAT = Scene.LAT, LNG = Scene.LNG;
  const HOUR = 3600000, DAY = 86400000, KST = 9 * HOUR;
  const $ = (id) => document.getElementById(id);
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const wrap = (d) => ((d % 360) + 540) % 360 - 180;
  const kstDayStart = (ms) => Math.floor((ms + KST) / DAY) * DAY - KST;
  const kstHour = (ms) => ((((ms + KST) % DAY) + DAY) % DAY) / HOUR;
  const kstMonth = (ms) => new Date(ms + KST).getUTCMonth() + 1;
  const kstDate = (ms) => new Date(ms + KST).getUTCDate();

  const fmtClock = new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', year: 'numeric', month: 'long', day: 'numeric', weekday: 'short', hour: 'numeric', minute: '2-digit', second: '2-digit' });
  const fmtHM = new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', hour: 'numeric', minute: '2-digit' });
  const fmtDate = new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', month: 'long', day: 'numeric', weekday: 'short' });
  const hm = (ms) => (ms == null ? '없음' : fmtHM.format(ms));

  const state = {
    live: true,
    speed: 1,
    ms: Date.now(),
    view: { az: 295, pitch: 0, zoom: 1 },
    target: null,
    weather: null,
    opts: { labels: true, constellations: true, autoPan: false, weather: true, floatMessages: true, volume: 70 },
  };

  const PREF_KEY = 'sikjangsan-prefs';
  try { Object.assign(state.opts, JSON.parse(localStorage.getItem(PREF_KEY) || '{}')); } catch (e) { /* 저장소 없음 */ }
  const savePrefs = () => { try { localStorage.setItem(PREF_KEY, JSON.stringify(state.opts)); } catch (e) { /* 무시 */ } };

  // ---------- 하루 일정 (일출·일몰 등) ----------
  let evDay = null, ev = null, skyEv = { list: [], meteor: 1 };
  function events(ms) {
    const d = kstDayStart(ms);
    if (d !== evDay) {
      evDay = d;
      ev = Astro.dayEvents(d, LAT, LNG);
      skyEv = SkyEvents.forDay(d);
      renderSkyNews();
      const stops = [];
      for (let h = 0; h <= 24; h++) stops.push(`${Scene.skyColor(Astro.sun(d + h * HOUR, LAT, LNG).alt)} ${(h / 24 * 100).toFixed(1)}%`);
      $('timeSlider').style.background = `linear-gradient(90deg, ${stops.join(', ')})`;
    }
    return ev;
  }

  // 특별한 하늘 소식: 제목 카드에는 가장 중요한 하나, 정보 패널에는 전부
  function renderSkyNews() {
    const line = $('skyEvent'), first = skyEv.list[0];
    line.hidden = !first;
    if (first) line.textContent = `${first.icon} ${first.title}`;
    const list = $('skyNews');
    list.textContent = '';
    if (!skyEv.list.length) {
      const li = document.createElement('li');
      li.className = 'quiet';
      li.textContent = '오늘은 특별한 천문 소식이 없어요. 평범한 하늘도 충분히 아름다워요.';
      list.appendChild(li);
    }
    for (const e of skyEv.list) {
      const li = document.createElement('li'), b = document.createElement('b'), s = document.createElement('span');
      b.textContent = `${e.icon} ${e.title}`;
      s.textContent = e.desc;
      li.append(b, s);
      list.appendChild(li);
    }
  }

  // ---------- 글귀 ----------
  const DIRS = ['북', '북북동', '북동', '동북동', '동', '동남동', '남동', '남남동', '남', '남남서', '남서', '서남서', '서', '서북서', '북서', '북북서'];
  const dirName = (az) => DIRS[Math.round(az / 22.5) % 16];
  const PLACES = [[305, '대전 도심'], [283, '계룡산'], [342, '계족산'], [8, '대청호 방면'], [105, '옥천 방면'], [190, '서대산'], [252, '식장루'], [42, '송신탑']];
  function facingHint(az) {
    let best = null, bd = 30;
    for (const [a, n] of PLACES) { const d = Math.abs(wrap(az - a)); if (d < bd) { bd = d; best = n; } }
    return best;
  }

  function phaseName(p) {
    if (p < 0.03 || p > 0.97) return '삭 (달이 보이지 않아요)';
    if (p < 0.22) return '초승달';
    if (p < 0.28) return '상현달';
    if (p < 0.47) return '차오르는 달';
    if (p < 0.53) return '보름달';
    if (p < 0.72) return '기우는 달';
    if (p < 0.78) return '하현달';
    return '그믐달';
  }

  function mood(sun, moon, il, fx, hour) {
    if (fx.rain > 0.05) return '비가 내리고 있어요. 빗소리에 잠시 기대어 쉬어 가세요.';
    if (fx.snow > 0.05) return '식장산에 눈이 내려요. 하얗게 고요해지는 시간이에요.';
    if (fx.fog > 0.3) return '안개가 산자락을 포근히 감싸고 있어요.';
    const a = sun.alt, am = hour < 12;
    if (a > 20) return fx.cloud > 0.7 ? '구름이 하늘을 천천히 덮고 지나가요.' : '맑은 햇살이 식장산 능선을 비추고 있어요.';
    if (a > 4) return am ? '아침 햇살이 산등성이를 넘어 대전 시내로 번져요.' : '해가 서쪽 하늘로 천천히 기울고 있어요.';
    if (a > 0) return am ? '해가 막 떠올랐어요. 새 하루가 시작돼요.' : '해가 서쪽 산 너머로 넘어가고 있어요.';
    if (a > -6) return am ? '동쪽 하늘이 밝아와요. 곧 해가 떠올라요.' : '노을이 대전 시내를 붉게 물들이고 있어요.';
    if (a > -12) return am ? '새벽의 푸른 빛이 하늘에 번지고 있어요.' : '도시의 불빛이 하나둘 켜지고 있어요.';
    if (moon.alt > 5 && il.fraction > 0.3) return '달빛 아래 대전의 야경이 반짝이고 있어요.';
    return hour >= 1 && hour < 5 ? '도시도 잠든 깊은 밤, 별이 가장 또렷한 시간이에요.' : '별이 빛나는 고요한 밤이에요.';
  }

  // ---------- 날씨 (Open-Meteo, 키 없이 사용) ----------
  const WX = (code) => {
    if (code === 0) return ['☀️', '맑음'];
    if (code === 1) return ['🌤️', '대체로 맑음'];
    if (code === 2) return ['⛅', '구름 조금'];
    if (code === 3) return ['☁️', '흐림'];
    if (code === 45 || code === 48) return ['🌫️', '안개'];
    if (code >= 51 && code <= 57) return ['🌦️', '이슬비'];
    if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return ['🌧️', '비'];
    if ((code >= 71 && code <= 77) || code === 85 || code === 86) return ['❄️', '눈'];
    if (code >= 95) return ['⛈️', '뇌우'];
    return ['🌤️', '—'];
  };

  async function fetchWeather() {
    const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), 8000);
    try {
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${LAT}&longitude=${LNG}&current=temperature_2m,weather_code,cloud_cover,wind_speed_10m&timezone=Asia%2FSeoul`;
      const res = await fetch(url, { signal: ctl.signal });
      if (!res.ok) throw new Error(res.status);
      const c = (await res.json()).current;
      state.weather = { temp: c.temperature_2m, code: c.weather_code, cloud: c.cloud_cover, wind: c.wind_speed_10m };
      const [icon, desc] = WX(c.weather_code);
      $('weather').textContent = `${icon} 지금 식장산 ${desc} · ${Math.round(c.temperature_2m)}°C · 바람 ${Math.round(c.wind_speed_10m)}km/h`;
    } catch (e) {
      state.weather = null;
      $('weather').textContent = '날씨를 불러오지 못했어요 · 맑은 하늘로 보여드려요';
    } finally {
      clearTimeout(timer);
    }
  }

  function weatherFx() {
    const w = state.weather;
    if (!state.opts.weather || !w) return { cloud: 0.18, rain: 0, snow: 0, fog: 0, wind: 0.3 };
    const c = w.code;
    let rain = 0, snow = 0;
    if (c >= 51 && c <= 57) rain = 0.3;
    else if (c === 61 || c === 80) rain = 0.45;
    else if (c === 63 || c === 81 || c === 66) rain = 0.7;
    else if (c === 65 || c === 82 || c === 67 || c >= 95) rain = 1;
    else if ((c >= 71 && c <= 77) || c === 85 || c === 86) snow = c === 75 || c === 86 ? 1 : 0.55;
    const cloud = rain || snow ? Math.max(0.85, w.cloud / 100) : w.cloud / 100;
    return { cloud, rain, snow, fog: c === 45 || c === 48 ? 0.8 : 0, wind: clamp(w.wind / 30, 0, 1) };
  }

  // ---------- 알림 ----------
  let toastTimer = null;
  function toast(msg, ms = 3200) {
    const el = $('toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), ms);
  }
  let lastMeteorToast = -Infinity;
  function onMeteor() {
    const now = performance.now();
    if (now - lastMeteorToast < 45000) return;
    lastMeteorToast = now;
    toast('별똥별이 지나갔어요 — 소원을 빌어보세요 ✨');
  }

  // ---------- 시간 조작 ----------
  function goLive() { state.live = true; state.speed = 1; }
  function setTime(ms, speed) { state.live = false; state.ms = ms; state.speed = speed; }
  function lookAt(az, pitch = state.view.pitch) { state.target = { az, pitch: clamp(pitch, -8, 75) }; }

  function jump(kind) {
    const e = events(state.ms);
    if (kind === 'sunrise') {
      if (e.sunrise == null) return;
      setTime(e.sunrise - 35 * 60000, 60); lookAt(e.sunriseAz, 0);
      toast('해 뜨기 35분 전이에요. 60배 빠르게 흘러가요.');
    } else if (kind === 'sunset') {
      if (e.sunset == null) return;
      setTime(e.sunset - 45 * 60000, 60); lookAt(e.sunsetAz, 0);
      toast('해 지기 45분 전이에요. 노을과 함께 야경이 켜져요.');
    } else if (kind === 'noon') {
      setTime(e.noon, 1); lookAt(180, Math.max(0, e.noonAlt - 16));
    } else {
      setTime(e.noon + 12 * HOUR, 1); lookAt(Scene.CITY_AZ, 6);
    }
  }

  // ---------- 화면 갱신 ----------
  let panelOpen = false, sliding = false;
  function updateUI(sun, moon, il, fx, hour) {
    const e = events(state.ms);
    $('clock').textContent = fmtClock.format(state.ms);
    const badge = $('liveBadge');
    if (state.live) { badge.className = 'badge live'; badge.textContent = 'LIVE'; }
    else { badge.className = 'badge travel'; badge.textContent = state.speed === 1 ? '시간 여행 중' : `${state.speed}배 빠르게`; }
    $('btnLive').classList.toggle('on', state.live);
    $('mood').textContent = mood(sun, moon, il, fx, hour);
    const hint = facingHint(state.view.az);
    $('facing').textContent = `${dirName(state.view.az)} ${Math.round(state.view.az)}°${hint ? ' · ' + hint : ''}`;
    if (!sliding) $('timeSlider').value = Math.floor(hour * 60);
    document.querySelectorAll('#speeds button').forEach((b) => {
      b.classList.toggle('active', !state.live && +b.dataset.speed === state.speed);
    });
    if (panelOpen) {
      $('skyDate').textContent = fmtDate.format(state.ms);
      $('tRise').textContent = hm(e.sunrise);
      $('tSet').textContent = hm(e.sunset);
      $('tMoonRise').textContent = hm(e.moonrise);
      $('tMoonSet').textContent = hm(e.moonset);
      $('tPhase').textContent = `${phaseName(il.phase)} · 밝은 면 ${Math.round(il.fraction * 100)}%`;
      $('tSunAlt').textContent = `${dirName(sun.az)}쪽 하늘 · 고도 ${sun.alt.toFixed(1)}°`;
      $('tMoonAlt').textContent = `${dirName(moon.az)}쪽 하늘 · 고도 ${moon.alt.toFixed(1)}°`;
    }
  }

  // ---------- 매 프레임 ----------
  let last = performance.now(), lastUi = 0, drag = null;
  const t0 = last;
  let cur = null;
  function frame(now) {
    const elapsed = Math.min(5, (now - last) / 1000); // 시간 흐름은 실제 경과만큼
    const dt = Math.min(0.1, elapsed);                  // 움직임은 끊겨도 튀지 않게
    last = now;
    if (state.live) state.ms = Date.now(); else state.ms += elapsed * 1000 * state.speed;

    const v = state.view;
    if (state.target) {
      const da = wrap(state.target.az - v.az), dp = state.target.pitch - v.pitch, k = Math.min(1, dt * 2.5);
      v.az += da * k; v.pitch += dp * k;
      if (Math.abs(da) < 0.05 && Math.abs(dp) < 0.05) state.target = null;
    } else if (state.opts.autoPan && !drag) {
      v.az += dt * 1.5;
    }
    v.az = ((v.az % 360) + 360) % 360;

    const sun = Astro.sun(state.ms, LAT, LNG);
    const moon = Astro.moon(state.ms, LAT, LNG);
    const illum = Astro.moonIllum(state.ms);
    const fx = weatherFx(), month = kstMonth(state.ms), hour = kstHour(state.ms);
    cur = { sun, moon };
    events(state.ms);
    Scene.render({
      view: v, sun, moon, illum, lst: Astro.lst(state.ms, LNG), fx, month, day: kstDate(state.ms), hour,
      t: (now - t0) / 1000, dt, opts: state.opts, onMeteor, meteorRate: skyEv.meteor,
    });
    Ambience.update({ day: clamp((sun.alt + 4) / 10, 0, 1), night: clamp((-sun.alt - 2) / 8, 0, 1), rain: fx.rain, wind: fx.wind, month });
    if (now - lastUi > 250) { lastUi = now; updateUI(sun, moon, illum, fx, hour); }
    requestAnimationFrame(frame);
  }

  // ---------- 둘러보기 ----------
  const cv = $('sky');
  // 손가락이 두 개면 벌리고 오므려서 확대·축소
  const touches = new Map();
  let pinch = 0;
  const pinchDist = () => { const [a, b] = [...touches.values()]; return Math.hypot(a.x - b.x, a.y - b.y); };

  cv.addEventListener('pointerdown', (e) => {
    touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
    cv.setPointerCapture(e.pointerId);
    state.target = null;
    if (touches.size === 2) { pinch = pinchDist(); if (drag) drag.moved = 99; return; }
    drag = { x: e.clientX, y: e.clientY, moved: 0 };
  });
  cv.addEventListener('pointermove', (e) => {
    if (touches.has(e.pointerId)) touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (touches.size >= 2) {
      const d = pinchDist();
      if (pinch) state.view.zoom = clamp(state.view.zoom * d / pinch, 0.6, 2.6);
      pinch = d;
      return;
    }
    if (!drag) return;
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y, p = Scene.ppd();
    drag.x = e.clientX; drag.y = e.clientY; drag.moved += Math.abs(dx) + Math.abs(dy);
    state.view.az -= dx / p;
    state.view.pitch = clamp(state.view.pitch + dy / p, -8, 75);
  });
  const endDrag = (e) => {
    touches.delete(e.pointerId);
    if (touches.size) { pinch = 0; return; } // 한 손가락이 아직 남아 있음
    if (drag && drag.moved < 6) { // 풍경을 톡 눌렀을 때
      if (document.body.classList.contains('zen')) setZen(false);
      else Mobile.closeAll();
    }
    drag = null;
  };
  cv.addEventListener('pointerup', endDrag);
  cv.addEventListener('pointercancel', (e) => { touches.delete(e.pointerId); pinch = 0; drag = null; });
  cv.addEventListener('wheel', (e) => {
    e.preventDefault();
    state.view.zoom = clamp(state.view.zoom * Math.exp(-e.deltaY * 0.0012), 0.6, 2.6);
  }, { passive: false });

  function setZen(on) {
    document.body.classList.toggle('zen', on);
    if (on) toast('화면을 한 번 누르면 메뉴가 다시 나타나요');
  }

  window.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    const v = state.view;
    switch (e.key) {
      case 'ArrowLeft': lookAt(v.az - 15); break;
      case 'ArrowRight': lookAt(v.az + 15); break;
      case 'ArrowUp': lookAt(v.az, v.pitch + 8); break;
      case 'ArrowDown': lookAt(v.az, v.pitch - 8); break;
      case '+': case '=': v.zoom = clamp(v.zoom * 1.15, 0.6, 2.6); break;
      case '-': v.zoom = clamp(v.zoom / 1.15, 0.6, 2.6); break;
      case 'h': case 'H': setZen(!document.body.classList.contains('zen')); break;
      case 'l': case 'L': goLive(); break;
      case 'Escape': closeOthers(null); Lanterns.open(false); Likes.open(false); closeBreath(); break;
      default: return;
    }
    e.preventDefault();
  });

  // ---------- 버튼 ----------
  document.querySelectorAll('[data-dir]').forEach((b) => b.addEventListener('click', () => {
    const kind = b.dataset.dir;
    if (kind === 'sunrise') lookAt(events(state.ms).sunriseAz, 0);
    else if (kind === 'city') lookAt(Scene.CITY_AZ, 0);
    else if (kind === 'polaris') lookAt(0, LAT - 16);
    else if (kind === 'moon') {
      const m = cur.moon;
      if (m.alt > -1) lookAt(m.az, Math.max(0, m.alt - 16));
      else toast(`지금은 달이 지평선 아래에 있어요 · 오늘 월출 ${hm(events(state.ms).moonrise)}`);
    }
  }));

  $('btnLive').addEventListener('click', goLive);
  document.querySelectorAll('#speeds button').forEach((b) => b.addEventListener('click', () => {
    state.live = false;
    state.speed = +b.dataset.speed;
  }));
  document.querySelectorAll('#jumps button').forEach((b) => b.addEventListener('click', () => jump(b.dataset.jump)));

  const slider = $('timeSlider');
  slider.addEventListener('input', () => {
    sliding = true;
    if (state.live) state.speed = 1;
    state.live = false;
    state.ms = kstDayStart(state.ms) + slider.value * 60000;
  });
  slider.addEventListener('change', () => { sliding = false; });

  // 자연의 소리: 끄기 전까지 계속 흐르고, 다음에 와도 켜 둔 상태를 기억
  function setNature(on) {
    if (!Ambience.setNature(on)) { toast('이 브라우저에서는 소리를 낼 수 없어요'); return; }
    $('btnSound').setAttribute('aria-pressed', String(on));
    state.opts.nature = on;
    savePrefs();
  }
  $('btnSound').addEventListener('click', () => setNature($('btnSound').getAttribute('aria-pressed') !== 'true'));

  // 브라우저는 사용자가 화면을 누르기 전에는 소리를 낼 수 없어서, 첫 터치·클릭·키 입력 때 이어서 켬
  if (state.opts.nature) {
    const resume = (e) => {
      window.removeEventListener('pointerdown', resume, true);
      window.removeEventListener('keydown', resume, true);
      if (e.target.closest && e.target.closest('#btnSound')) return; // 버튼을 직접 누른 경우는 버튼이 처리
      setNature(true);
    };
    window.addEventListener('pointerdown', resume, true);
    window.addEventListener('keydown', resume, true);
    setTimeout(() => {
      if ($('btnSound').getAttribute('aria-pressed') !== 'true') toast('화면을 한 번 누르면 자연의 소리가 이어서 흘러나와요 🍃', 5000);
    }, 9500);
  }

  $('btnFull').addEventListener('click', () => {
    if (document.fullscreenElement) document.exitFullscreen();
    else if (document.documentElement.requestFullscreen) document.documentElement.requestFullscreen().catch(() => {});
  });
  $('btnZen').addEventListener('click', () => setZen(true));

  // 정보 패널과 설정
  function setPanel(open) {
    panelOpen = open;
    $('panel').classList.toggle('open', open);
    $('panel').setAttribute('aria-hidden', String(!open));
    if (open) {
      lastUi = 0;
      $('comfortLine').textContent = Comfort.today();
      closeOthers('info');
      showPhoneUrls();
    }
  }

  // 같은 와이파이의 휴대폰에서 들어올 주소 (서버로 열었을 때만)
  async function showPhoneUrls() {
    try {
      const { urls } = await fetch('api/info', { cache: 'no-store' }).then((r) => r.json());
      const list = $('phoneUrls');
      list.textContent = '';
      for (const u of urls) {
        const li = document.createElement('li');
        li.textContent = u.replace('http://', '');
        list.appendChild(li);
      }
      $('phoneBox').hidden = !urls.length;
    } catch (e) {
      $('phoneBox').hidden = true;
    }
  }

  // 패널은 한 번에 하나만 열림
  const PANELS = {
    info: { isOpen: () => panelOpen, close: () => setPanel(false) },
    guest: { isOpen: () => Guestbook.isOpen(), close: () => Guestbook.open(false) },
    music: { isOpen: () => Music.isOpen(), close: () => Music.open(false) },
    mood: { isOpen: () => MoodDiary.isOpen(), close: () => MoodDiary.open(false) },
    qna: { isOpen: () => QnA.isOpen(), close: () => QnA.open(false) },
  };
  function closeOthers(keep) {
    for (const [k, p] of Object.entries(PANELS)) if (k !== keep && p.isOpen()) p.close();
  }
  $('btnInfo').addEventListener('click', () => setPanel(!panelOpen));
  $('panelClose').addEventListener('click', () => setPanel(false));

  const bind = (id, key) => {
    const el = $(id);
    el.checked = state.opts[key];
    el.addEventListener('change', () => { state.opts[key] = el.checked; savePrefs(); });
  };
  bind('optLabels', 'labels');
  bind('optConst', 'constellations');
  bind('optPan', 'autoPan');
  bind('optWeather', 'weather');
  bind('optFloat', 'floatMessages');
  const vol = $('optVol');
  vol.value = state.opts.volume;
  Ambience.setVolume(state.opts.volume / 100);
  vol.addEventListener('input', () => { state.opts.volume = +vol.value; Ambience.setVolume(vol.value / 100); savePrefs(); });

  // 숨 고르기: 4초 들이쉬고, 2초 멈추고, 6초 내쉬기
  const BREATH = [['천천히 들이마셔요', 4000], ['잠시 멈춰요', 2000], ['천천히 내쉬어요', 6000]];
  let breathTimer = null;
  function breathStep(i) {
    $('breathText').textContent = BREATH[i][0];
    breathTimer = setTimeout(() => breathStep((i + 1) % BREATH.length), BREATH[i][1]);
  }
  function closeBreath() {
    clearTimeout(breathTimer);
    $('breath').hidden = true;
    $('breath').classList.remove('run');
  }
  $('btnBreath').addEventListener('click', () => {
    const el = $('breath');
    el.hidden = false;
    el.classList.remove('run');
    void el.offsetWidth; // 애니메이션을 처음부터
    el.classList.add('run');
    clearTimeout(breathTimer);
    breathStep(0);
  });
  $('breath').addEventListener('click', closeBreath);

  // ---------- 시작 ----------
  Scene.init(cv);
  Music.init({
    toast,
    onOpen: () => closeOthers('music'),
    onSleep: () => {
      // 잠들기 타이머로 끈 것은 '오늘 밤만' — 다음에 오면 다시 이어서 흐르도록 기억은 유지
      Ambience.setNature(false);
      $('btnSound').setAttribute('aria-pressed', 'false');
      toast('편안한 밤 되세요. 소리를 천천히 껐어요 🌙', 6000);
    },
  });
  Mobile.init({ closePanels: () => { closeOthers(null); Lanterns.open(false); Likes.open(false); } });
  Presence.init({ toast });
  Lanterns.init({ toast });
  MoodDiary.init({ onOpen: () => closeOthers('mood') });
  QnA.init({ toast, onOpen: () => closeOthers('qna') });
  Likes.init({ toast });
  Comfort.welcome();
  Guestbook.init({
    opts: state.opts,
    onOpen: () => closeOthers('guest'),
    // 글을 남길 때의 하늘 (지금 보고 있는 시각 기준)
    getSky: () => {
      const a = Astro.sun(state.ms, LAT, LNG).alt;
      if (a > 6) return 'day';
      if (a > -12) return kstHour(state.ms) < 12 ? 'dawn' : 'sunset';
      return 'night';
    },
  });
  fetchWeather();
  setInterval(fetchWeather, 15 * 60 * 1000);
  requestAnimationFrame(frame);
})();
