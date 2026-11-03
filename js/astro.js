/* 천문 계산 — 해·달의 위치와 위상 (SunCalc 계열 저정밀 공식, 화면 표현에 충분한 정확도) */
const Astro = (() => {
  'use strict';
  const PI = Math.PI, rad = PI / 180, dayMs = 86400000, J1970 = 2440588, J2000 = 2451545;
  const e = rad * 23.4397; // 황도 경사

  const toDays = (ms) => ms / dayMs - 0.5 + J1970 - J2000;
  const rightAscension = (l, b) => Math.atan2(Math.sin(l) * Math.cos(e) - Math.tan(b) * Math.sin(e), Math.cos(l));
  const declination = (l, b) => Math.asin(Math.sin(b) * Math.cos(e) + Math.cos(b) * Math.sin(e) * Math.sin(l));
  const siderealTime = (d, lng) => rad * (280.16 + 360.9856235 * d) + rad * lng;

  function sunCoords(d) {
    const M = rad * (357.5291 + 0.98560028 * d);
    const C = rad * (1.9148 * Math.sin(M) + 0.02 * Math.sin(2 * M) + 0.0003 * Math.sin(3 * M));
    const L = M + C + rad * 102.9372 + PI;
    return { ra: rightAscension(L, 0), dec: declination(L, 0), lon: L };
  }

  function moonCoords(d) {
    const L = rad * (218.316 + 13.176396 * d);
    const M = rad * (134.963 + 13.064993 * d);
    const F = rad * (93.272 + 13.22935 * d);
    const l = L + rad * 6.289 * Math.sin(M);
    const b = rad * 5.128 * Math.sin(F);
    return { ra: rightAscension(l, b), dec: declination(l, b), dist: 385001 - 20905 * Math.cos(M) };
  }

  // 적경·적위 → 고도·방위각(도, 북=0 동=90)
  function toHorizontal(ra, dec, d, lat, lng) {
    const phi = rad * lat, H = siderealTime(d, lng) - ra;
    const alt = Math.asin(Math.sin(phi) * Math.sin(dec) + Math.cos(phi) * Math.cos(dec) * Math.cos(H));
    const az = Math.atan2(Math.sin(H), Math.cos(H) * Math.sin(phi) - Math.tan(dec) * Math.cos(phi));
    return { alt: alt / rad, az: ((az / rad + 180) % 360 + 360) % 360 };
  }

  // 대기 굴절 보정 (지평선 근처에서 해·달이 약간 떠 보이는 효과)
  function refract(h) {
    if (h < -1.5) return h;
    const hh = Math.max(h, -1);
    return h + 1.02 / Math.tan(rad * (hh + 10.3 / (hh + 5.11))) / 60;
  }

  function sun(ms, lat, lng) {
    const d = toDays(ms), c = sunCoords(d);
    const p = toHorizontal(c.ra, c.dec, d, lat, lng);
    p.alt = refract(p.alt);
    return p;
  }

  function moon(ms, lat, lng) {
    const d = toDays(ms), c = moonCoords(d);
    const p = toHorizontal(c.ra, c.dec, d, lat, lng);
    p.alt -= 0.95 * Math.cos(p.alt * rad); // 시차
    p.alt = refract(p.alt);
    p.dist = c.dist;
    return p;
  }

  // fraction: 밝은 면 비율, phase: 0 삭 → 0.25 상현 → 0.5 보름 → 0.75 하현
  function moonIllum(ms) {
    const d = toDays(ms), s = sunCoords(d), m = moonCoords(d), sdist = 149598000;
    const phi = Math.acos(Math.sin(s.dec) * Math.sin(m.dec) + Math.cos(s.dec) * Math.cos(m.dec) * Math.cos(s.ra - m.ra));
    const inc = Math.atan2(sdist * Math.sin(phi), m.dist - sdist * Math.cos(phi));
    const angle = Math.atan2(Math.cos(s.dec) * Math.sin(s.ra - m.ra),
      Math.sin(s.dec) * Math.cos(m.dec) - Math.cos(s.dec) * Math.sin(m.dec) * Math.cos(s.ra - m.ra));
    return { fraction: (1 + Math.cos(inc)) / 2, phase: 0.5 + 0.5 * inc * (angle < 0 ? -1 : 1) / PI };
  }

  const lst = (ms, lng) => siderealTime(toDays(ms), lng);
  // 해의 황경(도, 0~360) — 0 춘분, 90 하지, 180 추분, 270 동지
  // (계산식이 2000년 기준이라, 그 뒤로 춘분점이 움직인 세차만큼 더해 줌)
  const sunLon = (ms) => {
    const d = toDays(ms);
    return ((sunCoords(d).lon / rad + 1.397 * d / 36525) % 360 + 360) % 360;
  };

  // 하루(start부터 24시간) 동안의 일출·일몰·월출·월몰·남중
  function dayEvents(start, lat, lng) {
    const step = 5 * 60000, end = start + dayMs;
    const find = (fn, h0) => {
      let rise = null, set = null, prev = fn(start);
      for (let t = start + step; t <= end; t += step) {
        const cur = fn(t), f = step * (h0 - prev) / (cur - prev);
        if (rise === null && prev < h0 && cur >= h0) rise = t - step + f;
        if (set === null && prev >= h0 && cur < h0) set = t - step + f;
        prev = cur;
      }
      return { rise, set };
    };
    const sunAlt = (t) => sun(t, lat, lng).alt;
    const s = find(sunAlt, -0.27);
    const m = find((t) => moon(t, lat, lng).alt, -0.27);
    let noon = start, noonAlt = -90;
    for (let t = start; t <= end; t += step) {
      const a = sunAlt(t);
      if (a > noonAlt) { noonAlt = a; noon = t; }
    }
    return {
      sunrise: s.rise, sunset: s.set, noon, noonAlt,
      sunriseAz: s.rise ? sun(s.rise, lat, lng).az : 110,
      sunsetAz: s.set ? sun(s.set, lat, lng).az : 250,
      moonrise: m.rise, moonset: m.set,
    };
  }

  return { sun, moon, moonIllum, lst, sunLon, dayEvents };
})();
