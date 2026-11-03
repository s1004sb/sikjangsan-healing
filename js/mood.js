/* 마음 날씨 — 오늘 내 마음을 하늘로 남기고, 한 달의 내 하늘을 달력으로 모아 봅니다.
   로그인 기능이 생기기 전까지는 이 브라우저에만 저장됩니다. */
const MoodDiary = (() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const KEY = 'sikjangsan-mood';
  const KST = 9 * 3600000;
  const MOODS = {
    sunny: { icon: '☀️', name: '맑음', feel: '기쁘고 가벼워요', reply: '맑은 마음, 오래 머물기를! 이 기분을 방명록에 나눠 보는 건 어때요?' },
    partly: { icon: '🌤️', name: '구름 조금', feel: '그럭저럭 괜찮아요', reply: '괜찮은 하루도 충분히 좋은 하루예요.' },
    cloudy: { icon: '☁️', name: '흐림', feel: '조금 지쳤어요', reply: '지친 날엔 숨 고르기를 한 번 해 봐요. 천천히 들이쉬고, 길게 내쉬고.' },
    rain: { icon: '🌧️', name: '비', feel: '마음이 젖었어요', reply: '비 오는 날도 지나가요. 오늘은 자연의 소리를 켜고 쉬어 가요.' },
    storm: { icon: '⛈️', name: '천둥', feel: '속상하고 화가 나요', reply: '화가 나는 건 잘못이 아니에요. 소원 풍등에 마음을 실어 날려 보내요.' },
    rainbow: { icon: '🌈', name: '무지개', feel: '설레고 고마워요', reply: '고마운 마음이 있는 날은 하늘도 더 예뻐 보여요.' },
  };

  let data = {}, view = null, picked = null, isOpen = false, cfg = null;

  function load() { try { data = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (e) { data = {}; } }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(data)); return true; } catch (e) { return false; } }

  const kstDate = (ms) => { const d = new Date(ms + KST); return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate() }; };
  const keyOf = (y, m, d) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  const todayKey = () => { const t = kstDate(Date.now()); return keyOf(t.y, t.m, t.d); };

  function renderPicker() {
    const box = $('moodPick');
    box.textContent = '';
    for (const [k, v] of Object.entries(MOODS)) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'mood-btn' + (picked === k ? ' active' : '');
      const icon = document.createElement('span'), name = document.createElement('b'), feel = document.createElement('small');
      icon.textContent = v.icon; name.textContent = v.name; feel.textContent = v.feel;
      b.append(icon, name, feel);
      b.addEventListener('click', () => { picked = k; renderPicker(); });
      box.appendChild(b);
    }
  }

  function renderCalendar() {
    const { y, m } = view, today = todayKey();
    $('moodMonth').textContent = `${y}년 ${m}월`;
    const grid = $('moodCal');
    grid.textContent = '';
    for (const w of ['일', '월', '화', '수', '목', '금', '토']) {
      const h = document.createElement('div');
      h.className = 'cal-h'; h.textContent = w;
      grid.appendChild(h);
    }
    const first = new Date(Date.UTC(y, m - 1, 1)).getUTCDay(), days = new Date(Date.UTC(y, m, 0)).getUTCDate();
    for (let i = 0; i < first; i++) grid.appendChild(document.createElement('div'));
    const counts = {};
    for (let d = 1; d <= days; d++) {
      const k = keyOf(y, m, d), rec = data[k], cell = document.createElement('div');
      cell.className = 'cal-d' + (k === today ? ' today' : '');
      const num = document.createElement('small');
      num.textContent = d;
      cell.appendChild(num);
      if (rec && MOODS[rec.s]) {
        const ic = document.createElement('span');
        ic.textContent = MOODS[rec.s].icon;
        cell.appendChild(ic);
        cell.title = `${MOODS[rec.s].name}${rec.n ? ' · ' + rec.n : ''}`;
        counts[rec.s] = (counts[rec.s] || 0) + 1;
      }
      grid.appendChild(cell);
    }
    const parts = Object.keys(MOODS).filter((k) => counts[k]).map((k) => `${MOODS[k].icon} ${MOODS[k].name} ${counts[k]}일`);
    $('moodSummary').textContent = parts.length ? `이번 달 내 하늘: ${parts.join(' · ')}` : '이 달에는 아직 남긴 하늘이 없어요.';
  }

  function submit(e) {
    e.preventDefault();
    if (!picked) { $('moodReply').textContent = '오늘 마음에 가까운 하늘을 하나 골라 주세요.'; return; }
    data[todayKey()] = { s: picked, n: $('moodNote').value.trim().slice(0, 60) };
    if (!save()) { $('moodReply').textContent = '이 브라우저에서는 기록을 저장할 수 없어요.'; return; }
    $('moodReply').textContent = MOODS[picked].reply;
    const t = kstDate(Date.now());
    view = { y: t.y, m: t.m };
    renderCalendar();
  }

  function open(on) {
    isOpen = on;
    $('moodPanel').classList.toggle('open', on);
    $('moodPanel').setAttribute('aria-hidden', String(!on));
    $('btnMood').setAttribute('aria-pressed', String(on));
    if (!on) return;
    load();
    const rec = data[todayKey()];
    picked = rec ? rec.s : null;
    $('moodNote').value = rec ? rec.n || '' : '';
    $('moodReply').textContent = rec ? '오늘의 마음 날씨를 이미 남겼어요. 바뀌었다면 다시 골라도 돼요.' : '';
    const t = kstDate(Date.now());
    view = { y: t.y, m: t.m };
    renderPicker();
    renderCalendar();
    if (cfg.onOpen) cfg.onOpen();
  }

  function init(options) {
    cfg = options;
    $('btnMood').addEventListener('click', () => open(!isOpen));
    $('moodClose').addEventListener('click', () => open(false));
    $('moodForm').addEventListener('submit', submit);
    $('moodPrev').addEventListener('click', () => { view.m--; if (view.m < 1) { view.m = 12; view.y--; } renderCalendar(); });
    $('moodNext').addEventListener('click', () => { view.m++; if (view.m > 12) { view.m = 1; view.y++; } renderCalendar(); });
  }

  return { init, open, isOpen: () => isOpen };
})();
