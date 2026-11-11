/* フロア別ページの小さな動き（2026/10/31 ドラフト）
 * - ほかの階へ移ったとき、前のページのスクロール位置が残らないよう、ページの先頭から表示する
 * - [data-calc] 1Fの家賃の計算 */
(function () {
  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
  function toTop() { if (!location.hash) window.scrollTo(0, 0); }
  toTop();
  window.addEventListener('pageshow', toTop);
  window.addEventListener('load', function () { toTop(); setTimeout(toTop, 60); });

  var calc = document.querySelector('[data-calc]');
  if (calc) {
    var r = calc.querySelector('input[type=range]');
    var yen = function (n) { return Number(n).toLocaleString('ja-JP') + '円'; };
    var upd = function () {
      var s = Number(r.value), rent = Math.round(s * 0.1);
      calc.querySelector('#sales-out').textContent = yen(s);
      calc.querySelector('#rent-out').textContent = yen(rent);
      calc.querySelector('#total-out').textContent = yen(rent + 15000);
    };
    r.addEventListener('input', upd);
    upd();
  }
})();
