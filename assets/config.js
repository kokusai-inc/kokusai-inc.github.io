/* senba サイト設定。apiUrl は予約システム（Google Apps Script のウェブアプリ）の URL。
 * 2026/10/31 山田の個人アカウントでデプロイしたもの。senba 用のアカウントへ移したら差し替える（05_予約システム/261031_予約システム_移行手順.md） */
window.SENBA_CONFIG = {
  apiUrl: 'https://script.google.com/macros/s/AKfycbw9SeK6HfwyHfqsMgXIoLe2_aWEIeSvVO45Vy0cdilN2BzSuIEJEJTqOXC9GTmiTcNM/exec',
  contact: 'office@kokusai-inc.com',  // 2026/11/9 お名前.comのサーバー障害のため senba@ から変更
  hold: ['2F']  // 紙の名簿の予約を台帳に書き写し終えるまで、2Fのオンライン仮予約は「準備中」。終わったら [] にする
};
