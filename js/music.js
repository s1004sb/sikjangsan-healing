/* 클래식 음악 플레이어 — 저작권이 끝난(퍼블릭 도메인) 곡의 악보를 Web Audio로 직접 연주합니다.
   녹음 파일을 쓰지 않으므로 연주·음원 저작권 문제도 없습니다.
   music/playlist.json에 직접 준비한 퍼블릭 도메인 음원을 등록하면 '내 음악'으로 함께 나옵니다. */
const Music = (() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

  // ---------- 악보 도구 ----------
  const STEP = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  function m(n) {
    const r = /^([A-G])(#|b)?(-?\d)$/.exec(n);
    return 12 * (+r[3] + 1) + STEP[r[1]] + (r[2] === '#' ? 1 : r[2] === 'b' ? -1 : 0);
  }
  // list: [[음 | [화음] | null(쉼표), 박자], ...] → 이벤트 [시작 박, midi, 길이 박, 세기]
  function line(ev, t, list, vel, shift = 0) {
    for (const [n, d] of list) {
      if (n) for (const x of [].concat(n)) ev.push([t, m(x) + shift, d, vel]);
      t += d;
    }
    return t;
  }
  const roll = (ev, t, notes, dur, vel, gap = 0.12) => notes.forEach((x, i) => ev.push([t + i * gap, m(x), dur, vel]));

  // ---------- 곡 ----------
  // 바흐 — 평균율 클라비어곡집 1권 프렐류드 C장조 BWV 846 (마디마다 다섯 음 화음을 같은 꼴로 펼침)
  function bach() {
    const ev = [];
    const bars = [
      'C4 E4 G4 C5 E5', 'C4 D4 A4 D5 F5', 'B3 D4 G4 D5 F5', 'C4 E4 G4 C5 E5', 'C4 E4 A4 E5 A5', 'C4 D4 F#4 A4 D5',
      'B3 D4 G4 D5 G5', 'B3 C4 E4 G4 C5', 'A3 C4 E4 G4 C5', 'D3 A3 D4 F#4 C5', 'G3 B3 D4 G4 B4', 'G3 Bb3 E4 G4 C#5',
      'F3 A3 D4 A4 D5', 'F3 Ab3 D4 F4 B4', 'E3 G3 C4 G4 C5', 'E3 F3 A3 C4 F4', 'D3 F3 A3 C4 F4', 'G2 D3 G3 B3 F4',
      'C3 E3 G3 C4 E4', 'C3 G3 Bb3 C4 E4', 'F2 F3 A3 C4 E4', 'F#2 C3 A3 C4 Eb4', 'Ab2 F3 B3 C4 D4', 'G2 F3 G3 B3 D4',
      'G2 E3 G3 C4 E4', 'G2 D3 G3 C4 F4', 'G2 D3 G3 B3 F4', 'G2 Eb3 A3 C4 F#4', 'G2 E3 G3 C4 G4', 'G2 D3 G3 C4 F4',
      'G2 D3 G3 B3 F4', 'C2 C3 G3 Bb3 E4', 'C2 C3 F3 A3 C4', 'C2 B2 G3 D4 F4',
    ].map((s) => s.split(' ').map(m));
    bars.forEach((n, i) => {
      for (let h = 0; h < 2; h++) {
        const t = i * 16 + h * 8;
        ev.push([t, n[0], 8, 0.5], [t + 1, n[1], 7, 0.42]);
        [2, 3, 4, 2, 3, 4].forEach((k, j) => ev.push([t + 2 + j, n[k], 1.6, 0.36]));
      }
    });
    const t = bars.length * 16;
    roll(ev, t, ['C2', 'C3', 'E3', 'G3', 'C4', 'E4'], 14, 0.4, 0.5);
    return { ev, end: t + 18 };
  }

  // 사티 — 짐노페디 1번 (앞부분). 왼손은 G장7·D장7 화음이 번갈아 흔들림
  function satie() {
    const ev = [], bars = 26;
    for (let b = 0; b < bars; b++) {
      const g = b % 2 === 0;
      ev.push([b * 3, m(g ? 'G2' : 'D2'), 3, 0.34]);
      for (const x of g ? ['B3', 'D4', 'F#4'] : ['A3', 'C#4', 'F#4']) ev.push([b * 3 + 1, m(x), 2, 0.2]);
    }
    const phrase = [[null, 1], ['F#5', 1], ['A5', 1], ['G5', 1], ['F#5', 1], ['C#5', 1], ['B4', 1], ['C#5', 1], ['D5', 1], ['A4', 3]];
    let t = line(ev, 12, phrase, 0.4);
    t = line(ev, t, [['F#4', 12]], 0.36);
    t = line(ev, t, phrase, 0.4);
    line(ev, t, [['C#5', 3], ['F#5', 3], ['E5', 9]], 0.38);
    roll(ev, bars * 3, ['D2', 'A3', 'D4', 'F#4'], 6, 0.26);
    return { ev, end: bars * 3 + 7 };
  }

  // 파헬벨 — 캐논 D장조. 같은 선율을 세 목소리가 한 주기씩 늦게 따라 부름
  function canon() {
    const ev = [];
    const bass = ['D3', 'A2', 'B2', 'F#2', 'G2', 'D2', 'G2', 'A2'];
    const V1 = ['F#5', 'E5', 'D5', 'C#5', 'B4', 'A4', 'B4', 'C#5'].map((n) => [n, 1]);
    const V2 = ['D5', 'C#5', 'B4', 'A4', 'G4', 'F#4', 'G4', 'E4'].map((n) => [n, 1]);
    const V3 = ['D4', 'F#4', 'A4', 'G4', 'F#4', 'D4', 'F#4', 'E4', 'D4', 'B3', 'D4', 'A4', 'G4', 'B4', 'A4', 'G4'].map((n) => [n, 0.5]);
    const vars = [[V1, 0], [V2, 0], [V3, 0], [V3, 12], [V2, 12], [V1, 12]];
    const cycles = 1 + vars.length + 2;
    for (let c = 0; c < cycles; c++) {
      bass.forEach((n, i) => ev.push([c * 8 + i, m(n), 1.05, 0.4]));
      for (let v = 0; v < 3; v++) {
        const k = c - 1 - v;
        if (k >= 0 && k < vars.length) line(ev, c * 8, vars[k][0], [0.3, 0.24, 0.2][v], vars[k][1]);
      }
    }
    const t = cycles * 8;
    roll(ev, t, ['D2', 'D3', 'A3', 'F#4', 'A4', 'D5'], 6, 0.36);
    return { ev, end: t + 7 };
  }

  // 브람스 — 자장가 Op.49-4 (C장조로 옮김). 두 번째는 한 옥타브 위에서 오르골처럼
  function brahms() {
    const ev = [];
    const mel = [
      ['E4', 0.5], ['E4', 0.5],
      ['G4', 2], ['E4', 0.5], ['E4', 0.5], ['G4', 2], ['E4', 0.5], ['G4', 0.5], ['C5', 1], ['B4', 1.5], ['A4', 0.5], ['A4', 1], ['G4', 1], ['D4', 0.5], ['E4', 0.5],
      ['F4', 1], ['D4', 1], ['D4', 0.5], ['E4', 0.5], ['F4', 2], ['D4', 0.5], ['F4', 0.5], ['B4', 0.5], ['A4', 0.5], ['G4', 1], ['B4', 1], ['C5', 2], ['C4', 0.5], ['C4', 0.5],
      ['C5', 2], ['A4', 0.5], ['F4', 0.5], ['G4', 2], ['E4', 0.5], ['C4', 0.5], ['F4', 1], ['G4', 1], ['A4', 1], ['G4', 2], ['C4', 0.5], ['C4', 0.5],
      ['C5', 2], ['A4', 0.5], ['F4', 0.5], ['G4', 2], ['E4', 0.5], ['C4', 0.5], ['F4', 1], ['E4', 1], ['D4', 1], ['C4', 3],
    ];
    const chords = 'C C C G G G G C F C F C F C G C'.split(' ');
    const CH = { C: ['C3', ['E3', 'G3']], F: ['F2', ['A3', 'C4']], G: ['G2', ['F3', 'B3']] };
    for (let pass = 0; pass < 2; pass++) {
      const o = pass * 48;
      line(ev, 2 + o, mel, pass ? 0.32 : 0.38, pass * 12);
      chords.forEach((c, i) => {
        const t = 3 * (i + 1) + o, [bass, dy] = CH[c];
        ev.push([t, m(bass), 1, 0.26]);
        for (const x of dy) ev.push([t + 1, m(x), 0.9, 0.16], [t + 2, m(x), 0.9, 0.14]);
      });
    }
    return { ev, end: 3 * 17 + 48 + 2 };
  }

  // 모차르트 — '아, 어머니께 말씀드릴게요' 변주곡 K.265 주제 (반짝반짝 작은 별)
  function twinkle() {
    const ev = [];
    const q = (ns) => ns.map((n) => (n.endsWith('h') ? [n.slice(0, -1), 2] : [n, 1]));
    const A1 = q(['C5', 'C5', 'G5', 'G5', 'A5', 'A5', 'G5h']), A2 = q(['F5', 'F5', 'E5', 'E5', 'D5', 'D5', 'C5h']);
    const B = q(['G5', 'G5', 'F5', 'F5', 'E5', 'E5', 'D5h']);
    const mel = [...A1, ...A2, ...B, ...B, ...A1, ...A2];
    const chords = 'C C F C F C G C C G C G C G C G C C F C F C G C'.split(' ');
    const CH = { C: ['C3', 'E3', 'G3'], F: ['F3', 'A3', 'C4'], G: ['G2', 'B2', 'D3'] };
    line(ev, 0, mel, 0.38);
    line(ev, 48, mel, 0.34);
    chords.forEach((c, i) => {
      const [r, third, fifth] = CH[c], t = i * 2;
      ev.push([t, m(r), 1, 0.26], [t + 1, m(third), 1, 0.17], [t + 1, m(fifth), 1, 0.17]);
      [r, fifth, third, fifth].forEach((x, j) => ev.push([48 + t + j * 0.5, m(x), 0.6, 0.2])); // 알베르티 베이스
    });
    roll(ev, 96, ['C3', 'G3', 'C4', 'E4', 'C5'], 4, 0.32);
    return { ev, end: 100 };
  }

  // 베토벤 — 엘리제를 위하여 (첫 부분)
  function elise() {
    const ev = [];
    const run = (t) => ['E5', 'D#5', 'E5', 'B4', 'D5', 'C5'].forEach((n, i) => ev.push([t + i, m(n), 1.2, 0.38]));
    const bar = (t, top, lh, rh) => {
      ev.push([t, m(top), 3, 0.4]);
      lh.forEach((n, i) => ev.push([t + i, m(n), 3.5 - i, 0.27]));
      rh.forEach((n, i) => ev.push([t + 3 + i, m(n), 1.2, 0.34]));
    };
    const Am = ['A2', 'E3', 'A3'], E = ['E2', 'E3', 'G#3'];
    let t = 0;
    for (let rep = 0; rep < 3; rep++) {
      ev.push([t, m('E5'), 1, 0.36], [t + 1, m('D#5'), 1, 0.34]);
      t += 2; run(t);
      t += 6; bar(t, 'A4', Am, ['C4', 'E4', 'A4']);
      t += 6; bar(t, 'B4', E, ['E4', 'G#4', 'B4']);
      t += 6; bar(t, 'C5', Am, ['E4', 'E5', 'D#5']);
      t += 6; run(t);
      t += 6; bar(t, 'A4', Am, ['C4', 'E4', 'A4']);
      t += 6; bar(t, 'B4', E, ['E4', 'C5', 'B4']);
      t += 6; bar(t, 'A4', Am, []);
      t += 4;
    }
    return { ev, end: t + 4 };
  }

  const BUILTIN = [
    { kind: 'ambient', title: '식장산의 바람', composer: '즉흥 연주', desc: '끝없이 흐르는 잔잔한 소리' },
    { kind: 'score', build: satie, spb: 60 / 66, title: '짐노페디 1번', composer: '에릭 사티 · 1888', desc: '느리고 고요하게 · 앞부분' },
    { kind: 'score', build: bach, spb: 0.21, title: '평균율 1권 프렐류드 C장조', composer: 'J.S. 바흐 · 1722', desc: '물결처럼 이어지는 화음' },
    { kind: 'score', build: canon, spb: 60 / 54, title: '캐논 D장조', composer: '요한 파헬벨 · 17세기 말', desc: '세 목소리가 따라 부르는 돌림노래' },
    { kind: 'score', build: brahms, spb: 60 / 62, title: '자장가', composer: '요하네스 브람스 · 1868', desc: '잠들기 전에' },
    { kind: 'score', build: twinkle, spb: 60 / 76, title: '작은 별 변주곡 주제', composer: 'W.A. 모차르트 · 1781년경', desc: '별 보며 듣는 반짝반짝 작은 별' },
    { kind: 'score', build: elise, spb: 0.19, title: '엘리제를 위하여', composer: 'L.v. 베토벤 · 1810', desc: '첫 부분' },
  ];

  // ---------- 악기 ----------
  const TIMBRES = {
    piano: { partials: [[1, 1], [2, 0.42], [3, 0.18], [4, 0.09], [5, 0.04]], attack: 0.006, decay: 1.6, gain: 0.2, shift: 0, damp: true },
    musicbox: { partials: [[1, 1], [2, 0.12], [4.2, 0.07]], attack: 0.002, decay: 0.8, gain: 0.2, shift: 12, damp: false },
    harp: { partials: [[1, 1], [2, 0.3], [3, 0.1]], attack: 0.004, decay: 1.3, gain: 0.22, shift: 0, damp: false },
  };

  let ac = null, out = null, session = null, audioEl = null, cfg = null;
  let tracks = BUILTIN.slice(), cur = 1, playing = false, isOpen = false;
  let score = null, startAt = 0, pausedBeat = 0, idx = 0;
  let prefs = { timbre: 'piano', repeat: 'all' };
  let sleepEnd = 0, sleepTimer = null;

  try { Object.assign(prefs, JSON.parse(localStorage.getItem('sikjangsan-music') || '{}')); } catch (e) { /* 무시 */ }
  const savePrefs = () => { try { localStorage.setItem('sikjangsan-music', JSON.stringify(prefs)); } catch (e) { /* 무시 */ } };

  function impulse(sec, decay) {
    const len = Math.floor(ac.sampleRate * sec), b = ac.createBuffer(2, len, ac.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = b.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
    return b;
  }

  function ensure() {
    if (ac) { ac.resume(); return true; }
    const a = Ambience.audio();
    if (!a) return false;
    ac = a.ac;
    out = ac.createGain();
    out.gain.value = 0.9;
    const lp = ac.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 4200;
    const verb = ac.createConvolver(), wet = ac.createGain();
    verb.buffer = impulse(3, 2.2); wet.gain.value = 0.32;
    out.connect(lp); lp.connect(a.master); lp.connect(verb); verb.connect(wet); wet.connect(a.master);
    setInterval(tick, 100);
    return true;
  }

  function note(t, midi, dur, vel, spb) {
    const T = TIMBRES[prefs.timbre] || TIMBRES.piano, n = midi + T.shift;
    const f = 440 * Math.pow(2, (n - 69) / 12);
    const tc = T.decay * clamp(1 + (72 - n) / 36, 0.5, 2); // 낮은 음일수록 길게 울림
    const g = ac.createGain();
    g.connect(session);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vel * T.gain, t + T.attack);
    g.gain.setTargetAtTime(0, t + T.attack, tc);
    let stop = t + T.attack + tc * 5;
    if (T.damp) { // 피아노는 건반을 떼면 소리가 잦아듦
      const end = t + Math.max(dur * spb, 0.12);
      g.gain.setTargetAtTime(0, end, 0.15);
      stop = Math.min(stop, end + 1);
    }
    for (const [r, a] of T.partials) {
      const o = ac.createOscillator(), pg = ac.createGain();
      o.frequency.value = f * r * (1 + 0.0003 * r * r);
      pg.gain.value = a;
      o.connect(pg); pg.connect(g);
      o.start(t); o.stop(stop);
    }
  }

  // 지금까지 예약한 음을 한꺼번에 끄기 위한 묶음
  function newSession() {
    if (session) {
      const s = session;
      s.gain.setTargetAtTime(0, ac.currentTime, 0.08);
      setTimeout(() => s.disconnect(), 700);
    }
    session = ac.createGain();
    session.connect(out);
  }

  // ---------- 재생 ----------
  function silence() {
    Ambience.setMusic(false);
    if (audioEl) audioEl.pause();
    if (session) newSession();
    score = null;
    playing = false;
  }

  function start(i, fromBeat = 0) {
    if (!ensure()) { if (cfg.toast) cfg.toast('이 브라우저에서는 소리를 낼 수 없어요'); return; }
    silence();
    cur = i;
    const tr = tracks[i];
    if (tr.kind === 'ambient') {
      Ambience.setMusic(true);
    } else if (tr.kind === 'file') {
      if (!audioEl) {
        audioEl = new Audio();
        audioEl.addEventListener('ended', ended);
        ac.createMediaElementSource(audioEl).connect(out);
      }
      if (!audioEl.src.endsWith(encodeURI(tr.file))) audioEl.src = 'music/' + encodeURI(tr.file);
      audioEl.play().catch(() => cfg.toast && cfg.toast('음원 파일을 재생하지 못했어요: ' + tr.file));
    } else {
      if (!tr.score) { tr.score = tr.build(); tr.score.ev.sort((a, b) => a[0] - b[0]); }
      score = tr.score;
      newSession();
      startAt = ac.currentTime + 0.15 - fromBeat * tr.spb;
      idx = score.ev.findIndex((e) => e[0] >= fromBeat);
      if (idx < 0) idx = score.ev.length;
    }
    pausedBeat = 0;
    playing = true;
    render();
  }

  function pause() {
    const tr = tracks[cur];
    if (tr.kind === 'score' && score) pausedBeat = (ac.currentTime - startAt) / tr.spb;
    if (tr.kind === 'file') { audioEl.pause(); playing = false; render(); return; }
    silence();
    render();
  }

  function resume() {
    const tr = tracks[cur];
    if (tr.kind === 'file' && audioEl && audioEl.src && ensure()) { audioEl.play(); playing = true; render(); return; }
    start(cur, tr.kind === 'score' ? pausedBeat : 0);
  }

  function ended() {
    if (prefs.repeat === 'one') { start(cur); return; }
    let next = (cur + 1) % tracks.length;
    if (tracks[next].kind === 'ambient') next = (next + 1) % tracks.length; // 끝없는 곡은 건너뜀
    start(next);
  }

  function tick() {
    const tr = tracks[cur];
    if (playing && score) {
      const now = ac.currentTime;
      while (idx < score.ev.length && startAt + score.ev[idx][0] * tr.spb < now + 0.4) {
        const [b, midi, d, v] = score.ev[idx++];
        note(Math.max(now, startAt + b * tr.spb), midi, d, v, tr.spb);
      }
      if (idx >= score.ev.length && now > startAt + score.end * tr.spb) ended();
    }
    if (isOpen) progress();
    if (sleepEnd) {
      const left = Math.max(0, sleepEnd - Date.now());
      $('mSleepLeft').textContent = `${Math.ceil(left / 60000)}분 뒤에 소리가 천천히 꺼져요`;
    }
  }

  // ---------- 화면 ----------
  const mmss = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

  function progress() {
    const tr = tracks[cur];
    let pos = 0, dur = 0;
    if (tr.kind === 'score') {
      if (!tr.score) { tr.score = tr.build(); tr.score.ev.sort((a, b) => a[0] - b[0]); }
      dur = tr.score.end * tr.spb;
      pos = playing && score ? ac.currentTime - startAt : pausedBeat * tr.spb;
    } else if (tr.kind === 'file' && audioEl) {
      pos = audioEl.currentTime; dur = audioEl.duration || 0;
    }
    const inf = tr.kind === 'ambient';
    $('mBar').style.width = inf ? (playing ? '100%' : '0') : `${dur ? clamp(pos / dur, 0, 1) * 100 : 0}%`;
    $('mPos').textContent = inf ? '' : mmss(clamp(pos, 0, dur || 0));
    $('mDur').textContent = inf ? '끝없이 흘러가요' : dur ? mmss(dur) : '';
  }

  function render() {
    const tr = tracks[cur];
    $('mTitle').textContent = tr.title;
    $('mSub').textContent = tr.composer;
    $('mPlay').textContent = playing ? '❚❚' : '▶';
    $('mPlay').setAttribute('aria-label', playing ? '일시 정지' : '재생');
    $('btnMusic').setAttribute('aria-pressed', String(playing));
    const list = $('mList');
    list.textContent = '';
    tracks.forEach((t, i) => {
      if (t.kind === 'file' && (i === 0 || tracks[i - 1].kind !== 'file')) {
        const h = document.createElement('li');
        h.className = 'm-head';
        h.textContent = '내 음악';
        list.appendChild(h);
      }
      const li = document.createElement('li'), b = document.createElement('button');
      b.className = 'm-track' + (i === cur ? ' active' : '');
      const title = document.createElement('span'), sub = document.createElement('span');
      title.className = 'm-t'; title.textContent = (i === cur && playing ? '♪ ' : '') + t.title;
      sub.className = 'm-s'; sub.textContent = [t.composer, t.desc].filter(Boolean).join(' · ');
      b.append(title, sub);
      b.addEventListener('click', () => (i === cur && playing ? pause() : start(i)));
      li.appendChild(b);
      list.appendChild(li);
    });
    for (const [id, key] of [['mTimbre', 'timbre'], ['mRepeat', 'repeat']]) {
      $(id).querySelectorAll('button').forEach((b) => b.classList.toggle('active', b.dataset.v === prefs[key]));
    }
    progress();
  }

  function setSleep(min) {
    clearTimeout(sleepTimer);
    sleepEnd = min ? Date.now() + min * 60000 : 0;
    $('mSleep').querySelectorAll('button').forEach((b) => b.classList.toggle('active', +b.dataset.v === min));
    $('mSleepLeft').textContent = '';
    if (!min) return;
    sleepTimer = setTimeout(() => {
      sleepEnd = 0;
      if (playing) pause();
      $('mSleep').querySelectorAll('button').forEach((b) => b.classList.toggle('active', b.dataset.v === '0'));
      $('mSleepLeft').textContent = '';
      if (cfg.onSleep) cfg.onSleep();
    }, min * 60000);
  }

  function open(on) {
    isOpen = on;
    $('musicPanel').classList.toggle('open', on);
    $('musicPanel').setAttribute('aria-hidden', String(!on));
    if (on) { render(); if (cfg.onOpen) cfg.onOpen(); }
  }

  async function loadMine() {
    try {
      const res = await fetch('music/playlist.json', { cache: 'no-store' });
      if (!res.ok) return;
      const list = await res.json();
      for (const t of Array.isArray(list) ? list : []) {
        if (t && t.file) tracks.push({ kind: 'file', file: String(t.file), title: String(t.title || t.file), composer: String(t.composer || ''), desc: String(t.license || '') });
      }
      if (isOpen) render();
    } catch (e) { /* 내 음악 없음 */ }
  }

  function init(options) {
    cfg = options;
    $('btnMusic').addEventListener('click', () => open(!isOpen));
    $('musicClose').addEventListener('click', () => open(false));
    $('mPlay').addEventListener('click', () => (playing ? pause() : resume()));
    $('mNext').addEventListener('click', () => start((cur + 1) % tracks.length));
    $('mPrev').addEventListener('click', () => start((cur - 1 + tracks.length) % tracks.length));
    for (const [id, key] of [['mTimbre', 'timbre'], ['mRepeat', 'repeat']]) {
      $(id).querySelectorAll('button').forEach((b) => b.addEventListener('click', () => { prefs[key] = b.dataset.v; savePrefs(); render(); }));
    }
    $('mSleep').querySelectorAll('button').forEach((b) => b.addEventListener('click', () => setSleep(+b.dataset.v)));
    setSleep(0);
    render();
    loadMine();
  }

  return { init, open, isOpen: () => isOpen };
})();
