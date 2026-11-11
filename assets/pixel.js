/* senba ピクセル要素の動き（2026/10/31 ドラフト）
 * - [data-px-msg]  … メッセージ窓：data-lines を「|」で区切った文を、1文字ずつ表示して順にめぐる
 * - [data-floor]   … 同じ data-floor を持つホットスポットとコマンドを、ホバーで一緒に光らせる */
(function () {
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  document.querySelectorAll('[data-px-msg]').forEach(function (box) {
    var out = box.querySelector('.txt');
    var lines = (box.getAttribute('data-lines') || '').split('|');
    if (!out || !lines.length) return;
    var i = 0, timer = null;
    function show(n) {
      var s = lines[n], k = 0;
      clearInterval(timer);
      if (reduce) { out.textContent = s; return; }
      out.textContent = '';
      timer = setInterval(function () {
        k++;
        out.textContent = s.slice(0, k);
        if (k >= s.length) clearInterval(timer);
      }, 55);
    }
    show(0);
    if (lines.length > 1) {
      setInterval(function () { i = (i + 1) % lines.length; show(i); }, 5200);
    }
  });

  document.querySelectorAll('[data-floor]').forEach(function (el) {
    var f = el.getAttribute('data-floor');
    function set(on) {
      document.querySelectorAll('[data-floor="' + f + '"]').forEach(function (x) { x.classList.toggle('on', on); });
    }
    el.addEventListener('mouseenter', function () { set(true); });
    el.addEventListener('mouseleave', function () { set(false); });
    el.addEventListener('focus', function () { set(true); });
    el.addEventListener('blur', function () { set(false); });
  });
})();
