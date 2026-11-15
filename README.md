# 同接ナウ（steam.mminnie.com）
Steamの同時接続数・セール価格・日本語対応・必要スペックを日本語で集計する静的サイト。
- データ取得：GitHub Actions（.github/workflows/update.yml、3時間ごと）→ data/
- ビルド：`node scripts/build.mjs` → dist/（Cloudflare Pages）
