#!/usr/bin/env node
// data/ から静的サイトを dist/ に作る
import fs from 'node:fs';
import path from 'node:path';
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const DIST = path.join(ROOT, 'dist');
const SITE = { name: '同接ナウ', url: 'https://steam.mminnie.com', operator: 'mminnie.com 編集部', contact: 'https://docs.google.com/forms/d/e/1FAIpQLSchNBjp8QQ7mbNG5nNGSI6-ikkx00QRZFPM8st0B6WLA16alQ/viewform', ga: 'G-XL7DW884H3', ads: 'ca-pub-2361768568271631' };
const read = (f, d) => (fs.existsSync(path.join(ROOT, 'data', f)) ? JSON.parse(fs.readFileSync(path.join(ROOT, 'data', f), 'utf8')) : d);
const apps = read('apps.json', {}), peaks = read('peaks.json', {}), now = read('now.json', { players: {} });
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const strip = (h) => String(h || '').replace(/<br\s*\/?>/gi, '\n').replace(/<\/li>/gi, '\n').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').trim();
const nf = (n) => Number(n).toLocaleString('ja-JP');
const today = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
const ver = Date.now().toString(36);
fs.rmSync(DIST, { recursive: true, force: true });
const sitemap = [];
function write(p, html, index = true) { const f = path.join(DIST, p.endsWith('/') ? p + 'index.html' : p); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, html); if (index) sitemap.push(SITE.url + p); }

// 日本語対応の読み取り（ストアの対応言語の文字列から）
function jp(a) {
  const s = a.langs || '';
  const m = s.match(/日本語(<strong>\*<\/strong>)?/);
  if (!m) return { ui: false, voice: false };
  return { ui: true, voice: !!m[1] };
}
const P = (a) => now.players[a.appid] ?? null;
const days = (a) => Object.entries(peaks[a.appid] || {}).sort((x, y) => (x[0] < y[0] ? -1 : 1));
const maxPeak = (a) => days(a).reduce((m, [d, v]) => (v > m.v ? { d, v } : m), { d: '', v: 0 });
const valid = Object.values(apps).filter((a) => a.name && !a.na && a.type === 'game');
const byNow = [...valid].filter((a) => P(a) != null).sort((a, b) => P(b) - P(a));

function layout({ title, desc, path: p, body, index = true, img = '' }) {
  return `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}｜${SITE.name}</title><meta name="description" content="${esc(desc)}"><link rel="canonical" href="${SITE.url}${p}">
${index ? '' : '<meta name="robots" content="noindex,follow">'}<meta name="color-scheme" content="light dark">
<meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(desc)}"><meta property="og:type" content="website"><meta property="og:url" content="${SITE.url}${p}">${img ? `<meta property="og:image" content="${esc(img)}"><meta name="twitter:card" content="summary_large_image">` : ''}
<link rel="icon" href="/favicon.svg"><link rel="stylesheet" href="/fonts.css?v=${ver}"><link rel="stylesheet" href="/style.css?v=${ver}">
<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${SITE.ads}" crossorigin="anonymous"></script>
<script async src="https://www.googletagmanager.com/gtag/js?id=${SITE.ga}"></script><script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}gtag('js',new Date());gtag('config','${SITE.ga}');</script>
</head><body><header class="top"><a class="logo" href="/"><span class="lg-dot"></span>${SITE.name}</a><nav><a href="/ranking/">ランキング</a><a href="/sale/">セール</a><a href="/japanese/">日本語対応</a></nav></header>
<main>${body}</main>
<footer><p>同時接続数・価格・対応言語はSteamの公開データ（Valve Corporation提供）をもとに当サイトが集計しています。当サイトはValve Corporationとは関係ありません。Steam および Steam ロゴは Valve Corporation の商標です。</p><p><a href="/about/">運営者情報</a><a href="/privacy/">プライバシーポリシー</a><a href="${SITE.contact}" target="_blank" rel="noopener">お問い合わせ</a></p><p>© ${today.slice(0, 4)} ${SITE.operator}</p></footer></body></html>`;
}

// 日別ピークのグラフ（SVG）
function chart(a, n = 60) {
  const ds = days(a).slice(-n);
  if (ds.length < 2) return '<p class="note">同時接続数の記録は、当サイトが集計を始めた日からたまっていきます。</p>';
  const W = 640, H = 200, max = Math.max(...ds.map((x) => x[1])) * 1.1 || 1;
  const pts = ds.map(([, v], i) => [Math.round((i / (ds.length - 1)) * (W - 20)) + 10, Math.round(H - 20 - (v / max) * (H - 40))]);
  const top = ds.reduce((m, x, i) => (x[1] > ds[m][1] ? i : m), 0);
  return `<figure class="chart"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="日ごとの最大同時接続数"><polyline points="${pts.map((p) => p.join(',')).join(' ')}" class="ln"/><polygon points="10,${H - 20} ${pts.map((p) => p.join(',')).join(' ')} ${W - 10},${H - 20}" class="ar"/><circle cx="${pts[top][0]}" cy="${pts[top][1]}" r="5" class="pk"/><text x="${Math.min(pts[top][0], W - 120)}" y="${Math.max(pts[top][1] - 10, 14)}" class="pkt">${nf(ds[top][1])}人（${ds[top][0].slice(5).replace('-', '/')}）</text></svg><figcaption>日ごとの最大同時接続数（直近${ds.length}日）</figcaption></figure>`;
}
function specList(h) { const t = strip(h).replace(/^(最低|推奨)[:：]?\s*/m, ''); return t ? `<ul class="spec">${t.split('\n').map((x) => x.trim()).filter(Boolean).map((x) => { const [k, ...v] = x.split(/[:：]/); return v.length ? `<li><b>${esc(k)}</b><span>${esc(v.join(':').trim())}</span></li>` : `<li><span>${esc(x)}</span></li>`; }).join('')}</ul>` : '<p class="note">記載なし</p>'; }
const card = (a, sub) => `<a class="row" href="/game/${a.appid}/"><img src="${esc(a.capsule || a.header)}" alt="" loading="lazy" width="184" height="69"><span class="rt"><b>${esc(a.name)}</b><span>${sub}</span></span></a>`;
const jpBadge = (a) => { const j = jp(a); return j.voice ? '<i class="jp v">日本語音声</i>' : j.ui ? '<i class="jp">日本語</i>' : ''; };
const priceTxt = (a) => (a.free ? '無料' : a.price ? (a.price.off ? `<s>¥${nf(a.price.base)}</s> <em>¥${nf(a.price.now)}</em> <i class="off">-${a.price.off}%</i>` : `¥${nf(a.price.now)}`) : '');

// ゲームページ
for (const a of valid) {
  const p = P(a), pk = maxPeak(a), td = (peaks[a.appid] || {})[today], j = jp(a);
  const ph = Object.entries(a.priceHist || {}); const low = ph.length ? Math.min(...ph.map((x) => x[1])) : null;
  const body = `<article class="game">
<figure class="hero"><img src="${esc(a.header)}" alt="${esc(a.name)}" width="460" height="215"></figure>
<p class="crumbs"><a href="/">トップ</a> › <a href="/ranking/">ランキング</a></p>
<h1>${esc(a.name)}<small>同時接続数・セール価格・日本語対応・必要スペック</small></h1>
<div class="stats"><div class="st big"><span>今プレイ中</span><b>${p != null ? nf(p) : '—'}<i>人</i></b></div><div class="st"><span>今日の最大</span><b>${td ? nf(td) : '—'}<i>人</i></b></div><div class="st"><span>記録上の最大${pk.d ? `（${pk.d.slice(5).replace('-', '/')}）` : ''}</span><b>${pk.v ? nf(pk.v) : '—'}<i>人</i></b></div></div>
${chart(a)}
<section class="box"><h2>価格</h2><p class="price">${priceTxt(a) || '価格情報なし'}</p>${low != null && a.price && low < a.price.now ? `<p class="note">当サイトの記録上の最安値は ¥${nf(low)} です。</p>` : ''}<p><a class="btn" href="https://store.steampowered.com/app/${a.appid}/" target="_blank" rel="noopener">Steamストアで見る</a></p></section>
<section class="box"><h2>日本語対応</h2><ul class="jpl"><li class="${j.ui ? 'ok' : 'ng'}"><span>画面・字幕</span><b>${j.ui ? '日本語あり' : 'なし'}</b></li><li class="${j.voice ? 'ok' : 'ng'}"><span>音声</span><b>${j.voice ? '日本語あり' : 'なし'}</b></li></ul><p class="note">Steamストアの対応言語の表示にもとづきます。</p></section>
<section class="box"><h2>必要スペック（Windows）</h2><div class="specs"><div><h3>最低</h3>${specList(a.req?.min)}</div><div><h3>推奨</h3>${specList(a.req?.rec)}</div></div></section>
<section class="box"><h2>基本情報</h2><ul class="kv"><li><span>ジャンル</span><b>${esc(a.genres.join('・') || '—')}</b></li><li><span>開発</span><b>${esc(a.dev.join('、') || '—')}</b></li><li><span>発売</span><b>${esc(a.pub.join('、') || '—')}</b></li><li><span>発売日</span><b>${esc(a.release || '—')}</b></li></ul></section>
<p class="note">最終更新：${esc(now.at ? new Date(new Date(now.at).getTime() + 9 * 3600e3).toISOString().slice(0, 16).replace('T', ' ') : today)}（3時間ごとに自動更新）</p>
</article>`;
  write(`/game/${a.appid}/`, layout({ title: `${a.name}の同時接続数・セール価格・日本語対応`, desc: `${a.name}の今の同時接続数${p != null ? `（${nf(p)}人）` : ''}、日ごとの推移、Steamでの価格とセール、日本語対応、必要スペックをまとめています。`, path: `/game/${a.appid}/`, body, img: a.header }), days(a).length >= 1);
}

// トップ
{
  const top = byNow.slice(0, 50);
  const sale = valid.filter((a) => a.price?.off).sort((a, b) => (P(b) || 0) - (P(a) || 0)).slice(0, 12);
  const body = `<section class="intro"><div class="mosaic">${top.slice(0, 6).map((a) => `<a href="/game/${a.appid}/"><img src="${esc(a.header)}" alt="${esc(a.name)}"></a>`).join('')}</div>
<h1>今、Steamで遊ばれているゲーム</h1><p>同時接続数（今プレイしている人数）を3時間ごとに集計。セール価格、日本語対応、必要スペックもまとめて見られます。</p></section>
<section><h2>同時接続数ランキング</h2><ol class="rank">${top.map((a, i) => `<li>${card(a, `<em class="n">${nf(P(a))}</em>人がプレイ中 ${jpBadge(a)}`)}</li>`).join('')}</ol><p class="more"><a href="/ranking/">ランキングをすべて見る</a></p></section>
${sale.length ? `<section><h2>セール中の人気作</h2><ul class="rank">${sale.map((a) => `<li>${card(a, priceTxt(a))}</li>`).join('')}</ul><p class="more"><a href="/sale/">セール中のゲームをすべて見る</a></p></section>` : ''}`;
  write('/', layout({ title: 'Steamの同時接続数ランキング・セール・日本語対応', desc: 'Steamのゲームの同時接続数（今プレイしている人数）ランキングを3時間ごとに更新。日ごとの推移、セール価格、日本語対応、必要スペックもまとめています。', path: '/', body, img: top[0]?.header }));
}
// ランキング・セール・日本語対応
const listPage = (p, title, desc, h1, list, sub) => write(p, layout({ title, desc, path: p, body: `<section class="intro sm"><div class="mosaic">${list.slice(0, 6).map((a) => `<a href="/game/${a.appid}/"><img src="${esc(a.header)}" alt="${esc(a.name)}"></a>`).join('')}</div><h1>${h1}</h1></section><ol class="rank">${list.map((a) => `<li>${card(a, sub(a))}</li>`).join('')}</ol>`, img: list[0]?.header }));
listPage('/ranking/', 'Steam 同時接続数ランキング', 'Steamの同時接続数（今プレイ中の人数）が多いゲームのランキング。3時間ごとに更新。', 'Steam 同時接続数ランキング', byNow.slice(0, 200), (a) => `<em class="n">${nf(P(a))}</em>人がプレイ中 ${jpBadge(a)}`);
listPage('/japanese/', '日本語対応のSteam人気ゲーム', '日本語に対応しているSteamのゲームを、同時接続数が多い順に並べています。', '日本語対応の人気ゲーム', byNow.filter((a) => jp(a).ui).slice(0, 200), (a) => `<em class="n">${nf(P(a))}</em>人がプレイ中 ${jpBadge(a)}`);
listPage('/sale/', 'Steamセール中の人気ゲーム', 'Steamで今セール中のゲームを、同時接続数が多い順に並べています。割引率と日本円の価格つき。', 'セール中の人気ゲーム', valid.filter((a) => a.price?.off).sort((a, b) => (P(b) || 0) - (P(a) || 0)).slice(0, 200), (a) => `${priceTxt(a)} ${jpBadge(a)}`);

// 固定ページ
write('/about/', layout({ title: '運営者情報', desc: '運営者情報', path: '/about/', body: `<article class="doc"><h1>運営者情報</h1><p>サイト名：${SITE.name}<br>運営：${SITE.operator}</p><h2>このサイトについて</h2><p>Steamの公開データ（同時接続数・ストア情報）を定期的に取得し、日本語で見やすく集計しています。同時接続数は当サイトが取得した時点の値で、記録は集計を始めた日からたまっていきます。</p><p><a href="${SITE.contact}" target="_blank" rel="noopener">お問い合わせフォーム</a></p></article>` }));
write('/privacy/', layout({ title: 'プライバシーポリシー', desc: 'プライバシーポリシー', path: '/privacy/', body: `<article class="doc"><h1>プライバシーポリシー</h1><h2>広告について</h2><p>当サイトは第三者配信の広告サービス「Google アドセンス」を利用しています。広告配信事業者は、利用者の興味に応じた広告を表示するためにCookieを使用することがあります。詳しくは<a href="https://policies.google.com/technologies/ads?hl=ja" target="_blank" rel="noopener">Googleのポリシーと規約</a>をご覧ください。</p><h2>アクセス解析について</h2><p>Googleアナリティクスを利用しています。データは匿名で収集され、個人を特定するものではありません。</p><h2>免責事項</h2><p>掲載情報は取得時点のものです。価格・対応言語などの最新情報はSteamストアでご確認ください。</p><p>制定：${today}　${SITE.operator}</p></article>` }));
// 静的ファイル・サイトマップ
for (const f of fs.readdirSync(path.join(ROOT, 'static'))) fs.cpSync(path.join(ROOT, 'static', f), path.join(DIST, f), { recursive: true });
fs.writeFileSync(path.join(DIST, 'robots.txt'), `User-agent: *\nAllow: /\nSitemap: ${SITE.url}/sitemap.xml\n`);
fs.writeFileSync(path.join(DIST, 'ads.txt'), `google.com, ${SITE.ads.replace('ca-', '')}, DIRECT, f08c47fec0942fa0\n`);
fs.writeFileSync(path.join(DIST, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${sitemap.map((u) => `<url><loc>${u}</loc><lastmod>${today}</lastmod></url>`).join('\n')}\n</urlset>\n`);
fs.writeFileSync(path.join(DIST, '_headers'), `https://:project.pages.dev/*\n  X-Robots-Tag: noindex\n`);
console.log('build', valid.length, 'games', sitemap.length, 'urls');
