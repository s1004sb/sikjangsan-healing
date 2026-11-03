/* 특별한 하늘 소식 — 유성우, 보름달·슈퍼문, 삭, 춘분·하지·추분·동지를 날짜별로 알려줍니다. */
const SkyEvents = (() => {
  'use strict';
  const HOUR = 3600000, DAY = 86400000, KST = 9 * HOUR;

  // 해마다 거의 같은 날 찾아오는 주요 유성우 (극대일, 평소 대비 별똥별 배수)
  const SHOWERS = [
    { name: '사분의자리 유성우', m: 1, d: 4, peak: 6, where: '새벽 북동쪽 하늘' },
    { name: '거문고자리 유성우', m: 4, d: 22, peak: 3, where: '자정 무렵 동쪽 하늘' },
    { name: '물병자리 에타 유성우', m: 5, d: 6, peak: 3, where: '새벽 동쪽 하늘' },
    { name: '페르세우스자리 유성우', m: 8, d: 13, peak: 8, where: '자정 이후 북동쪽 하늘' },
    { name: '오리온자리 유성우', m: 10, d: 21, peak: 3, where: '자정 이후 동쪽 하늘' },
    { name: '사자자리 유성우', m: 11, d: 17, peak: 3, where: '새벽 동쪽 하늘' },
    { name: '쌍둥이자리 유성우', m: 12, d: 14, peak: 9, where: '밤새 동쪽에서 남쪽 하늘' },
  ];

  function shower(dayStart) {
    const mid = dayStart + DAY / 2, y = new Date(mid + KST).getUTCFullYear();
    let best = null;
    for (const s of SHOWERS) {
      for (const yy of [y - 1, y, y + 1]) {
        const dd = (mid - (Date.UTC(yy, s.m - 1, s.d, 12) - KST)) / DAY;
        if (Math.abs(dd) > 2.5) continue;
        const mult = 1 + (s.peak - 1) * (1 - Math.abs(dd) / 2.5);
        if (!best || mult > best.mult) best = { s, mult, dd };
      }
    }
    return best;
  }

  // dayStart: 한국 시각 0시. 반환: { list: [{icon, title, desc}], meteor: 별똥별 배수 }
  function forDay(dayStart) {
    const list = [];
    let meteor = 1;

    const sh = shower(dayStart);
    if (sh) {
      meteor = sh.mult;
      list.push({
        icon: '🌠',
        title: Math.abs(sh.dd) < 0.5 ? `오늘 밤은 ${sh.s.name} 극대기예요` : `${sh.s.name}가 찾아오는 중이에요`,
        desc: `${sh.s.where}에서 별똥별이 평소보다 많이 떨어져요. 밤하늘을 오래 바라봐 주세요.`,
      });
    }

    // 보름·삭의 순간이 이 하루 안에 들어 있는지
    const noon = dayStart + DAY / 2, p0 = Astro.moonIllum(dayStart).phase, p1 = Astro.moonIllum(dayStart + DAY).phase;
    if (p0 < 0.5 && p1 >= 0.5) {
      const superMoon = Astro.moon(noon, 36.29, 127.49).dist < 361000;
      list.push(superMoon
        ? { icon: '🌕', title: '오늘은 슈퍼문이 떠요', desc: '달이 지구와 가까워 평소보다 크고 밝게 보이는 보름달이에요.' }
        : { icon: '🌕', title: '오늘은 보름달이 떠요', desc: '해가 지면 동쪽 하늘에서 둥근 달이 떠올라요. 소원을 빌어 보세요.' });
    } else if (p0 > 0.9 && p1 < 0.1) {
      list.push({ icon: '🌑', title: '달이 쉬는 날이에요', desc: '달빛이 없어 별과 은하수가 가장 잘 보이는 밤이에요.' });
    }

    // 해의 황경이 0·90·180·270도를 지나는 날
    const q0 = Math.floor(Astro.sunLon(dayStart) / 90), q1 = Math.floor(Astro.sunLon(dayStart + DAY) / 90);
    if (q0 !== q1) {
      list.push([
        { icon: '🌸', title: '오늘은 춘분이에요', desc: '낮과 밤의 길이가 같아지는 날. 이제부터 낮이 점점 길어져요.' },
        { icon: '☀️', title: '오늘은 하지예요', desc: '일 년 중 낮이 가장 긴 날이에요. 해가 가장 높이 떠요.' },
        { icon: '🍂', title: '오늘은 추분이에요', desc: '낮과 밤의 길이가 같아지는 날. 이제부터 밤이 점점 길어져요.' },
        { icon: '❄️', title: '오늘은 동지예요', desc: '일 년 중 밤이 가장 긴 날. 별을 가장 오래 볼 수 있어요.' },
      ][q1]);
    }

    return { list, meteor };
  }

  return { forDay };
})();
