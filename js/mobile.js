/* 휴대폰 화면 — 아래 탭 막대와 '시간·방향', '더보기' 시트를 다룹니다.
   탭은 데스크톱용 버튼(오른쪽 아이콘)을 대신 눌러 주므로 기능은 한곳에만 있습니다. */
const Mobile = (() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const mq = window.matchMedia('(max-width: 760px), (max-height: 500px)');
  let cfg = null;

  const isMobile = () => mq.matches;

  function setSheet(name) {
    const time = name === 'time', more = name === 'more';
    document.querySelector('.bottom').classList.toggle('open', time);
    $('moreSheet').classList.toggle('open', more);
    $('moreSheet').setAttribute('aria-hidden', String(!more));
    $('tabTime').classList.toggle('on', time);
    $('tabMore').classList.toggle('on', more);
  }
  const openSheet = () => (document.querySelector('.bottom').classList.contains('open') ? 'time' : $('moreSheet').classList.contains('open') ? 'more' : null);

  // 풍경을 톡 누르면 열린 시트·패널을 모두 닫음 (휴대폰에서만)
  function closeAll() {
    if (!isMobile()) return false;
    const had = !!openSheet();
    setSheet(null);
    if (cfg.closePanels) cfg.closePanels();
    return had;
  }

  function init(options) {
    cfg = options;
    document.querySelectorAll('[data-click]').forEach((b) => b.addEventListener('click', () => {
      setSheet(null);
      $(b.dataset.click).click();
    }));
    $('tabTime').addEventListener('click', () => {
      const on = openSheet() !== 'time';
      if (on && cfg.closePanels) cfg.closePanels();
      setSheet(on ? 'time' : null);
    });
    $('tabMore').addEventListener('click', () => {
      const on = openSheet() !== 'more';
      if (on && cfg.closePanels) cfg.closePanels();
      setSheet(on ? 'more' : null);
    });
    // 소리·음악 켜짐 표시를 탭에도 똑같이
    for (const [src, dst] of [['btnSound', 'tabSound'], ['btnMusic', 'tabMusic']]) {
      const sync = () => $(dst).setAttribute('aria-pressed', $(src).getAttribute('aria-pressed') || 'false');
      new MutationObserver(sync).observe($(src), { attributes: true, attributeFilter: ['aria-pressed'] });
      sync();
    }
    // 화면이 넓어지면(휴대폰을 큰 화면에 연결 등) 시트 정리
    mq.addEventListener('change', () => setSheet(null));
  }

  return { init, isMobile, closeAll, closeSheets: () => setSheet(null) };
})();
