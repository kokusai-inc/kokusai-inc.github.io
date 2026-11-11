/*
 * senba 予約ウィジェット（2F ギャラリー／3F ドロップイン／3F 相談）
 * 予約データは Google Apps Script（assets/config.js の apiUrl）に送る。
 * apiUrl が空のときは「準備中」を表示する。URL の末尾に ?demo を付けると、つながっていなくても見た目を確認できる。
 */
(function () {
  'use strict';

  var CFG = window.SENBA_CONFIG || {};
  var API_URL = CFG.apiUrl || '';
  var CONTACT = CFG.contact || 'office@kokusai-inc.com';
  var DEMO = !!CFG.demo || /[?&]demo(=|&|$)/.test(location.search);
  var HOLD = CFG.hold || [];
  var DOW = ['日', '月', '火', '水', '木', '金', '土'];

  // ---------- 日付の小道具 ----------
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function ymd(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function parse(s) { var p = s.split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); }
  function addDays(d, n) { var x = new Date(d.getTime()); x.setDate(x.getDate() + n); return x; }
  function jp(s) { var d = parse(s); return (d.getMonth() + 1) + '月' + d.getDate() + '日（' + DOW[d.getDay()] + '）'; }
  function yen(n) { return Number(n).toLocaleString('ja-JP') + '円'; }
  function el(tag, attrs, html) {
    var e = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) { e.setAttribute(k, attrs[k]); });
    if (html != null) e.innerHTML = html;
    return e;
  }
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

  function notReady(root) {
    root.innerHTML = '<div class="bk-notice">オンラインでの予約受付は準備中です。お急ぎの方は <a href="mailto:' + CONTACT +
      '" style="text-decoration:underline">' + CONTACT + '</a> または TEL 088-625-1241（株式会社国際）までご連絡ください。</div>';
  }

  // ---------- 通信 ----------
  function apiGet(params) {
    if (DEMO) return Promise.resolve(demoAvailability(params));
    var q = Object.keys(params).map(function (k) { return k + '=' + encodeURIComponent(params[k]); }).join('&');
    return fetch(API_URL + '?' + q).then(function (r) { return r.json(); });
  }
  function apiPost(body) {
    if (DEMO) return new Promise(function (res) { setTimeout(function () { res({ ok: true, id: 'DEMO-0001' }); }, 600); });
    // Content-Type を付けない（text/plain）ことで、Apps Script へのクロスドメイン送信で事前確認が起きないようにする
    return fetch(API_URL, { method: 'POST', body: JSON.stringify(body) }).then(function (r) { return r.json(); });
  }

  // つながっていないときの見本データ（?demo のときだけ）
  function demoAvailability(p) {
    var out = {}, d = parse(p.from), end = parse(p.to), today = new Date();
    today.setHours(0, 0, 0, 0);
    while (d <= end) {
      var s = ymd(d), w = d.getDay(), past = d <= addDays(today, 2), n = d.getDate();
      if (p.space === '2F') {
        var booked = (n % 9 === 0 || n % 9 === 1);
        var free = !past && w !== 1 && !booked;
        out[s] = { s: past ? 'out' : (w === 1 ? 'closed' : (booked ? 'booked' : 'open')), day: free, week: false };
      } else {
        var open = !past && w !== 0 && w !== 6;
        var left = open ? Math.max(0, 6 - (n % 7)) : 0;
        out[s] = { s: !open ? (past ? 'out' : 'closed') : (left ? 'open' : 'full'), day: open && left > 0, left: left };
      }
      d = addDays(d, 1);
    }
    if (p.space === '2F') Object.keys(out).forEach(function (k) {
      var t = parse(k); if (t.getDay() !== 2) return;
      var ok = true; for (var i = 0; i < 6; i++) { var x = out[ymd(addDays(t, i))]; if (!x || !x.day) ok = false; }
      out[k].week = ok;
    });
    return { ok: true, days: out };
  }

  // ---------- 予約ウィジェット ----------
  function initBooking(root) {
    var space = root.getAttribute('data-booking');
    if (!API_URL && !DEMO) return notReady(root);
    if (!DEMO && HOLD.indexOf(space) >= 0) return notReady(root);  // config.js の hold に入っている階は、台帳の準備ができるまで「準備中」
    var price = {
      day: +root.getAttribute('data-price-day') || 0,
      week: +root.getAttribute('data-price-week') || 0,
      seat: +root.getAttribute('data-price') || 0
    };
    var maxPeople = +root.getAttribute('data-max-people') || 2;
    var privacy = root.getAttribute('data-privacy') || '../privacy.html';
    var rulesHref = root.getAttribute('data-rules') || '#rules';
    var startAttr = root.getAttribute('data-start');
    var today = new Date(); today.setHours(0, 0, 0, 0);
    var first = startAttr && parse(startAttr) > today ? parse(startAttr) : today;
    var st = { plan: space === '2F' ? 'day' : 'dropin', ym: new Date(first.getFullYear(), first.getMonth(), 1), days: {}, loaded: {}, sel: null, minYm: new Date(first.getFullYear(), first.getMonth(), 1) };

    root.innerHTML = '';
    if (DEMO) root.appendChild(el('div', { class: 'bk-demo' }, '見本表示：予約システムにはつながっていません。空き状況は架空です。'));
    if (space === '2F') {
      var plan = el('div', { class: 'bk-plan', role: 'group', 'aria-label': '利用プラン' });
      plan.innerHTML = '<button type="button" data-plan="day" aria-pressed="true">1日（' + yen(price.day) + '・税込）</button>' +
        '<button type="button" data-plan="week" aria-pressed="false">1週間・火〜日の6日間（' + yen(price.week) + '・税込）</button>';
      plan.addEventListener('click', function (e) {
        var b = e.target.closest('button'); if (!b) return;
        st.plan = b.getAttribute('data-plan'); st.sel = null;
        plan.querySelectorAll('button').forEach(function (x) { x.setAttribute('aria-pressed', x === b ? 'true' : 'false'); });
        drawCal(); drawSel();
      });
      root.appendChild(plan);
    }
    var grid = el('div', { class: 'bk-grid' });
    var left = el('div'), right = el('div');
    grid.appendChild(left); grid.appendChild(right); root.appendChild(grid);

    var head = el('div', { class: 'cal-head' }, '<button type="button" data-nav="-1" aria-label="前の月">‹</button><b></b><button type="button" data-nav="1" aria-label="次の月">›</button>');
    var cal = el('div', { class: 'cal', role: 'grid' });
    var legend = el('div', { class: 'cal-legend' });
    var msg = el('div', { class: 'cal-msg', 'aria-live': 'polite' });
    legend.innerHTML = '<span><i style="background:var(--accent-soft)"></i>' + (space === '2F' ? '空きあり（○）' : '空きあり（残り席数）') + '</span>' +
      '<span><i style="background:#EEE"></i>' + (space === '2F' ? '予約済み（×）・休み・受付期間外（－）' : '満席（満）・休館・受付期間外（－）') + '</span>';
    left.appendChild(head); left.appendChild(cal); left.appendChild(legend); left.appendChild(msg);
    head.addEventListener('click', function (e) {
      var b = e.target.closest('button[data-nav]'); if (!b || b.disabled) return;
      st.ym = new Date(st.ym.getFullYear(), st.ym.getMonth() + (+b.getAttribute('data-nav')), 1);
      load();
    });

    var selBox = el('div', { class: 'sel-box' });
    var form = buildForm(space, maxPeople, privacy, rulesHref);
    right.appendChild(selBox); right.appendChild(form.node);

    form.node.addEventListener('submit', function (e) {
      e.preventDefault();
      if (!st.sel) { form.err('カレンダーから日付を選んでください。'); return; }
      var data = form.values();
      var bad = form.validate(data); if (bad) { form.err(bad); return; }
      data.type = space === '2F' ? '2F' : '3F';
      data.plan = st.plan; data.start = st.sel.start; data.end = st.sel.end;
      form.busy(true);
      apiPost(data).then(function (r) {
        form.busy(false);
        if (r && r.ok) { done(r.id, data); }
        else { form.err((r && r.error) || '送信できませんでした。時間をおいてもう一度お試しください。'); if (r && r.code === 'unavailable') { st.loaded = {}; st.sel = null; load(); drawSel(); } }
      }).catch(function () { form.busy(false); form.err('通信に失敗しました。時間をおいて再度お試しいただくか、' + CONTACT + ' へご連絡ください。'); });
    });

    function done(id, data) {
      var people = data.people ? +data.people : 1;
      var body = space === '2F'
        ? '<h3>仮予約を受け付けました</h3><p>受付番号：<b>' + esc(id) + '</b><br>' + selText() + '<br>ご入力のメールアドレスに確認メールをお送りしました。担当者が内容を確認し、予約金（使用料の50%）のお振込みなどをご案内します。<b>ご入金の確認をもって予約成立</b>となります。</p>'
        : '<h3>ご予約を受け付けました</h3><p>受付番号：<b>' + esc(id) + '</b><br>' + selText() + '（' + people + '名）<br>確認メールをお送りしました。当日は3階の受付でお名前をお伝えください。料金（' + yen(price.seat * people) + '）は当日お支払いください。</p>';
      right.innerHTML = '<div class="done">' + body + '</div>';
    }

    function selText() {
      if (!st.sel) return '';
      if (st.plan === 'week') return jp(st.sel.start) + '〜' + jp(st.sel.end) + '（6日間）';
      return jp(st.sel.start);
    }
    function drawSel() {
      if (!st.sel) {
        selBox.innerHTML = space === '2F'
          ? (st.plan === 'week' ? '<b>開始日（火曜日）</b>を選んでください。火〜日の6日間を押さえます。' : '<b>ご利用日</b>を選んでください。')
          : '<b>ご利用日</b>を選んでください。';
        return;
      }
      var p = space === '2F' ? (st.plan === 'week' ? price.week : price.day) : price.seat;
      selBox.innerHTML = '選択中：<b>' + selText() + '</b><br>' +
        (space === '2F' ? '会場使用料 ' + yen(p) + '（税込・割引・有料備品は別途ご案内）' : 'ドロップイン ' + yen(p) + '／1名');
    }

    function load() {
      var y = st.ym.getFullYear(), m = st.ym.getMonth();
      var key = y + '-' + m;
      drawCal();
      if (st.loaded[key]) return;
      msg.textContent = '空き状況を読み込んでいます…';
      var from = ymd(new Date(y, m, 1)), to = ymd(addDays(new Date(y, m + 1, 0), 6));
      apiGet({ action: 'availability', space: space, from: from, to: to }).then(function (r) {
        if (!r || !r.ok) throw new Error();
        Object.keys(r.days).forEach(function (k) { st.days[k] = r.days[k]; });
        st.loaded[key] = true; msg.textContent = ''; drawCal();
      }).catch(function () { msg.textContent = '空き状況を読み込めませんでした。時間をおいて再度お試しください。'; });
    }

    function drawCal() {
      var y = st.ym.getFullYear(), m = st.ym.getMonth();
      head.querySelector('b').textContent = y + '年' + (m + 1) + '月';
      head.querySelector('[data-nav="-1"]').disabled = st.ym <= st.minYm;
      cal.innerHTML = '';
      DOW.forEach(function (w, i) { cal.appendChild(el('div', { class: 'dow' + (i === 0 ? ' sun' : i === 6 ? ' sat' : '') }, w)); });
      var start = new Date(y, m, 1).getDay(), days = new Date(y, m + 1, 0).getDate();
      for (var i = 0; i < start; i++) cal.appendChild(el('div', { class: 'd empty' }));
      for (var n = 1; n <= days; n++) {
        var s = ymd(new Date(y, m, n)), info = st.days[s];
        var ok = !!info && (st.plan === 'week' ? info.week : info.day);
        var mark = '';
        if (info) {
          if (space === '2F') mark = ok ? '○' : (info.s === 'booked' ? '×' : '－');
          else mark = ok ? '残' + info.left : (info.s === 'full' ? '満' : '－');
        }
        var cls = 'd ' + (ok ? 'ok' : 'ng');
        if (st.sel && s >= st.sel.start && s <= st.sel.end) cls += s === st.sel.start ? ' sel' : ' in';
        var b = el(ok ? 'button' : 'div', { class: cls, 'data-d': s }, '<span>' + n + '</span><span class="m">' + mark + '</span>');
        if (ok) { b.type = 'button'; b.setAttribute('aria-label', jp(s) + (space === '3F' && info ? ' 残り' + info.left + '席' : ' 空きあり')); }
        cal.appendChild(b);
      }
    }
    cal.addEventListener('click', function (e) {
      var b = e.target.closest('button.d'); if (!b) return;
      var s = b.getAttribute('data-d');
      st.sel = { start: s, end: st.plan === 'week' ? ymd(addDays(parse(s), 5)) : s };
      form.err(''); drawCal(); drawSel();
    });

    drawSel(); load();
  }

  // ---------- 入力フォーム ----------
  function buildForm(space, maxPeople, privacy, rulesHref) {
    var f = el('form', { class: 'fm', novalidate: '' });
    var h = '';
    h += '<div class="row2"><label>お名前<span class="req">必須</span><input name="name" autocomplete="name" maxlength="60" required></label>' +
      '<label>ふりがな<input name="kana" maxlength="60"></label></div>';
    h += '<div class="row2"><label>メールアドレス<span class="req">必須</span><input name="email" type="email" autocomplete="email" maxlength="120" required></label>' +
      '<label>電話番号<span class="req">必須</span><input name="tel" type="tel" autocomplete="tel" maxlength="20" required></label></div>';
    if (space === '2F') {
      h += '<label>団体名・屋号<input name="org" maxlength="80"></label>';
      h += '<label>催しの内容<span class="req">必須</span><textarea name="content" maxlength="1000" placeholder="例：写真の個展（展示・販売あり）、ワークショップ など" required></textarea></label>';
      h += '<div class="row2"><label>想定来場者数（1日あたり）<input name="visitors" maxlength="20" placeholder="例：30名"></label>' +
        '<label>割引のご希望<select name="discount"><option value="">なし</option><option>学生割引</option><option>リピート割引</option><option>紹介割引</option><option>ボランティア活動割引</option><option>直前割引</option></select></label></div>';
      h += '<label>有料備品のご希望<input name="equipment" maxlength="200" placeholder="例：長机4台、パイプイス20脚"></label>';
    } else {
      h += '<div class="row2"><label>人数<select name="people">' + Array.from({ length: maxPeople }, function (_, i) { return '<option>' + (i + 1) + '</option>'; }).join('') + '</select></label>' +
        '<label>利用目的<select name="purpose"><option>作業</option><option>打ち合わせ</option><option>読書・調べもの</option><option>見学をかねて</option><option>その他</option></select></label></div>';
      h += '<label>ご所属・お仕事<input name="org" maxlength="80"></label>';
    }
    h += '<label>ご質問・ご要望<textarea name="note" maxlength="1000"></textarea></label>';
    h += '<label class="chk"><input type="checkbox" name="agree" value="1" required><span>' +
      (space === '2F' ? '<a href="' + rulesHref + '">ご利用のきまり</a>と' : '<a href="' + rulesHref + '">利用者の約束（ハウスルール）</a>と') +
      '<a href="' + privacy + '" target="_blank" rel="noopener">プライバシーポリシー</a>に同意します</span></label>';
    h += '<div class="hp" aria-hidden="true"><label>ウェブサイト<input name="website" tabindex="-1" autocomplete="off"></label></div>';
    h += '<div class="err" role="alert"></div>';
    h += '<button class="btn btn--accent" type="submit">' + (space === '2F' ? '仮予約を送信する' : '予約する') + '</button>';
    f.innerHTML = h;
    var errBox = f.querySelector('.err'), btn = f.querySelector('button[type=submit]');
    return {
      node: f,
      err: function (t) { errBox.textContent = t; },
      busy: function (b) { btn.disabled = b; btn.textContent = b ? '送信しています…' : (space === '2F' ? '仮予約を送信する' : '予約する'); },
      values: function () {
        var o = {};
        Array.prototype.forEach.call(f.elements, function (x) {
          if (!x.name) return;
          if (x.type === 'checkbox') o[x.name] = x.checked ? x.value : '';
          else o[x.name] = x.value.trim();
        });
        return o;
      },
      validate: function (o) {
        if (!o.name) return 'お名前を入力してください。';
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(o.email)) return 'メールアドレスを正しく入力してください。';
        if (!/^[0-9０-９+\-ー（）() ]{9,}$/.test(o.tel)) return '電話番号を正しく入力してください。';
        if (space === '2F' && !o.content) return '催しの内容を入力してください。';
        if (!o.agree) return '同意のチェックをお願いします。';
        return '';
      }
    };
  }

  // ---------- 相談フォーム（マンスリー・VO・見学など） ----------
  function initInquiry(root) {
    if (!API_URL && !DEMO) return notReady(root);
    var space = root.getAttribute('data-inquiry');
    var kinds = (root.getAttribute('data-kinds') || 'その他').split('|');
    var privacy = root.getAttribute('data-privacy') || '../privacy.html';
    var f = el('form', { class: 'fm', novalidate: '' });
    f.innerHTML = (DEMO ? '<div class="bk-demo">見本表示：送信しても届きません。</div>' : '') +
      '<label>ご相談の種類<span class="req">必須</span><select name="kind">' + kinds.map(function (k) { return '<option>' + esc(k) + '</option>'; }).join('') + '</select></label>' +
      '<div class="row2"><label>お名前<span class="req">必須</span><input name="name" autocomplete="name" maxlength="60"></label><label>ふりがな<input name="kana" maxlength="60"></label></div>' +
      '<div class="row2"><label>メールアドレス<span class="req">必須</span><input name="email" type="email" autocomplete="email" maxlength="120"></label><label>電話番号<span class="req">必須</span><input name="tel" type="tel" autocomplete="tel" maxlength="20"></label></div>' +
      '<label>ご所属・事業内容<input name="org" maxlength="120" placeholder="例：〇〇設計事務所（建築設計）"></label>' +
      '<label>見学・面談のご希望日時（候補を2〜3つ）<input name="dates" maxlength="200" placeholder="例：12/3 午後、12/5 10時〜"></label>' +
      '<label>ご相談の内容<span class="req">必須</span><textarea name="content" maxlength="1500"></textarea></label>' +
      '<label class="chk"><input type="checkbox" name="agree" value="1"><span><a href="' + privacy + '" target="_blank" rel="noopener">プライバシーポリシー</a>に同意します</span></label>' +
      '<div class="hp" aria-hidden="true"><label>ウェブサイト<input name="website" tabindex="-1" autocomplete="off"></label></div>' +
      '<div class="err" role="alert"></div><button class="btn btn--accent" type="submit">相談を送信する</button>';
    root.innerHTML = ''; root.appendChild(f);
    var errBox = f.querySelector('.err'), btn = f.querySelector('button');
    f.addEventListener('submit', function (e) {
      e.preventDefault();
      var o = {}; Array.prototype.forEach.call(f.elements, function (x) { if (x.name) o[x.name] = x.type === 'checkbox' ? (x.checked ? x.value : '') : x.value.trim(); });
      var bad = !o.name ? 'お名前を入力してください。' : !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(o.email) ? 'メールアドレスを正しく入力してください。' :
        !/^[0-9０-９+\-ー（）() ]{9,}$/.test(o.tel) ? '電話番号を正しく入力してください。' : !o.content ? 'ご相談の内容を入力してください。' : !o.agree ? '同意のチェックをお願いします。' : '';
      if (bad) { errBox.textContent = bad; return; }
      o.type = 'inquiry'; o.space = space;
      btn.disabled = true; btn.textContent = '送信しています…';
      apiPost(o).then(function (r) {
        if (r && r.ok) root.innerHTML = '<div class="done"><h3>ご相談を受け付けました</h3><p>受付番号：<b>' + esc(r.id) + '</b><br>確認メールをお送りしました。2〜3営業日以内に担当者からご連絡します。</p></div>';
        else { btn.disabled = false; btn.textContent = '相談を送信する'; errBox.textContent = (r && r.error) || '送信できませんでした。'; }
      }).catch(function () { btn.disabled = false; btn.textContent = '相談を送信する'; errBox.textContent = '通信に失敗しました。' + CONTACT + ' へご連絡ください。'; });
    });
  }

  document.querySelectorAll('[data-booking]').forEach(initBooking);
  document.querySelectorAll('[data-inquiry]').forEach(initInquiry);
})();
