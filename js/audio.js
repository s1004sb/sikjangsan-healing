/* 자연의 소리와 잔잔한 음악 — 음원 파일 없이 Web Audio로 실시간 합성합니다. */
const Ambience = (() => {
  'use strict';
  let ac = null, master, natureBus, musicBus, echoIn, windGain, windFilter, rainGain;
  let nature = false, music = false, volume = 0.7, nextNotes = 0;
  const env = { day: 1, night: 0, rain: 0, wind: 0.3, month: 1 };
  const SCALE = [261.63, 293.66, 329.63, 392.0, 440.0, 523.25, 587.33, 659.25]; // C장조 5음계

  // 끝과 처음을 겹쳐 이어 붙여, 무한 반복해도 이음새('틱' 소리)가 들리지 않는 소음
  function noise(kind, sec = 20) {
    const len = Math.floor(ac.sampleRate * sec), fade = Math.floor(ac.sampleRate * 0.5);
    const raw = new Float32Array(len + fade);
    let last = 0;
    for (let i = 0; i < raw.length; i++) {
      const w = Math.random() * 2 - 1;
      if (kind === 'brown') { last = (last + 0.02 * w) / 1.02; raw[i] = last * 3.5; } else raw[i] = w;
    }
    const buf = ac.createBuffer(1, len, ac.sampleRate), d = buf.getChannelData(0);
    d.set(raw.subarray(0, len));
    for (let i = 0; i < fade; i++) {
      const t = i / fade;
      d[i] = raw[i] * t + raw[len + i] * (1 - t); // 마지막 샘플 다음에 자연스럽게 이어짐
    }
    return buf;
  }

  function loop(buf, ...chain) {
    const src = ac.createBufferSource();
    src.buffer = buf; src.loop = true;
    chain.reduce((a, b) => (a.connect(b), b), src);
    src.start();
  }

  function gain(v, to) {
    const g = ac.createGain();
    g.gain.value = v;
    if (to) g.connect(to);
    return g;
  }

  function ensure() {
    if (ac) return true;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    ac = new AC();
    master = gain(volume, ac.destination);
    natureBus = gain(0, master);
    musicBus = gain(0, master);

    // 음악용 메아리
    const delay = ac.createDelay(2), fb = gain(0.42), lp = ac.createBiquadFilter();
    delay.delayTime.value = 0.42; lp.type = 'lowpass'; lp.frequency.value = 2000;
    echoIn = gain(0.6);
    echoIn.connect(delay); delay.connect(lp); lp.connect(fb); fb.connect(delay); lp.connect(musicBus);

    // 바람
    windFilter = ac.createBiquadFilter();
    windFilter.type = 'lowpass'; windFilter.frequency.value = 420;
    windGain = gain(0.25, natureBus);
    loop(noise('brown'), windFilter, windGain);

    // 빗소리
    const rf = ac.createBiquadFilter();
    rf.type = 'bandpass'; rf.frequency.value = 2400; rf.Q.value = 0.6;
    rainGain = gain(0, natureBus);
    loop(noise('white'), rf, rainGain);

    // 음악 바탕 저음
    [65.41, 98.0].forEach((f) => {
      const o = ac.createOscillator();
      o.type = 'sine'; o.frequency.value = f;
      o.connect(gain(0.045, musicBus));
      o.start();
    });

    // 휴대폰 잠금·탭 전환 등으로 소리가 멈췄으면, 켜 둔 동안에는 다시 이어서 재생
    const revive = () => { if ((nature || music) && ac.state !== 'running' && !document.hidden) ac.resume().catch(() => {}); };
    ac.addEventListener('statechange', revive);
    document.addEventListener('visibilitychange', revive);
    window.addEventListener('pointerdown', revive);

    setInterval(tick, 500);
    return true;
  }

  function tick() {
    const t = ac.currentTime;
    if (nature) {
      if (Math.random() < 0.25) {
        windFilter.frequency.setTargetAtTime(250 + Math.random() * 500 + env.wind * 600, t, 1.2);
        windGain.gain.setTargetAtTime((0.12 + Math.random() * 0.18) * (0.6 + env.wind), t, 1.5);
      }
      rainGain.gain.setTargetAtTime(env.rain * 0.35, t, 1);
      if (env.day > 0.5 && env.rain < 0.3 && Math.random() < 0.12) bird();
      if (env.night > 0.6 && env.month >= 6 && env.month <= 10 && Math.random() < 0.5) cricket();
      if (env.night > 0.7 && Math.random() < 0.012) owl();
    }
    if (music && t > nextNotes) { notes(); nextNotes = t + 5 + Math.random() * 5; }
  }

  function out() {
    if (!ac.createStereoPanner) return natureBus;
    const p = ac.createStereoPanner();
    p.pan.value = Math.random() * 1.6 - 0.8;
    p.connect(natureBus);
    return p;
  }

  function tone(dest, type, f0, f1, start, peak, attack, dur) {
    const o = ac.createOscillator(), g = gain(0.0001, dest);
    o.type = type;
    o.frequency.setValueAtTime(f0, start);
    if (f1) o.frequency.exponentialRampToValueAtTime(f1, start + dur * 0.8);
    g.gain.setValueAtTime(0.0001, start);
    g.gain.exponentialRampToValueAtTime(peak, start + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    o.connect(g);
    o.start(start); o.stop(start + dur + 0.05);
    return g;
  }

  function bird() {
    const dest = out(), base = 2200 + Math.random() * 2200, n = 2 + Math.floor(Math.random() * 4);
    let st = ac.currentTime + 0.05;
    for (let i = 0; i < n; i++) {
      const f = base * (0.9 + Math.random() * 0.25);
      tone(dest, 'sine', f, f * (Math.random() < 0.5 ? 1.35 : 0.7), st, 0.05, 0.015, 0.11);
      st += 0.12 + Math.random() * 0.1;
    }
  }

  function cricket() {
    const t0 = ac.currentTime + Math.random() * 0.3, o = ac.createOscillator(), g = gain(0, natureBus);
    o.frequency.value = 4300 + Math.random() * 400;
    for (let i = 0; i < 3; i++) { g.gain.setValueAtTime(0.012, t0 + i * 0.06); g.gain.setValueAtTime(0, t0 + i * 0.06 + 0.03); }
    o.connect(g);
    o.start(t0); o.stop(t0 + 0.25);
  }

  function owl() {
    const dest = out(), t0 = ac.currentTime + 0.1;
    [[0, 410], [0.55, 380], [0.8, 380]].forEach(([d, f]) => tone(dest, 'sine', f, f * 0.92, t0 + d, 0.04, 0.06, 0.4));
  }

  function notes() {
    let st = ac.currentTime + 0.05;
    const n = 1 + Math.floor(Math.random() * 3);
    for (let i = 0; i < n; i++) {
      const f = SCALE[Math.floor(Math.random() * SCALE.length)] * (Math.random() < 0.3 ? 0.5 : 1);
      const lp = ac.createBiquadFilter();
      lp.type = 'lowpass'; lp.frequency.value = 1400;
      tone(lp, 'triangle', f, 0, st, 0.05, 1.2, 7);
      tone(lp, 'sine', f * 2.001, 0, st, 0.012, 1.2, 7);
      lp.connect(musicBus); lp.connect(echoIn);
      st += 0.6 + Math.random() * 1.2;
    }
  }

  function fade(bus, on) {
    bus.gain.setTargetAtTime(on ? 1 : 0, ac.currentTime, 0.8);
  }

  return {
    setNature(on) {
      if (!ensure()) return false;
      ac.resume(); nature = on; fade(natureBus, on);
      return true;
    },
    setMusic(on) {
      if (!ensure()) return false;
      ac.resume(); music = on; fade(musicBus, on);
      if (on) nextNotes = 0;
      return true;
    },
    // 음악 플레이어가 같은 오디오 출력(볼륨)을 쓰도록
    audio() {
      if (!ensure()) return null;
      ac.resume();
      return { ac, master };
    },
    setVolume(v) {
      volume = v;
      if (ac) master.gain.setTargetAtTime(v, ac.currentTime, 0.2);
    },
    update(e) { Object.assign(env, e); },
  };
})();
