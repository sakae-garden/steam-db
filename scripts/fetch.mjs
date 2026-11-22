#!/usr/bin/env node
// Steamの公開API（GitHub Actions上で実行）
//  - ISteamChartsService/GetMostPlayedGames：今もっとも遊ばれているゲーム上位（公式・キー不要）
//  - ISteamUserStats/GetNumberOfCurrentPlayers：ゲームごとの同時接続数（公式・キー不要）
//  - store appdetails：ストアの名称・価格・対応言語・必要スペック（日本円・日本語）
// 保存：data/apps.json（ゲームの基本情報）、data/peaks.json（日ごとの最大同時接続数）、data/now.json（直近の同時接続数）
import fs from 'node:fs';
import path from 'node:path';
const DATA = path.resolve('data');
const UA = { 'User-Agent': 'steam-db (mminnie.com)' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const read = (f, d) => (fs.existsSync(path.join(DATA, f)) ? JSON.parse(fs.readFileSync(path.join(DATA, f), 'utf8')) : d);
const save = (f, v) => fs.writeFileSync(path.join(DATA, f), JSON.stringify(v));
async function get(url, tries = 3) {
  for (let i = 0; i < tries; i++) {
    try { const r = await fetch(url, { headers: UA }); if (r.status === 429) { await sleep(60000); continue; } if (!r.ok) throw new Error(r.status); return await r.json(); }
    catch (e) { if (i === tries - 1) { console.error('fail', url, e.message); return null; } await sleep(3000); }
  }
}
const apps = read('apps.json', {});
const peaks = read('peaks.json', {});
const now = { at: new Date().toISOString(), players: {} };
const jst = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);

// 1) 上位100（毎回）
const mp = await get('https://api.steampowered.com/ISteamChartsService/GetMostPlayedGames/v1/');
const top = mp?.response?.ranks || [];
for (const r of top) { apps[r.appid] ||= { appid: r.appid, added: jst }; apps[r.appid].mpRank = r.rank; apps[r.appid].mpAt = jst; }
console.log('most played', top.length);
// 1b) 追跡するゲームを広げる（1日1回）：SteamSpyの所有者数上位の一覧から、ゲームのIDだけを使う（数値は使わない）
const meta = read('meta.json', {});
if (meta.spyAt !== jst) {
  const PAGES = +(process.env.SPY_PAGES || 2); let add = 0;
  for (let pg = 0; pg < PAGES; pg++) {
    if (pg) await sleep(61000); // 「all」は毎分1回まで
    const j = await get(`https://steamspy.com/api.php?request=all&page=${pg}`);
    for (const id of Object.keys(j || {})) if (!apps[id]) { apps[id] = { appid: +id, added: jst }; add++; }
  }
  meta.spyAt = jst; save('meta.json', meta); console.log('tracked +', add);
}

// 2) 同時接続数（追跡中の全ゲーム。8並列）
const ids = Object.keys(apps);
let done = 0;
for (let i = 0; i < ids.length; i += 8) {
  await Promise.all(ids.slice(i, i + 8).map(async (id) => {
    const j = await get(`https://api.steampowered.com/ISteamUserStats/GetNumberOfCurrentPlayers/v1/?appid=${id}`);
    const n = j?.response?.player_count;
    if (typeof n === 'number') { now.players[id] = n; peaks[id] ||= {}; peaks[id][jst] = Math.max(peaks[id][jst] || 0, n); done++; }
  }));
  await sleep(200);
}
console.log('players', done, '/', ids.length);
// 古い記録は400日で捨てる。最大でも30人未満のゲームは60日分だけ残す（データの肥大を防ぐ）
for (const id of Object.keys(peaks)) { const v = Object.values(peaks[id]); if (v.length && Math.max(...v) < 30) for (const d of Object.keys(peaks[id])) if (d < new Date(Date.now() - 60 * 864e5).toISOString().slice(0, 10)) delete peaks[id][d]; }
for (const id of Object.keys(peaks)) for (const d of Object.keys(peaks[id])) if (d < new Date(Date.now() - 400 * 864e5).toISOString().slice(0, 10)) delete peaks[id][d];

// 3) ストア情報：未取得のものと、更新が古いもの（上位から最大 DETAIL_MAX 件）。1.6秒間隔（ストアの制限を守る）
const MAX = +(process.env.DETAIL_MAX || 300);
// 未取得（detailAt なし）を先に、次に更新が古い順。取得できなかったもの（na）も detailAt で判定する
// 優先順：まだ一度も取得していない新しいゲーム → 紹介文が未取得のもの → 残りは更新の古い順
const rank = (id) => (!apps[id].name ? 0 : !('desc' in apps[id]) ? 1 : 2);
const queue = ids.filter((id) => (apps[id].detailAt || '') < jst || (apps[id].name && !('desc' in apps[id]) && !apps[id].na)).sort((a, b) => (rank(a) - rank(b)) || ((apps[a].detailAt || '') < (apps[b].detailAt || '') ? -1 : (apps[a].detailAt || '') > (apps[b].detailAt || '') ? 1 : (now.players[b] || 0) - (now.players[a] || 0))).slice(0, MAX);
let got = 0;
for (const id of queue) {
  const j = await get(`https://store.steampowered.com/api/appdetails?appids=${id}&cc=jp&l=japanese`);
  const d = j?.[id];
  if (d?.success && d.data) {
    const x = d.data;
    Object.assign(apps[id], {
      name: x.name, type: x.type, free: !!x.is_free, header: x.header_image, capsule: x.capsule_image,
      price: x.price_overview ? { now: Math.round(x.price_overview.final / 100), base: Math.round(x.price_overview.initial / 100), off: x.price_overview.discount_percent } : null,
      langs: x.supported_languages || '', req: { min: x.pc_requirements?.minimum || '', rec: x.pc_requirements?.recommended || '' },
      genres: (x.genres || []).map((g) => g.description), dev: x.developers || [], pub: x.publishers || [],
      release: x.release_date?.date || '', coming: !!x.release_date?.coming_soon, age: x.required_age || 0,
      reviews: x.recommendations?.total || 0, detailAt: jst,
      // ストアの短い紹介文（日本語があれば日本語）。タグと文字参照を取り除く
      desc: (x.short_description || '').replace(/<[^>]+>/g, '').replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ').replace(/&reg;/g, '®').replace(/&trade;/g, '™').replace(/&copy;/g, '©').replace(/&hellip;/g, '…').replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16))).replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n)).replace(/\s+/g, ' ').trim(),
      // 紹介動画（最初のトレーラー）とスクリーンショット。ファイルはSteamのサーバーにあるものを表示するだけ
      movie: (() => { const m = (x.movies || []).find((v) => v.highlight) || (x.movies || [])[0]; if (!m) return null; return { name: m.name || '', thumb: m.thumbnail || '', mp4: m.mp4?.['480'] || m.mp4?.max || '', webm: m.webm?.['480'] || m.webm?.max || '', hls: m.hls_h264 || '', }; })(),
      shots: (x.screenshots || []).slice(0, 4).map((v) => ({ t: v.path_thumbnail, f: v.path_full })),
    });
    // 価格の履歴（日ごと）
    if (apps[id].price) { apps[id].priceHist ||= {}; apps[id].priceHist[jst] = apps[id].price.now; }
    got++;
  } else if (d && !d.success) { apps[id].detailAt = jst; apps[id].na = true; }
  await sleep(1600);
}
console.log('details', got, '/', queue.length);
save('apps.json', apps); save('peaks.json', peaks); save('now.json', now);
